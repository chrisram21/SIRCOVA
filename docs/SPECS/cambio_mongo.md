# Cambio MongoDB v0.7: formularios de captura por DDRISS

Instrucciones para Claude Code. **La base de datos ya se migró a mano** con mongosh (`migracion_mongo_v07_esquemas_por_ddriss.js`); esta tarea solo actualiza los archivos del repo para que digan lo mismo que la base: la documentación y los scripts 02 y 04 (que son la referencia del modelo y con los que se recrea la base). Primero lee `AGENTS.md` y `docs/base-de-datos/CONTEXTO BD.md`. MySQL no cambia, el backend no se modifica y **no se ejecuta nada contra ninguna base**.

## 1. Contexto

- SIRCOVA usa MongoDB (`vacunacion_config`) para la configuración. La colección `esquemas_captura` guarda el "molde" del formulario de cada vacuna (dosis, procedencia, dimensiones de desagregación, secciones del 5C, campos adicionales y reglas). React genera el formulario a partir de ese documento.
- Hoy `esquemas_captura` es **global**: no tiene campo de territorio y el índice `uq_vigente_por_vacuna` permite una sola versión VIGENTE por vacuna en todo el país. El script dice que no cambió en v0.3 "porque el formulario 5C es nacional".
- Desde v0.3, `reglas_validacion` y `configuracion_indicadores` sí tienen el subesquema `territorio`: `{ nivel: "NACIONAL" | "DDRISS", ddriss_codigo }`, donde `ddriss_codigo` es `ddriss.codigo` de MySQL (p. ej. `"DDRISS_SM"`) y es `null` si el nivel es NACIONAL. Para una DDRISS, el backend usa la versión VIGENTE de esa DDRISS si existe; si no, la VIGENTE NACIONAL.
- **Decisión del equipo (2026-10-23):** cada DDRISS debe poder tener su propio formulario. El formulario NACIONAL es la base; cuando una DDRISS lo edita, se crea un documento nuevo (copia de la base con sus cambios) con `territorio.nivel = "DDRISS"` y el código de la DDRISS que lo creó. La base nacional no se modifica.

## 2. Archivos a modificar

Rutas del repo (revisado el 2026-10-23, commit 8221c41). El script 02 está duplicado: actualizar **las dos copias** para que queden idénticas.

| Archivo | Qué cambia |
|---|---|
| `backend/db/02_colecciones_mongodb.js` y `docs/base-de-datos/diseño_bd/02_colecciones_mongodb.js` | Validador, índices y semillas de `esquemas_captura`; encabezado de versión |
| `backend/db/04_datos_prueba_mongo.js` | Agregar `territorio` (y `basado_en`) a los esquemas de prueba |
| `docs/base-de-datos/CONTEXTO BD.md` | Descripción de `esquemas_captura`, regla de resolución y bitácora (MongoDB v0.7) |
| `AGENTS.md` | La tabla de documentos dice "MySQL v0.9, MongoDB v0.6": cambiar a MongoDB v0.7 |

No modificar: los scripts SQL (01, 03, 05, 06, 07), los diagramas DBML, el código de `backend/src` y `frontend/src`, ni el orden de trabajo de las historias de usuario. HU-16 (crear esquema de captura) y HU-17 (publicar nueva versión) en `docs/SPECS/HISTORIAS_DE_USUARIO.md` usarán este modelo cuando se trabajen; no hace falta editarlas ahora.

## 3. Cambios en `02_colecciones_mongodb.js`

### 3.1 Encabezado

Subir la versión del script a **0.7** con la fecha del cambio y agregar un bloque "Cambios v0.7" que resuma: `esquemas_captura` agrega `territorio` y `basado_en`; una DDRISS puede publicar su propio formulario a partir del nacional; las dimensiones solo pueden venir de `catalogo_dimensiones`. Corregir la frase de v0.3 que dice que `esquemas_captura` no cambia porque el 5C es nacional (dejar claro que eso cambió en v0.7).

Actualizar el comentario del subesquema `territorio` para que diga que aplica a reglas, indicadores **y esquemas de captura**.

### 3.2 Validador de `esquemas_captura`

1. Agregar `"territorio"` a `required`.
2. Agregar la propiedad `territorio: territorio` (el mismo subesquema reutilizable que ya usan reglas e indicadores).
3. Agregar la propiedad `basado_en` (sugerencia 1, ver sección 4):

```js
basado_en: {
  bsonType: ["object", "null"],
  description: "Versión NACIONAL de la que se copió este formulario de DDRISS; null en los nacionales",
  required: ["esquema_id", "version"],
  properties: {
    esquema_id: { bsonType: "objectId", description: "_id del esquema nacional usado como base" },
    version:    { bsonType: "int", description: "Copia del número de versión de la base" }
  }
}
```

4. Mantener `version_anterior_id` con su significado actual: la versión anterior **del mismo territorio** (la cadena de versiones de esa DDRISS o la nacional). `basado_en` es otra cosa: de qué versión nacional salió la copia.

### 3.3 Índices

- `uq_vacuna_version` (`vacuna.codigo` + `version`) **se queda igual**: el número de versión sigue siendo único por vacuna en todo el país, igual que en las reglas (`codigo` + `version`). Así `reporte_vacuna.esquema_version` en MySQL no se vuelve ambiguo y MySQL no cambia. Ejemplo: HEXA v2 es nacional; si San Marcos crea su formulario, ese será HEXA v3 con territorio DDRISS_SM.
- Reemplazar `uq_vigente_por_vacuna` por un índice que permita una VIGENTE por vacuna **y territorio**, con el mismo patrón que `uq_regla_vigente_territorio`:

