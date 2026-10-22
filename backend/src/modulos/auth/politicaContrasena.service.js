import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as idiomaComun from '@zxcvbn-ts/language-common';
import * as idiomaEspanol from '@zxcvbn-ts/language-es-es';

export const LARGO_MINIMO = 12;
export const BYTES_MAXIMOS = 72;
export const PUNTAJE_MINIMO = 3;
const LARGO_MINIMO_PALABRA = 3;

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...idiomaComun.dictionary, ...idiomaEspanol.dictionary },
  graphs: idiomaComun.adjacencyGraphs,
  translations: idiomaEspanol.translations,
});

export const MOTIVOS = {
  corta: `Debe tener al menos ${LARGO_MINIMO} caracteres.`,
  larga: 'Es demasiado larga.',
  nombre: 'No debe contener su nombre ni su usuario.',
  adivinable: 'Es fácil de adivinar; use una frase más larga.',
};

function normalizar(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function palabrasPersonales({ nombreUsuario, nombres, apellidos }) {
  return [nombreUsuario, nombres, apellidos]
    .filter((texto) => typeof texto === 'string')
    .flatMap((texto) => normalizar(texto).split(/[^\p{L}\p{N}]+/u))
    .filter((palabra) => palabra.length >= LARGO_MINIMO_PALABRA);
}

// Devuelve el puntaje de zxcvbn (0 a 4) y los motivos por los que no se acepta; sin motivos, se acepta.
export function evaluarContrasena(contrasena, datosPersonales = {}) {
  const palabras = palabrasPersonales(datosPersonales);
  const motivos = [];

  if ([...contrasena].length < LARGO_MINIMO) motivos.push(MOTIVOS.corta);
  const demasiadoLarga = Buffer.byteLength(contrasena, 'utf8') > BYTES_MAXIMOS;
  if (demasiadoLarga) motivos.push(MOTIVOS.larga);

  const normalizada = normalizar(contrasena);
  if (palabras.some((palabra) => normalizada.includes(palabra))) motivos.push(MOTIVOS.nombre);

  // Se recorta para que un texto enorme no deje a zxcvbn trabajando; de todos modos ya se rechaza por largo.
  const { score, feedback } = zxcvbn.check(demasiadoLarga ? contrasena.slice(0, BYTES_MAXIMOS) : contrasena, palabras);
  if (score < PUNTAJE_MINIMO) motivos.push(feedback.warning ?? MOTIVOS.adivinable);

  return { puntaje: score, motivos };
}
