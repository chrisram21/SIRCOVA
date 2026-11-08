# SPEC 49 — Gráficas y filtros de la pantalla «Indicadores»

> **Estado:** Implementado
> **Historia:** HU-41
> **Depende de:** SPEC 13, SPEC 44, SPEC 45, SPEC 46 y SPEC 47
> **Fecha:** 2026-11-05
> **Objetivo:** Que la pantalla «Indicadores» muestre, sobre la tabla que ya tiene, un panel con las gráficas de `Indicadores.html` (avance acumulado y proyección, cobertura por vacuna, cobertura por municipio, brecha y deserción) y los filtros por vacuna, distrito y municipios, con un endpoint nuevo que da la serie mensual de un indicador.

## Por qué existe este spec

«Indicadores» (`paginas/indicadores/PaginaIndicadores.jsx`) ya tiene su versión de tablas (SPEC 44 a 47): año, mes de corte, indicador y DDRISS en la URL, la corrida vigente del mes y una tabla por tipo (`TablaResultados`, `TablaBrecha`, `TablaDesercion` y `TablaProyeccion`). Le faltan las gráficas y los filtros de vacuna, distrito y municipios que pide HU-41.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- **«Rango de meses»:** los resultados se guardan acumulados de enero al mes de corte, uno por corrida. El rango es de enero al corte que ya se elige. La tabla y las barras muestran el acumulado al corte, y la línea de avance dibuja un punto por mes, con la corrida vigente de cada mes. No se calcula un rango arbitrario (por ejemplo, de marzo a agosto).
- **Distrito:** cada municipio de la semilla tiene un solo distrito, y la cobertura por distrito (bloque E del modelo) sigue en pausa. Elegir un distrito deja solo sus municipios en las gráficas y la tabla, sin fila ni cálculo propio del distrito.
- **Panel:** cada gráfica toma el indicador de su tipo de la vacuna elegida, así que el panel no depende del selector «Indicador». Ese selector sigue eligiendo la tabla de abajo.
- **Fuera del mockup:** los botones «Exportar Excel» y «PDF», «Agrupar por» (sexo o edad), «Nivel», «Atribución» y la banda de rango probable de la proyección.

## Alcance

**Entra:**

- Endpoint `GET /indicadores/serie`, de solo lectura y con `INDICADOR_CONSULTAR`, con su contrato.
- `DISTRITO_CONSULTAR` para EPIDEMIOLOGIA y AUTORIDAD en `05_permisos_mysql.sql` (zona protegida: se confirma antes de editarlo).
- Componente Chart de shadcn (`npx shadcn add chart` en `frontend/`), que crea `components/ui/chart.jsx` y agrega `recharts` al `package.json` del frontend (autorizado en la fase de preguntas).
- Filtros nuevos en la URL: vacuna, distrito y municipios (varios).
- Panel de cinco gráficas sobre la tabla:
  - avance acumulado y proyección;
  - cobertura por vacuna;
  - cobertura por municipio;
  - brecha a la meta;
  - deserción.
- La tabla del indicador elegido queda filtrada por los municipios visibles.
- Pruebas del backend (`serie.test.js`) y del frontend (funciones puras del panel y la pantalla).
- Verificación manual con Playwright. Avance de HU-41, nota en HU-42, HU-45 y HU-47, y nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Exportar a Excel o PDF desde «Indicadores»: HU-45, HU-47 y HU-48.
- Agrupar por sexo o por edad: el motor no guarda resultados por sexo y habría que calcularlos aparte.
- Los selectores «Nivel» (Departamento, Distrito, Municipio) y «Atribución»: hoy solo existe la atribución por procedencia, y el nivel lo dan los filtros.
- Indicadores calculados por distrito o para un rango de meses que no empiece en enero.
- La banda de rango probable de la proyección (el SPEC 47 no la calcula).
- El mapa territorial (HU-42).
- Gráficas en el Inicio (SPEC 48: solo tarjetas).
- Cambios en `backend/db/` fuera del 05, en `transicion_estado` o en el `package.json` del backend.

