# SPEC 79 — Corrección HU-45 Secciones de edad sin datos y desborde del PDF en informes

> **Estado:** Implementado
> **Historia:** HU-45
> **Origen:** correccion
> **Depende de:** SPEC 62, SPEC 63, SPEC 65, SPEC 66 y SPEC 78
> **Fecha:** 2026-11-27
> **Objetivo:** Que los informes de población propia, total y residencia (pantalla, Excel y PDF) muestren las secciones por grupo de edad de cada vacuna aunque el rango termine antes de que su esquema entrara en vigor, y que el PDF de los cuatro informes no deje filas ni notas solas en una página: primera página con el encabezado completo, las siguientes con uno reducido, y las filas compactadas cuando haga falta para que cada bloque quepa en su hoja.

## Errores que se corrigen

La DDRISS San Marcos reportó (2026-11-27) que los informes «muestran información parcial»: salvo la Hexavalente, ninguna vacuna mostraba su desagregación por edad. Al revisarlo con el equipo se encontraron dos errores.

### 1. Las vacunas sin esquema en el mes final salen sin secciones

**Cómo se ve:** el informe de población propia de enero a agosto de 2026 (todas las vacunas, todos los municipios) muestra la Hexavalente con su sección «Menores de 1 año», pero BCG, Polio, Rotavirus, Neumococo, SPR, Td, VPH, Varicela y COVID-19 salen con sus dosis sueltas, sin la fila de secciones. Pasa igual en la pantalla, el Excel y el PDF. El mismo informe de enero a octubre sí muestra las secciones, y el acumulado anual también.

**Causa:** `columnasDelInforme` y `columnasAgrupadas` (`informes.service.js`) toman las secciones del esquema que cubre el día 1 de `hasta` (`seccionesDelPeriodo`). Una vacuna **sin esquema en ese mes** lleva sus dosis activas sin sección, y solo recupera las secciones de las combinaciones que tienen datos. En la base de prueba, todos los esquemas publicados empiezan el 2026-10-01, salvo la Hexavalente v1 (enero a septiembre):

| Vacuna | Vigencia |
|---|---|
| Hexavalente v1 | 2026-01-01 a 2026-09-30 (sin secciones: se deducen) |
| Hexavalente v2, BCG, Polio, Neumococo, Rotavirus, SPR, Td, VPH, Varicela | desde 2026-10-01 |
| COVID-19 | v1 en octubre, v2 desde 2026-11-01 |

El acumulado anual no falla porque toma el último mes del año con `cierre_periodo`, que ya está dentro de esas vigencias.

### 2. El PDF deja la fila TOTAL o la nota final solas en una página

**Cómo se ve:** en el PDF de enero a octubre de 2026, el primer bloque (Hepatitis B, BCG y Polio) pasa la fila TOTAL sola a la página 2. La nota «Además, 78 dosis de establecimientos que no suman en el consolidado» queda sola en la página 9. El documento tiene 9 páginas para 7 bloques.

**Causa:** cada bloque es una tabla que empieza en página nueva y cabe justo con 30 municipios y un encabezado de una línea. Ese PDF juntó dos cosas que le quitan alto: el aviso «Septiembre y octubre de 2026 todavía no están cerrados…», que agranda el margen de arriba (`margenArriba`), y la sección «De 1 a < 2 años», que se parte en dos líneas. El PDF no mide si la tabla cabe: la deja correr a la página siguiente. El acumulado anual tiene el mismo riesgo: `unidadesPorPagina` supone un encabezado de tabla de alto fijo (`ALTO_ENCABEZADO_ANUAL`, 72 pt).

Además, todas las páginas repiten el encabezado completo (marca, Dirección, DDRISS, título, período, franja de filtros y avisos), que ocupa casi un tercio de la hoja.

## Lo que se decidió en la conversación previa (2026-11-27)

