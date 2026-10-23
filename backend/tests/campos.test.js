import { describe, it, expect } from 'vitest';
import {
  MENSAJES,
  validarNombres,
  validarApellidos,
  validarCargo,
  validarTelefono,
  validarCorreo,
  validarCui,
  validarNombreUsuario,
  validarNombreDistrito,
} from '../src/validaciones/campos.js';

// La misma lista está en frontend/src/validaciones/campos.test.js: si cambia una, se cambia la otra.
// Los CUI son ficticios, armados para cumplir (o no) el dígito verificador.
const CASOS = {
  validarNombres: {
    validos: [
      ['María de los Ángeles', 'María de los Ángeles'],
      ['Chávez de León', 'Chávez de León'],
      ["B'alam", "B'alam"],
      ['B’alam', 'B’alam'],
      ['Pérez-Gómez', 'Pérez-Gómez'],
      ['Güicho', 'Güicho'],
      ['  María   José  ', 'María José'],
    ],
    invalidos: [
      ['', MENSAJES.nombresObligatorio],
      ['   ', MENSAJES.nombresObligatorio],
      [null, MENSAJES.nombresObligatorio],
      ['123', MENSAJES.nombres],
      ['.-.{p´p.', MENSAJES.nombres],
      ['Juan2', MENSAJES.nombres],
      ["' Ana", MENSAJES.nombres],
      ['Ana--María', MENSAJES.nombres],
      ['a'.repeat(101), 'Los nombres: como máximo 100 caracteres.'],
    ],
  },
  validarApellidos: {
    validos: [['Chávez de León', 'Chávez de León']],
    invalidos: [
      ['', MENSAJES.apellidosObligatorio],
      ['López 3', MENSAJES.apellidos],
    ],
  },
  validarCargo: {
    validos: [
      ['Enf. auxiliar (TSR)', 'Enf. auxiliar (TSR)'],
      ['Estadígrafa', 'Estadígrafa'],
      ['Técnico en Salud Rural / Vacunador', 'Técnico en Salud Rural / Vacunador'],
      ['', null],
      [null, null],
    ],
    invalidos: [
      ['123', MENSAJES.cargo],
      ['---', MENSAJES.cargo],
      ['A', MENSAJES.cargo],
      ['Auxiliar 1', MENSAJES.cargo],
      ['a'.repeat(101), 'El cargo: como máximo 100 caracteres.'],
    ],
  },
  validarTelefono: {
    validos: [
      ['5551-1001', '5551-1001'],
      ['+502 5551 1001', '5551-1001'],
      ['+502-5551-1001', '5551-1001'],
      ['55511001', '5551-1001'],
      ['2222 3333', '2222-3333'],
      ['', null],
      [null, null],
    ],
    invalidos: [
      ['1234', MENSAJES.telefono],
      ['9551-1001', MENSAJES.telefono],
      ['1551-1001', MENSAJES.telefono],
      ['5551-10012', MENSAJES.telefono],
      ['(502) 5551 1001', MENSAJES.telefono],
      ['5551-100a', MENSAJES.telefono],
    ],
  },
  validarCorreo: {
    validos: [
      ['ana.lopez@gmail.com', 'ana.lopez@gmail.com'],
      ['Ana@Gmail.com', 'ana@gmail.com'],
      ['  ana@mspas.gob.gt ', 'ana@mspas.gob.gt'],
    ],
    invalidos: [
      ['', MENSAJES.correoObligatorio],
      [null, MENSAJES.correoObligatorio],
      ['ana@', MENSAJES.correo],
      ['ana lopez@gmail.com', MENSAJES.correo],
      ['ana@gmail.c', MENSAJES.correo],
      ['ana@gmail', MENSAJES.correo],
      [`${'a'.repeat(141)}@gmail.com`, 'El correo: como máximo 150 caracteres.'],
    ],
  },
  validarCui: {
    validos: [
      // 1·2 + 2·3 + 3·4 + 4·5 + 5·6 + 6·7 + 7·8 + 8·9 = 240; 240 entre 11 deja residuo 9.
      ['1234567890101', '1234567890101'],
      ['1234 56789 0101', '1234567890101'],
      ['1234-56789-0101', '1234567890101'],
      ['2345 67899 1201', '2345678991201'],
      ['1234567892201', '1234567892201'],
    ],
    invalidos: [
      ['', MENSAJES.cuiObligatorio],
      [null, MENSAJES.cuiObligatorio],
      ['123456789010', MENSAJES.cuiLargo],
      ['12345678901011', MENSAJES.cuiLargo],
      ['1234567890a01', MENSAJES.cuiLargo],
      ['1234567880101', MENSAJES.cuiVerificador],
      // 5·2 = 10: con residuo 10 ningún verificador sirve.
      ['5000000000101', MENSAJES.cuiVerificador],
      ['1234567890001', MENSAJES.cuiDepartamento],
      ['1234567892301', MENSAJES.cuiDepartamento],
    ],
  },
  validarNombreUsuario: {
    validos: [
      ['ana.lopez', 'ana.lopez'],
      ['cs-1201', 'cs-1201'],
      ['ana_lopez', 'ana_lopez'],
      [' jperez ', 'jperez'],
    ],
    invalidos: [
      ['Ana López', MENSAJES.nombreUsuario],
      ['ab', MENSAJES.nombreUsuario],
      ['abc', MENSAJES.nombreUsuario],
      ['AnaLopez', MENSAJES.nombreUsuario],
      ['a'.repeat(51), MENSAJES.nombreUsuario],
      ['', MENSAJES.nombreUsuario],
    ],
  },
  validarNombreDistrito: {
    validos: [
      ['Distrito de Salud Tacaná Norte', 'Distrito de Salud Tacaná Norte'],
      ['  Distrito   de Salud  Ixchiguán ', 'Distrito de Salud Ixchiguán'],
      ['Distrito (Área 2) - Sur.', 'Distrito (Área 2) - Sur.'],
      ['Güinil Ñuñoa', 'Güinil Ñuñoa'],
      ['Sur', 'Sur'],
      ['a'.repeat(120), 'a'.repeat(120)],
    ],
    invalidos: [
      ['', MENSAJES.nombreDistritoObligatorio],
      ['   ', MENSAJES.nombreDistritoObligatorio],
      [null, MENSAJES.nombreDistritoObligatorio],
      ['DS', MENSAJES.nombreDistritoLargo],
      ['  Sa  ', MENSAJES.nombreDistritoLargo],
      ['a'.repeat(121), MENSAJES.nombreDistritoLargo],
      ['Distrito @ Norte', MENSAJES.nombreDistrito],
      ['Distrito_Norte', MENSAJES.nombreDistrito],
      ['Distrito/Norte', MENSAJES.nombreDistrito],
    ],
  },
};

