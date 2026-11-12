# SPEC 60 — Redes en Indicadores

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec H» de Chris, retroalimentación del sprint review con la DDRISS del 2026-11-10)
> **Depende de:** SPEC 43, SPEC 44, SPEC 49, SPEC 50, SPEC 52, SPEC 54, SPEC 55 y SPEC 59
> **Fecha:** 2026-11-11
> **Objetivo:** Que «Indicadores» filtre por red de municipios en todas sus pestañas, con la fila «Total de la red» calculada en el backend, y que una pestaña nueva «Redes» muestre la cobertura anual de las trazadoras de la red con el semáforo contra lo esperado del mes.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. La DDRISS presenta la cobertura por red: una tabla con los municipios de la red en filas, las vacunas trazadoras en columnas y cada celda pintada según el semáforo (imagen «Coberturas de Vacunación RED No. 1»). El «porcentaje del mes» de esa tabla es la **cobertura acumulada contra la población anual**, y lo esperado avanza **8.33 % por mes** (100 % ÷ 12): a julio se espera 58.3 %, a septiembre 75 %, a diciembre 100 %.

El SPEC 59 creó el catálogo de redes (`red`, `red_municipio`, `red_trazadora`, `GET /redes`). Este spec lo usa en «Indicadores». Chris lo dejó en `specs/spec-H-redes-en-indicadores.md`; este spec lo reemplaza y ese archivo se borra al implementarlo. El documento I (pestaña «Producción») tendrá su propio spec y reutiliza el filtro «Red» de este.

**Decisiones de Chris (2026-11-10), del documento H:**

- La red funciona como un **preset de municipios**: el filtro «Red» aparece en **todas** las pestañas de «Indicadores».
- Pestaña nueva **Redes** con su tabla y sus gráficas.
- La tabla de la red usa cobertura contra la población anual (prorrateo `NINGUNO`), con el semáforo contra lo esperado del mes.
- `cumpleMeta` sigue comparando contra la meta anual (95 %).
- Los cortes reales del semáforo contra lo esperado (qué tan abajo es amarillo o rojo) se piden a la DDRISS; cambiarlos es configuración.

**Lo que se decidió en la fase de preguntas (2026-11-11):**

- Un solo spec, como el SPEC 59 con el documento G.
- La fila «Total de la red» se agrega para Cobertura, Avance, Brecha y Deserción. En Proyección no hay total de la red.
- El mapa no lleva filtro de red, pero su leyenda se ajusta cuando el indicador es una cobertura anual.
- La regla de duplicados del SPEC 43 cuenta el prorrateo en las coberturas: puede haber una mensual y una anual por dosis.
- El código de una cobertura anual es `COB_ANUAL_{VACUNA}{DOSIS}`.
- La tabla de la red solo usa coberturas anuales. Una trazadora sin cobertura anual se ve con «—» y entra en el aviso, aunque tenga una mensual.
- La gráfica «Por municipio» de la pestaña Redes elige la trazadora con un select que no va en la URL.
- Se siembran solo las coberturas anuales de BCG, Hexavalente D3 y SPR D1, en el `04` y en un script nuevo `13` para la base actual. Las demás las confirma la DDRISS y se crean en la pantalla.

## Alcance

**Entra:**

- **Semáforo contra lo esperado (backend):**
  - la función pura `colorContraEsperado` en `backend/src/modulos/indicadores/calculadores.js`;
  - `leerResultados` (`corridas.service.js`) la usa para el `color` de las filas `COBERTURA` con prorrateo `NINGUNO`, y agrega a cada fila el campo `esperado`;
  - `corrida.indicadores` trae además `prorrateo` y `clasificacionPoblacion` de cada indicador.
- **Coberturas anuales (configuración):**
  - `llaveDeMedida` (`modulos/configuracion/indicadores.service.js`) incluye el prorrateo de las coberturas;
  - `codigoIndicador` genera `COB_ANUAL_…` para una cobertura `NINGUNO`, en `tiposIndicador.js` del backend y del frontend, con casos nuevos en sus dos tablas `CASOS`;
  - `COB_ANUAL_BCGU`, `COB_ANUAL_HEXA3` y `COB_ANUAL_SPR1` en `backend/db/04_datos_prueba_mongo.js` y en el script nuevo `backend/db/13_coberturas_anuales_mongo.js` (autorizado en la fase de preguntas).
