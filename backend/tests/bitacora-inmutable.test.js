import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../src/config/mysql.js';

const MENSAJE = 'La bitácora no se puede modificar ni borrar.';
const TRIGGERS = ['trg_bitacora_sin_delete', 'trg_bitacora_sin_update'];

async function triggersInstalados() {
  const [filas] = await pool.query(
    `SELECT TRIGGER_NAME AS nombre FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'bitacora'`,
  );
  return filas.map((fila) => fila.nombre).sort();
}

// Siempre se revierte: si un trigger faltara, la fila real no quedaría modificada.
async function intentarYRevertir(sentencia) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [[fila]] = await conexion.query('SELECT MAX(id) AS id FROM bitacora');
    await conexion.query(sentencia, [fila.id]);
  } finally {
    await conexion.rollback();
    conexion.release();
  }
}

function archivosJs(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return entrada.name.endsWith('.js') ? [ruta] : [];
  });
}

describe('bitácora inmutable (script 06)', () => {
  it('la base tiene los dos triggers y bloquean UPDATE y DELETE', async () => {
    // Sin los triggers no se intenta nada contra filas reales.
    expect(await triggersInstalados()).toEqual(TRIGGERS);

    await expect(intentarYRevertir("UPDATE bitacora SET accion = 'ALTERADA' WHERE id = ?"))
      .rejects.toMatchObject({ sqlState: '45000', message: MENSAJE });
    await expect(intentarYRevertir('DELETE FROM bitacora WHERE id = ?'))
      .rejects.toMatchObject({ sqlState: '45000', message: MENSAJE });
  });

  it('ningún archivo de src/ ni de scripts/ modifica o borra la bitácora', () => {
    const raiz = path.join(import.meta.dirname, '..');
    const prohibido = /UPDATE\s+`?bitacora`?\b|DELETE\s+FROM\s+`?bitacora`?\b/i;

    const infractores = ['src', 'scripts']
      .flatMap((carpeta) => archivosJs(path.join(raiz, carpeta)))
      .filter((archivo) => prohibido.test(fs.readFileSync(archivo, 'utf8')))
      .map((archivo) => path.relative(raiz, archivo));

    expect(infractores).toEqual([]);
  });
});
