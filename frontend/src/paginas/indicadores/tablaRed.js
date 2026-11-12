// SPEC 60: lo que la pestaña «Redes» arma con las redes y la corrida vigente. Funciones puras: las cuentas se prueban
// aquí y TablaRed y GraficasRed solo dibujan. La tabla solo usa coberturas anuales (COBERTURA con prorrateo NINGUNO).

const SIN_INDICADOR = 'Sin indicador'

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')

// La de la URL si está entre las activas; si no, la primera por nombre; sin redes, null.
export function redElegida(redes, id) {
  if (!redes || redes.length === 0) return null
  return redes.find((r) => r.id === id) ?? [...redes].sort(porNombre)[0]
}

// HEXA D3 → «HEXA 3», BCG UNICA → «BCG», DPT R1 → «DPT R1».
export function etiquetaTrazadora({ codigo, vacuna }) {
  if (codigo === 'UNICA') return vacuna.codigo
  return `${vacuna.codigo} ${/^D\d+$/.test(codigo) ? codigo.slice(1) : codigo}`
}

const esCoberturaAnual = (i) => i.tipoCalculo === 'COBERTURA' && i.prorrateo === 'NINGUNO'

// Una columna por trazadora, en el orden de la red (vacuna y dosis), con su cobertura anual de la corrida (o null) y
// su grupo de población. Los grupos van en el orden en que aparecen y las trazadoras sin indicador, al final.
export function columnasDeLaRed(red, indicadores, resultados) {
  const anuales = indicadores.filter(esCoberturaAnual)
  const columnas = red.trazadoras.map((trazadora) => {
    const indicador = anuales.find((i) => resultados.some((r) => r.indicadorCodigo === i.codigo
      && r.vacuna.codigo === trazadora.vacuna.codigo && r.dosis === trazadora.codigo)) ?? null
    return {
      clave: `${trazadora.vacuna.codigo}-${trazadora.codigo}`,
      etiqueta: etiquetaTrazadora(trazadora),
      indicador,
      grupo: indicador
        ? indicador.descripcionPoblacion ?? indicador.clasificacionPoblacion ?? 'Sin grupo de población'
        : SIN_INDICADOR,
    }
  })
  const orden = [...new Set(columnas.filter((c) => c.indicador).map((c) => c.grupo)), SIN_INDICADOR]
  // sort es estable: dentro de un grupo se conserva el orden de la red.
  return columnas.sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo))
}

// Los grupos del encabezado, con cuántas columnas abarca cada uno.
export function gruposDeColumnas(columnas) {
  const grupos = []
  for (const { grupo } of columnas) {
    if (grupos.at(-1)?.grupo === grupo) grupos.at(-1).columnas += 1
    else grupos.push({ grupo, columnas: 1 })
  }
  return grupos
}

// Los municipios de la red (por nombre) con su resultado por columna, y la fila «Total de la red» (la que la API
// agrega con redId). Una celda sin indicador o sin fila es null.
export function filasDeLaRed(red, columnas, resultados) {
  const celda = (columna, esLaFila) => (columna.indicador
    ? resultados.find((r) => r.indicadorCodigo === columna.indicador.codigo && esLaFila(r)) ?? null
    : null)
  return {
    municipios: [...red.municipios].sort(porNombre).map((municipio) => ({
      municipio,
      celdas: columnas.map((c) => celda(c, (r) => r.municipio?.id === municipio.id)),
    })),
    total: columnas.map((c) => celda(c, (r) => r.municipio === null && r.red?.id === red.id)),
  }
}

// Las trazadoras del aviso «Sin indicador de cobertura anual para: …».
export const sinCoberturaAnual = (columnas) => columnas.filter((c) => !c.indicador).map((c) => c.etiqueta)

// Lo esperado al mes de corte, de la primera fila de la tabla que lo traiga (todas las anuales dan el mismo).
export function esperadoDeLaTabla({ municipios, total }) {
  const filas = [total, ...municipios.map((m) => m.celdas)].flat()
  return filas.find((r) => r?.esperado != null)?.esperado ?? null
}
