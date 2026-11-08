# SPEC 51 — Comparar cobertura entre periodos

> **Estado:** Implementado
> **Historia:** HU-43
> **Depende de:** SPEC 44, SPEC 47 y SPEC 49
> **Fecha:** 2026-11-07
> **Objetivo:** Que «Indicadores» tenga una tarjeta «Comparar periodos» que dibuje, para la vacuna y el municipio de los filtros, la cobertura real de dos a cinco años superpuestos o la producción de dos a cinco meses elegidos, con una tabla de diferencias, y que la base de prueba tenga un 2025 ficticio para compararlo.

## Por qué existe este spec

«Indicadores» ya tiene la línea «Avance acumulado y proyección» de un solo año (SPEC 49), que lee `GET /indicadores/serie`. HU-43 pide comparar la cobertura entre meses y entre años. Faltan tres cosas:

- La población anual en la serie, para que los años se comparen con la misma cuenta aunque cambie la población (hoy la línea la toma de la fila `PROYECCION`, que un año anterior puede no tener).
- Saber qué años y meses tienen una corrida vigente, para ofrecer solo esos en los selectores.
- Datos de otro año: la base de prueba solo tiene 2026 (calendario, población y corridas).

**Diferencias con la historia** (decididas por el equipo):

- **Dos modos:** «Por año» (una línea por año, de enero a diciembre) y «Por mes» (barras de la producción de cada mes elegido). La historia pide «entre meses y entre años».
- **«Por mes» compara lo vacunado en el mes**, no el acumulado: el acumulado del mes menos el del mes anterior del mismo año, contra la población anual.
- **Semilla de 2025:** resultados de indicadores ficticios, sin reportes ni producción. El motor no puede recalcular 2025.

## Alcance

**Entra:**

- Contrato: `poblacionAnual` en cada punto de `GET /indicadores/serie` y el endpoint nuevo `GET /indicadores/meses-calculados`, de solo lectura y con `INDICADOR_CONSULTAR`.
- Script nuevo `backend/db/11_comparacion_2025_mysql.js` con el calendario, la población y las corridas de 2025 de la DDRISS San Marcos (zona protegida: se confirma antes de crearlo y antes de correrlo en Aiven).
- Tarjeta «Comparar periodos» en «Indicadores», a todo el ancho, debajo del panel de gráficas y encima de la tabla, con:
  - el interruptor «Por año / Por mes»;
  - el selector de años o de meses (2 a 5);
  - la gráfica de líneas (por año) o de barras (por mes), con el componente Chart de shadcn;
  - la tabla de diferencias.
- Los filtros nuevos en la URL: `comparar`, `anios` y `meses`.
- Pruebas del backend (`serie.test.js`) y del frontend (funciones puras de la comparación y la pantalla).
- Verificación manual con Playwright. Avance y criterios de HU-43, y nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Comparar brecha, deserción o proyección entre periodos: solo se compara la cobertura.
- La banda de rango probable y la proyección en la comparación (HU-39 y SPEC 47): la tarjeta dibuja solo lo real.
- Reportes y producción de 2025, y recalcular 2025 con el motor.
- Comparar periodos en el mapa o en el Inicio.
- Exportar la comparación a Excel o PDF (HU-45, HU-47 y HU-48).
- Comparar rangos de meses que no empiecen en enero (los resultados se guardan acumulados, como en el SPEC 49).
- Cambios en permisos, en `transicion_estado`, en el modelo de datos o en los `package.json`.

## Modelo de datos

Este spec no cambia tablas ni colecciones ni permisos. Agrega un campo a una respuesta, un endpoint de solo lectura y un script de datos de prueba.

### `GET /indicadores/serie`, ampliado

Cada punto trae `poblacionAnual`: la población del año del grupo del indicador, sin prorrateo.

- Se lee de la versión del indicador guardada en el resultado (`indicador_version`): `aplica_a[0].clasificacion_poblacion` de `configuracion_indicadores`, como `aplicaDe` de `motor.service.js`.
- Sin `municipioId`, es la suma de `poblacion_objetivo` de los municipios de la DDRISS (los mismos que suma el motor); con `municipioId`, la de ese municipio.
- Es `null` si el indicador no tiene grupo de población (`DESERCION`) o si el año no tiene esa población.
- Se lee una vez por versión distinta de la serie, no una vez por punto.

