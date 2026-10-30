# Propuesta para el spec 31 · Vacunas base y vacunas agregadas al reporte

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo el 2026-10-29. No es el spec: el spec se escribe en `specs/31-…md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** HU-19 (crear el reporte mensual), que ya está terminada: el spec **modifica** su criterio de vacunas y lo anota en su «Avance». Toca también HU-16 (el editor de esquemas lleva la marca nueva) y HU-20 (la captura muestra las pestañas de las vacunas que se agregan o quitan).
> **Depende de:** los SPEC 19, 20, 22, 23 y 24, ya en `main`. Conviene hacerlo después del SPEC 30.
> **Rama sugerida:** `spec-31-vacunas-del-reporte`, desde `main`.
> **Toca zonas protegidas:** el modelo de MongoDB (`backend/db/02_colecciones_mongodb.js`, sus semillas y `CONTEXTO BD.md`). El equipo decidió el 2026-10-29 que el cambio va en MongoDB; el spec igual pide confirmación antes de editar `backend/db/`. MySQL no cambia. Los permisos no cambian (se usa `REPORTE_EDITAR`).

## 1. Por qué existe

Hoy `POST /reportes` fija en `reporte_vacuna` **todas** las vacunas activas que tienen un esquema que cubre el día 1 del mes (`reportes.service.js`, función que usa `esquemasDelPeriodo`). Así, cada reporte lleva vacunas que el establecimiento no aplica, y sus pestañas quedan vacías o con datos innecesarios.

## 2. Decisiones del equipo (2026-10-29)

| Tema | Decisión |
|---|---|
| Qué vacunas entran al crear el reporte | Solo las **vacunas base**: las que su esquema (el de la DDRISS o, si no hay, el nacional) marca como base |
| Dónde se marca «base» | En el **esquema de captura de MongoDB** (no en MySQL) |
| Agregar vacunas | El Personal de establecimiento puede agregar al reporte una vacuna activa que tenga un **esquema publicado que cubra el día 1 del mes** (la misma regla de `esquemasDelPeriodo`). No crea vacunas |
| Quitar vacunas | Puede quitar las que agregó. **Una vacuna base no se puede quitar** |
| Quitar con cantidades | Se permite, con una **advertencia y una confirmación** (se borran sus cantidades) |
| En qué estado | Solo en **Borrador** |
| Permiso | `REPORTE_EDITAR` (el mismo de la captura) |
| Corrección solicitada | También deberá permitirse cuando el reporte vuelva por corrección, pero **no se hace en este spec**: queda anotado en HU-29 |

## 3. Qué cambia

### 3.1 MongoDB: la marca en el esquema

- `esquemas_captura` agrega un campo booleano, por ejemplo **`incluir_por_defecto`** (en la API, `incluirPorDefecto`).
- Se agrega al validador de `02_colecciones_mongodb.js` (las dos copias del script, como en `cambio_mongo.md`), a las semillas de `04_datos_prueba_mongo.js` y a `CONTEXTO BD.md` (MongoDB v0.8).
- Es parte de la versión: como una versión publicada no se edita (regla 5 de `AGENTS.md`), para cambiar la marca se publica una versión nueva.

### 3.2 Esquemas (HU-16)

- `POST`/`PUT /esquemas-captura` y `GET /esquemas-captura/{id}` aceptan y devuelven `incluirPorDefecto`. Una copia del vigente la hereda.
- El editor de borradores agrega una casilla «Incluir en los reportes nuevos» (nombre a definir). La vista previa y `/configuracion/esquemas/:id` la muestran.

### 3.3 Crear el reporte (HU-19)

- `POST /reportes` fija solo las vacunas activas cuyo esquema del mes tiene `incluirPorDefecto = true`.
- `GET /reportes/{id}` indica en cada vacuna si es base (`base: true/false`), sacado de la versión guardada en `reporte_vacuna`, para que la pantalla sepa cuáles no se pueden quitar.

### 3.4 Endpoints nuevos (contrato primero en `openapi.yaml`)

- `GET /reportes/{id}/vacunas-disponibles`: las vacunas que se pueden agregar (activas, con esquema para el mes y que el reporte todavía no tiene), con su versión.
- `POST /reportes/{id}/vacunas { vacunaId, versionFila }`: agrega la vacuna con el esquema del mes. Bitácora `CREAR`.
- `DELETE /reportes/{id}/vacunas/{vacunaId}` (con `versionFila`): quita la fila de `reporte_vacuna` y, en cascada, sus cantidades (`detalle_produccion`, `detalle_dimension`). Bitácora `ELIMINAR`, con lo que se borró.

Los dos exigen `REPORTE_EDITAR`, que el reporte sea del establecimiento del usuario y esté en Borrador, y la `versionFila` del reporte (409 `REPORTE_DESACTUALIZADO`, como el `PUT` de la captura); los dos suben la versión. Errores a definir en el spec, por ejemplo: 409 si el reporte no está en Borrador, 409 si la vacuna ya está, 422 si no tiene esquema para el mes o está inactiva, 409 `VACUNA_BASE` al quitar una base.

### 3.5 Pantalla (Registro de producción)

- Un botón «Agregar vacuna» abre la lista de `vacunas-disponibles`; al agregar, aparece su pestaña.
- Cada vacuna que no es base tiene «Quitar». Si tiene cantidades guardadas (o sin guardar), un `AlertDialog` avisa que se borrarán y pide confirmar.
- Las vacunas base no muestran «Quitar».
- Con cambios sin guardar en otra vacuna, el orden de guardar y la `versionFila` encadenada deben seguir funcionando (`CapturaReporte.jsx`).

## 4. Por decidir al escribir el spec

1. **Nombre del campo** (`incluir_por_defecto`, `vacuna_base`…) y su valor por defecto en un borrador nuevo.
2. **Los esquemas ya publicados** (Atlas y semillas) no tienen la marca. Propuesta: una migración única, hecha a mano como la v0.7, que la pone en `true` en todos los esquemas actuales, para que los reportes nuevos sigan como hoy hasta que el administrador publique versiones con la marca que quiera. Si la marca falta, el backend la toma como `false`. Hay que confirmar que esta migración no choca con la regla de versiones inmutables (es un campo nuevo, no un cambio de contenido).
3. **Si ninguna vacuna es base:** hoy responde 422 `SIN_ESQUEMAS`. Propuesta: crear el reporte igual si hay al menos una vacuna disponible para agregar, y dejar 422 solo si no hay ninguna.
4. **Los reportes ya creados** (por ejemplo, los de la semilla y el 287): se quedan con sus vacunas. ¿Sus vacunas que no son base se pueden quitar? Propuesta: sí, con la misma regla.
5. Si el esquema de una vacuna agregada cambia de versión después, el reporte conserva la que se fijó al agregarla (como hoy).

## 5. Cómo se verifica

- Pruebas del backend con un año propio (como los demás specs de producción: `cs1201`, vacunas `ZVT_HU31*`, un año que no usen otras pruebas): se crean solo las base; agregar y quitar; no se quita una base; quitar borra sus cantidades; los 409 de estado y de `versionFila`; la bitácora.
- Pruebas del frontend: «Agregar vacuna», «Quitar» con y sin cantidades, sin «Quitar» en las base.
- A mano contra la API real con un mes de prueba.
- Al terminar: notas de contexto en `CLAUDE.md`, el «Avance» de HU-19 y la nota en HU-29 (permitir agregar y quitar en Corrección solicitada).
