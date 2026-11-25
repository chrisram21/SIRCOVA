# SPEC 73 — Ajuste HU-45 Elegir varias vacunas en Informes

> **Estado:** Implementado
> **Historia:** HU-45
> **Origen:** ajuste
> **Depende de:** SPEC 62, SPEC 63, SPEC 64, SPEC 65 y SPEC 66
> **Fecha:** 2026-11-24
> **Objetivo:** Que el filtro Vacuna de «Informes» permita elegir varias vacunas con casillas y búsqueda, y que los cuatro informes, su Excel y su PDF muestren solo las vacunas elegidas, en el orden del catálogo, con sus nombres en el encabezado y la lista guardada en la bitácora.

## Por qué existe este spec

Hoy el filtro Vacuna de «Informes» ofrece «Todas las vacunas» o una sola. Para comparar dos o tres vacunas, por ejemplo Hexavalente, Neumococo y Rotavirus, hay que generar «Todas» y buscarlas entre cerca de cien columnas, o generar un informe por vacuna. El equipo lo anotó al revisar el proyecto (2026-11-24).

El SPEC 62 lo había descartado («**No:** selección de varias vacunas», en sus Decisiones). Este spec cambia esa decisión. Las columnas, la tabla, el Excel y el PDF ya muestran varias vacunas, porque «Todas» es justo ese caso. Lo que cambia es el filtro: deja de ser «una o todas» y pasa a ser «una lista, o todas».

**Lo que se decidió en la fase de preguntas (2026-11-24):**

- El filtro es un selector con casillas y búsqueda (Popover + Command de shadcn, ya instalados), con «Todas las vacunas» al inicio.
- El parámetro se sigue llamando `vacuna`, en la API y en la URL, y acepta una lista separada por comas: `vacuna=HEXA,NEUMO`. Una URL con una sola vacuna funciona igual que hoy.
- Entran los cuatro informes de la pantalla (población propia, total, residencia y acumulado anual), con su Excel y su PDF. «Indicadores» no cambia.
- Las columnas van en el orden del catálogo (`orden_informe` y nombre), sin importar el orden en que se marcaron.
- El encabezado del Excel y del PDF dice todos los nombres: «Vacunas: Hexavalente, Neumococo y Rotavirus», o «Vacuna: Hexavalente» si es una.
- El aviso de la agrupación («Solo se muestran las vacunas que registran…») sale con «Todas» y con dos o más vacunas elegidas. Con una sola, queda como hoy.
- El botón dice «Todas las vacunas», el nombre de la vacuna si es una, y «N vacunas» si son varias.
- La fila `EXPORTAR` de la bitácora guarda `vacuna` como una lista de códigos, o `null` con todas.

## Alcance

**Entra:**

- `backend/openapi.yaml`: el parámetro `InformeVacuna` acepta una lista de códigos separados por comas. Lo usan los seis endpoints de informes (`/informes/produccion`, `/informes/acumulado-anual` y sus `/excel` y `/pdf`).
- Backend: leer la lista, revisar que existan todas, filtrar la producción y las columnas por la lista, escribir los nombres en el encabezado del Excel y del PDF, el aviso de la agrupación y la lista en la bitácora.
- Frontend: un componente común `SelectorMultipleConBusqueda`, el filtro Vacuna de `BarraFiltrosInformes` con ese componente, la lista en la URL y el aviso de la agrupación con la regla nueva.
- Pruebas del backend y del frontend.
- Una nota en HU-45 de `HISTORIAS_DE_USUARIO.md` y una en `backend/src/modulos/informes/CLAUDE.md`.

**No entra (para otros specs):**

- El filtro Vacuna de «Indicadores» y su exportación a Excel (SPEC 49 y 72), que siguen con una vacuna o todas.
- Elegir el orden de las columnas, guardar selecciones favoritas o un límite de vacunas.
- Cambios en el diseño del Excel y del PDF, aparte de la línea de las vacunas y del aviso.

## Modelo de datos

Este spec **no cambia el modelo, ni los permisos, ni los estados**. Lee las mismas tablas que los SPEC 62 a 66 y escribe solo la fila `EXPORTAR` de la bitácora, como hasta ahora.

### Parámetro `vacuna`

| Valor | Significado |
|---|---|
| sin `vacuna` | Todas las vacunas, como hoy: las activas más las inactivas con producción en el rango |
| `vacuna=HEXA` | Solo esa, como hoy |
| `vacuna=HEXA,NEUMO,ROTA` | Solo esas |