```json
{
  "puntos": [
    { "mes": 1, "corridaId": 210, "parcial": false, "poblacionAnual": 24550,
      "resultado": { "indicadorCodigo": "COB_HEXA3", "municipio": null, "numerador": 1702, "valor": 83.2 } }
  ]
}
```

(`resultado` es un `ResultadoIndicador` completo; arriba se recorta.)

### `GET /indicadores/meses-calculados`

Ruta en `indicadores.routes.js` con `autenticar` + `requierePermiso('INDICADOR_CONSULTAR')`. Función `mesesCalculados` en `corridas.service.js`.

- **Parámetros:** solo `ddrissId` (`DdrissIdAutoridad`). Uno desconocido o repetido responde 400 `ENTRADA_INVALIDA`.
- **Devuelve:** los años con al menos una corrida vigente `COMPLETADA` de la DDRISS, del más reciente al más antiguo, con sus meses en orden:

```json
{ "anios": [ { "anio": 2026, "meses": [1, 2, 3, 4, 5, 6, 7, 8, 9] }, { "anio": 2025, "meses": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } ] }
```

- No dice qué indicadores tiene cada corrida: un año sin el indicador comparado se avisa en la tarjeta.
- No escribe nada ni deja bitácora.

### Semilla de 2025 (`backend/db/11_comparacion_2025_mysql.js`)

Script de Node con `mysql2` (el pool de `src/config/mysql.js` y el `backend/.env`), que se corre con `node --env-file=.env db/11_comparacion_2025_mysql.js` desde `backend/` (con `--simular` lo hace todo en la transacción, muestra una muestra de las filas y la deshace). No recrea la base ni toca otros años. Es idempotente: si la DDRISS `DDRISS_SM` ya tiene corridas de 2025, termina sin escribir. Escribe, en una sola transacción:

- `periodo` de 2025 (los 12 meses que falten).
- `cierre_periodo` de 2025 de la DDRISS, los 12 `CERRADO`, con la fecha límite el día 10 del mes siguiente, `cerrado_por` el usuario que cierra en la semilla y `cerrado_en` el día 20 del mes siguiente.
- `poblacion_objetivo` de 2025: cada fila de 2026 de los municipios de la DDRISS × 0.98, redondeada, con la fuente «Datos de prueba (ficticios)».
- Doce `corrida_calculo` de 2025 (`mes_hasta` 1 a 12), `COMPLETADA` y vigentes, con `motivo` `CIERRE_PERIODO`, sin usuario, e `iniciada_en` cinco minutos después del cierre de su mes (así ninguna queda como la más reciente del Inicio).
- Sus `resultado_indicador`, de los cuatro indicadores de la corrida 1 de la semilla (`COB_HEXA3`, `AVANCE_HEXA3`, `BRECHA_HEXA3`, `DES_HEXA1_3`, con su misma versión), departamental y por municipio:
  - las dosis acumuladas del mes k de un municipio son las de agosto de 2026 de la corrida 1 × k ÷ 8 × un factor fijo por municipio (de 0.85 a 1.05 según su id), redondeadas, así que unos municipios quedan mejor que en 2026 y otros peor;
  - la fila departamental suma los municipios;
  - `valor`, `meta`, `brecha_dosis`, `cumple_meta` y el denominador (con el prorrateo de la versión) se calculan con `CALCULADORES` de `calculadores.js`, como en el motor;
  - para `DES_HEXA1_3`, las iniciales y las finales salen igual de su fila de agosto de 2026.
- No escribe en `bitacora` (como los scripts 03 y 04).

Si la corrida 1 no existe (una base recreada sin el 03), el script termina con un mensaje y sin escribir.

### Filtros (frontend, en la URL)

| Parámetro | Qué es | Por defecto |
|---|---|---|
| `comparar` | `anio` o `mes` | `anio` |
| `anios` | De 2 a 5 años separados por coma (`2025,2026`) | El año del corte y el anterior, si tiene corridas |
| `meses` | De 2 a 5 meses `AAAA-MM` separados por coma (`2025-08,2026-08`) | El mes de corte y el mismo mes del año anterior; si ese no tiene corrida, el mes anterior al corte |