```js
// Solo una versión VIGENTE por vacuna y territorio (una nacional y, si hace
// falta, una por DDRISS).
db_.esquemas_captura.createIndex(
  { "vacuna.codigo": 1, "territorio.nivel": 1, "territorio.ddriss_codigo": 1 },
  { unique: true, partialFilterExpression: { estado: "VIGENTE" }, name: "uq_esquema_vigente_territorio" }
);
```

- Ajustar `ix_vigencia` para incluir el territorio: `{ "vacuna.codigo": 1, "territorio.ddriss_codigo": 1, "vigencia.desde": -1 }`.

### 3.4 Semillas

- Todos los esquemas de ejemplo del 02 son NACIONAL: agregarles `territorio: territorioNacional` y `basado_en: null` (se puede reutilizar o ampliar el helper `conTerritorioNacional`). Mover la definición de `territorioNacional` antes de los `insertMany` de esquemas si hace falta, y actualizar el comentario "Todas las reglas e indicadores de ejemplo son nacionales" para que incluya los esquemas.
- No cambiar los `_id` existentes: `hexa_v2` (`66f8a1c2e4b0a1b2c3d4e5f6`) lo usa el ejemplo de `reporte_vacuna` en MySQL.

### 3.5 Datos de prueba (`04_datos_prueba_mongo.js`)

- Los esquemas VIGENTES de prueba (ROTA, SPR, NEUMO) llevan `territorio` NACIONAL y `basado_en: null`.
- Convertir el borrador **Hexavalente v3** (el que agrega la dimensión `pueblo`) en el ejemplo de formulario de DDRISS: `territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" }`, `basado_en: { esquema_id: hexa_v2, version: NumberInt(2) }` y `version_anterior_id: null` (es el primero de esa DDRISS). Actualizar el comentario de la cabecera del 04 para explicarlo.
- Verificar que el script siga siendo reejecutable (borra y reinserta lo que tiene `datos_prueba: true`).

## 4. Reglas del modelo (para documentar en `CONTEXTO BD.md`)

**Resolución del formulario.** Para capturar una vacuna en un establecimiento, el backend toma la DDRISS del establecimiento (`establecimiento.ddriss_id` → `ddriss.codigo`) y busca el esquema VIGENTE de esa vacuna con ese `ddriss_codigo`; si no hay, usa el VIGENTE NACIONAL. El reporte guarda el que usó en `reporte_vacuna.esquema_mongo_id` + `esquema_version` (campos que ya existen).

**Crear o editar el formulario de una DDRISS.** Se copia el esquema VIGENTE (el de la DDRISS si ya tiene uno; si no, el nacional) a un documento nuevo en BORRADOR con `territorio` de la DDRISS, `version` = máxima versión de esa vacuna en todo el país + 1, `version_anterior_id` = versión anterior de esa DDRISS (o null) y `basado_en` = versión nacional de la que parte. Al publicarlo, la versión VIGENTE anterior de esa DDRISS pasa a HISTORICO. La nacional no se toca.

**Sugerencia 1: `basado_en` (desactualización).** Cuando se publica una versión nacional nueva de una vacuna, los formularios de DDRISS cuyo `basado_en.esquema_id` ya no es la VIGENTE nacional quedan "desactualizados". El sistema puede avisar a esa DDRISS para que revise si adopta los cambios. El aviso no cambia el formulario de la DDRISS automáticamente.

**Sugerencia 2: dimensiones solo del catálogo.** Cada `dimensiones.desagregacion[].dimension` (y las de las desagregaciones por dosis) debe existir en `catalogo_dimensiones` con `activo: true`, y cada código de `valores` debe ser un valor activo de esa dimensión. Así, aunque cada DDRISS tenga su formulario, los datos usan los mismos códigos y el consolidado nacional y la comparación entre DDRISS siguen sumando. Una DDRISS puede usar cualquier dimensión del catálogo, pero no puede inventar una: agregar una dimensión al catálogo sigue siendo una acción global. `$jsonSchema` no puede validar contra otra colección, así que esta regla la valida el backend al guardar o publicar un esquema; documentarla como regla obligatoria en `CONTEXTO BD.md`.

**Lo que no cambia.** Las dosis siguen viniendo de MySQL (`vacuna`/`dosis`), así que una DDRISS no puede inventar dosis. Las reglas de validación que referencia un esquema se siguen resolviendo por territorio como hoy.

## 5. Documentación

- En `docs/base-de-datos/CONTEXTO BD.md`: agregar a la bitácora la entrada "MongoDB v0.7" (el modelo MySQL sigue en v0.9; dejar claro que este cambio es solo del script de Mongo), describir `territorio` y `basado_en` en la sección de `esquemas_captura` con las reglas de la sección 4, y cambiar "una sola versión VIGENTE por código (en reglas e indicadores, por código y territorio)" para que incluya los esquemas. Revisar si en la sección de reglas o en la bitácora v0.5 dice que el formulario es nacional y corregirlo.
- En `AGENTS.md`: MongoDB v0.6 → v0.7.

## 6. Verificación

1. Confirmar que las dos copias del 02 en el repo son idénticas (`diff`).
2. Revisar que los cambios del 02 y del 04 coinciden con lo que ya tiene la base: campos `territorio` (obligatorio) y `basado_en` en el validador, índices `uq_vacuna_version`, `uq_esquema_vigente_territorio` e `ix_vigencia` (con `territorio.ddriss_codigo`), y HEXA v3 de prueba como borrador de `DDRISS_SM`.
3. No ejecutar el 02 ni el 04 contra la base compartida (Atlas): el 02 hace `dropDatabase()`.
