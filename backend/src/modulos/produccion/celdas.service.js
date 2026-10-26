// Las celdas válidas de un esquema de captura, con la misma regla que armarFormulario.js del frontend (SPEC 21): un
// cambio va en los dos, y tests/celdas.test.js repite los casos de armarFormulario.test.js.

const GRUPO_EDAD = 'grupo_edad';

// La clave de una celda en detalle_produccion: dimension=VALOR|…, ordenada por código de dimensión; '' sin dimensiones.
export const claveCombinacion = (valores) =>
  Object.keys(valores)
    .sort()
    .map((dimension) => `${dimension}=${valores[dimension]}`)
    .join('|');

const producto = (dimensiones) =>
  dimensiones.reduce(
    (combinaciones, { codigo, valores }) =>
      combinaciones.flatMap((previa) => valores.map((valor) => ({ ...previa, [codigo]: valor }))),
    [{}],
  );

// Las versiones anteriores a la v0.4 del modelo no tienen secciones (Hexavalente v1): una por valor de grupo_edad
// del catálogo que use alguna dosis, con las dosis que lo admiten; sin grupo_edad, una sola con todas las dosis.
function seccionesDeducidas(contenido, catalogo) {
  const efectiva = (d) => d.desagregacion ?? contenido.desagregacion;
  const edadesDe = (d) => efectiva(d).find((x) => x.dimension === GRUPO_EDAD)?.valores ?? [];
  if (!contenido.desagregacion.some((x) => x.dimension === GRUPO_EDAD)) {
    return [{ grupoEdad: null, dosis: contenido.dosis.map((d) => d.codigo) }];
  }
  const usados = new Set(contenido.dosis.flatMap(edadesDe));
  return (catalogo.get(GRUPO_EDAD) ?? [])
    .filter((codigo) => usados.has(codigo))
    .map((codigo) => ({
      grupoEdad: codigo,
      dosis: contenido.dosis.filter((d) => edadesDe(d).includes(codigo)).map((d) => d.codigo),
    }));
}

// contenido: { dosis: [{ codigo, desagregacion }], desagregacion, secciones: [{ grupoEdad, dosis }] }, la forma de
// aEsquema. codigosDosis: los códigos de la tabla dosis de la vacuna. dimensiones: catalogo_dimensiones, con sus
// valores (incluidos los inactivos). Lo que no se puede armar se omite, como en el frontend.
// Devuelve Map<'{dosis}|{claveCombinacion}', { dosisCodigo, dimensiones, claveCombinacion }>.
export function celdasDelEsquema({ contenido, codigosDosis, dimensiones, deducirSecciones = false }) {
  const catalogo = new Map(dimensiones.map((d) => [d.codigo, d.valores.map((v) => v.codigo)]));
  const deLaVacuna = new Set(codigosDosis);

  const originales =
    deducirSecciones && contenido.secciones.length === 0 ? seccionesDeducidas(contenido, catalogo) : contenido.secciones;
  const secciones = originales
    .map((s) => ({ ...s, dosis: s.dosis.filter((codigo) => deLaVacuna.has(codigo)) }))
    .filter((s) => s.dosis.length > 0);

  const dimensionesDe = (desagregacion) =>
    desagregacion
      .filter(({ dimension }) => dimension !== GRUPO_EDAD && catalogo.has(dimension))
      .map(({ dimension, valores }) => ({
        codigo: dimension,
        valores: catalogo.get(dimension).filter((codigo) => valores.includes(codigo)),
      }))
      .filter((d) => d.valores.length > 0);

  const celdas = new Map();
  for (const dosis of contenido.dosis) {
    if (!deLaVacuna.has(dosis.codigo)) continue;
    const combinaciones = producto(dimensionesDe(dosis.desagregacion ?? contenido.desagregacion));
    for (const seccion of secciones.filter((s) => s.dosis.includes(dosis.codigo))) {
      for (const combinacion of combinaciones) {
        const valores = seccion.grupoEdad ? { [GRUPO_EDAD]: seccion.grupoEdad, ...combinacion } : combinacion;
        const clave = claveCombinacion(valores);
        celdas.set(`${dosis.codigo}|${clave}`, { dosisCodigo: dosis.codigo, dimensiones: valores, claveCombinacion: clave });
      }
    }
  }
  return celdas;
}
