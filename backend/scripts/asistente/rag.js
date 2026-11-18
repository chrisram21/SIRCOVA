import fs from 'node:fs';
import { embeber } from './ollama.js';
import { RUTA_INDICE } from './indexar.js';

let indice = null;

function cargarIndice() {
  if (!indice) {
    if (!fs.existsSync(RUTA_INDICE)) {
      throw new Error('No existe el índice. Corre primero: node scripts/asistente/indexar.js');
    }
    indice = JSON.parse(fs.readFileSync(RUTA_INDICE, 'utf8'));
  }
  return indice;
}

function similitudCoseno(a, b) {
  let producto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < a.length; i++) {
    producto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  return producto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

export async function buscar(pregunta, cantidad = 4) {
  const { fragmentos } = cargarIndice();
  const [vectorPregunta] = await embeber([pregunta]);
  return fragmentos
    .map(({ vector, ...fragmento }) => ({ ...fragmento, puntaje: similitudCoseno(vectorPregunta, vector) }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, cantidad);
}
