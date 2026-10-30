# SPEC 31 — Vacunas base y vacunas agregadas al reporte

> **Estado:** Aprobado
> **Historia:** HU-19 (crear el reporte mensual), que ya está terminada: este spec modifica su criterio de vacunas y lo anota en su «Avance». Toca también HU-16 (la marca del esquema) y HU-20 (las pestañas que se agregan o se quitan en la captura).
> **Depende de:** SPEC 19, SPEC 20, SPEC 22, SPEC 23, SPEC 24 y SPEC 30
> **Fecha:** 2026-10-29
> **Objetivo:** Que un reporte nuevo lleve solo las vacunas cuyo esquema del mes está marcado para incluirse, y que el Personal del establecimiento pueda agregar y quitar las demás vacunas con esquema mientras el reporte está en Borrador.

## Por qué existe este spec

Hoy `POST /reportes` fija en `reporte_vacuna` **todas** las vacunas activas que tienen un esquema que cubre el día 1 del mes (`vacunasConEsquema` en `reportes.service.js`, con `esquemasDelPeriodo`). Así, cada reporte lleva vacunas que el establecimiento no aplica, y sus pestañas quedan vacías.

La base es `docs/SPECS/PROPUESTA_SPEC_31_VACUNAS_DEL_REPORTE.md`, con las decisiones del equipo del 2026-10-29. En la fase de preguntas se cerraron los puntos que la propuesta dejaba abiertos:

- el campo se llama `incluir_por_defecto` (en la API, `incluirPorDefecto`), y un borrador vacío empieza en `false`;
- **no hay migración**: un esquema sin el campo cuenta como `true`, así que las versiones publicadas no se tocan;
- si ninguna vacuna del mes está marcada, el reporte se crea vacío, siempre que haya alguna para agregar;
- una vacuna es base si la versión guardada en su `reporte_vacuna` está marcada;
- `DELETE` recibe la `versionFila` en la consulta;
- la bitácora `ELIMINAR` guarda la fila y todas sus celdas;
- una vacuna con observaciones no se quita (409);
- `POST` responde la vacuna nueva con su formulario, para no perder lo que no se ha guardado en las otras pestañas;
- en Atlas no se ejecuta nada, y las semillas no se tocan.

**Diferencias con la historia:**

- HU-19 dice que el reporte «crea las secciones de todas las vacunas con esquema». Desde este spec crea solo las marcadas, y el Personal agrega las demás.
- HU-19 responde 422 `SIN_ESQUEMAS` cuando no hay formularios publicados. Desde este spec responde así solo si no hay **ninguna** vacuna con esquema para el mes, aunque ninguna esté marcada.

**Diferencias con la propuesta:**

- La propuesta sugería una migración que pusiera la marca en `true` en todos los esquemas. Se cambió por «sin el campo, cuenta como `true`», que da el mismo resultado sin modificar versiones publicadas (regla 5 de `AGENTS.md`).
- La propuesta pedía agregar el campo a las semillas de `04_datos_prueba_mongo.js`. No se tocan: sin el campo cuentan como `true`, igual que en Atlas.

## Alcance

**Entra:**

- **Contrato** (`backend/openapi.yaml`, primero):
  - `incluirPorDefecto` en los esquemas de entrada y salida de `/esquemas-captura`;
  - `base` en `VacunaDeReporte` y en `VacunaDeFormulario`;
  - `GET /reportes/{id}/vacunas-disponibles`, `POST /reportes/{id}/vacunas` y `DELETE /reportes/{id}/vacunas/{vacunaId}?versionFila=N`, con sus errores;
  - la descripción nueva de `POST /reportes` (solo las marcadas; cuándo responde 422 `SIN_ESQUEMAS`).
- **Modelo de MongoDB** (zona protegida, se confirma antes de editar):
  - `incluir_por_defecto` como `bool` **opcional** en el validador de `esquemas_captura`, en las dos copias del 02 (`backend/db/02_colecciones_mongodb.js` y `docs/base-de-datos/diseño_bd/02_colecciones_mongodb.js`), que deben seguir idénticas;
  - una nota de cambio v0.8 en su encabezado;
  - `docs/base-de-datos/CONTEXTO BD.md` pasa a MongoDB v0.8.
