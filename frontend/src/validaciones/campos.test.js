import { describe, it, expect } from 'vitest'
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
  validarNombreEstablecimiento,
  validarDireccion,
  validarNombreContacto,
  validarCodigoVacuna,
  validarNombreVacuna,
  validarDescripcionVacuna,
  validarNombreDosis,
  validarCantidadPoblacion,
  validarFuentePoblacion,
  validarCodigoDimension,
  validarCodigoValorDimension,
  validarNombreDimension,
  validarDescripcionDimension,
  validarEtiquetaValorDimension,
  validarEdadMeses,
} from './campos.js'

// La misma lista está en backend/tests/campos.test.js: si cambia una, se cambia la otra.
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
  validarNombreEstablecimiento: {
    validos: [
      ['Puesto de Salud Aldea Tochab, Tajumulco', 'Puesto de Salud Aldea Tochab, Tajumulco'],
      ['  Centro de Salud   San Marcos ', 'Centro de Salud San Marcos'],
      ['Hospital de Coatepeque (externo)', 'Hospital de Coatepeque (externo)'],
      ['CAP Tajumulco / Sede 2', 'CAP Tajumulco / Sede 2'],
      ["Puesto de Salud B'alam", "Puesto de Salud B'alam"],
      ['Güinil Ñuñoa', 'Güinil Ñuñoa'],
      ['PS1', 'PS1'],
      ['a'.repeat(150), 'a'.repeat(150)],
    ],
    invalidos: [
      ['', MENSAJES.nombreEstablecimientoObligatorio],
      ['   ', MENSAJES.nombreEstablecimientoObligatorio],
      [null, MENSAJES.nombreEstablecimientoObligatorio],
      ['PS', MENSAJES.nombreEstablecimientoLargo],
      ['a'.repeat(151), MENSAJES.nombreEstablecimientoLargo],
      ['Centro @ Salud', MENSAJES.nombreEstablecimiento],
      ['Centro_Salud', MENSAJES.nombreEstablecimiento],
      ['Centro <b>', MENSAJES.nombreEstablecimiento],
    ],
  },
  validarDireccion: {
    validos: [
      ['Aldea Las Lagunas, San Marcos', 'Aldea Las Lagunas, San Marcos'],
      ['  4a. calle   3-25, zona 1 ', '4a. calle 3-25, zona 1'],
      ["Lote #12 (frente al parque) / Cantón B'alam", "Lote #12 (frente al parque) / Cantón B'alam"],
      ['a'.repeat(255), 'a'.repeat(255)],
      ['', null],
      ['   ', null],
      [null, null],
    ],
    invalidos: [
      ['Calle @ 5', MENSAJES.direccion],
      ['Calle_5', MENSAJES.direccion],
      ['<script>', MENSAJES.direccion],
      ['a'.repeat(256), 'La dirección: como máximo 255 caracteres.'],
    ],
  },
  validarNombreContacto: {
    validos: [
      ['Ana Lucía Pérez', 'Ana Lucía Pérez'],
      ['  María   José  ', 'María José'],
      ["B'alam Chávez", "B'alam Chávez"],
      ['', null],
      [null, null],
    ],
    invalidos: [
      ['Ana 2', MENSAJES.nombreContacto],
      ['Dr. Pérez', MENSAJES.nombreContacto],
      ['ana@correo.com', MENSAJES.nombreContacto],
      ['a'.repeat(151), 'El nombre del contacto: como máximo 150 caracteres.'],
    ],
  },
  validarCodigoVacuna: {
    validos: [
      ['HEXA', 'HEXA'],
      ['  mpox ', 'MPOX'],
      ['influ_ped', 'INFLU_PED'],
      ['COVID19', 'COVID19'],
      ['FA', 'FA'],
      ['A'.repeat(20), 'A'.repeat(20)],
    ],
    invalidos: [
      ['', MENSAJES.codigoVacunaObligatorio],
      ['   ', MENSAJES.codigoVacunaObligatorio],
      [null, MENSAJES.codigoVacunaObligatorio],
      ['A', MENSAJES.codigoVacunaLargo],
      ['A'.repeat(21), MENSAJES.codigoVacunaLargo],
      ['19COVID', MENSAJES.codigoVacuna],
      ['_HEXA', MENSAJES.codigoVacuna],
      ['HEP-B', MENSAJES.codigoVacuna],
      ['HEP B', MENSAJES.codigoVacuna],
      ['NEUMOCÓCICA', MENSAJES.codigoVacuna],
    ],
  },
  validarNombreVacuna: {
    validos: [
      ['Hexavalente', 'Hexavalente'],
      ['  Viruela   símica (Mpox) ', 'Viruela símica (Mpox)'],
      ['Sarampión, Paperas y Rubéola (SPR)', 'Sarampión, Paperas y Rubéola (SPR)'],
      ['COVID-19', 'COVID-19'],
      ["Td + Tdap / adulto d'Ana.", "Td + Tdap / adulto d'Ana."],
      ['Güiro Ñandú', 'Güiro Ñandú'],
      ['BCG', 'BCG'],
      ['a'.repeat(120), 'a'.repeat(120)],
    ],
    invalidos: [
      ['', MENSAJES.nombreVacunaObligatorio],
      ['   ', MENSAJES.nombreVacunaObligatorio],
      [null, MENSAJES.nombreVacunaObligatorio],
      ['TD', MENSAJES.nombreVacunaLargo],
      ['a'.repeat(121), MENSAJES.nombreVacunaLargo],
      ['Hexa @ 6', MENSAJES.nombreVacuna],
      ['Hexa_6', MENSAJES.nombreVacuna],
      ['Hexa; 6', MENSAJES.nombreVacuna],
    ],
  },
  validarDescripcionVacuna: {
    validos: [
      ['Dos dosis; grupos de riesgo: adultos.', 'Dos dosis; grupos de riesgo: adultos.'],
      ['  Vacuna   oral ', 'Vacuna oral'],
      ["Intramuscular (IM) / 0,5 ml + refuerzo d'Ana", "Intramuscular (IM) / 0,5 ml + refuerzo d'Ana"],
      ['Fórmula pediátrica', 'Fórmula pediátrica'],
      ['a'.repeat(255), 'a'.repeat(255)],
      ['', null],
      ['   ', null],
      [null, null],
    ],
    invalidos: [
      ['Dosis @ 2', MENSAJES.descripcionVacuna],
      ['Dosis_2', MENSAJES.descripcionVacuna],
      ['<b>', MENSAJES.descripcionVacuna],
      ['a'.repeat(256), 'La descripción: como máximo 255 caracteres.'],
    ],
  },
  validarNombreDosis: {
    validos: [
      ['Primera dosis', 'Primera dosis'],
      ['  Segundo   refuerzo ', 'Segundo refuerzo'],
      ['Dosis única', 'Dosis única'],
      ['Dosis 2 (6-11 meses), adic./B', 'Dosis 2 (6-11 meses), adic./B'],
      ['D1a', 'D1a'],
      ['a'.repeat(60), 'a'.repeat(60)],
    ],
    invalidos: [
      ['', MENSAJES.nombreDosisObligatorio],
      ['   ', MENSAJES.nombreDosisObligatorio],
      [null, MENSAJES.nombreDosisObligatorio],
      ['D1', MENSAJES.nombreDosisLargo],
      ['a'.repeat(61), MENSAJES.nombreDosisLargo],
      ['Dosis + 1', MENSAJES.nombreDosis],
      ["Dosis d'Ana", MENSAJES.nombreDosis],
      ['Dosis_1', MENSAJES.nombreDosis],
    ],
  },
  validarCantidadPoblacion: {
    validos: [
      [0, 0],
      [1450, 1450],
      [9999999, 9999999],
      ['123', 123],
      [' 1450 ', 1450],
      ['007', 7],
    ],
    invalidos: [
      [10000000, MENSAJES.cantidadPoblacion],
      [-1, MENSAJES.cantidadPoblacion],
      [1.5, MENSAJES.cantidadPoblacion],
      ['12a', MENSAJES.cantidadPoblacion],
      ['-1', MENSAJES.cantidadPoblacion],
      ['1,450', MENSAJES.cantidadPoblacion],
      ['10000000', MENSAJES.cantidadPoblacion],
      ['', MENSAJES.cantidadPoblacion],
      ['   ', MENSAJES.cantidadPoblacion],
      [null, MENSAJES.cantidadPoblacion],
    ],
  },
  validarFuentePoblacion: {
    validos: [
      ['Archivo MSPAS 2026', 'Archivo MSPAS 2026'],
      ['  Archivo   MSPAS ', 'Archivo MSPAS'],
      ['a'.repeat(150), 'a'.repeat(150)],
      ['', null],
      ['   ', null],
      [null, null],
    ],
    invalidos: [
      ['a'.repeat(151), MENSAJES.fuentePoblacion],
    ],
  },
  validarCodigoDimension: {
    validos: [
      ['via', 'via'],
      ['grupo_edad', 'grupo_edad'],
      ['  pueblo  ', 'pueblo'],
      ['v2', 'v2'],
      ['a'.repeat(30), 'a'.repeat(30)],
    ],
    invalidos: [
      ['Via', MENSAJES.codigoDimension],
      ['via-aplicacion', MENSAJES.codigoDimension],
      ['2via', MENSAJES.codigoDimension],
      ['_via', MENSAJES.codigoDimension],
      ['v', MENSAJES.codigoDimension],
      ['a'.repeat(31), MENSAJES.codigoDimension],
      ['', MENSAJES.codigoDimension],
      ['   ', MENSAJES.codigoDimension],
      [null, MENSAJES.codigoDimension],
    ],
  },
  validarCodigoValorDimension: {
    validos: [
      ['IM', 'IM'],
      ['im', 'IM'],
      [' 1_a_5 ', '1_A_5'],
      ['MENOR_1', 'MENOR_1'],
      ['A'.repeat(30), 'A'.repeat(30)],
    ],
    invalidos: [
      ['NO-INDICA', MENSAJES.codigoValorDimension],
      ['NIÑO', MENSAJES.codigoValorDimension],
      ['A B', MENSAJES.codigoValorDimension],
      ['A'.repeat(31), MENSAJES.codigoValorDimension],
      ['', MENSAJES.codigoValorDimension],
      ['   ', MENSAJES.codigoValorDimension],
      [null, MENSAJES.codigoValorDimension],
    ],
  },
  validarNombreDimension: {
    validos: [
      ['Vía de aplicación', 'Vía de aplicación'],
      ['  Pueblo   de pertenencia ', 'Pueblo de pertenencia'],
      ['ab', 'ab'],
      ['a'.repeat(60), 'a'.repeat(60)],
    ],
    invalidos: [
      ['a', MENSAJES.nombreDimension],
      ['a'.repeat(61), MENSAJES.nombreDimension],
      ['', MENSAJES.nombreDimension],
      ['   ', MENSAJES.nombreDimension],
      [null, MENSAJES.nombreDimension],
    ],
  },
  validarDescripcionDimension: {
    validos: [
      ['Cómo se aplicó la dosis (p. ej. IPV u OPV).', 'Cómo se aplicó la dosis (p. ej. IPV u OPV).'],
      ['a'.repeat(255), 'a'.repeat(255)],
      ['', null],
      ['   ', null],
      [null, null],
    ],
    invalidos: [
      ['a'.repeat(256), MENSAJES.descripcionDimension],
    ],
  },
  validarEtiquetaValorDimension: {
    validos: [
      ['< 1 año', '< 1 año'],
      ['M', 'M'],
      ['  De 1 a < 6   años ', 'De 1 a < 6 años'],
      ['a'.repeat(60), 'a'.repeat(60)],
    ],
    invalidos: [
      ['', MENSAJES.etiquetaValorDimension],
      ['   ', MENSAJES.etiquetaValorDimension],
      [null, MENSAJES.etiquetaValorDimension],
      ['a'.repeat(61), MENSAJES.etiquetaValorDimension],
    ],
  },
  validarEdadMeses: {
    validos: [
      [0, 0],
      [48, 48],
      [1200, 1200],
      ['24', 24],
      [' 60 ', 60],
    ],
    invalidos: [
      [1201, MENSAJES.edadMeses],
      [-1, MENSAJES.edadMeses],
      [1.5, MENSAJES.edadMeses],
      ['2a', MENSAJES.edadMeses],
      ['-1', MENSAJES.edadMeses],
      ['1201', MENSAJES.edadMeses],
      ['', MENSAJES.edadMeses],
      [null, MENSAJES.edadMeses],
    ],
  },
}

