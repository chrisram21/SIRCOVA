# SPEC 19 — Borradores del esquema de captura de una vacuna

> **Estado:** Implementado
> **Historia:** HU-16
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 12, SPEC 15, SPEC 16, SPEC 18
> **Fecha:** 2026-10-24
> **Objetivo:** Que el Administrador y el Revisor creen, editen y descarten en `/configuracion` el borrador del esquema de captura de una vacuna para su DDRISS, con sus dosis, dimensiones y secciones por grupo de edad, y que el backend rechace cualquier esquema que use dosis, dimensiones o valores inexistentes o inactivos.

## Por qué existe este spec

La colección `esquemas_captura` ya existe en el script 02 (v0.7), con su validador `$jsonSchema` y los índices `uq_vacuna_version`, `uq_esquema_vigente_territorio` e `ix_vigencia`. El 02 trae esquemas nacionales de Hexavalente (v1 `HISTORICO` y v2 `VIGENTE`), BCG, VPH, Td y Polio. El 04 agrega Rotavirus, SPR y Neumococo (`VIGENTE`), y Hexavalente v3 en `BORRADOR` para `DDRISS_SM`, con la dimensión `pueblo`. Hoy los esquemas solo se cargan con `mongosh`. `backend/openapi.yaml` tiene un borrador de `POST /esquemas-captura` sin `x-permiso` y con un cuerpo libre.

El esquema es el molde del formulario 5C de cada vacuna (`CONTEXTO BD.md` §6). Lo consumen el formulario de captura (HU-20), la vista previa (HU-18) y la publicación (HU-17). Este spec solo arma y guarda **borradores**. Publicarlos, su historial de versiones y la vista previa quedan para HU-17 y HU-18.

**Conceptos** (aclarados al definir el spec):

- Un **esquema** dice qué pide el formulario de una vacuna:
  - las **dosis** que se capturan (un subconjunto de las dosis activas de la vacuna en MySQL);
  - la **desagregación general**: las dimensiones del catálogo (SPEC 18) y el subconjunto de valores de cada una;
  - la **desagregación por dosis**, opcional: reemplaza la general solo para esa dosis (`[]` = la dosis no se desagrega);
  - las **secciones**: los encabezados del 5C («< 1 año», «De 1 a < 6 años»…), cada una con su grupo de edad y las dosis que aparecen en ella;
  - el **modo de procedencia**: `MUNICIPIO_DETALLADO` o `PROPIO_Y_OTROS`.
- Una **celda** del formulario es una dosis × un valor de cada dimensión. Con secciones, una celda existe solo si su dosis está en la sección de su grupo de edad.
- El **territorio** de un esquema es `NACIONAL` o una DDRISS. Para capturar, manda el `VIGENTE` de la DDRISS si existe; si no, el `VIGENTE` nacional. A ese esquema se le llama aquí el **vigente que aplica**.

**Diferencias con la historia** (mandan `AGENTS.md`, `CONTEXTO BD.md` y lo que decidió el equipo):

- La historia pide `POST /esquemas-captura`. Además se agregan `GET /esquemas-captura`, `GET /esquemas-captura/{id}`, `PUT /esquemas-captura/{id}` y `DELETE /esquemas-captura/{id}`, porque un borrador se edita y se descarta antes de publicarse.
- «El esquema se guarda como borrador hasta publicarlo»: este spec solo crea `BORRADOR`. Publicar es HU-17.
- La historia es para el Administrador. Por decisión del equipo, el **Revisor** tiene los mismos permisos, como en vacunas, dimensiones, periodos y población.
- Todo esquema que se crea aquí es de la **DDRISS del usuario**. Nadie en el sistema crea esquemas nacionales: los nacionales de la semilla son la base que una DDRISS copia.
- `vigencia.desde` la fija HU-17 al publicar. Como el validador la exige, el borrador guarda una fecha provisional que la API no devuelve (ver «Vigencia provisional»).

No hay mockup del editor. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de las pestañas «Vacunas» y «Dimensiones» (tabla, subrutas de formulario, avisos).

## Alcance

**Entra:**

- Endpoints:
  - `GET /esquemas-captura`: una fila por vacuna con su vigente que aplica y el borrador de la DDRISS;
  - `GET /esquemas-captura/{id}`: el esquema completo;
  - `POST /esquemas-captura`: crea un `BORRADOR`, vacío o como copia del vigente que aplica;
  - `PUT /esquemas-captura/{id}`: reemplaza el contenido editable de un `BORRADOR`;
  - `DELETE /esquemas-captura/{id}`: descarta un `BORRADOR`.