- **Esquemas** (`backend/src/modulos/configuracion/esquemas.service.js`):
  - `POST` y `PUT /esquemas-captura` aceptan `incluirPorDefecto`;
  - un borrador vacío empieza en `false` y una copia la hereda;
  - todas las respuestas la devuelven (`true` si falta);
  - `esquemasDelPeriodo` también la devuelve.
- **Crear el reporte** (`backend/src/modulos/produccion/reportes.service.js`): solo las vacunas marcadas, `base` en `GET /reportes/{id}` y el 422 nuevo.
- **Formulario** (`backend/src/modulos/produccion/captura.service.js`): `base` en cada vacuna de `GET /reportes/{id}/formulario`.
- **Endpoints nuevos** en `backend/src/modulos/produccion/vacunasDelReporte.service.js`, con sus rutas en `produccion.routes.js` y su controlador en `produccion.controller.js`.
- **Pruebas del backend:** `backend/tests/vacunasDelReporte.test.js` (nueva), más ajustes en `reportes.test.js` y en las pruebas de esquemas.
- **Editor de esquemas** (`frontend/src/paginas/configuracion/`):
  - `EditorEsquema.jsx`: la casilla «Incluir en los reportes nuevos»;
  - `contenidoDe` también lleva `incluirPorDefecto`;
  - la vista previa y `/administracion/esquemas/:id` muestran la marca.
- **Captura** (`frontend/src/paginas/registro/CapturaReporte.jsx` y `frontend/src/api/produccion.js`):
  - «Agregar vacuna» y su `Dialog`;
  - «Quitar vacuna» con su `AlertDialog`;
  - unir la vacuna nueva al formulario sin perder lo que no se ha guardado.
- **Pruebas del frontend** de esas pantallas.
- **Documentación:**
  - «Avance» de HU-19 y notas en HU-16, HU-20 y HU-29;
  - «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Agregar y quitar vacunas en un reporte en **Corrección solicitada**. Queda anotado en HU-29.
- Cambiar MySQL. No hay columna nueva en `reporte_vacuna`.
- Una migración de los esquemas publicados, o ejecutar algo en Atlas.
- Cambiar las semillas de `02` y `04`.
- Cambiar los permisos: se usa `REPORTE_EDITAR`.
- Cambiar la versión fijada de una vacuna que ya está en el reporte, aunque su esquema cambie después.
- Que un revisor o un administrador agregue vacunas al reporte de un establecimiento.

## Modelo de datos

MySQL no cambia. MongoDB pasa a la v0.8 con un campo opcional.

### `esquemas_captura` (MongoDB v0.8)

```js
// En el validador, junto a las demás propiedades de primer nivel; no va en `required`.
incluir_por_defecto: {
  bsonType: "bool",
  description: "true: la vacuna entra en los reportes nuevos del mes que cubre esta versión. Si falta, el backend la toma como true",
},
```

- La marca es parte de la versión. Una versión publicada no se edita, así que para cambiarla se publica una versión nueva.
- **Si falta** (todos los documentos anteriores a la v0.8, en Atlas y en las semillas), el backend la toma como `true`. Así, los reportes nuevos siguen como hoy hasta que se publique una versión con la marca en `false`.
- El backend siempre escribe un booleano. Los borradores nuevos y las copias siempre traen el campo.

### API

| Dónde | Campo | Valor |
|---|---|---|
| Esquemas de `/esquemas-captura` (respuesta) | `incluirPorDefecto` | `boolean`, nunca falta (`true` si el documento no lo trae) |
| `POST /esquemas-captura` (cuerpo) | `incluirPorDefecto` | opcional; en uno vacío, `false` por defecto; en una copia, el del esquema copiado |
| `PUT /esquemas-captura/{id}` (cuerpo) | `incluirPorDefecto` | opcional; si no viene, se conserva |
| `VacunaDeReporte` y `VacunaDeFormulario` | `base` | `boolean`: la versión guardada está marcada; `true` si su documento no trae el campo o ya no está en MongoDB |

