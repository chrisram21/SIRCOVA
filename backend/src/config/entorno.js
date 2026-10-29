import path from 'node:path';

const obligatorias = [
  'PORT',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_SSL_CA',
  'MONGO_URI',
  'MONGO_DB',
  'CORS_ORIGEN',
  'JWT_SECRET',
  'JWT_EXPIRACION',
  'SESION_DURACION_MAXIMA',
  'SESION_INACTIVIDAD',
  'CUI_HMAC_CLAVE',
];

const LARGO_MINIMO_CLAVE_CUI = 32;
const SEGUNDOS_POR_UNIDAD = { s: 1, m: 60, h: 3600 };

const faltantes = obligatorias.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}`);
}
if (process.env.CUI_HMAC_CLAVE.length < LARGO_MINIMO_CLAVE_CUI) {
  throw new Error(`CUI_HMAC_CLAVE debe tener al menos ${LARGO_MINIMO_CLAVE_CUI} caracteres.`);
}

function aSegundos(nombre) {
  const coincidencia = /^([1-9]\d*)([smh])$/.exec(process.env[nombre]);
  if (!coincidencia) {
    throw new Error(`${nombre} debe ser un número seguido de s, m o h (por ejemplo, 30m).`);
  }
  return Number(coincidencia[1]) * SEGUNDOS_POR_UNIDAD[coincidencia[2]];
}

const raizBackend = path.resolve(import.meta.dirname, '..', '..');

export default {
  puerto: Number(process.env.PORT),
  mysql: {
    host: process.env.MYSQL_HOST,
    puerto: Number(process.env.MYSQL_PORT),
    usuario: process.env.MYSQL_USER,
    contrasena: process.env.MYSQL_PASSWORD,
    baseDatos: process.env.MYSQL_DATABASE,
    // Relativa a backend/, para que no dependa de la carpeta desde donde se arranca.
    rutaCertificado: path.resolve(raizBackend, process.env.MYSQL_SSL_CA),
  },
  mongo: {
    uri: process.env.MONGO_URI,
    baseDatos: process.env.MONGO_DB,
  },
  jwt: {
    secreto: process.env.JWT_SECRET,
    expiracion: process.env.JWT_EXPIRACION,
  },
  sesion: {
    duracionMaxima: aSegundos('SESION_DURACION_MAXIMA'),
    inactividad: aSegundos('SESION_INACTIVIDAD'),
  },
  // Todo el equipo usa la misma: con otra, las huellas de los CUI guardados ya no coinciden.
  cuiHmacClave: process.env.CUI_HMAC_CLAVE,
  corsOrigen: process.env.CORS_ORIGEN,
  rutaOpenapi: path.join(raizBackend, 'openapi.yaml'),
};
