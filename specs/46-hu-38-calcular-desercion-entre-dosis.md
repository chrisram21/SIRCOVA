# SPEC 46 — Calcular la deserción entre dosis

> **Estado:** Implementado
> **Historia:** HU-38
> **Depende de:** SPEC 43, SPEC 44 y SPEC 45
> **Fecha:** 2026-11-04
> **Objetivo:** Que la corrida de indicadores calcule los indicadores `DESERCION` y que la pantalla «Indicadores» muestre, por vacuna y municipio, el porcentaje de quienes recibieron la primera dosis y no la última.

## Por qué existe este spec

El motor (SPEC 44) calcula `COBERTURA`, `AVANCE_META_MES` y `BRECHA` (SPEC 45). Los indicadores `DESERCION` (como `DES_HEXA1_3` de la semilla) todavía salen en `omitidos` con «Su cálculo todavía no está disponible.», porque `referenciasDe` (`motor.service.js`) exige una sola `dosis` y un `clasificacion_poblacion`, y la deserción tiene `dosis_inicial` y `dosis_final` y no usa población.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- La fórmula de la historia es (primera dosis − última dosis) ÷ primera dosis × 100. Se guarda como la semilla: `numerador` = la pérdida (inicial − final), `denominador` = las dosis iniciales y `dosis_id` = la dosis final. No se cambia el 03.
- Con datos acumulados en el año, la dosis final puede superar a la inicial (esquemas empezados el año anterior o niños de otro municipio). El motor guarda el valor negativo tal cual, y la pantalla lo marca como «Deserción negativa».
- «No calculable» en la deserción significa «sin primeras dosis», no «sin población».

## Alcance

**Entra:**