- Los valores por defecto no se escriben en la URL, como el resto de los filtros.
- Un año o un mes sin corrida (según `meses-calculados`) se ignora; más de cinco se recortan a los cinco primeros.
- Cambiar la DDRISS borra `anios` y `meses`. Cambiar la vacuna, el distrito, los municipios o el corte los conserva.

### Qué se compara

`comparacionPeriodos.js` (nuevo, funciones puras):

- **Indicador:** el `base` de `indicadoresDelPanel` (SPEC 49): el indicador base de la proyección o el primer `COBERTURA` de la vacuna. Se busca por su código en la serie de cada año. Un año sin ese código queda «Sin cálculo de {código} en {año}».
- **Municipio:** el de `filaDeReferencia`: el único municipio visible, o la DDRISS.
- **Cobertura real del mes k de un año:** `numerador` ÷ `poblacionAnual` × 100. Sin `poblacionAnual`, ese año queda «Sin población de {año}».
- **Producción del mes k:** `numerador(k) − numerador(k − 1)` del mismo año (en enero, `numerador(1)`), y su % contra `poblacionAnual`. Si falta la corrida de k − 1, el mes queda «Sin dato del mes anterior».
- **Diferencia:** en puntos porcentuales (pp) y en dosis, del último periodo contra el primero (por año) o de cada mes contra el primero elegido (por mes). Una diferencia positiva es mejora. Los pp son la resta de los porcentajes ya redondeados a un decimal, como se muestran (decidido en el paso 8).

### Tarjeta «Comparar periodos» (`TarjetaComparacion.jsx`)

- Título «Comparar periodos» y subtítulo con el indicador y la fila de referencia («Hexavalente 3.ª dosis · Total de la DDRISS»).
- Interruptor `Tabs` «Por año / Por mes» (ya instalado).
- **Selector** (`SelectorPeriodos.jsx`, `DropdownMenu` con `DropdownMenuCheckboxItem`, ya instalado):
  - por año, los años de `meses-calculados`;
  - por mes, los meses de cada año agrupados con `DropdownMenuLabel`;
  - con cinco elegidos, el resto queda deshabilitado; el botón dice «{n} años» o «{n} meses».
- **Por año** (`GraficaComparacionAnios.jsx`): una línea por año, eje X de enero a diciembre y eje Y en %. El año del corte llega hasta el mes de corte aunque tenga corridas posteriores, y los demás años llegan hasta su último mes con corrida (decidido en el paso 8). Los colores son `--chart-1` (el año más reciente), `--chart-3`, `--chart-5`, `--chart-4` y `--chart-2`, en ese orden (decidido en el paso 7: `--chart-2` es un celeste muy claro que se confunde con `--chart-1`). Un punto `parcial` lleva un marcador hueco y el tooltip dice «Parcial», como en el SPEC 49. Leyenda con los años.
- **Por mes** (`GraficaComparacionMeses.jsx`): una barra por mes elegido, en orden cronológico, con el % del mes; el tooltip da las dosis. La etiqueta es «ago 2025».
- **Tabla de diferencias** (`TablaComparacion.jsx`), que es también la lectura accesible de la gráfica:
  - por año: una fila por mes con datos en algún año, una columna por año (%) y «Diferencia» (último − primero, en pp, con ▲ o ▼);
  - por mes: una fila por mes elegido, con dosis del mes, % y la diferencia contra el primero (pp y dosis).
  - Sube con `--exito-foreground` y baja con `--destructive`; sin cambio, `--muted-foreground`.
- Con un solo periodo con datos, se dibuja ese y el aviso dice «Elija al menos dos periodos con cálculo para comparar.». Sin ninguno, solo el aviso.
- La gráfica lleva un `aria-label` con su título.

**Carga:**