- **Secciones (opción A):** se usa el esquema que cubre el día 1 de `hasta`. Si una vacuna no tiene ninguno, se usa **el primero que entró en vigor después** de esa fecha. Si hay esquema en `hasta`, el informe no cambia. Las cantidades caen en su columna por dosis y grupo de edad, como hoy (`llaveDeColumna`), así que los datos registrados con una versión anterior quedan en la sección del mismo grupo de edad. Con el PDF de octubre se comprobó: las dosis de la Hexavalente v1 de enero a agosto caen en «< 1 año» de la v2.
- **Opciones descartadas:** usar siempre el esquema vigente hoy (cambiaría informes que hoy están bien) y juntar las secciones de todos los esquemas del rango (más complejo, y mezcla secciones de dos versiones en una tabla).
- **El arreglo de las secciones alcanza a la pantalla, el Excel y el PDF** de los tres informes de rango, porque los tres usan las mismas funciones de columnas. También alcanza a la agrupación por dimensión (SPEC 63) y, sin cambiar su resultado actual, al acumulado anual.
- **Encabezado del PDF (opción A):** la primera página lleva el encabezado completo de hoy. Desde la segunda, un encabezado reducido: la misma franja de marca (SIRCOVA, la Dirección, la DDRISS y el logo), el nombre del informe con el período y los avisos si los hay. La franja de filtros solo va en la primera página. Aplica a los cuatro PDF. (Corregido el 2026-11-27 al revisar el paso 4: la primera versión, de una línea y sin logo, quedaba demasiado resumida.)
- **Compactar las filas:** por nivel departamento, municipio o distrito, cada bloque de vacunas cabe en una página. Si no cabe por el encabezado de la tabla o los avisos, las filas se compactan (menos relleno y, si hace falta, letra algo menor) hasta que quepa el TOTAL.
- **Textos largos:** el nombre de la vacuna y el de la sección se parten en varias líneas y no se cortan; el alto del encabezado de la tabla se mide, no se supone.
- **Por establecimiento** (filas que no caben en una hoja), la tabla sigue en la página siguiente con el encabezado repetido, como hoy, pero nunca deja una página con solo el TOTAL: se lleva consigo filas anteriores.
- **La nota final** («Además, N dosis…») va debajo de la última tabla y solo pasa a otra página si no cabe; entonces se lleva la última parte de la tabla para no quedar sola.
- **Acumulado anual:** las unidades por página se calculan con el alto real del encabezado de la tabla, así que una unidad (sus cuatro filas) nunca se parte.
- Las vacunas **sin ningún esquema publicado** (Hepatitis B, Influenza, DPT, Tdap, SR, Neumococo 13 y 23, Fiebre amarilla) siguen sin secciones: no hay de dónde sacarlas. Se resuelve publicándoles un esquema, no con este spec.

## Alcance

**Entra:**

- Backend: el esquema de respaldo en `seccionesDelPeriodo` (`configuracion/esquemas.service.js`) y su uso en `vacunasConSusEsquemas` (`informes/informes.service.js`).
- Backend: el PDF de los cuatro informes (`informes/informePdf.service.js`): encabezado completo y reducido, medición del alto, compactación de filas, regla de la última página y nota final.
- `backend/openapi.yaml`: la descripción de las columnas de `GET /informes/produccion` y de `GET /informes/acumulado-anual`.
- Pruebas del backend (`informes.test.js`, `informePdf.test.js`).
- Notas de `backend/src/modulos/informes/CLAUDE.md`.

**No entra:** ver «Lo que **no** entra en este spec».

## Modelo de datos

No cambia. Solo se lee `esquemas_captura` con otro filtro de vigencia. No hay escrituras nuevas ni cambios en la bitácora.

## Diseño

### Esquema de respaldo (`seccionesDelPeriodo`)

`seccionesDelPeriodo(codigosVacuna, ddrissCodigo, fecha, { posterior = false } = {})`:

- Sin `posterior`, igual que hoy. La captura, el formulario y los demás usos no cambian.
- Con `posterior: true`, a las vacunas sin documento en `fecha` se les busca el esquema `VIGENTE` o `HISTORICO` de su territorio (nacional o de la DDRISS) con la menor `vigencia.desde` posterior a `fecha`. Si un nacional y uno de la DDRISS empiezan el mismo día, gana el de la DDRISS, como en `documentosDelPeriodo`. Se resuelve en una sola consulta más, solo con los códigos que faltan.
- La forma de lo que devuelve no cambia, así que `columnasDelInforme` (y `seccionesDeducidas` si el esquema no tiene secciones) y `columnasAgrupadas` funcionan igual.

`vacunasConSusEsquemas` pasa `{ posterior: true }`.

### PDF: encabezado por página

pdfmake no admite un margen superior distinto por página. Por eso:

- El margen de arriba de `documento` pasa a ser el del **encabezado reducido**, más el alto de los avisos.
- `header(pagina)` devuelve el encabezado reducido desde la página 2, y nada en la página 1.
- El encabezado completo de hoy (`encabezadoDePagina`, sin cambios en su aspecto) va como **primer elemento de `content`**, solo una vez.
- El encabezado reducido lleva la franja de marca del completo (`franjaDeMarca`: «SIRCOVA · Informes de vacunación» a la izquierda; la Dirección, la DDRISS y el logo a la derecha), la línea marino, el nombre del informe con el período a la derecha y los avisos en su recuadro ámbar si los hay. No lleva el rótulo, el subtítulo ni la franja de filtros. Mide unos 76 pt sin avisos (margen de arriba de 88). Se arma en `informePdf.service.js` con los mismos textos de `textosInforme.js`.
- El encabezado completo sube a su lugar de siempre con un margen negativo y va en una tabla de una celda con alto mínimo, para que la página 1 quede igual que antes (la primera tabla empieza en 152 pt, más los avisos).

