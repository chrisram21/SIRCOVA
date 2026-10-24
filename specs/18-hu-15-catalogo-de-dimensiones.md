# SPEC 18 — Catálogo de dimensiones de desagregación

> **Estado:** Aprobado
> **Historia:** HU-15
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 11, SPEC 15, SPEC 17
> **Fecha:** 2026-10-23
> **Objetivo:** Que el Administrador y el Revisor consulten, creen, editen, desactiven y reactiven en `/configuracion` las dimensiones de desagregación de MongoDB y sus valores, sin borrar nada y sin desactivar lo que usa un esquema de captura vigente o en borrador.

## Por qué existe este spec

La colección `catalogo_dimensiones` ya existe en el script 02 (v0.7), con su validador `$jsonSchema` y el índice único `uq_dimension_codigo`. Trae cuatro dimensiones: `sexo`, `grupo_edad`, `estado_embarazo` y `presentacion`. El 04 agrega `pueblo` (`datos_prueba: true`). `backend/openapi.yaml` tiene un borrador de `GET /dimensiones` sin `x-permiso`, sin errores y con `edadMinMeses` como entero obligatorio. Hoy las dimensiones solo se cargan con `mongosh`.

Es el **primer módulo que escribe en MongoDB**. Sigue la nota del 2026-10-20: primero la bitácora en la transacción de MySQL, luego MongoDB y al final se confirma MySQL.

Las dimensiones las consumen el editor de esquemas (HU-16, que valida contra valores activos), el formulario de captura (HU-20, `detalle_dimension`) y los filtros de indicadores (`filtros_dimension`).

**Conceptos** (aclarados al definir el spec):

- Una **dimensión** es una forma de desagregar una cantidad, por ejemplo «Sexo» o «Grupo de edad».
- Sus **valores** son las opciones de esa forma, por ejemplo `M`/`F` o `MENOR_1`, `1_A_5`…
- El **tipo** dice qué traen los valores:
  - `CATEGORICA`: solo una etiqueta.
  - `RANGO_EDAD`: además, un rango en meses.
- `grupo_edad` es la **única** dimensión `RANGO_EDAD`. La usan las secciones del 5C (`secciones[].grupo_edad`) y los indicadores. Un grupo de edad nuevo se agrega como **valor** de `grupo_edad`; no es una dimensión nueva.
- Un valor nunca se renombra. Si el 5C cambia un grupo (como `1_A_4` → `1_A_5` en la v0.5), se agrega el valor nuevo, lo usa un esquema nuevo (HU-16) y se desactiva el anterior cuando ningún esquema vigente o en borrador lo usa.

**Diferencias con la historia** (mandan `AGENTS.md` y lo que decidió el equipo):

- «No puedo borrar una dimensión que ya usa algún esquema»: nada se borra (`AGENTS.md` §5.6). Lo que se bloquea es **desactivar** una dimensión o un valor que usa un esquema `VIGENTE` o `BORRADOR` (409). Los esquemas `HISTORICO` no bloquean: lo guardado en `detalle_dimension` sigue siendo válido.
- «Los valores de grupo de edad coinciden con los códigos de `clasificacion_poblacion`»: se valida en los **valores nuevos** de la dimensión `RANGO_EDAD`. Los de la semilla que no coinciden (`2_4`, `10_14`) se quedan, y la pantalla los marca «Sin población». Un grupo de edad nuevo necesita existir antes en `clasificacion_poblacion`, y eso hoy solo se hace por SQL.
- La historia pide `GET /dimensiones`. Además, para crear, editar, desactivar y reactivar se agregan rutas como las del SPEC 15.
- La historia es para el Administrador. Por decisión del equipo, el **Revisor** (estadígrafa) tiene los mismos permisos, como en vacunas, periodos y población.

**Catálogo nacional.** `catalogo_dimensiones` no tiene territorio, y una dimensión de una DDRISS sería una acción global (`CONTEXTO BD.md`, reglas v0.7). No se filtra por DDRISS. La revisión de uso mira los esquemas de todos los territorios.

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de la pestaña «Vacunas» (tabla, filtro en la URL, subrutas de formulario).

## Alcance

**Entra:**

- Endpoints:
  - `GET /dimensiones` (con `activa`) y `GET /dimensiones/{codigo}`;
  - `POST /dimensiones` y `PATCH /dimensiones/{codigo}`;
  - `POST /dimensiones/{codigo}/desactivar` y `/reactivar`;
  - `POST /dimensiones/{codigo}/valores`, `PATCH /dimensiones/{codigo}/valores/{valor}` y `PUT /dimensiones/{codigo}/valores/orden`;
  - `POST /dimensiones/{codigo}/valores/{valor}/desactivar` y `/reactivar`.
