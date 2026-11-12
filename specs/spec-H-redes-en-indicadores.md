# Spec H. Redes en Indicadores

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `a5cf45c`.
> **Origen:** retroalimentación del sprint review con la DDRISS (2026-11-10). Rutas relativas a `frontend/src/` salvo que digan `backend/`.
> **Necesita:** las tablas, permisos y `GET /redes` del spec G.
> **Choque con otros specs:** el spec I agrega la pestaña Producción y usa el mismo filtro de red en `BarraFiltrosIndicadores.jsx`.

## Por qué

La DDRISS presenta la cobertura por red: una tabla con los municipios de la red en filas, las vacunas trazadoras en columnas y cada celda pintada según el semáforo (imagen «Coberturas de Vacunación RED No. 1»). El «porcentaje del mes» de esa tabla es la **cobertura acumulada contra la población anual**.

## Decisiones (Chris, 2026-11-10)

- La red funciona como un **preset de municipios**: el filtro «Red» aparece en **todas** las pestañas de Indicadores.
- Nueva pestaña **Redes** con su tabla y sus gráficas.
- La tabla de la red usa cobertura contra la población anual (prorrateo `NINGUNO`), con el semáforo contra lo esperado del mes (8.33 % por mes). Ver la sección de cobertura de la red.

## Parte 1. Filtro «Red» en todas las pestañas

- **Dónde:** `paginas/indicadores/BarraFiltrosIndicadores.jsx`, `PaginaIndicadores.jsx` (`filtrosDeUrl`, `municipiosVisibles` de `panelIndicadores.js`).
- Nuevo select **Red** (con «Todas las redes») junto a Distrito, visible con `RED_CONSULTAR` y si la DDRISS tiene redes activas. Va en la URL como `red`.
- Elegir una red recorta los municipios visibles a los de la red (como hoy hace el distrito) y limpia `distrito` y `municipios`. Elegir distrito o municipios limpia `red`.
- Con red elegida, la fila de total de las tablas dice **«Total de la red»** en lugar de «Total de la DDRISS».
- **Total de la red en el backend:** `GET /indicadores/resultados` acepta `redId` y agrega una fila con `red: { id, nombre }` y `municipio: null`, calculada con los mismos calculadores (`modulos/indicadores/calculadores.js`) sobre la suma de numeradores y denominadores de los municipios de la red, con su color, `cumpleMeta` y `mayorACien`. Así el semáforo y la meta salen de la configuración del indicador, igual que en la fila de la DDRISS. No se guarda: se calcula al leer, como `mayorACien`.

## Parte 2. Pestaña «Redes»

- **Dónde:** `VISTAS` en `paginas/indicadores/panelIndicadores.js` (nueva vista `redes`), `PaginaIndicadores.jsx`, componentes nuevos `TablaRed.jsx` y `GraficaRed.jsx`.
- **Filtros en esta pestaña:** Año, Mes de corte y **Red** (obligatorio; por defecto la primera red activa). No se muestran Vacuna, Distrito ni Municipios.
- **Título:** «Cobertura de la {nombre de la red}».
- **Tabla** (como la imagen):
  - Filas: los municipios de la red y al final «Total de la red».
  - Columnas: las trazadoras de la red, agrupadas en el encabezado por grupo de edad de la población del indicador (p. ej. «< 1 año», «1 a < 2 años», «4 años»).
  - Celda: el valor del indicador de **COBERTURA** de esa vacuna y dosis en la corrida vigente, pintado con `InsigniaValor` (semáforo del indicador) y con `MarcaMayorACien` si aplica.
  - Si una trazadora no tiene indicador de cobertura calculado, la columna muestra «—» y un aviso arriba de la tabla: «Sin indicador de cobertura para: OPV R2, SPR 2. Se configuran en Administración · Indicadores».
  - Si hay más de un indicador de cobertura para la misma dosis, se usa el que tenga `prorrateo NINGUNO` (cobertura contra la población anual); si no hay, el primero.
- **Gráficas:**
  - **Trazadoras de la red contra la meta:** barras horizontales, una por trazadora, con el valor del total de la red, color del semáforo y línea de la meta (reutilizar `BarrasHorizontales.jsx`).
  - **Por municipio:** al elegir una trazadora (clic en su columna o un selector), barras de cada municipio de la red con la meta (reutilizar `GraficaPorMunicipio.jsx`).
  - Con corrida parcial, ambas llevan la marca «Preliminar» (`MarcaPreliminar.jsx`).
- El historial de corridas sigue plegable debajo, como en las demás pestañas.

## Cobertura de la red: contra la población anual y semáforo contra lo esperado del mes

La tabla de la red usa la **cobertura acumulada contra la población anual**, es decir, indicadores de **COBERTURA con prorrateo NINGUNO**. La DDRISS indicó que lo esperado avanza **8.33 % por mes** (100 % ÷ 12): a julio se espera 58.3 %, a septiembre 75 %, a diciembre 100 %.

- **Configuración (no es código):** cada trazadora necesita un indicador `COBERTURA` con `denominador.prorrateo = NINGUNO`. Los de prueba (`COB_BCG`, `COB_HEXA3`) usan `MENSUAL_LINEAL`; agregar a `04_datos_prueba_mongo.js` uno con `NINGUNO` por trazadora (p. ej. `COB_ANUAL_HEXA3`). Se crean también en Administración · Indicadores (HU-35).
- **Semáforo:** con `NINGUNO`, los cortes fijos 80/90 pondrían casi todo en rojo hasta diciembre. Por eso, en los indicadores con `NINGUNO`, el color se calcula contra lo esperado del mes:
  - `esperado = 100 / 12 × mes de corte` (8.33 % por mes).
  - `cumplimiento = valor / esperado × 100`, y a ese cumplimiento se le aplican los cortes del indicador (80/90 provisional): verde ≥ 90, amarillo 80 a < 90, rojo < 80.
  - La celda muestra el **valor** (p. ej. 52.70 %), no el cumplimiento; el tooltip dice «Esperado a julio: 58.3 %».
  - Va en `backend/src/modulos/indicadores/calculadores.js` (función pura, p. ej. `colorContraEsperado`), usada al calcular el `color` de los resultados con `NINGUNO`. Aplica a todas las pestañas, no solo a Redes. `cumpleMeta` sigue comparando contra la meta anual (95 %).
  - Los cortes reales (qué tan abajo de lo esperado es amarillo o rojo) se piden a la DDRISS; cambiarlos es configuración.
- La fila «Total de la red» usa la misma regla.

## Criterios de aceptación

- El filtro Red aparece en todas las pestañas y recorta las tablas y gráficas a los municipios de la red; queda en la URL.
- Con red elegida, la fila de total dice «Total de la red» y su valor, color y «Cumple» vienen del backend.
- La pestaña Redes muestra la tabla municipios × trazadoras con el semáforo, la fila de total y las dos gráficas.
- Una trazadora sin indicador se ve como «—» con el aviso.
- Con prorrateo `NINGUNO`, el color se calcula contra lo esperado del mes (8.33 % × mes): p. ej. a julio, 52.70 % es 90.3 % de lo esperado (verde) y 43.56 % es 74.7 % (rojo).
- Revisor y Autoridad ven la pestaña y el filtro (solo lectura).
- Pruebas del backend (fila de la red en `corridas.test.js`, `colorContraEsperado` en `calculadores.test.js`) y del frontend (`panelIndicadores.test.js`, `PaginaIndicadores.test.jsx`, `TablaRed`).
