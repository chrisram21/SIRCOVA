# SPEC 52 — Señalar coberturas mayores al 100 %

> **Estado:** Aprobado
> **Historia:** HU-44
> **Depende de:** SPEC 44, SPEC 45 y SPEC 50
> **Fecha:** 2026-11-08
> **Objetivo:** Que cada resultado de cobertura, avance o brecha traiga `mayorACien`, calculado al leer, y que las tablas de «Indicadores» y el mapa territorial marquen esos municipios con un ícono y un aviso que pide revisar la población (denominador) o los registros.

## Por qué existe este spec

Una cobertura mayor al 100 % es señal de un problema en el denominador o en los registros, y debe revisarse, no aceptarse sin más (`docs/contexto/CONTEXTO PROYECTO SIRCOVA.md`). Hoy «Indicadores» y el mapa la muestran como cualquier valor sobre la meta: con el semáforo verde y sin aviso. En agosto de 2026, San Marcos (100.9 %), El Rodeo (102.8 %) y Esquipulas Palo Gordo (106.1 %) son ejemplos en el avance de Hexavalente 3 (nota de HU-44 del SPEC 50).

**Diferencias con la historia** (decididas por el equipo):

- **La advertencia no es una alerta:** «Cómo se hará» dice que la regla «genera una advertencia». Aquí la advertencia es la marca y el aviso en pantalla. La fila en la tabla `alerta` la crea HU-51, que tiene el criterio «Se crea una alerta cuando la cobertura supera el 100 %».
- **Qué se marca:** el `valor` tal como se calcula, en `COBERTURA`, `AVANCE_META_MES` y `BRECHA`. Con prorrateo mensual (como `COB_HEXA3` y `AVANCE_HEXA3` de la base), un valor mayor al 100 % significa que se pasó la meta del mes, no necesariamente la población anual; el texto de la marca lo dice («revise la población o los registros»), sin distinguir los dos casos.

## Alcance

**Entra:**

- Contrato: `mayorACien` en `ResultadoIndicador` (lo traen `/indicadores/resultados`, `/indicadores/corridas/{id}` y `/indicadores/serie`).
- La función pura `mayorACien` en `calculadores.js` y su uso en `leerResultados` (`corridas.service.js`), sin cambiar la base.
- «Indicadores»: la marca junto al valor en las tablas de cobertura y avance (`TablaResultados`) y de brecha (`TablaBrecha`), y un aviso sobre la tabla con los municipios marcados.
- Mapa territorial: la marca en el tooltip, en el panel del municipio y junto a la cifra de la clasificación, en los modos Cobertura y Brecha.
- Pruebas del backend (`calculadores.test.js`, `corridas.test.js`, `proyeccion.test.js`) y del frontend (las tablas, el mapa y sus funciones puras).
- Verificación manual con Playwright. Avance y criterios de HU-44, nota en HU-51 y nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Crear filas en la tabla `alerta` (HU-51) y el ícono de alertas de la barra (HU-52).
- La marca en las gráficas del panel, en «Comparar periodos», en el Inicio y en los informes (HU-45 a HU-48). Pueden leer `mayorACien` cuando lo necesiten.
- Marcar la proyección (`PROYECCION`, una estimación) o la deserción.
- Distinguir «supera la meta del mes» de «supera la población anual».
- Cambiar el color del semáforo o el borde de los polígonos del mapa.
- Cambios en `backend/db/`, en permisos, en `transicion_estado` o en los `package.json`.

## Modelo de datos

Este spec no cambia tablas ni colecciones ni permisos. Agrega un campo calculado a una respuesta.

### `mayorACien`

En `calculadores.js`:

```js
// Una cobertura mayor al 100 % pide revisar la población (denominador) o los registros (HU-44).
export const TIPOS_CON_TOPE = ['COBERTURA', 'AVANCE_META_MES', 'BRECHA'];
export const mayorACien = ({ tipoCalculo, valor, esProyeccion }) =>
  !esProyeccion && TIPOS_CON_TOPE.includes(tipoCalculo) && valor != null && valor > 100;
```

- Se calcula al leer, en `leerResultados`, como `metaDosis` y `excedenteDosis`. No se guarda.
- Es `false` en la deserción, en la proyección, en las filas no calculables (`valor` null) y si la versión ya no está en MongoDB (`tipoCalculo` null).
- La fila departamental se marca igual que las municipales.
- Compara el `valor` guardado (4 decimales): 100.0000 no se marca y 100.0001 sí, aunque se muestre como «100.0 %».

```json
{ "indicadorCodigo": "AVANCE_HEXA3", "municipio": { "id": 12, "nombre": "El Rodeo", "codigoIne": "1212" },
  "valor": 102.8, "color": "verde", "mayorACien": true }
```

(Recortado: el resto de los campos no cambia.)

### Textos

Salen de un solo archivo del frontend, `paginas/indicadores/MarcaMayorACien.jsx`:

- **Texto de la marca** (en `aria-label` y `title` del ícono, y como línea del tooltip del mapa): «Mayor al 100 %: revise la población (denominador) o los registros.».
- **Aviso sobre la tabla:** «{n} municipio(s) con cobertura mayor al 100 %: {nombres}. Revise la población (denominador) o los registros.». Si la fila marcada es la de la DDRISS, el aviso la nombra «Total de la DDRISS».

### Marca en «Indicadores»

- `MarcaMayorACien.jsx` exporta:
  - `MarcaMayorACien`: el ícono `TriangleAlert` de `lucide-react` con `text-advertencia-foreground`, junto al valor (después de `InsigniaValor`), con su texto en `aria-label` y `title`;
  - `AvisoMayorACien({ resultados })`: el aviso con el estilo del de la corrida parcial (`bg-advertencia`, `text-advertencia-foreground`, `role="status"`), o nada si ninguna fila está marcada.
- `TablaResultados` (cobertura y avance, en `PaginaIndicadores.jsx`) y `TablaBrecha.jsx` muestran la marca en la celda del valor y el aviso encima de la tabla.
- El aviso cuenta solo las filas visibles (los filtros de distrito y municipios del SPEC 49).
- La deserción y la proyección no cambian.

### Marca en el mapa

En los modos Cobertura y Brecha, con la fila que pinta el modo (`fila.resultado`):

- **Tooltip:** `lineasDelTooltip` agrega al final la línea `['Revisar', 'Mayor al 100 %: revise la población (denominador) o los registros.']`.
- **Clasificación:** `ClasificacionMunicipios.jsx` pone `MarcaMayorACien` junto a la cifra.
- **Panel:** `PanelMunicipio.jsx` pone `MarcaMayorACien` junto a la cifra grande y, debajo, el texto de la marca. En los modos Deserción y Estado, el panel lo muestra igual si la fila del indicador de cobertura del municipio está marcada, porque el panel siempre muestra los datos de cobertura.
- El color del polígono y la leyenda no cambian.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← mayorACien en ResultadoIndicador
├── src/modulos/indicadores/calculadores.js        ← mayorACien y TIPOS_CON_TOPE
├── src/modulos/indicadores/corridas.service.js    ← mayorACien en leerResultados
└── tests/calculadores.test.js, corridas.test.js, proyeccion.test.js
frontend/src/paginas/
├── indicadores/
│   ├── MarcaMayorACien.jsx                        ← nuevo: la marca, el aviso y sus textos
│   ├── PaginaIndicadores.jsx (+ .test)            ← TablaResultados con la marca y el aviso
│   └── TablaBrecha.jsx (+ .test)                  ← la marca y el aviso
└── mapa/
    ├── mapaTerritorial.js (+ .test)               ← la línea del tooltip
    ├── PanelMunicipio.jsx, ClasificacionMunicipios.jsx
    └── PaginaMapa.test.jsx
docs/SPECS/HISTORIAS_DE_USUARIO.md, docs/base-de-datos/CONTEXTO BD.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** En `openapi.yaml`, `mayorACien` (booleano, obligatorio) en `ResultadoIndicador`, con su regla en la descripción. Comprobación: `/api/docs` carga.
2. **Cálculo.** `mayorACien` y `TIPOS_CON_TOPE` en `calculadores.js`; `leerResultados` agrega `mayorACien` a cada fila. En `calculadores.test.js`, los casos:
   - `COBERTURA`, `AVANCE_META_MES` y `BRECHA` con 100.0001 se marcan, y con 100 no;
   - `DESERCION`, `PROYECCION` (y una fila con `esProyeccion`), `valor` null y `tipoCalculo` null no se marcan.
   Se agrega `mayorACien` a las filas completas que comparan `corridas.test.js` y `proyeccion.test.js`, y en `corridas.test.js` un caso con una fila municipal de valor mayor a 100. Comprobación: los tres archivos pasan.
3. **Indicadores.** `MarcaMayorACien.jsx`; la marca y el aviso en `TablaResultados` y `TablaBrecha`. Pruebas:
   - en `PaginaIndicadores.test.jsx`, una fila de avance con 102.8 lleva el ícono con su texto y el aviso la nombra; con el filtro de municipios que la deja fuera, el aviso desaparece; sin filas marcadas no hay aviso; la deserción no lleva ícono aunque pase de 100;
   - en `TablaBrecha.test.jsx`, la marca y el aviso con una fila de valor mayor a 100.
   Comprobación: las pruebas pasan.
4. **Mapa.** La línea del tooltip en `mapaTerritorial.js` y la marca en `PanelMunicipio.jsx` y `ClasificacionMunicipios.jsx`. Pruebas:
   - en `mapaTerritorial.test.js`, `lineasDelTooltip` agrega «Revisar» en Cobertura y Brecha con `mayorACien` y no en Deserción ni sin la marca;
   - en `PaginaMapa.test.jsx`, la clasificación lleva el ícono junto a la cifra del municipio marcado, y su panel muestra el texto.
   Comprobación: `npm test` del frontend pasa completo.
5. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas, como `epidemiologia` en agosto de 2026:
   - en «Indicadores» con `AVANCE_HEXA3`, San Marcos, El Rodeo y Esquipulas Palo Gordo (o los que la API dé con `mayorACien`) llevan el ícono y el aviso los nombra; comparar con `GET /indicadores/resultados`;
   - con `BRECHA_HEXA3` y `COB_HEXA3`, lo mismo con sus filas marcadas, y la deserción sin marcas;
   - en el mapa, el tooltip, la clasificación y el panel de esos municipios;
   - la pantalla a 390 px y la consola sin errores.
   Después, el avance y los criterios de HU-44, una nota en HU-51 (`mayorACien` y la función de `calculadores.js` sirven para la alerta), la línea de los campos calculados al leer en `CONTEXTO BD.md` y la nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `mayorACien` en `ResultadoIndicador`, y `/api/docs` carga.
- [ ] Cada resultado trae `mayorACien`: `true` solo en `COBERTURA`, `AVANCE_META_MES` y `BRECHA` con valor mayor a 100, y `false` en la deserción, la proyección y las filas no calculables.
- [ ] Toda cobertura mayor al 100 % aparece marcada en las tablas de cobertura, avance y brecha de «Indicadores» y en el mapa (tooltip, panel y clasificación).
- [ ] La marca y el aviso indican que debe revisarse la población (denominador) o los registros, y el aviso nombra los municipios marcados que se ven.
- [ ] La marca tiene un texto accesible (no es solo un ícono o un color), y ningún componente propio tiene colores escritos a mano.
- [ ] El semáforo, la leyenda y el color de los polígonos no cambian.
- [ ] `calculadores.test.js`, `corridas.test.js` y `proyeccion.test.js` pasan en `backend/`, y `npm test` pasa en `frontend/` sin desactivar pruebas.
- [ ] HU-44 tiene su avance y sus criterios, HU-51 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están al día.

## Decisiones

- **Sí:** se marca el `valor` mayor a 100 tal como se calcula, con o sin prorrateo (decidido en la fase de preguntas). **No:** solo cuando las dosis superan la población anual, ni dos marcas distintas: serían dos conceptos en todas las pantallas.
- **Sí:** un campo calculado en la API, `mayorACien` (decidido en la fase de preguntas), para que las tablas, el mapa, los informes y HU-51 usen la misma regla. **No:** decidirlo solo en el frontend, ni una columna en `resultado_indicador` (zona protegida, y no serviría para las corridas ya guardadas).
- **Sí:** la alerta en la tabla `alerta` queda para HU-51 (decidido en la fase de preguntas). **No:** crearla aquí.
- **Sí:** la marca también en la brecha (decidido en la fase de preguntas), porque su `valor` es la cobertura contra la población anual. **No:** en la proyección, que es una estimación, ni en la deserción.
- **Sí:** el mapa también lleva la marca (decidido en la fase de preguntas), como pide el criterio de HU-44. **No:** dejarlo para otro spec, ni un borde en el polígono.
- **Sí:** ícono con texto accesible junto al valor y un aviso sobre la tabla con los nombres (decidido en la fase de preguntas). **No:** solo el ícono, ni una columna «Revisar».
- **Sí:** el campo se llama `mayorACien` (decidido en la fase de preguntas). **No:** `revisarDenominador` ni una lista `advertencias`.
- **Sí:** el ícono `TriangleAlert` con `--advertencia-foreground` y el aviso con el estilo del de la corrida parcial (decidido al escribir el spec), para no agregar colores al tema.

## Riesgos

- **Falsas alarmas con prorrateo.** Con `MENSUAL_LINEAL`, un municipio que va adelantado en el año pasa del 100 % de la meta del mes sin que haya un error. El texto pide revisar, no afirma que haya un error; si Epidemiología lo pide, distinguir los dos casos va en otro spec.
- **Pruebas que comparan filas completas.** `corridas.test.js` y `proyeccion.test.js` comparan filas con `toEqual` y necesitan el campo nuevo, como pasó con `proyeccion: null` en el SPEC 47. Se ajustan sin desactivar ninguna.
- **El tooltip del mapa es HTML en texto.** La línea nueva usa el mismo armado de `lineasDelTooltip` (sin ícono), así que no hay HTML nuevo que escapar.

## Lo que **no** entra en este spec

- Las alertas de la tabla `alerta` y su bandeja (HU-51 y HU-52).
- La marca en las gráficas, en «Comparar periodos», en el Inicio y en los informes.
- Marcar la proyección o la deserción, y distinguir la meta del mes de la población anual.
- Cambios en el semáforo o en los polígonos del mapa.

Cada uno, si llega, va en su propio spec.