- Las dimensiones nuevas son solo `CATEGORICA`. A `grupo_edad` (`RANGO_EDAD`) solo se le agregan valores.
- Los códigos los escribe el usuario. En la dimensión `RANGO_EDAD`, el código se elige de `clasificacion_poblacion`.
- Revisión de uso en `esquemas_captura` (`VIGENTE` y `BORRADOR`) antes de desactivar.
- Reglas de formato en los dos `campos.js` y en las dos tablas `CASOS`: `validarCodigoDimension`, `validarNombreDimension`, `validarDescripcionDimension`, `validarCodigoValorDimension`, `validarEtiquetaValorDimension` y `validarEdadMeses`.
- Permisos `DIMENSION_CONSULTAR`, `DIMENSION_CREAR` y `DIMENSION_EDITAR` para el Administrador y el Revisor, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`, entidad `catalogo_dimensiones`, `entidad_id` el ObjectId).
- Pestaña «Dimensiones» en `/configuracion`, con la tabla, el filtro de estado y las acciones de desactivar y reactivar.
- Subrutas `/configuracion/dimensiones/nueva` y `/configuracion/dimensiones/:codigo/editar`.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-15, una nota en HU-16 y en HU-20, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Crear o editar esquemas de captura, o validar que un esquema use dimensiones activas (HU-16).
- Crear dimensiones `RANGO_EDAD` nuevas.
- Gestionar `clasificacion_poblacion` desde la pantalla (agregar grupos de población).
- Cambiar el código o el tipo de una dimensión, o el código o el rango de edad de un valor.
- Borrar dimensiones o valores.
- Dimensiones por DDRISS (territorio en `catalogo_dimensiones`).
- Dar `DIMENSION_CONSULTAR` a otros roles (lo hará el spec del formulario o de indicadores que lo necesite).
- Paginar `GET /dimensiones`.
- Cambios al modelo de datos, al validador de `catalogo_dimensiones` y a las semillas de `backend/db/01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa la colección del script 02 tal como está:

```js
// catalogo_dimensiones (MongoDB, base vacunacion_config)
{
  _id: ObjectId,
  codigo: "presentacion",            // ^[a-z][a-z0-9_]*$, único (uq_dimension_codigo)
  nombre: "Presentación",
  descripcion: "Cómo se aplicó la dosis…", // opcional; si no hay, el campo no existe
  tipo: "CATEGORICA",                // o "RANGO_EDAD" (solo grupo_edad)
  activo: true,
  valores: [                         // minItems: 1
    { codigo: "IPV", etiqueta: "IPV (inactivada, inyectada)", orden: 1, activo: true },
    // en RANGO_EDAD además: edad_min_meses, edad_max_meses (Int32)
  ],
  auditoria: { creado_por: 1, creado_en: ISODate, publicado_por: null, publicado_en: null, motivo_cambio: null }
}
```