- Reglas de coherencia del esquema en el backend (422 `ESQUEMA_INVALIDO`) y su copia en el frontend para avisar antes de guardar.
- Un solo `BORRADOR` por vacuna y territorio.
- Número de versión, `version_anterior_id`, `basado_en`, `reglas`, `campos_adicionales`, `presentacion` y la vigencia provisional calculados por el backend.
- La regla de formato `validarTituloSeccion` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `ESQUEMA_CONSULTAR`, `ESQUEMA_CREAR` y `ESQUEMA_EDITAR` para el Administrador y el Revisor, en `05_permisos_mysql.sql`.
- La acción `ELIMINAR` en `ACCIONES` de la bitácora.
- Bitácora de cada escritura (módulo `CONFIGURACION`, entidad `esquemas_captura`, `entidad_id` el ObjectId).
- Pestaña «Esquemas» en `/configuracion`, con la tabla y las acciones de crear, editar y descartar.
- Subrutas `/configuracion/esquemas/nuevo` y `/configuracion/esquemas/:id/editar`, con un editor común.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-16, notas en HU-17, HU-18 y HU-20, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Publicar un borrador, pasar el vigente anterior a `HISTORICO` y fijar la vigencia (HU-17). Tampoco `ESQUEMA_PUBLICAR`.
- El historial de versiones de una vacuna y ver los esquemas `HISTORICO` (HU-17).
- La vista previa del formulario (HU-18).
- Editar `campos_adicionales`, la lista de `reglas` o su severidad, y las etiquetas propias de una dimensión (`desagregacion[].etiqueta`).
- Editar la etiqueta de una dosis o el código de una sección.
- Crear o editar esquemas nacionales, o los de otra DDRISS.
- Avisar a una DDRISS cuando su formulario queda desactualizado frente al nacional (`basado_en`).
- `GET /vacunas/{codigo}/esquema-vigente` y la resolución del esquema al capturar (HU-19 y HU-20).
- Paginar `GET /esquemas-captura`.
- Cambios al modelo de datos, al validador de `esquemas_captura` y a las semillas de `backend/db/01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa la colección del script 02 tal como está:

```js
// esquemas_captura (MongoDB, base vacunacion_config) — un BORRADOR creado aquí
{
  _id: ObjectId,
  vacuna: { id: 2, codigo: "HEXA", nombre: "Hexavalente" },      // de MySQL; id Int32
  version: 4,                                                   // Int32; mayor versión de la vacuna en todo el país + 1
  territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" },  // siempre la DDRISS del usuario
  estado: "BORRADOR",
  vigencia: { desde: ISODate("2026-11-01"), hasta: null },      // provisional; ver abajo
  version_anterior_id: ObjectId | null,                         // el VIGENTE de esta DDRISS, o null
  basado_en: { esquema_id: ObjectId, version: 2 } | null,       // ver «Copia»
  dimensiones: {
    dosis: [
      { codigo: "D1", etiqueta: "Primera dosis" },              // etiqueta = dosis.nombre de MySQL
      { codigo: "R1", etiqueta: "Primer refuerzo",
        desagregacion: [ { dimension: "grupo_edad", valores: ["10_14"] } ] }  // opcional
    ],
    procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
    desagregacion: [ { dimension: "grupo_edad", valores: ["MENOR_1", "1_A_5"] } ]
  },
  secciones: [
    { codigo: "MENOR_1", titulo: "< 1 año", orden: 1, grupo_edad: "MENOR_1", dosis: ["D1", "D2", "D3"] }
  ],
  campos_adicionales: [],                                       // copiados de la base, o []
  reglas: [ { codigo: "CAMPOS_COMPLETOS", version: 1 } ],       // ver «Reglas»
  presentacion: { filas: "dosis", columnas: ["seccion"] },      // la deduce el backend
  auditoria: { creado_por: 1, creado_en: ISODate, publicado_por: null, publicado_en: null, motivo_cambio: null }
}
```

- `version`, `vacuna.id`, `secciones[].orden`, `reglas[].version` y `auditoria.creado_por` van con `Int32` (nota del 2026-10-24).
- `auditoria` se llena solo al crear. Las ediciones no la cambian: el historial está en la bitácora.
- Las dosis se guardan en el `orden` de MySQL, y los valores de cada dimensión en el `orden` del catálogo, sin importar el orden del cuerpo.
- `etiqueta` de cada dosis es `dosis.nombre` de MySQL al guardar.
- `codigo` de una sección es su `grupo_edad`, o `GENERAL` si no lleva. `orden` es su posición en la lista (1, 2, 3…).

### Versión, territorio y vínculos

- `version` = la mayor `version` de la vacuna en toda la colección (todos los territorios y estados) + 1. Así se respeta `uq_vacuna_version`. Si dos altas chocan en el índice, la segunda responde 409.
- `territorio` = `{ nivel: "DDRISS", ddriss_codigo }`, con el `codigo` de la DDRISS del usuario (`empleado.ddriss_id` → `ddriss.codigo`).
- `version_anterior_id` = el `_id` del `VIGENTE` de esa vacuna en esa DDRISS, o `null` si la DDRISS no tiene uno (`CONTEXTO BD.md` §6).

### Copia (`copiaDe`)

El usuario elige empezar **vacío** o **copiando el vigente que aplica**, aunque exista uno.

- Con `copiaDe`, el cuerpo trae el `_id` del vigente que aplica a esa vacuna en la DDRISS del usuario. Si no es ese (otro esquema, o el vigente cambió mientras se editaba), responde 409 `BASE_DESACTUALIZADA`.
- `basado_en`:
  - copia de un vigente `NACIONAL` → `{ esquema_id: su _id, version: su version }`;
  - copia del vigente de la DDRISS → el mismo `basado_en` que tiene ese vigente;
  - vacío → `null`.
- La copia toma de la base sus `reglas`, sus `campos_adicionales` y las claves de `presentacion` distintas de `filas` y `columnas` (por ejemplo `subtabla_por`). Las dosis, la desagregación, las secciones y la procedencia vienen del cuerpo, porque el editor las muestra precargadas y el usuario puede cambiarlas.
- En un `PUT`, `basado_en`, `reglas` y `campos_adicionales` no cambian.

### Reglas

- Un esquema vacío lleva `CAMPOS_COMPLETOS`, `DIMENSIONES_VALIDAS` y `NO_NEGATIVO`, cada una con la `version` de su documento `VIGENTE` `NACIONAL` en `reglas_validacion`. Si una de las tres no tiene vigente nacional, se omite.
- Una copia conserva las reglas de su base.

### Presentación

`filas` es siempre `"dosis"`. `columnas` es `["seccion"]` si hay más de una sección, seguido de los códigos de las dimensiones de la desagregación general sin `grupo_edad`, en el orden del cuerpo. Coincide con los esquemas de la semilla salvo Rotavirus, que tiene una sola sección y en la semilla lleva `["seccion"]`.

### Vigencia provisional

- Al crear, el backend guarda `vigencia: { desde: <día 1 del mes siguiente a hoyGuatemala()>, hasta: null }`, solo para cumplir el validador.
- La API devuelve `vigencia: null` en un `BORRADOR`, y el editor no la muestra.
- Un `PUT` no la cambia. HU-17 la reemplaza al publicar.

### Reglas de coherencia (422 `ESQUEMA_INVALIDO`)

El backend revisa, en este orden, y responde con el **primer** problema que encuentra, en un mensaje concreto:

1. **Vacuna.** Existe y está activa en MySQL ("La vacuna está inactiva; no admite esquemas nuevos.").
2. **Dosis.** Al menos una. Cada código es una dosis **activa** de la vacuna ("La dosis R3 no es una dosis activa de HEXA."). Un código repetido responde 400.
3. **Desagregación general.**
   - Cada dimensión existe y está activa en `catalogo_dimensiones` ("La dimensión pueblo no existe o está inactiva.").
   - Una dimensión no se repite (400).
   - Cada una trae al menos un valor, sin repetir (400), y cada valor es un valor activo de la dimensión ("El valor 2_4 de grupo_edad no existe o está inactivo.").
4. **Desagregación por dosis.** Las mismas reglas que la general. Además:
   - si la general tiene `grupo_edad`, la desagregación propia de una dosis también lo trae ("La dosis R1 debe desagregarse por grupo de edad, como la vacuna.");
   - si la general no tiene `grupo_edad`, la de una dosis tampoco.
5. **Secciones.**
   - Al menos una.
   - Las dosis de una sección son dosis del esquema, sin repetir, y al menos una.
   - Cada dosis del esquema está en al menos una sección ("La dosis D3 no aparece en ninguna sección.").
   - Si la vacuna desagrega por `grupo_edad`:
     - cada sección tiene un `grupoEdad` distinto ("Dos secciones usan el grupo de edad MENOR_1.");
     - el `grupoEdad` de una sección está entre los valores de `grupo_edad` que permite **cada una** de sus dosis (la desagregación propia de la dosis, o la general) ("La dosis R1 no admite el grupo de edad MENOR_1 de la sección < 1 año.").
   - Si no desagrega por `grupo_edad`: una sola sección, con `grupoEdad: null` ("Sin desagregación por grupo de edad, el esquema lleva una sola sección.").
6. **Largo de la combinación.** Para cada dosis, la combinación más larga `dimension=VALOR|dimension=VALOR`, con las dimensiones ordenadas por código, cabe en los 255 caracteres de `detalle_produccion.clave_combinacion` ("La combinación de la dosis D1 supera los 255 caracteres.").

Los demás errores de forma (tipos, campos no permitidos, `modo` fuera de la lista, títulos) responden 400 `ENTRADA_INVALIDA`.

Sí cambian el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec) y `ACCIONES` de la bitácora:

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `ESQUEMA_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar los esquemas de captura de las vacunas | ADMINISTRADOR, REVISOR |
| `ESQUEMA_CREAR` | `CONFIGURACION_CATALOGOS` | Crear borradores de esquemas de captura para la DDRISS | ADMINISTRADOR, REVISOR |
| `ESQUEMA_EDITAR` | `CONFIGURACION_CATALOGOS` | Editar y descartar borradores de esquemas de captura de la DDRISS | ADMINISTRADOR, REVISOR |