const REGLAS = {
  validarNombres, validarApellidos, validarCargo, validarTelefono, validarCorreo, validarCui, validarNombreUsuario,
  validarNombreDistrito,
};

describe.each(Object.entries(CASOS))('%s', (nombre, { validos, invalidos }) => {
  const regla = REGLAS[nombre];

  it.each(validos)('acepta %j y devuelve %j', (entrada, esperado) => {
    expect(regla(entrada)).toEqual({ valor: esperado });
  });

  it.each(invalidos)('rechaza %j', (entrada, mensaje) => {
    expect(regla(entrada)).toEqual({ error: mensaje });
  });
});

describe('valores que no son texto', () => {
  it('rechaza números y objetos con el mensaje del formato', () => {
    expect(validarNombres(123)).toEqual({ error: MENSAJES.nombres });
    expect(validarCui(1234567890101)).toEqual({ error: MENSAJES.cuiLargo });
    expect(validarTelefono(55511001)).toEqual({ error: MENSAJES.telefono });
    expect(validarCorreo({})).toEqual({ error: MENSAJES.correo });
    expect(validarCargo(['Enfermera'])).toEqual({ error: MENSAJES.cargo });
    expect(validarNombreUsuario(42)).toEqual({ error: MENSAJES.nombreUsuario });
    expect(validarNombreDistrito(123)).toEqual({ error: MENSAJES.nombreDistrito });
  });
});