- Formato: códigos de 1 a 20 letras mayúsculas, números o guiones bajos, separados por comas, sin espacios (`^[A-Z0-9_]{1,20}(,[A-Z0-9_]{1,20})*$`). Si no cumple, 400 `ENTRADA_INVALIDA`: «La vacuna debe ser una lista de códigos de 1 a 20 letras mayúsculas, números o guiones bajos, separados por comas.».
- Un código repetido: 400 `ENTRADA_INVALIDA`, «vacuna no puede repetir un código.», como `municipioIds`.
- Un código que no existe en `vacuna`: 404 `NO_ENCONTRADO`, «La vacuna no existe.» (el mismo mensaje de hoy).
- Una vacuna elegida sale aunque esté inactiva o no tenga datos en el rango, igual que hoy con una sola.

En el servicio, `leerVacuna(query)` pasa a ser `leerVacunas(query)` y devuelve `null` (todas) o un arreglo de códigos. `consulta.vacuna` pasa a ser `consulta.vacunas`.

### Backend: funciones que cambian

| Función | Archivo | Cambio |
|---|---|---|
| `leerVacuna` → `leerVacunas` | `informes.service.js` | Lista o `null`, con las reglas de arriba |
| `leerConsulta`, `leerConsultaAnual` | `informes.service.js`, `acumuladoAnual.service.js` | Usan `leerVacunas` |
| `informePorFila`, el acumulado | los dos | `SELECT id FROM vacuna WHERE codigo IN (?)`; si faltan códigos, 404 |
| `leerProduccion` | `informes.service.js` | `vacunaId` → `vacunaIds` (`null` o arreglo): `AND vp.vacuna_id IN (?)` |
| `vacunasConSusEsquemas`, `columnasDelInforme`, `columnasAgrupadas` | `informes.service.js` | `vacunaCodigo` → `vacunaCodigos`: `WHERE codigo IN (?) ORDER BY activa DESC, orden_informe, nombre` |
| `datosDelEncabezado` | `informes.service.js` | `vacuna` (nombre o `null`) → `vacunas` (nombres en el orden del catálogo; `[]` con todas) |
| `lineasDelEncabezado`, `lineasDelAcumulado` | `textosInforme.js` | La línea de las vacunas sale de `lineaDeVacunas(nombres)` (abajo) |
| `avisosDelInforme`, `avisoDeAgrupacion` | `textosInforme.js` | El segundo parámetro pasa a ser `variasVacunas` (todas o dos o más) |
| `exportarInforme` y la exportación del acumulado | los dos | `vacuna` de la bitácora con la lista o `null` |

`lineaDeVacunas(nombres)`:

| `nombres` | Línea |
|---|---|
| `[]` | `['Vacuna', 'Todas las vacunas']` |
| `['Hexavalente']` | `['Vacuna', 'Hexavalente']` |
| `['Hexavalente', 'Neumococo', 'Rotavirus']` | `['Vacunas', 'Hexavalente, Neumococo y Rotavirus']` (con `enumerar`) |

### Bitácora

La fila `EXPORTAR` no cambia de forma, solo el valor de `vacuna` en `valoresNuevos`:

```js
{ formato: 'xlsx', desde: '2026-01', hasta: '2026-08', nivel: 'municipio',
  vacuna: ['HEXA', 'NEUMO'],            // antes: 'HEXA' o null; ahora una lista o null
  redId: null, municipioIds: [], agrupacion: null, incluirAprobados: false, ddrissId: 1 }
```

La lista va en el orden del catálogo. Las filas que ya existen, con un código como texto, no se tocan (la bitácora no se modifica).

### Pantalla «Informes»

- **Filtro Vacuna:** `SelectorMultipleConBusqueda` en lugar de `SelectorConBusqueda`.
  - Botón: «Todas las vacunas» sin elegir ninguna; el nombre de la vacuna con una («Hexavalente»); «N vacunas» con dos o más.
  - Al abrir: el buscador «Buscar vacuna…», la opción fija «Todas las vacunas» (vacía la selección) y una casilla por vacuna, con «(inactiva)» como hoy. Si no hay coincidencias, «Ninguna vacuna coincide.».
  - El menú queda abierto al marcar, para elegir varias, y se puede usar con el teclado (las casillas son `CommandItem`).
  - Desmarcar la última vuelve a «Todas las vacunas».
- **Estado y URL:** el borrador y los filtros guardan `vacunas` (arreglo de códigos). `filtrosDeUrl` lee `vacuna`, separa por comas, quita los códigos que no están en `opciones.vacunas` y los repetidos, y los deja en el orden del catálogo. `parametrosDeInforme` escribe `vacuna=HEXA,NEUMO` solo si hay alguna elegida.
- **Pedido a la API:** `PaginaInformes` manda `vacuna` como el texto con comas, o no lo manda. `api/informes.js` no cambia.
- **Aviso de la agrupación:** `avisoDeAgrupacion(informe, variasVacunas)`, con `variasVacunas` verdadero si no hay ninguna elegida o hay dos o más.

### `SelectorMultipleConBusqueda` (`frontend/src/componentes/`)