- `obtenerMesesCalculados` se pide con los resultados (en paralelo), una vez por DDRISS.
- Por cada año que se necesita (los de `anios`, o los años de `meses`), `obtenerSerie` del indicador `base` y del municipio de referencia, en paralelo. La serie del año del corte se comparte con la de la línea de avance si coinciden indicador y municipio (misma petición).
- Mientras carga, `Skeleton`. Si falla, `AvisoError` con «Reintentar» en la tarjeta, sin ocultar el panel ni la tabla.
- Sin corrida en el mes de corte no hay panel ni tarjeta, como hoy.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← poblacionAnual en SerieIndicador; GET /indicadores/meses-calculados
├── db/11_comparacion_2025_mysql.js                ← nuevo: 2025 ficticio de DDRISS_SM (zona protegida)
├── src/modulos/indicadores/corridas.service.js    ← poblacionAnual en serieDelIndicador; mesesCalculados
├── src/modulos/indicadores/indicadores.routes.js, indicadores.controller.js
└── tests/serie.test.js                            ← casos nuevos (años 2000 y 2001)
frontend/src/
├── api/indicadores.js                             ← obtenerMesesCalculados
├── paginas/inicio/PaginaInicio.test.jsx           ← al implementar: obtenerMesesCalculados en el mock (entra a /indicadores)
└── paginas/indicadores/
    ├── PaginaIndicadores.jsx (+ .test)             ← comparar/anios/meses en la URL, carga de meses calculados
    ├── BarraFiltrosIndicadores.jsx                 ← al implementar: cambiar la DDRISS borra anios y meses
    ├── PanelGraficas.jsx                           ← monta la tarjeta debajo de las gráficas
    ├── comparacionPeriodos.js (+ .test)            ← nuevo: periodos por defecto, puntos por año, producción del mes, diferencias
    ├── TarjetaComparacion.jsx                      ← nuevo
    ├── SelectorPeriodos.jsx                        ← nuevo
    ├── GraficaComparacionAnios.jsx, GraficaComparacionMeses.jsx ← nuevos
    └── TablaComparacion.jsx                        ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** En `openapi.yaml`: `poblacionAnual` (número o `null`) en los puntos de `SerieIndicador`, y `GET /indicadores/meses-calculados` con `x-permiso: INDICADOR_CONSULTAR`, su esquema `MesesCalculados` y los 400, 401 y 403. Comprobación: `/api/docs` carga.
2. **Población anual en la serie.** En `serieDelIndicador`, leer las versiones distintas de la serie en `configuracion_indicadores`, su `clasificacion_poblacion` y la población del año (del municipio o de la DDRISS). Comprobación: `serie.test.js` y `proyeccion.test.js` siguen pasando.
3. **Meses calculados.** `mesesCalculados` en `corridas.service.js` (con `revisarParametros` y `ddrissDeLaConsulta`), más el controlador y la ruta. Comprobación: responde en `/api/docs` con la DDRISS 1.
4. **Pruebas del backend.** En `serie.test.js`, con la DDRISS ficticia `ZVT_OTRA41` y los años 2000 y 2001 (la limpieza, al inicio y al final, borra también 2000 y su población de prueba):
   - `poblacionAnual` departamental es la suma de los municipios, con `municipioId` es la del municipio, y es `null` para un indicador sin grupo de población y para un año sin población;
   - `meses-calculados` da 2001 y 2000 con sus meses, en ese orden, sin las corridas no vigentes ni las `FALLIDA`;
   - un parámetro desconocido responde 400, la Autoridad nacional sin `ddrissId` recibe 400 y con él ve la DDRISS pedida, y el Personal recibe 403.
   Comprobación: la prueba pasa.
5. **Semilla de 2025.** Confirmar con el equipo, escribir `11_comparacion_2025_mysql.js` y correrlo en la base de prueba (autorización explícita). Comprobación: una segunda corrida no escribe nada; hay 12 corridas vigentes de 2025 con 4 × 31 resultados cada una; la fila departamental de `COB_HEXA3` suma sus municipios; y el `valor` de un municipio cuadra con `numerador ÷ denominador × 100`.
6. **Frontend: datos.** `obtenerMesesCalculados` en `api/indicadores.js`, y `comparacionPeriodos.js` con `periodosPorDefecto`, `leerPeriodos` (recorte a cinco y a lo calculado), `puntosPorAnio`, `produccionDelMes` y `diferencias`. Pruebas puras en `comparacionPeriodos.test.js`:
   - los valores por defecto con y sin el año anterior;
   - un año de más y un mes sin corrida se ignoran;
   - la cobertura real contra la población anual, y un año sin población;
   - la producción de enero, de un mes cualquiera y de un mes sin el anterior;
   - la diferencia en pp y en dosis, positiva y negativa.
   Comprobación: la prueba pasa.
