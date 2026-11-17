import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { ACCIONES, MODULOS, registrarBitacora } from '../auditoria/auditoria.service.js';
import { filtroAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { leerEntero } from '../revision/bandeja.service.js';

const SEVERIDADES = ['CRITICA', 'ADVERTENCIA', 'INFO'];
const ESTADOS = ['ACTIVA', 'ATENDIDA', 'DESCARTADA'];
const TIPOS = ['REPORTE_PENDIENTE', 'CALIDAD', 'COBERTURA_BAJO_META', 'PROCESO'];

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

const COLUMNAS = `a.id, a.tipo, a.severidad, a.titulo, a.mensaje, a.estado, UNIX_TIMESTAMP(a.generada_en) AS generada,
       p.id AS periodo_id, p.anio, p.mes, m.id AS municipio_id, m.nombre AS municipio_nombre,
       e.id AS establecimiento_id, e.codigo, e.nombre, a.reporte_id, ri.indicador_codigo,
       a.atendida_por, CONCAT(ea.nombres, ' ', ea.apellidos) AS atendida_por_nombre,
       UNIX_TIMESTAMP(a.atendida_en) AS atendida`;

const UNIONES = `JOIN rol r ON r.id = a.rol_destino_id
  LEFT JOIN periodo p ON p.id = a.periodo_id
  LEFT JOIN municipio m ON m.id = a.municipio_id
  LEFT JOIN establecimiento e ON e.id = a.establecimiento_id
  LEFT JOIN resultado_indicador ri ON ri.id = a.resultado_indicador_id
  LEFT JOIN usuario ua ON ua.id = a.atendida_por
  LEFT JOIN empleado ea ON ea.id = ua.empleado_id`;

// Las alertas que el usuario puede ver: dirigidas a su rol y dentro de su ámbito (DDRISS, establecimiento o el país).
function filtroDelUsuario(usuario) {
  const alcance = filtroAlcance(usuario, { ddriss: 'a.ddriss_id', establecimiento: 'a.establecimiento_id' });
  return { condicion: `r.codigo = ? AND ${alcance.condicion}`, valores: [usuario.rol, ...alcance.parametros] };
}

function aAlerta(f) {
  return {
    id: f.id,
    tipo: f.tipo,
    severidad: f.severidad,
    titulo: f.titulo,
    mensaje: f.mensaje,
    estado: f.estado,
    generadaEn: aFechaIso(f.generada),
    periodo: f.periodo_id == null ? null : { id: f.periodo_id, anio: f.anio, mes: f.mes },
    municipio: f.municipio_id == null ? null : { id: f.municipio_id, nombre: f.municipio_nombre },
    establecimiento:
      f.establecimiento_id == null ? null : { id: f.establecimiento_id, codigo: f.codigo, nombre: f.nombre },
    reporteId: f.reporte_id,
    indicadorCodigo: f.indicador_codigo ?? null,
    atendidaPor: f.atendida_por == null ? null : { usuarioId: f.atendida_por, nombre: f.atendida_por_nombre },
    atendidaEn: aFechaIso(f.atendida),
  };
}

function deLaLista(query, nombre, valores, mensaje) {
  if (query[nombre] === undefined) return undefined;
  if (!valores.includes(query[nombre])) throw entradaInvalida(mensaje);
  return query[nombre];
}

function leerFiltros(query) {
  revisarParametros(query, ['estado', 'tipo', 'severidad', 'pagina', 'porPagina']);
  return {
    estado:
      deLaLista(query, 'estado', [...ESTADOS, 'TODAS'], 'El estado debe ser ACTIVA, ATENDIDA, DESCARTADA o TODAS.') ??
      'ACTIVA',
    tipo: deLaLista(query, 'tipo', TIPOS, `El tipo debe ser ${TIPOS.join(', ')}.`),
    severidad: deLaLista(query, 'severidad', SEVERIDADES, 'La severidad debe ser CRITICA, ADVERTENCIA o INFO.'),
    pagina: query.pagina === undefined ? 1 : leerEntero(query.pagina, 'pagina'),
    porPagina: query.porPagina === undefined ? 20 : leerEntero(query.porPagina, 'porPagina', { maximo: 100 }),
  };
}

export async function listarAlertas(usuario, query) {
  const filtros = leerFiltros(query);
  const delUsuario = filtroDelUsuario(usuario);
  const condiciones = [delUsuario.condicion];
  const valores = [...delUsuario.valores];
  if (filtros.estado !== 'TODAS') {
    condiciones.push('a.estado = ?');
    valores.push(filtros.estado);
  }
  if (filtros.tipo) {
    condiciones.push('a.tipo = ?');
    valores.push(filtros.tipo);
  }
  if (filtros.severidad) {
    condiciones.push('a.severidad = ?');
    valores.push(filtros.severidad);
  }
  const filtro = condiciones.join(' AND ');

  const [[filas], [[{ total }]], [conteos]] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNAS} FROM alerta a ${UNIONES}
        WHERE ${filtro}
        ORDER BY FIELD(a.severidad, 'CRITICA', 'ADVERTENCIA', 'INFO'), a.generada_en DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...valores, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
    ),
    pool.query(`SELECT COUNT(*) AS total FROM alerta a JOIN rol r ON r.id = a.rol_destino_id WHERE ${filtro}`, valores),
    pool.query(
      `SELECT a.severidad, COUNT(*) AS n FROM alerta a JOIN rol r ON r.id = a.rol_destino_id
        WHERE a.estado = 'ACTIVA' AND ${delUsuario.condicion} GROUP BY a.severidad`,
      delUsuario.valores,
    ),
  ]);

  const porSeveridad = Object.fromEntries(SEVERIDADES.map((s) => [s, 0]));
  for (const { severidad, n } of conteos) porSeveridad[severidad] = Number(n);

  return {
    elementos: filas.map(aAlerta),
    total: Number(total),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    activas: { total: SEVERIDADES.reduce((suma, s) => suma + porSeveridad[s], 0), porSeveridad },
  };
}