- `orden` y `auditoria.creado_por` son `int` en el validador. El backend los manda como Int32 (`new Int32(n)` del paquete `mongodb`), no como `double`.
- `auditoria` se llena solo al crear: `creado_por` es el id del usuario de MySQL y `publicado_*` y `motivo_cambio` van en `null`. Las ediciones no la cambian: el historial está en la bitácora.
- Los códigos tienen hasta **30** caracteres, el largo de `detalle_dimension.dimension_codigo` y `valor_codigo`.

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `DIMENSION_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar el catálogo de dimensiones de desagregación | ADMINISTRADOR, REVISOR |
| `DIMENSION_CREAR` | `CONFIGURACION_CATALOGOS` | Registrar dimensiones de desagregación con sus valores | ADMINISTRADOR, REVISOR |
| `DIMENSION_EDITAR` | `CONFIGURACION_CATALOGOS` | Editar, desactivar y reactivar dimensiones, y agregar, editar, ordenar, desactivar y reactivar sus valores | ADMINISTRADOR, REVISOR |

### Respuesta de una dimensión (esquema `Dimension`)

```json
{
  "id": "6720f0c1a2b3c4d5e6f70812",
  "codigo": "grupo_edad",
  "nombre": "Grupo de edad",
  "descripcion": null,
  "tipo": "RANGO_EDAD",
  "activa": true,
  "enUso": true,
  "valores": [
    { "codigo": "MENOR_1", "etiqueta": "< 1 año", "orden": 1, "activo": true,
      "edadMinMeses": 0, "edadMaxMeses": 12, "enUso": true, "sinPoblacion": false },
    { "codigo": "2_4", "etiqueta": "2 a 4 años", "orden": 5, "activo": true,
      "edadMinMeses": 24, "edadMaxMeses": 60, "enUso": false, "sinPoblacion": true }
  ]
}
```

- Los valores van ordenados por `orden`.
- `edadMinMeses`, `edadMaxMeses` y `sinPoblacion` solo vienen en una dimensión `RANGO_EDAD`.
- `sinPoblacion` es `true` si el código no está en `clasificacion_poblacion`.
- `enUso` dice si un esquema `VIGENTE` o `BORRADOR` usa la dimensión o el valor. La pantalla lo usa para avisar antes de desactivar; la regla la aplica el backend.
- `GET /dimensiones/{codigo}` de una dimensión `RANGO_EDAD` agrega `gruposPoblacionDisponibles: [{ codigo, descripcion }]`: los grupos de `clasificacion_poblacion` que la dimensión todavía no tiene, ordenados por `id`.

### Uso en esquemas

Una dimensión o un valor está **en uso** si un documento de `esquemas_captura` con `estado` `VIGENTE` o `BORRADOR`, de cualquier territorio, lo nombra en alguno de estos lugares:

- `dimensiones.desagregacion[].dimension` y `.valores[]`;
- `dimensiones.dosis[].desagregacion[].dimension` y `.valores[]`;
- `secciones[].grupo_edad`, que cuenta como un valor de `grupo_edad`.

### Endpoints

Todos devuelven y reciben camelCase; el servicio convierte a snake_case para MongoDB.

**`GET /dimensiones` (`DIMENSION_CONSULTAR`).**

- Parámetro opcional: `activa` (`true` o `false`, con `leerBooleano` y `revisarParametros`).
- Responde 200 con un arreglo de `Dimension`, ordenado por `nombre`.
- No pagina.

**`GET /dimensiones/{codigo}` (`DIMENSION_CONSULTAR`).**

- Responde 200 con la dimensión, o 404 `NO_ENCONTRADO`.

**`POST /dimensiones` (`DIMENSION_CREAR`).**

- Cuerpo:

  ```json
  { "codigo": "via", "nombre": "Vía de aplicación", "descripcion": null, "valores": [ { "codigo": "IM", "etiqueta": "Intramuscular" } ] }
  ```

- Crea una dimensión `CATEGORICA` activa.
- `valores` trae al menos uno (400 "Indique al menos un valor."). Cada valor queda activo, con `orden` según su posición (1, 2, 3…).
- Validaciones:
  - un campo distinto de los cuatro, o un `tipo`, responde 400;
  - los formatos de `campos.js` responden 400;
  - dos valores con el mismo código en el cuerpo responden 400 "El valor {codigo} está repetido.";
  - un código de dimensión que ya existe responde 409 `DIMENSION_DUPLICADA` (también si el índice único choca en dos altas simultáneas).
- Responde 201 con la dimensión.
- Bitácora: `CREAR` con el documento completo.

**`PATCH /dimensiones/{codigo}` (`DIMENSION_EDITAR`).**

- Cuerpo: `nombre` y/o `descripcion`. Cualquier otro campo responde 400, y un cuerpo vacío responde 400 "Indique al menos un dato de la dimensión.".
- `descripcion` vacía o `null` quita el campo.
- Si `diferencias` da `null`, responde 200 sin escribir ni registrar.
- Si no, actualiza y registra `ACTUALIZAR`.
- Una dimensión inactiva también se puede editar.

**`POST /dimensiones/{codigo}/desactivar` (`DIMENSION_EDITAR`).**

- Una dimensión en uso responde 409 `DIMENSION_EN_USO` ("La dimensión {codigo} la usa un esquema de captura vigente o en borrador.").
- Una dimensión ya inactiva responde 409 `DIMENSION_YA_INACTIVA`.
- Los valores no cambian.
- Bitácora: `DESACTIVAR`.

**`POST /dimensiones/{codigo}/reactivar` (`DIMENSION_EDITAR`).**

- Una dimensión ya activa responde 409 `DIMENSION_YA_ACTIVA`.
- Bitácora: `REACTIVAR`.

**`POST /dimensiones/{codigo}/valores` (`DIMENSION_EDITAR`).**

- Cuerpo `CATEGORICA`: `{ "codigo": "SC", "etiqueta": "Subcutánea" }`.
- Cuerpo `RANGO_EDAD`: además `edadMinMeses` y `edadMaxMeses`, ambos obligatorios. Son enteros de 0 a 1200 (`validarEdadMeses`), con el mínimo menor que el máximo (400 "La edad mínima debe ser menor que la máxima.").
- En una dimensión `CATEGORICA`, mandar `edadMinMeses` o `edadMaxMeses` responde 400.
- En `RANGO_EDAD`, el código debe estar en `clasificacion_poblacion` (400 "El grupo {codigo} no existe en la clasificación de población.").
- Un código que ya tiene la dimensión, activo o inactivo, responde 409 `VALOR_DUPLICADO`. La actualización usa la condición `valores.codigo: { $ne: codigo }` para que dos altas simultáneas no lo dupliquen.
- El valor queda activo, con `orden` = mayor `orden` de la dimensión + 1.
- Se puede agregar a una dimensión inactiva.
- Bitácora: `ACTUALIZAR` con `valoresAnteriores: null` y `valoresNuevos: { valor: {…} }`.
- Responde 201 con la dimensión.

**`PATCH /dimensiones/{codigo}/valores/{valor}` (`DIMENSION_EDITAR`).**

- Cuerpo: `etiqueta`. Cualquier otro campo responde 400.
- Un valor inexistente responde 404.
- Si no cambia nada, responde 200 sin registrar.
- Si cambia, registra `ACTUALIZAR` con `{ valor, etiqueta }` antes y después.

**`PUT /dimensiones/{codigo}/valores/orden` (`DIMENSION_EDITAR`).**

- Cuerpo: `{ "codigos": ["MENOR_1", "1_A_MENOR_2", …] }`, con **todos** los valores de la dimensión (activos e inactivos), cada uno una vez.
- Si falta, sobra o se repite un código, responde 400 "La lista debe traer cada valor de la dimensión una sola vez.".
- Asigna `orden` 1…n.
- Bitácora: `ACTUALIZAR` con el orden anterior y el nuevo (`{ orden: [codigos] }`), solo si cambió.

**`POST /dimensiones/{codigo}/valores/{valor}/desactivar` y `/reactivar` (`DIMENSION_EDITAR`).**

- Desactivar un valor en uso responde 409 `VALOR_EN_USO` ("El valor {valor} lo usa un esquema de captura vigente o en borrador.").
- No se desactiva el último valor activo de la dimensión: 409 `ULTIMO_VALOR_ACTIVO` ("La dimensión debe conservar al menos un valor activo.").
- Desactivar un valor ya inactivo, o reactivar uno ya activo, responde 409 `VALOR_YA_INACTIVO` / `VALOR_YA_ACTIVO`.
- Bitácora: `DESACTIVAR` / `REACTIVAR` con `{ valor, activo }` antes y después, como la dimensión registra `{ activa }` (decidido en el paso 6).

**Orden de escritura (nota del 2026-10-20).** Cada escritura sigue estos pasos:

1. Lee el documento.
2. Valida.
3. Abre `enTransaccion` y escribe la fila de bitácora.
4. Hace **un solo** `updateOne` o `insertOne` condicionado en MongoDB, que es atómico por documento.
5. Si MongoDB falla o no modifica nada por la condición, lanza el error correspondiente (409 o 404), y `enTransaccion` deshace la bitácora.
6. Si MongoDB escribe bien, se confirma MySQL.

La revisión de uso se hace antes de abrir la transacción.

### Errores de las dimensiones

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Parámetro o campo no permitido, formato inválido, `valores` vacío, `PATCH` vacío, valor repetido en el cuerpo, rango inválido, grupo fuera de `clasificacion_poblacion`, lista de orden incompleta | los de `campos.js` / "Indique al menos un valor." / "Indique al menos un dato de la dimensión." / los de esta sección / los del SPEC 12 |
| 404 | `NO_ENCONTRADO` | Dimensión o valor inexistente | "El recurso solicitado no existe." |
| 409 | `DIMENSION_DUPLICADA` | Código de dimensión repetido | "Ya existe una dimensión con el código {codigo}." |
| 409 | `VALOR_DUPLICADO` | Código de valor repetido en la dimensión | "La dimensión ya tiene el valor {codigo}." |
| 409 | `DIMENSION_EN_USO` / `VALOR_EN_USO` | Desactivar algo que usa un esquema VIGENTE o BORRADOR | los de esta sección |
| 409 | `ULTIMO_VALOR_ACTIVO` | Desactivar el último valor activo | "La dimensión debe conservar al menos un valor activo." |
| 409 | `DIMENSION_YA_ACTIVA` / `DIMENSION_YA_INACTIVA` / `VALOR_YA_ACTIVO` / `VALOR_YA_INACTIVO` | La acción no cambia el estado | "La dimensión ya está activa." / "… inactiva." / "El valor ya está activo." / "… inactivo." |

Los 401 y 403 no cambian. El 500 del borrador se quita: un error de MongoDB pasa por el manejador común.

### Reglas de formato (`campos.js`)

| Regla | Acepta | Error |
|---|---|---|
| `validarCodigoDimension` | recorta; `^[a-z][a-z0-9_]*$`, de 2 a 30 caracteres | "El código debe empezar con una letra minúscula y usar solo minúsculas, números y guion bajo (hasta 30)." |
| `validarCodigoValorDimension` | recorta y pasa a mayúsculas; `^[A-Z0-9_]+$`, de 1 a 30 caracteres | "El código del valor usa solo mayúsculas, números y guion bajo (hasta 30)." |
| `validarNombreDimension` | recorta; de 2 a 60 caracteres | "El nombre debe tener entre 2 y 60 caracteres." |
| `validarDescripcionDimension` | recorta; vacío → `null`; hasta 255 | "La descripción admite hasta 255 caracteres." |
| `validarEtiquetaValorDimension` | recorta; de 1 a 60 caracteres | "La etiqueta debe tener entre 1 y 60 caracteres." |
| `validarEdadMeses` | entero o texto de solo dígitos; de 0 a 1200 | "La edad debe ser un número entero de meses entre 0 y 1,200." |

Van en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22). En el backend, una edad que llega como texto en el JSON responde 400, porque el servicio exige `Number.isInteger` antes de la regla.

### Frontend

**`src/api/configuracion.js`** (nuevo, para el módulo `configuracion`). Funciones:

- `listarDimensiones({ activa })` y `obtenerDimension(codigo)`;
- `crearDimension(datos)` y `editarDimension(codigo, datos)`;
- `desactivarDimension(codigo)` y `reactivarDimension(codigo)`;
- `agregarValorDimension(codigo, datos)`, `editarValorDimension(codigo, valor, datos)` y `ordenarValoresDimension(codigo, codigos)`;
- `desactivarValorDimension(codigo, valor)` y `reactivarValorDimension(codigo, valor)`.

**Pestaña «Dimensiones» (`PestanaDimensiones.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `dimensiones`, después de «Vacunas», con el permiso `DIMENSION_CONSULTAR`.