### Endpoints nuevos

Los tres piden `autenticar` + `requierePermiso('REPORTE_EDITAR')`, y el reporte debe ser del establecimiento del usuario. Si no lo es, o no existe, responden 404 `NO_ENCONTRADO`, como la captura.

**`GET /reportes/{id}/vacunas-disponibles`**

```json
[{ "vacunaId": 30, "codigo": "VARICELA", "nombre": "Varicela", "esquema": { "id": "…", "version": 1 } }]
```

- Son las vacunas activas que tienen un esquema que cubre el día 1 del mes (las de `esquemasDelPeriodo`, de la DDRISS antes que el nacional) y que el reporte todavía no tiene.
- Van en el orden de `GET /reportes/{id}`.
- No piden que el reporte esté en Borrador: la pantalla solo muestra el botón cuando `editable` es `true`.

**`POST /reportes/{id}/vacunas`** con `{ "vacunaId": 30, "versionFila": 5 }`, que responde 201:

```json
{
  "versionFila": 6,
  "orden": [3, 30, 12],
  "vacuna": { "…": "VacunaDeReporte, con base" },
  "formulario": { "…": "VacunaDeFormulario, con base y celdas: []" }
}
```

- `orden` son los `vacunaId` del reporte en el orden de `GET /reportes/{id}`, para que la pantalla ponga la pestaña en su lugar.
- Fija el esquema que da `esquemasDelPeriodo` **en ese momento**. Si luego cambia, el reporte conserva el fijado.

**`DELETE /reportes/{id}/vacunas/{vacunaId}?versionFila=5`**, que responde 200 `{ "versionFila": 6 }`.

- Borra la fila de `reporte_vacuna`. Sus `detalle_produccion`, `detalle_dimension` y `resultado_validacion` se borran en cascada, por las llaves que ya existen.

### Errores

| Código | HTTP | Cuándo |
|---|---|---|
| `ENTRADA_INVALIDA` | 400 | Cuerpo o consulta mal formados (`vacunaId` o `versionFila` que no son enteros ≥ 1, campos de más) |
| `NO_ENCONTRADO` | 404 | Reporte inexistente o de otro establecimiento; al quitar, la vacuna no está en el reporte |
| `REPORTE_NO_EDITABLE` | 409 | El reporte no está en `BORRADOR` |
| `PERIODO_CERRADO` | 409 | El mes no está `ABIERTO` ni `EN_CIERRE` en `cierre_periodo` (`MESES_EDITABLES` de la captura) |
| `REPORTE_DESACTUALIZADO` | 409 | La `versionFila` no es la del reporte |
| `VACUNA_YA_EN_REPORTE` | 409 | Al agregar, el reporte ya la tiene |
| `VACUNA_BASE` | 409 | Al quitar, la versión guardada está marcada |
| `VACUNA_CON_OBSERVACIONES` | 409 | Al quitar, la vacuna tiene filas en `observacion_revision`. Hoy no ocurre: lo decidirá HU-29 |
| `VACUNA_NO_DISPONIBLE` | 422 | Al agregar, la vacuna no existe, está inactiva o no tiene esquema que cubra el día 1 del mes |

`POST /reportes` conserva 422 `SIN_ESQUEMAS`, pero solo cuando no hay ninguna vacuna activa con esquema para el mes.

### Bitácora

Las dos escrituras van en `enTransaccion`. La primera consulta es el `SELECT … FOR UPDATE` del reporte, como en el `PUT` de la captura (nota del 2026-10-23). Las dos suben `reporte_produccion.version_fila`. Las acciones ya existen en `ACCIONES`.

- **Agregar:** `CREAR`, módulo `PRODUCCION`, entidad `reporte_vacuna`, con `valoresNuevos = { reporteId, vacunaId, vacunaCodigo, esquemaId, esquemaVersion }`.
- **Quitar:** `ELIMINAR`, la misma entidad, con `valoresAnteriores = { reporteId, vacunaId, vacunaCodigo, esquemaId, esquemaVersion, totalDeclarado, datosAdicionales, celdas }`. `celdas` va en la forma de `Celda` del formulario (dosis, procedencia, `claveCombinacion`, valores y cantidad), para que se pueda reconstruir lo borrado.

