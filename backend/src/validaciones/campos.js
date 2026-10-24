// Reglas de formato de los campos de texto. Cada una devuelve { valor } con el valor limpio o { error }.
// Hay una copia con las mismas reglas en frontend/src/validaciones/campos.js: un cambio va en las dos.

export const LARGOS = {
  nombres: 100, apellidos: 100, cargo: 100, correo: 150, nombreUsuario: 50, nombreDistrito: 120,
  nombreEstablecimiento: 150, direccion: 255, nombreContacto: 150, codigoVacuna: 20, nombreVacuna: 120,
  descripcionVacuna: 255, nombreDosis: 60, fuentePoblacion: 150,
};

export const MENSAJES = {
  nombresObligatorio: 'Los nombres son obligatorios.',
  nombres: 'Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.',
  apellidosObligatorio: 'Los apellidos son obligatorios.',
  apellidos: 'Los apellidos solo pueden tener letras, espacios, apóstrofos y guiones.',
  cargo: 'El cargo solo puede tener letras, espacios y los signos . , ( ) / -.',
  telefono: 'El teléfono debe tener 8 dígitos y empezar con 2 a 7.',
  correoObligatorio: 'El correo es obligatorio.',
  correo: 'El correo no es válido.',
  cuiObligatorio: 'El CUI es obligatorio.',
  cuiLargo: 'El CUI debe tener 13 dígitos.',
  cuiVerificador: 'El CUI no es válido; revise los dígitos.',
  cuiDepartamento: 'El CUI no es válido; el departamento debe estar entre 01 y 22.',
  nombreUsuario:
    'El nombre de usuario debe tener de 4 a 50 caracteres: minúsculas, números, punto, guion o guion bajo.',
  nombreDistritoObligatorio: 'El nombre del distrito es obligatorio.',
  nombreDistrito: 'El nombre del distrito solo puede tener letras, números, espacios y los signos . - ( ).',
  nombreDistritoLargo: 'El nombre del distrito debe tener entre 3 y 120 caracteres.',
  nombreEstablecimientoObligatorio: 'El nombre del establecimiento es obligatorio.',
  nombreEstablecimiento:
    "El nombre del establecimiento solo puede tener letras, números, espacios y los signos . , - ( ) / '.",
  nombreEstablecimientoLargo: 'El nombre del establecimiento debe tener entre 3 y 150 caracteres.',
  direccion: "La dirección solo puede tener letras, números, espacios y los signos . , - ( ) / # '.",
  nombreContacto: 'El nombre del contacto solo puede tener letras, espacios, apóstrofos y guiones.',
  codigoVacunaObligatorio: 'El código de la vacuna es obligatorio.',
  codigoVacuna:
    'El código de la vacuna debe empezar con una letra y solo puede tener letras sin tildes, números y guion bajo.',
  codigoVacunaLargo: 'El código de la vacuna debe tener entre 2 y 20 caracteres.',
  nombreVacunaObligatorio: 'El nombre de la vacuna es obligatorio.',
  nombreVacuna: "El nombre de la vacuna solo puede tener letras, números, espacios y los signos . , - ( ) / + '.",
  nombreVacunaLargo: 'El nombre de la vacuna debe tener entre 3 y 120 caracteres.',
  descripcionVacuna:
    "La descripción solo puede tener letras, números, espacios y los signos . , - ( ) / + ' ; :.",
  nombreDosisObligatorio: 'El nombre de la dosis es obligatorio.',
  nombreDosis: 'El nombre de la dosis solo puede tener letras, números, espacios y los signos . , - ( ) /.',
  nombreDosisLargo: 'El nombre de la dosis debe tener entre 3 y 60 caracteres.',
  cantidadPoblacion: 'La cantidad debe ser un número entero entre 0 y 9,999,999.',
  fuentePoblacion: 'La fuente admite hasta 150 caracteres.',
};

const demasiadoLargo = (campo, largo) => `${campo}: como máximo ${largo} caracteres.`;

