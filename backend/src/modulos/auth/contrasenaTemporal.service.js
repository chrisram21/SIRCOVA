import { randomInt } from 'node:crypto';
import { evaluarContrasena } from './politicaContrasena.service.js';

// Sin 0 O o 1 l I, que se confunden al dictarla o copiarla a mano.
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const LARGO = 12;
// Con 12 caracteres al azar casi nunca se falla la política; el tope evita un ciclo infinito ante un error.
const INTENTOS_MAXIMOS = 20;

function candidata() {
  return Array.from({ length: LARGO }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}

// Recibe { nombreUsuario, nombres, apellidos } para que la contraseña tampoco los contenga.
export function generarContrasenaTemporal(datosPersonales = {}) {
  for (let intento = 0; intento < INTENTOS_MAXIMOS; intento++) {
    const contrasena = candidata();
    if (evaluarContrasena(contrasena, datosPersonales).motivos.length === 0) return contrasena;
  }
  throw new Error('No se pudo generar una contraseña temporal que cumpla la política.');
}