- **Total de la red (backend):**
  - `GET /indicadores/resultados` acepta `redId` y agrega una fila por indicador con `red: { id, nombre }` y `municipio: null`;
  - toda fila de `ResultadoIndicador` trae `red` (`null` salvo en esa fila);
  - primero en `backend/openapi.yaml`.
- **Filtro «Red» (frontend):**
  - `listarRedes` de `api/catalogos.js` acepta `ddrissId` (la Autoridad nacional);
  - el select «Red» en `BarraFiltrosIndicadores.jsx`, el parámetro `red` en `filtrosDeUrl` y el recorte en `municipiosVisibles` (`panelIndicadores.js`);
  - «Total de la red» en las tablas, en `MarcaMayorACien.jsx` y en las gráficas que usan `filaDeReferencia`.
- **Pestaña «Redes» (frontend):**
  - la vista `redes` en `VISTAS` (`panelIndicadores.js`) y sus funciones puras nuevas en `paginas/indicadores/tablaRed.js`;
  - los componentes nuevos `TablaRed.jsx` y `GraficasRed.jsx` en `paginas/indicadores/`, que reutilizan `InsigniaValor`, `MarcaMayorACien`, `BarrasHorizontales`, `GraficaPorMunicipio` y `MarcaPreliminar`.
- **Mapa:** la leyenda de `mapaTerritorial.js` para un indicador `COBERTURA` con `NINGUNO`.
- Pruebas del backend (`calculadores.test.js`, `tiposIndicador.test.js`, `configIndicadores.test.js` y el archivo nuevo `redesEnIndicadores.test.js`) y del frontend (`panelIndicadores.test.js`, `tablaRed.test.js`, `TablaRed.test.jsx`, `PaginaIndicadores.test.jsx`, `mapaTerritorial.test.js` y `tiposIndicador.test.js`).
- La nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-H-redes-en-indicadores.md`.

**Fuera de alcance (para otros specs):**

- La pestaña «Producción» y su filtro de red (documento I).
- El filtro de red en la pantalla Mapa o en el Inicio.
- La fila «Total de la red» en Proyección.
- Guardar la fila de la red en `resultado_indicador`: se calcula al leer, como `mayorACien`.
- Coberturas anuales de las demás trazadoras: las confirma la DDRISS y se crean en Administración · Indicadores.
- Los cortes reales del semáforo contra lo esperado: se cambian en la configuración del indicador.
- Elegir la trazadora de la gráfica con un clic en la columna de la tabla.
- Cambiar las coberturas mensuales existentes (`COB_BCG`, `COB_HEXA3`) o la semilla de indicadores del `02`.
- Cambiar el modelo de datos de MySQL.

## Modelo de datos

No hay tablas ni colecciones nuevas. Solo cambian respuestas de la API, la regla de duplicados y los datos de prueba.

### Semáforo contra lo esperado (`calculadores.js`)

```js
// Solo COBERTURA con prorrateo NINGUNO. mes = mes de corte de la fila.
esperado = 100 / 12 * mes          // 58.333… a julio
cumplimiento = valor / esperado * 100
color = colorDelValor(umbrales, cumplimiento, 'COBERTURA')
```

- `colorContraEsperado(umbrales, valor, mes)` devuelve el color, o `null` sin valor o sin umbrales.
- La celda muestra el **valor** (52.70 %), no el cumplimiento.
- Ejemplos a julio: 52.70 % es 90.3 % de lo esperado (verde) y 43.56 % es 74.7 % (rojo).
- `cumpleMeta`, `meta`, `brechaDosis` y `mayorACien` no cambian: siguen contra la meta anual.

### Fila de `ResultadoIndicador` (cambios)

```js
{
  // …campos actuales
  red: null,            // { id, nombre } solo en la fila «Total de la red»
  esperado: 58.33,      // % esperado al mes de corte (2 decimales); null salvo COBERTURA con NINGUNO
}
```

### Indicador de la corrida (`corrida.indicadores[]`, cambios)

```js
{
  // …campos actuales
  prorrateo: 'NINGUNO',                 // del denominador; null en tipos sin prorrateo
  clasificacionPoblacion: 'MENOR_1',    // de aplica_a[0]; null en tipos sin población
  descripcionPoblacion: 'Menores de 1 año', // de clasificacion_poblacion (agregado en el paso 7); null sin clasificación
}
```

### `GET /indicadores/resultados?redId=`

- `redId` es opcional y no se combina con `municipioId` (400 `ENTRADA_INVALIDA`).
- La red debe existir, estar activa y ser de la DDRISS de la consulta; si no, 404 `NO_ENCONTRADO`.
- La respuesta trae lo de siempre (la fila de la DDRISS y todos los municipios) **más** una fila por indicador con `red: { id, nombre }` y `municipio: null`, para los tipos `COBERTURA`, `AVANCE_META_MES`, `BRECHA` y `DESERCION`.
- La fila de la red se arma con los calculadores de `calculadores.js` sobre los municipios de la red que están en la corrida:
  - `COBERTURA`, `AVANCE_META_MES` y `BRECHA`: suma de numeradores y de denominadores guardados; si a un municipio le falta el denominador, la fila no es calculable (como la de la DDRISS).
  - `DESERCION`: suma de las pérdidas (`numerador`) y de las iniciales (`denominador`).
  - `meta`, `cumpleMeta`, `brechaDosis`, `color` (con `colorContraEsperado` si aplica), `esperado`, `mayorACien`, `metaDosis`/`excedenteDosis` y `sumaBrechasMunicipales` (de los municipios de la red) se calculan igual que en la fila de la DDRISS.
- El contrato (`openapi.yaml`) documenta `redId`, el 404 y los campos `red` y `esperado`.

### Regla de duplicados y código (SPEC 43)

- `llaveDeMedida` agrega el prorrateo cuando el tipo es `COBERTURA` (`MENSUAL_LINEAL` por defecto si el documento no lo trae). Así conviven una cobertura mensual y una anual de la misma dosis, y una segunda anual da 409 `INDICADOR_DUPLICADO`.
- `codigoIndicador(tipo, vacuna, dosis, existentes, prorrateo)`: con `COBERTURA` y `NINGUNO`, el prefijo es `COB_ANUAL`. Ejemplos: `COB_ANUAL_HEXA3`, `COB_ANUAL_BCGU` (`UNICA` → `U`).
- El cambio va en `tiposIndicador.js` del backend y del frontend, con la misma tabla `CASOS` en sus dos pruebas (cuatro archivos).

### Coberturas anuales sembradas

| Código | Vacuna y dosis | Población | Prorrateo |
|---|---|---|---|
| `COB_ANUAL_BCGU` | BCG `UNICA` | `NACIDOS_VIVOS` | `NINGUNO` |
| `COB_ANUAL_HEXA3` | Hexavalente `D3` (`grupo_edad: MENOR_1`) | `MENOR_1` | `NINGUNO` |
| `COB_ANUAL_SPR1` | SPR `D1` | `1_A_MENOR_2` | `NINGUNO` |

- Las tres llevan meta 95 (`>`), umbrales provisionales 80/90 (`umbrales_provisionales: true`), `territorio` nacional, `VIGENTE`, `datos_prueba: true` y el resto de campos como `COB_BCG`.
- `backend/db/13_coberturas_anuales_mongo.js` se corre con `node --env-file=.env db/13_coberturas_anuales_mongo.js` (con `--simular` no escribe). Es idempotente: no inserta un código que ya existe. No recrea nada.
- Las tres entran en la siguiente corrida que se calcule; las corridas ya guardadas no cambian.

### URL de «Indicadores»

- `red` (id) se agrega a `filtrosDeUrl`. Elegir una red borra `distrito` y `municipios`; elegir distrito o municipios borra `red`.
- `vista=redes` abre la pestaña nueva. Ahí `red` es obligatoria: sin ella, o con una que no está, se usa la primera red activa (por nombre) y no se escribe en la URL.
- La pestaña Redes no usa `vacuna`, `distrito`, `municipios` ni `indicador`, pero no los borra de la URL.

### Pestaña «Redes»

- **Filtros:** Año, Mes de corte y Red (sin «Todas las redes»). No se ven Vacuna, Distrito ni Municipios.
- **Sin redes activas:** la pestaña se ve y muestra «La DDRISS no tiene redes activas. Se crean en Administración · Redes.»
- **Título:** «Cobertura de la {nombre de la red}».
- **Tabla** (`TablaRed.jsx`):
  - filas: los municipios de la red (por nombre) y al final «Total de la red» (de la fila del backend);
  - columnas: las trazadoras de la red, por el orden de su vacuna (`orden_informe`) y de la dosis, agrupadas en el encabezado por `clasificacionPoblacion` de su cobertura anual (descripción del catálogo, por ejemplo «Menores de 1 año»); las que no tienen cobertura anual van al final, en el grupo «Sin indicador»;
  - celda: `InsigniaValor` con el valor, y `MarcaMayorACien` si aplica; el `title` de la celda dice «Esperado a julio: 58.3 %»;
  - encima de la tabla, una línea: «Lo esperado a julio es 58.3 % de la población anual (8.33 % por mes).»
  - una trazadora sin cobertura anual en la corrida muestra «—» en toda su columna y entra en el aviso: «Sin indicador de cobertura anual para: OPV R2, SPR 2. Se configuran en Administración · Indicadores.»
- **Gráficas** (`GraficasRed.jsx`):
  - «Trazadoras de la red contra la meta»: barras horizontales (`BarrasHorizontales`), una por trazadora con cobertura anual, con el valor de «Total de la red», el color del semáforo y la línea de la meta.
  - «Por municipio»: select «Trazadora» en la tarjeta (por defecto la primera con cobertura anual) y barras de cada municipio de la red con la meta (`GraficaPorMunicipio`).
  - Con corrida parcial, las dos llevan `MarcaPreliminar`.
- El historial de corridas sigue plegable debajo, como en las demás pestañas.

### Funciones puras nuevas (`tablaRed.js`)

- `redElegida(redes, red)`: la de la URL si está activa; si no, la primera por nombre.
- `columnasDeLaRed(red, indicadores, resultados)`: por trazadora, su cobertura anual (o `null`) y su grupo.
- `filasDeLaRed(red, columnas, resultados)`: los municipios de la red con su resultado por columna, y la fila «Total de la red».
- `sinCoberturaAnual(columnas)`: los nombres para el aviso.
- Agregadas en la implementación: `etiquetaTrazadora` (`HEXA 3`, `BCG`, `DPT R1`), `gruposDeColumnas` (los grupos del encabezado con cuántas columnas abarcan; dos trazadoras del mismo grupo van juntas aunque en la red no lo estén) y `esperadoDeLaTabla` (el `esperado` de la primera celda que lo traiga).

### Leyenda del mapa

- Con un indicador `COBERTURA` de prorrateo `NINGUNO`, la leyenda dice «% de lo esperado a {mes} ({esperado} %)» y sus franjas leen los cortes como cumplimiento (≥ 90, 80 a < 90, < 80). El color de los polígonos ya llega del backend.

### Permisos

- No hay permisos nuevos. El filtro y la pestaña se ven con `RED_CONSULTAR` (Administrador, Epidemiología, Revisor y Autoridad) y si hay al menos una red activa. Sin `RED_CONSULTAR`, no se pide `GET /redes`.

## Plan de implementación

1. **Semáforo contra lo esperado.** `colorContraEsperado` en `calculadores.js` con sus casos en `calculadores.test.js` (los dos ejemplos de julio, diciembre = 100 %, sin valor y sin umbrales). Prueba: `npx vitest run tests/calculadores.test.js`.
2. **Resultados con `esperado` y color nuevo.** `leerResultados` usa `colorContraEsperado` en las coberturas `NINGUNO` y agrega `esperado` y `red: null`; `corrida.indicadores` trae `prorrateo` y `clasificacionPoblacion`. Contrato primero. Ajustar las pruebas con `toEqual` de la fila completa.
3. **Regla de duplicados y código.** `llaveDeMedida` con el prorrateo y `codigoIndicador` con `COB_ANUAL`, en los cuatro archivos de `tiposIndicador`. Prueba en `configIndicadores.test.js`: una cobertura anual junto a una mensual se crea, y una segunda anual da 409.
4. **Coberturas anuales sembradas.** Las tres en el `04` y el script `13`. Correr el `13` con `--simular` y luego sin él en la base de prueba.
5. **Total de la red en el backend.** `redId` en el contrato y en `resultadosVigentes`, la fila de la red con los calculadores, y `backend/tests/redesEnIndicadores.test.js` (año 2088, departamento `Z6`, DDRISS ficticia `ZVT_RED60`, municipios `Z601` a `Z604` e indicadores `ZVT_HU60_*`; ajustado en la implementación, ver Decisiones): valor, color, `cumpleMeta`, `mayorACien` y `sumaBrechasMunicipales` de la fila de la red; deserción; sin fila en proyección; 400 con `municipioId`; 404 con una red inactiva o de otra DDRISS.
6. **Filtro «Red».** `listarRedes` con `ddrissId`, el select en `BarraFiltrosIndicadores.jsx`, `red` en `filtrosDeUrl` y `municipiosVisibles`, la petición con `redId`, y «Total de la red» en las tablas, en `MarcaMayorACien` y en `filaDeReferencia`. Pruebas en `panelIndicadores.test.js` y `PaginaIndicadores.test.jsx`.
7. **Funciones de la pestaña.** `tablaRed.js` con `tablaRed.test.js` (columnas agrupadas, «—» sin cobertura anual, aviso, red por defecto).
8. **Pestaña «Redes».** La vista en `VISTAS`, `TablaRed.jsx` (con `TablaRed.test.jsx`), `GraficasRed.jsx` y los filtros de la pestaña en `PaginaIndicadores.jsx`. Pruebas de pantalla en `PaginaIndicadores.test.jsx`.
9. **Leyenda del mapa.** El texto y las franjas para una cobertura `NINGUNO` en `mapaTerritorial.js`, con su prueba.
10. **Cierre.** Nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-H-redes-en-indicadores.md`. Prueba manual: calcular un mes con la cuenta de Epidemiología y revisar la pestaña Redes con la Red No. 1, y el filtro con el Revisor y la Autoridad.