### PDF: medir en lugar de suponer

pdfmake 0.3.14 pasa la posición final de cada nodo (`nodeInfo.pageNumbers`) a la función `pageBreakBefore` del documento. Con ella se arma una **pasada de prueba** que no agrega dependencias:

1. Se arma el documento con la densidad normal y se maqueta, anotando en qué páginas cae cada bloque (`id: tramo-N`, que ya existe), la fila TOTAL de cada uno y la nota final.
2. Si un bloque de nivel departamento, municipio o distrito ocupa más de una página, se rearma solo ese bloque con la densidad siguiente: `normal` (hoy), `compacta` (menos relleno vertical) o `minima` (además, letra 6.5 en las cantidades). Se usa la primera que cabe; si ni la mínima cabe (un caso extremo), queda la mínima y se aplica la regla de la última página.
3. En las tablas de varias páginas (establecimientos), si la última página lleva la fila TOTAL con menos de 3 filas (solo el TOTAL, o 1 o 2 filas con él), se marca la fila desde la que se pasa a la página siguiente para que lleve por lo menos 3 filas más el TOTAL. (Ampliado el 2026-11-27 en el paso 7: con 34 establecimientos la última página llevaba 1 fila y el TOTAL.)
4. Si la nota final cae sola en una página, la misma marca se aplica a la última tabla.
5. Se genera el PDF definitivo con lo decidido.

Las pruebas usan la misma pasada para comprobar en qué página cae cada cosa. Si en la implementación la pasada de prueba resulta lenta, se evalúa estimar el alto midiendo el texto con la fuente. La decisión se anota en el spec.

**Decidido al implementar el paso 5 (2026-11-27):**

- Se queda la pasada de prueba. Con 11 vacunas y avisos, ajustar el PDF tarda de 150 a 200 ms (30 municipios, 4 vueltas como máximo; 85 establecimientos, ~200 ms), muy por debajo del segundo de más del riesgo.
- La densidad `minima` usa letra 6.5 en **toda la fila de datos** (nombre, municipio y cantidades), no solo en las cantidades: el alto de la fila lo pone su celda más alta, y achicar solo las cantidades no ahorraba nada. El encabezado de la tabla no cambia.
- Por departamento, municipio o distrito, una nota final sola en su página también compacta el último bloque, y la tabla solo se corta si ya no hay densidad más apretada. Un bloque cortado no se compacta más. Sin eso, el corte por la nota hacía que el bloque ocupara dos páginas y la pasada siguiente lo compactaba sin necesidad (38 municipios daban 5 páginas en lugar de 4).
- El corte parte la tabla en dos (cada una con su encabezado, la segunda con `pageBreak: 'before'`), con la cebra seguida: pdfmake no permite forzar el salto en una fila.

### Acumulado anual

`unidadesPorPagina` deja de usar `ALTO_ENCABEZADO_ANUAL`: el alto del encabezado de la tabla se toma de la pasada de prueba del primer bloque, y con él se calcula cuántas unidades caben. Conserva el encabezado completo y reducido como los demás PDF. Las filas del acumulado no se compactan: cada página ya lleva solo las unidades que caben.

**Decidido al implementar el paso 6 (2026-11-27):**

