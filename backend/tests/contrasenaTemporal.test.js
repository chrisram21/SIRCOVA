import { describe, it, expect } from 'vitest';
import { ALFABETO, LARGO, generarContrasenaTemporal } from '../src/modulos/auth/contrasenaTemporal.service.js';
import { evaluarContrasena, LARGO_MINIMO } from '../src/modulos/auth/politicaContrasena.service.js';

const datos = { nombreUsuario: 'jperez', nombres: 'Juan Carlos', apellidos: 'Pérez López' };

describe('generarContrasenaTemporal', () => {
  const generadas = Array.from({ length: 100 }, () => generarContrasenaTemporal(datos));

  it('el alfabeto tiene 56 caracteres y ninguno de los que se confunden', () => {
    expect(ALFABETO).toHaveLength(56);
    expect(new Set(ALFABETO).size).toBe(56);
    for (const caracter of '0Oo1lI') expect(ALFABETO).not.toContain(caracter);
  });

  it('el largo no baja del mínimo de la política de contraseñas', () => {
    expect(LARGO).toBeGreaterThanOrEqual(LARGO_MINIMO);
  });

  it(`genera ${LARGO} caracteres, solo del alfabeto`, () => {
    for (const contrasena of generadas) {
      expect(contrasena).toHaveLength(LARGO);
      expect([...contrasena].every((caracter) => ALFABETO.includes(caracter))).toBe(true);
    }
  });

  it('cumple la política de contraseñas con los datos personales que recibió', () => {
    for (const contrasena of generadas) {
      expect(evaluarContrasena(contrasena, datos).motivos).toEqual([]);
    }
  });

  it('100 llamadas dan 100 valores distintos', () => {
    expect(new Set(generadas).size).toBe(100);
  });
});
