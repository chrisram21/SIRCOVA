// Lo que ve el Administrador de cada marcador del mensaje (SPEC 74). Las claves son las de `marcadores` en
// tiposRegla.js; este archivo es solo del frontend.
export const MARCADORES_REGLA = {
  vacuna: { etiqueta: 'Vacuna', descripcion: 'El nombre de la vacuna.' },
  dosis: { etiqueta: 'Dosis', descripcion: 'La dosis de la celda, por ejemplo «1.ª dosis».' },
  valor: { etiqueta: 'Cantidad registrada', descripcion: 'La cantidad que se registró en la celda.' },
  minimo: { etiqueta: 'Mínimo', descripcion: 'El mínimo de la regla.' },
  maximo: { etiqueta: 'Máximo', descripcion: 'El máximo de la regla.' },
  dosis_anterior: { etiqueta: 'Dosis anterior', descripcion: 'La dosis que debería tener más aplicaciones.' },
  dosis_posterior: { etiqueta: 'Dosis posterior', descripcion: 'La dosis que supera a la anterior.' },
  exceso_permitido_pct: {
    etiqueta: 'Exceso permitido (%)',
    descripcion: 'El exceso permitido de la regla, en porcentaje.',
  },
  variacion: {
    etiqueta: 'Variación (%)',
    descripcion: 'Cuánto cambia la producción del mes frente al promedio, en porcentaje.',
  },
  meses_referencia: { etiqueta: 'Meses de referencia', descripcion: 'Cuántos meses anteriores se promedian.' },
  variacion_max_pct: {
    etiqueta: 'Variación máxima (%)',
    descripcion: 'La variación máxima de la regla, en porcentaje.',
  },
  total: { etiqueta: 'Total declarado', descripcion: 'El total que declaró el establecimiento.' },
  suma: { etiqueta: 'Suma del detalle', descripcion: 'La suma de las cantidades del detalle.' },
  n_faltantes: {
    etiqueta: 'Celdas sin llenar',
    descripcion: 'Cuántas celdas y campos obligatorios quedaron vacíos.',
  },
  version: { etiqueta: 'Versión del esquema', descripcion: 'La versión del esquema de captura del reporte.' },
  municipio: { etiqueta: 'Municipio', descripcion: 'El municipio de procedencia de la celda.' },
  establecimiento: { etiqueta: 'Establecimiento', descripcion: 'El establecimiento del reporte.' },
  periodo: { etiqueta: 'Periodo', descripcion: 'El mes del reporte.' },
}

// Un marcador sin entrada en la tabla muestra su código y solo «Inserta {clave}.».
export function describirMarcador(clave) {
  const marcador = MARCADORES_REGLA[clave]
  const inserta = `Inserta {${clave}}.`
  if (!marcador) return { etiqueta: clave, ayuda: inserta }
  return { etiqueta: marcador.etiqueta, ayuda: `${marcador.descripcion} ${inserta}` }
}

// Inserta {marcador} en lugar de la selección [inicio, fin) del texto. Agrega un espacio antes si el carácter
// anterior no es un espacio ni «(». Devuelve el texto nuevo y la posición del cursor, después del marcador.
export function insertarMarcador(texto, inicio, fin, marcador) {
  const antes = texto.slice(0, inicio)
  const anterior = antes.at(-1)
  const espacio = anterior !== undefined && anterior !== ' ' && anterior !== '(' ? ' ' : ''
  const insertado = `${espacio}{${marcador}}`
  return { texto: antes + insertado + texto.slice(fin), cursor: inicio + insertado.length }
}