Un componente común, para que otra pantalla lo pueda usar después:

```jsx
<SelectorMultipleConBusqueda
  id="filtro-vacuna"
  etiqueta="Vacuna"
  valores={['HEXA', 'NEUMO']}            // los elegidos; [] = la opción fija
  alCambiar={(valores) => …}
  opciones={[{ valor: 'HEXA', texto: 'Hexavalente' }, …]}
  textoTodas="Todas las vacunas"         // la opción fija y el botón sin selección
  textoVarias={(n) => `${n} vacunas`}
  textoBuscar="Buscar vacuna…"
  textoVacio="Ninguna vacuna coincide."
/>
```

- Reutiliza `filtrarOpciones` y las clases del botón de `SelectorConBusqueda.jsx` (se exportan desde ahí, sin cambiar su comportamiento).
- Usa `Popover`, `Command` y `Checkbox` de `components/ui/`. No se agregan dependencias.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, el parámetro `InformeVacuna` describe la lista con comas, con su `pattern` y un ejemplo con dos códigos, y los mensajes de 400 y 404 de los seis endpoints de informes. Comprobación: `/api/docs` carga sin errores.
2. **Backend: lectura y filtro.** `leerVacunas`, la revisión de existencia con `IN (?)`, `leerProduccion` con `vacunaIds` y las columnas con `vacunaCodigos`, en `informes.service.js` y `acumuladoAnual.service.js`. Casos nuevos en `backend/tests/informes.test.js`, con las vacunas de prueba `ZVT_SPEC62` y `ZVT_SPEC63`:
   - `vacuna=ZVT_SPEC62,ZVT_SPEC63` trae las columnas de las dos, en el orden del catálogo, y las cantidades de cada una son las mismas que con una sola;
   - `vacuna=ZVT_SPEC63,ZVT_SPEC62` da el mismo informe;
   - el acumulado anual con las dos vacunas;
   - un código repetido, una coma al final o minúsculas responden 400;
   - un código que no existe dentro de la lista responde 404;
   - los casos que ya existen con una sola vacuna pasan sin cambios.

   Comprobación: `informes.test.js` pasa.
3. **Backend: encabezado, aviso y bitácora.** `datosDelEncabezado` con `vacunas`, `lineaDeVacunas`, `avisosDelInforme` con `variasVacunas` y la lista en la fila `EXPORTAR`. Casos:
   - en `informeExcel.test.js` y `informePdf.test.js` (puras): la línea con `[]`, con un nombre y con tres;
   - en `informes.test.js`: agrupado por `sexo` con `ZVT_SPEC62,ZVT_SPEC63`, el aviso nombra solo a `ZVT_SPEC63`; el Excel con dos vacunas trae la línea «Vacunas»; la fila `EXPORTAR` guarda `vacuna` como lista, y `null` sin filtro.

   Comprobación: los tres archivos pasan.
4. **Frontend: componente.** `SelectorMultipleConBusqueda.jsx`, con su prueba `SelectorMultipleConBusqueda.test.jsx`: el texto del botón con cero, una y varias; marcar y desmarcar; «Todas las vacunas» vacía la selección; la búsqueda filtra sin tildes; el menú sigue abierto al marcar. Comprobación: la prueba pasa.
5. **Frontend: Informes.** `BarraFiltrosInformes.jsx` con el componente nuevo; `filtrosDeUrl`, `parametrosDeInforme` y `avisoDeAgrupacion` en `informes.js`; el pedido y el aviso en `PaginaInformes.jsx`. Casos:
   - en `informes.test.js`: `vacuna=NEUMO,HEXA,XX,HEXA` en la URL queda `['HEXA', 'NEUMO']`, en el orden del catálogo; `parametrosDeInforme` escribe la lista o no escribe nada; el aviso con cero, una y dos vacunas;
   - en `PaginaInformes.test.jsx`: elegir dos vacunas y «Generar» escribe `vacuna=…` en la URL y pide el informe con ese texto; una URL vieja con `vacuna=HEXA` sigue funcionando.

   Comprobación: `npm test` del frontend pasa completo.
