# SPEC 47 — Proyectar la cobertura al cierre del año

> **Estado:** Implementado
> **Historia:** HU-39
> **Depende de:** SPEC 43, SPEC 44, SPEC 45 y SPEC 46
> **Fecha:** 2026-11-05
> **Objetivo:** Que la corrida de indicadores calcule los indicadores `PROYECCION` con el ritmo de los últimos meses cerrados, y que la pantalla «Indicadores» muestre, por municipio, la cobertura estimada a diciembre marcada como estimación y con la nota del método.

## Por qué existe este spec

El motor (SPEC 44 a 46) ya calcula `COBERTURA`, `AVANCE_META_MES`, `BRECHA` y `DESERCION`. Los indicadores `PROYECCION` (como `PROY_COB_HEXA3` de la semilla) todavía salen en `omitidos` con «Su cálculo todavía no está disponible.». Su método está en `parametros` (`indicador_base: "COB_HEXA3"`, `metodo: "PROMEDIO_MOVIL"`, `meses_ventana: 3`, `horizonte: "FIN_DE_ANIO"`), y el SPEC 43 dejó a esta historia la tarea de definirlo.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- «Promedio mensual de dosis» es el promedio de los últimos `meses_ventana` meses **cerrados** hasta el corte, no el de enero al corte. Así lo dicen la semilla (`PROMEDIO_MOVIL`, 3 meses) y la nota de `Indicadores.html` («el ritmo de los últimos 3 meses»).
- La vacuna, la dosis, el filtro de dimensiones y el grupo de población salen del **indicador base**, no del `aplica_a` de la proyección. `PROY_COB_HEXA3` no tiene `filtros_dimension`, y sin el filtro contaría las D3 de todas las edades, no las mismas que `COB_HEXA3`.
- «Se guarda como resultado de tipo estimación»: filas de `resultado_indicador` con `es_proyeccion = TRUE`, en el mes de corte de la corrida.
- «Se recalcula al cerrar cada periodo» ya ocurre: el cierre del mes crea una corrida `CIERRE_PERIODO` (SPEC 44), que ahora también calcula las proyecciones.
- La banda de «rango probable» del mockup no se calcula: `resultado_indicador` no tiene dónde guardarla y el método lineal no la define.

## Alcance

**Entra:**