async function leerAlerta(conexion, id, usuario) {
  const delUsuario = filtroDelUsuario(usuario);
  const [[fila]] = await conexion.query(
    `SELECT ${COLUMNAS} FROM alerta a ${UNIONES} WHERE a.id = ? AND ${delUsuario.condicion}`,
    [id, ...delUsuario.valores],
  );
  return fila;
}

// Una alerta de otro rol o de otro ámbito responde el mismo 404 que una inexistente.
export async function atenderAlerta(usuario, idRuta, cuerpo, contexto) {
  if (cuerpo !== undefined) revisarCampos(cuerpo, []);
  const id = /^\d+$/.test(idRuta) ? Number(idRuta) : 0;

  return enTransaccion(async (conexion) => {
    if (!(await leerAlerta(conexion, id, usuario))) {
      throw new ErrorApi(404, 'NO_ENCONTRADO', 'La alerta no existe.');
    }
    // Condicionado al estado: otra pestaña o la tarea horaria pueden haberla cambiado desde que se leyó.
    const [cambio] = await conexion.query(
      `UPDATE alerta SET estado = 'ATENDIDA', atendida_por = ?, atendida_en = NOW()
        WHERE id = ? AND estado = 'ACTIVA'`,
      [usuario.id, id],
    );
    if (cambio.affectedRows === 0) throw new ErrorApi(409, 'ALERTA_NO_ACTIVA', 'La alerta ya no está activa.');

    const alerta = aAlerta(await leerAlerta(conexion, id, usuario));
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.REVISION,
      accion: ACCIONES.ACTUALIZAR,
      entidad: 'alerta',
      entidadId: id,
      valoresAnteriores: { estado: 'ACTIVA' },
      valoresNuevos: { estado: 'ATENDIDA', atendidaPor: usuario.id, atendidaEn: alerta.atendidaEn },
    });
    return alerta;
  });
}