const REGLAS = {
  validarNombres, validarApellidos, validarCargo, validarTelefono, validarCorreo, validarCui, validarNombreUsuario,
  validarNombreDistrito, validarNombreEstablecimiento, validarDireccion, validarNombreContacto, validarCodigoVacuna,
  validarNombreVacuna, validarDescripcionVacuna, validarNombreDosis, validarCantidadPoblacion, validarFuentePoblacion,
  validarCodigoDimension, validarCodigoValorDimension, validarNombreDimension, validarDescripcionDimension,
  validarEtiquetaValorDimension, validarEdadMeses,
}

describe.each(Object.entries(CASOS))('%s', (nombre, { validos, invalidos }) => {
  const regla = REGLAS[nombre]

  it.each(validos)('acepta %j y devuelve %j', (entrada, esperado) => {
    expect(regla(entrada)).toEqual({ valor: esperado })
  })

  it.each(invalidos)('rechaza %j', (entrada, mensaje) => {
    expect(regla(entrada)).toEqual({ error: mensaje })
  })
})

describe('valores que no son texto', () => {
  it('rechaza números y objetos con el mensaje del formato', () => {
    expect(validarNombres(123)).toEqual({ error: MENSAJES.nombres })
    expect(validarCui(1234567890101)).toEqual({ error: MENSAJES.cuiLargo })
    expect(validarTelefono(55511001)).toEqual({ error: MENSAJES.telefono })
    expect(validarCorreo({})).toEqual({ error: MENSAJES.correo })
    expect(validarCargo(['Enfermera'])).toEqual({ error: MENSAJES.cargo })
    expect(validarNombreUsuario(42)).toEqual({ error: MENSAJES.nombreUsuario })
    expect(validarNombreDistrito(123)).toEqual({ error: MENSAJES.nombreDistrito })
    expect(validarNombreEstablecimiento(123)).toEqual({ error: MENSAJES.nombreEstablecimiento })
    expect(validarDireccion(5)).toEqual({ error: MENSAJES.direccion })
    expect(validarNombreContacto({})).toEqual({ error: MENSAJES.nombreContacto })
    expect(validarCodigoVacuna(123)).toEqual({ error: MENSAJES.codigoVacuna })
    expect(validarNombreVacuna(123)).toEqual({ error: MENSAJES.nombreVacuna })
    expect(validarDescripcionVacuna(5)).toEqual({ error: MENSAJES.descripcionVacuna })
    expect(validarNombreDosis({})).toEqual({ error: MENSAJES.nombreDosis })
    expect(validarCantidadPoblacion({})).toEqual({ error: MENSAJES.cantidadPoblacion })
    expect(validarFuentePoblacion(5)).toEqual({ error: MENSAJES.fuentePoblacion })
    expect(validarCodigoDimension(123)).toEqual({ error: MENSAJES.codigoDimension })
    expect(validarCodigoValorDimension(1)).toEqual({ error: MENSAJES.codigoValorDimension })
    expect(validarNombreDimension({})).toEqual({ error: MENSAJES.nombreDimension })
    expect(validarDescripcionDimension(5)).toEqual({ error: MENSAJES.descripcionDimension })
    expect(validarEtiquetaValorDimension(['M'])).toEqual({ error: MENSAJES.etiquetaValorDimension })
    expect(validarEdadMeses({})).toEqual({ error: MENSAJES.edadMeses })
  })
})