const NOMBRE = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;
const CARGO = /^\p{L}[\p{L} .,()/-]*$/u;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE_USUARIO = /^[a-z0-9._-]{4,50}$/;
const TELEFONO = /^[2-7]\d{7}$/;
const NOMBRE_DISTRITO = /^[\p{L}\d .()-]+$/u;
const NOMBRE_ESTABLECIMIENTO = /^[\p{L}\d .,()/'-]+$/u;
const DIRECCION = /^[\p{L}\d .,()/#'-]+$/u;
const CODIGO_VACUNA = /^[A-Z][A-Z0-9_]*$/;
const NOMBRE_VACUNA = /^[\p{L}\d .,()/+'-]+$/u;
const DESCRIPCION_VACUNA = /^[\p{L}\d .,()/+';:-]+$/u;
const NOMBRE_DOSIS = /^[\p{L}\d .,()/-]+$/u;
const DEPARTAMENTOS = 22;
const CANTIDAD_POBLACION_MAXIMA = 9_999_999;

// Sin texto (null, undefined o solo espacios) devuelve ''. Un valor que no es texto devuelve null.
function limpiar(valor) {
  if (valor == null) return '';
  if (typeof valor !== 'string') return null;
  return valor.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function nombreDePersona(valor, { obligatorio, formato, campo, largo }) {
  const texto = limpiar(valor);
  if (texto === '') return { error: obligatorio };
  if (texto === null || !NOMBRE.test(texto)) return { error: formato };
  if (texto.length > largo) return { error: demasiadoLargo(campo, largo) };
  return { valor: texto };
}

export function validarNombres(valor) {
  return nombreDePersona(valor, {
    obligatorio: MENSAJES.nombresObligatorio, formato: MENSAJES.nombres, campo: 'Los nombres', largo: LARGOS.nombres,
  });
}

export function validarApellidos(valor) {
  return nombreDePersona(valor, {
    obligatorio: MENSAJES.apellidosObligatorio, formato: MENSAJES.apellidos, campo: 'Los apellidos',
    largo: LARGOS.apellidos,
  });
}

// Opcional: vacío devuelve { valor: null }.
export function validarCargo(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null || !CARGO.test(texto) || (texto.match(/\p{L}/gu) ?? []).length < 2) {
    return { error: MENSAJES.cargo };
  }
  if (texto.length > LARGOS.cargo) return { error: demasiadoLargo('El cargo', LARGOS.cargo) };
  return { valor: texto };
}

// Opcional. Acepta +502, espacios y guiones; se guarda como NNNN-NNNN.
export function validarTelefono(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null) return { error: MENSAJES.telefono };
  const sinPrefijo = texto.replace(/^\+502/, '');
  if (!/^[\d -]+$/.test(sinPrefijo)) return { error: MENSAJES.telefono };
  const digitos = sinPrefijo.replace(/[ -]/g, '');
  if (!TELEFONO.test(digitos)) return { error: MENSAJES.telefono };
  return { valor: `${digitos.slice(0, 4)}-${digitos.slice(4)}` };
}

// Obligatorio también al editar: una vez registrado no se borra. Se guarda en minúsculas.
export function validarCorreo(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.correoObligatorio };
  if (texto === null || !CORREO.test(texto)) return { error: MENSAJES.correo };
  if (texto.length > LARGOS.correo) return { error: demasiadoLargo('El correo', LARGOS.correo) };
  return { valor: texto.toLowerCase() };
}

// 8 dígitos de correlativo, 1 verificador, 2 de departamento y 2 de municipio. Devuelve los 13 dígitos limpios.
export function validarCui(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.cuiObligatorio };
  if (texto === null || !/^[\d -]+$/.test(texto)) return { error: MENSAJES.cuiLargo };
  const cui = texto.replace(/[ -]/g, '');
  if (cui.length !== 13) return { error: MENSAJES.cuiLargo };

  const digitos = [...cui].map(Number);
  // El 1.º dígito por 2, el 2.º por 3… el 8.º por 9. Un residuo de 10 no cabe en un dígito: no es válido.
  const suma = digitos.slice(0, 8).reduce((total, digito, i) => total + digito * (i + 2), 0);
  if (suma % 11 !== digitos[8]) return { error: MENSAJES.cuiVerificador };

  const departamento = Number(cui.slice(9, 11));
  if (departamento < 1 || departamento > DEPARTAMENTOS) return { error: MENSAJES.cuiDepartamento };
  return { valor: cui };
}

// Solo al crear la cuenta; las que ya existen no se revisan.
export function validarNombreUsuario(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : null;
  if (!texto || !NOMBRE_USUARIO.test(texto)) return { error: MENSAJES.nombreUsuario };
  return { valor: texto };
}

export function validarNombreDistrito(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.nombreDistritoObligatorio };
  if (texto === null || !NOMBRE_DISTRITO.test(texto)) return { error: MENSAJES.nombreDistrito };
  if (texto.length < 3 || texto.length > LARGOS.nombreDistrito) return { error: MENSAJES.nombreDistritoLargo };
  return { valor: texto };
}

