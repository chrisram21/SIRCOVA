export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// { anio: 2026, mes: 10 } → 'octubre de 2026'
export const nombreDelMes = (periodo) => `${MESES[periodo.mes - 1]} de ${periodo.anio}`

export const porFecha = (a, b) => a.anio - b.anio || a.mes - b.mes

// La API manda AAAA-MM-DD; se muestra sin pasar por Date para no correrla un día por la zona horaria.
export const aDiaMesAnio = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : '—')

// Días de hoy (hora local) a una fecha AAAA-MM-DD: negativo si ya pasó.
export function diasHasta(fecha, hoy = new Date()) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((new Date(anio, mes - 1, dia) - inicioDeHoy) / 86_400_000)
}

export function textoPlazo(fecha, hoy) {
  const dias = diasHasta(fecha, hoy)
  if (dias < 0) return dias === -1 ? 'venció ayer' : `venció hace ${-dias} días`
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  return `vence en ${dias} días`
}
