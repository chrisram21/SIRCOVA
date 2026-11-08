# SPEC 20 — Publicar versiones del esquema de captura y su historial

> **Estado:** Implementado
> **Historia:** HU-17
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 15, SPEC 16, SPEC 19
> **Fecha:** 2026-10-24
> **Objetivo:** Que el Administrador y el Revisor publiquen el borrador del esquema de captura de una vacuna para su DDRISS, con una vigencia desde el día 1 de un mes y un motivo, y que la versión anterior de la DDRISS pase a `HISTORICO` sin cambiar su contenido. Además, que consulten el historial de versiones de la vacuna con los reportes que usan cada una.

## Por qué existe este spec

El SPEC 19 crea, edita y descarta los `BORRADOR` de la DDRISS del usuario. Les guarda una `vigencia.desde` provisional que la API no devuelve (`vigencia: null`) y les fija `version_anterior_id`, el `VIGENTE` de esa DDRISS al crear el borrador. Nadie puede publicarlos todavía. `backend/openapi.yaml` solo tiene un borrador de `POST /esquemas-captura/{id}/publicar`, sin `x-permiso`, con `motivoCambio` libre y un 422 genérico.

Publicar sigue la mecánica de `CONTEXTO BD.md` §6:

- el borrador pasa a `VIGENTE`;
- el `VIGENTE` anterior **del mismo territorio** pasa a `HISTORICO`;
- el nacional no se toca.

El índice `uq_esquema_vigente_territorio` exige una sola versión `VIGENTE` por vacuna y territorio. Por eso el anterior pasa a `HISTORICO` antes de que el borrador pase a `VIGENTE`: son dos documentos, y se escriben en una transacción de MongoDB.

Los reportes de la semilla (`03`, `reporte_vacuna` 1 a 6) guardan Hexavalente v1, que es `HISTORICO`. Con ellos se comprueba que un reporte conserva su versión original.

**Conceptos** (aclarados al definir el spec):

- La **vigencia** de una versión es `[desde, hasta]`, siempre en meses completos: `desde` es el día 1 de un mes y `hasta` es el último día del mes anterior al `desde` de la versión que la reemplazó (`null` mientras nadie la reemplace).
- Una versión puede publicarse con vigencia **futura**. En ese caso pasa a `VIGENTE` de inmediato y la anterior pasa a `HISTORICO`, pero esta sigue aplicando hasta su `hasta`. Qué esquema usa un periodo lo decide su fecha (índice `ix_vigencia`), y eso lo resuelve HU-20.
- El **historial** de una vacuna son sus versiones `NACIONAL` y las de la DDRISS del usuario, en los tres estados.

**Diferencias con la historia** (mandan `AGENTS.md`, `CONTEXTO BD.md` y lo que decidió el equipo):

- La historia es para el Administrador. Por decisión del equipo, el **Revisor** también tiene `ESQUEMA_PUBLICAR`, como los permisos de esquemas del SPEC 19.
- Solo se publica un borrador de la DDRISS del usuario. Nadie publica un esquema nacional (SPEC 19).
- «Cada `reporte_vacuna` guarda el id y la versión del esquema usado»: las columnas ya existen en el 01 (`esquema_mongo_id`, `esquema_version`), y las llena la captura (HU-20). Este spec garantiza que la versión guardada no cambia y se puede seguir consultando, y el historial cuenta los reportes que usan cada versión.
- Además de publicar, se agrega `GET /esquemas-captura/historial`, y en la pantalla una vista de solo lectura de cualquier versión.

No hay mockup. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de la pestaña «Esquemas» del SPEC 19.

## Alcance

**Entra:**

- Endpoints:
  - `POST /esquemas-captura/{id}/publicar`: publica un `BORRADOR` de la DDRISS del usuario;
  - `GET /esquemas-captura/historial?vacunaId=`: las versiones de una vacuna, con los reportes de la DDRISS que usan cada una.
- Cambios a respuestas que ya existen:
  - `vigente.vigenciaDesde` en cada fila de `GET /esquemas-captura`;
  - `publicadoPor`, `publicadoEn` y `motivoCambio` en `EsquemaCaptura`.
- Al publicar, volver a pasar las reglas de coherencia del SPEC 19 contra el catálogo actual.
- Reglas de la vigencia (día 1 de un mes del calendario, desde el mes actual y después de la vigente de la DDRISS).
- Una transacción de MongoDB para los dos documentos, dentro de la transacción de MySQL de la bitácora.
- La regla de formato `validarMotivoCambio` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permiso `ESQUEMA_PUBLICAR` para el Administrador y el Revisor, en `05_permisos_mysql.sql`.
- Bitácora: `PUBLICAR_ESQUEMA` (ya está en `ACCIONES`) para el borrador y `ACTUALIZAR` para la versión que pasa a `HISTORICO`.
- Botón «Publicar» en la fila del borrador (pestaña «Esquemas») y en el editor del borrador, con un diálogo común.
- Subrutas `/configuracion/esquemas/historial/:vacunaId` (historial) y `/configuracion/esquemas/:id` (versión en solo lectura).
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright sobre una vacuna de prueba manual.
- Avance y criterios de HU-17, notas en HU-18 y HU-20, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Resolver qué esquema usa un periodo al capturar, y `GET /vacunas/{codigo}/esquema-vigente` (HU-19 y HU-20).
- Llenar `reporte_vacuna.esquema_mongo_id` y `esquema_version` (HU-20).
- Despublicar, revertir una publicación o cambiar la vigencia de una versión ya publicada.
- Publicar esquemas nacionales o de otra DDRISS.
- Avisar a una DDRISS cuando su formulario queda desactualizado frente al nacional (`basado_en`).
- La vista previa del formulario tal como lo ve el establecimiento (HU-18). La vista de solo lectura de este spec es el editor deshabilitado.
- Versionar reglas de validación o indicadores (HU-27 y siguientes).
- Paginar el historial.
- Cambios al modelo de datos, al validador de `esquemas_captura`, a sus índices o a las semillas de `backend/db/01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa la colección del script 02 y las tablas del 01 tal como están.

### Qué cambia al publicar

```js
// El BORRADOR que se publica
{
  estado: "VIGENTE",                                  // antes "BORRADOR"
  vigencia: { desde: ISODate("2026-12-01"), hasta: null },   // reemplaza la provisional
  version_anterior_id: ObjectId | null,               // el VIGENTE de la DDRISS en este momento, o null
  auditoria: {
    creado_por, creado_en,                            // no cambian
    publicado_por: 1,                                 // Int32, usuario que publica
    publicado_en: ISODate,                            // ahora
    motivo_cambio: "Se agrega la dimensión pueblo."
  }
}

