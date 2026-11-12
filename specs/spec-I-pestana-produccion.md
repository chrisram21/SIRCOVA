# Spec I. Pestaña «Producción» en Indicadores

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `a5cf45c`.
> **Origen:** retroalimentación del sprint review con la DDRISS (2026-11-10). Rutas relativas a `frontend/src/` salvo que digan `backend/`.
> **Choque con otros specs:** el spec H agrega la pestaña Redes y el filtro de red en `BarraFiltrosIndicadores.jsx`. El filtro de red de esta pestaña aparece cuando existan las redes del spec G.

## Por qué

Hoy todos los indicadores son por **municipio de residencia** (de dónde es la persona, `v_produccion_atribuida`, Excel 3). La DDRISS también quiere ver la **producción**: las dosis que aplicó cada municipio o establecimiento, sin importar de dónde sea la persona (incluye Migrantes). El dato ya existe en `v_produccion` y, consolidado, en `v_consolidado_establecimiento`.

## Decisiones (Chris, 2026-11-10)

- Solo **dosis** (cantidades), sin porcentajes.
- Pestaña nueva **Producción** dentro de Indicadores.
- Agrupar **por municipio de aplicación** o **por establecimiento**; filtros de municipio, establecimiento y red.
- Cuenta reportes **aprobados y cerrados**; si el rango incluye meses sin cerrar, lleva la marca «Preliminar».
- **Hospitales:** la DDRISS sí quiere verlos, incluidos los `solo_cobertura` (Hospital de San Marcos), señalados como «No suma en el consolidado». El campo `solo_cobertura` no cambia. En la pantalla no se menciona ningún Excel.

## Backend

- Endpoint nuevo `GET /indicadores/produccion` (permiso `INDICADOR_CONSULTAR`) en `backend/src/modulos/indicadores/`, sobre `v_produccion` con la misma regla de estados que `v_consolidado_establecimiento` (`APROBADO`, `CERRADO`, `RECTIFICACION`) pero **sin** excluir `solo_cobertura`. Las vistas no se cambian.
- Regla de los `solo_cobertura`:
  - **Por establecimiento:** aparecen como filas con `fueraDelConsolidado: true`.
  - **Por municipio de aplicación:** no se suman (así el municipio de San Marcos no se infla con el hospital).
  - **Fila de total:** no los suma; la respuesta trae aparte `dosisFueraDelConsolidado`.
- Parámetros: `anio`, `mes` (corte), `acumulado` (`true` = enero al mes; `false` = solo el mes; por defecto `true`), `agrupar` (`municipio` | `establecimiento`), `vacuna` (código), `municipioIds`, `establecimientoIds`, `redId`, y `ddrissId` para la autoridad nacional.
- Respuesta: por fila (municipio de aplicación o establecimiento con su municipio) y por dosis de la vacuna: `dosisPoblacionPropia`, `dosisOtrosMunicipios`, `dosisTotal`; más una fila de total y `preliminar: true` si algún mes del rango no está `CERRADO` en la DDRISS (con la lista de esos meses).
- Respeta la DDRISS del usuario.
- Actualizar `backend/openapi.yaml`.

## Frontend

- **Dónde:** `VISTAS` en `paginas/indicadores/panelIndicadores.js` (vista `produccion`), `PaginaIndicadores.jsx`, `BarraFiltrosIndicadores.jsx`, `api/indicadores.js` y componentes nuevos `TablaProduccion.jsx` y `GraficaProduccion.jsx`.
- Esta pestaña **no depende de la corrida**: se muestra aunque el mes no tenga indicadores calculados.
- **Filtros:** Año, Mes de corte, Vacuna, «Acumulado / Solo el mes», **Agrupar por** (Municipio de aplicación / Establecimiento), Municipios, Establecimientos (con búsqueda, regla del spec F) y Red (cuando exista). Distrito se queda si ya aplica a las demás pestañas.
- **Tabla:** una fila por municipio o establecimiento; columnas por dosis de la vacuna (D1, D2, R1…) con el total, y las columnas «Población propia», «Otros municipios» y «Total». Fila final de total.
- **Gráfica:** barras horizontales del total de dosis por fila, apiladas en «Población propia» y «Otros municipios», de mayor a menor. Sin semáforo ni meta (no son porcentajes).
- Las filas de establecimientos `solo_cobertura` llevan la insignia **«No suma en el consolidado»** y van en gris en la gráfica; bajo la fila de total, una línea: «Además, {n} dosis de establecimientos que no suman en el consolidado».
- Con `preliminar`, la gráfica lleva `MarcaPreliminar` y arriba de la tabla un aviso con los meses sin cerrar.
- Texto de ayuda corto bajo el título: «Dosis aplicadas por el municipio o establecimiento, sin importar la residencia de la persona. Incluye Migrantes».

## Criterios de aceptación

- La pestaña Producción muestra dosis por municipio de aplicación o por establecimiento, con tabla y gráfica.
- El total coincide con `v_consolidado_establecimiento` para los mismos filtros (sin los `solo_cobertura`).
- Por establecimiento aparece el Hospital de San Marcos con la insignia «No suma en el consolidado»; por municipio no se suma.
- Incluye aprobados y cerrados; con meses sin cerrar se ve la marca «Preliminar» y el aviso.
- Los filtros quedan en la URL; el filtro de red recorta a los municipios de la red.
- No aparecen porcentajes ni semáforo.
- Pruebas del backend (servicio y ruta) y del frontend (tabla, gráfica y filtros).