## Diseño

### Esquemas

- `aEsquema` (`esquemas.service.js`) devuelve `incluirPorDefecto: doc.incluir_por_defecto ?? true`.
- **Al crear:** uno vacío guarda `incluirPorDefecto ?? false`, y una copia guarda el del cuerpo o, si no viene, el del esquema copiado (también `?? true`).
- **El `PUT`** solo lo cambia si viene en el cuerpo.
- `esquemasDelPeriodo` lo agrega a su proyección y a cada elemento del `Map` (`{ id, version, incluirPorDefecto }`).
- La bitácora de esquemas no cambia de forma: el campo aparece en `diferencias` como cualquier otro.

### Crear el reporte

- `vacunasConEsquema` sigue devolviendo todas las vacunas con esquema para el mes, cada una con su `incluirPorDefecto`.
- `crearReporte`:
  - fija solo las que tienen `incluirPorDefecto === true`;
  - si no hay ninguna con esquema, responde 422 `SIN_ESQUEMAS`;
  - si hay con esquema pero ninguna marcada, crea el reporte sin filas en `reporte_vacuna` (el `INSERT … VALUES ?` no se ejecuta con la lista vacía).
- `obtenerReporte` ya lee de MongoDB la versión guardada de cada vacuna (dosis y dimensiones). De ahí saca `base`; si el documento no está, `true`.

### Endpoints nuevos (`vacunasDelReporte.service.js`)

- **`listarDisponibles`:** reporte propio, `vacunasConEsquema` del mes (se exporta desde `reportes.service.js`), menos las que el reporte ya tiene.
- **`agregarVacuna`:**
  1. Valida el cuerpo con `segun`.
  2. Fuera de la transacción, lee el esquema del mes con `esquemasDelPeriodo`. Si no hay, o la vacuna no existe o está inactiva, responde 422.
  3. Dentro de la transacción: `SELECT … FOR UPDATE` del reporte, estado, mes, `versionFila`, que la vacuna no esté ya; luego el `INSERT`, la versión nueva y la bitácora.
  4. Al final arma la respuesta con las mismas funciones que `obtenerReporte` y `obtenerFormulario`, para una sola vacuna.
  5. Si el `INSERT` choca con `uq_repvac` (dos altas a la vez), responde 409 `VACUNA_YA_EN_REPORTE`.
- **`quitarVacuna`:**
  1. Lee `versionFila` de la consulta.
  2. Dentro de la transacción: `SELECT … FOR UPDATE` del reporte, estado, mes, `versionFila`. Busca la fila de la vacuna (404 si no está) y lee su versión en MongoDB. La lectura de MongoDB va antes de la transacción, para no tenerla abierta mientras se espera.
  3. Responde 409 `VACUNA_BASE` si está marcada y 409 `VACUNA_CON_OBSERVACIONES` si tiene observaciones.
  4. Lee sus celdas para la bitácora, borra la fila, sube la versión y registra.

### Editor de esquemas

- En `EditorEsquema.jsx`, una tarjeta «Reportes» con un `Checkbox` «Incluir en los reportes nuevos».
- Descripción de la tarjeta: «Marcada, la vacuna entra en cada reporte nuevo del mes que cubre esta versión. Sin marcar, el establecimiento la agrega si la aplica.».
- En solo lectura, la casilla está deshabilitada, como los demás controles.
- `contenidoDe` incluye `incluirPorDefecto`: se manda en el `POST` y el `PUT`, y cuenta para «cambios sin guardar».
- `VistaPreviaEsquema` muestra una línea junto a la de procedencia, con el mismo estilo `text-sm text-muted-foreground`: «Entra en los reportes nuevos.» o «El establecimiento la agrega al reporte si la aplica.».

### Captura (`CapturaReporte.jsx`)