- `ELIMINAR` se agrega a `ACCIONES` en `auditoria.service.js`. `bitacora.accion` es `VARCHAR(40)`: no cambia la base.

### Respuestas

**Fila de `GET /esquemas-captura` (esquema `EsquemaPorVacuna`):**

```json
{
  "vacuna": { "id": 2, "codigo": "HEXA", "nombre": "Hexavalente", "activa": true },
  "vigente": { "id": "66f8a1c2e4b0a1b2c3d4e5f6", "version": 2, "territorio": { "nivel": "NACIONAL", "ddrissCodigo": null } },
  "borrador": { "id": "6721a0c1a2b3c4d5e6f70901", "version": 3, "creadoEn": "2026-10-15T15:00:00.000Z" }
}
```

- Una fila por vacuna **activa**, más las inactivas que tengan borrador de la DDRISS. Ordenadas por `nombre`.
- `vigente` es el vigente que aplica (el de la DDRISS o, si no hay, el nacional), o `null`.
- `borrador` es el `BORRADOR` de la DDRISS del usuario, o `null`.
- Los esquemas de otras DDRISS no aparecen (`AGENTS.md` §5.10).

**Esquema completo (esquema `EsquemaCaptura`):**

```json
{
  "id": "6721a0c1a2b3c4d5e6f70901",
  "vacuna": { "id": 4, "codigo": "TD", "nombre": "Toxoide tetánico y diftérico (Td)" },
  "version": 5,
  "territorio": { "nivel": "DDRISS", "ddrissCodigo": "DDRISS_SM" },
  "estado": "BORRADOR",
  "vigencia": null,
  "versionAnteriorId": null,
  "basadoEn": { "esquemaId": "66f8a1c2e4b0a1b2c3d4e601", "version": 1 },
  "procedencia": { "modo": "MUNICIPIO_DETALLADO", "permiteNoEspecificado": true },
  "dosis": [
    { "codigo": "D1", "etiqueta": "Primera dosis", "desagregacion": null },
    { "codigo": "R1", "etiqueta": "Primer refuerzo",
      "desagregacion": [ { "dimension": "grupo_edad", "valores": ["10_14", "MEF_15_49"] } ] }
  ],
  "desagregacion": [
    { "dimension": "estado_embarazo", "valores": ["EMBARAZADA", "NO_EMBARAZADA"] },
    { "dimension": "grupo_edad", "valores": ["10_14", "MEF_15_49"] }
  ],
  "secciones": [
    { "codigo": "MEF_15_49", "titulo": "Mujer de 15 a 49 años", "orden": 1, "grupoEdad": "MEF_15_49", "dosis": ["D1", "R1"] }
  ],
  "camposAdicionales": [],
  "reglas": [ { "codigo": "CAMPOS_COMPLETOS", "version": 1 } ],
  "presentacion": { "filas": "dosis", "columnas": ["estado_embarazo"] },
  "creadoPor": 1,
  "creadoEn": "2026-10-24T16:00:00.000Z"
}
```

- `dosis[].desagregacion` es `null` si la dosis usa la general, y `[]` si no se desagrega.
- `vigencia` es `{ desde, hasta }` (fechas `AAAA-MM-DD`) en un `VIGENTE` o `HISTORICO`, y `null` en un `BORRADOR`.

### Endpoints

Todos devuelven y reciben camelCase; el servicio convierte a snake_case para MongoDB. Un `id` que no es un ObjectId válido responde 404.

**`GET /esquemas-captura` (`ESQUEMA_CONSULTAR`).**

- Sin parámetros (uno desconocido responde 400, con `revisarParametros`).
- Responde 200 con un arreglo de `EsquemaPorVacuna`. No pagina.

**`GET /esquemas-captura/{id}` (`ESQUEMA_CONSULTAR`).**

- Responde 200 con el `EsquemaCaptura` de un esquema `NACIONAL` o de la DDRISS del usuario, en cualquier estado.
- Uno de otra DDRISS o inexistente responde 404 `NO_ENCONTRADO`.

**`POST /esquemas-captura` (`ESQUEMA_CREAR`).**

- Cuerpo:

  ```json
  {
    "vacunaId": 4,
    "copiaDe": "66f8a1c2e4b0a1b2c3d4e601",
    "procedencia": { "modo": "MUNICIPIO_DETALLADO", "permiteNoEspecificado": true },
    "dosis": [ { "codigo": "D1", "desagregacion": null }, { "codigo": "R1", "desagregacion": [ … ] } ],
    "desagregacion": [ { "dimension": "grupo_edad", "valores": ["10_14", "MEF_15_49"] } ],
    "secciones": [ { "titulo": "Mujer de 15 a 49 años", "grupoEdad": "MEF_15_49", "dosis": ["D1", "R1"] } ]
  }
  ```

- `copiaDe` es opcional (`null` o ausente = vacío). `procedencia.permiteNoEspecificado` es opcional y vale `true` por defecto.
- Un campo distinto de los seis responde 400.
- Si la DDRISS ya tiene un `BORRADOR` de la vacuna, responde 409 `BORRADOR_EXISTENTE`.
- Aplica las reglas de coherencia.
- Responde 201 con el `EsquemaCaptura`.
- Bitácora: `CREAR` con el documento completo.

