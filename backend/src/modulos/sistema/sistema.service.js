import pool from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';

const TIEMPO_LIMITE_MS = 5000;

function conTiempoLimite(promesa) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('Tiempo de espera agotado')), TIEMPO_LIMITE_MS);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

async function comprobar(nombre, prueba) {
  try {
    await conTiempoLimite(prueba());
    return 'ok';
  } catch (err) {
    console.error(`[salud] ${nombre} no responde: ${err.message}`);
    return 'error';
  }
}

export async function obtenerSalud() {
  const [mysql, mongo] = await Promise.all([
    comprobar('MySQL', () => pool.query('SELECT 1')),
    comprobar('MongoDB', async () => (await obtenerDb()).command({ ping: 1 })),
  ]);
  return { mysql, mongo };
}