export function validarNombreEstablecimiento(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.nombreEstablecimientoObligatorio };
  if (texto === null || !NOMBRE_ESTABLECIMIENTO.test(texto)) return { error: MENSAJES.nombreEstablecimiento };
  if (texto.length < 3 || texto.length > LARGOS.nombreEstablecimiento) {
    return { error: MENSAJES.nombreEstablecimientoLargo };
  }
  return { valor: texto };
}

// Opcional: vacío devuelve { valor: null }.
export function validarDireccion(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null || !DIRECCION.test(texto)) return { error: MENSAJES.direccion };
  if (texto.length > LARGOS.direccion) return { error: demasiadoLargo('La dirección', LARGOS.direccion) };
  return { valor: texto };
}

// Opcional: vacío devuelve { valor: null }. Es el nombre de una persona, con la regla de los nombres.
export function validarNombreContacto(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null || !NOMBRE.test(texto)) return { error: MENSAJES.nombreContacto };
  if (texto.length > LARGOS.nombreContacto) {
    return { error: demasiadoLargo('El nombre del contacto', LARGOS.nombreContacto) };
  }
  return { valor: texto };
}

// Se guarda en mayúsculas. Es la llave que usan los esquemas de captura en MongoDB.
export function validarCodigoVacuna(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.codigoVacunaObligatorio };
  const codigo = texto?.toUpperCase();
  if (texto === null || !CODIGO_VACUNA.test(codigo)) return { error: MENSAJES.codigoVacuna };
  if (codigo.length < 2 || codigo.length > LARGOS.codigoVacuna) return { error: MENSAJES.codigoVacunaLargo };
  return { valor: codigo };
}

export function validarNombreVacuna(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.nombreVacunaObligatorio };
  if (texto === null || !NOMBRE_VACUNA.test(texto)) return { error: MENSAJES.nombreVacuna };
  if (texto.length < 3 || texto.length > LARGOS.nombreVacuna) return { error: MENSAJES.nombreVacunaLargo };
  return { valor: texto };
}

// Opcional: vacío devuelve { valor: null }.
export function validarDescripcionVacuna(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null || !DESCRIPCION_VACUNA.test(texto)) return { error: MENSAJES.descripcionVacuna };
  if (texto.length > LARGOS.descripcionVacuna) {
    return { error: demasiadoLargo('La descripción', LARGOS.descripcionVacuna) };
  }
  return { valor: texto };
}

export function validarNombreDosis(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { error: MENSAJES.nombreDosisObligatorio };
  if (texto === null || !NOMBRE_DOSIS.test(texto)) return { error: MENSAJES.nombreDosis };
  if (texto.length < 3 || texto.length > LARGOS.nombreDosis) return { error: MENSAJES.nombreDosisLargo };
  return { valor: texto };
}

// Acepta texto de solo dígitos por el Input del frontend; la API exige un número antes de llamarla.
export function validarCantidadPoblacion(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : null;
  const cantidad = texto === null ? valor : /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > CANTIDAD_POBLACION_MAXIMA) {
    return { error: MENSAJES.cantidadPoblacion };
  }
  return { valor: cantidad };
}

export function validarFuentePoblacion(valor) {
  const texto = limpiar(valor);
  if (texto === '') return { valor: null };
  if (texto === null || texto.length > LARGOS.fuentePoblacion) return { error: MENSAJES.fuentePoblacion };
  return { valor: texto };
}