// El VIGENTE anterior de la misma DDRISS, si existe
{
  estado: "HISTORICO",                                // antes "VIGENTE"
  vigencia: { desde: <sin cambio>, hasta: ISODate("2026-11-30") }   // día anterior al desde nuevo
}
```

- Del borrador no cambia nada más: dosis, desagregación, secciones, reglas, campos adicionales, presentación y `basado_en` quedan como los dejó el SPEC 19.
- Del anterior **solo** cambian `estado` y `vigencia.hasta`. Es la mecánica de versiones de `CONTEXTO BD.md` §6 (como Hexavalente v1 en la semilla), no una edición: su contenido no cambia, así que §5.5 de `AGENTS.md` se respeta.
- `version_anterior_id` se vuelve a calcular al publicar. Debe coincidir con el que guardó el SPEC 19, porque una DDRISS tiene un solo borrador por vacuna.
- El vigente `NACIONAL` nunca cambia. En la primera publicación de una DDRISS, `version_anterior_id` es `null` y no hay versión que pase a `HISTORICO`.
- `publicado_por` va con `Int32`, y las fechas como `Date` a medianoche UTC del día (`ISODate("2026-12-01")`), igual que la semilla.

### Reglas de la vigencia

El cuerpo trae `vigenciaDesde` como `AAAA-MM-DD`.

| Regla | Respuesta | Mensaje |
|---|---|---|
| Formato `AAAA-MM-DD` y fecha válida | 400 `ENTRADA_INVALIDA` | "La vigencia debe ser una fecha AAAA-MM-DD." |
| Es el día 1 del mes | 400 `ENTRADA_INVALIDA` | "La vigencia debe empezar el día 1 de un mes." |
| El mes existe en `periodo` | 422 `VIGENCIA_INVALIDA` | "El mes {AAAA-MM} no está en el calendario de periodos." |
| No es anterior al mes actual (`hoyGuatemala()`) | 422 `VIGENCIA_INVALIDA` | "La vigencia no puede empezar antes del mes actual." |
| Es posterior al `desde` del `VIGENTE` de la DDRISS, si hay uno | 422 `VIGENCIA_INVALIDA` | "La vigencia debe empezar después del {DD/MM/AAAA}, cuando empezó la versión {n} de su DDRISS." |

- El mes actual sí se puede elegir. Los reportes que ya se capturaron ese mes conservan su versión (ver «Riesgos»).
- El `desde` del vigente nacional no limita: la primera versión de una DDRISS puede empezar en cualquier mes válido.

### Permisos

Cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `ESQUEMA_PUBLICAR` | `CONFIGURACION_CATALOGOS` | Publicar borradores de esquemas de captura de la DDRISS | ADMINISTRADOR, REVISOR |

El historial usa `ESQUEMA_CONSULTAR` (SPEC 19).

### Respuestas

**`EsquemaPorVacuna` (`GET /esquemas-captura`)**: `vigente` agrega `vigenciaDesde`:

```json
"vigente": { "id": "…", "version": 4, "territorio": { "nivel": "DDRISS", "ddrissCodigo": "DDRISS_SM" }, "vigenciaDesde": "2026-12-01" }
```

**`EsquemaCaptura`** agrega tres campos. `publicadoPor` y `publicadoEn` son `null` en un `BORRADOR`. `motivoCambio` es el que esté guardado: `null` en los borradores del SPEC 19, aunque el borrador Hexavalente v3 del 04 trae uno.

```json
"publicadoPor": { "id": 1, "nombreUsuario": "admin.sm" },
"publicadoEn": "2026-10-24T16:00:00.000Z",
"motivoCambio": "Se agrega la dimensión pueblo."
```

- `publicadoPor` sale de `usuario.nombre_usuario`. Es `null` si `publicado_por` es `null` o no existe en MySQL.

**Historial (`GET /esquemas-captura/historial`, esquema `HistorialEsquemas`):**

```json
{
  "vacuna": { "id": 2, "codigo": "HEXA", "nombre": "Hexavalente", "activa": true },
  "versiones": [
    {
      "id": "6721a0c1a2b3c4d5e6f70901",
      "version": 3,
      "territorio": { "nivel": "DDRISS", "ddrissCodigo": "DDRISS_SM" },
      "estado": "BORRADOR",
      "vigencia": null,
      "versionAnteriorId": null,
      "basadoEn": { "esquemaId": "66f8a1c2e4b0a1b2c3d4e5f6", "version": 2 },
      "creadoEn": "2026-10-15T15:00:00.000Z",
      "publicadoPor": null,
      "publicadoEn": null,
      "motivoCambio": null,
      "reportes": 0
    },
    {
      "id": "66f8a1c2e4b0a1b2c3d4e5f5",
      "version": 1,
      "territorio": { "nivel": "NACIONAL", "ddrissCodigo": null },
      "estado": "HISTORICO",
      "vigencia": { "desde": "2026-01-01", "hasta": "2026-09-30" },
      "…": "…",
      "reportes": 6
    }
  ]
}
```

- Versiones `NACIONAL` y de la DDRISS del usuario, en los tres estados, ordenadas por `version` de mayor a menor. Las de otras DDRISS no aparecen (`AGENTS.md` §5.10).
- `reportes` = cantidad de filas de `reporte_vacuna` con ese `esquema_mongo_id`, de reportes (`reporte_produccion`) de establecimientos de la DDRISS del usuario, en cualquier estado. Es una sola consulta agrupada por `esquema_mongo_id`.
- No trae el contenido de cada versión: ese está en `GET /esquemas-captura/{id}`.

### Endpoints

Todos devuelven y reciben camelCase. Un `id` que no es un ObjectId válido responde 404.

**`GET /esquemas-captura/historial` (`ESQUEMA_CONSULTAR`).**

- Parámetro `vacunaId`, obligatorio, entero positivo. Si falta, es inválido, está repetido o hay un parámetro desconocido, responde 400 (`revisarParametros`).
- Una vacuna inexistente responde 404. Una inactiva sí responde, con `activa: false`.
- Responde 200 con `HistorialEsquemas`. Una vacuna sin esquemas responde con `versiones: []`.
- La ruta se declara **antes** de `/esquemas-captura/:id`, para que Express no tome `historial` como un `id`.

**`POST /esquemas-captura/{id}/publicar` (`ESQUEMA_PUBLICAR`).**

- Cuerpo: `{ "vigenciaDesde": "2026-12-01", "motivoCambio": "Se agrega la dimensión pueblo." }`. Los dos son obligatorios, y otro campo responde 400.
- Revisa, en este orden:
  1. el esquema es visible: uno de otra DDRISS o inexistente responde 404;
  2. es un `BORRADOR` de la DDRISS del usuario: uno `NACIONAL`, `VIGENTE` o `HISTORICO` responde 409 `ESQUEMA_NO_EDITABLE` ("Solo se publica un borrador de su DDRISS.");
  3. el cuerpo (400);
  4. las reglas de coherencia del SPEC 19 sobre el contenido guardado, con `cargarReferencias` y `revisarCoherencia` (422 `ESQUEMA_INVALIDO`, con el primer problema); incluye que la vacuna esté activa;
  5. las reglas de la vigencia (422 `VIGENCIA_INVALIDA`).
- Responde 200 con el `EsquemaCaptura` ya `VIGENTE`.

**Orden de escritura.** Es el de la nota del 2026-10-20, con una transacción de MongoDB en lugar de un solo cambio:

1. Lee y valida.
2. Abre `enTransaccion` y escribe las filas de bitácora:
   - `PUBLICAR_ESQUEMA` del borrador: `valoresAnteriores` `{ estado: "BORRADOR" }` y `valoresNuevos` `{ estado, vigencia, versionAnteriorId, motivoCambio }`;
   - `ACTUALIZAR` del anterior, si existe: `{ estado: "VIGENTE", vigencia: { hasta: null } }` → `{ estado: "HISTORICO", vigencia: { hasta } }`.

   Las dos van con el módulo `CONFIGURACION`, la entidad `esquemas_captura` y el ObjectId de cada documento como `entidad_id`.
3. Abre una sesión de MongoDB (`cliente.startSession()` de `config/mongodb.js`) con `withTransaction`, y en ella:
   - si hay anterior, hace un `updateOne({ _id: anterior, estado: "VIGENTE" })` que lo pasa a `HISTORICO`;
   - hace un `updateOne({ _id: borrador, estado: "BORRADOR" })` que lo pasa a `VIGENTE`.

   Si un `updateOne` no encuentra su documento, lanza 409. Si el índice `uq_esquema_vigente_territorio` o un conflicto de escritura lo impiden, también responde 409. En los dos casos MongoDB deshace la transacción.
4. Si MongoDB falla, lanza el error y se deshace la bitácora.
5. Si MongoDB confirma, se confirma MySQL.

Esta escritura va en `mongoBitacora.js` como `escribirEnTransaccionConBitacora(entidad, contexto, filas, escribirMongo)`, junto a `escribirConBitacora`. Recibe una lista de filas de bitácora, y `escribirMongo(coleccion, sesion)` recibe la sesión.

### Errores de publicar

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Campo faltante o no permitido, fecha con otro formato o que no es día 1, motivo inválido, `vacunaId` inválido | los de esta sección / `campos.js` / SPEC 12 |
| 404 | `NO_ENCONTRADO` | Esquema inexistente, de otra DDRISS o `id` inválido; vacuna inexistente en el historial | "El recurso solicitado no existe." |
| 409 | `ESQUEMA_NO_EDITABLE` | No es un borrador de la DDRISS, o lo publicaron o descartaron mientras tanto | "Solo se publica un borrador de su DDRISS." |
| 409 | `BASE_DESACTUALIZADA` | El vigente de la DDRISS cambió entre la lectura y la escritura | "El esquema vigente de {vacuna} cambió; vuelva a intentarlo." |
| 422 | `ESQUEMA_INVALIDO` | Cualquier regla de coherencia del SPEC 19 | el del primer problema |
| 422 | `VIGENCIA_INVALIDA` | Cualquier regla de la vigencia | los de «Reglas de la vigencia» |

El 422 `ReglaNegocio` genérico del borrador anterior del contrato se reemplaza por estos.

### Regla de formato (`campos.js`)

| Regla | Acepta | Error |
|---|---|---|
| `validarMotivoCambio` | recorta; de 1 a 300 caracteres | "El motivo del cambio debe tener entre 1 y 300 caracteres." |

Va en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22).

### Frontend

**`src/api/configuracion.js`.** Funciones nuevas: `publicarEsquema(id, { vigenciaDesde, motivoCambio })` e `historialEsquemas(vacunaId)`. El diálogo usa además `listarPeriodos({ anio })` de `src/api/catalogos.js`.

**Diálogo `DialogoPublicarEsquema.jsx`** (común a la pestaña y al editor). Recibe la fila del borrador (vacuna, versión del borrador y vigente que aplica) y llama a `publicarEsquema`.

- Título: "Publicar la versión {n} de {vacuna}".
- Select "Vigente desde", con los meses del calendario (`listarPeriodos` del año actual y del siguiente) que cumplen las reglas de la vigencia: desde el mes actual y, si el vigente que aplica es de la DDRISS, después de su `vigenciaDesde`. Se muestran como "Diciembre 2026". Si no queda ninguno: "No hay meses disponibles en el calendario; agréguelos en la pestaña «Periodos».", y «Publicar» queda deshabilitado.
- Textarea "Motivo del cambio", con `validarMotivoCambio`.
- Aviso, según el caso:
  - con vigente de la DDRISS: "La versión {m} dejará de usarse el {último día del mes anterior}.";
  - con vigente nacional: "Desde esa fecha, {ddrissCodigo} usará esta versión en lugar de la nacional {m}.";

  seguido de "Los reportes ya capturados conservan su versión. Una versión publicada no se puede editar ni descartar.".
- Botones "Cancelar" y "Publicar". Un 409 o 422 se muestra en un Alert dentro del diálogo, sin cerrarlo.

**Pestaña «Esquemas» (`PestanaEsquemas.jsx`).**

- La columna "Vigente que aplica" agrega la fecha: "Versión {n} · {territorio} · desde {DD/MM/AAAA}".
- Acciones nuevas:
  - con borrador, en una vacuna activa, con `ESQUEMA_PUBLICAR` y `PERIODO_CONSULTAR`: "Publicar", que abre el diálogo;
  - con vigente o borrador: "Historial", que va a `/configuracion/esquemas/historial/{vacunaId}`.
- Al publicar, recarga la tabla y muestra "Versión {n} de {vacuna} publicada; vigente desde {DD/MM/AAAA}.".

**Editor (`PaginaEditarEsquema.jsx`).** Con `ESQUEMA_PUBLICAR` y `PERIODO_CONSULTAR`, agrega el botón "Publicar" junto a "Guardar borrador":

- Si hay cambios sin guardar, se llama "Guardar y publicar": primero guarda con `editarEsquema` y, si sale bien, abre el diálogo. Si falla, muestra el Alert del SPEC 19 y no abre el diálogo.
- Se deshabilita mientras haya problemas de coherencia.
- Al publicar, vuelve a la pestaña con el aviso de arriba.

**Historial (`PaginaHistorialEsquemas.jsx`).** Subruta `/configuracion/esquemas/historial/:vacunaId`, con permiso `ESQUEMA_CONSULTAR`.

- Encabezado "Historial de {vacuna}", con el Badge "Inactiva" si corresponde, y un enlace de vuelta a la pestaña.
- Tabla:

  | Versión | Territorio | Estado | Vigencia | Publicada | Motivo | Reportes | Acciones |
  |---|---|---|---|---|---|---|---|

  - Territorio: "Nacional" o el `ddrissCodigo`.
  - Estado: Badge "Borrador", "Vigente" o "Histórica".
  - Vigencia: "Desde {DD/MM/AAAA}" o "{DD/MM/AAAA} – {DD/MM/AAAA}"; "—" en un borrador.
  - Publicada: "{DD/MM/AAAA} · {nombreUsuario}" o "—".
  - Acciones: "Ver", que va a `/configuracion/esquemas/{id}`.
- Sin versiones: "Esta vacuna aún no tiene esquemas.".
- Carga: Skeleton. Error: Alert "No se pudo cargar el historial: {mensaje}" y "Reintentar". Una vacuna inexistente muestra "La vacuna no existe.".

**Versión en solo lectura (`PaginaVerEsquema.jsx`).** Subruta `/configuracion/esquemas/:id`, con permiso `ESQUEMA_CONSULTAR`.

- Carga con `obtenerEsquema` y muestra `EditorEsquema` con la prop nueva `soloLectura`:
  - todos los controles deshabilitados, sin la card «Problemas» ni los botones de guardar;
  - usa `listarDimensiones()` sin filtro, para mostrar también las etiquetas de lo que ya está inactivo.
- Arriba, una card "Versión {n}" con el estado, el territorio, la vigencia, la publicación, el motivo y el origen (`basadoEn`).
- En un borrador de la DDRISS con `ESQUEMA_EDITAR`, un botón "Editar borrador".
- Un `id` que no existe muestra "El esquema no existe.". Enlace de vuelta al historial de la vacuna.

Las tres subrutas nuevas van en `opcionesMenu.js`, dentro de la opción de Configuración, como las del SPEC 19. React Router da prioridad a `/configuracion/esquemas/nuevo` y `/historial/:vacunaId` sobre `/configuracion/esquemas/:id`, porque los segmentos fijos ganan.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /esquemas-captura/{id}/publicar completo, /esquemas-captura/historial; HistorialEsquemas, EsquemaPublicar; vigenciaDesde y publicación en las respuestas
├── db/05_permisos_mysql.sql                   ← ESQUEMA_PUBLICAR y sus asignaciones
├── src/validaciones/campos.js                 ← validarMotivoCambio
├── src/modulos/configuracion/
│   ├── configuracion.routes.js                ← rutas de publicar e historial
│   ├── configuracion.controller.js            ← sus controladores
│   ├── mongoBitacora.js                       ← escribirEnTransaccionConBitacora
│   └── esquemas.service.js                    ← publicarEsquema, historialEsquemas, vigenciaDesde y publicación en las respuestas
└── tests/
    ├── campos.test.js                         ← casos nuevos
    └── esquemas-publicar.test.js              ← nuevo
frontend/src/
├── api/configuracion.js                       ← publicarEsquema, historialEsquemas
├── validaciones/campos.js                     ← validarMotivoCambio
├── validaciones/campos.test.js                ← los mismos casos
├── componentes/layout/opcionesMenu.js         ← subrutas de historial y versión
└── paginas/configuracion/
    ├── PestanaEsquemas.jsx                    ← "Publicar", "Historial", fecha del vigente
    ├── PestanaEsquemas.test.jsx               ← casos nuevos
    ├── EditorEsquema.jsx                      ← prop soloLectura
    ├── EditorEsquema.test.jsx                 ← casos nuevos
    ├── PaginaEditarEsquema.jsx                ← "Publicar" / "Guardar y publicar"
    ├── PaginaEditarEsquema.test.jsx           ← casos nuevos
    ├── DialogoPublicarEsquema.jsx             ← nuevo
    ├── DialogoPublicarEsquema.test.jsx        ← nuevo
    ├── PaginaHistorialEsquemas.jsx            ← nuevo
    ├── PaginaHistorialEsquemas.test.jsx       ← nuevo
    ├── PaginaVerEsquema.jsx                   ← nuevo
    └── PaginaVerEsquema.test.jsx              ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-17; notas en HU-18 y HU-20
CLAUDE.md                                      ← nota de publicación
```