## Modelo de datos

Este spec no cambia tablas ni colecciones. Agrega una asignación de permiso en el 05 y un endpoint de solo lectura.

### Permiso

```sql
-- SPEC 49 (HU-41): Epidemiología y la Autoridad filtran «Indicadores» por distrito
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('EPIDEMIOLOGIA', 'AUTORIDAD')
   AND p.codigo = 'DISTRITO_CONSULTAR';
```

Con este permiso no aparece «Territorio» en el menú: ese hijo de «Administración» pide también `DDRISS_CONSULTAR` y `MUNICIPIO_CONSULTAR` (Epidemiología no los tiene) y `CONFIGURACION_CONSULTAR` (la Autoridad no lo tiene). El Revisor y el Administrador también ven «Indicadores». El Revisor no recibe el permiso, así que no ve el filtro de distrito; el Administrador ya lo tenía.

### `GET /indicadores/serie`

Ruta en `indicadores.routes.js` con `autenticar` + `requierePermiso('INDICADOR_CONSULTAR')`. Función `serieDelIndicador` en `corridas.service.js`.

**Parámetros:**

- `anio` (obligatorio, 2000 a 2100).
- `indicador` (obligatorio, mismo formato que en `/resultados`).
- `municipioId` (opcional).
- `ddrissId` (`DdrissIdAutoridad`).

Un parámetro que falta, que no es válido, que es desconocido o que está repetido responde 400 `ENTRADA_INVALIDA`.

**Qué devuelve:**

- Por cada mes del año con una corrida vigente `COMPLETADA` de la DDRISS (la misma consulta de `resultadosVigentes`, para los 12 meses a la vez), la fila del indicador:
  - sin `municipioId`, la fila departamental;
  - con `municipioId`, la de ese municipio.
- Las filas se leen con `leerResultados(corridaId, { indicador, municipioId })`, en paralelo por el pool, así que traen los mismos campos que en `/resultados` (`color`, `calculable`, `metaDosis`, `proyeccion`…).
- Un mes sin corrida, o cuya corrida no tiene ese indicador, no aparece.
- Los puntos van de enero a diciembre.
- `parcial` sigue la misma regla de `leerCorrida`.
- No escribe nada ni deja bitácora.

```json
{
  "puntos": [
    { "mes": 1, "corridaId": 210, "parcial": false, "resultado": { "indicadorCodigo": "COB_HEXA3", "municipio": null, "valor": 6.4, "meta": 95, "color": "rojo", "calculable": true } },
    { "mes": 2, "corridaId": 214, "parcial": false, "resultado": { "indicadorCodigo": "COB_HEXA3", "municipio": null, "valor": 13.3, "meta": 95, "color": "rojo", "calculable": true } }
  ]
}
```

(`resultado` es un `ResultadoIndicador` completo; arriba se recorta.)

### Filtros (frontend, en la URL)

| Parámetro | Qué es | Por defecto |
|---|---|---|
| `anio`, `mes`, `ddriss`, `indicador` | Como hoy | Como hoy |
| `vacuna` | Código de una vacuna con resultados en la corrida (`vacuna.codigo`: los resultados no traen su id, y un código de catálogo no se renombra) | La del indicador de la URL; si no hay, la del primer `AVANCE_META_MES`; si no hay, la del primer indicador |
| `distrito` | Id de un distrito de `GET /distritos` | Ninguno |
| `municipios` | Ids separados por coma (`1,4,7`) | Ninguno (todos) |

- Un valor que no existe en los datos cargados se ignora, como el `indicador` de hoy.
- Cambiar la DDRISS borra `vacuna`, `indicador`, `distrito` y `municipios`.
- Cambiar la vacuna borra `indicador`.
- Cambiar el distrito borra `municipios`.

**Vacuna** (`Select`): las vacunas de los indicadores con resultados en la corrida (`vacuna.nombre`). El selector «Indicador» y todo el panel usan solo los indicadores de esa vacuna, salvo «Cobertura por vacuna», que muestra todas y resalta la elegida.

