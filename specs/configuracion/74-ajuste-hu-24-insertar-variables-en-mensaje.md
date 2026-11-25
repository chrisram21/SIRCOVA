# SPEC 74 — Ajuste HU-24 Insertar variables en el mensaje de una regla

> **Estado:** Implementado
> **Historia:** HU-24
> **Origen:** ajuste
> **Depende de:** SPEC 32
> **Fecha:** 2026-11-25
> **Objetivo:** Que el campo Mensaje del panel de una regla de validación tenga debajo un botón por cada variable de su tipo, con un nombre en español y un Tooltip que la explica, que al pulsarlo inserte el marcador (`{vacuna}`) donde está el cursor, para que el Administrador no tenga que escribir llaves ni saberse los códigos.

## Por qué existe este spec

Hoy, para usar una variable en el mensaje de una regla, el Administrador tiene que escribirla a mano con llaves, guiándose por la ayuda «Marcadores: {vacuna}, {variacion}, {meses_referencia}, {variacion_max_pct}.» ([PanelRegla.jsx](../../frontend/src/paginas/configuracion/PanelRegla.jsx), campo Mensaje). Esos nombres internos, con guiones bajos y abreviaturas, parecen código. Si se escribe mal uno, se ve el error «El mensaje usa el marcador {…}, que no existe…» recién al guardar. El equipo lo anotó al revisar el proyecto (2026-11-24).

Se consideró mostrar cada variable como una ficha dentro del mismo campo, pero se descartó: un `<textarea>` solo muestra texto, y un editor propio con `contentEditable`, o una librería como TipTap o Lexical (fuera de la lista de `AGENTS.md`), es mucho trabajo para un campo de una línea. Este spec hace la parte sencilla: botones que insertan el marcador. El formato guardado no cambia.

**Lo que se decidió en la fase de preguntas (2026-11-25):**