- `PROYECCION` en `CALCULADORES` (`modulos/indicadores/calculadores.js`), con su función `calcularProyeccion`.
- `motor.service.js`: los numeradores por mes, los meses cerrados de la ventana y la resolución del indicador base.
- `corridas.service.js`: guarda `es_proyeccion` y, al leer, arma el campo `proyeccion` de las filas `PROYECCION`.
- Contrato: `ResultadoIndicador.proyeccion` y la descripción de las filas `PROYECCION`; `omitidos` ya no nombra `PROYECCION`.
- Pantalla «Indicadores»: tabla propia cuando el indicador elegido es `PROYECCION`, marcada como estimación y con la nota del método.
- Pruebas puras (`calculadores.test.js`), un archivo nuevo contra la base (`proyeccion.test.js`) y pruebas del frontend.
- Verificación manual con Playwright; avance de HU-39, nota en HU-41, `CONTEXTO BD.md` y `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- La gráfica «Avance acumulado y proyección al cierre del año» de `Indicadores.html` (línea real, línea punteada y meta proporcional): es de HU-41.
- La banda de rango probable.
- Una columna de proyección en la tabla del indicador base (`COB_HEXA3`): la proyección solo se ve al elegirla.
- Otros métodos (`metodo` distinto de `PROMEDIO_MOVIL`) u otros horizontes (`horizonte` distinto de `FIN_DE_ANIO`): se omiten con su motivo.
- Crear indicadores `PROYECCION` o editar su método desde «Configuración de indicadores» (SPEC 43 solo versiona nombre, descripción y meta).
- Alertas por proyección (HU-51), mapa (HU-42) y exportar a Excel o PDF.
- Cambios en `backend/db/`, en los permisos o en `tiposIndicador.js`.

## Modelo de datos

Este spec no cambia la base de datos ni las colecciones. Reutiliza `resultado_indicador` (con `es_proyeccion`, que hasta ahora siempre era `FALSE`) y `configuracion_indicadores` como los dejaron los SPEC 43 a 46.

### El método (al calcular)

`CALCULADORES.PROYECCION = calcularProyeccion`. Con la versión de la proyección que aplica y sus `parametros`:

- **Indicador base:** la versión de `parametros.indicador_base` que la misma corrida calcula. Debe ser de un tipo de una dosis con población (`COBERTURA`, `AVANCE_META_MES` o `BRECHA`). De ella salen la vacuna, la dosis, `filtros_dimension` y `clasificacion_poblacion`. Su prorrateo y su meta no se usan.
- **Se omite**, con su motivo en `omitidos` y sin hacer fallar la corrida, si:
  - el indicador base no aplica a la DDRISS: «El indicador base COB_HEXA3 no aplica a la DDRISS.»;
  - la base es de otro tipo: «El indicador base COB_HEXA3 no es de cobertura, avance ni brecha.»;
  - la base se omitió: el mismo motivo de la base;
  - `metodo` no es `PROMEDIO_MOVIL` u `horizonte` no es `FIN_DE_ANIO`: «El método {metodo} hasta {horizonte} no está disponible.»;
  - `meses_ventana` no es un entero de 1 a 12: «La ventana de meses debe ser un número de 1 a 12.».
- **Meses de la ventana:** los últimos `meses_ventana` meses de enero al corte que estaban `CERRADO` en la DDRISS al calcular (`cierre_periodo`, como `mesesSinCerrar`). Un mes sin cerrar no entra, así que no baja el ritmo con un 0. Si hay menos, se usan los que haya.
- **Por municipio:**
  - acumulado = las dosis de enero al corte, con la regla de siempre (reportes `CERRADO`, procedencia del departamento, filtro de la base); es el mismo numerador del indicador base;
  - ritmo = las dosis de los meses de la ventana ÷ la cantidad de meses de la ventana;
  - dosis proyectadas = acumulado + ritmo × (12 − mes de corte).

| Columna | Valor |
|---|---|
| `es_proyeccion` | `TRUE` |
| `mes` | el mes de corte de la corrida |
| `numerador` | las dosis proyectadas a diciembre, a 2 decimales |
| `denominador` | la población anual del grupo de la base (sin prorrateo) |
| `valor` | numerador ÷ denominador × 100, a 4 decimales |
| `meta` | `meta.valor` de la proyección (95 por defecto) |
| `brecha_dosis` | las dosis que faltarían en diciembre: máx(0, ⌈meta ÷ 100 × denominador − numerador⌉) |
| `cumple_meta` | `valor` contra la meta con el `comparador` de la proyección (`>` por defecto): «llega a la meta» |
| `vacuna_id`, `dosis_id`, `filtro_dimensiones` | los de la base |
| `indicador_codigo`, `indicador_version` | los de la proyección |

- **No calculable:**
  - sin población: `numerador` con las dosis proyectadas y lo demás en `NULL`, como la cobertura;
  - sin meses cerrados en la ventana: `numerador`, `valor`, `meta`, `brecha_dosis` y `cumple_meta` en `NULL`, y `denominador` con la población.
- **Departamental** (`municipio_id` NULL): con la suma de las dosis proyectadas y de las poblaciones de los municipios. No calculable si a un municipio le falta la población o si no hay meses cerrados.
- **Corte en diciembre:** quedan 0 meses, así que las dosis proyectadas son el acumulado.
- **Sin semáforo:** `PROYECCION` no tiene `umbrales`, así que `color` sale `null`.

Ejemplo: corte a abril, acumulado 100 (10, 20, 30 y 40 por mes), ventana de 3 meses (febrero a abril) → ritmo 30, dosis proyectadas 100 + 30 × 8 = 340; con población 400, `valor` 85, `brecha_dosis` ⌈380 − 340⌉ = 40 y `cumple_meta` FALSE.

### Lectura (`GET /indicadores/resultados`)

`ResultadoIndicador` agrega `proyeccion`: `null` en todos los tipos menos `PROYECCION`. En una fila `PROYECCION`:

```json
{
  "indicadorCodigo": "PROY_COB_HEXA3", "tipoCalculo": "PROYECCION", "esProyeccion": true,
  "mes": 4, "numerador": 340, "denominador": 400, "valor": 85, "meta": 95, "brechaDosis": 40, "cumpleMeta": false,
  "proyeccion": {
    "indicadorBase": "ZVT_HU39_COB",
    "mesesVentana": 3,
    "mesesUsados": [2, 3, 4],
    "dosisAcumuladas": 100,
    "ritmoMensual": 30
  }
}
```

- `indicadorBase` y `mesesVentana` salen de los `parametros` de la versión usada.
- `mesesUsados`: los meses de la ventana, calculados con los meses cerrados al iniciar la corrida (los mismos de `mesesSinCerrar`). Vacío si no hubo meses cerrados.
- `dosisAcumuladas`: el `numerador` de la fila del indicador base en la misma corrida y el mismo municipio.
- `ritmoMensual`: (`numerador` − `dosisAcumuladas`) ÷ (12 − `mes`), a 2 decimales. `null` con corte en diciembre o si la fila no tiene `numerador`.
- Se leen aunque la consulta filtre por `indicador` o por `municipioId`: `leerResultados` busca las filas de la base que hagan falta.
- `metaDosis` y `excedenteDosis` se calculan igual que en los otros tipos; la tabla de proyección no los muestra.

### Frontend

- `paginas/indicadores/PaginaIndicadores.jsx`: si el indicador elegido es `PROYECCION`, muestra `TablaProyeccion`; el título sale de la `etiqueta` del tipo («Proyección al cierre del año»). El indicador por defecto sigue siendo el primer avance.
- `paginas/indicadores/TablaProyeccion.jsx` (nuevo):
  - Junto al título de la tabla, la insignia «Estimación» (`Badge` de shadcn).
  - Columnas: Municipio · Dosis acumuladas · Ritmo mensual · Dosis proyectadas a diciembre · Población · Cobertura proyectada · Meta («> 95 %») · ¿Llega a la meta? · Dosis que faltarían.
  - Las columnas estimadas (ritmo, dosis proyectadas, cobertura proyectada, llega y faltarían) van sobre fondo gris claro (`bg-muted`), y las dosis acumuladas, que son dato real, sin fondo. Nada de colores escritos a mano.
  - Las dosis se muestran como enteros (redondeadas) y la cobertura con un decimal.
  - Fila «Total de la DDRISS» arriba y en negrita.
  - Municipios de menor a mayor cobertura proyectada (primero los que no llegarán), y por nombre si empatan; los no calculables al final, con «Sin población» (sin `denominador`) o «Sin meses cerrados» (`mesesUsados` vacío).
  - Debajo de la tabla, la nota del método, siempre visible: «La proyección suma a las dosis acumuladas el promedio de los últimos {n} meses cerrados ({meses}) por cada mes que falta hasta diciembre. Es una estimación, no un dato registrado.». Si se usaron menos meses que `mesesVentana`, lo dice («solo hay {k} meses cerrados»). Con corte en diciembre, dice que la proyección es el dato real del año.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                 ← ResultadoIndicador.proyeccion; filas PROYECCION; omitidos
├── src/modulos/indicadores/calculadores.js      ← calcularProyeccion y PROYECCION en CALCULADORES
├── src/modulos/indicadores/motor.service.js     ← numeradores por mes, meses cerrados, indicador base
├── src/modulos/indicadores/corridas.service.js  ← es_proyeccion al guardar; proyeccion al leer
└── tests/
    ├── calculadores.test.js                     ← casos de PROYECCION
    ├── proyeccion.test.js                       ← nuevo (año 2003, ZVT_HU39*)
    └── cierrePeriodo.test.js                    ← la corrida del cierre calcula PROY_COB_HEXA3
frontend/src/paginas/indicadores/
├── PaginaIndicadores.jsx (+ .test)              ← TablaProyeccion
└── TablaProyeccion.jsx (+ .test)                ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md, docs/base-de-datos/CONTEXTO BD.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** `proyeccion` en `ResultadoIndicador` (sus cinco campos, cuándo es `null`), la descripción de `numerador`, `denominador`, `brechaDosis`, `cumpleMeta` y `esProyeccion` en una fila `PROYECCION`, y `omitidos` sin `PROYECCION` (con los motivos nuevos). Comprobación: `/api/docs` carga.
2. **Calculador puro.** `calcularProyeccion` en `calculadores.js` y `PROYECCION` en `CALCULADORES`. Recibe los mapas por municipio del acumulado y de las dosis de la ventana, la cantidad de meses de la ventana, las poblaciones y el mes de corte, y devuelve filas con `esProyeccion: true`. Casos en `calculadores.test.js`:
   - el ejemplo de este spec (acumulado 100, ritmo 30, corte a abril, población 400): `numerador` 340, `valor` 85, `brecha_dosis` 40, no cumple;
   - con un ritmo que pasa la meta: `brecha_dosis` 0 y cumple;
   - corte en diciembre: dosis proyectadas = acumulado;
   - sin meses en la ventana: no calculable, sin error;
   - sin población: no calculable, y tampoco la departamental;
   - la departamental suma las dosis proyectadas y las poblaciones.
   Comprobación: la prueba pasa.
3. **Motor.** En `motor.service.js`:
   - las consultas de numeradores (`totales`, `porValor` y `varias`) agrupan también por `vp.mes`, y `dosisPorMunicipio` suma los meses que se le piden (todos por defecto), de modo que los otros tipos reciben lo mismo que antes;
   - `leerDatos` devuelve también los meses cerrados (hoy solo `mesesSinCerrar`);
   - `calcularIndicadores` calcula las proyecciones al final, con la versión base de la misma lista y sus referencias, y las omite con los motivos de la sección anterior.
   Comprobación: `calculadores.test.js` y `corridas.test.js` pasan sin cambios en sus expectativas (`corridas.test.js` no tiene indicadores `PROYECCION`).
4. **Guardar y leer.** En `corridas.service.js`, `insertarResultados` guarda `es_proyeccion` de cada fila, y `leerResultados` arma `proyeccion` (los `parametros` de la versión usada, los meses de la ventana con los meses cerrados al iniciar la corrida y la fila base del mismo municipio). Comprobación: `corridas.test.js` pasa.
5. **Pruebas contra la base.** `proyeccion.test.js`, nuevo, con el año 2003: enero a abril `CERRADO`, mayo `ABIERTO` con fecha límite `'2099-12-31'`, la vacuna `ZVT_HU39` con reportes `CERRADO` de enero a abril y uno de mayo sin cerrar, la población de 2003 y, en MongoDB, `ZVT_HU39_COB` (cobertura) y `ZVT_HU39_PROY` (base `ZVT_HU39_COB`, ventana 3) de `DDRISS_SM`, más una proyección con una base que no existe y otra con un método que no está disponible. Todo por SQL y MongoDB, como `corridas.test.js`. Casos:
   - con corte a abril, las filas de `ZVT_HU39_PROY` dan las dosis proyectadas, la cobertura, la brecha y `cumpleMeta` esperados, con `es_proyeccion` TRUE en la base;
   - con corte a mayo (mes abierto, corrida parcial), la ventana sigue siendo febrero a abril y mayo no cuenta como 0;
   - con corte a febrero, la ventana tiene solo dos meses;
   - `GET /indicadores/resultados` con `indicador=ZVT_HU39_PROY` trae `proyeccion` con `mesesUsados`, `dosisAcumuladas` y `ritmoMensual`, y con `municipioId` también;
   - las filas de `ZVT_HU39_COB` traen `proyeccion` `null` y `esProyeccion` `false`;
   - las dos proyecciones inválidas salen en `omitidos` con su motivo y la corrida queda `COMPLETADA`.
   La limpieza (al inicio y al final) borra los `resultado_indicador` de la vacuna `ZVT_HU39` de cualquier corrida antes que la vacuna (otra prueba puede calcularla), las corridas de 2003 y sus resultados antes que los meses, y todo código de MongoDB que empiece con `ZVT_HU39`. Comprobación: la prueba pasa y no quedan datos `ZVT_HU39…` ni del año 2003.
6. **Recalcular al cerrar.** En `cierrePeriodo.test.js`, la corrida que crea el cierre lista `PROY_COB_HEXA3` entre los indicadores calculados y no en `omitidos`. Comprobación: `cierrePeriodo.test.js` pasa.
7. **Frontend.** `TablaProyeccion.jsx` y el cambio de `PaginaIndicadores.jsx`. Pruebas (con `vi.mock`):
   - con un indicador `PROYECCION`, el título «Proyección al cierre del año», la insignia «Estimación», las columnas y el orden de menor a mayor cobertura proyectada;
   - la nota del método con los meses usados, con el aviso de menos meses y con el texto de corte en diciembre;
   - «Sin población» y «Sin meses cerrados» al final;
   - con otro tipo, su tabla de siempre.
   Comprobación: `npm test` del frontend pasa completo.
8. **Verificación manual y documentación.** Con Playwright, como `epidemiologia`: calcular agosto de 2026, elegir `PROY_COB_HEXA3` y comparar San Marcos y otros dos municipios con una cuenta por SQL (las D3 de menores de 1 año de junio, julio y agosto en `v_produccion_atribuida`). Calcular septiembre (`EN_CIERRE`, parcial) y revisar que la ventana siga siendo junio a agosto. Revisar por SQL que las filas tengan `es_proyeccion` TRUE y que la bitácora de la corrida ya no liste `PROY_COB_HEXA3` en `omitidos`. Como `autoridad.nacional`, la tabla se ve en solo lectura. Documentación: avance y criterios de HU-39; nota en HU-41 (la línea punteada puede leer `numerador`, `denominador` y `proyeccion.ritmoMensual`: el punto del mes k es acumulado + ritmo × (k − corte)); `CONTEXTO BD.md` (`PROYECCION` y qué guarda cada columna); nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `proyeccion` en `ResultadoIndicador` y las filas `PROYECCION`, y `/api/docs` carga.
- [ ] No cambian `backend/db/`, los permisos, `tiposIndicador.js` ni los `package.json`.
- [ ] Una corrida calcula los indicadores `PROYECCION` que aplican a la DDRISS y ya no los pone en `omitidos` con «Su cálculo todavía no está disponible.».
- [ ] Las filas de una proyección se guardan con `es_proyeccion = TRUE` y la vacuna, la dosis y el filtro de su indicador base.
- [ ] Las dosis proyectadas son el acumulado más el promedio de los últimos `meses_ventana` meses cerrados por cada mes que falta hasta diciembre, y un mes sin cerrar no entra en la ventana.
- [ ] El ejemplo de este spec (acumulado 100, ritmo 30, corte a abril, población 400) da 340 dosis, 85 %, brecha 40 y no cumple, en `calculadores.test.js`.
- [ ] Sin meses cerrados en la ventana o sin población, la fila queda no calculable y la corrida no falla.
- [ ] Una proyección cuya base no aplica, cuya base es de otro tipo o con un método que no está disponible sale en `omitidos` con su motivo, y la corrida queda `COMPLETADA`.
- [ ] Cerrar un mes crea una corrida que calcula `PROY_COB_HEXA3`.
- [ ] `GET /indicadores/resultados` trae en cada fila `PROYECCION` el campo `proyeccion` con `indicadorBase`, `mesesVentana`, `mesesUsados`, `dosisAcumuladas` y `ritmoMensual`, y `null` en los demás tipos.
- [ ] Con un indicador `PROYECCION` elegido, la pantalla muestra «Proyección al cierre del año» con la insignia «Estimación», las columnas estimadas sobre fondo gris, los municipios de menor a mayor cobertura proyectada y los no calculables al final.
- [ ] La nota del método se ve siempre debajo de la tabla, con los meses usados.
- [ ] `calculadores.test.js`, `corridas.test.js`, `proyeccion.test.js` y `cierrePeriodo.test.js` pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar pruebas, y no quedan datos `ZVT_HU39…` ni del año 2003.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [ ] HU-39 tiene su avance y sus criterios, HU-41 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están al día.

## Decisiones

- **Sí:** la vacuna, la dosis, el filtro y la población salen del indicador base que calcula la misma corrida; si la base no aplica o se omite, la proyección se omite (decidido en la fase de preguntas). **No:** el `aplica_a` propio, que en la semilla no tiene filtro de edad y no cuenta las mismas dosis que `COB_HEXA3`.
- **Sí:** el ritmo es el promedio de los últimos `meses_ventana` meses cerrados hasta el corte (decidido en la fase de preguntas). **No:** los últimos meses del calendario, donde un mes sin cerrar cuenta 0 y baja la proyección; **no:** el promedio desde enero, que deja sin uso `meses_ventana`.
- **Sí:** se guarda como la cobertura a diciembre, con `mes` = el mes de corte y `es_proyeccion` TRUE (decidido en la fase de preguntas). **No:** `mes` = 12, que saca la fila del mes de la corrida y obliga a leerla aparte.
- **Sí:** la cobertura proyectada se mide contra la población anual, sin prorrateo (decidido al escribir el spec): el horizonte es diciembre, donde el prorrateo lineal ya es la población entera. Es el `prorrateo: NINGUNO` de la semilla.
- **Sí:** el acumulado y el ritmo no se guardan; la API los arma al leer desde la fila base y el `numerador` de la proyección (decidido al escribir el spec), como el excedente del SPEC 45. **No:** columnas nuevas en `resultado_indicador`, que tocan `backend/db/`.
- **Sí:** sin meses cerrados en la ventana, filas no calculables (decidido en la fase de preguntas). **No:** omitir la proyección, que la esconde de la pantalla en ese mes.
- **Sí:** tabla propia para `PROYECCION`, que solo se ve al elegirla, con la insignia «Estimación» y la nota del método (decidido en la fase de preguntas). **No:** una columna en la tabla de la cobertura; **no:** la gráfica de líneas, que es de HU-41; **no:** solo backend, que no cumple la nota visible.
- **Sí:** las consultas de numeradores agrupan también por mes, en el mismo viaje a Aiven (decidido al escribir el spec). **No:** una consulta aparte para la ventana, que repite el filtro de dimensiones y suma un viaje.
- **Sí:** las pruebas contra la base van en un archivo nuevo, `proyeccion.test.js`, con el año 2003 y la vacuna `ZVT_HU39` (decidido en la fase de preguntas). **No:** ampliar `corridas.test.js`. El año 2004 no se usa porque `corridas.test.js` lo toma como mes fuera del calendario.
- **No:** la banda de rango probable del mockup (decidido en la fase de preguntas, con la gráfica): no hay dónde guardarla y el método lineal no la define.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Agrupar los numeradores por mes cambia lo que reciben cobertura, avance, brecha y deserción | `dosisPorMunicipio` suma todos los meses por defecto; `corridas.test.js` se corre sin cambios en sus expectativas en el paso 3. |
| La proyección se lee como un dato real | Insignia «Estimación», columnas estimadas sobre fondo gris y la nota del método siempre visible. |
| Con pocos meses cerrados (enero o febrero), el ritmo es poco confiable | La nota dice cuántos meses se usaron. |
| Una corrida de otro archivo calcula `ZVT_HU39_*` y deja filas que impiden borrar la vacuna | La limpieza borra los `resultado_indicador` de la vacuna `ZVT_HU39` de cualquier corrida antes que la vacuna (nota del SPEC 44). |
| La población cargada es de ejemplo | Los resultados dependen de ella; se avisa en la verificación manual. |

## Lo que **no** entra en este spec

- La gráfica de avance y proyección, y la banda de rango probable (HU-41).
- La proyección en la tabla de la cobertura o en el mapa (HU-42).
- Otros métodos u horizontes de proyección.
- Crear proyecciones o editar su método desde la configuración.
- Alertas por proyección (HU-51).
- Cambios en la base, en los permisos o en `tiposIndicador.js`.

Cada uno, si se hace, va en su propio spec.
