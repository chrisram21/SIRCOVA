const aEnumeracion = (valores) => Object.freeze(Object.fromEntries(valores.map((valor) => [valor, valor])));

// Mismos valores que el ENUM de bitacora.modulo.
export const MODULOS = aEnumeracion(['USUARIOS', 'CONFIGURACION', 'PRODUCCION', 'REVISION',
  'RECTIFICACION', 'INDICADORES', 'REPORTES', 'SISTEMA']);

export const ACCIONES = aEnumeracion(['LOGIN_OK', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'LOGOUT',
  'CREAR', 'ACTUALIZAR', 'DESACTIVAR', 'REACTIVAR', 'CAMBIO_ESTADO',
  'PUBLICAR_ESQUEMA', 'EXPORTAR', 'ACCESO_DENEGADO', 'CAMBIO_CONTRASENA']);

// Se comparan sin mayúsculas ni guiones bajos; la lista es exacta para no quitar claves como debeCambiarContrasena.
const CLAVES_SENSIBLES = new Set(
  ['contrasena', 'contrasenaActual', 'contrasenaNueva', 'hashContrasena', 'hash_contrasena', 'token']
    .map(normalizarClave),
);

function normalizarClave(clave) {
  return clave.toLowerCase().replaceAll('_', '');
}

function sinSensibles(valor) {
  if (Array.isArray(valor)) return valor.map(sinSensibles);
  if (valor === null || typeof valor !== 'object' || valor.constructor !== Object) return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => !CLAVES_SENSIBLES.has(normalizarClave(clave)))
      .map(([clave, contenido]) => [clave, sinSensibles(contenido)]),
  );
}

function aJson(valor) {
  return valor == null ? null : JSON.stringify(sinSensibles(valor));
}

function recortar(texto, largo) {
  return texto == null ? null : String(texto).slice(0, largo);
}

// Compara solo el primer nivel; fechas, listas y objetos se comparan por su JSON.
export function diferencias(antes = {}, despues = {}) {
  const anteriores = {};
  const nuevos = {};
  for (const clave of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (JSON.stringify(antes[clave]) === JSON.stringify(despues[clave])) continue;
    // Una clave ausente se guarda como null para que no desaparezca del JSON.
    anteriores[clave] = antes[clave] ?? null;
    nuevos[clave] = despues[clave] ?? null;
  }
  return Object.keys(nuevos).length === 0 ? null : { anteriores, nuevos };
}

export function contextoAuditoria(req) {
  return {
    usuarioId: req.usuario?.id ?? null,
    ipOrigen: req.ip,
    agenteUsuario: req.get('user-agent') ?? null,
  };
}

// Recibe la conexión de la transacción en curso para que la fila se confirme o se revierta junto con el cambio.
export async function registrarBitacora(conexion, datos) {
  if (!Object.hasOwn(MODULOS, datos.modulo ?? '')) throw new Error(`Módulo de bitácora desconocido: ${datos.modulo}`);
  if (!Object.hasOwn(ACCIONES, datos.accion ?? '')) throw new Error(`Acción de bitácora desconocida: ${datos.accion}`);

  await conexion.query(
    `INSERT INTO bitacora
       (usuario_id, nombre_usuario_intento, modulo, accion, entidad, entidad_id,
        valores_anteriores, valores_nuevos, ip_origen, agente_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.usuarioId ?? null,
      // Las columnas tienen largo fijo; un texto más largo haría fallar el INSERT.
      recortar(datos.nombreUsuarioIntento, 50),
      datos.modulo,
      datos.accion,
      datos.entidad,
      datos.entidadId == null ? null : String(datos.entidadId),
      aJson(datos.valoresAnteriores),
      aJson(datos.valoresNuevos),
      recortar(datos.ipOrigen, 45),
      recortar(datos.agenteUsuario, 255),
    ],
  );
}