- Card "Dimensiones de desagregación" con el texto "Formas de desagregar la producción que pueden usar los esquemas de captura. Los códigos no se borran ni se renombran; se desactivan.".
- Select "Estado" (Todas, Activas, Inactivas), guardado en la URL (`activa`) junto a `pestana`.
- Botón "Nueva dimensión" (solo con `DIMENSION_CREAR`).
- Tabla:

  | Código | Nombre | Tipo | Valores | Estado | Acciones |
  |---|---|---|---|---|---|

  - Tipo: "Categórica" o "Rango de edad".
  - Valores: un Badge por valor activo, en orden, con su etiqueta, y "+N inactivos" si hay.
  - Estado: Badge "Activa" o "Inactiva", y "En uso" si `enUso`.
  - Acciones (solo con `DIMENSION_EDITAR`): "Editar" y "Desactivar" o "Reactivar", con un AlertDialog de confirmación. Si `enUso`, "Desactivar" queda deshabilitado con el Tooltip "La usa un esquema vigente o en borrador.". Un 409 se muestra en un Alert.
- Carga: Skeleton. Error: Alert "No se pudieron cargar las dimensiones: {mensaje}" y "Reintentar".

**Subruta `/configuracion/dimensiones/nueva` (`PaginaRegistrarDimension.jsx`, permiso `DIMENSION_CREAR`).**