- **«Agregar vacuna»** (`Button` `outline`, `size="sm"`, con `Plus`):
  - va al final de la fila de pestañas y solo se ve si `formulario.editable`;
  - abre un `Dialog` que pide `GET …/vacunas-disponibles`, con `Skeleton` mientras carga, `AvisoError` con «Reintentar» si falla y «No hay más vacunas con formulario para este mes.» si la lista viene vacía;
  - cada vacuna disponible va en una fila con su nombre, «versión N» y un botón «Agregar».
- **Al agregar:**
  - `POST` con la `versionFila` actual;
  - con la respuesta: la `versionFila` nueva pasa a ser la de la cadena de guardado, la vacuna se agrega a `reporte.vacunas` y a `formulario.vacunas`, las pestañas se reordenan con `orden`, y la pestaña nueva queda seleccionada;
  - lo que no se ha guardado en las demás pestañas se conserva;
  - aviso `toast.success("Varicela agregada al reporte.")`.
- **«Quitar vacuna»** (`Button` `ghost`, `size="sm"`, `text-destructive`, con `Trash2`):
  - va en el encabezado de la tarjeta A de cada vacuna con `base: false`, solo si `formulario.editable`;
  - abre un `AlertDialog`:
    - sin cantidades: «¿Quitar Varicela del reporte?»;
    - con celdas guardadas o sin guardar, o datos adicionales: agrega «Se borrarán sus cantidades y no se pueden recuperar.»;
  - la acción va con `evento.preventDefault()`, como en el SPEC 25.
- **Al quitar:**
  - `DELETE` con la `versionFila` actual;
  - con la respuesta: la versión nueva, se quita la vacuna del estado y de los cambios pendientes, y se selecciona la pestaña de al lado;
  - `toast.success("Varicela se quitó del reporte.")`.
- **Mientras se agrega, se quita o se guarda,** los tres botones (agregar, quitar, guardar) quedan deshabilitados, para que no se crucen las `versionFila`.
- **Un error de la API** (409 y 422) se muestra con `AvisoError` dentro del `Dialog` o el `AlertDialog`, que siguen abiertos. Un 409 `REPORTE_DESACTUALIZADO` da el mismo aviso que al guardar.
- **Reporte sin vacunas:** en lugar de las pestañas se ve «Este reporte todavía no tiene vacunas. Agregue las que aplicó el establecimiento.», con el botón «Agregar vacuna».
- **Línea gráfica:** se usan los componentes de shadcn y los colores de `index.css`, sin colores escritos a mano ni animaciones nuevas, como dice la «Línea gráfica» del SPEC 30.

### Archivos que aparecen o cambian

| Archivo | Cambio |
|---|---|
| `backend/openapi.yaml` | Campos `incluirPorDefecto` y `base`, tres endpoints, errores |
| `backend/db/02_colecciones_mongodb.js`, `docs/base-de-datos/diseño_bd/02_colecciones_mongodb.js` | Validador y nota v0.8 (idénticas) |
| `docs/base-de-datos/CONTEXTO BD.md` | MongoDB v0.8 |
| `backend/src/modulos/configuracion/esquemas.service.js` | `incluirPorDefecto` |
| `backend/src/modulos/produccion/reportes.service.js`, `captura.service.js` | Solo las marcadas, `base` |
| `backend/src/modulos/produccion/vacunasDelReporte.service.js` | Nuevo |
| `backend/src/modulos/produccion/produccion.routes.js`, `produccion.controller.js` | Tres rutas |
| `backend/tests/vacunasDelReporte.test.js` | Nuevo |
| `backend/tests/reportes.test.js` y las pruebas de esquemas | Ajustes |
| `frontend/src/api/produccion.js` | `listarVacunasDisponibles`, `agregarVacuna`, `quitarVacuna` |
| `frontend/src/paginas/configuracion/EditorEsquema.jsx`, `VistaPreviaEsquema.jsx` y sus pruebas | La marca |
| `frontend/src/paginas/registro/CapturaReporte.jsx` y su prueba | Agregar y quitar |
| `docs/SPECS/HISTORIAS_DE_USUARIO.md`, `CLAUDE.md` | Documentación |

