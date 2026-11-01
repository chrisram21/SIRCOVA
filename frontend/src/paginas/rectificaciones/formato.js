import { nombreDelMes } from '@/lib/fechas.js'

// { anio: 2026, mes: 8 } → 'Agosto de 2026'
export const mesDe = (periodo) => {
  const nombre = nombreDelMes(periodo)
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

const dosCifras = (numero) => String(numero).padStart(2, '0')

// En la hora local del navegador.
export const aFechaHora = (iso) => {
  const fecha = new Date(iso)
  const dia = `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
  return `${dia} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}

// Las etiquetas de las dimensiones de una celda, o «Sin desagregación».
export const combinacionDe = (dimensiones) =>
  dimensiones.length === 0 ? 'Sin desagregación' : dimensiones.map((d) => d.etiqueta).join(' · ')

// +6, −3 (con el signo menos tipográfico).
export const diferenciaDe = (anterior, nueva) => {
  const diferencia = nueva - anterior
  return diferencia > 0 ? `+${diferencia}` : `−${Math.abs(diferencia)}`
}