- Los nombres y las explicaciones van en un archivo nuevo, solo del frontend: `paginas/configuracion/marcadoresRegla.js`. Las dos copias de `tiposRegla.js` no cambian.
- Cada botón muestra el nombre («Variación máxima (%)»). El Tooltip dice qué es y qué inserta: «La variación máxima de la regla, en porcentaje. Inserta {variacion_max_pct}.».
- Al insertar, se agrega un espacio antes si el carácter anterior no es un espacio ni «(».
- La ayuda «Marcadores: …» se reemplaza por «Haga clic en un dato para agregarlo al mensaje donde está el cursor.».
- Los nombres de las 18 variables son los de la tabla de abajo.
- La vista previa del mensaje con valores de ejemplo no entra (decidido en la revisión del 2026-11-24).

## Alcance

**Entra:**

- `frontend/src/paginas/configuracion/marcadoresRegla.js` (nuevo): el nombre y la explicación de cada variable, y la función pura `insertarMarcador`.
- `PanelRegla.jsx`: los botones debajo del campo Mensaje y la ayuda nueva, en los dos modos («Nueva regla» y «Nueva versión»), para todos los tipos.
- Pruebas: `marcadoresRegla.test.js` (nueva) y `PanelRegla.test.jsx`.
- Una nota en HU-24 de `HISTORIAS_DE_USUARIO.md` y otra en `backend/src/modulos/configuracion/CLAUDE.md`.

**No entra (para otros specs):**

- Mostrar las variables como fichas dentro del campo, o cualquier editor enriquecido.
- Una vista previa del mensaje con valores de ejemplo.
- Cambios en el backend, en el contrato, en `tiposRegla.js` (ninguna de las dos copias) o en la validación de los marcadores. Un marcador escrito a mano y mal escrito sigue dando el mismo error.
- Mostrar los nombres en español en otros lugares donde aparece el mensaje (el historial de la regla, la lista de reglas, el panel «Validación automática» de Registro).
- Los mensajes de los indicadores configurables (SPEC 43).

## Modelo de datos

Este spec **no cambia el modelo, ni los permisos, ni los estados**, y no toca el backend. El mensaje se sigue guardando como texto con marcadores entre llaves (`{vacuna}`), igual que hoy.

### `marcadoresRegla.js`

```js
// Lo que ve el Administrador de cada marcador del mensaje (SPEC 74). Las claves son las de `marcadores` en
// tiposRegla.js; este archivo es solo del frontend.
export const MARCADORES_REGLA = {
  vacuna: { etiqueta: 'Vacuna', descripcion: 'El nombre de la vacuna.' },
  // …
}

// Inserta {marcador} en lugar de la selección [inicio, fin) del texto. Agrega un espacio antes si el carácter
// anterior no es un espacio ni «(». Devuelve el texto nuevo y la posición del cursor, después del marcador.
export function insertarMarcador(texto, inicio, fin, marcador) { /* … */ return { texto, cursor } }
```

| Clave | Etiqueta | Descripción (Tooltip, antes de «Inserta {clave}.») |
|---|---|---|
| `vacuna` | Vacuna | El nombre de la vacuna. |
| `dosis` | Dosis | La dosis de la celda, por ejemplo «1.ª dosis». |
| `valor` | Cantidad registrada | La cantidad que se registró en la celda. |
| `minimo` | Mínimo | El mínimo de la regla. |
| `maximo` | Máximo | El máximo de la regla. |
| `dosis_anterior` | Dosis anterior | La dosis que debería tener más aplicaciones. |
| `dosis_posterior` | Dosis posterior | La dosis que supera a la anterior. |
| `exceso_permitido_pct` | Exceso permitido (%) | El exceso permitido de la regla, en porcentaje. |
| `variacion` | Variación (%) | Cuánto cambia la producción del mes frente al promedio, en porcentaje. |
| `meses_referencia` | Meses de referencia | Cuántos meses anteriores se promedian. |
| `variacion_max_pct` | Variación máxima (%) | La variación máxima de la regla, en porcentaje. |
| `total` | Total declarado | El total que declaró el establecimiento. |
| `suma` | Suma del detalle | La suma de las cantidades del detalle. |
| `n_faltantes` | Celdas sin llenar | Cuántas celdas y campos obligatorios quedaron vacíos. |
| `version` | Versión del esquema | La versión del esquema de captura del reporte. |
| `municipio` | Municipio | El municipio de procedencia de la celda. |
| `establecimiento` | Establecimiento | El establecimiento del reporte. |
| `periodo` | Periodo | El mes del reporte. |

Si un tipo nuevo trae un marcador que no está en la tabla, su botón muestra el código sin llaves y el Tooltip solo dice «Inserta {clave}.». La prueba del paso 1 avisa si falta alguno.

**Ejemplos de `insertarMarcador`:**

| Texto (con `|` como cursor o selección) | Marcador | Resultado |
|---|---|---|
| `La producción de |` | `vacuna` | `La producción de {vacuna}|` |
| `La producción de|` | `vacuna` | `La producción de {vacuna}|` (agrega el espacio) |
| `Total (|)` | `total` | `Total ({total}|)` (sin espacio después de «(») |
| `|` (vacío) | `vacuna` | `{vacuna}|` |
| `Varía [XX] %`, con `XX` seleccionado | `variacion` | `Varía {variacion}| %` (reemplaza la selección) |

### Pantalla: el campo Mensaje

```
Mensaje
┌──────────────────────────────────────────────────────────┐
│ La producción de {vacuna} varía {variacion} % respecto…  │
└──────────────────────────────────────────────────────────┘
Haga clic en un dato para agregarlo al mensaje donde está el cursor.
[ Vacuna ] [ Variación (%) ] [ Meses de referencia ] [ Variación máxima (%) ]
```

- Los botones son `Button` de shadcn (`variant="outline"`, `size="sm"`, `type="button"`, para que no envíen el formulario), en una fila que se acomoda en varias líneas. Van en el orden de `marcadores` del tipo.
- Cada botón tiene su `Tooltip` (de `components/ui/`) y el nombre accesible «Insertar {etiqueta}».
- **Dónde se inserta:** donde estaba el cursor (o la selección) la última vez que se usó el campo. Si el campo todavía no se usó, al final. Después de insertar, el foco vuelve al campo con el cursor después del marcador, para seguir escribiendo.
- Mientras se guarda (`enviando`), los botones están deshabilitados, como el campo.
- La ayuda pasa a ser «Haga clic en un dato para agregarlo al mensaje donde está el cursor.». El error del mensaje no cambia.
- Insertar cuenta como un cambio: activa el aviso de cambios sin guardar, como escribir.

## Plan de implementación

1. **`marcadoresRegla.js`.** `MARCADORES_REGLA` con las 18 variables de la tabla e `insertarMarcador`. Pruebas en `marcadoresRegla.test.js`:
   - cada marcador de cada tipo de `TIPOS_REGLA` tiene etiqueta y descripción (recorre los 9 tipos);
   - los cinco ejemplos de la tabla de `insertarMarcador`, más uno con el cursor al inicio de un texto (no agrega espacio).

   Comprobación: la prueba pasa.
2. **`PanelRegla.jsx`.** Los botones con su Tooltip debajo del campo, la ayuda nueva, la posición del cursor guardada con `onSelect` del `Textarea` (en una `ref`) y el foco de vuelta al campo después de insertar. En `PanelRegla.test.jsx`:
   - la prueba que hoy busca «Marcadores: {vacuna}, {variacion}…» pasa a buscar la ayuda nueva y los cuatro botones de Variación frente al historial, en su orden (este cambio de la prueba es a propósito: el texto que revisaba deja de existir);
   - con el campo vacío, «Insertar Vacuna» deja `{vacuna}`;
   - con el cursor a mitad del texto (`setSelectionRange`), el marcador queda ahí, y el foco vuelve al campo;
   - al cambiar de tipo en «Nueva regla», los botones cambian a los del tipo nuevo;
   - en «Nueva versión» de un tipo que no se crea desde la pantalla (Campos completos), se ven sus botones;
   - guardar después de insertar manda el mensaje con `{vacuna}` tal cual.

   Comprobación: `npm test` del frontend pasa completo.
3. **Verificación manual y notas.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano), como Administrador, en «Administración · Reglas de validación»:
   - «Nueva regla», tipo «Variación frente al historial»: ver los cuatro botones y sus Tooltip; insertar a mitad del texto y al final; ver el espacio que se agrega solo;
   - cambiar a «Rango de valores» y ver sus cinco botones;
   - abrir «Nueva versión» de una regla de la semilla y ver los botones de su tipo;
   - **no** guardar: ni la regla nueva ni la versión. El guardado no cambia y lo cubren las pruebas, y la nota del módulo pide no publicar versiones de las reglas de la semilla.

   Después, la nota en HU-24 (`HISTORIAS_DE_USUARIO.md`), la nota en `backend/src/modulos/configuracion/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] Debajo del campo Mensaje hay un botón por cada marcador del tipo de la regla, en su orden, con el nombre en español de la tabla.
- [x] Cada botón tiene un Tooltip con la descripción y «Inserta {clave}.», y el nombre accesible «Insertar {etiqueta}».
- [x] Pulsar un botón inserta `{clave}` donde estaba el cursor o en lugar de la selección; si el campo no se usó, al final; y el foco vuelve al campo con el cursor después del marcador.
- [x] Se agrega un espacio antes del marcador solo si el carácter anterior no es un espacio ni «(», y no se agrega al inicio del texto.
- [x] La ayuda «Marcadores: …» ya no aparece, y en su lugar dice «Haga clic en un dato para agregarlo al mensaje donde está el cursor.».
- [x] Los botones funcionan en «Nueva regla» y en «Nueva versión», para todos los tipos, y están deshabilitados mientras se guarda.
- [x] El mensaje que se guarda tiene los marcadores con llaves, igual que antes, y el backend no cambia.
- [x] Las pruebas `marcadoresRegla.test.js` y `PanelRegla.test.jsx`, y `npm test` del frontend completo, pasan.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** botones debajo del campo que insertan el marcador (decidido en la revisión del 2026-11-24). **No:** fichas dentro del campo con `contentEditable` o una librería de editor, que es mucho trabajo y pediría una dependencia fuera de `AGENTS.md`. **No:** la vista previa con valores de ejemplo, que el equipo dejó fuera.
- **Sí:** los nombres en un archivo propio del frontend (decidido en la fase de preguntas). Las dos copias de `tiposRegla.js` siguen iguales y el backend no carga textos que nunca usa. **No:** cambiar `marcadores` a `[{ clave, etiqueta }]` en las dos copias, que obliga a tocar cuatro archivos por un dato que solo usa la pantalla.
- **Sí:** el botón muestra el nombre, y el Tooltip la explicación y el código (decidido en la fase de preguntas). **No:** el código a la vista en cada botón, que vuelve a mostrar las llaves.
- **Sí:** un espacio antes si hace falta (decidido en la fase de preguntas). **No:** insertar tal cual, que deja palabras pegadas.
- **Sí:** se reemplaza la ayuda con los códigos (decidido en la fase de preguntas). **No:** dejar las dos cosas, que repiten la misma información.
- **Sí:** `Button` de shadcn con `variant="outline"` (decidido al escribir el spec). Se puede usar con el teclado y tiene foco visible. **No:** `Badge`, que no es un botón.
- **Sí:** si el campo no se usó, el marcador va al final (decidido al escribir el spec). Es lo esperable al abrir el panel con el mensaje de ejemplo y pulsar un botón.
- **Sí:** no se guarda nada en la verificación manual (decidido al escribir el spec). El guardado no cambia, y la nota del módulo pide no publicar versiones de las reglas de la semilla.
- **Sí:** origen `ajuste` sobre HU-24: la historia ya está terminada (SPEC 32), y este spec cambia cómo se escribe el mensaje.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un tipo de regla nuevo trae un marcador sin nombre en `marcadoresRegla.js` | La prueba del paso 1 recorre todos los tipos de `TIPOS_REGLA` y falla si falta alguno. Mientras tanto, el botón muestra el código. |
| La posición del cursor se pierde al pulsar el botón (el campo pierde el foco) | Se guarda en una `ref` con `onSelect` del `Textarea`, antes de que el botón tome el foco, y se prueba con `setSelectionRange`. |
| El Tooltip de Radix dentro del `Sheet` queda tapado o no aparece | `Tooltip` de `components/ui/` ya se usa dentro de tablas y paneles. Se revisa en la verificación manual. |

## Lo que **no** entra en este spec

- Fichas dentro del campo o un editor enriquecido.
- La vista previa del mensaje.
- Cambios en el backend, en `tiposRegla.js` o en la validación de los marcadores.
- Los nombres en español en el historial, en la lista de reglas o en el panel de validación de Registro.