## Plan de implementación

En cada paso se corren solo las pruebas que toca. Las dos suites completas se corren al final.

1. **Contrato.** Todo lo de `openapi.yaml` de este spec. Se comprueba que `/api/docs` carga.
2. **Modelo de MongoDB.** Se **detiene y se pide confirmación** antes de editar `backend/db/` (`CLAUDE.md`). Después: el validador en las dos copias del 02 (`diff` para comprobar que quedan iguales), la nota v0.8 y `CONTEXTO BD.md`. No se ejecuta nada en Atlas.
3. **Esquemas en el backend.** `incluirPorDefecto` en `aEsquema`, al crear, en la copia, en el `PUT` y en `esquemasDelPeriodo`. Pruebas en las de esquemas, con vacunas `ZVT_HU31*`.
4. **Crear el reporte y `base`.** `crearReporte` con solo las marcadas y el 422 nuevo; `base` en `obtenerReporte` y en `obtenerFormulario`. Ajustes en `reportes.test.js`.
5. **Endpoints nuevos.** `vacunasDelReporte.service.js`, rutas y controlador. Pruebas en `vacunasDelReporte.test.js`.
6. **Editor de esquemas.** La casilla, `contenidoDe`, la línea de la vista previa y sus pruebas.
7. **Captura.** El cliente de la API, «Agregar vacuna», «Quitar vacuna», el reporte sin vacunas y sus pruebas.
8. **Documentación.**
   - «Avance» de HU-19.
   - Notas en HU-16 (la marca), HU-20 (las pestañas que se agregan o se quitan) y HU-29 (permitir agregar y quitar en Corrección solicitada, y decidir qué pasa con una vacuna que tiene observaciones).
   - «Notas de contexto» de `CLAUDE.md`.

## Pruebas

Las pruebas del backend firman el token de `cs1201` y usan el **año 2025**, que no usa ninguna otra prueba. Crean sus meses en `periodo` y `cierre_periodo` por SQL, y vacunas `ZVT_HU31A` (marcada), `ZVT_HU31B` (sin marcar) y `ZVT_HU31C` (sin marcar), con sus esquemas `VIGENTE` insertados directamente en MongoDB. Lo borran todo al inicio y al final, como `reportes.test.js`.

- **Esquemas:**
  - uno vacío empieza en `false`;
  - una copia hereda la marca, y sin el campo en el documento hereda `true`;
  - el `PUT` la cambia y, si no viene, la conserva;
  - un documento sin el campo responde `true`.
- **`POST /reportes`:**
  - fija solo `ZVT_HU31A`;
  - con ninguna marcada, crea el reporte sin vacunas;
  - sin ninguna con esquema, responde 422 `SIN_ESQUEMAS`;
  - `GET /reportes/{id}` y `/formulario` traen `base`.
- **`vacunas-disponibles`:** trae `ZVT_HU31B` y `ZVT_HU31C`, pero no `ZVT_HU31A`, una inactiva ni una sin esquema.
- **Agregar:**
  - 201 con `versionFila` + 1, `orden`, `vacuna` y `formulario` (con `base: false`);
  - la bitácora `CREAR`;
  - el 409 `VACUNA_YA_EN_REPORTE`, también con dos altas a la vez;
  - el 422 `VACUNA_NO_DISPONIBLE`.
- **Quitar:**
  - borra la fila y sus cantidades (sin filas en `detalle_produccion` ni `detalle_dimension` de esa fila);
  - la bitácora `ELIMINAR` con todas las celdas;
  - 409 `VACUNA_BASE` con `ZVT_HU31A`;
  - 409 `VACUNA_CON_OBSERVACIONES` con una observación insertada por SQL;
  - 404 si la vacuna no está.
- **Comunes a agregar y quitar:**
  - 409 `REPORTE_NO_EDITABLE` (estado cambiado por SQL);
  - 409 `PERIODO_CERRADO`;
  - 409 `REPORTE_DESACTUALIZADO`;
  - 404 con un reporte de otro establecimiento;
  - 403 sin `REPORTE_EDITAR`;
  - 400 con un cuerpo o una consulta inválidos.