- `DESERCION` en `CALCULADORES` (`modulos/indicadores/calculadores.js`), con su función `calcularDesercion`.
- `motor.service.js`: `referenciasDe` y `numeradorDe` aceptan los indicadores de dos dosis (`dosis_inicial`/`dosis_final`) sin grupo de población.
- Contrato: la descripción de `ResultadoIndicador` explica qué son `numerador`, `denominador`, `dosis` y `calculable` en una fila `DESERCION`, y `omitidos` ya no la nombra.
- Pantalla «Indicadores»: tabla propia cuando el indicador elegido es `DESERCION`.
- Pruebas puras (`calculadores.test.js`), contra la base (`corridas.test.js`) y del frontend.
- Verificación manual con Playwright; avance de HU-38, notas en HU-41 y HU-42, `CONTEXTO BD.md` y `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Gráficas, entre ellas las barras «Deserción entre Hexa 1 y Hexa 3» con la línea de umbral de `Indicadores.html` (HU-41), y la deserción en el mapa (HU-42).
- `PROYECCION` (HU-39).
- Alertas por deserción (HU-51), aunque la semilla tenga `alerta.generar`.
- Deserción entre dosis no consecutivas definida desde otra pantalla que no sea «Configuración de indicadores» (SPEC 43 ya permite elegir cualquier par en orden).
- Seguimiento de cohortes (contar la final solo de quienes recibieron la inicial): el sistema solo tiene datos agregados.
- Exportar a Excel o PDF.
- Cambios en `backend/db/`, en permisos o en la configuración de indicadores.

## Modelo de datos

Este spec no cambia la base de datos ni las colecciones. Reutiliza `resultado_indicador` y `configuracion_indicadores` como los dejaron los SPEC 44 y 45.

### Cálculo de la fila `DESERCION` (al calcular)

`CALCULADORES.DESERCION = calcularDesercion`. Con la versión que aplica y su `aplica_a[0]` (`vacuna`, `dosis_inicial`, `dosis_final`, `filtros_dimension`):

- **Dosis inicial y final:** las acumuladas de enero al mes de corte, con la misma regla de `leerDatos` (reportes `CERRADO`, procedencia del departamento de la DDRISS) y el mismo filtro de dimensiones para las dos.
- **Guarda por municipio:**

| Columna | Valor |
|---|---|
| `numerador` | inicial − final (puede ser negativo) |
| `denominador` | inicial |
| `valor` | (inicial − final) ÷ inicial × 100, a 4 decimales; `NULL` si inicial = 0 |
| `meta` | `meta.valor` de la versión (10 por defecto); `NULL` si no es calculable |
| `brecha_dosis` | `NULL` siempre |
| `cumple_meta` | `valor` contra la meta con el `comparador` de la versión (`<=` por defecto); `NULL` si no es calculable |
| `dosis_id` | la dosis final |
| `filtro_dimensiones` | el texto canónico del filtro, como los demás tipos |

- **Departamental** (`municipio_id` NULL): con la suma de las iniciales y de las finales de todos los municipios del departamento de la DDRISS (sin el `9999`). No calculable solo si la suma de las iniciales es 0.
- **Sin población:** la deserción no lee `poblacion_objetivo`, así que una población que falta no la deja sin calcular.
- **Semáforo:** `colorDelValor` ya lo pinta descendente; un valor negativo cae en la primera franja (verde).

Ejemplo de la semilla (`DES_HEXA1_3`, San Marcos, agosto de 2026): D1 1,051 y D3 975 → `numerador` 76, `denominador` 1051, `valor` 7,2312, `cumple_meta` TRUE.

### Lectura (`GET /indicadores/resultados`)

No hay campos nuevos. En una fila `DESERCION`:

- `dosis` es la dosis final; la inicial sale de la versión del indicador (`GET /configuracion-indicadores/{codigo}`), y la pantalla la toma del nombre del indicador.
- `metaDosis`, `excedenteDosis` y `sumaBrechasMunicipales` salen `null`, porque `brechaDosis` es `null` (ya lo hace `metaYExcedente`).
- `calculable` es `false` cuando no hubo dosis iniciales.

### Frontend

- `paginas/indicadores/PaginaIndicadores.jsx`: si el indicador elegido es `DESERCION`, muestra `TablaDesercion`; el título ya sale de la `etiqueta` del tipo («Deserción entre dosis»).
- `paginas/indicadores/TablaDesercion.jsx` (nuevo):
  - Columnas: Municipio · Dosis iniciales (`denominador`) · Dosis finales (`denominador − numerador`) · Pérdida (`numerador`) · Deserción (con el semáforo) · Meta («≤ 10 %») · Cumple.
  - Fila «Total de la DDRISS» arriba y en negrita.
  - Municipios ordenados de mayor a menor deserción, y por nombre si empatan; los no calculables al final, con «Sin primeras dosis».
  - Un valor negativo se muestra con su signo y la marca «Deserción negativa». Si hay al menos uno, una línea debajo de la tabla explica que se aplicaron más dosis finales que iniciales en el año (esquemas empezados antes o niños de otro municipio) y que conviene revisar el registro.
  - El semáforo reutiliza la insignia de `PaginaIndicadores.jsx` (`InsigniaValor` y `CLASES_COLOR`, exportados). Nada de colores escritos a mano.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                 ← ResultadoIndicador: significado de los campos en DESERCION
├── src/modulos/indicadores/calculadores.js      ← calcularDesercion y DESERCION en CALCULADORES
├── src/modulos/indicadores/motor.service.js     ← referenciasDe y numeradorDe con dos dosis
└── tests/
    ├── calculadores.test.js                     ← casos de DESERCION
    └── corridas.test.js                         ← ZVT_HU36_DES deja de estar en omitidos; casos nuevos
frontend/src/paginas/indicadores/
├── PaginaIndicadores.jsx (+ .test)              ← TablaDesercion; InsigniaValor y CLASES_COLOR exportados
└── TablaDesercion.jsx (+ .test)                 ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md, docs/base-de-datos/CONTEXTO BD.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** La descripción de `ResultadoIndicador` (y de `numerador`, `denominador`, `dosis` y `calculable`) explica la fila `DESERCION`; la de `omitidos` ya no la nombra. Comprobación: `/api/docs` carga.
2. **Calculador puro.** `calcularDesercion` en `calculadores.js` y `DESERCION` en `CALCULADORES`. Recibe los mapas por municipio de la dosis inicial y de la final, en lugar de `numeradores` y `poblaciones`. Casos en `calculadores.test.js`:
   - `DES_HEXA1_3` de San Marcos en la semilla (D1 1051, D3 975): `numerador` 76, `denominador` 1051, `valor` 7,2312, cumple;
   - sobre la meta (no cumple) y justo en la meta (cumple con `<=`);
   - final mayor que inicial: `valor` negativo y cumple;
   - inicial 0: `valor`, `meta` y `cumple_meta` `null`, sin error;
   - la departamental suma iniciales y finales, y no es calculable solo si la suma de iniciales es 0;
   - un municipio sin población sigue siendo calculable;
   - `brecha_dosis` siempre `null`.
   Comprobación: la prueba pasa.
3. **Motor.** En `motor.service.js`, `referenciasDe` revisa `dosis_inicial` y `dosis_final` en los tipos de dos dosis (`TIPOS_INDICADOR[tipo].dosis === 'DOS'`), con el motivo de omisión si una no existe, devuelve la final como `dosisId` y no exige grupo de población. `numeradorDe` recibe la dosis que se pide, y la consulta de filtros de varias dimensiones se hace por cada dosis que se usa. Comprobación: las pruebas actuales de `corridas.test.js` pasan, salvo la que espera `ZVT_HU36_DES` en `omitidos`.
4. **Pruebas contra la base.** En `corridas.test.js` (año 2006, vacuna `ZVT_HU36` con D1 y D2, indicador `ZVT_HU36_DES` ya preparado):
   - la corrida calcula `ZVT_HU36_DES` y no lo pone en `omitidos` (cambia la expectativa actual);
   - la deserción por municipio coincide con las D1 y D2 de `v_produccion_atribuida` del año hasta el corte;
   - un municipio con D2 y sin D1 queda no calculable;
   - si los datos lo permiten, un municipio con más D2 que D1 da un valor negativo (si no, se agrega una celda de D1 o D2 en un reporte `CERRADO` que no cambie lo que esperan las otras pruebas).
   Comprobación: `calculadores.test.js` y `corridas.test.js` pasan, y no quedan datos `ZVT_HU36…` ni del año 2006.
5. **Frontend.** `TablaDesercion.jsx` y el cambio de `PaginaIndicadores.jsx`. Pruebas (con `vi.mock`):
   - con un indicador `DESERCION`, el título «Deserción entre dosis», las columnas, las dosis finales calculadas y el orden de mayor a menor deserción;
   - «Sin primeras dosis» al final;
   - un valor negativo con «Deserción negativa» y la línea de explicación, y sin la línea si no hay negativos;
   - con otro tipo, la tabla de siempre.
   Comprobación: `npm test` del frontend pasa completo.
6. **Verificación manual y documentación.** Con Playwright, como `epidemiologia`: calcular agosto de 2026, elegir `DES_HEXA1_3` y comparar cada municipio con la corrida 1 de la semilla (las diferencias de Concepción Tutuapa y San Rafael son las del SPEC 44). Revisar por SQL que la corrida nueva tenga las filas `DES_HEXA1_3` y que su bitácora ya no la liste en `omitidos`. Documentación: avance y criterios de HU-38; notas en HU-41 (las barras de deserción leen `valor` y la meta como línea de umbral) y HU-42 (el mapa puede leer el `valor` y el `color` de la deserción); `CONTEXTO BD.md` (`DESERCION` y qué guarda cada columna); nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta qué son `numerador`, `denominador`, `dosis` y `calculable` en una fila `DESERCION`, y `/api/docs` carga.
- [ ] No cambian `backend/db/`, los permisos ni los `package.json`.
- [ ] Una corrida calcula los indicadores `DESERCION` que aplican a la DDRISS, por vacuna, municipio y mes de corte, y ya no los pone en `omitidos`.
- [ ] La deserción de `DES_HEXA1_3` de San Marcos con los datos de la semilla de agosto de 2026 es 7,2312 con `numerador` 76 y `denominador` 1051, en `calculadores.test.js`.
- [ ] Un municipio sin dosis iniciales queda con `valor`, `meta` y `cumpleMeta` en `null` y `calculable` en `false`, sin que la corrida falle.
- [ ] Un municipio con más dosis finales que iniciales queda con `valor` negativo y `cumpleMeta` verdadero.
- [ ] La fila departamental usa la suma de iniciales y finales de los municipios.
- [ ] La deserción no depende de la población objetivo.
- [ ] Con un indicador `DESERCION` elegido, la pantalla muestra «Deserción entre dosis», las dosis iniciales, finales, la pérdida y el porcentaje con su semáforo por municipio, de mayor a menor, y «Sin primeras dosis» al final.
- [ ] Un valor negativo se ve con «Deserción negativa» y la línea de explicación.
- [ ] `calculadores.test.js` y `corridas.test.js` pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar pruebas, y no quedan datos `ZVT_HU36…` ni del año 2006.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [ ] HU-38 tiene su avance y sus criterios, HU-41 y HU-42 sus notas, y `CONTEXTO BD.md` y `CLAUDE.md` están al día.

## Decisiones

- **Sí:** guardar como la semilla: `numerador` = inicial − final, `denominador` = inicial, `dosis_id` = la final, `brecha_dosis` `NULL` (decidido en la fase de preguntas). **No:** `numerador` = final y `denominador` = inicial, que obliga a corregir el 03.
- **Sí:** guardar el valor negativo y marcarlo en la pantalla (decidido en la fase de preguntas). **No:** recortarlo a 0, que esconde un caso que puede ser un error de registro; **no:** dejarlo no calculable.
- **Sí:** tabla propia para `DESERCION`, ordenada por la deserción (decidido en la fase de preguntas). **No:** reutilizar la tabla de cobertura, cuyas columnas de población y dosis que faltan no aplican; **no:** solo backend.
- **Sí:** las pruebas contra la base amplían `corridas.test.js` (año 2006, `ZVT_HU36*`), que ya prepara `ZVT_HU36_DES` (decidido en la fase de preguntas). **No:** un archivo nuevo con su año, que repite la preparación y suma unos 40 s contra Aiven.
- **Sí:** ningún campo nuevo en `ResultadoIndicador`; la pantalla deduce las dosis finales como `denominador − numerador` (decidido al escribir el spec). **No:** agregar `dosisInicial` o las dosis finales al contrato, que repite lo que ya se puede leer.
- **Sí:** la departamental es no calculable solo si la suma de iniciales es 0 (decidido al escribir el spec): a diferencia de la cobertura, no depende de que todos los municipios tengan población.
- **No:** gráficas ni mapa de deserción; quedan para HU-41 y HU-42 (decidido en la fase de preguntas).

Decididas al implementar:

- **Sí:** en la preparación de `corridas.test.js`, `ZVT_HU36_DES` lleva el semáforo descendente de `DES_HEXA1_3` (verde hasta 10, rojo después); antes heredaba el ascendente de cobertura. Para el municipio con valor negativo se agregó una sola celda (D1 = 4 de San Pedro en el reporte cerrado de marzo), que solo cuenta con corte a marzo y no cambia lo que esperan las otras pruebas, que miran la D2 (paso 4).
- **Sí:** además de `corridas.test.js`, se corrieron `cierrePeriodo.test.js` y `resolverRectificacion.test.js`, las otras dos que crean corridas (cierre del mes y rectificación aplicada): ahora también calculan `DES_HEXA1_3` de la semilla. Pasan y no dejan corridas de sus años (paso 4).
- **Sí:** la columna «Meta» muestra el comparador del tipo (`TIPOS_INDICADOR.DESERCION.meta.comparador`, «≤»), porque la configuración no lo edita y `ResultadoIndicador` no lo trae (paso 5).
- **Sí, por ahora:** `TablaDesercion.jsx` importa `InsigniaValor` de `PaginaIndicadores.jsx`, que a su vez importa `TablaDesercion`. La importación circular funciona porque solo se usa al dibujar. Si llega a molestar (por ejemplo, con la recarga en caliente de Vite) o la necesita otra tabla, conviene mover `InsigniaValor` y `CLASES_COLOR` a su propio archivo en otro spec (paso 5).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un valor negativo se lee como «muy bueno» | La pantalla lo marca como «Deserción negativa» y explica qué significa. |
| Con datos agregados, la deserción no sigue a las mismas personas entre dosis | Es la tasa administrativa que usa la DDRISS; el seguimiento de cohortes queda fuera porque el sistema no guarda datos de pacientes. |
| Adaptar `referenciasDe` rompe los tipos de una dosis | Las pruebas de cobertura, avance y brecha de `corridas.test.js` se corren sin cambios en el paso 3. |
| Ampliar `corridas.test.js` cambia los resultados que esperan sus otras pruebas | Solo se agregan celdas si hacen falta para el caso negativo, en un municipio o una dosis que esas pruebas no miran. |

## Lo que **no** entra en este spec

- Gráficas, mapa y dashboard (HU-40 a HU-42).
- Proyección (HU-39).
- Alertas por deserción (HU-51).
- Seguimiento de cohortes.
- Cambios en la base, en los permisos o en la configuración de indicadores.

Cada uno, si se hace, va en su propio spec.