**Distrito** (`Select` con «Todos»): se muestra solo con `DISTRITO_CONSULTAR`. Ofrece los distritos de `listarDistritos({ activo: true })` cuyo municipio está en los resultados de la corrida, así que solo salen los de la DDRISS.

**Municipios** (`DropdownMenu` con `DropdownMenuCheckboxItem`, ya instalado): el botón dice «Todos ({n})» o «{k} municipios». Ofrece los municipios de los resultados (los del distrito, si hay uno) y tiene la acción «Todos» para vaciar la selección.

**Municipios visibles:**

- Son los de la corrida, primero recortados al distrito (si lo hay) y luego a los elegidos (si los hay).
- Las barras y la tabla solo muestran los municipios visibles.
- La fila departamental sigue siendo la de la DDRISS y conserva el rótulo «Total de la DDRISS».

### Panel de gráficas

Todo se arma en `paginas/indicadores/panelIndicadores.js` (nuevo, funciones puras). Las gráficas usan `ChartContainer`, `ChartTooltip` y `ChartTooltipContent` de shadcn. Los colores salen de las variables del tema (`--chart-*`, `--muted` y las nuevas `--semaforo-verde`, `--semaforo-amarillo` y `--semaforo-rojo` de `index.css`, en tonos suaves), nunca escritos a mano. `--exito` y `--advertencia` son fondos de mensajes casi blancos y no sirven como relleno (decidido al implementar el paso 7). El semáforo pinta las barras según el mismo `color` del resultado que usa `InsigniaValor`.

**Indicadores del panel.** `indicadoresDelPanel(indicadores, resultados, vacunaId, codigoElegido)` elige, entre los de la vacuna:

- `cobertura`: el elegido si es `COBERTURA` o `AVANCE_META_MES`; si no, el primer `AVANCE_META_MES`; si no, el primer `COBERTURA`;
- `brecha`, `desercion` y `proyeccion`: el primero de su tipo;
- `base` (para la línea): el `proyeccion.indicadorBase` de las filas del primer `PROYECCION`, si la corrida lo calculó; si no, el primer `COBERTURA`.

**Fila de referencia.** Si hay un solo municipio visible, las gráficas de un solo valor (la línea y la cobertura por vacuna) usan la fila de ese municipio. Con todos o con varios, usan la departamental. El subtítulo dice cuál («Total de la DDRISS» o el municipio).

**Primera fila** (2/3 y 1/3 del ancho en escritorio, una columna en el teléfono):

1. **«Avance acumulado y proyección al cierre del año»** (`GraficaAvanceProyeccion.jsx`), líneas de Recharts, eje X de enero a diciembre y eje Y en porcentaje (de 0 a 100, o hasta el mayor valor si lo pasa):
   - Pregunta en el subtítulo: «¿Llegaremos al {meta} % en diciembre?».
   - **Real** (línea sólida): de enero al mes de corte, con los puntos de `GET /indicadores/serie` del indicador `base`. Con una proyección calculable, cada punto es su `numerador` ÷ el `denominador` de la fila `PROYECCION` (la población anual) × 100; sin ella, el `valor` del indicador base. Un punto `parcial` lleva un marcador hueco, y el tooltip dice «Parcial».
   - **Proyección** (línea punteada, `strokeDasharray`): solo si hay `proyeccion` y la fila de referencia es calculable. Usa la fila `PROYECCION` del mismo municipio (o la departamental) en la corrida vigente. Para cada mes k después del corte, el valor es (`proyeccion.dosisAcumuladas` + `proyeccion.ritmoMensual` × (k − mes)) ÷ `denominador` × 100. En diciembre es el `valor` de la fila. La línea empieza en el punto real del corte.
   - La zona proyectada lleva un `ReferenceArea` con `--muted` y la etiqueta «Estimación».
   - **Meta proporcional** (línea gris): con una proyección calculable, la meta de la proyección × k ÷ 12 (y la pregunta del subtítulo usa esa meta). Sin ella, una línea horizontal en la meta del indicador base.
   - Sin `base` o sin puntos: «La corrida no tiene un indicador de cobertura de {vacuna}.».