- **Frontend (editor):** la casilla empieza sin marcar en uno vacío, marcada en una copia del vigente marcado, y se manda en el `POST` y el `PUT`. La vista previa dice cuál de las dos líneas.
- **Frontend (captura):**
  - «Agregar vacuna» lista las disponibles y, al agregar, aparece la pestaña en su lugar y queda seleccionada;
  - una cantidad sin guardar de otra pestaña sigue ahí después de agregar;
  - la `versionFila` nueva se usa en el siguiente guardado;
  - «Quitar vacuna» no aparece en una base;
  - sin cantidades, el `AlertDialog` no trae el aviso de que se borran, y con cantidades sí;
  - un 409 se ve dentro del diálogo;
  - un reporte sin vacunas muestra el aviso y el botón;
  - con `editable: false` no hay botones.

## Criterios de aceptación

- [ ] Un reporte nuevo lleva solo las vacunas cuya versión del mes está marcada, o que no traen el campo.
- [ ] Con vacunas con esquema pero ninguna marcada, el reporte se crea sin vacunas. Sin ninguna con esquema, responde 422 `SIN_ESQUEMAS`.
- [ ] Un borrador vacío empieza sin marcar, y una copia hereda la marca de la versión copiada.
- [ ] El editor guarda la marca, y la vista previa y la versión de un esquema la muestran.
- [ ] El Personal del establecimiento agrega a un reporte en Borrador una vacuna activa con esquema para el mes, y no puede agregar una que ya está, una inactiva o una sin esquema.
- [ ] Puede quitar una vacuna que no es base, con sus cantidades. No puede quitar una base (409 `VACUNA_BASE`).
- [ ] Agregar y quitar exigen el reporte en Borrador, el mes editable y la `versionFila` vigente, y suben la versión.
- [ ] Cada alta deja una fila `CREAR` en la bitácora, y cada baja una `ELIMINAR` con todas las celdas borradas.
- [ ] Al agregar o quitar, las cantidades sin guardar de las demás pestañas se conservan, y el siguiente guardado no da 409.
- [ ] Quitar una vacuna con cantidades pide confirmación con el aviso de que se borran.
- [ ] Ningún documento publicado de `esquemas_captura` cambió, y en Atlas no se ejecutó nada.
- [ ] Las dos copias del 02 son idénticas (`diff`).
- [ ] `backend/db/01…`, los permisos, `transicion_estado` y los `package.json` no cambiaron.
- [ ] Los endpoints responden como dice `openapi.yaml`, y `/api/docs` carga.
- [ ] Las dos suites pasan (`npm test` en `backend/` y en `frontend/`) y `vite build` termina sin errores.
- [ ] **A mano, contra la API real, con un mes de prueba que no sea real:**
  - en el editor, una versión de una vacuna de prueba sin marcar se publica, y el reporte nuevo no la trae;
  - se agrega, se capturan cantidades y se quita;
  - una base no muestra «Quitar»;
  - al terminar, se borran el reporte y el mes de prueba, y se desactiva la vacuna de prueba.