**`PUT /esquemas-captura/{id}` (`ESQUEMA_EDITAR`).**

- Cuerpo: `procedencia`, `dosis`, `desagregacion` y `secciones`, los cuatro obligatorios. `vacunaId`, `copiaDe` o cualquier otro campo responden 400.
- Solo un `BORRADOR` de la DDRISS del usuario:
  - uno de otra DDRISS o inexistente responde 404;
  - uno `NACIONAL`, `VIGENTE` o `HISTORICO` responde 409 `ESQUEMA_NO_EDITABLE` ("Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.").
- Aplica las reglas de coherencia.
- Si `diferencias` da `null`, responde 200 sin escribir ni registrar. Si no, actualiza y registra `ACTUALIZAR`.
- El `updateOne` lleva la condición `estado: "BORRADOR"`. Si no modifica nada (lo publicaron mientras se editaba), responde 409 `ESQUEMA_NO_EDITABLE`.

**`DELETE /esquemas-captura/{id}` (`ESQUEMA_EDITAR`).**

- Las mismas condiciones que el `PUT` (404 o 409 `ESQUEMA_NO_EDITABLE`).
- Borra el documento con `deleteOne({ _id, estado: "BORRADOR" })`. Un borrador nunca se publicó, así que la regla de versiones inmutables (`AGENTS.md` §5.5) no aplica.
- Responde 204.
- Bitácora: `ELIMINAR` con el documento completo en `valoresAnteriores`.

**Orden de escritura.** El de la nota del 2026-10-24 (`escribirConBitacora`):

1. Lee y valida (incluida la consulta a MySQL de la vacuna, sus dosis y la DDRISS).
2. Abre `enTransaccion` y escribe la fila de bitácora.
3. Hace un solo `insertOne`, `updateOne` o `deleteOne` condicionado.
4. Si MongoDB falla o no cumple la condición, lanza el error y se deshace la bitácora.
5. Si escribe bien, se confirma MySQL.

### Errores de los esquemas

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Parámetro o campo no permitido, tipo inválido, código repetido en el cuerpo, `modo` inválido, título inválido | los de `campos.js` / los de esta sección / los del SPEC 12 |
| 404 | `NO_ENCONTRADO` | Esquema inexistente, de otra DDRISS o `id` inválido; vacuna inexistente | "El recurso solicitado no existe." |
| 409 | `BORRADOR_EXISTENTE` | La DDRISS ya tiene un borrador de la vacuna (también si dos altas chocan en `uq_vacuna_version`) | "Ya existe un borrador del esquema de {vacuna} para su DDRISS." |
| 409 | `BASE_DESACTUALIZADA` | `copiaDe` no es el vigente que aplica | "El esquema vigente de {vacuna} cambió; vuelva a abrir la copia." |
| 409 | `ESQUEMA_NO_EDITABLE` | Editar o descartar algo que no es un borrador de la DDRISS | el de esta sección |
| 422 | `ESQUEMA_INVALIDO` | Cualquier regla de coherencia | el del primer problema |

Los 401 y 403 no cambian. Si dos altas de **distintas** DDRISS chocan en `uq_vacuna_version`, la segunda también responde 409, con "Se creó otra versión de {vacuna} al mismo tiempo; intente de nuevo." (código `BORRADOR_EXISTENTE`). El 422 `ReglaNegocio` genérico del borrador anterior se reemplaza por `ESQUEMA_INVALIDO`.

### Regla de formato (`campos.js`)

| Regla | Acepta | Error |
|---|---|---|
| `validarTituloSeccion` | recorta; de 1 a 60 caracteres | "El título de la sección debe tener entre 1 y 60 caracteres." |

Va en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22).

### Frontend

**`src/api/configuracion.js`.** Funciones nuevas:

- `listarEsquemas()` y `obtenerEsquema(id)`;
- `crearEsquema(datos)`, `editarEsquema(id, datos)` y `descartarEsquema(id)`.

El editor usa además `obtenerVacuna(id)` de `src/api/catalogos.js` (dosis activas) y `listarDimensiones({ activa: true })` de `src/api/configuracion.js`.

**`coherenciaEsquema.js`** (`paginas/configuracion/`, nuevo). Repite las reglas 2 a 6 sobre el estado del editor y devuelve la lista de problemas con los mismos mensajes del backend. Un cambio de reglas va en `esquemas.service.js` y en este archivo, como `secuenciaDosis.js` (nota del 2026-10-23). Tiene su prueba `coherenciaEsquema.test.js`.

