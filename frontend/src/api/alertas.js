import { solicitar } from './cliente.js'

// SPEC 67: las alertas ACTIVA dirigidas al rol del usuario en su ámbito, por severidad y de la más reciente a la más
// antigua (hasta 50): { total, porSeveridad: { CRITICA, ADVERTENCIA, INFO }, alertas }.
export function listarAlertas() {
  return solicitar('/alertas')
}