- [ ] El «Avance» de HU-19, las notas de HU-16, HU-20 y HU-29 y las «Notas de contexto» de `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** la marca en el esquema de MongoDB (decisión del equipo). **No:** en MySQL, porque cada DDRISS publica su versión y la marca sigue a esa versión.
- **Sí:** `incluir_por_defecto`, con un borrador vacío en `false` (decidido en la fase de preguntas). **No:** `vacuna_base`, porque el campo describe qué hace la marca y no cómo se muestra. **No:** `true` por defecto, que metería en todos los reportes una vacuna nueva salvo que alguien la desmarque.
- **Sí:** sin el campo, cuenta como `true`, y sin migración (decidido en la fase de preguntas). **No:** la migración de la propuesta, que cambiaría documentos `VIGENTE` e `HISTORICO`. **No:** «sin el campo, `false`», que dejaría los reportes nuevos vacíos de golpe.
- **Sí:** el campo opcional en el validador del 02, sin cambiar Atlas (decidido en la fase de preguntas). El validador de Atlas no tiene `additionalProperties: false`, así que ya acepta el campo. **No:** un script con `collMod`.
- **Sí:** las semillas no cambian (decidido en la fase de preguntas). **No:** marcar algunas en `false`, que es un dato del dominio por validar con la DDRISS y obligaría a recrear la base.
- **Sí:** el reporte se crea vacío si ninguna está marcada pero hay alguna para agregar (propuesta, confirmado). **No:** 422 siempre que no haya base.
- **Sí:** base = la versión guardada está marcada (decidido en la fase de preguntas). **No:** una columna en `reporte_vacuna`, que cambia MySQL. Consecuencias: una vacuna agregada cuya versión ya está marcada queda como base, y en los reportes creados antes de este spec ninguna vacuna se quita.
- **Sí:** `DELETE` con `?versionFila=N` (decidido en la fase de preguntas). **No:** un `DELETE` con cuerpo, que HTTP no garantiza. **No:** `POST …/quitar`.
- **Sí:** la bitácora `ELIMINAR` guarda la fila y todas sus celdas (decidido en la fase de preguntas). **No:** solo un resumen, porque no permitiría reconstruir lo borrado.
- **Sí:** 409 `VACUNA_CON_OBSERVACIONES` (decidido en la fase de preguntas). **No:** dejar que `observacion_revision.reporte_vacuna_id` quede en `NULL`, porque la observación perdería su vacuna.
- **Sí:** `POST` responde `{ versionFila, orden, vacuna, formulario }` (decidido en la fase de preguntas). **No:** recargar todo el formulario, que pierde lo que no se ha guardado en las otras pestañas.
- **Sí:** la pestaña nueva en el orden del catálogo (decidido en la fase de preguntas). **No:** al final. `orden` evita que el frontend repita el `ORDER BY` de MySQL (con `orden_informe` nulo).
- **Sí:** «Agregar vacuna» tras las pestañas y «Quitar vacuna» en la tarjeta A (decidido en la fase de preguntas). **No:** un menú «Vacunas del reporte».
- **Sí:** se permite en el mes `ABIERTO` o `EN_CIERRE`, como el `PUT` de la captura (decidido al escribir el spec). **No:** solo `ABIERTO`, porque la captura sí se puede guardar en `EN_CIERRE`.
- **Sí:** `vacunas-disponibles` pide `REPORTE_EDITAR` (decidido al escribir el spec). Solo sirve para agregar.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Una DDRISS publica versiones sin marcar y los reportes nuevos salen sin vacunas que sí aplican | El reporte se crea igual y el Personal las agrega. La casilla del editor explica qué hace. |
| Dos pestañas o dos personas agregan o quitan a la vez | `SELECT … FOR UPDATE` como primera consulta, `versionFila` y `uq_repvac`, con la prueba de dos altas en paralelo. |
| La lectura de MongoDB dentro de una transacción de MySQL la deja abierta | Se lee antes de la transacción, como `crearReporte`. Si el esquema cambió en ese intervalo, se fija el que se leyó. |
| Agregar o quitar mientras se guarda cruza las `versionFila` | Los tres botones se deshabilitan mientras hay una petición en curso. |
| Un reporte que volvió de Corrección solicitada tiene observaciones | 409 `VACUNA_CON_OBSERVACIONES`. Agregar y quitar en ese estado quedan para HU-29. |
| Editar `backend/db/` sin autorización | El paso 2 se detiene y pide confirmación. Solo cambian el validador y la documentación, y no se ejecuta nada. |

## Lo que **no** entra en este spec

- Agregar y quitar en Corrección solicitada (HU-29).
- Cambios en MySQL, migraciones o ejecutar algo en Atlas.
- Cambios en las semillas o en los permisos.
- Cambiar la versión fijada de una vacuna del reporte.
- Que otro rol agregue vacunas al reporte de un establecimiento.

Cada uno de esos, si llega, va en su propio spec.