6. **Verificación manual y notas.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano), como Revisor (estadígrafa):
   - elegir Hexavalente, Neumococo y Rotavirus, generar población propia y ver solo sus columnas, en el orden del catálogo;
   - exportar el Excel y el PDF y ver «Vacunas: …» con los tres nombres en el encabezado;
   - agrupar por sexo con varias vacunas y ver el aviso;
   - el acumulado anual con dos vacunas;
   - revisar en la base la fila `EXPORTAR` con la lista;
   - abrir una URL con `vacuna=HEXA` y ver el informe de antes.

   Después, la nota en HU-45 (`HISTORIAS_DE_USUARIO.md`), la nota en `backend/src/modulos/informes/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `vacuna` como una lista de códigos separados por comas en los seis endpoints de informes, y `/api/docs` carga sin errores.
- [ ] Con `vacuna=A,B`, los cuatro informes traen solo las columnas de A y B, en el orden del catálogo, sin importar el orden de la lista.
- [ ] Sin `vacuna`, y con un solo código, los informes responden igual que antes de este spec.
- [ ] Un código repetido o con otro formato responde 400, y un código que no existe responde 404.
- [ ] El Excel y el PDF dicen «Vacuna: Todas las vacunas», «Vacuna: {nombre}» o «Vacunas: {nombres}» según lo elegido.
- [ ] Al agrupar por una dimensión con dos o más vacunas elegidas, el aviso dice cuáles registran esa dimensión.
- [ ] La fila `EXPORTAR` guarda `vacuna` como una lista de códigos, o `null` sin filtro.
- [ ] En la pantalla, el filtro Vacuna permite buscar y marcar varias vacunas, y su botón dice «Todas las vacunas», el nombre o «N vacunas».
- [ ] La URL guarda las vacunas como `vacuna=A,B`, y una URL con una sola vacuna sigue funcionando.
- [ ] Las pruebas del backend de los archivos tocados y `npm test` del frontend pasan.
- [ ] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** un selector con casillas y búsqueda (decidido en la fase de preguntas). **No:** copiar `MenuMunicipios`, que no tiene búsqueda y obliga a desplazarse por unas 21 vacunas.
- **Sí:** el componente va en `componentes/` como `SelectorMultipleConBusqueda`, reutilizando `filtrarOpciones` y las clases de `SelectorConBusqueda` (decidido al escribir el spec). **No:** dejarlo dentro de `paginas/informes/`, porque «Indicadores» u otra pantalla lo podrían usar después.
- **Sí:** se sigue llamando `vacuna` y acepta comas (decidido en la fase de preguntas). Las URL guardadas y los enlaces con una vacuna siguen sirviendo. **No:** un parámetro nuevo `vacunas`.
- **Sí:** los cuatro informes de la pantalla (decidido en la fase de preguntas). **No:** dejar fuera el acumulado, que haría que el filtro cambie según el informe. **No:** incluir «Indicadores», que son otras pantallas, otros endpoints y otro Excel.
- **Sí:** las columnas en el orden del catálogo (decidido en la fase de preguntas). El mismo filtro da siempre la misma tabla. **No:** el orden en que se marcan.
- **Sí:** el encabezado nombra todas las vacunas, como «Territorio» nombra los municipios (decidido en la fase de preguntas). **No:** solo cuántas son.
- **Sí:** el aviso de la agrupación sale con todas o con dos o más vacunas (decidido en la fase de preguntas). Una vacuna elegida que no registra la dimensión no desaparece sin aviso.
- **Sí:** el botón muestra el nombre si es una (decidido en la fase de preguntas). **No:** «1 vacuna», que esconde cuál es.
- **Sí:** la bitácora guarda una lista de códigos, como `municipioIds` (decidido en la fase de preguntas). **No:** el texto con comas de la URL.
- **Sí:** el 404 conserva el mensaje «La vacuna no existe.» (decidido al escribir el spec), para no cambiar el contrato ni las pruebas que ya lo revisan.
- **Sí:** origen `ajuste` sobre HU-45: la historia ya está terminada (SPEC 62), y este spec cambia una decisión de su filtro.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Con muchas vacunas elegidas, la línea «Vacunas» del PDF ocupa varias líneas y empuja la tabla | La línea va con los demás filtros del encabezado (`repartirLineas`), como «Territorio» con varios municipios. Se revisa en la verificación manual con tres o más vacunas, y si se corta o tapa la tabla, el alto del encabezado del PDF se ajusta en este spec. |
| Los textos del encabezado y del aviso se repiten en el backend (`textosInforme.js`) y en el frontend (`informes.js`), y se apartan | Los dos cambian en el mismo spec, con la misma regla (`variasVacunas`) y pruebas en los dos lados. |
| Al cambiar `vacunaCodigo` por `vacunaCodigos`, se rompe el acumulado anual, que reutiliza esas funciones | El paso 2 cambia los dos servicios juntos, y las pruebas del acumulado que ya existen deben seguir pasando. |
| Las filas viejas de la bitácora tienen `vacuna` como texto y las nuevas como lista | La pantalla de Auditoría ya muestra listas, como `municipioIds`, con `textoDeValor` de `paginas/auditoria/auditoria.js`. Queda anotado en la nota del módulo. |

## Lo que **no** entra en este spec

- El filtro Vacuna de «Indicadores» y su exportación.
- Elegir el orden de las columnas, guardar selecciones o limitar cuántas vacunas se eligen.
- Otros cambios al diseño del Excel y del PDF.