Si falta el componente `textarea` de shadcn, se agrega con su CLI. No agrega dependencias nuevas.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`:
   - reemplazar el borrador de `POST /esquemas-captura/{id}/publicar` por el de este spec, con `x-permiso: ESQUEMA_PUBLICAR`, el esquema `EsquemaPublicar` y un ejemplo por cada error de la tabla;
   - agregar `GET /esquemas-captura/historial` con `HistorialEsquemas`;
   - agregar `vigente.vigenciaDesde` a `EsquemaPorVacuna`, y `publicadoPor`, `publicadoEn` y `motivoCambio` a `EsquemaCaptura`.

   Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permiso.** En `05_permisos_mysql.sql`, en un bloque "SPEC 20 (HU-17)", agregar `ESQUEMA_PUBLICAR` (módulo `CONFIGURACION_CATALOGOS`) y asignarlo al ADMINISTRADOR y al REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen el código.

3. **Regla de formato.** `validarMotivoCambio` en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`: un motivo válido, uno con espacios alrededor, vacío, solo espacios y uno de 301 caracteres. Comprobación: `campos.test.js` pasa en los dos proyectos.

4. **Backend: respuestas e historial.** Agregar `vigenciaDesde` y los campos de publicación a las respuestas, y crear `historialEsquemas` con su ruta (antes de `/:id`). Las pruebas de `tests/esquemas-publicar.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes borran los restos de corridas anteriores):
   - en MySQL, por SQL: la vacuna `ZVT_HU17` con las dosis `D1` y `D2` activas, y los 12 meses del año **2090** en `periodo`;
   - en MongoDB: un `VIGENTE` `NACIONAL` de `ZVT_HU17` sin desagregación, y un `BORRADOR` de la DDRISS ficticia `ZVT_OTRA17`;
   - borran los esquemas cuya `vacuna.codigo` empiece con `ZVT_HU17`, la vacuna y los meses de 2090.

   Casos:
   - el historial de HEXA trae v3 `BORRADOR` de `DDRISS_SM`, v2 `VIGENTE` y v1 `HISTORICO` nacionales, en ese orden, y v1 con `reportes` ≥ 1 (los de la semilla);
   - el borrador de `ZVT_OTRA17` no aparece en el historial de `ZVT_HU17`;
   - `vacunaId` faltante, no numérico o repetido, o un parámetro desconocido, responden 400; una vacuna inexistente responde 404;
   - `GET /esquemas-captura` trae `vigente.vigenciaDesde`, y `GET /esquemas-captura/{id}` de Hexavalente v2 trae `publicadoPor`, `publicadoEn` y `motivoCambio`.

   Comprobación: la prueba pasa.

5. **Backend: publicar.** `escribirEnTransaccionConBitacora` en `mongoBitacora.js`, y `publicarEsquema` con su ruta. Los borradores se crean con `POST /esquemas-captura` (SPEC 19). Casos:
   - **Primera publicación de la DDRISS:** publicar el borrador de `ZVT_HU17` con `2090-01-01`:
     - queda `VIGENTE`, con `vigencia { desde: 2090-01-01, hasta: null }`, `version_anterior_id: null`, `publicado_por` Int32, `publicado_en` y `motivo_cambio`;
     - el nacional no cambia;
     - deja una sola fila `PUBLICAR_ESQUEMA`.
   - **Segunda publicación:** un borrador nuevo publicado con `2090-03-01`:
     - queda `VIGENTE` con `version_anterior_id` = el de enero;
     - el de enero queda `HISTORICO` con `hasta: 2090-02-28` y el resto del documento idéntico (comparado campo por campo con lo que se leyó antes);
     - deja `PUBLICAR_ESQUEMA` y `ACTUALIZAR`.
   - **Historial:** después de las dos publicaciones, trae las tres versiones de `ZVT_HU17` con sus estados y vigencias.
   - **Vigencia:**
     - `2090-03-15` o `2090/03/01` responden 400;
     - el mes anterior al actual (de la semilla 2026) responde 422 `VIGENCIA_INVALIDA`;
     - un mes de 2089 (no está en `periodo`) responde 422;
     - un mes igual o anterior al `desde` del vigente de la DDRISS responde 422.
   - **Cuerpo:** sin `motivoCambio`, con un motivo de 301 caracteres o con un campo extra, responde 400.
   - **Coherencia:** un borrador que usa una dosis desactivada después de guardarlo (por SQL) responde 422 `ESQUEMA_INVALIDO`.
   - **Estado:**
     - publicar un `VIGENTE`, un `HISTORICO` o el nacional responde 409 `ESQUEMA_NO_EDITABLE`;
     - el borrador de `ZVT_OTRA17` responde 404.
   - **Concurrencia:** dos publicaciones en paralelo del mismo borrador: una 200 y otra 409. Queda un solo `VIGENTE` de la DDRISS y una sola fila `PUBLICAR_ESQUEMA`.
   - **Fallo de MongoDB:** si el segundo `updateOne` falla (`vi.spyOn`):
     - el anterior sigue `VIGENTE` y el borrador sigue `BORRADOR`;
     - no queda ninguna fila de bitácora.
   - **Permisos:**
     - con la cuenta del Revisor, publicar responde 200;
     - una cuenta de Epidemiología de la semilla (token firmado con sus datos reales) recibe 403.
   - **Reportes:** `GET /esquemas-captura/{id}` de Hexavalente v1 (`HISTORICO`, usada por los reportes de la semilla) responde 200 con su contenido completo.

   Comprobación: `npm test` del backend pasa completo.

6. **Frontend: diálogo y pestaña.** Las funciones de `src/api/configuracion.js`, `DialogoPublicarEsquema.jsx` y los cambios de `PestanaEsquemas.jsx`. Pruebas:
   - el diálogo ofrece solo los meses válidos (desde el actual, después del vigente de la DDRISS y presentes en el calendario), y avisa si no queda ninguno;
   - el aviso cambia según si el vigente es de la DDRISS o nacional;
   - "Publicar" se deshabilita sin mes o con un motivo inválido, y llama a `publicarEsquema` con `vigenciaDesde` y `motivoCambio`;
   - un 422 se ve en el Alert del diálogo, que sigue abierto;
   - la pestaña muestra "desde {fecha}" en el vigente, "Publicar" solo con borrador y con los dos permisos, e "Historial" con vigente o borrador;
   - al publicar, recarga y muestra el aviso.

   Comprobación: `npm test` del frontend pasa.

7. **Frontend: editor, historial y versión.** La prop `soloLectura` en `EditorEsquema.jsx`, el botón en `PaginaEditarEsquema.jsx`, `PaginaHistorialEsquemas.jsx`, `PaginaVerEsquema.jsx` y sus subrutas en `opcionesMenu.js`. Pruebas:
   - con `soloLectura`, los controles están deshabilitados y no aparecen «Problemas» ni «Guardar borrador»;
   - en el editor, con cambios, el botón dice "Guardar y publicar", guarda antes de abrir el diálogo y no lo abre si guardar falla; sin `ESQUEMA_PUBLICAR` no aparece;
   - el historial muestra las versiones con su Badge, su vigencia, su publicación y sus reportes, y "Ver" navega a la versión;
   - el historial vacío y el error con "Reintentar";
   - la versión muestra su card de datos y el editor deshabilitado; "Editar borrador" solo en un borrador con `ESQUEMA_EDITAR`.

   Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano). Publicar no se deshace, así que se usa una **vacuna de prueba manual**: no se publica ninguna vacuna real, y el borrador Hexavalente v3 del 04 no se toca.
   - **Como Administrador:**
     - registrar en «Vacunas» la vacuna `ZVM_HU17` con dos dosis (si los meses no están en el calendario, agregarlos en «Periodos»);
     - crear un borrador vacío y publicarlo desde la fila con la vigencia del mes siguiente y un motivo; ver "Versión {n} · DDRISS_SM · desde …";
     - crear un borrador copiando esa versión, cambiar una sección y usar "Guardar y publicar" desde el editor con el mes posterior; comprobar que el diálogo no ofrece el mes de la primera;
     - abrir el historial: la primera versión `Histórica` con su rango y la segunda `Vigente`, con su motivo y su usuario, y 0 reportes;
     - abrir el historial de Hexavalente: la v1 `Histórica` con los reportes de la semilla, y "Ver" muestra su contenido en solo lectura.
   - **Como Revisor:** ver el historial de `ZVM_HU17` y abrir el diálogo de publicar sobre un borrador nuevo sin confirmarlo; luego descartar ese borrador.
   - **Al terminar:**
     - desactivar `ZVM_HU17`;
     - revisar por SQL las filas `PUBLICAR_ESQUEMA` y `ACTUALIZAR` de la bitácora.

   Documentación:
   - en HU-17, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
   - en HU-18, la nota: "`EditorEsquema` tiene la prop `soloLectura` y `/configuracion/esquemas/:id` (SPEC 20) muestra una versión sin editar; la vista previa del formulario es otra cosa: reproduce lo que verá el establecimiento.";
   - en HU-20, la nota: "El esquema de un periodo es el de la DDRISS del establecimiento (`VIGENTE` o `HISTORICO`) cuya vigencia cubre el día 1 del mes; si no hay, el nacional que la cubra. Un `VIGENTE` puede tener `desde` futuro (SPEC 20), así que no basta con buscar el `VIGENTE`.";
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial:
     - publicar pasa el borrador a `VIGENTE` y el vigente anterior de la DDRISS a `HISTORICO` (solo `estado` y `vigencia.hasta`), en una transacción de MongoDB (`escribirEnTransaccionConBitacora`);
     - la vigencia es día 1 de un mes del calendario, desde el mes actual y después del vigente de la DDRISS, y puede ser futura;
     - `/esquemas-captura/historial` va antes de `/:id` en las rutas;
     - las pruebas usan `ZVT_HU17`, `ZVT_OTRA17` y el año 2090, y la prueba manual la vacuna `ZVM_HU17` (desactivada).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `POST /esquemas-captura/{id}/publicar` con `x-permiso: ESQUEMA_PUBLICAR` y `GET /esquemas-captura/historial` con `ESQUEMA_CONSULTAR`, el borrador anterior de publicar ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan esquemas `ZVT_HU17…`, la vacuna de prueba ni los meses de 2090.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Al publicar un borrador, queda `VIGENTE` con la vigencia elegida, `publicado_por`, `publicado_en` y `motivo_cambio`. La versión `VIGENTE` anterior de la misma DDRISS queda `HISTORICO`, con `hasta` el día anterior y el resto del documento sin cambios.
- [ ] El vigente nacional nunca cambia al publicar un esquema de DDRISS.
- [ ] Nunca hay dos `VIGENTE` de la misma vacuna y territorio, ni con dos publicaciones en paralelo (la segunda responde 409).
- [ ] Si MongoDB falla a mitad de la publicación, ninguno de los dos documentos cambia y no queda ninguna fila de bitácora.
- [ ] La vigencia solo acepta el día 1 de un mes del calendario, desde el mes actual y posterior al vigente de la DDRISS (400 o 422 `VIGENCIA_INVALIDA`), y el motivo es obligatorio (1 a 300 caracteres).
- [ ] Publicar vuelve a pasar las reglas de coherencia del SPEC 19 y responde 422 `ESQUEMA_INVALIDO` si el borrador usa algo que se desactivó.
- [ ] Solo se publica un borrador de la DDRISS del usuario: uno nacional, vigente o histórico responde 409, y uno de otra DDRISS responde 404.
- [ ] El historial de una vacuna muestra sus versiones nacionales y de la DDRISS del usuario, de la más nueva a la más vieja, con su estado, su vigencia, su publicación y la cantidad de reportes de la DDRISS que usan cada una. Hexavalente v1 muestra los reportes de la semilla.
- [ ] Una versión `HISTORICO` se sigue consultando completa con `GET /esquemas-captura/{id}` y en `/configuracion/esquemas/:id`.
- [ ] Cada publicación deja `PUBLICAR_ESQUEMA` y, si reemplaza a otra, `ACTUALIZAR` en la bitácora, con el módulo `CONFIGURACION` y el ObjectId como `entidad_id`.
- [ ] Sin `ESQUEMA_PUBLICAR` o `ESQUEMA_CONSULTAR`, sus endpoints responden 403 y la pantalla oculta los botones o las subrutas.
- [ ] El Administrador y el Revisor pueden publicar desde la fila de la pestaña y desde el editor, y consultar el historial y cada versión.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-17 tiene su avance y sus criterios marcados, HU-18 y HU-20 tienen su nota y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** la vigencia empieza el día 1 de un mes del calendario de `periodo`, desde el mes actual y después del vigente de la DDRISS (decidido en la fase de preguntas). Así una versión cubre meses completos, como los reportes, y `hasta` es el último día del mes anterior. **No:** siempre hoy, que parte un mes en dos; **no:** cualquier fecha a partir de hoy, que complica saber qué esquema usa un periodo.
- **Sí:** una vigencia futura pasa a `VIGENTE` de inmediato, y la anterior a `HISTORICO` con su `hasta` (decidido en la fase de preguntas). La pestaña muestra la nueva con su «desde», y HU-20 elige por la fecha del periodo. **No:** permitir solo el mes actual, que no deja preparar un cambio con tiempo. **No:** dejar el borrador en espera hasta su fecha, que necesitaría un proceso programado y un estado que el validador no tiene.
- **Sí:** el Administrador y el Revisor tienen `ESQUEMA_PUBLICAR`, como los demás permisos de esquemas. **No:** solo el Administrador, como dice la historia.
- **Sí:** los dos documentos se escriben en una transacción de MongoDB, dentro de la de MySQL de la bitácora (decidido en la fase de preguntas). **No:** dos escrituras con compensación, que dejan una ventana sin vigente y un caso de fallo sin cubrir.
- **Sí:** el motivo del cambio es obligatorio, de 1 a 300 caracteres, y se ve en el historial. **No:** opcional, que deja versiones sin explicación.
- **Sí:** de la versión que pasa a `HISTORICO` solo cambian `estado` y `vigencia.hasta`. Es la mecánica de versiones de `CONTEXTO BD.md` §6, no una edición del contenido.
- **Sí:** publicar vuelve a pasar las reglas de coherencia del SPEC 19, porque una dimensión, un valor o una dosis pudo desactivarse después de guardar el borrador. **No:** confiar en la última edición.
- **Sí:** la bitácora deja `PUBLICAR_ESQUEMA` (la acción ya existía) para el borrador y `ACTUALIZAR` para el anterior. **No:** una sola fila, que no deja rastro del cambio del otro documento.
- **Sí:** el historial es `GET /esquemas-captura/historial?vacunaId=`, con `ESQUEMA_CONSULTAR`, junto a los demás endpoints de esquemas. **No:** `GET /vacunas/{id}/esquemas-captura`, que mezcla el módulo de catálogos con el de configuración.
- **Sí:** el historial cuenta los reportes de la DDRISS que usan cada versión (decidido en la fase de preguntas). Así se comprueba con los reportes de la semilla que un reporte conserva su versión. **No:** depender solo de que el documento `HISTORICO` no cambia.
- **Sí:** «Publicar» está en la fila del borrador y en el editor, con un diálogo común; en el editor guarda antes si hay cambios. **No:** solo en la fila, que obliga a salir del editor.
- **Sí:** cada versión se ve en solo lectura con `EditorEsquema` deshabilitado, en `/configuracion/esquemas/:id`. **No:** solo la tabla del historial; la vista previa del formulario sigue siendo HU-18.
- **Sí:** la verificación manual publica sobre una vacuna de prueba manual, `ZVM_HU17`, que al final se desactiva (decidido en la fase de preguntas). Una publicación no se deshace, y publicar una vacuna real cambiaría para siempre el formulario de `DDRISS_SM`. **No:** Td u otra vacuna real; **no:** solo las pruebas automáticas.
- **Sí:** las pruebas usan el año 2090, porque la vigencia no admite meses pasados y el calendario de la semilla solo tiene 2026. **No:** los años 2020 o 2021 de los SPEC 16 y 17.

Decididas al implementar:

- **Sí:** `motivoCambio` devuelve lo que guarda `auditoria.motivo_cambio`, también en un borrador. El borrador Hexavalente v3 del 04 trae uno, y al publicar lo reemplaza el del cuerpo (paso 4). **No:** ocultarlo siempre en un borrador; **no:** precargarlo en el diálogo, que el spec no pide.
- **Sí:** el mensaje de un `vacunaId` inválido en el historial es el mismo de `POST /esquemas-captura`: "vacunaId debe ser un número entero positivo." (paso 4).
- **Sí:** las tres comparaciones exactas de `vigente` en `esquemas.test.js` (SPEC 19) agregan `vigenciaDesde`, porque la respuesta cambió; no se quitó ningún caso (paso 4).
- **Sí:** para "antes del mes actual", la prueba crea y borra junio de 2018 en `periodo`, en lugar de usar un mes de 2026 de la semilla. Así no depende de la fecha en que se corra (paso 5).
- **Sí:** `escribirConBitacora` (SPEC 18 y 19) no cambia y sigue sin transacción de MongoDB. `escribirEnTransaccionConBitacora` es aparte y comparte con ella solo cómo arma la fila de bitácora (paso 5).
- **Sí:** la columna «Acciones» de la pestaña aparece siempre, porque «Historial» solo pide `ESQUEMA_CONSULTAR`. La prueba del SPEC 19 "sin ESQUEMA_CREAR ni ESQUEMA_EDITAR no hay columna de acciones" pasa a comprobar que solo está «Historial» y no hay crear, editar, descartar ni publicar (decidido en el paso 6). **No:** el nombre de la vacuna como enlace, que es menos visible.
- **Sí:** el aviso del diálogo dice "su DDRISS" en lugar del `ddrissCodigo`, que la fila de la pestaña no trae. Sin vigente, dice "Desde esa fecha, su DDRISS usará esta versión.", un caso que el spec no nombraba. Antes de elegir el mes, dice "La versión {m} dejará de usarse el día anterior a la vigencia." (paso 6).
- **Sí:** un motivo vacío solo deshabilita «Publicar»; el mensaje de `validarMotivoCambio` aparece cuando hay texto inválido, como uno de más de 300 caracteres (paso 6).
- **Sí:** las pruebas del diálogo y de publicar en la pestaña fijan solo `Date` en el 24/10/2026 (`vi.useFakeTimers({ toFake: ['Date'] })`), para que el "mes actual" no dependa del día en que se corran (paso 6).
- **Sí:** `soloLectura` envuelve el contenido del editor en un `<fieldset disabled>`, que deshabilita en el navegador todos sus controles, también los de Radix (son botones), y les aplica los estilos `disabled:`. Además oculta lo que solo sirve para editar (quitar, agregar, mover, «Problemas» y el pie). Las pruebas lo comprueban con `:disabled`, porque la propiedad `disabled` de cada control no cambia (paso 7).
- **Sí:** `contenidoDe` pasa de `PaginaEditarEsquema.jsx` a `EditorEsquema.jsx`, porque ahora también lo usa `PaginaVerEsquema.jsx`. «Publicar» en el editor pide la fila de la vacuna con `listarEsquemas` para saber cuál es el vigente que aplica (paso 7).
- **Sí:** la prueba de `PaginaEditarEsquema` (SPEC 19) monta la página dentro de `ProveedorSesion` con una sesión, porque la página ahora revisa permisos; sus casos no cambian (paso 7).
- **Sí:** la fecha de "Publicada" se muestra en el día de Guatemala, no en el de UTC (paso 7).
- **Sí:** un conflicto de escritura (112) o un `VIGENTE` repetido (11000) durante la transacción responden 409 `BASE_DESACTUALIZADA`. Si el borrador ya no es `BORRADOR`, responde 409 `ESQUEMA_NO_EDITABLE`, porque `withTransaction` reintenta y la condición ya no se cumple (paso 5).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un MongoDB local sin conjunto de réplicas no admite transacciones, y publicar fallaría | Las bases de prueba son Atlas, que sí las admite. Si alguien usa la base local, publicar responde 500 y no cambia nada; se anota en la nota de `CLAUDE.md`. |
| MySQL se confirma después de MongoDB; si la confirmación falla, la publicación queda sin su fila de bitácora | Es la regla acordada (nota del 2026-10-20) y la ventana es mínima. El caso inverso tiene prueba. |
| Publicar con el mes actual cuando ya hay reportes de ese mes capturados con la versión anterior | Cada reporte guarda la versión que usó (`reporte_vacuna`) y no cambia. HU-20 decide qué pasa con un borrador de reporte abierto; queda en su nota. |
| Una vigencia futura confunde a quien lee «Vigente que aplica» antes de esa fecha | La fila y el historial muestran el «desde», y la anterior conserva su rango. |
| HU-20 resuelve el esquema buscando solo el `VIGENTE` y usa una versión futura antes de tiempo | La nota en HU-20 dice que se elige por la fecha del periodo. |
| Publicar por error una vacuna real en la base de prueba deja su formulario cambiado para siempre | La verificación manual usa `ZVM_HU17`, y el diálogo avisa que una versión publicada no se puede editar ni descartar. |
| Express toma `historial` como un `id` | La ruta se declara antes de `/:id`, y una prueba lo cubre. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Resolver el esquema de un periodo al capturar, y llenar `reporte_vacuna` (HU-19, HU-20).
- Despublicar, revertir o cambiar la vigencia de una versión publicada.
- Publicar esquemas nacionales o de otras DDRISS.
- Aviso de formularios desactualizados frente al nacional.
- Vista previa del formulario (HU-18).
- Versionar reglas o indicadores.
- Paginación del historial.
- Cambios al modelo de datos, al validador, a los índices o a las semillas.

Cada uno, si se hace, va en su propio spec.