## Criterios de aceptación

- [ ] `colorContraEsperado` da verde para 52.70 % a julio (90.3 % de lo esperado) y rojo para 43.56 % (74.7 %).
- [ ] Una fila `COBERTURA` con prorrateo `NINGUNO` trae `esperado` y su `color` sale contra lo esperado; una con `MENSUAL_LINEAL` trae `esperado: null` y el mismo color que antes.
- [ ] `cumpleMeta` de una cobertura anual sigue comparando contra 95 %.
- [ ] Desde Administración · Indicadores se crea una cobertura anual de una dosis que ya tiene cobertura mensual, con el código `COB_ANUAL_{VACUNA}{DOSIS}`; una segunda anual de la misma dosis responde 409 `INDICADOR_DUPLICADO`.
- [ ] Después de correr el script `13`, la base de prueba tiene `COB_ANUAL_BCGU`, `COB_ANUAL_HEXA3` y `COB_ANUAL_SPR1` `VIGENTE`, y correrlo otra vez no inserta nada.
- [ ] `GET /indicadores/resultados?redId=` agrega una fila «Total de la red» por indicador de Cobertura, Avance, Brecha y Deserción, con valor, color, `cumpleMeta` y `mayorACien` calculados sobre los municipios de la red, y ninguna para Proyección.
- [ ] `redId` con `municipioId` responde 400; una red inactiva, inexistente o de otra DDRISS responde 404.
- [ ] El select «Red» aparece en todas las pestañas de «Indicadores» para quien tiene `RED_CONSULTAR` y su DDRISS tiene redes activas, y queda en la URL como `red`.
- [ ] Elegir una red recorta tablas y gráficas a sus municipios y borra `distrito` y `municipios` de la URL; elegir un distrito borra `red`.
- [ ] Con red elegida, la fila de total dice «Total de la red» y sus datos son los de la fila del backend; en Proyección no hay fila de total.
- [ ] La pestaña «Redes» muestra «Cobertura de la {red}», la tabla municipios × trazadoras agrupada por población, con el semáforo y la fila «Total de la red», y las dos gráficas.
- [ ] Una trazadora sin cobertura anual se ve con «—» y aparece en el aviso, aunque tenga una cobertura mensual.
- [ ] Con corrida parcial, las dos gráficas de la pestaña llevan la marca «PRELIMINAR».
- [ ] Sin redes activas, la pestaña muestra el aviso de Administración · Redes y el filtro «Red» no aparece en las demás pestañas.
- [ ] El Revisor y la Autoridad (con DDRISS elegida) ven el filtro y la pestaña.
- [ ] Con un indicador `COBERTURA` anual, la leyenda del mapa dice «% de lo esperado a {mes} ({esperado} %)».
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** un solo spec, como el SPEC 59 con el documento G. **No:** partirlo en dos o tres; Chris lo pensó como una sola entrega.
- **Sí:** la fila de la red se calcula al leer, en el backend, con los calculadores. Así la meta y el semáforo salen de la configuración del indicador, igual que la fila de la DDRISS. **No:** guardarla en `resultado_indicador`, porque una red puede cambiar de municipios después de la corrida. **No:** sumarla en el frontend, que no tiene las reglas de cada tipo.
- **Sí:** total de la red en Cobertura, Avance, Brecha y Deserción, que se rearman sumando numeradores y denominadores. **No:** en Proyección, cuyo campo `proyeccion` (ritmo, ventana, línea) habría que rearmar para la red; la tabla con red elegida no muestra fila de total.
- **Sí:** la fila de la DDRISS sigue en la respuesta aunque venga `redId`; el frontend elige cuál mostrar. **No:** reemplazarla, porque el Inicio y otras gráficas la siguen usando.
- **Sí:** semáforo contra lo esperado solo para `COBERTURA` con `NINGUNO`. Brecha no tiene semáforo, Avance ya es contra el mes y Proyección es contra diciembre. **No:** cortes distintos para lo esperado; se reutilizan los del indicador (80/90 provisional).
- **Sí:** el color se calcula al leer, como hoy, así que cambia también en las corridas ya guardadas. **No:** recalcular corridas.
- **Sí:** el prorrateo cuenta en la regla de duplicados de las coberturas, para que convivan la mensual y la anual. **No:** publicar versiones `NINGUNO` de `COB_BCG` y `COB_HEXA3`, que cambiaría lo que ven las otras pestañas y contradice la nota del SPEC 43. **No:** que solo el script se salte la regla, porque luego no se podrían editar desde la pantalla.
- **Sí:** prefijo `COB_ANUAL` en el código generado, igual que los sembrados. **No:** el sufijo `_2`, que no dice qué mide.
- **Sí (agregado en la implementación):** el código lo genera solo el backend, al crear el indicador. El formulario de Administración · Indicadores no calcula ni muestra el código, así que no cambia; el `codigoIndicador` del frontend solo lo usan sus pruebas, que repiten los casos del backend. El plan decía que el formulario pasaba el prorrateo al calcular el código, y no hacía falta.
- **Sí (agregado en la implementación):** con una red elegida, la línea de «Proyección» y «Comparar periodos» siguen con el total de la DDRISS, porque salen de `GET /indicadores/serie`, que no tiene versión por red; ya pasaba lo mismo con un distrito o con varios municipios. Las barras «Por vacuna» y «Deserción» sí toman «Total de la red». **Pendiente para otro spec:** decidir si la serie debe dar el total del filtro (red, distrito o municipios elegidos) en lugar del de la DDRISS.
- **Sí (agregado en la implementación):** `redesEnIndicadores.test.js` usa el año 2088, el departamento `Z6` y los municipios `Z601` a `Z604`. **No:** el año 1998 del plan, porque la API solo acepta años de 2000 a 2100; ni el departamento `ZR`, que es de `redes.test.js` y que esa prueba borra al empezar y al terminar (las dos corren en paralelo). La prueba inserta la corrida y sus resultados por SQL con la vacuna Hexavalente, sin una vacuna propia, porque no pasa por el motor; sus indicadores son de la DDRISS ficticia para que el motor de otras pruebas no los calcule.
- **Sí:** la tabla de la red solo usa coberturas anuales, y una trazadora sin ella va con «—». **No:** usar la mensual como respaldo (lo que decía el documento H), porque la tabla mezclaría dos medidas con colores que no se comparan.
- **Sí:** sembrar solo BCG, Hexavalente D3 y SPR D1, con población conocida. **No:** todas las trazadoras: su clasificación de población es dato del dominio que confirma la DDRISS (sección 9 de `AGENTS.md`).
- **Sí:** script nuevo `13` idempotente para la base actual, además del `04`. **No:** recrear MongoDB.
- **Sí:** select «Trazadora» para la gráfica por municipio, fuera de la URL. **No:** el clic en la columna (más código y pruebas) ni guardarla en la URL.
- **Sí:** la red de la pestaña es obligatoria y por defecto la primera activa. **No:** «Todas las redes» en esa pestaña, que no tiene sentido para una tabla por red.
- **Sí:** el mapa no filtra por red, pero su leyenda se ajusta, porque el color de sus polígonos cambia. **No:** dejar la leyenda con los cortes contra el valor, que no coincidiría con los colores.
- **Sí:** `clasificacionPoblacion` y `prorrateo` en `corrida.indicadores`, para agrupar columnas y saber cuál es anual. **No:** una consulta aparte a la configuración desde la pantalla.
- **Sí (agregado en la implementación, paso 7):** `corrida.indicadores` trae también `descripcionPoblacion`, leída del catálogo `clasificacion_poblacion`, para los encabezados de la tabla de la red. **No:** pedir el catálogo desde la pantalla, porque solo lo dan `GET /configuracion-indicadores/opciones` (`INDICADOR_CONFIG_*`) y `GET /poblaciones-objetivo` (`POBLACION_CONSULTAR`), que el Revisor y la Autoridad no tienen; **no:** una tabla fija en el frontend, que repetiría el catálogo.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El color de las coberturas anuales cambia en corridas viejas, porque se calcula al leer. | Es lo buscado: el color depende de la configuración y del mes, no se guarda. Queda escrito en las decisiones. |
| Una red cambia de municipios y el total de la red de un mes pasado ya no coincide con lo que se vio antes. | Se calcula con los municipios actuales de la red; queda en la nota de contexto. |
| Un municipio de la red sin denominador deja la fila de la red sin calcular. | Mismo comportamiento que la fila de la DDRISS; la tabla muestra el municipio sin valor. |
| Las pruebas con `toEqual` de la fila completa fallan por `red` y `esperado`. | Se ajustan en el paso 2, como pasó con `proyeccion` y `mayorACien`. |
| Las pruebas crean redes y municipios que chocan con los reales (un municipio, una red). | El archivo nuevo usa su propio departamento `Z6`, DDRISS y municipios ficticios, y los borra al inicio y al final. |
| Los cortes 80/90 contra lo esperado no son los de la DDRISS. | Son provisionales (`umbrales_provisionales: true`); se cambian en Administración · Indicadores sin código. |

## Lo que **no** entra en este spec

- La pestaña «Producción» y su filtro de red (documento I).
- El filtro de red en el Mapa o en el Inicio.
- La fila «Total de la red» en Proyección.
- Guardar la fila de la red en la base.
- Las coberturas anuales de las demás trazadoras y los cortes reales del semáforo.
- Elegir la trazadora con un clic en la tabla.
- Cambiar `COB_BCG`, `COB_HEXA3`, el `02` o el modelo de MySQL.

Cada uno, si llega, va en su propio spec.