7. **Frontend: tarjeta.** `TarjetaComparacion.jsx`, `SelectorPeriodos.jsx`, las dos gráficas y `TablaComparacion.jsx`; los filtros en `PaginaIndicadores.jsx` y la tarjeta en `PanelGraficas.jsx`. Pruebas en `PaginaIndicadores.test.jsx` (con `vi.mock` de las API; Recharts no dibuja en jsdom, así que miran títulos, la tabla y las llamadas):
   - la tarjeta aparece con los dos años por defecto y pide la serie de cada uno;
   - cambiar a «Por mes» pone `comparar=mes` en la URL y la tabla muestra la producción de cada mes;
   - con cinco años elegidos, el sexto queda deshabilitado;
   - con un municipio visible, la serie se pide con su `municipioId`;
   - con un solo año calculado, aparece el aviso;
   - un error en `meses-calculados` o en una serie muestra «Reintentar» sin ocultar el panel ni la tabla.
   Los mocks de `@/api/indicadores.js` que montan «Indicadores» agregan `obtenerMesesCalculados`. Comprobación: `npm test` del frontend pasa completo.
8. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas, como `epidemiologia` con el corte en agosto de 2026:
   - por año, 2025 contra 2026: comparar los puntos con `numerador ÷ poblacionAnual` de la serie y la diferencia de la tabla;
   - con Tacaná como único municipio, la línea y la tabla cambian a ese municipio;
   - por mes, agosto de 2025 contra julio y agosto de 2026: las dosis cuadran con las restas de la serie (al verificar, julio de 2026 no tenía corrida y se usó septiembre);
   - los filtros quedan en la URL y un enlace abre la misma comparación;
   - como `autoridad.nacional`, con la DDRISS elegida;
   - a 390 px no hay desplazamiento horizontal fuera de la tabla, y la consola queda sin errores.
   Después, el avance y los criterios de HU-43 y la nota en `CLAUDE.md`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta `poblacionAnual` y `GET /indicadores/meses-calculados`, y `/api/docs` carga.
- [x] Cada punto de `GET /indicadores/serie` trae la población anual del grupo del indicador (de la DDRISS o del municipio), o `null` si no tiene.
- [x] `GET /indicadores/meses-calculados` da los años y meses con corrida vigente de la DDRISS del ámbito.
- [x] `11_comparacion_2025_mysql.js` deja 2025 cerrado, con población y 12 corridas vigentes de los cuatro indicadores; una segunda ejecución no escribe nada y no toca otros años.
- [x] Puedo elegir de dos a cinco años o de dos a cinco meses para comparar, y la elección queda en la URL.
- [x] «Por año» muestra la evolución mensual de la cobertura real (dosis acumuladas ÷ población anual) de la vacuna y el municipio de los filtros, una línea por año, sin la proyección.
- [x] «Por mes» muestra lo vacunado en cada mes elegido, en dosis y en % de la población anual.
- [x] La tabla da los valores de cada periodo y la diferencia en pp (y en dosis por mes), con la marca de sube o baja.
- [x] Un periodo sin cálculo, sin población o sin el mes anterior lo dice en lugar de dibujar un valor falso, y un error de la tarjeta no oculta el panel ni la tabla.
- [x] Las gráficas usan el componente Chart de shadcn, y ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [x] `serie.test.js` y `proyeccion.test.js` pasan en `backend/`, `npm test` pasa en `frontend/` sin desactivar pruebas, y no quedan datos de prueba de los años 2000 y 2001.
- [x] HU-43 tiene su avance y sus criterios, y `CLAUDE.md` está al día.

## Decisiones

