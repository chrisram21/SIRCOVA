// SPEC 72: el recorte, el orden y las columnas de las tablas de «Indicadores», para que el Excel sea la tabla que se
// ve. Repiten las funciones de frontend/src/paginas/indicadores/ (panelIndicadores.js, tablaRed.js, TablaBrecha.jsx,
// TablaDesercion.jsx y TablaProyeccion.jsx): un cambio va en los dos lados.

export const VISTAS = {
  avance: 'AVANCE_META_MES',
  brecha: 'BRECHA',
  cobertura: 'COBERTURA',
  desercion: 'DESERCION',
  proyeccion: 'PROYECCION',
  redes: null,
};

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const porNombreDeMunicipio = (a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, 'es');

export function municipiosDeLaCorrida(resultados) {
  const porId = new Map(resultados.filter((r) => r.municipio !== null).map((r) => [r.municipio.id, r.municipio]));
  return [...porId.values()].sort(porNombre);
}

// La red manda sobre el distrito; los elegidos fuera del recorte no cuentan y, si no queda ninguno, se ven todos.
export function municipiosVisibles(municipios, { delDistrito = null, deLaRed = null, elegidos = [] } = {}) {
  const recorte = deLaRed ?? delDistrito;
  const enRecorte = recorte ? municipios.filter((m) => recorte.includes(m.id)) : municipios;
  const validos = elegidos.filter((id) => enRecorte.some((m) => m.id === id));
  return validos.length > 0 ? enRecorte.filter((m) => validos.includes(m.id)) : enRecorte;
}

export const esFilaDeTotal = (r, red = null) => r.municipio === null && (red ? r.red?.id === red.id : !r.red);

export function nombreDeFila(r) {
  if (r.municipio !== null) return r.municipio.nombre;
  return r.red ? 'Total de la red' : 'Total de la DDRISS';
}

export function filasVisibles(filas, visibles, red = null) {
  const ids = new Set(visibles.map((m) => m.id));
  return filas.filter((r) => (r.municipio === null ? esFilaDeTotal(r, red) : ids.has(r.municipio.id)));
}

// El total primero; luego los municipios calculables con su orden y al final los demás, por nombre.
function totalYMunicipios(resultados, orden) {
  const municipales = resultados.filter((r) => r.municipio !== null);
  return [
    ...resultados.filter((r) => r.municipio === null),
    ...municipales.filter((r) => r.calculable).sort((a, b) => orden(a, b) || porNombreDeMunicipio(a, b)),
    ...municipales.filter((r) => !r.calculable).sort(porNombreDeMunicipio),
  ];
}

export const ordenarPorBrecha = (resultados) => totalYMunicipios(resultados, (a, b) => b.brechaDosis - a.brechaDosis);
export const ordenarPorDesercion = (resultados) => totalYMunicipios(resultados, (a, b) => b.valor - a.valor);
export const ordenarPorProyeccion = (resultados) => totalYMunicipios(resultados, (a, b) => a.valor - b.valor);

const ORDEN_DEL_TIPO = {
  BRECHA: ordenarPorBrecha,
  DESERCION: ordenarPorDesercion,
  PROYECCION: ordenarPorProyeccion,
};

// El numerador guardado de una deserción es la pérdida y el denominador, las dosis iniciales.
export const dosisFinales = (resultado) => resultado.denominador - resultado.numerador;

// Las filas de la tabla de un indicador, recortadas y ordenadas como en la pantalla. Avance y Cobertura conservan el
// orden de la API (total y municipios por nombre).
export function filasDeLaTabla(resultados, { indicador, red = null, municipioDelDistrito = null, municipioIds = [] }) {
  const municipios = municipiosDeLaCorrida(resultados);
  const visibles = municipiosVisibles(municipios, {
    delDistrito: red || municipioDelDistrito === null ? null : [municipioDelDistrito],
    deLaRed: red ? red.municipios.map((m) => m.id) : null,
    elegidos: red ? [] : municipioIds,
  });
  const filas = filasVisibles(resultados.filter((r) => r.indicadorCodigo === indicador.codigo), visibles, red);
  return ORDEN_DEL_TIPO[indicador.tipoCalculo]?.(filas) ?? filas;
}

// Redes (SPEC 60): HEXA D3 → «HEXA 3», BCG UNICA → «BCG», DPT R1 → «DPT R1».
export function etiquetaTrazadora({ codigo, vacuna }) {
  if (codigo === 'UNICA') return vacuna.codigo;
  return `${vacuna.codigo} ${/^D\d+$/.test(codigo) ? codigo.slice(1) : codigo}`;
}

const SIN_INDICADOR = 'Sin indicador';
const esCoberturaAnual = (i) => i.tipoCalculo === 'COBERTURA' && i.prorrateo === 'NINGUNO';

// Una columna por trazadora con su cobertura anual de la corrida (o null), agrupadas por población en el orden en que
// aparecen; las trazadoras sin indicador, al final.
export function columnasDeLaRed(red, indicadores, resultados) {
  const anuales = indicadores.filter(esCoberturaAnual);
  const columnas = red.trazadoras.map((trazadora) => {
    const indicador = anuales.find((i) => resultados.some((r) => r.indicadorCodigo === i.codigo
      && r.vacuna.codigo === trazadora.vacuna.codigo && r.dosis === trazadora.codigo)) ?? null;
    return {
      clave: `${trazadora.vacuna.codigo}-${trazadora.codigo}`,
      etiqueta: etiquetaTrazadora(trazadora),
      indicador,
      grupo: indicador
        ? indicador.descripcionPoblacion ?? indicador.clasificacionPoblacion ?? 'Sin grupo de población'
        : SIN_INDICADOR,
    };
  });
  const orden = [...new Set(columnas.filter((c) => c.indicador).map((c) => c.grupo)), SIN_INDICADOR];
  return columnas.sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo));
}

export function gruposDeColumnas(columnas) {
  const grupos = [];
  for (const { grupo } of columnas) {
    if (grupos.at(-1)?.grupo === grupo) grupos.at(-1).columnas += 1;
    else grupos.push({ grupo, columnas: 1 });
  }
  return grupos;
}

export function filasDeLaRed(red, columnas, resultados) {
  const celda = (columna, esLaFila) => (columna.indicador
    ? resultados.find((r) => r.indicadorCodigo === columna.indicador.codigo && esLaFila(r)) ?? null
    : null);
  return {
    municipios: [...red.municipios].sort(porNombre).map((municipio) => ({
      municipio,
      celdas: columnas.map((c) => celda(c, (r) => r.municipio?.id === municipio.id)),
    })),
    total: columnas.map((c) => celda(c, (r) => r.municipio === null && r.red?.id === red.id)),
  };
}

export const sinCoberturaAnual = (columnas) => columnas.filter((c) => !c.indicador).map((c) => c.etiqueta);

export function esperadoDeLaTabla({ municipios, total }) {
  const filas = [total, ...municipios.map((m) => m.celdas)].flat();
  return filas.find((r) => r?.esperado != null)?.esperado ?? null;
}
