import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { filtroAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { MENSAJES, validarCantidadPoblacion, validarFuentePoblacion } from '../../validaciones/campos.js';
import { entradaInvalida, revisarCampos, revisarParametros } from './catalogos.service.js';

const errores = {
  anioSinPeriodos: (anio) =>
    new ErrorApi(422, 'ANIO_SIN_PERIODOS', `El año ${anio} no está en el calendario de periodos.`),
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  enConflicto: () =>
    new ErrorApi(
      409,
      'POBLACION_EN_CONFLICTO',
      'Otra persona guardó esta población al mismo tiempo. Vuelva a intentarlo.',
    ),
};

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

function leerAnio(texto) {
  if (typeof texto !== 'string' || !/^\d+$/.test(texto)) throw entradaInvalida('anio debe ser un número entero.');
  return Number(texto);
}

async function verificarAnioEnCalendario(ejecutor, anio) {
  const [[mes]] = await ejecutor.query('SELECT 1 AS hay FROM periodo WHERE anio = ? LIMIT 1', [anio]);
  if (!mes) throw errores.anioSinPeriodos(anio);
}

async function listarGrupos(ejecutor) {
  const [filas] = await ejecutor.query('SELECT id, codigo, descripcion FROM clasificacion_poblacion ORDER BY id');
  return filas;
}

// Los municipios activos del departamento sede de la DDRISS, sin el 9999: los mismos que atribuye el Excel 3.
async function buscarMunicipios(ejecutor, usuario, { id } = {}) {
  const deLaDdriss = filtroAlcance(usuario, { ddriss: 'd.id' });
  const condiciones = [
    'm.activo = TRUE',
    "m.codigo_ine <> '9999'",
    `EXISTS (SELECT 1 FROM ddriss d WHERE d.departamento_id = m.departamento_id AND ${deLaDdriss.condicion})`,
  ];
  const parametros = [...deLaDdriss.parametros];
  if (id !== undefined) {
    condiciones.push('m.id = ?');
    parametros.push(id);
  }
  const [filas] = await ejecutor.query(
    `SELECT m.id, m.codigo_ine, m.nombre FROM municipio m WHERE ${condiciones.join(' AND ')} ORDER BY m.nombre`,
    parametros,
  );
  return filas;
}

async function conPoblacion(ejecutor, municipios, anio) {
  const porMunicipio = new Map(
    municipios.map((m) => [m.id, { id: m.id, codigoIne: m.codigo_ine, nombre: m.nombre, poblacion: {} }]),
  );
  if (porMunicipio.size === 0) return [];
  const [filas] = await ejecutor.query(
    `SELECT po.municipio_id, cp.codigo, po.cantidad, po.fuente, UNIX_TIMESTAMP(po.actualizado_en) AS actualizado_en
       FROM poblacion_objetivo po
       JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
      WHERE po.anio = ? AND po.municipio_id IN (?)`,
    [anio, [...porMunicipio.keys()]],
  );
  for (const fila of filas) {
    porMunicipio.get(fila.municipio_id).poblacion[fila.codigo] = {
      cantidad: fila.cantidad,
      fuente: fila.fuente,
      actualizadoEn: aFechaIso(fila.actualizado_en),
    };
  }
  return [...porMunicipio.values()];
}

export async function consultarPoblacion(usuario, query) {
  revisarParametros(query, ['anio']);
  const anio = leerAnio(query.anio);
  await verificarAnioEnCalendario(pool, anio);
  const grupos = (await listarGrupos(pool)).map(({ codigo, descripcion }) => ({ codigo, descripcion }));
  const municipios = await conPoblacion(pool, await buscarMunicipios(pool, usuario), anio);
  return { anio, grupos, municipios };
}

// Un texto en el JSON se rechaza aunque sean dígitos: la regla los acepta solo por el Input del frontend.
function leerCuerpo(cuerpo) {
  revisarCampos(cuerpo, ['fuente', 'grupos']);
  const { grupos } = cuerpo;
  if (grupos === null || typeof grupos !== 'object' || Array.isArray(grupos) || Object.keys(grupos).length === 0) {
    throw entradaInvalida('Debe registrar al menos un grupo.');
  }
  const cantidades = Object.entries(grupos).map(([codigo, valor]) => {
    if (typeof valor !== 'number' || validarCantidadPoblacion(valor).error) {
      throw entradaInvalida(MENSAJES.cantidadPoblacion);
    }
    return { codigo, cantidad: valor };
  });
  if (!Object.hasOwn(cuerpo, 'fuente')) return { cantidades, fuente: undefined };
  const fuente = validarFuentePoblacion(cuerpo.fuente);
  if (fuente.error) throw entradaInvalida(fuente.error);
  return { cantidades, fuente: fuente.valor };
}

// Crea o corrige grupo por grupo; los grupos que no vienen no cambian y nunca se borra una fila.
export async function guardarPoblacion(municipioIdTexto, anioTexto, cuerpo, usuario, contexto) {
  if (!/^\d+$/.test(municipioIdTexto)) throw entradaInvalida('municipioId debe ser un número entero.');
  const anio = leerAnio(anioTexto);
  const { cantidades, fuente } = leerCuerpo(cuerpo);

  const [municipio] = await buscarMunicipios(pool, usuario, { id: Number(municipioIdTexto) });
  if (!municipio) throw errores.noEncontrado();
  await verificarAnioEnCalendario(pool, anio);
  const grupoPorCodigo = new Map((await listarGrupos(pool)).map((g) => [g.codigo, g]));
  const desconocido = cantidades.find(({ codigo }) => !grupoPorCodigo.has(codigo));
  if (desconocido) throw entradaInvalida(`El grupo ${desconocido.codigo} no existe.`);

  try {
    return await enTransaccion(async (conexion) => {
      // Primera consulta de la transacción: un guardado simultáneo espera y después ve las filas nuevas.
      const [existentes] = await conexion.query(
        `SELECT po.id, cp.codigo, po.cantidad, po.fuente
           FROM poblacion_objetivo po
           JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
          WHERE po.municipio_id = ? AND po.anio = ?
          FOR UPDATE`,
        [municipio.id, anio],
      );
      const existentePorCodigo = new Map(existentes.map((fila) => [fila.codigo, fila]));

      for (const { codigo, cantidad } of cantidades) {
        const existente = existentePorCodigo.get(codigo);
        if (!existente) {
          const fila = { municipioId: municipio.id, anio, grupo: codigo, cantidad, fuente: fuente ?? null };
          const [resultado] = await conexion.query(
            `INSERT INTO poblacion_objetivo
               (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [municipio.id, anio, grupoPorCodigo.get(codigo).id, cantidad, fila.fuente, usuario.id],
          );
          await registrarBitacora(conexion, {
            ...contexto,
            modulo: MODULOS.CONFIGURACION,
            accion: ACCIONES.CREAR,
            entidad: 'poblacion_objetivo',
            entidadId: resultado.insertId,
            valoresNuevos: { id: resultado.insertId, ...fila },
          });
          continue;
        }

        const antes = { cantidad: existente.cantidad, fuente: existente.fuente };
        const despues = { cantidad, fuente: fuente === undefined ? existente.fuente : fuente };
        const cambios = diferencias(antes, despues);
        if (!cambios) continue;
        await conexion.query(
          'UPDATE poblacion_objetivo SET cantidad = ?, fuente = ?, registrado_por = ? WHERE id = ?',
          [despues.cantidad, despues.fuente, usuario.id, existente.id],
        );
        await registrarBitacora(conexion, {
          ...contexto,
          modulo: MODULOS.CONFIGURACION,
          accion: ACCIONES.ACTUALIZAR,
          entidad: 'poblacion_objetivo',
          entidadId: existente.id,
          valoresAnteriores: cambios.anteriores,
          valoresNuevos: cambios.nuevos,
        });
      }

      const [guardado] = await conPoblacion(conexion, [municipio], anio);
      return guardado;
    });
  } catch (err) {
    // El FOR UPDATE sobre grupos que todavía no existen bloquea el hueco del índice en los dos guardados, así que el
    // choque puede llegar como deadlock en lugar de llave duplicada.
    if (err.code === 'ER_DUP_ENTRY' || err.code === 'ER_LOCK_DEADLOCK') throw errores.enConflicto();
    throw err;
  }
}