- Campos "Código", "Nombre" y "Descripción" (opcional), con la nota "El código no se puede cambiar después.".
- Lista "Valores": filas con "Código" y "Etiqueta", con "Agregar valor" y "Quitar" (quitar solo antes de guardar). Empieza con una fila vacía.
- Valida en el cliente con `campos.js`, y avisa de los códigos de valor repetidos y de una lista sin valores.
- Al guardar, vuelve a la pestaña con sus filtros (`state.volverA`, como el SPEC 14) y muestra el aviso "Dimensión {nombre} registrada.".
- Un 400 o 409 se muestra en un Alert y conserva lo escrito.

**Subruta `/configuracion/dimensiones/:codigo/editar` (`PaginaEditarDimension.jsx`, permiso `DIMENSION_EDITAR`).**

- Encabezado con el código y el tipo (solo lectura).
- Formulario "Nombre" y "Descripción", con su botón "Guardar cambios".
- Tabla de valores:

  | Orden | Código | Etiqueta | Rango (solo `RANGO_EDAD`) | Estado | Acciones |
  |---|---|---|---|---|---|

  - Rango: "{min} a {max} meses".
  - Estado: "Activo"/"Inactivo", "En uso" y, en `RANGO_EDAD`, "Sin población" si `sinPoblacion`.
  - Acciones:
    - "Subir" y "Bajar", que llaman a `ordenarValoresDimension` con la lista completa;
    - "Editar etiqueta", en un Dialog;
    - "Desactivar" o "Reactivar". "Desactivar" queda deshabilitado si el valor está `enUso` o es el último activo.
- Botón "Agregar valor", que abre `DialogoValorDimension.jsx`:
  - en `CATEGORICA`: "Código" y "Etiqueta";
  - en `RANGO_EDAD`: un Select "Grupo de población" con `gruposPoblacionDisponibles`, más "Etiqueta", "Edad mínima (meses)" y "Edad máxima (meses)". Si no hay grupos disponibles, el botón queda deshabilitado con el texto "Todos los grupos de la clasificación de población ya están en esta dimensión.".
- Cada acción reemplaza la dimensión con la de la respuesta y muestra un aviso. Un error se muestra en un Alert (dentro del Dialog si viene de uno).
- Un `codigo` que no existe muestra "La dimensión no existe." con un enlace a la pestaña.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /dimensiones y sus subrutas; esquemas Dimension, ValorDimension, DimensionCrear, DimensionEditar, ValorDimensionCrear, ValorDimensionEditar, OrdenValores; se quita el borrador
├── db/05_permisos_mysql.sql                   ← DIMENSION_CONSULTAR, DIMENSION_CREAR, DIMENSION_EDITAR y sus asignaciones
├── src/validaciones/campos.js                 ← las seis reglas
├── src/app.js                                 ← monta las rutas de configuración (si aún no están)
├── src/modulos/configuracion/
│   ├── configuracion.routes.js                ← nuevo
│   ├── configuracion.controller.js            ← nuevo
│   └── dimensiones.service.js                 ← nuevo: consultar, crear, editar, valores, uso en esquemas
└── tests/
    ├── campos.test.js                         ← casos nuevos
    └── dimensiones.test.js                    ← nuevo
frontend/src/
├── api/configuracion.js                       ← nuevo
├── validaciones/campos.js                     ← las mismas seis reglas
├── validaciones/campos.test.js                ← los mismos casos
├── componentes/layout/opcionesMenu.js         ← subrutas de dimensiones
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Dimensiones»
    ├── PestanaDimensiones.jsx                 ← nuevo
    ├── PestanaDimensiones.test.jsx            ← nuevo
    ├── PaginaRegistrarDimension.jsx           ← nuevo
    ├── PaginaRegistrarDimension.test.jsx      ← nuevo
    ├── PaginaEditarDimension.jsx              ← nuevo
    ├── PaginaEditarDimension.test.jsx         ← nuevo
    └── DialogoValorDimension.jsx              ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-15; notas en HU-16 y HU-20
CLAUDE.md                                      ← nota de dimensiones
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, reemplazar el borrador de `/dimensiones` por los endpoints de este spec. Incluir sus esquemas, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos.** En `05_permisos_mysql.sql`, en un bloque "SPEC 18 (HU-15)":
   - agregar `DIMENSION_CONSULTAR`, `DIMENSION_CREAR` y `DIMENSION_EDITAR` (módulo `CONFIGURACION_CATALOGOS`);
   - asignarlos al ADMINISTRADOR y al REVISOR.

   **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen los tres códigos.