2. **«Cobertura por vacuna»** (`GraficaPorVacuna.jsx`), barras verticales:
   - Una barra por indicador de la corrida del mismo tipo que `cobertura` (de todas las vacunas), con la fila de referencia de cada uno.
   - Van de mayor a menor y la etiqueta es el `nombre` del indicador.
   - La barra de la vacuna elegida va resaltada (`--chart-1`) y las demás con `--chart-2`.
   - Si todas tienen la misma `meta`, se dibuja la línea de meta (`ReferenceLine`). Si no, la meta va en el tooltip.
   - Las no calculables no se dibujan y se nombran debajo («Sin población: …»).

**Segunda fila** (dos columnas en escritorio):

3. **«{Cobertura | Avance} por municipio»** (`GraficaPorMunicipio.jsx`), barras horizontales:
   - Una barra por municipio visible y calculable de `cobertura`, de mayor a menor (empates por nombre), con su color de semáforo.
   - Línea punteada de meta y, arriba, la leyenda de las tres franjas.
   - La altura crece con el número de municipios.
   - Los no calculables se nombran debajo.
4. Dos tarjetas apiladas:
   - **«Brecha a la meta»** (`GraficaBrecha.jsx`):
     - Los 8 municipios visibles con mayor `brechaDosis` (> 0) del indicador `brecha`.
     - En el título, el total: la suma de `brechaDosis` de los municipios visibles. Con todos, es igual a `sumaBrechasMunicipales`.
     - Sin brecha en ningún municipio: «Ningún municipio tiene dosis por aplicar para la meta.».
   - **«{nombre del indicador}»** (`GraficaDesercion.jsx`; el resultado solo trae la dosis final, así que el título es el `nombre` del indicador en `corrida.indicadores`, o su código si no tiene):
     - Los 8 municipios visibles calculables con mayor `valor` del indicador `desercion`.
     - Cada barra lleva el color de su semáforo y hay una `ReferenceLine` en la meta (el umbral).
     - El título lleva el valor de la fila de referencia.
     - Una deserción negativa se dibuja hacia la izquierda del 0.

Sin indicador de un tipo para la vacuna, la tarjeta dice «La corrida no tiene un indicador de {etiqueta del tipo} de {vacuna}.». Cada gráfica lleva un `aria-label` con su título y un texto con el dato principal, para leerla sin la imagen.

**Carga:**

- `listarResultados` y `listarCorridas` siguen en paralelo, y `listarDistritos` va en paralelo con ellos (solo con el permiso; la lista de distritos se pide con `consultarConCache` desde `api/catalogos.js`).
- `obtenerSerie` espera los resultados (necesita el código de `base`). Se vuelve a pedir al cambiar la vacuna, el indicador base o la fila de referencia.
- Mientras carga, el panel muestra `Skeleton`. Si falla, muestra su `AvisoError` con «Reintentar», y la tabla sigue visible.
- Sin corrida en el mes no hay panel: queda el mensaje de hoy.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← GET /indicadores/serie y su esquema SerieIndicador
├── db/05_permisos_mysql.sql                       ← DISTRITO_CONSULTAR para EPIDEMIOLOGIA y AUTORIDAD (zona protegida)
├── src/modulos/indicadores/corridas.service.js    ← serieDelIndicador
├── src/modulos/indicadores/indicadores.routes.js, indicadores.controller.js
└── tests/serie.test.js                            ← nuevo (año 2001)
frontend/
├── package.json, package-lock.json                ← recharts, con la CLI de shadcn
└── src/
    ├── components/ui/chart.jsx                    ← nuevo, de la CLI de shadcn
    ├── api/indicadores.js                         ← obtenerSerie
    └── paginas/indicadores/
        ├── PaginaIndicadores.jsx (+ .test)         ← filtros nuevos, panel, tabla filtrada
        ├── BarraFiltrosIndicadores.jsx             ← nuevo: los filtros (sale de PaginaIndicadores)
        ├── panelIndicadores.js (+ .test)           ← nuevo: indicadores del panel, municipios visibles, puntos de la línea
        ├── PanelGraficas.jsx                       ← nuevo: arma las dos filas
        ├── GraficaAvanceProyeccion.jsx, GraficaPorVacuna.jsx, GraficaPorMunicipio.jsx,
        │   GraficaBrecha.jsx, GraficaDesercion.jsx ← nuevos
        └── TarjetaGrafica.jsx, BarrasHorizontales.jsx ← nuevos al implementar: la tarjeta común y las barras
                                                         horizontales de municipio, brecha y deserción
    └── index.css                                  ← --semaforo-verde, --semaforo-amarillo, --semaforo-rojo