- **Sí:** los dos modos, «Por año» y «Por mes» (decidido en la fase de preguntas). **No:** solo años superpuestos.
- **Sí:** «Por mes» compara la producción del mes (acumulado − acumulado anterior) contra la población anual (decidido en la fase de preguntas). **No:** el acumulado al corte, que solo se puede comparar entre el mismo mes de varios años.
- **Sí:** la cobertura real contra la población anual, que da el backend en `poblacionAnual` (decidido en la fase de preguntas). **No:** el `valor` guardado del indicador: `COB_HEXA3` usa prorrateo mensual, y sería el avance contra la meta del mes.
- **Sí:** ampliar `/indicadores/serie` y un endpoint de meses calculados (decidido en la fase de preguntas), con una petición de la serie por año, en paralelo (decidido al escribir el spec). **No:** un parámetro `anios` que cambie la forma de la respuesta de la serie, ni un endpoint de comparación que arme todo en el backend.
- **Sí:** una tarjeta en el panel de «Indicadores», que usa la vacuna, el municipio y la DDRISS de los filtros (decidido en la fase de preguntas). **No:** pestañas ni una pantalla propia.
- **Sí:** de 2 a 5 periodos; por defecto, el año del corte y el anterior, o el mes de corte y el mismo del año anterior (decidido en la fase de preguntas). **No:** sin límite (más de cinco líneas no se leen) ni exactamente dos.
- **Sí:** el indicador de cobertura del panel (`base`), buscado por código en cada año (decidido en la fase de preguntas). **No:** un selector de indicador propio en la tarjeta.
- **Sí:** una tabla de diferencias bajo la gráfica, que también es la lectura accesible (decidido en la fase de preguntas). **No:** la diferencia solo en el tooltip o en el título.
- **Sí:** un 2025 ficticio con un script de Node que calcula con `CALCULADORES` (decidido en la fase de preguntas), con los cuatro indicadores de la base y sin reportes. **No:** SQL con las fórmulas repetidas a mano, ni reportes y producción de 2025.
- **Sí:** el script no escribe en la bitácora, como el 03 y el 04 (decidido al escribir el spec): son datos de prueba, no una acción de un usuario.
- **Sí:** el script se corre con `--env-file=.env`, como `npm run crear-usuario`, y tiene `--simular` (decidido en el paso 5) para revisar las cifras sin dejar nada escrito.
- **Sí:** el año del corte llega hasta el mes de corte en «Por año» (decidido en el paso 8). **No:** hasta su último mes con corrida: con el corte en agosto de 2026, las corridas parciales de septiembre y octubre (sin producción nueva) hacían decir al resumen «A octubre: −11.5 pp» cuando en agosto 2026 iba +1.9 pp.
- **Sí:** los pp de la diferencia salen de los porcentajes ya redondeados (decidido en el paso 8), para que 55.7 % − 53.8 % muestre +1.9 pp y no +2.0.
- **Sí:** si la URL no deja ningún periodo válido, se usan los de por defecto (decidido en el paso 6), en lugar de dejar la tarjeta vacía.
- **Sí:** «Por mes» sin ningún mes con datos muestra solo el aviso; con alguno, cada mes sin dato dice su motivo en la tabla (decidido en el paso 7).

## Riesgos

- **2025 sin reportes.** Con meses `CERRADO` y sin reportes, la bandeja de revisión de un mes de 2025 muestra todos los establecimientos «Sin enviar», y una rectificación no tiene qué corregir. Es lo esperado de un dato ficticio; si estorba en la demo, se filtra a mano por año.
- **Recalcular 2025.** Una corrida manual de 2025 («Calcular» en «Indicadores») daría todo en cero, porque no hay producción, y reemplazaría la vigente. Se avisa en la nota de `CLAUDE.md`: no calcular 2025.
- **Versiones fuera de su vigencia.** Las corridas de 2025 usan la versión 1 de cada indicador aunque su vigencia empiece en 2026. Ni la serie ni `aCorridas` revisan la vigencia, así que no falla.
- **Recharts en jsdom.** Como en el SPEC 49: las cuentas se prueban en `comparacionPeriodos.test.js`, la pantalla revisa títulos y la tabla, y el dibujo se revisa con Playwright.
- **Tiempo de carga.** Cinco años son cinco series con hasta 12 lecturas cada una. Si se nota lento, la primera medida es una sola consulta de `resultado_indicador` por año, que ya proponía el SPEC 49.
- **La corrida 1 reemplazada.** La semilla de 2025 parte de los resultados de la corrida 1 aunque ya no sea vigente (la reemplazaron las pruebas manuales); si se borró, el script no escribe y lo dice.

## Lo que **no** entra en este spec

- Comparar brecha, deserción o proyección, y la banda de rango probable.
- Reportes de 2025 y recalcular 2025.
- La comparación en el mapa o en el Inicio, y la exportación.
- Rangos de meses que no empiecen en enero.

Cada uno, si llega, va en su propio spec.
