// Herramientas que el agente puede llamar. Solo leen: la conexión se abre en una transacción READ ONLY,
// así que MySQL rechaza cualquier escritura.
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const DDRISS = process.env.ASISTENTE_DDRISS ?? 'DDRISS_SM';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
  'noviembre', 'diciembre'];

async function enSoloLectura(fn) {
  const conexion = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { ca: fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', process.env.MYSQL_SSL_CA ?? '')) },
    connectTimeout: 5000,
  });
  try {
    await conexion.query('START TRANSACTION READ ONLY');
    return await fn(conexion);
  } finally {
    await conexion.query('ROLLBACK').catch(() => {});
    await conexion.end();
  }
}

// El modelo a veces manda el mes como texto ("septiembre", "9"): se normaliza a número.
function aMes(valor) {
  const indice = MESES.indexOf(String(valor).trim().toLowerCase());
  return indice >= 0 ? indice + 1 : Number(valor);
}

async function consultarReportesPorEstado({ anio, mes }) {
  const anioNumero = Number(anio);
  const mesNumero = aMes(mes);
  if (!Number.isInteger(anioNumero) || !Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
    return { error: 'Indica un año y un mes válidos (1 a 12).' };
  }
  const filas = await enSoloLectura(async (conexion) => {
    const [resultado] = await conexion.execute(
      `SELECT er.nombre AS estado, COUNT(rp.id) AS cantidad
         FROM reporte_produccion rp
         JOIN periodo p          ON p.id = rp.periodo_id
         JOIN establecimiento e  ON e.id = rp.establecimiento_id
         JOIN ddriss d           ON d.id = e.ddriss_id
         JOIN estado_reporte er  ON er.codigo = rp.estado
        WHERE p.anio = ? AND p.mes = ? AND d.codigo = ?
        GROUP BY er.codigo, er.nombre, er.orden
        ORDER BY er.orden`,
      [anioNumero, mesNumero, DDRISS],
    );
    return resultado;
  });
  return {
    ddriss: DDRISS,
    periodo: `${MESES[mesNumero - 1]} de ${anioNumero}`,
    totalReportes: filas.reduce((suma, fila) => suma + Number(fila.cantidad), 0),
    porEstado: filas.map((fila) => ({ estado: fila.estado, cantidad: Number(fila.cantidad) })),
  };
}

export const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'consultar_reportes_por_estado',
      description: 'Cuenta los reportes mensuales de producción de vacunación de la DDRISS en un mes, '
        + 'agrupados por estado (Borrador, Enviado, En revisión, Aprobado, Cerrado…). '
        + 'Úsala cuando pregunten cuántos reportes hay, están pendientes, aprobados o en algún estado en un mes.',
      parameters: {
        type: 'object',
        properties: {
          anio: { type: 'integer', description: 'Año del periodo, por ejemplo 2026' },
          mes: { type: 'integer', description: 'Mes del periodo, de 1 (enero) a 12 (diciembre)' },
        },
        required: ['anio', 'mes'],
      },
    },
  },
];

const IMPLEMENTACIONES = {
  consultar_reportes_por_estado: consultarReportesPorEstado,
};

export async function ejecutarHerramienta(nombre, argumentos) {
  const implementacion = IMPLEMENTACIONES[nombre];
  if (!implementacion) return { error: `No existe la herramienta ${nombre}.` };
  try {
    return await implementacion(argumentos ?? {});
  } catch (err) {
    return { error: `No se pudo consultar la base: ${err.message}` };
  }
}
