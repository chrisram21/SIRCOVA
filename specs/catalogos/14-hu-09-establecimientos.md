# SPEC 14 — Gestión de establecimientos de salud e instituciones

> **Estado:** Implementado
> **Historia:** HU-09
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 07, SPEC 11, SPEC 12, SPEC 13
> **Fecha:** 2026-10-23
> **Objetivo:** Que el Administrador consulte, registre, edite, desactive y reactive en `/configuracion` los establecimientos de su DDRISS, con el código generado por el sistema y las marcas `reporta_5c`, `solo_cobertura` y `es_externo`.

## Por qué existe este spec

Las tablas `establecimiento` y `tipo_establecimiento` ya existen en el script 01. La semilla de prueba carga 40 establecimientos: los 30 centros de salud (`CS-1201`…`CS-1230`), el Hospital de San Marcos (`HOSP-SM`, `reporta_5c` y `solo_cobertura`), el de Malacatán, seis puestos de salud, un CAP y el Hospital de Coatepeque (`EXT-COATE`, externo, sin distrito). El SPEC 07 dejó `GET /establecimientos` en versión mínima, de solo lectura. El SPEC 13 creó `/configuracion` con Tabs. Hoy los establecimientos solo se cargan por SQL.

**Diferencias con la historia** (mandan `AGENTS.md` y el modelo):

- «Un establecimiento desactivado no puede crear reportes nuevos» depende de `POST /reportes`, que es de HU-19 y todavía no existe. El criterio pasa a HU-19. Este spec garantiza que el establecimiento quede inactivo y que no aparezca en los formularios que piden `activo=true`.
- «Registrar, editar y desactivar»: editar es **solo** cambiar el nombre, la dirección, el contacto y las marcas. El código no se renombra (regla 6). El tipo, el municipio y el distrito no cambian: para eso se desactiva el establecimiento y se registra otro.
- La historia pide `PATCH /establecimientos/{id}` también para desactivar. Desactivar y reactivar van en `POST /establecimientos/{id}/desactivar` y `/reactivar`, como los distritos y los usuarios.
- `es_externo` no es una casilla: lo deduce el backend del municipio.

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de Usuarios (tabla, filtros en la URL, subrutas de formulario) y de la pestaña «Territorio».

## Alcance

**Entra:**

- `GET /establecimientos` ampliado: más campos, filtro `tipoEstablecimientoId` y rechazo de parámetros desconocidos o repetidos.
- `GET /establecimientos/{id}`, `POST /establecimientos`, `PATCH /establecimientos/{id}`, `POST /establecimientos/{id}/desactivar` y `POST /establecimientos/{id}/reactivar`.
- `GET /tipos-establecimiento`, de solo lectura.
- `GET /municipios?alcance=todos`.
- Código generado por el sistema: `{TIPO}-{INE}-{NN}`.
- Reglas de formato `validarNombreEstablecimiento`, `validarDireccion` y `validarNombreContacto` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `ESTABLECIMIENTO_CREAR`, `ESTABLECIMIENTO_EDITAR` y `TIPO_ESTABLECIMIENTO_CONSULTAR` en `05_permisos_mysql.sql`, solo para el Administrador.
- Bitácora de cada escritura (módulo `CONFIGURACION`).
- Pestaña «Establecimientos» en `/configuracion`, con la tabla, los filtros y las acciones de desactivar y reactivar.
- Subrutas `/configuracion/establecimientos/nuevo` y `/configuracion/establecimientos/:id/editar`.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-09, el criterio nuevo en HU-19 y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Bloquear la creación de reportes de un establecimiento inactivo (HU-19).
- Cambiar el tipo, el municipio, el distrito o el código de un establecimiento.
- Mover establecimientos entre distritos.
- Crear, editar o desactivar tipos de establecimiento.
- Limitar cuántos establecimientos envían el 5C por municipio.
- Desactivar en cascada las cuentas del personal de un establecimiento.
- Paginar `GET /establecimientos` o filtrarlo por texto en el servidor.
- Renombrar los códigos de la semilla de prueba (`CS-1201`, `HOSP-SM`, `EXT-COATE`…).
- Ligar el contacto a un `empleado` (pendiente del modelo, `CONTEXTO BD.md`).
- Cambios al modelo de datos.

## Modelo de datos

Este spec **no cambia el modelo**. Usa las tablas del script 01 tal como están:

- `tipo_establecimiento (id, codigo UNIQUE, nombre)`. Semilla: HOSP, CAP, CS, PS, CAIMI, CC, CM, UM, INST.
- `establecimiento (id, codigo UNIQUE VARCHAR(20), nombre VARCHAR(150), tipo_establecimiento_id, ddriss_id, distrito_salud_id NULL, municipio_id, reporta_produccion, reporta_5c, solo_cobertura, es_externo, direccion VARCHAR(255), telefono VARCHAR(20), correo VARCHAR(150), nombre_contacto VARCHAR(150), activo, creado_en, actualizado_en)`.

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Rol |
|---|---|---|---|
| `ESTABLECIMIENTO_CREAR` | `CONFIGURACION_CATALOGOS` | Registrar establecimientos en su DDRISS | ADMINISTRADOR |
| `ESTABLECIMIENTO_EDITAR` | `CONFIGURACION_CATALOGOS` | Editar, desactivar y reactivar establecimientos de su DDRISS | ADMINISTRADOR |
| `TIPO_ESTABLECIMIENTO_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar los tipos de establecimiento | ADMINISTRADOR |

`ESTABLECIMIENTO_CONSULTAR`, `MUNICIPIO_CONSULTAR`, `DISTRITO_CONSULTAR` y `CONFIGURACION_CONSULTAR` ya existen y no cambian.

### Establecimiento (esquema `Establecimiento`)

```json
{
  "id": 41,
  "codigo": "PS-1209-02",
  "nombre": "Puesto de Salud Aldea Tochab, Tajumulco",
  "tipoEstablecimientoId": 4,
  "tipoEstablecimientoCodigo": "PS",
  "tipoEstablecimientoNombre": "Puesto de Salud",
  "ddrissId": 1,
  "distritoSaludId": 9,
  "distritoSaludCodigo": "DS-1209",
  "distritoSaludNombre": "Distrito de Salud Tajumulco",
  "municipioId": 9,
  "municipioCodigoIne": "1209",
  "municipioNombre": "Tajumulco",
  "reportaProduccion": false,
  "reporta5c": false,
  "soloCobertura": false,
  "esExterno": false,
  "direccion": "Aldea Tochab, Tajumulco",
  "telefono": "5550-3010",
  "correo": null,
  "nombreContacto": "Ana Lucía Pérez",
  "cuentasActivas": 0,
  "activo": true
}
```

- Los campos que ya devolvía `GET /establecimientos` no cambian de nombre ni de tipo; el formulario de HU-04 y el filtro de HU-07 siguen igual.
- `cuentasActivas` es el número de filas de `usuario` con `activo = TRUE` cuyo `empleado` está activo y tiene `establecimiento_id` igual al establecimiento. La pantalla lo usa para avisar antes de desactivar.
- Un externo lleva `distritoSaludId`, `distritoSaludCodigo` y `distritoSaludNombre` en `null`.
- `direccion`, `telefono`, `correo` y `nombreContacto` van en `null` cuando no tienen valor.

### `GET /establecimientos` (`ESTABLECIMIENTO_CONSULTAR`)

- Ámbito: como hoy, `filtroAlcance` sobre `e.id` y `e.ddriss_id`.
- Parámetros opcionales: `municipioId`, `activo` (como hoy, con los mismos mensajes) y el nuevo `tipoEstablecimientoId` (entero positivo, "El parámetro tipoEstablecimientoId no es válido.").
- Un parámetro desconocido o repetido responde 400 `ENTRADA_INVALIDA` con `revisarParametros` (mensajes del SPEC 12).
- Orden: nombre, como hoy.
- **Respuesta 200:** arreglo de `Establecimiento`, sin paginar.

### `GET /establecimientos/{id}` (`ESTABLECIMIENTO_CONSULTAR`)

- **Respuesta 200:** el `Establecimiento`.
- Fuera del ámbito (`verificarAlcance`) o inexistente: 404 `NO_ENCONTRADO`.

### `GET /tipos-establecimiento` (`TIPO_ESTABLECIMIENTO_CONSULTAR`)

- Sin parámetros; cualquiera responde 400 `ENTRADA_INVALIDA`.
- **Respuesta 200:** arreglo de `{ id, codigo, nombre }`, ordenado por nombre.

### `GET /municipios?alcance=todos` (`MUNICIPIO_CONSULTAR`)

- `alcance` acepta un tercer valor, `todos`: todos los municipios de la tabla, de cualquier departamento, incluido el `9999`.
- Respeta `incluirInactivos` como los otros dos valores.
- Orden: nombre del departamento y después nombre del municipio, con el `9999` al final.
- El mensaje del 400 pasa a "alcance debe ser departamento, procedencia o todos.".
- `departamento` y `procedencia` no cambian.

### `POST /establecimientos` (`ESTABLECIMIENTO_CREAR`)

**Cuerpo:**

```json
{
  "tipoEstablecimientoId": 4,
  "municipioId": 9,
  "distritoSaludId": 9,
  "nombre": "Puesto de Salud Aldea Tochab, Tajumulco",
  "direccion": "Aldea Tochab, Tajumulco",
  "telefono": "5550 3010",
  "correo": "",
  "nombreContacto": "Ana Lucía Pérez",
  "reportaProduccion": false,
  "reporta5c": false,
  "soloCobertura": false
}
```

- Obligatorios: `tipoEstablecimientoId`, `municipioId` y `nombre`. `distritoSaludId` es obligatorio si el establecimiento no es externo.
- `reportaProduccion` vale `true` por defecto; `reporta5c` y `soloCobertura`, `false`. Si vienen, deben ser booleanos.
- `codigo`, `ddrissId`, `esExterno`, `activo` y cualquier otro campo responden 400 ("Campo no permitido: {nombre}.").
- `ddriss_id` sale del token, nunca del cuerpo.
- `nombre` pasa por `validarNombreEstablecimiento`; `direccion` por `validarDireccion`; `nombreContacto` por `validarNombreContacto`; `telefono` por `validarTelefono`.
- `correo` es opcional: vacío guarda `NULL`; con texto pasa por `validarCorreo`.
- El tipo debe existir (422 `TIPO_INVALIDO`).

**Municipio y externo.**

- El municipio debe existir, estar activo y no ser el `9999` (422 `MUNICIPIO_INVALIDO`).
- Si el municipio es del departamento sede de la DDRISS del usuario, `es_externo = FALSE`. El distrito es obligatorio, debe estar activo, ser de la misma DDRISS y del mismo municipio (422 `DISTRITO_INVALIDO`).
- Si el municipio es de otro departamento, `es_externo = TRUE` y `distrito_salud_id = NULL`. Un `distritoSaludId` con valor responde 422 `DISTRITO_INVALIDO` ("Un establecimiento externo no lleva distrito de salud.").

**Marcas.** `reporta5c = true` o `soloCobertura = true` con `reportaProduccion = false` responde 422 `MARCAS_INVALIDAS`. No se limita cuántos envían el 5C por municipio.

**Duplicado.** No puede haber otro establecimiento de la misma DDRISS y el mismo municipio con el mismo nombre, activo o inactivo (409 `ESTABLECIMIENTO_DUPLICADO`). La intercalación `utf8mb4_0900_ai_ci` compara sin mayúsculas ni tildes.

**Código generado:** `{codigo del tipo}-{codigo_ine del municipio}-{NN}`, por ejemplo `PS-1209-02` o `HOSP-0920-01`.

- `NN` es el mayor consecutivo de los códigos con el mismo prefijo `{TIPO}-{INE}` más uno, contando activos e inactivos, con al menos dos dígitos (`02`, `10`, `100`).
- Un código de la semilla sin consecutivo (`CS-1201`) cuenta como `01`: el siguiente centro de salud de San Marcos queda `CS-1201-02`.
- Los códigos de la semilla con consecutivo (`PS-1201-33`) cuentan con su número: el siguiente es `PS-1201-34`.
- Los códigos que no siguen el formato (`HOSP-SM`, `EXT-COATE`) no cuentan.
- Sin códigos con ese prefijo, empieza en `01`.
- El cálculo y el INSERT van en la misma transacción, después de `SELECT id FROM municipio WHERE id = ? FOR UPDATE`, como los distritos.

**Respuesta 201:** el `Establecimiento` creado. Bitácora: `CONFIGURACION` / `CREAR`, entidad `establecimiento`, con el objeto completo en `valoresNuevos`.

### `PATCH /establecimientos/{id}` (`ESTABLECIMIENTO_EDITAR`)

**Cuerpo:** uno o más de `nombre`, `direccion`, `telefono`, `correo`, `nombreContacto`, `reportaProduccion`, `reporta5c` y `soloCobertura`.

- `codigo`, `tipoEstablecimientoId`, `municipioId`, `distritoSaludId`, `ddrissId` y `esExterno` responden 400 ("{campo} no se puede cambiar.").
- `activo` y cualquier otro campo responden 400 ("Campo no permitido: {nombre}."). Un cuerpo vacío responde 400.
- Solo se validan los campos que cambian, como en `PATCH /empleados/{id}`. Así, un teléfono de la semilla con formato viejo no impide cambiar el nombre.
- `direccion`, `telefono`, `correo` y `nombreContacto` vacíos guardan `NULL`.
- Las reglas de marcas se revisan sobre el estado final (lo guardado más los cambios).
- Mismas reglas de nombre y de duplicado que al crear, sin contar el propio establecimiento.
- Funciona también con un establecimiento inactivo.
- Si nada cambia (`diferencias` da `null`), responde 200 sin escribir ni registrar en la bitácora.
- **Respuesta 200:** el `Establecimiento` actualizado. Bitácora: `CONFIGURACION` / `ACTUALIZAR`, con `diferencias(antes, despues)`.

### `POST /establecimientos/{id}/desactivar` y `POST /establecimientos/{id}/reactivar` (`ESTABLECIMIENTO_EDITAR`)

Sin cuerpo. La fila se lee con `FOR UPDATE` dentro de la transacción.

- Desactivar con `cuentasActivas > 0` responde 409 `ESTABLECIMIENTO_CON_CUENTAS` y no cambia nada.
- Reactivar exige que el municipio siga activo (422 `MUNICIPIO_INVALIDO`) y, si no es externo, que el distrito siga activo (422 `DISTRITO_INVALIDO`).
- Desactivar uno inactivo, o reactivar uno activo, responde 200 sin escribir en la bitácora.
- **Respuesta 200:** el `Establecimiento`. Bitácora: `CONFIGURACION` / `DESACTIVAR` o `REACTIVAR`, con `diferencias`.

### Errores de los establecimientos

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Campo inválido, no permitido o que no se puede cambiar; parámetro inválido; cuerpo vacío | El de la regla o los de arriba |
| 404 | `NO_ENCONTRADO` | El establecimiento no existe o es de otra DDRISS | "El establecimiento no existe." |
| 409 | `ESTABLECIMIENTO_DUPLICADO` | Ya hay uno con ese nombre en el municipio | "Ya hay un establecimiento con ese nombre en el municipio." |
| 409 | `ESTABLECIMIENTO_CON_CUENTAS` | Desactivar con cuentas activas | "El establecimiento tiene {n} cuentas activas; muévalas o desactívelas en Usuarios primero." (en singular con una) |
| 422 | `TIPO_INVALIDO` | El tipo no existe | "El tipo de establecimiento no existe." |
| 422 | `MUNICIPIO_INVALIDO` | Municipio inexistente, inactivo o `9999` (al crear o al reactivar) | "El municipio no existe, está inactivo o no admite establecimientos." |
| 422 | `DISTRITO_INVALIDO` | Falta el distrito, está inactivo, es de otro municipio o DDRISS, o un externo trae distrito | "El distrito de salud no existe, está inactivo o no es del municipio." o el del externo |
| 422 | `MARCAS_INVALIDAS` | `reporta5c` o `soloCobertura` sin `reportaProduccion` | "Un establecimiento que envía el 5C o solo cuenta para cobertura debe reportar producción." |

Los 401 y 403 no cambian.

### Reglas de formato

En `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS`. Todas quitan los espacios de los extremos, reducen los dobles y devuelven `{ valor }` limpio o `{ error }`.

| Regla | Obligatoria | Largo (`LARGOS`) | Caracteres |
|---|---|---|---|
| `validarNombreEstablecimiento` | Sí | 3 a 150 (`nombreEstablecimiento`) | Letras (con tildes, `ñ` y `ü`), dígitos, espacios y `. , - ( ) / '` |
| `validarDireccion` | No: vacío da `{ valor: null }` | Hasta 255 (`direccion`) | Letras, dígitos, espacios y `. , - ( ) / # '` |
| `validarNombreContacto` | No: vacío da `{ valor: null }` | Hasta 150 (`nombreContacto`) | Los de un nombre de persona (`NOMBRE`) |