- Las unidades se cuentan **por página**, no una sola cifra para todas: con el encabezado completo solo en la página 1, el bloque empieza en 152 pt (más los avisos) en la página 1 y en 88 en las demás. Con 11 vacunas y 30 municipios caben 8 en la primera página y 9 en las siguientes (antes, 7 en todas).
- El encabezado se mide en **cada bloque** (del rótulo a la primera unidad), no solo en el primero: cada uno tiene sus vacunas y secciones, y un nombre de varias líneas en otro bloque lo agranda. Lo que mide una unidad también sale de la pasada.
- `paginarAcumulado` reparte con esas medidas y vuelve a maquetar para comprobar: una página que no cupo lleva una unidad menos y se reparte de nuevo. Tarda de 450 a 580 ms con 30 municipios.
- `unidadesPorPagina({ inicio, encabezado, unidad })` es pura y recibe las medidas; `documentoDelAcumulado(informe, datos, paginacion)` sin paginación lleva cada bloque en una sola tabla, que es lo que mide la pasada.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, la descripción de las columnas de `GET /informes/produccion` (secciones y agrupación) y de `GET /informes/acumulado-anual`: «el esquema que cubre el día 1 de `hasta`; si la vacuna no tiene, el primero que entró en vigor después».
2. **Esquema de respaldo.** `seccionesDelPeriodo` con `posterior` y su uso en `vacunasConSusEsquemas`.
3. **Pruebas del respaldo** en `informes.test.js`, con los esquemas `ZVT_SPEC62`: un rango cuyo `hasta` es anterior a la vigencia trae las secciones del esquema siguiente; uno con esquema en `hasta` no cambia; un nacional y uno de la DDRISS el mismo día eligen el de la DDRISS; la agrupación por dimensión también usa el respaldo.
4. **Encabezado completo y reducido** en `informePdf.service.js` (`documento`, `encabezadoDePagina`, el nuevo encabezado reducido y el margen de arriba).
5. **Pasada de prueba y densidades** para `documentoDelInforme`, con la regla de la última página y la nota final.
6. **Acumulado anual** con el alto medido.
7. **Pruebas del PDF** en `informePdf.test.js`: el encabezado completo solo en la página 1; 30 filas con avisos y una sección de texto largo caben en una página por bloque; por establecimiento, ninguna página queda con solo el TOTAL; la nota final va con la última tabla; en el acumulado, ninguna unidad se parte.
8. **Prueba manual.** El informe de población propia de enero a agosto de 2026 en pantalla, Excel y PDF muestra las secciones de BCG, Polio, Rotavirus, Neumococo, SPR, Td, VPH, Varicela y COVID-19, y el de enero a octubre da un PDF de 7 páginas, una por bloque, con la nota en la última. Revisar también un PDF por establecimiento y el del acumulado anual.
9. **Notas** en `backend/src/modulos/informes/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` describe la regla del esquema de respaldo, y `/api/docs` carga sin errores.
- [x] El informe de población propia de enero a agosto de 2026 muestra en la pantalla, el Excel y el PDF las secciones por grupo de edad de las vacunas cuyo esquema empieza en octubre, con las cantidades en su columna.
- [x] Un rango con esquema en el mes final da las mismas columnas que antes (la Hexavalente de enero a agosto sigue con «Menores de 1 año» de su v1).
- [x] La agrupación por dimensión y el acumulado anual usan la misma regla.
- [x] Las vacunas sin ningún esquema publicado salen como hoy.
- [x] En los cuatro PDF, la primera página lleva el encabezado completo y las demás el reducido, con los avisos en todas.
- [x] Por departamento, municipio o distrito, cada bloque de vacunas cabe en una página aunque haya avisos y secciones de varias líneas: el PDF de enero a octubre de 2026 tiene 7 páginas.
- [x] Ninguna página lleva solo la fila TOTAL, y la nota final no queda sola en una página.
- [x] En el acumulado anual, ninguna unidad queda partida entre dos páginas, también con secciones de varias líneas.
- [x] Las pruebas del backend de los archivos tocados y `npm test` del frontend pasan.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** el primer esquema posterior como respaldo (decidido en la conversación previa). **No:** el vigente hoy, que cambiaría informes con esquema en su mes final. **No:** juntar las secciones de todos los esquemas del rango.
- **Sí:** el respaldo como opción de `seccionesDelPeriodo` que solo piden los informes (decidido al escribir el spec). La captura y el formulario siguen exigiendo el esquema del mes.
- **Sí:** encabezado completo en la página 1 y reducido en las demás, con los avisos en todas (decidido en la conversación previa). **No:** todas las páginas iguales y compactas, que liberan menos espacio.
- **Sí:** compactar las filas para que un bloque de nivel departamento, municipio o distrito quepa en una página (decidido en la conversación previa). **No:** dejar que pase a una segunda página.
- **Sí:** medir con una pasada de prueba de pdfmake (decidido al escribir el spec). Es exacto con textos largos y no agrega dependencias. **No:** seguir con altos fijos supuestos, que es lo que falló.
- **Sí:** el encabezado reducido con la franja de marca y el logo del MSPAS, y el nombre del informe (decidido al revisar el paso 4, 2026-11-27). **No:** el reducido de una línea sin logo que se había decidido al escribir el spec: quedaba demasiado resumido.

## Riesgos

- **Tiempo de la pasada de prueba:** maquetar dos veces alarga la exportación. Medirlo con el PDF de enero a octubre y por establecimiento. Si pasa de un segundo más, se reconsidera (ver «Medir en lugar de suponer»).
- **Encabezado como contenido:** el encabezado completo deja de ser el `header` de la página 1. Revisar que la marca de agua «PRELIMINAR», el pie y el número de páginas sigan igual.
- **Columnas de un esquema futuro:** con el respaldo, un rango antiguo puede mostrar una dosis o sección que se agregó después, en ceros. Es lo esperado: la estructura es la del esquema siguiente.

## Lo que **no** entra en este spec

- Publicar esquemas para las vacunas que no tienen ninguno.
- Cambiar el diseño del Excel o de la pantalla: solo reciben las secciones corregidas.
- Cambiar la vigencia de los esquemas o las reglas de la captura.
- La tarjeta B de la captura (producción atribuida): va en su propio spec.