**Pestaña «Esquemas» (`PestanaEsquemas.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `esquemas`, después de «Dimensiones», con los permisos `ESQUEMA_CONSULTAR`, `VACUNA_CONSULTAR` y `DIMENSION_CONSULTAR` (los del editor).

- Card "Esquemas de captura" con el texto "Definen qué dosis, dimensiones y secciones pide el formulario de cada vacuna. Los borradores no se usan para capturar hasta que se publiquen.".
- Tabla:

  | Vacuna | Vigente que aplica | Borrador | Acciones |
  |---|---|---|---|

  - Vigente que aplica: "Versión {n} · Nacional" o "Versión {n} · {ddrissCodigo}", o "Sin esquema".
  - Borrador: Badge "Versión {n}" o "—". Una vacuna inactiva lleva el Badge "Inactiva" junto a su nombre.
  - Acciones:
    - sin borrador y con `ESQUEMA_CREAR`, en una vacuna activa: "Crear borrador". Si hay vigente, abre un DropdownMenu con "Copiar la versión vigente" y "Empezar vacío"; si no, va directo a vacío;
    - con borrador y con `ESQUEMA_EDITAR`: "Editar borrador" (solo en una vacuna activa) y "Descartar", con un AlertDialog "¿Descartar el borrador versión {n} de {vacuna}? No se puede deshacer.".
  - Un 409 se muestra en un Alert.
- Carga: Skeleton. Error: Alert "No se pudieron cargar los esquemas: {mensaje}" y "Reintentar".

**Editor (`EditorEsquema.jsx`, común).** Recibe el estado inicial y la función que guarda. Cards en este orden:

1. **Vacuna:** el nombre y el origen ("Copia de la versión {n} · Nacional", "Copia de la versión {n} · {ddriss}" o "Esquema nuevo"). En una copia, la nota "Las reglas de validación y los campos adicionales se copian de la base." con su cantidad.
2. **Dosis:** un Checkbox por dosis activa de la vacuna, en su orden. Cada dosis marcada tiene un Switch "Desagregación propia". Encendido, muestra por dimensión de la general sus valores con Checkbox, y la opción "Sin desagregar". Quitar una dimensión de la dosis no está permitido si es `grupo_edad`.
3. **Desagregación:** un Select "Agregar dimensión" con las dimensiones activas que aún no están, y por cada una sus valores activos con Checkbox (en el orden del catálogo), con "Quitar".
4. **Procedencia:** RadioGroup "Por municipio de procedencia" (`MUNICIPIO_DETALLADO`) o "Propio y otros, como el 5C" (`PROPIO_Y_OTROS`), y Checkbox "Permitir procedencia no especificada".
5. **Secciones:** filas con "Título", "Grupo de edad" (Select con los valores elegidos de `grupo_edad`; no aparece si la vacuna no desagrega por edad) y las dosis del esquema con Checkbox. Botones "Subir", "Bajar", "Quitar" y "Agregar sección" (este último deshabilitado si la vacuna no desagrega por edad y ya hay una sección).
6. **Problemas:** la lista de `coherenciaEsquema.js`. "Guardar borrador" queda deshabilitado mientras haya problemas o un título inválido.

- Al guardar, vuelve a la pestaña con el aviso "Borrador de {vacuna} guardado (versión {n}).".
- Un 400, 409 o 422 se muestra en un Alert y conserva lo editado.
- Una dimensión o un valor del borrador que ya no está activo se muestra marcado "Inactivo" y aparece como problema, para que el usuario lo quite.

**Subruta `/configuracion/esquemas/nuevo` (`PaginaRegistrarEsquema.jsx`, permiso `ESQUEMA_CREAR`).**

- Parámetros `?vacuna={id}&origen=vacio|copia`.
- Con `copia`, carga el vigente que aplica (de `listarEsquemas` y `obtenerEsquema`) y precarga el editor sin las dosis, dimensiones o valores inactivos, que se listan en un Alert "Se quitaron de la copia: …".
- Con `vacio`, el editor empieza con todas las dosis activas marcadas, sin desagregación y con una sección vacía.
- Guarda con `crearEsquema`, con `copiaDe` en una copia.
- Una vacuna inexistente o inactiva, o una copia sin vigente, muestra "No se puede crear el borrador de esta vacuna." con un enlace a la pestaña.

**Subruta `/configuracion/esquemas/:id/editar` (`PaginaEditarEsquema.jsx`, permiso `ESQUEMA_EDITAR`).**

- Carga el esquema con `obtenerEsquema` y guarda con `editarEsquema`.
- Un esquema que no es un borrador de la DDRISS muestra "Este esquema no se puede editar." con un enlace a la pestaña.
- Un `id` que no existe muestra "El esquema no existe.".

Los componentes `switch` y `radio-group` de shadcn se agregan con su CLI si aún no están. No agregan dependencias nuevas: usan `radix-ui`, que ya está.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /esquemas-captura y /esquemas-captura/{id}; esquemas EsquemaPorVacuna, EsquemaCaptura, EsquemaCrear, EsquemaEditar; se quita el borrador de POST
├── db/05_permisos_mysql.sql                   ← ESQUEMA_CONSULTAR, ESQUEMA_CREAR, ESQUEMA_EDITAR y sus asignaciones
├── src/validaciones/campos.js                 ← validarTituloSeccion
├── src/modulos/auditoria/auditoria.service.js ← ELIMINAR en ACCIONES
├── src/modulos/configuracion/
│   ├── configuracion.routes.js                ← rutas de esquemas
│   ├── configuracion.controller.js            ← controladores de esquemas
│   ├── dimensiones.service.js                 ← usa escribirConBitacora de mongoBitacora.js
│   ├── mongoBitacora.js                       ← nuevo: escribirConBitacora(entidad, …), común a dimensiones y esquemas
│   └── esquemas.service.js                    ← nuevo: listar, obtener, crear, editar, descartar, coherencia
└── tests/
    ├── campos.test.js                         ← casos nuevos
    └── esquemas.test.js                       ← nuevo
frontend/src/
├── api/configuracion.js                       ← funciones de esquemas
├── components/ui/switch.jsx, radio-group.jsx  ← de la CLI de shadcn, si faltan
├── validaciones/campos.js                     ← validarTituloSeccion
├── validaciones/campos.test.js                ← los mismos casos
├── componentes/layout/opcionesMenu.js         ← subrutas de esquemas
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Esquemas»
    ├── PestanaEsquemas.jsx                    ← nuevo
    ├── PestanaEsquemas.test.jsx               ← nuevo
    ├── EditorEsquema.jsx                      ← nuevo
    ├── EditorEsquema.test.jsx                 ← nuevo
    ├── coherenciaEsquema.js                   ← nuevo
    ├── coherenciaEsquema.test.js              ← nuevo
    ├── PaginaRegistrarEsquema.jsx             ← nuevo
    ├── PaginaRegistrarEsquema.test.jsx        ← nuevo
    ├── PaginaEditarEsquema.jsx                ← nuevo
    └── PaginaEditarEsquema.test.jsx           ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-16; notas en HU-17, HU-18 y HU-20
CLAUDE.md                                      ← nota de esquemas
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, reemplazar el borrador de `POST /esquemas-captura` por los endpoints de este spec, con sus esquemas, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. `/esquemas-captura/{id}/publicar` y `/vacunas/{codigo}/esquema-vigente` no se tocan. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos y acción.** En `05_permisos_mysql.sql`, en un bloque "SPEC 19 (HU-16)":
   - agregar `ESQUEMA_CONSULTAR`, `ESQUEMA_CREAR` y `ESQUEMA_EDITAR` (módulo `CONFIGURACION_CATALOGOS`);
   - asignarlos al ADMINISTRADOR y al REVISOR.

   Agregar `ELIMINAR` a `ACCIONES`. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen los tres códigos.

3. **Regla de formato.** `validarTituloSeccion` en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`: un título válido, uno con espacios alrededor, vacío, solo espacios y de 61 caracteres. Comprobación: `campos.test.js` pasa en los dos proyectos.

4. **Backend: consulta.** Crear `esquemas.service.js` con `listarEsquemas` y `obtenerEsquema`, y sus rutas y controladores. Las pruebas de `tests/esquemas.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes borran los restos de corridas anteriores):
   - en MySQL, por SQL: la vacuna `ZVT_HU16` con las dosis `D1`, `D2` y `R1` activas y `D3` inactiva, y la vacuna inactiva `ZVT_HU16I`;
   - en MongoDB: un esquema `VIGENTE` `NACIONAL` de `ZVT_HU16` y uno `BORRADOR` de una DDRISS ficticia `ZVT_OTRA`, más la dimensión `zvt_hu16` con un valor activo y uno inactivo;
   - borran todo lo que tenga esos códigos, y los esquemas cuya `vacuna.codigo` empiece con `ZVT_HU16`.

   Casos:
   - `GET /esquemas-captura` trae una fila por vacuna activa, con HEXA con `vigente` nacional v2 y `borrador` v3 (del 04), y `ZVT_HU16` con su vigente nacional;
   - el borrador de `ZVT_OTRA` no aparece, y `GET /esquemas-captura/{id}` de ese borrador responde 404;
   - `GET` de un `BORRADOR` trae `vigencia: null`, y el de un `VIGENTE` trae sus fechas;
   - un parámetro desconocido responde 400, y un `id` inválido responde 404;
   - una cuenta de Epidemiología de la semilla, con un token firmado con sus datos reales, recibe 403.

   Comprobación: la prueba pasa.

5. **Backend: coherencia.** Las reglas 1 a 6 en `esquemas.service.js`, como una función que recibe el cuerpo y los datos de MySQL y del catálogo. Pruebas unitarias en `esquemas.test.js`, sin escribir en las bases, con un caso por mensaje de la sección «Reglas de coherencia». Además, que los esquemas de la semilla (Hexavalente v2, BCG, VPH, Td, Polio, Rotavirus, SPR y Neumococo), pasados al formato del cuerpo, no tengan problemas. Comprobación: la prueba pasa.

6. **Backend: crear.** `crearEsquema` y su ruta. Pruebas:
   - crear `ZVT_HU16` vacío guarda `BORRADOR` con territorio `DDRISS_SM`, `version` = mayor + 1, `version_anterior_id: null`, `basado_en: null`, las tres reglas básicas, `presentacion` deducida, las etiquetas de MySQL, los tipos Int32, la vigencia provisional y una fila `CREAR`;
   - crear otro borrador de `ZVT_HU16` responde 409 `BORRADOR_EXISTENTE`;
   - con `copiaDe` del vigente nacional, guarda `basado_en` con su id y versión, y copia sus reglas, sus campos adicionales y `subtabla_por`;
   - `copiaDe` de otro esquema responde 409 `BASE_DESACTUALIZADA`;
   - la dosis `D3` inactiva, el valor inactivo de `zvt_hu16` y la vacuna `ZVT_HU16I` responden 422 `ESQUEMA_INVALIDO`;
   - un campo extra, un código repetido o un `modo` inválido responden 400;
   - dos altas en paralelo de `ZVT_HU16`: una 201 y otra 409, y queda un solo borrador;
   - si MongoDB falla (`vi.spyOn` sobre la colección), no queda la fila de bitácora;
   - con la cuenta del Revisor, crear responde 201.

   Comprobación: la prueba pasa.

7. **Backend: editar y descartar.** `editarEsquema` y `descartarEsquema` con sus rutas. Pruebas:
   - un `PUT` que cambia las secciones deja `ACTUALIZAR` y no cambia `basado_en`, `reglas`, `auditoria` ni la vigencia; uno sin cambios no deja filas;
   - un `PUT` con `vacunaId` responde 400, y uno incoherente responde 422;
   - un `PUT` o `DELETE` sobre el vigente nacional responde 409 `ESQUEMA_NO_EDITABLE`, y sobre el borrador de `ZVT_OTRA` responde 404;
   - si el borrador pasa a `VIGENTE` por la base entre la lectura y la escritura (`vi.spyOn`), el `PUT` responde 409 y no queda la fila;
   - `DELETE` responde 204, borra el documento y deja `ELIMINAR` con el documento completo.

   Comprobación: `npm test` del backend pasa completo.

8. **Frontend: coherencia y pestaña.** Crear `coherenciaEsquema.js` con su prueba, con los mismos casos y mensajes del paso 5. Crear las funciones de `src/api/configuracion.js` y `PestanaEsquemas.jsx`, y agregar la pestaña a `PESTANAS`. En `PestanaEsquemas.test.jsx`:
   - la tabla muestra el vigente que aplica con su territorio, "Sin esquema" y el borrador;
   - "Crear borrador" con vigente ofrece "Copiar la versión vigente" y "Empezar vacío", y cada una navega a `/configuracion/esquemas/nuevo` con sus parámetros;
   - "Descartar" pide confirmación, llama a `descartarEsquema` y actualiza la fila; un 409 se ve en el Alert;
   - si falla la carga, "Reintentar" vuelve a pedir;
   - sin `ESQUEMA_CONSULTAR` no aparece la pestaña, y sin `ESQUEMA_CREAR` o `ESQUEMA_EDITAR` no aparecen sus botones;
   - las pruebas de las otras pestañas siguen pasando.

   Comprobación: `npm test` del frontend pasa.

9. **Frontend: editor.** `EditorEsquema.jsx` (y `switch` y `radio-group` con la CLI de shadcn si faltan). En `EditorEsquema.test.jsx`:
   - marcar y desmarcar dosis y valores cambia lo que se guarda;
   - la desagregación propia de una dosis permite elegir un subconjunto o "Sin desagregar", y no deja quitar `grupo_edad`;
   - sin `grupo_edad`, el Select de grupo de edad no aparece y "Agregar sección" se deshabilita con una sección;
   - una dosis sin sección o dos secciones con el mismo grupo aparecen en "Problemas" y deshabilitan "Guardar borrador";
   - "Subir" y "Bajar" cambian el orden de las secciones;
   - un valor inactivo del estado inicial se ve "Inactivo" y como problema.

   Comprobación: `npm test` del frontend pasa.

10. **Frontend: subrutas.** `PaginaRegistrarEsquema.jsx` y `PaginaEditarEsquema.jsx`, con sus subrutas en `opcionesMenu.js`. Pruebas:
    - `origen=copia` precarga el vigente, quita lo inactivo con su aviso y guarda con `copiaDe`;
    - `origen=vacio` empieza con las dosis activas marcadas y una sección;
    - guardar vuelve a la pestaña con el aviso;
    - un 422 se muestra en el Alert y conserva lo editado;
    - editar carga el borrador y guarda con `editarEsquema`; un esquema publicado muestra "Este esquema no se puede editar.".

    Comprobación: `npm test` del frontend pasa completo.

11. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano):
    - **Como Administrador:**
      - abrir la pestaña «Esquemas» y ver Hexavalente con la v2 nacional y el borrador v3 de `DDRISS_SM`, y las vacunas sin esquema con "Sin esquema";
      - crear un borrador de Td copiando el vigente: ver la desagregación de R1 precargada, cambiar el título de una sección y guardar;
      - en el editor, quitar una dosis de todas las secciones y ver el problema y el botón deshabilitado;
      - crear un borrador vacío de una vacuna sin esquema, con una sección, y guardarlo;
      - descartar los dos borradores de prueba.
    - **Como Revisor:** ver la pestaña, crear un borrador vacío y descartarlo.
    - **No** descartar el borrador Hexavalente v3 del 04: es dato de prueba de otros specs.
    - **Al terminar:** revisar por SQL las filas `CREAR`, `ACTUALIZAR` y `ELIMINAR` de la bitácora.

    Documentación:
    - en HU-16, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
    - en HU-17, la nota: "Los borradores los crea el SPEC 19 (solo de la DDRISS del usuario) con una `vigencia.desde` provisional que la API no devuelve: publicar debe fijar la vigencia, volver a pasar las reglas de coherencia de `esquemas.service.js` y crear `ESQUEMA_PUBLICAR`.";
    - en HU-18, la nota: "La vista previa parte de `GET /esquemas-captura/{id}` (SPEC 19) y puede ir como botón en el editor de borradores.";
    - en HU-20, la nota: "`GET /esquemas-captura/{id}` devuelve el esquema en camelCase con `secciones[].grupoEdad` y `dosis[].desagregacion` (`null` = la general); el formulario resuelve el vigente que aplica igual que `GET /esquemas-captura`.";
    - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial:
      - los borradores son siempre de la DDRISS del usuario, uno por vacuna, y se borran al descartar (`ELIMINAR`);
      - `version` = mayor de la vacuna en el país + 1, y el choque en `uq_vacuna_version` es 409;
      - la vigencia del borrador es provisional y la API devuelve `null`;
      - las reglas de coherencia están en `esquemas.service.js` y `coherenciaEsquema.js`: un cambio va en los dos;
      - las pruebas usan las vacunas `ZVT_HU16`/`ZVT_HU16I`, la DDRISS ficticia `ZVT_OTRA` y la dimensión `zvt_hu16`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET`/`POST /esquemas-captura` y `GET`/`PUT`/`DELETE /esquemas-captura/{id}` con su `x-permiso`, el borrador anterior de `POST` ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan esquemas `ZVT_HU16…`, la dimensión `zvt_hu16` ni las vacunas de prueba.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Desde la pantalla se puede crear el borrador de una vacuna vacío o copiando su vigente que aplica, elegir sus dosis y las dimensiones y valores de cada una, y organizarlo en secciones por grupo de edad.
- [ ] Todo borrador creado queda en `BORRADOR`, con el territorio de la DDRISS del usuario, `version` = mayor de la vacuna + 1, y `basado_en` y `version_anterior_id` según este spec.
- [ ] El backend responde 422 `ESQUEMA_INVALIDO` a un esquema que usa una dosis inexistente o inactiva, una dimensión o un valor inexistente o inactivo, secciones incoherentes o una combinación de más de 255 caracteres.
- [ ] Los esquemas de la semilla, pasados al formato del cuerpo, cumplen las reglas de coherencia.
- [ ] Una DDRISS no puede tener dos borradores de la misma vacuna, ni con dos altas en paralelo (409).
- [ ] Solo se edita o descarta un borrador de la DDRISS del usuario. Un esquema nacional, vigente o histórico responde 409, y uno de otra DDRISS responde 404.
- [ ] La API devuelve `vigencia: null` en un borrador.
- [ ] Cada escritura deja su fila (`CREAR`, `ACTUALIZAR` o `ELIMINAR`) en la bitácora con el módulo `CONFIGURACION` y el ObjectId como `entidad_id`. Una edición sin cambios no deja filas, y un fallo de MongoDB no deja la fila.
- [ ] Sin `ESQUEMA_CONSULTAR`, `ESQUEMA_CREAR` o `ESQUEMA_EDITAR`, sus endpoints responden 403 y la pantalla oculta la pestaña o los botones.
- [ ] El Administrador y el Revisor ven la pestaña «Esquemas» y pueden crear, editar y descartar borradores.
- [ ] El editor muestra los problemas de coherencia y no deja guardar mientras haya alguno.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-16 tiene su avance y sus criterios marcados, HU-17, HU-18 y HU-20 tienen su nota y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** este spec cubre consultar, crear, editar y descartar borradores. **No:** publicar ni el historial, que son HU-17 (Kenneth); **no:** la vista previa, que es HU-18; **no:** solo crear sin editar.
- **Sí:** todo esquema que se crea es de la DDRISS del usuario, que prevalece sobre el nacional al capturar (`CONTEXTO BD.md` §6). **No:** dejar elegir `NACIONAL`, porque un Administrador de San Marcos cambiaría el formulario de todo el país; **no:** solo nacionales, que ignora el modelo v0.7.
- **Sí:** el usuario elige empezar vacío o copiar el vigente que aplica, aunque haya uno (decidido en la fase de preguntas). **No:** obligar a copiar cuando hay vigente; **no:** solo vacío, que obliga a rehacer los esquemas existentes.
- **Sí:** la copia la arma el editor y se guarda en el `POST` con `copiaDe`. Así un vigente que usa algo ya inactivo se corrige antes de guardar. **No:** un `POST { vacunaId, origen }` que copie en el servidor, porque esa copia podría no pasar las reglas de coherencia. Decidido al escribir el spec.
- **Sí:** el editor arma dosis, desagregación general y por dosis, secciones y procedencia. Las reglas se copian de la base o son las tres básicas (`CAMPOS_COMPLETOS`, `DIMENSIONES_VALIDAS`, `NO_NEGATIVO`), y `presentacion` la deduce el backend. **No:** editar `campos_adicionales` o las reglas, que agrandan el spec; **no:** un editor mínimo sin desagregación por dosis ni procedencia, que no puede reproducir Td ni Polio.
- **Sí:** el Administrador y el Revisor tienen `ESQUEMA_CONSULTAR`, `ESQUEMA_CREAR` y `ESQUEMA_EDITAR`, como en vacunas y dimensiones. **No:** solo el Administrador; **no:** el Revisor solo con consulta.
- **Sí:** un solo `BORRADOR` por vacuna y territorio, y descartarlo borra el documento con `ELIMINAR` en la bitácora. Un borrador nunca se publicó, así que §5.5 no aplica. **No:** varios borradores a la vez, que confunden a HU-17; **no:** borradores que no se descartan.
- **Sí:** el código de la sección es su `grupo_edad` (o `GENERAL`), su `orden` es su posición, y la etiqueta de la dosis es `dosis.nombre`. **No:** que el usuario los escriba, porque los códigos no aportan nada al formulario y las etiquetas ya están en MySQL.
- **Sí:** reglas estrictas de secciones: al menos una, `grupo_edad` distinto por sección y permitido por sus dosis, cada dosis en una sección, y una sola sección sin `grupo_edad`. Cumplen todos los esquemas de la semilla. **No:** secciones opcionales (como Hexavalente v1, que es histórico); **no:** revisar solo que los códigos existan.
- **Sí:** si la vacuna desagrega por `grupo_edad`, la desagregación propia de una dosis también lo lleva, y si no, tampoco. El grupo de edad de la celda sale de la sección. Decidido al escribir el spec, para que toda celda tenga grupo de edad o ninguna lo tenga.
- **Sí:** 400 `ENTRADA_INVALIDA` para la forma del cuerpo y 422 `ESQUEMA_INVALIDO` con el primer problema, como los 422 de establecimientos y distritos. **No:** un arreglo `detalles[]`, que cambia el formato común de error; **no:** todo 400.
- **Sí:** la vigencia la fija HU-17 al publicar (decidido en la fase de preguntas). El borrador guarda el día 1 del mes siguiente solo para cumplir el validador, y la API devuelve `null`. **No:** cambiar el validador del 02, que es zona protegida y exige migrar Atlas; **no:** mostrar la fecha provisional como propuesta.
- **Sí:** `version` = mayor de la vacuna en todo el país + 1, contando borradores. Dos altas simultáneas chocan en `uq_vacuna_version` y la segunda responde 409, sin bloqueos. Decidido al escribir el spec.
- **Sí:** la pestaña muestra una fila por vacuna con el vigente que aplica y el borrador de la DDRISS. **No:** todas las versiones, que adelantan el historial de HU-17. Los esquemas de otras DDRISS no se ven (§5.10).
- **Sí:** el editor usa `GET /vacunas/{id}` y `GET /dimensiones?activa=true`, y la pestaña pide también `VACUNA_CONSULTAR` y `DIMENSION_CONSULTAR`, como «Población» pide `PERIODO_CONSULTAR` (SPEC 17). **No:** que `GET /esquemas-captura/{id}` traiga las dosis y las dimensiones disponibles, que duplica esos endpoints.
- **Sí:** las reglas de coherencia se repiten en `coherenciaEsquema.js` para avisar antes de guardar, como `secuenciaDosis.js` (SPEC 15). El backend es quien decide. **No:** validar solo en el backend, porque el usuario vería un problema a la vez.
- **Sí:** las pruebas crean sus propias vacunas (`ZVT_HU16`, `ZVT_HU16I`), su dimensión `zvt_hu16` y un borrador de la DDRISS ficticia `ZVT_OTRA`, y los borran. Así no tocan los esquemas de la semilla ni el borrador Hexavalente v3 del 04.

Decididas al implementar:

- **Sí:** `escribirConBitacora` pasa a `modulos/configuracion/mongoBitacora.js` y recibe la colección, para que dimensiones y esquemas no la dupliquen (paso 6). **No:** copiarla en `esquemas.service.js`.
- **Sí:** mensajes que el spec no daba, ya en `openapi.yaml`. Con 422: "Indique al menos una dosis.", "Indique al menos una sección.", "La sección {t} usa la dosis {d}, que no está en el esquema.", "La dosis {d} no se desagrega por grupo de edad, porque la vacuna no lo hace.", "La sección {t} necesita un grupo de edad." y "La sección {t} no lleva grupo de edad, porque la vacuna no se desagrega por edad.". Con 400: "La dosis {d} está repetida.", "La dimensión {dim} está repetida.", "El valor {v} de {dim} está repetido.", "Indique al menos un valor de {dim}.", "Indique al menos una dosis en la sección {t}." y "El modo de procedencia debe ser MUNICIPIO_DETALLADO o PROPIO_Y_OTROS." (pasos 1 y 5).
- **Sí:** en `POST`, los 409 (`BORRADOR_EXISTENTE`, `BASE_DESACTUALIZADA`) se revisan antes que las reglas de coherencia (422). Un usuario sin DDRISS recibe 403 `SIN_PERMISO`; hoy no pasa, porque `AUTORIDAD` no tiene `ESQUEMA_CREAR` (paso 6).
- **Sí:** el editor quita una dosis de sus secciones al desmarcarla. Lo que sale de la desagregación general sale también de las desagregaciones propias, y si es `grupo_edad` o uno de sus valores, las secciones que lo usaban quedan sin grupo. Una dimensión nueva entra con todos sus valores activos marcados (paso 9).
- **Sí:** en el editor, una sección sin título se nombra por su número en los problemas ("…en la sección 1."); lo que se guarda no cambia. Se encontró en la verificación manual (paso 11).
- **Sí:** `/configuracion/esquemas/nuevo` también muestra "No se puede crear el borrador de esta vacuna." si la vacuna ya tiene un borrador de la DDRISS, porque el backend respondería 409 (paso 10).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| MySQL se confirma después de escribir en MongoDB; si la confirmación falla, MongoDB queda cambiado sin su fila de bitácora | Es la regla acordada (nota del 2026-10-20) y la ventana es mínima. El caso inverso tiene prueba. |
| Las reglas de coherencia del backend y de `coherenciaEsquema.js` se separan con el tiempo | Las dos pruebas usan los mismos casos y mensajes, y la nota de `CLAUDE.md` lo avisa. |
| Una dimensión o un valor se desactiva entre que el editor carga y se guarda | El backend vuelve a revisar al guardar (422). Una vez guardado, el SPEC 18 impide desactivarlo. |
| El vigente que aplica cambia mientras se edita una copia | `copiaDe` se compara con el vigente actual y responde 409 `BASE_DESACTUALIZADA`. |
| HU-17 publica un borrador mientras alguien lo edita o descarta | El `updateOne`/`deleteOne` lleva la condición `estado: "BORRADOR"` y responde 409. |
| La vigencia provisional se toma por real en otro spec | La API devuelve `null` en un borrador y la nota en HU-17 avisa que se debe fijar al publicar. |
| Descartar a mano el borrador Hexavalente v3 del 04 rompe otras pruebas o verificaciones | La verificación manual lo prohíbe, y el 04 lo vuelve a crear si se corre de nuevo (con autorización). |
| El cálculo de `presentacion` no coincide con lo que espere el formulario de HU-20 | Es configuración de presentación, no de captura. HU-20 puede ajustarlo con su propio spec. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Publicar, fijar la vigencia o `ESQUEMA_PUBLICAR` (HU-17).
- Historial de versiones y esquemas `HISTORICO` (HU-17).
- Vista previa del formulario (HU-18).
- Editar campos adicionales, reglas, etiquetas de dimensión o de dosis, o códigos de sección.
- Esquemas nacionales o de otras DDRISS.
- Aviso de formularios desactualizados frente al nacional.
- Resolución del esquema al capturar (HU-19, HU-20).
- Paginación de `GET /esquemas-captura`.
- Cambios al modelo de datos, al validador o a las semillas.

Cada uno, si se hace, va en su propio spec.