3. **Reglas de formato.** Las seis reglas en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`:
   - códigos válidos, con mayúscula inicial, con guion, de 31 caracteres y vacíos;
   - nombre de 1 y de 61 caracteres;
   - descripción de 256 caracteres y solo espacios;
   - etiqueta vacía;
   - edades 0, 1200, 1201, -1, 1.5, "24" y "2a".

   Comprobación: `campos.test.js` pasa en los dos proyectos.

4. **Backend: consulta.** Crear:
   - `dimensiones.service.js`, con `listarDimensiones`, `obtenerDimension` y la función de uso en esquemas;
   - `configuracion.routes.js` y `configuracion.controller.js`, montados en `app.js`.

   Las pruebas de `tests/dimensiones.test.js` preparan sus datos al inicio y en `afterAll` (borran antes los restos de corridas anteriores):
   - insertan directamente en MongoDB una dimensión `RANGO_EDAD` `zvt_edad` (valores `MENOR_1` y `ZVT_SIN_POB`), una `CATEGORICA` `zvt_uso`, y un esquema `BORRADOR` de una vacuna ficticia `ZVT_HU15` que usa `zvt_uso` (valor `A`) y el valor `MENOR_1` de `zvt_edad`;
   - borran todos los documentos `zvt_…` y `ZVT_HU15`.

   Casos:
   - `GET /dimensiones` trae las cuatro de la semilla, ordenadas por nombre, con camelCase y `enUso` (`sexo` en uso por el VPH vigente);
   - `?activa=false` solo trae inactivas, y `?activa=abc` o un parámetro desconocido responde 400;
   - `GET /dimensiones/zvt_edad` trae `sinPoblacion` en `ZVT_SIN_POB` y `gruposPoblacionDisponibles` sin `MENOR_1`;
   - un código inexistente responde 404;
   - una cuenta de Epidemiología de la semilla, con un token firmado con sus datos reales, recibe 403.

   Comprobación: la prueba pasa.

5. **Backend: crear y editar la dimensión.** `crearDimension`, `editarDimension`, `desactivarDimension` y `reactivarDimension`, con sus rutas. Pruebas:
   - un `POST` crea `zvt_via` con dos valores, `orden` 1 y 2, tipo `CATEGORICA`, tipos Int32 en MongoDB y una fila `CREAR` en la bitácora;
   - repetir el código responde 409 `DIMENSION_DUPLICADA`;
   - dos valores repetidos, `valores` vacío, un `tipo` o un campo extra responden 400;
   - un `PATCH` del nombre deja una fila `ACTUALIZAR`; uno sin cambios no deja filas; uno con `codigo` responde 400;
   - desactivar `zvt_via` deja `DESACTIVAR`; repetirlo responde 409; reactivar deja `REACTIVAR`;
   - desactivar `zvt_uso` responde 409 `DIMENSION_EN_USO`. Si se cambia el esquema de prueba a `HISTORICO` por la base, se puede desactivar;
   - si MongoDB falla (se simula con `vi.spyOn` sobre la colección), no queda la fila de bitácora.

   Comprobación: la prueba pasa.

6. **Backend: valores.** Agregar, editar etiqueta, ordenar, desactivar y reactivar valores, con sus rutas. Pruebas:
   - agregar `SC` a `zvt_via` le da el siguiente `orden` y deja `ACTUALIZAR`; repetirlo responde 409 `VALOR_DUPLICADO`;
   - mandar edades en una `CATEGORICA` responde 400;
   - en `zvt_edad`:
     - agregar `4_ANIOS` con 48 a 60 meses funciona;
     - `NO_EXISTE` responde 400;
     - un mínimo mayor o igual que el máximo responde 400;
     - si faltan las edades, responde 400;
   - editar la etiqueta deja `ACTUALIZAR`; un valor inexistente responde 404;
   - ordenar con la lista completa cambia los `orden`; con una lista incompleta o repetida responde 400;
   - desactivar `MENOR_1` de `zvt_edad` responde 409 `VALOR_EN_USO`; desactivar el único valor activo responde 409 `ULTIMO_VALOR_ACTIVO`;
   - dos altas en paralelo del mismo valor: una 201 y otra 409, y queda un solo valor con ese código;
   - con la cuenta del Revisor, agregar un valor responde 201.

   Comprobación: `npm test` del backend pasa completo.

7. **Frontend: pestaña.** Crear las funciones de `src/api/configuracion.js` y `PestanaDimensiones.jsx`, con la tabla, el filtro, los estados y las acciones de desactivar y reactivar, y agregar la pestaña a `PESTANAS`. En `PestanaDimensiones.test.jsx`:
   - la tabla muestra el tipo, los valores activos en orden y "+N inactivos";
   - cambiar el filtro pide `listarDimensiones` con `activa` y queda en la URL;
   - "Desactivar" está deshabilitado en una dimensión `enUso`; confirmar en otra llama a la API y actualiza la fila; un 409 se ve en el Alert;
   - si falla la carga, "Reintentar" vuelve a pedir;
   - sin `DIMENSION_CONSULTAR` no aparece la pestaña, y sin `DIMENSION_CREAR` o `DIMENSION_EDITAR` no aparecen sus botones;
   - las pruebas de las otras pestañas siguen pasando.

   Comprobación: `npm test` del frontend pasa.

8. **Frontend: registrar.** `PaginaRegistrarDimension.jsx` y su subruta en `opcionesMenu.js`. Pruebas:
   - guardar llama a `crearDimension` con los valores en orden y vuelve a la pestaña con el aviso;
   - un código inválido, un valor repetido o una lista vacía muestran su error y no llaman a la API;
   - un 409 se muestra en el Alert y conserva lo escrito.

   Comprobación: `npm test` del frontend pasa.

9. **Frontend: editar.** `PaginaEditarDimension.jsx`, `DialogoValorDimension.jsx` y su subruta. Pruebas:
   - guardar el nombre llama a `editarDimension`;
   - "Bajar" llama a `ordenarValoresDimension` con la lista completa reordenada;
   - en una `CATEGORICA`, el Dialog pide código y etiqueta;
   - en una `RANGO_EDAD`, el Dialog muestra el Select con `gruposPoblacionDisponibles` y los campos de edad, y valida mínimo < máximo;
   - "Desactivar" está deshabilitado en un valor `enUso` y en el último activo;
   - "Sin población" aparece en el valor que la trae;
   - un código inexistente muestra "La dimensión no existe.".

   Comprobación: `npm test` del frontend pasa completo.

10. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano):
    - **Como Administrador:**
      - abrir la pestaña «Dimensiones» y ver las cuatro de la semilla, con `2_4` y `10_14` marcados «Sin población»;
      - crear una dimensión de prueba con dos valores;
      - editar su nombre, agregar un valor, reordenar y desactivarla;
      - comprobar que "Desactivar" está deshabilitado en `sexo` y en `MENOR_1` de `grupo_edad`;
      - abrir "Agregar valor" en `grupo_edad` y ver solo `NACIDOS_VIVOS` y `EMBARAZADAS` disponibles, sin guardar.
    - **Como Revisor:** ver la pestaña y editar la etiqueta del valor de prueba.
    - **Al terminar:** revisar por SQL las filas de la bitácora. La dimensión de prueba no se puede borrar desde la pantalla: queda inactiva o, con autorización, se borra en MongoDB.

    Documentación:
    - en HU-15, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
    - en HU-16, la nota: "El esquema solo usa dimensiones y valores activos (`GET /dimensiones?activa=true`, SPEC 18); un esquema VIGENTE o BORRADOR impide desactivarlos.";
    - en HU-20, la nota: "Para mostrar las etiquetas, el formulario necesita leer el catálogo de dimensiones; el spec decide si da `DIMENSION_CONSULTAR` al personal de establecimiento o si `GET /reportes/{id}/formulario` trae las etiquetas.";
    - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial:
      - módulo `configuracion` y orden bitácora → MongoDB → confirmar;
      - Int32 en MongoDB;
      - `grupo_edad` es la única `RANGO_EDAD` y sus valores nuevos salen de `clasificacion_poblacion`;
      - «en uso» = esquema VIGENTE o BORRADOR;
      - las pruebas usan códigos `zvt_`/`ZVT_` y la vacuna ficticia `ZVT_HU15`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los endpoints de `/dimensiones` con su `x-permiso`, el borrador anterior ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan documentos `zvt_…` en `catalogo_dimensiones` ni el esquema `ZVT_HU15` en `esquemas_captura`.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Desde la pantalla se puede crear una dimensión `CATEGORICA` con sus valores, y no se puede crear una `RANGO_EDAD`.
- [ ] Un valor nuevo de `grupo_edad` solo se puede crear con un código de `clasificacion_poblacion` que la dimensión no tenga, y con un rango en meses válido.
- [ ] Los valores de `grupo_edad` que no están en `clasificacion_poblacion` se ven marcados «Sin población».
- [ ] No se puede desactivar una dimensión ni un valor que usa un esquema VIGENTE o BORRADOR (409), y sí se puede si solo lo usa uno HISTORICO.
- [ ] Ninguna dimensión ni ningún valor se borra; el código y el tipo no cambian, y el código y el rango de un valor tampoco.
- [ ] Un código de dimensión o de valor repetido responde 409, también con dos altas en paralelo.
- [ ] Cada escritura deja su fila (`CREAR`, `ACTUALIZAR`, `DESACTIVAR` o `REACTIVAR`) en la bitácora con el módulo `CONFIGURACION` y el ObjectId como `entidad_id`. Una edición sin cambios no deja filas, y un fallo de MongoDB no deja la fila.
- [ ] Sin `DIMENSION_CONSULTAR`, `DIMENSION_CREAR` o `DIMENSION_EDITAR`, sus endpoints responden 403 y la pantalla oculta la pestaña o los botones.
- [ ] El Administrador y el Revisor ven la pestaña «Dimensiones» y pueden crear y editar.
- [ ] El filtro de estado queda en la URL y se conserva al recargar.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-15 tiene su avance y sus criterios marcados, HU-16 y HU-20 tienen su nota y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** el Administrador y el Revisor tienen `DIMENSION_CONSULTAR`, `DIMENSION_CREAR` y `DIMENSION_EDITAR`. Lo decidió el equipo, como en vacunas, periodos y población. **No:** solo el Administrador, como dice la historia; **no:** el Revisor solo con consulta.
- **Sí:** «no borrar» se traduce en no **desactivar** lo que usa un esquema `VIGENTE` o `BORRADOR` (409). Si se desactivara, la regla `DIMENSIONES_VALIDAS` rechazaría la captura con ese esquema. **No:** bloquear también por esquemas `HISTORICO`, porque lo guardado sigue siendo válido; **no:** permitir siempre desactivar.
- **Sí:** solo los valores **nuevos** de la dimensión `RANGO_EDAD` se validan contra `clasificacion_poblacion`. Los de la semilla que no coinciden (`2_4`, `10_14`) se quedan y se marcan «Sin población». **No:** solo un aviso; **no:** quitar o corregir los de la semilla.
- **Sí:** las dimensiones nuevas son solo `CATEGORICA`, y `grupo_edad` es la única `RANGO_EDAD`. Un grupo de edad nuevo es un valor de `grupo_edad`. **No:** crear otras dimensiones de edad, que las secciones del 5C y los indicadores no sabrían usar.
- **Sí:** después de crear se editan el nombre, la descripción, la etiqueta y el orden de los valores, y se agregan valores. **No:** cambiar el código o el tipo (`AGENTS.md` §5.6); **no:** corregir el rango de edad de un valor, que cambiaría el significado de lo ya capturado; **no:** solo agregar y desactivar.
- **Sí:** los códigos los escribe el usuario, con los patrones del validador de MongoDB y hasta 30 caracteres (`detalle_dimension`). En `grupo_edad` se eligen de `clasificacion_poblacion`. **No:** generarlos en el backend desde el nombre, porque `grupo_edad` necesita códigos que ya existen.
- **Sí:** pestaña «Dimensiones» con subrutas de registro y edición, como «Vacunas» con sus dosis. **No:** un Dialog grande; **no:** maestro-detalle con edición en línea.
- **Sí:** las rutas usan el `codigo` de la dimensión, que es único y estable, en lugar del ObjectId. Decidido al escribir el spec.
- **Sí:** módulo backend nuevo `configuracion` (`AGENTS.md` §4) y `src/api/configuracion.js` en el frontend, porque las dimensiones son configuración de MongoDB y no un catálogo de MySQL. Decidido al escribir el spec.
- **Sí:** el orden de escritura es bitácora en la transacción → un solo `updateOne`/`insertOne` condicionado en MongoDB → confirmar MySQL (nota del 2026-10-20). Las condiciones del `updateOne` (`$ne` sobre el código, índice único) evitan duplicados sin bloqueos. **No:** transacciones de MongoDB, que no se pueden unir a la de MySQL.
- **Sí:** el orden de los valores se cambia con `PUT …/valores/orden` y la lista completa. **No:** un `orden` editable por valor, que deja huecos y empates.
- **Sí:** desactivar algo ya inactivo, o reactivar algo ya activo, responde 409 (`DIMENSION_YA_INACTIVA`, `DIMENSION_YA_ACTIVA`, `VALOR_YA_INACTIVO`, `VALOR_YA_ACTIVO`). Quien llama sabe que la acción no cambió nada y por qué. **No:** responder 200 sin registrar nada, como hacen hoy las vacunas y sus dosis (SPEC 15). Ahí la respuesta no distingue una desactivación real de una que no hizo nada, y la pantalla no puede avisarlo. La diferencia es de vacunas, no de este spec: si se quiere unificar, va en un spec de corrección del SPEC 15 (como el SPEC 11), que cambie su contrato, sus pruebas y la pantalla.
- **Sí:** los mensajes "Indique al menos un valor." y "Indique al menos un dato de la dimensión." siguen la forma de los de vacunas ("Indique al menos una dosis.", "Indique al menos un dato de la vacuna."). Se agregaron al implementar el paso 1.
- **Sí:** la dimensión debe conservar al menos un valor activo, porque el validador exige `minItems: 1` y una dimensión sin valores no sirve. Decidido al escribir el spec.
- **Sí:** `gruposPoblacionDisponibles` va dentro de `GET /dimensiones/{codigo}`. **No:** un `GET /clasificaciones-poblacion` aparte (la misma decisión del SPEC 17).
- **Sí:** las ediciones no tocan el subdocumento `auditoria`; el historial está en la bitácora. **No:** agregar campos `actualizado_*`, que cambiarían el modelo.
- **Sí:** las pruebas insertan directamente en MongoDB su propia dimensión `RANGO_EDAD` y su esquema `BORRADOR`, y los borran. Así no tocan `grupo_edad` ni los esquemas de la semilla.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| MySQL se confirma después de escribir en MongoDB; si la confirmación falla, MongoDB queda cambiado sin su fila de bitácora | Es la regla acordada (nota del 2026-10-20) y la ventana es mínima. El caso inverso (MongoDB falla) sí se deshace y tiene prueba. |
| El driver manda un número como `double` y el validador `int` rechaza el documento | Se usa `Int32` explícito en `orden`, edades y `creado_por`, y una prueba revisa los tipos guardados. |
| Agregar un grupo de edad nuevo exige que exista antes en `clasificacion_poblacion`, que solo cambia por SQL | Se acepta. La población también lo necesita, y el Dialog lo explica cuando no hay grupos disponibles. |
| Varias dimensiones con códigos largos superan los 255 caracteres de `clave_combinacion` | Los códigos llegan a 30. El esquema (HU-16) debe revisar el largo de la combinación. Queda en su nota. |
| Las pruebas escriben en la base MongoDB compartida | Prefijos `zvt_`/`ZVT_HU15`, borrado al inicio y al final; la nota de `CLAUDE.md` avisa que no se usen a mano. |
| Una desactivación y la publicación de un esquema que usa el mismo valor ocurren a la vez | La revisión de uso no bloquea el esquema. HU-16 valida que los valores estén activos al publicar, lo que cierra el caso en el otro sentido. |
| Dos altas simultáneas de valores distintos en la misma dimensión quedan con el mismo `orden` (riesgo bajo) | La condición `$ne` solo impide duplicar el código. El empate no rompe nada: los valores se muestran juntos y se corrige con «Subir» o «Bajar». Evitarlo exigiría bloquear el documento. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Crear, editar o validar esquemas de captura (HU-16).
- Dimensiones `RANGO_EDAD` nuevas.
- Gestionar `clasificacion_poblacion`.
- Cambiar códigos, tipos o rangos de edad.
- Borrar dimensiones o valores.
- Dimensiones por DDRISS.
- `DIMENSION_CONSULTAR` para otros roles.
- Paginación de `GET /dimensiones`.
- Cambios al modelo de datos, al validador o a las semillas.

Cada uno, si se hace, va en su propio spec.