Los 40 nombres de la semilla de prueba pasan `validarNombreEstablecimiento`; una prueba lo comprueba.

### Frontend

**`src/api/catalogos.js`.**

- `listarEstablecimientos({ activo, municipioId, tipoEstablecimientoId } = {})`, con `conConsulta`; con `{ activo }` se comporta como hoy.
- `obtenerEstablecimiento(id)`, `crearEstablecimiento(datos)`, `editarEstablecimiento(id, cambios)`, `desactivarEstablecimiento(id)` y `reactivarEstablecimiento(id)`.
- `listarTiposEstablecimiento()`.
- `listarMunicipios` acepta `alcance: 'todos'`.

**Menú.** En `opcionesMenu.js`, la opción «Configuración» recibe dos `subrutas`:

| Título | Ruta | Permiso |
|---|---|---|
| Registrar establecimiento | `/configuracion/establecimientos/nuevo` | `ESTABLECIMIENTO_CREAR` |
| Editar establecimiento | `/configuracion/establecimientos/:id/editar` | `ESTABLECIMIENTO_EDITAR` |

**Pestaña «Establecimientos» (`PestanaEstablecimientos.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `establecimientos`, después de «Territorio». Se ve con `ESTABLECIMIENTO_CONSULTAR`. Pide `listarEstablecimientos()`.

- Card "Establecimientos e instituciones" con el botón "Registrar establecimiento" (solo con `ESTABLECIMIENTO_CREAR`), que lleva a la subruta.
- Debajo del título: "Envían el 5C: {n} establecimientos activos.", contado en el cliente.
- Filtros, aplicados en el cliente y guardados en la URL junto a `pestana` (`q`, `municipio`, `tipo`, `estado`), para que se conserven al volver de un formulario:
  - Input "Buscar por código o nombre";
  - Select "Todos los municipios" o uno de los que aparecen en la lista;
  - Select "Todos los tipos" o uno de los que aparecen en la lista;
  - Select "Todos los estados", "Activos" o "Inactivos".
- Tabla:

  | Código | Nombre | Tipo | Municipio | Distrito | Marcas | Estado | Acciones |
  |---|---|---|---|---|---|---|---|

  - Distrito: el código; en un externo, "—".
  - Marcas, como Badge: "Envía 5C", "Solo cobertura", "Externo" y, con `reportaProduccion = false`, "Lo consolida otro".
  - Estado: Badge "Activo" o "Inactivo".
  - Acciones (solo con `ESTABLECIMIENTO_EDITAR`), en un DropdownMenu con `modal={false}`: "Editar", y "Desactivar" o "Reactivar".
  - "Desactivar" con `cuentasActivas > 0` queda deshabilitado, con el texto "Tiene cuentas activas".
- Desactivar y reactivar: AlertDialog "¿Desactivar el establecimiento {código} · {nombre}? Su personal no podrá crear reportes nuevos." o "¿Reactivar el establecimiento {código} · {nombre}?". Al confirmar, la fila se reemplaza con la respuesta. Un 409 o un 422 se muestra en un Alert y la fila no cambia.
- Al volver de un formulario con un aviso en el `state` de la navegación, Alert: "Establecimiento {código} registrado." o "Establecimiento {código} actualizado.".
- Carga: Skeleton. Error: Alert "No se pudieron cargar los establecimientos: {mensaje}" y el botón "Reintentar". Sin establecimientos: "No hay establecimientos registrados." Sin resultados con filtros: "No hay establecimientos que coincidan con los filtros."

**Formulario (`FormularioEstablecimiento.jsx`).** Lo usan las dos subrutas.

- Al registrar pide en paralelo `listarTiposEstablecimiento()`, `listarMunicipios({ alcance: 'todos' })`, `listarDdriss()` y `listarDistritos({ activo: true })`.
- Campos: Select "Tipo", Select "Municipio", Select "Distrito de salud", Input "Nombre", Input "Dirección", Input "Teléfono", Input "Correo", Input "Persona de contacto", y los Checkbox "Reporta producción", "Envía el 5C a la DDRISS" y "Su producción solo cuenta para la cobertura".
- El Select "Municipio" no ofrece el `9999` y agrupa los municipios en "Departamento sede" y "Otros departamentos (externo)", según el `departamentoId` de la DDRISS.
- Con un municipio de otro departamento, el Select "Distrito de salud" se oculta y aparece el texto "Establecimiento externo: no lleva distrito de salud.".
- Con un municipio de la sede, el Select "Distrito de salud" ofrece solo los distritos activos de ese municipio. Al cambiar de municipio se borra el distrito elegido.
- Al desmarcar "Reporta producción", las otras dos casillas se desmarcan y se deshabilitan.
- Debajo del nombre, "El código se genera al guardar.".
- Al editar pide `obtenerEstablecimiento(id)`. El código, el tipo, el municipio y el distrito se muestran como texto. Solo se envían los campos que cambiaron.
- Los campos se validan con las reglas de `campos.js` antes de enviar. Los errores de la API (400, 409, 422) se muestran en un Alert arriba del formulario, que conserva lo escrito.
- Mientras carga, los campos están deshabilitados. Si falla una petición, Alert con el mensaje y no se puede guardar.
- Al guardar, vuelve a `/configuracion?pestana=establecimientos` con el aviso en el `state` de la navegación. "Cancelar" vuelve sin guardar.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /establecimientos, /tipos-establecimiento, alcance=todos, Establecimiento
├── db/05_permisos_mysql.sql                   ← 3 permisos y su asignación al Administrador
├── src/validaciones/campos.js                 ← validarNombreEstablecimiento, validarDireccion, validarNombreContacto
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← rutas de establecimientos y tipos
│   ├── catalogos.controller.js                ← controladores nuevos
│   ├── catalogos.service.js                   ← alcance=todos; listarEstablecimientos sale de aquí
│   └── establecimientos.service.js            ← nuevo: listar, obtener, crear, editar, desactivar, reactivar, tipos
└── tests/
    ├── campos.test.js                         ← casos de las tres reglas
    ├── catalogos.test.js                      ← casos nuevos de /establecimientos y /municipios
    └── establecimientos.test.js               ← nuevo
frontend/src/
├── validaciones/campos.js, campos.test.js     ← las tres reglas y sus casos
├── api/catalogos.js                           ← funciones de establecimientos y tipos
├── componentes/layout/opcionesMenu.js         ← subrutas de Configuración
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Establecimientos»
    ├── PestanaEstablecimientos.jsx            ← nuevo
    ├── PestanaEstablecimientos.test.jsx       ← nuevo
    ├── FormularioEstablecimiento.jsx          ← nuevo
    ├── PaginaRegistrarEstablecimiento.jsx     ← nuevo
    ├── PaginaEditarEstablecimiento.jsx        ← nuevo
    └── FormularioEstablecimiento.test.jsx     ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-09; criterio nuevo en HU-19
CLAUDE.md                                      ← nota del código de establecimiento y de es_externo
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: el esquema `Establecimiento`; `EstablecimientoEntrada` se reemplaza por `EstablecimientoNuevo` y `EstablecimientoCambios`; `GET /establecimientos` con `tipoEstablecimientoId`, la respuesta `Establecimiento` y sin "Versión mínima de HU-04; HU-09 la amplía"; `GET /establecimientos/{id}`, `POST`, `PATCH`, `/desactivar` y `/reactivar`; `GET /tipos-establecimiento`; `alcance=todos` en `/municipios`. Cada operación con su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra todo.
2. **Permisos.** Agregar los tres permisos y su asignación al Administrador en `05_permisos_mysql.sql`, en un bloque "SPEC 14 (HU-09)". **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token del Administrador trae los tres códigos.
3. **Reglas de formato.** Las tres reglas y sus `LARGOS` en los dos `campos.js`, con los mismos casos en `backend/tests/campos.test.js` y `frontend/src/validaciones/campos.test.js`: válido, espacios dobles, vacío (obligatorio u opcional), demasiado corto, demasiado largo, carácter no permitido (`@`, `_`, `<`), con tildes, coma y paréntesis. En `backend/tests/campos.test.js`, un caso que lee los nombres de `establecimiento` de la base y comprueba que todos pasan `validarNombreEstablecimiento`. Comprobación: las dos pruebas de `campos` pasan.
4. **Backend: consultas.** Mover `listarEstablecimientos` a `establecimientos.service.js` con los campos nuevos, `tipoEstablecimientoId` y `revisarParametros`; agregar `obtenerEstablecimiento`, `listarTiposEstablecimiento` y `alcance=todos` en `listarMunicipios`. Los casos existentes de `catalogos.test.js` no cambian. Casos nuevos:
   - `GET /establecimientos` trae `reporta5c`, `soloCobertura`, `cuentasActivas` y los datos de contacto; el Hospital de San Marcos sale con `reporta5c` y `soloCobertura`, y Coatepeque con `esExterno` y sin distrito;
   - `tipoEstablecimientoId` filtra; `tipoEstablecimientoId=abc`, un parámetro desconocido y uno repetido responden 400;
   - `GET /establecimientos/{id}` devuelve uno de la DDRISS y responde 404 con uno inexistente o con un token de otra DDRISS;
   - `GET /tipos-establecimiento` devuelve los tipos de la tabla, y con un parámetro responde 400;
   - `GET /municipios?alcance=todos` trae los de San Marcos, Coatepeque y el `9999` al final; `alcance=otro` responde 400 con el mensaje nuevo;
   - sin su permiso, `/tipos-establecimiento` responde 403.

   Comprobación: `npm test` del backend pasa completo.
5. **Backend: registrar.** `crearEstablecimiento` (validación, tipo, municipio, deducción de `es_externo`, distrito, marcas, duplicado, bloqueo `FOR UPDATE`, código generado, bitácora en `enTransaccion`), con su ruta y controlador. En `tests/establecimientos.test.js`, con nombres que empiezan con `vitest-hu09-` y borrado al inicio y en `afterAll`. Las pruebas usan un tipo poco usado (`UM`) y un municipio propio inactivo con código que empieza con `Z`, como `distritos.test.js`:
   - crear en un municipio de la sede devuelve 201 con un código `{TIPO}-{INE}-{NN}` y `esExterno = false`, y un segundo del mismo tipo y municipio recibe el consecutivo siguiente;
   - dos `POST` en paralelo al mismo tipo y municipio reciben códigos distintos;
   - un centro de salud en San Marcos, donde solo existe `CS-1201`, recibe `CS-1201-02` o el consecutivo siguiente al último `CS-1201-NN`;
   - crear en Coatepeque sin distrito devuelve `esExterno = true`; con distrito responde 422 `DISTRITO_INVALIDO`;
   - en un municipio de la sede, sin distrito, con un distrito de otro municipio o con uno inactivo responde 422 `DISTRITO_INVALIDO`;
   - el `9999`, un municipio inexistente y uno inactivo responden 422 `MUNICIPIO_INVALIDO`; un tipo inexistente, 422 `TIPO_INVALIDO`;
   - `reporta5c = true` con `reportaProduccion = false` responde 422 `MARCAS_INVALIDAS`;
   - un nombre repetido en el mismo municipio (con otras mayúsculas o sin tildes) responde 409 `ESTABLECIMIENTO_DUPLICADO`;
   - un cuerpo con `codigo`, `ddrissId` o `esExterno` responde 400;
   - el teléfono se guarda como `5550-3010` y el correo vacío como `NULL`;
   - la bitácora tiene una fila `CONFIGURACION` / `CREAR` con el establecimiento.

   Comprobación: `npm test` del backend pasa y no deja establecimientos del prefijo.
6. **Backend: editar, desactivar y reactivar.** `editarEstablecimiento`, `desactivarEstablecimiento` y `reactivarEstablecimiento`, con sus rutas. Pruebas en `establecimientos.test.js`:
   - editar el nombre y el contacto devuelve 200 y deja una fila `ACTUALIZAR` con los valores anterior y nuevo; con los mismos valores no deja fila;
   - `codigo`, `tipoEstablecimientoId`, `municipioId`, `distritoSaludId` o `activo` en el cuerpo responden 400; un cuerpo vacío también;
   - desmarcar `reportaProduccion` en uno con `reporta5c` responde 422 `MARCAS_INVALIDAS`;
   - en un establecimiento con un teléfono de formato viejo, cambiar solo el nombre responde 200;
   - desactivar uno con una cuenta activa, creada por SQL con `debe_cambiar_contrasena = FALSE` y borrada en `afterAll` sin iniciar sesión con ella, responde 409 `ESTABLECIMIENTO_CON_CUENTAS` y no lo cambia;
   - desactivar uno sin cuentas y reactivarlo dejan las filas `DESACTIVAR` y `REACTIVAR`; desactivar uno inactivo no deja fila;
   - un establecimiento desactivado ya no sale en `GET /establecimientos?activo=true`;
   - reactivar con el distrito inactivo responde 422 `DISTRITO_INVALIDO`;
   - un id de otra DDRISS o inexistente responde 404;
   - sin `ESTABLECIMIENTO_CREAR` o `ESTABLECIMIENTO_EDITAR` responde 403, con una cuenta que las pruebas no borran (nota del 2026-10-21);
   - `DELETE /establecimientos/{id}` responde 404, porque la ruta no existe.

   Comprobación: `npm test` del backend pasa completo.
7. **Frontend: pestaña de solo lectura.** Las funciones de `src/api/catalogos.js`. `PestanaEstablecimientos.jsx` con la tabla, el conteo del 5C, los filtros en la URL y los estados de carga, error y vacío, sin acciones; la pestaña en `PESTANAS`. En `PestanaEstablecimientos.test.jsx`, con `vi.mock` sobre `@/api/catalogos.js`:
   - la tabla muestra los Badge "Envía 5C", "Solo cobertura", "Externo" y "Lo consolida otro" donde corresponden, y "—" en el distrito del externo;
   - el conteo del 5C solo cuenta los activos;
   - la búsqueda y los filtros de municipio, tipo y estado reducen la tabla sin pedir de nuevo y quedan en la URL;
   - si falla la petición, se ve el Alert y "Reintentar" vuelve a pedir;
   - sin `ESTABLECIMIENTO_CONSULTAR` no aparece la pestaña;
   - las pruebas existentes de `PestanaTerritorio.test.jsx` siguen pasando.

   Comprobación: `npm test` del frontend pasa.
8. **Frontend: registrar.** `FormularioEstablecimiento.jsx`, `PaginaRegistrarEstablecimiento.jsx`, la subruta y el botón "Registrar establecimiento". En `FormularioEstablecimiento.test.jsx`:
   - se piden municipios con `{ alcance: 'todos' }` y el Select no ofrece el `9999`;
   - con un municipio de la sede, el Select de distrito solo ofrece los activos de ese municipio; con Coatepeque se oculta y aparece el texto del externo;
   - desmarcar "Reporta producción" desmarca y deshabilita las otras dos casillas;
   - un nombre de 2 caracteres o un correo inválido muestran el error de la regla y no llaman a la API;
   - registrar envía el cuerpo sin `distritoSaludId` en un externo y vuelve a la pestaña con "Establecimiento {código} registrado.";
   - un 409 de la API se muestra en el Alert y el formulario conserva lo escrito;
   - sin `ESTABLECIMIENTO_CREAR` no aparece el botón.

   Comprobación: `npm test` del frontend pasa.
9. **Frontend: editar, desactivar y reactivar.** `PaginaEditarEstablecimiento.jsx`, su subruta, el DropdownMenu de acciones y el AlertDialog. Pruebas:
   - editar muestra el código, el tipo, el municipio y el distrito como texto, envía solo los campos que cambiaron y vuelve con "Establecimiento {código} actualizado.";
   - confirmar "Desactivar" llama a `desactivarEstablecimiento` y la fila muestra "Inactivo" y la acción "Reactivar";
   - con `cuentasActivas > 0`, "Desactivar" está deshabilitado;
   - un 409 o un 422 se muestra en un Alert y la fila no cambia;
   - sin `ESTABLECIMIENTO_EDITAR` no hay columna de acciones.

   Comprobación: `npm test` del frontend pasa completo.
10. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright, como Administrador (la persona inicia sesión a mano): abrir Configuración y la pestaña «Establecimientos»; ver los 40 de la semilla y "Envían el 5C: 31"; filtrar por municipio y tipo; registrar un puesto de salud en Tajumulco y ver su código; registrar uno externo en Coatepeque y ver que no pide distrito; editar su contacto; desactivarlo y reactivarlo; ver que "Desactivar" está deshabilitado en `CS-1201`, que tiene cuentas; comprobar que el desactivado no aparece en el Select de establecimientos de `/usuarios/nuevo`; revisar por SQL las filas de la bitácora; desactivar los establecimientos de prueba al terminar. Marcar los criterios de HU-09 y escribir su "Avance" con las diferencias de este spec. Agregar a HU-19 el criterio "Un establecimiento desactivado no puede crear reportes nuevos (viene de HU-09).". Nota en "Notas de contexto" de `CLAUDE.md`: el código `{TIPO}-{INE}-{NN}` lo genera el backend (los de la semilla sin consecutivo cuentan como `01` y los que no siguen el formato no cuentan), `es_externo` se deduce del departamento del municipio, y de un establecimiento solo cambian el nombre, la dirección, el contacto y las marcas.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta el esquema `Establecimiento`, las seis operaciones de establecimientos, `GET /tipos-establecimiento` y `alcance=todos`, cada una con su `x-permiso`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan establecimientos, cuentas ni municipios de prueba en la base.
- [ ] `frontend/package.json` y `backend/package.json` no cambian.
- [ ] El Administrador puede registrar un establecimiento con tipo, municipio, distrito, nombre, dirección, teléfono, correo y persona de contacto, y el código sale con el formato `{TIPO}-{INE}-{NN}` y el consecutivo siguiente.
- [ ] Un establecimiento en un municipio de otro departamento queda con `esExterno = true` y sin distrito, y uno de la sede exige un distrito activo de su municipio.
- [ ] El `9999` o un municipio inactivo responden 422 al registrar.
- [ ] El Administrador puede marcar qué establecimientos envían el 5C y cuáles solo cuentan para cobertura, y `reporta5c` o `soloCobertura` sin `reportaProduccion` responden 422.
- [ ] La pestaña muestra "Envían el 5C: 31 establecimientos activos." con la semilla de prueba.
- [ ] El Administrador puede editar el nombre, la dirección, el contacto y las marcas, pero no el código, el tipo, el municipio ni el distrito (400).
- [ ] Un nombre repetido en el mismo municipio responde 409.
- [ ] Un establecimiento con cuentas activas no se puede desactivar (409).
- [ ] Un establecimiento desactivado no aparece en `GET /establecimientos?activo=true` ni en el formulario de `/usuarios/nuevo`, y se puede reactivar si su municipio y su distrito siguen activos.
- [ ] Cada alta, edición, desactivación y reactivación deja una fila en la bitácora con el módulo `CONFIGURACION`, y una operación que no cambia nada no deja fila.
- [ ] Ningún establecimiento de otra DDRISS aparece en `GET /establecimientos` ni se puede consultar o modificar (404).
- [ ] Sin los permisos `ESTABLECIMIENTO_CREAR`, `ESTABLECIMIENTO_EDITAR` o `TIPO_ESTABLECIMIENTO_CONSULTAR`, sus endpoints responden 403 y la pantalla oculta los botones correspondientes.
- [ ] La pestaña filtra el listado por municipio, tipo, estado y texto, y los filtros siguen puestos al volver de un formulario.
- [ ] El formulario valida los campos antes de enviar y muestra los errores de la API sin perder lo escrito.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-09 tiene su avance y sus criterios marcados, HU-19 tiene el criterio que viene de HU-09, y `CLAUDE.md` tiene la nota del código y de `es_externo`.

## Decisiones

- **Sí:** código generado `{TIPO}-{INE}-{NN}`. Lo pidió el equipo, para que todos los códigos sigan el mismo formato, como los distritos. **No:** código escrito por el administrador (el institucional de SIGSA); se propuso y el equipo lo descartó.
- **Sí:** consecutivo por tipo y municipio (prefijo `{TIPO}-{INE}`), contando activos e inactivos. Un código no se reutiliza. **No:** un solo contador por municipio para todos los tipos.
- **Sí:** los códigos de la semilla sin consecutivo (`CS-1201`) cuentan como `01`, los que tienen consecutivo cuentan con su número y los que no siguen el formato (`HOSP-SM`, `EXT-COATE`) no cuentan. Son datos de prueba y renombrarlos tocaría `backend/db/`.
- **Sí:** `SELECT … FOR UPDATE` sobre el municipio para calcular el consecutivo, como los distritos. El índice único de `codigo` es la última barrera.
- **Sí:** de un establecimiento solo cambian el nombre, la dirección, el contacto y las marcas. El tipo va en el código, y el municipio es el municipio de aplicación de los reportes históricos. Para otro tipo, municipio o distrito se desactiva y se registra otro. **No:** cambiar el tipo y el distrito; **no:** cambiar todo menos el código. Se propusieron y el equipo los descartó.
- **Sí:** el mensaje del 409 `DISTRITO_CON_ESTABLECIMIENTOS` del SPEC 13 ("muévalos o desactívelos primero") no se cambia en este spec, aunque mover establecimientos quede fuera. Cambiarlo toca el SPEC 13 y sus pruebas; si hace falta, va en otro spec.
- **Sí:** `es_externo` lo deduce el backend del departamento del municipio. Así no hay una casilla que pueda contradecir al municipio. **No:** una casilla que el backend valida.
- **Sí:** el distrito de un establecimiento de la sede es obligatorio, activo, de la misma DDRISS y del mismo municipio. Un externo no lleva distrito (`distrito_salud_id` es NULL solo para externos, según el modelo).
- **Sí:** el municipio de un establecimiento puede ser de cualquier departamento menos el `9999`. El `9999` es una procedencia, no un lugar donde se vacuna.
- **Sí:** `GET /municipios?alcance=todos` para que el formulario ofrezca municipios de otros departamentos. Sin él, un externo en un municipio nuevo no se podría registrar desde la pantalla. El SPEC 13 descartó `?todos=true` para la pestaña «Territorio»; aquí se usa solo en el formulario. **No:** limitar el formulario a los municipios de `procedencia`.
- **Sí:** al registrar un externo en un municipio nuevo, ese municipio pasa a salir en `GET /municipios?alcance=procedencia`. Es lo que ya hace la regla del SPEC 13 con Coatepeque.
- **Sí:** solo coherencia básica en las marcas: `reporta5c` o `soloCobertura` exigen `reportaProduccion`. No se limita cuántos envían el 5C por municipio; la pestaña muestra el conteo para que el administrador lo revise. **No:** uno por municipio; **no:** marcas independientes.
- **Sí:** desactivar con cuentas activas responde 409, como el distrito con establecimientos. Evita personal activo ligado a un establecimiento inactivo. **No:** permitirlo con un aviso; **no:** desactivar las cuentas en cascada.
- **Sí:** `cuentasActivas` cuenta solo cuentas (`usuario` activo con `empleado` activo), no empleados sin cuenta como los contactos. Lo que el 409 protege es el acceso al sistema.
- **Sí:** desactivar y reactivar como `POST /establecimientos/{id}/desactivar` y `/reactivar`, como los distritos y los usuarios. Cada acción tiene su propia fila en la bitácora. **No:** `activo` en el `PATCH`, como decía la historia.
- **Sí:** reactivar exige el municipio y el distrito activos. Un establecimiento activo no queda ligado a un distrito inactivo.
- **Sí:** el criterio «un establecimiento desactivado no puede crear reportes nuevos» pasa a HU-19, donde se crea `POST /reportes`. Se anota en los dos avances.
- **Sí:** permisos `ESTABLECIMIENTO_CREAR`, `ESTABLECIMIENTO_EDITAR` (que incluye desactivar y reactivar) y `TIPO_ESTABLECIMIENTO_CONSULTAR`, solo para el Administrador. Autorizado al definir el spec. **No:** usar `ESTABLECIMIENTO_CONSULTAR` para los tipos, que rompe la convención de un permiso por función.
- **Sí:** `GET /tipos-establecimiento` de solo lectura. El catálogo de tipos viene del script 01 y la historia no pide gestionarlo.
- **Sí:** `GET /establecimientos` sigue devolviendo un arreglo sin paginar y solo agrega campos. Los formularios de Usuarios (HU-04, HU-05) y el filtro de HU-07 siguen igual. Son unos cientos como mucho, y la pestaña filtra en el cliente. **No:** paginarlo como el SPEC 12.
- **Sí:** `GET /establecimientos` pasa a rechazar parámetros desconocidos o repetidos con `revisarParametros`. El SPEC 13 lo dejó fuera; este spec es el que toca el endpoint. Los clientes actuales solo envían `activo`.
- **Sí:** `listarEstablecimientos` se mueve de `catalogos.service.js` a `establecimientos.service.js`, como `distritos.service.js`.
- **Sí:** `GET /establecimientos/{id}` para el formulario de edición, en lugar de buscar en la lista.
- **Sí:** pestaña «Establecimientos» en `/configuracion` con subrutas de formulario, como Usuarios. El formulario tiene 11 campos y no cabe bien en un Dialog. **No:** un Dialog como el de los distritos.
- **Sí:** la pestaña solo pide `GET /establecimientos` y saca las opciones de los filtros de municipio y tipo de la misma lista. Así se ve solo con `ESTABLECIMIENTO_CONSULTAR`. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** los filtros de la pestaña van en la URL, junto a `pestana`, para que se conserven al volver de un formulario (como Usuarios, SPEC 12). Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** el formulario vuelve a la pestaña con el aviso en el `state` de la navegación. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** nombre único por DDRISS y municipio, sin distinguir mayúsculas ni tildes, como los distritos. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** reglas `validarNombreEstablecimiento`, `validarDireccion` y `validarNombreContacto` en los cuatro archivos de `campos.js` y `CASOS` (nota del 2026-10-22). El teléfono y el correo usan las reglas que ya existen; el correo es opcional en un establecimiento. Los caracteres permitidos se eligieron para que pasen los nombres de la semilla; se pueden revisar al aprobarlo.
- **Sí:** el `PATCH` solo valida los campos que cambian, como `PATCH /empleados/{id}`. Los teléfonos de la semilla (`5550-1001`) cumplen la regla, pero datos cargados después por SQL podrían no cumplirla.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Dos altas a la vez con el mismo tipo y municipio generan el mismo código | `FOR UPDATE` sobre el municipio en la misma transacción; hay una prueba con dos `POST` en paralelo. El índice único de `codigo` es la última barrera. |
| El código supera los 20 caracteres de la columna | El código de tipo más largo es `CAIMI` (5) y el INE tiene 4: `CAIMI-1201-100` tiene 14. |
| Las pruebas dejan establecimientos o cuentas en la base compartida | Nombres con el prefijo `vitest-hu09-` y borrado al inicio y en `afterAll`. La bitácora no tiene llave foránea a `establecimiento`. Las cuentas de prueba no inician sesión ni reciben un 403 (nota del 2026-10-21). |
| Un establecimiento de prueba queda con reportes o empleados y no se puede borrar | Las pruebas no crean reportes, y borran sus empleados antes que el establecimiento. |
| Otro integrante ya creó establecimientos con el mismo prefijo y el consecutivo no es el esperado | Las pruebas comparan contra el código que acaban de recibir (siguiente = anterior + 1), no contra un número fijo. |
| El cambio en `GET /establecimientos` rompe los formularios de Usuarios | La respuesta solo agrega campos y los clientes actuales solo envían `activo`; las pruebas de Usuarios siguen igual. |
| Se asigna una cuenta a un establecimiento mientras otro administrador lo desactiva | `FOR UPDATE` sobre el establecimiento al desactivar. El alta de empleados ya rechaza un establecimiento inactivo (`ESTABLECIMIENTO_INVALIDO`). |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2, y se vuelve a iniciar sesión antes de probar. |
| Las reglas de formato quedan distintas en el backend y en el frontend | La misma tabla `CASOS` en las dos pruebas de `campos`. |

## Lo que **no** entra en este spec

- Bloquear los reportes de un establecimiento inactivo (HU-19).
- Cambiar el tipo, el municipio, el distrito o el código de un establecimiento.
- Mover establecimientos entre distritos.
- Gestionar los tipos de establecimiento.
- Limitar cuántos envían el 5C por municipio.
- Desactivar en cascada las cuentas del personal.
- Paginar `GET /establecimientos`.
- Renombrar los códigos de la semilla de prueba.
- Ligar el contacto a un empleado.
- Cambios al modelo de datos.

Cada uno, si se hace, va en su propio spec.