docs/SPECS/HISTORIAS_DE_USUARIO.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** En `openapi.yaml`, `GET /indicadores/serie` con `x-permiso: INDICADOR_CONSULTAR`, sus parámetros, el esquema `SerieIndicador` (con `resultado` → `ResultadoIndicador`) y los 400, 401 y 403. Comprobación: `/api/docs` carga.
2. **Permiso.** Confirmar con el equipo y agregar el bloque del modelo de datos al 05. Correr el 05 en la base de prueba con `mysql2`. Comprobación: el 05 corre dos veces sin error, y `rol_permiso` tiene `DISTRITO_CONSULTAR` para los dos roles.
3. **Endpoint.** `serieDelIndicador` en `corridas.service.js` (con `revisarParametros`, `ddrissDeLaConsulta` y las lecturas de `resultadosVigentes`), más el controlador y la ruta. Comprobación: `corridas.test.js` y `proyeccion.test.js` siguen pasando.
4. **Pruebas del backend.** `serie.test.js`, con el año 2001. Por SQL inserta corridas de la DDRISS 1 para enero, febrero y marzo, más una no vigente de febrero, y resultados de un código `ZVT_HU41_COB` (departamental y un municipio). Marzo no tiene ese código. Casos:
   - sin `municipioId`, devuelve los puntos departamentales de enero y febrero, en orden, solo de las corridas vigentes;
   - con `municipioId`, devuelve la fila del municipio;
   - marzo (sin el indicador) no aparece, y un año sin corridas devuelve `puntos: []`;
   - sin `indicador` o sin `anio`, o con un parámetro desconocido, responde 400;
   - la Autoridad nacional sin `ddrissId` recibe 400, y con él ve la DDRISS pedida;
   - el Personal (sin el permiso) recibe 403.
   La limpieza, al inicio y al final, borra `resultado_indicador` y luego `corrida_calculo` del año 2001. Comprobación: la prueba pasa.
5. **Chart.** `npx shadcn add chart` en `frontend/`. Comprobación: `npm test` del frontend sigue pasando y `npm run build` compila.
6. **Frontend: datos y filtros.**
   - `obtenerSerie` en `api/indicadores.js`.
   - `panelIndicadores.js` con `vacunasDeLaCorrida`, `indicadoresDelPanel`, `municipiosVisibles`, `filaDeReferencia`, `puntosDeLinea` (real, proyección y meta proporcional), `barrasPorVacuna`, `barrasPorMunicipio` y las de brecha y deserción (las 8 mayores).
   - `filtrosDeUrl` lee `vacuna`, `distrito` y `municipios`.
   - `BarraFiltrosIndicadores.jsx` con los selectores nuevos.
   - La tabla se filtra por los municipios visibles.
   - Pruebas puras en `panelIndicadores.test.js`: la elección de indicadores por vacuna, el distrito con los municipios elegidos, la proyección de septiembre a diciembre con la fórmula de HU-41, la meta proporcional de `COBERTURA` contra la plana de `AVANCE_META_MES`, el total de la brecha con y sin filtro, y la deserción negativa.
   Comprobación: la prueba pasa.
