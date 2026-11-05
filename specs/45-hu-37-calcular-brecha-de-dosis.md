# SPEC 45 — Calcular la brecha de dosis

> **Estado:** Implementado
> **Historia:** HU-37
> **Depende de:** SPEC 43 y SPEC 44
> **Fecha:** 2026-11-04
> **Objetivo:** Que la corrida de indicadores calcule los indicadores `BRECHA` y que la pantalla «Indicadores» muestre, por vacuna y municipio, cuántas dosis faltan para la meta o, si ya se superó, el excedente.

## Por qué existe este spec

El motor (SPEC 44) ya calcula `COBERTURA` y `AVANCE_META_MES`, y sus filas ya llenan `brecha_dosis` contra su propia meta. Los indicadores `BRECHA` (como `BRECHA_HEXA3` de la semilla) todavía salen en `omitidos` con «Su cálculo todavía no está disponible.». La pantalla muestra «Dosis que faltan», pero no el excedente ni una vista pensada para decidir dónde hace falta vacunar.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- La fórmula de la historia (meta − dosis acumuladas) es la que ya usa `calcularContraMeta`: `brecha_dosis` = máx(0, ⌈meta ÷ 100 × denominador − numerador⌉). Una fila `BRECHA` se calcula igual que la semilla: `valor` es el porcentaje contra el denominador y `brecha_dosis` las dosis que faltan.
- El excedente no se guarda: se calcula al leer, como el color del semáforo.
- La fila «Total de la DDRISS» muestra las dos cuentas: la brecha contra el total del departamento (la que guarda el motor, donde los municipios que pasaron la meta compensan a los demás) y la suma de lo que falta en cada municipio.

## Alcance

**Entra:**

- `BRECHA` en `CALCULADORES` (`modulos/indicadores/calculadores.js`), con la misma función `calcularContraMeta`.
- Campos calculados al leer en `GET /indicadores/resultados`: `metaDosis` y `excedenteDosis` en cada fila calculable, y `sumaBrechasMunicipales` en la fila departamental.
- Contrato: `ResultadoIndicador` con los tres campos nuevos.
- Pantalla «Indicadores»: tabla propia cuando el indicador elegido es `BRECHA`, título según el tipo y el excedente en la columna «Dosis que faltan» de cobertura y avance.
- Pruebas puras (`calculadores.test.js`), contra la base (`corridas.test.js`) y del frontend.
- Verificación manual con Playwright; avance de HU-37, notas en HU-38, HU-39 y HU-41, `CONTEXTO BD.md` y `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Gráficas, entre ellas las barras «Brecha a la meta proporcional» de `Indicadores.html` (HU-41), el mapa y el dashboard.
- `DESERCION` (HU-38) y `PROYECCION` (HU-39).
- Alertas por brecha (HU-51).
- Exportar a Excel o PDF.
- Cambios en `backend/db/`, en permisos o en la configuración de indicadores (SPEC 43).
- Brecha por distrito, por establecimiento o por dimensión.

## Modelo de datos

Este spec no cambia la base de datos ni las colecciones. Reutiliza `resultado_indicador` y `configuracion_indicadores` como los dejó el SPEC 44.

### Cálculo de la fila `BRECHA` (al calcular)

`CALCULADORES.BRECHA = calcularContraMeta`. Con la versión que aplica:

- **Denominador:** el prorrateo de la versión (`NINGUNO` = población anual, el valor por defecto de `BRECHA`; `MENSUAL_LINEAL` = población ÷ 12 × mes).
- **Meta:** `meta.valor` de la versión (95 por defecto) con su `comparador`.
- **Guarda:** `numerador`, `denominador`, `valor` (porcentaje), `meta`, `brecha_dosis` y `cumple_meta`, igual que cobertura.
- **Departamental:** contra la suma de numeradores y denominadores, y no calculable si a un municipio le falta la población.
- **Sin semáforo:** `BRECHA` no tiene `umbrales`, así que `color` sale `null`.

Ejemplo de la semilla (`BRECHA_HEXA3`, San Marcos, agosto de 2026): población 1,450, `NINGUNO`, meta 95 → `valor` 67,2414, `brecha_dosis` ⌈1377,5 − 975⌉ = 403.

### Campos calculados al leer (`GET /indicadores/resultados`)

Funciones puras nuevas en `calculadores.js`, que usa `leerResultados` de `corridas.service.js` para todas las filas, de cualquier tipo:

| Campo | Fórmula | Si la fila no es calculable |
|---|---|---|
| `metaDosis` | ⌈meta ÷ 100 × denominador⌉, con el redondeo a 6 decimales de `dosisQueFaltan` | `null` |
| `excedenteDosis` | máx(0, numerador − `metaDosis`) | `null` |
| `sumaBrechasMunicipales` | suma de `brechaDosis` de las filas municipales del mismo indicador en la corrida | `null` |

- Siempre se cumple `metaDosis − numerador = brechaDosis − excedenteDosis`, y una de las dos es 0.
- `sumaBrechasMunicipales` solo va en la fila departamental (en las municipales, `null`). Es `null` si la departamental no es calculable.
- Con `municipioId` la respuesta no trae la fila departamental, así que tampoco el campo.
- En la semilla, `BRECHA_HEXA3` de San Marcos da `metaDosis` 1378 y `excedenteDosis` 0.

`ResultadoIndicador` queda así (los campos nuevos al final):

```json
{
  "indicadorCodigo": "BRECHA_HEXA3", "indicadorVersion": 1, "tipoCalculo": "BRECHA",
  "municipio": null, "vacuna": { "codigo": "HEXA", "nombre": "Hexavalente" },
  "dosis": "D3", "filtroDimensiones": "grupo_edad=MENOR_1", "anio": 2026, "mes": 8,
  "numerador": 13707, "denominador": 24550, "valor": 55.833, "meta": 95,
  "brechaDosis": 9616, "cumpleMeta": false, "calculable": true, "color": null, "esProyeccion": false,
  "metaDosis": 23323, "excedenteDosis": 0, "sumaBrechasMunicipales": 9621
}
```

(Números de la corrida 1 de la semilla. Ahí ningún municipio supera la meta, así que la suma municipal, 9,621, solo difiere de la brecha departamental, 9,616, por el redondeo de cada municipio. Con un municipio sobre la meta, la diferencia es mayor.)

### Frontend

- `paginas/indicadores/PaginaIndicadores.jsx`:
  - El título deja de ser fijo: sale de la `etiqueta` del tipo elegido en `paginas/configuracion/tiposIndicador.js` («Cobertura», «Avance contra la meta del mes», «Brecha de dosis»). El antetítulo sigue siendo «Indicadores».
  - Si el indicador elegido es `BRECHA`, muestra `TablaBrecha`; si no, la tabla de siempre.
  - En la tabla de cobertura y avance, «Dosis que faltan» muestra «0 (+8 de excedente)» cuando la brecha es 0 y `excedenteDosis` es mayor que 0.
  - El indicador por defecto sigue siendo el primer avance (`indicadorElegido`).
- `paginas/indicadores/TablaBrecha.jsx` (nuevo):
  - Columnas: Municipio · Dosis acumuladas · Dosis para la meta (`metaDosis`) · Dosis que faltan · Excedente · Cumple.
  - Fila «Total de la DDRISS» arriba y en negrita. Debajo de la tabla, una línea «Suma de lo que falta en los municipios: {n} dosis», con la aclaración de que los municipios que pasaron la meta no compensan a los demás. Sin la línea si `sumaBrechasMunicipales` es `null`.
  - Municipios ordenados de mayor a menor brecha, y por nombre si empatan; los no calculables al final, con «Sin población».
  - Una brecha mayor que 0 se resalta con `--advertencia`; un excedente mayor que 0, con `--exito`. Nada de colores escritos a mano.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                 ← ResultadoIndicador: metaDosis, excedenteDosis, sumaBrechasMunicipales
├── src/modulos/indicadores/calculadores.js      ← BRECHA en CALCULADORES; funciones de metaDosis y excedenteDosis
├── src/modulos/indicadores/corridas.service.js  ← leerResultados agrega los tres campos
└── tests/
    ├── calculadores.test.js                     ← casos de BRECHA, meta en dosis y excedente
    └── corridas.test.js                         ← indicador ZVT_HU36_BRECHA en la corrida del año 2006
frontend/src/paginas/indicadores/
├── PaginaIndicadores.jsx (+ .test)              ← título por tipo, TablaBrecha, excedente en cobertura y avance
└── TablaBrecha.jsx (+ .test)                    ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md, docs/base-de-datos/CONTEXTO BD.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** Los tres campos en `ResultadoIndicador`, con su descripción y la regla de cuándo son `null`; la descripción de `omitidos` ya no nombra `BRECHA`. Comprobación: `/api/docs` carga.
2. **Calculadores puros.** `BRECHA` en `CALCULADORES` y las funciones de `metaDosis`, `excedenteDosis` y la suma municipal. Casos en `calculadores.test.js`:
   - `BRECHA_HEXA3` de San Marcos en la semilla: `valor` 67,2414, `brecha_dosis` 403, `metaDosis` 1378, excedente 0;
   - meta superada: brecha 0 y excedente igual a numerador − `metaDosis`;
   - meta justa (numerador = `metaDosis`): brecha 0 y excedente 0;
   - el redondeo a 6 decimales (0,95 × 1450);
   - `NINGUNO` contra `MENSUAL_LINEAL`;
   - sin población: los tres campos `null`;
   - la suma municipal no descuenta los excedentes y difiere de la brecha departamental.
   Comprobación: la prueba pasa.
3. **Lectura de resultados.** `leerResultados` agrega los tres campos. En `corridas.test.js`, la preparación del año 2006 suma un indicador `ZVT_HU36_BRECHA` de `DDRISS_SM` sobre la vacuna `ZVT_HU36`, con una meta que deje un municipio sobre la meta y otro debajo (si los datos actuales no lo permiten, se baja la meta del indicador; no se cambian los datos que ya usan las otras pruebas). Casos:
   - la corrida calcula `ZVT_HU36_BRECHA` y no lo pone en `omitidos`;
   - sus filas dan la brecha y el excedente esperados por municipio y la `sumaBrechasMunicipales` de la departamental;
   - una fila de cobertura también trae `metaDosis` y `excedenteDosis`;
   - con `municipioId`, la respuesta no trae `sumaBrechasMunicipales`.
   Comprobación: `calculadores.test.js` y `corridas.test.js` pasan, y no quedan datos `ZVT_HU36…` ni del año 2006.
4. **Frontend.** `TablaBrecha.jsx` y los cambios de `PaginaIndicadores.jsx`. Pruebas (con `vi.mock`):
   - con un indicador `BRECHA`, el título «Brecha de dosis», las columnas, el orden de mayor a menor brecha y «Sin población» al final;
   - la línea de la suma municipal, y sin ella si es `null`;
   - el excedente en la tabla de brecha y «0 (+8 de excedente)» en la de cobertura;
   - con un avance, el título «Avance contra la meta del mes» y la tabla de siempre.
   Comprobación: `npm test` del frontend pasa completo.
5. **Verificación manual y documentación.** Con Playwright, como `epidemiologia`: calcular agosto de 2026, elegir `BRECHA_HEXA3` y comparar la brecha de cada municipio con la corrida 1 de la semilla (las diferencias de Concepción Tutuapa y San Rafael son las del SPEC 44). Revisar por SQL que la corrida nueva tenga las filas `BRECHA_HEXA3` y que su bitácora ya no la liste en `omitidos`. Documentación: avance y criterios de HU-37; notas en HU-38 y HU-39 (el calculador va en `CALCULADORES` y la tabla se elige por tipo en `PaginaIndicadores.jsx`) y en HU-41 (las barras pueden leer `brechaDosis` y `excedenteDosis`); `CONTEXTO BD.md` (`BRECHA` y los campos calculados al leer); nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `metaDosis`, `excedenteDosis` y `sumaBrechasMunicipales` en `ResultadoIndicador`, y `/api/docs` carga.
- [ ] No cambian `backend/db/`, los permisos ni los `package.json`.
- [ ] Una corrida calcula los indicadores `BRECHA` que aplican a la DDRISS y ya no los pone en `omitidos`.
- [ ] La brecha de `BRECHA_HEXA3` de San Marcos con los datos de la semilla de agosto de 2026 es 403, en `calculadores.test.js`.
- [ ] Si se superó la meta, `brechaDosis` es 0 y `excedenteDosis` es numerador − `metaDosis`; si no, `excedenteDosis` es 0.
- [ ] La fila departamental trae la brecha contra el total y `sumaBrechasMunicipales`, que no descuenta los excedentes.
- [ ] Una fila no calculable trae `metaDosis`, `excedenteDosis` y `sumaBrechasMunicipales` en `null`.
- [ ] Con un indicador `BRECHA` elegido, la pantalla muestra «Brecha de dosis», las dosis que faltan y el excedente por municipio, de mayor a menor brecha, y la suma municipal.
- [ ] En cobertura y avance, una fila con brecha 0 y excedente muestra «0 (+{n} de excedente)».
- [ ] `calculadores.test.js` y `corridas.test.js` pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar pruebas, y no quedan datos `ZVT_HU36…` ni del año 2006.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [ ] HU-37 tiene su avance y sus criterios, HU-38, HU-39 y HU-41 sus notas, y `CONTEXTO BD.md` y `CLAUDE.md` están al día.

## Decisiones

- **Sí:** `BRECHA` usa `calcularContraMeta`, con `valor` en porcentaje y `brecha_dosis` en dosis, como la semilla (decidido en la fase de preguntas). **No:** guardar la brecha en `valor`, que se aparta de la semilla y del semáforo.
- **Sí:** el excedente se calcula al leer, en `GET /indicadores/resultados`, para todas las filas (decidido en la fase de preguntas). **No:** una columna `excedente_dosis`, que toca `backend/db/` y la semilla para un dato que sale de los que ya se guardan.
- **Sí:** `metaDosis` = ⌈meta × denominador⌉ y excedente = numerador − `metaDosis` (decidido al escribir el spec), para que la brecha y el excedente salgan de la misma meta en dosis y nunca sean los dos mayores que 0.
- **Sí:** la fila departamental muestra la brecha contra el total y la suma municipal (decidido en la fase de preguntas). **No:** solo una de las dos: contra el total oculta dónde falta, y la suma sola se aparta de la semilla y de cobertura.
- **Sí:** `sumaBrechasMunicipales` se calcula al leer, en la fila departamental (decidido al escribir el spec), sin cambiar el motor.
- **Sí:** tabla propia para `BRECHA`, ordenada por la brecha, y título según el tipo (decidido en la fase de preguntas). **No:** solo una columna más en la tabla de cobertura; **no:** solo backend.
- **No:** gráficas de brecha; quedan para HU-41 (decidido en la fase de preguntas).
- **Sí:** las pruebas contra la base amplían `corridas.test.js` (año 2006, `ZVT_HU36*`) (decidido en la fase de preguntas). **No:** un archivo nuevo con su año, que repite la preparación y suma unos 40 s contra Aiven.

Decididas al implementar:

- **Sí:** `metaYExcedente` (`calculadores.js`) deduce `metaDosis` de la brecha guardada: numerador + `brechaDosis` si falta algo y, si no, ⌈meta ÷ 100 × denominador⌉ sin pasar del numerador. `resultado_indicador` guarda el denominador redondeado a 2 decimales y la brecha se calculó sin redondear, así que recalcular ⌈meta × denominador⌉ al leer podía dar una dosis de diferencia y romper `metaDosis − numerador = brechaDosis − excedenteDosis`. Fuera de esos casos da lo mismo que la fórmula de la tabla (paso 2). **No:** la fórmula literal.
- **Sí:** sin un indicador que mostrar (sin corrida o sin resultados), el título de «Indicadores» es «Indicadores por municipio». La prueba de `PaginaInicio.test.jsx` que entraba a la pantalla esperaba el título fijo anterior y ahora espera ese (paso 4).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La suma municipal y la brecha departamental confunden a quien las lee | La pantalla muestra la suma en una línea aparte, con la aclaración de que los excedentes no compensan. |
| `metaDosis` y `brecha_dosis` se separan si cambia la fórmula de `dosisQueFaltan` | Las dos usan el mismo redondeo en `calculadores.js` y una prueba revisa `metaDosis − numerador = brechaDosis − excedenteDosis`. |
| La población cargada es de ejemplo | Los resultados dependen de ella; se avisa en la verificación manual. |
| Ampliar `corridas.test.js` cambia los resultados que esperan sus otras pruebas | El indicador de brecha es nuevo y no cambia los datos que ya se preparan; solo se agregan casos. |

## Lo que **no** entra en este spec

- Gráficas, mapa y dashboard (HU-41 en adelante).
- Deserción y proyección (HU-38, HU-39).
- Alertas por brecha (HU-51).
- Cambios en la base, en los permisos o en la configuración de indicadores.
- Brecha por distrito, establecimiento o dimensión.

Cada uno, si se hace, va en su propio spec.