7. **Frontend: gráficas.** `PanelGraficas.jsx` y las cinco gráficas, con su estado de carga, su error y su vacío. Pruebas en `PaginaIndicadores.test.jsx` (con `vi.mock` de las API), que revisan títulos, textos y llamadas porque Recharts no dibuja en jsdom:
   - el panel aparece con su título y el dato principal de cada gráfica;
   - cambiar la vacuna cambia el selector «Indicador», borra `indicador` de la URL y pide la serie del nuevo `base`;
   - el distrito deja solo sus municipios en el menú y en la tabla, y sin `DISTRITO_CONSULTAR` no hay selector;
   - con un municipio elegido, `obtenerSerie` se pide con su `municipioId`;
   - sin indicador de un tipo, su tarjeta dice el mensaje;
   - un error en la serie muestra «Reintentar» sin ocultar la tabla.
   Comprobación: `npm test` del frontend pasa completo.
8. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas, entrar con `epidemiologia` y con `autoridad.nacional` en agosto de 2026:
   - comparar la línea real con las corridas vigentes de cada mes, y diciembre de la proyección con la tabla de `PROY_COB_HEXA3`;
   - comparar las barras con las tablas de cobertura, brecha y deserción;
   - comprobar el distrito y los municipios en la URL;
   - revisar el panel al ancho de un teléfono.
   Después, el avance y los criterios de HU-41, las notas en HU-42 (`panelIndicadores.js` sirve para la ficha del municipio) y en HU-45/HU-47 (los filtros de la URL), y la nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET /indicadores/serie` y `/api/docs` carga.
- [ ] `GET /indicadores/serie` devuelve, por mes, la fila del indicador de la corrida vigente (departamental o del municipio pedido), solo de los meses que la tienen y de la DDRISS del ámbito.
- [ ] EPIDEMIOLOGIA y AUTORIDAD tienen `DISTRITO_CONSULTAR`, el 05 sigue siendo idempotente y «Territorio» no aparece en su menú.
- [ ] Puedo filtrar por vacuna, distrito y uno o varios municipios, y los filtros quedan en la URL.
- [ ] El mes de corte define el rango (de enero al corte) de la tabla, las barras y la línea real.
- [ ] Veo cobertura, meta, brecha y deserción en tabla y gráfica.
- [ ] La línea de avance dibuja lo real con línea sólida y la proyección con línea punteada sobre la zona «Estimación», y diciembre coincide con la tabla de la proyección.
- [ ] Con un solo municipio visible, la línea y la cobertura por vacuna son las de ese municipio, y el subtítulo lo dice.
- [ ] Las barras por municipio, de brecha y de deserción respetan los municipios visibles y llevan el color del semáforo y la línea de meta o umbral.
- [ ] Cada gráfica sin datos o sin su indicador muestra un mensaje en lugar de quedar vacía, y un error en la serie no oculta la tabla.
- [ ] Las gráficas usan el componente Chart de shadcn y ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [ ] La pantalla no tiene desplazamiento horizontal al ancho de un teléfono (salvo dentro de las tablas, como hoy).
- [ ] `serie.test.js`, `corridas.test.js` y `proyeccion.test.js` pasan en `backend/`, `npm test` pasa en `frontend/` sin desactivar pruebas, y no quedan datos del año 2001.
- [ ] HU-41 tiene su avance y sus criterios, HU-42 y HU-45/HU-47 su nota, y `CLAUDE.md` está al día.

## Decisiones

- **Sí:** el rango es de enero al mes de corte, y la línea toma un punto por mes de las corridas vigentes (decidido en la fase de preguntas). **No:** calcular un rango arbitrario al consultar: haría falta lógica nueva en el motor, que guarda el acumulado.
- **Sí:** un endpoint nuevo, `GET /indicadores/serie`, que da la serie en una petición (decidido en la fase de preguntas). **No:** que el frontend pida `/resultados` hasta 12 veces.
- **Sí:** el distrito solo filtra municipios (decidido en la fase de preguntas). **No:** filas o cálculo por distrito, que dependen del bloque E en pausa y de una definición pendiente con la DDRISS.
- **Sí:** `DISTRITO_CONSULTAR` para Epidemiología y la Autoridad (decidido en la fase de preguntas). **No:** agregar el distrito a cada fila de `ResultadoIndicador`, que cambia el contrato y la consulta de los resultados.
- **Sí:** un panel fijo arriba, con un indicador por tipo de la vacuna elegida, y la tabla del indicador elegido abajo (decidido en la fase de preguntas). **No:** solo la gráfica del indicador elegido, ni pestañas Tabla/Gráfica.
- **Sí:** la línea usa el indicador base de la proyección (decidido en la fase de preguntas). Con una proyección calculable, todo va contra su población anual y la meta es la suya × mes ÷ 12; sin ella, el valor del indicador base con su meta plana (decidido en la verificación del paso 8). **No:** deducirlo del tipo `COBERTURA`: `COB_HEXA3` de la base de prueba tiene prorrateo `MENSUAL_LINEAL`, que los resultados no traen, y la línea mezclaba el 83,6 % contra la meta del mes con la proyección contra la población anual (55,7 % en agosto). **No:** agregar el prorrateo al contrato.
- **Sí:** el filtro de vacuna elige los indicadores del panel y del selector, y «Cobertura por vacuna» resalta la elegida en lugar de filtrarla (decidido en la fase de preguntas).
- **Sí:** varios municipios con un `DropdownMenu` de casillas, y los ids en la URL (decidido en la fase de preguntas). **No:** un solo municipio con `municipioId` en el endpoint: el filtro se hace en el frontend sobre los resultados que ya llegan.
- **Sí:** con un solo municipio visible, las gráficas de un valor usan ese municipio; con varios, la DDRISS (decidido en la fase de preguntas). **No:** sumar los municipios elegidos, que el motor no calcula.
- **Sí:** «Cobertura por vacuna» compara solo indicadores del mismo tipo que el de cobertura del panel (decidido al escribir el spec), para no mezclar en un eje la cobertura anual con el avance contra la meta del mes.
- **Sí:** la vacuna va en la URL por su código, y el título de la deserción es el nombre del indicador (decidido al implementar el paso 6). **No:** agregar al contrato el id de la vacuna o la dosis inicial, que los resultados no traen.
- **Sí:** el componente Chart de shadcn con la CLI, que agrega `recharts` (autorizado en la fase de preguntas).
- **No (para otros specs):** exportar, agrupar por sexo o edad, los selectores «Nivel» y «Atribución», y la banda de rango probable (decidido en la fase de preguntas).

## Riesgos

- **Recharts en jsdom.** `ResponsiveContainer` no tiene tamaño en las pruebas y no dibuja nada. Las cuentas se prueban en `panelIndicadores.test.js`, la pantalla solo revisa títulos y textos, y el dibujo se revisa con Playwright.
- **Tiempo de carga.** La serie espera a los resultados (dos viajes seguidos a Aiven, de unos 130 ms cada uno), y `serieDelIndicador` hace hasta 12 lecturas de `leerResultados` en paralelo. Si se nota lento, la primera medida es una sola consulta de `resultado_indicador` para todas las corridas del año.
- **Corridas faltantes.** Un mes sin corrida vigente deja un hueco en la línea real, y la línea no lo rellena. Pasa en la base de prueba con los meses que nadie calculó.
- **El Revisor sin distrito.** El Revisor ve «Indicadores» pero no recibe `DISTRITO_CONSULTAR`, así que no tiene ese filtro. Si se quiere, se agrega su rol al mismo bloque del 05 antes de aprobar el spec.
- **Aiven apagado.** Con MySQL apagado, la tabla y el panel fallan juntos y cada uno muestra su «Reintentar».

## Lo que **no** entra en este spec

- Exportar a Excel o PDF.
- Agrupar por sexo o por edad, y los selectores «Nivel» y «Atribución».
- Indicadores por distrito o de un rango de meses que no empiece en enero.
- La banda de rango probable.
- El mapa territorial y las gráficas del Inicio.

Cada uno, si llega, va en su propio spec.
