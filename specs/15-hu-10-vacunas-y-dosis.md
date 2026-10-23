# SPEC 15 — Gestión de vacunas y dosis

> **Estado:** Aprobado
> **Historia:** HU-10
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 11, SPEC 12, SPEC 13, SPEC 14
> **Fecha:** 2026-10-23
> **Objetivo:** Que el Administrador y el Revisor consulten, registren, editen, desactiven y reactiven en `/configuracion` las vacunas del catálogo nacional y sus dosis, con el tipo de cada dosis, la dosis que completa el esquema calculada por el sistema y la marca de trazadora.

## Por qué existe este spec

Las tablas `vacuna` y `dosis` ya existen en el script 01, con 21 vacunas y 60 dosis de semilla (Registro Único de Vacunación, ejemplos por validar con la DDRISS). `backend/openapi.yaml` tiene un borrador de `GET /vacunas` y `POST /vacunas` sin código, sin `x-permiso` y sin errores. Hoy las vacunas solo se cargan por SQL.

**Diferencias con la historia** (mandan `AGENTS.md` y el modelo):

- «Cada dosis tiene un orden y un tipo»: `dosis` no tiene columna `tipo` y el modelo no cambia. El tipo sale del código, que lo genera el backend: `UNICA` (dosis única), `D{n}` (dosis) o `R{n}` (refuerzo). Así ya están las 60 dosis de la semilla.
- «Puedo marcar qué dosis completa el esquema (la última dosis sin contar refuerzos)»: `completa_esquema` no se marca a mano, lo **calcula el backend**. Completa el esquema la dosis activa que no es refuerzo con el mayor `orden`. Si la vacuna no tiene dosis activas que no sean refuerzo (DPT solo tiene refuerzos), la completa el refuerzo activo con el mayor `orden`. La regla reproduce las marcas de las 21 vacunas de la semilla.
- «Una vacuna desactivada ya no aparece en reportes nuevos, pero sí en los históricos»: los reportes dependen de `POST /reportes` (HU-19) y del formulario (HU-20), que todavía no existen. El criterio pasa a HU-19 y HU-20. Este spec garantiza que la vacuna quede inactiva sin borrar nada, y que no aparezca en `GET /vacunas?activa=true`.
- La historia pide `GET/POST /vacunas`. Además, para editar, desactivar y reactivar se agregan las rutas de los SPEC 13 y 14, y rutas propias para las dosis.
- La historia es para el Administrador. Por decisión del equipo, el **Revisor** (estadígrafa) tiene los mismos permisos.

**Catálogo nacional.** `vacuna` no tiene `ddriss_id` y los esquemas de MongoDB se unen por `vacuna.codigo`. El equipo decidió que el catálogo siga siendo nacional: no se filtra por DDRISS. Una cuenta con permiso de cualquier DDRISS lo cambia para todas. Ligar las vacunas a una DDRISS (en MySQL y en las colecciones de MongoDB) queda para otro spec.

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de la pestaña «Establecimientos» (tabla, filtros en la URL, subrutas de formulario).

## Alcance

**Entra:**

- `GET /vacunas` (con `activa`), `GET /vacunas/{id}`, `POST /vacunas`, `PATCH /vacunas/{id}`, `POST /vacunas/{id}/desactivar` y `POST /vacunas/{id}/reactivar`.
- `POST /vacunas/{id}/dosis`, `PATCH /vacunas/{id}/dosis/{dosisId}`, `POST /vacunas/{id}/dosis/{dosisId}/desactivar` y `/reactivar`.
- Código de la dosis y su `orden` generados por el backend a partir del tipo.
- `completa_esquema` calculado por el backend en cada escritura que cambia las dosis activas.
- Reglas de formato `validarCodigoVacuna`, `validarNombreVacuna`, `validarDescripcionVacuna` y `validarNombreDosis` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `VACUNA_CONSULTAR`, `VACUNA_CREAR` y `VACUNA_EDITAR` para el Administrador y el Revisor, y `CONFIGURACION_CONSULTAR` para el Revisor, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`).
- Pestaña «Vacunas» en `/configuracion`, con la tabla, los filtros y las acciones de desactivar y reactivar.
- Subrutas `/configuracion/vacunas/nueva` y `/configuracion/vacunas/:id/editar`.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-10, notas en HU-16, HU-19 y HU-20, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Ligar las vacunas a una DDRISS (`vacuna.ddriss_id`) y los cambios que eso implica en `esquemas_captura`, `reglas_validacion` y `configuracion_indicadores`.
- Crear o mostrar el esquema de captura de una vacuna, o indicar si tiene uno vigente (HU-16, HU-17).
- Impedir que una vacuna o una dosis inactiva aparezca en reportes nuevos (HU-19, HU-20).
- Cambiar el código de una vacuna, o el código, el tipo o el orden de una dosis.
- Reordenar las dosis después de crear la vacuna.
- Borrar vacunas o dosis.
- Dar `VACUNA_CONSULTAR` a otros roles (lo hará el spec que lo necesite).
- Paginar `GET /vacunas`.
- Cambios al modelo de datos y a las semillas de `backend/db/01` y `03`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa las tablas del script 01 tal como están:

- `vacuna (id, codigo UNIQUE VARCHAR(20), nombre VARCHAR(120), descripcion VARCHAR(255) NULL, orden_informe SMALLINT UNSIGNED, activa, creado_en)`.
- `dosis (id, vacuna_id, codigo VARCHAR(20), nombre VARCHAR(60), orden TINYINT UNSIGNED, completa_esquema, es_trazadora, activa)`, con `UNIQUE (vacuna_id, codigo)`.

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `VACUNA_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar el catálogo de vacunas y dosis | ADMINISTRADOR, REVISOR |
| `VACUNA_CREAR` | `CONFIGURACION_CATALOGOS` | Registrar vacunas con sus dosis | ADMINISTRADOR, REVISOR |
| `VACUNA_EDITAR` | `CONFIGURACION_CATALOGOS` | Editar, desactivar y reactivar vacunas, y agregar, editar, desactivar y reactivar sus dosis | ADMINISTRADOR, REVISOR |

`CONFIGURACION_CONSULTAR` ya existe; se asigna también al REVISOR para que vea la opción «Configuración» del menú. El Revisor no tiene los permisos de las pestañas «Territorio» y «Establecimientos», así que solo ve «Vacunas».

### Tipo y código de la dosis

| Tipo (`tipo`) | Código | Nombre sugerido en el formulario |
|---|---|---|
| `UNICA` | `UNICA` | "Dosis única" |
| `DOSIS` | `D{n}` | "Primera dosis", "Segunda dosis"… |
| `REFUERZO` | `R{n}` | "Primer refuerzo", "Segundo refuerzo"… |

- `n` es el mayor número del mismo tipo en la vacuna más uno, contando las activas y las inactivas. Un código no se reutiliza.
- `orden` es el mayor `orden` de la vacuna más uno, contando las activas y las inactivas.
- La API devuelve `tipo`, que deduce del código: `UNICA`, `^D\d+$` → `DOSIS`, `^R\d+$` → `REFUERZO`. Las 60 dosis de la semilla siguen este formato; una prueba lo comprueba.
- Una vacuna tiene como máximo una dosis `UNICA`, que no se combina con dosis `DOSIS` (activas o inactivas). Sí se combina con refuerzos.
- Al crear una vacuna, los refuerzos van después de las dosis `UNICA` o `DOSIS` de la lista. Una dosis agregada después va siempre al final.

### Dosis que completa el esquema

El backend recalcula `completa_esquema` de **todas** las dosis de la vacuna en la misma transacción de cada escritura que crea una dosis o cambia cuáles están activas:

1. Si hay dosis activas `UNICA` o `DOSIS`, la completa la de mayor `orden`.
2. Si no hay, la completa el refuerzo activo de mayor `orden`.
3. Las demás dosis, activas o inactivas, quedan en `FALSE`.

Como una vacuna conserva al menos una dosis activa, siempre hay exactamente una que completa el esquema. `completaEsquema` en un cuerpo responde 400.

### Vacuna (esquema `Vacuna`)

```json
{
  "id": 2,
  "codigo": "HEXA",
  "nombre": "Hexavalente",
  "descripcion": null,
  "ordenInforme": 4,
  "activa": true,
  "dosis": [
    { "id": 2, "codigo": "D1", "tipo": "DOSIS", "nombre": "Primera dosis", "orden": 1, "completaEsquema": false, "esTrazadora": false, "activa": true },
    { "id": 4, "codigo": "D3", "tipo": "DOSIS", "nombre": "Tercera dosis", "orden": 3, "completaEsquema": true, "esTrazadora": true, "activa": true },
    { "id": 5, "codigo": "R1", "tipo": "REFUERZO", "nombre": "Primer refuerzo", "orden": 4, "completaEsquema": false, "esTrazadora": false, "activa": true }
  ]
}
```

- `dosis` va ordenado por `orden` e incluye las inactivas.
- Las dosis de una vacuna inactiva conservan su `activa`: al reactivar la vacuna, vuelve con las mismas dosis activas e inactivas.

### `GET /vacunas` (`VACUNA_CONSULTAR`)

- Parámetro opcional `activa` (`true` o `false`); sin él, devuelve activas e inactivas. Con `activa=true`, cada vacuna trae todas sus dosis, con su `activa`.
- Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA` con `revisarParametros` y `leerBooleano` (mensajes del SPEC 12, y "activa debe ser true o false.").
- Sin filtro por DDRISS: el catálogo es nacional.
- Orden: `orden_informe` y después nombre.
- **Respuesta 200:** arreglo de `Vacuna`, sin paginar.

### `GET /vacunas/{id}` (`VACUNA_CONSULTAR`)

- **Respuesta 200:** la `Vacuna`. Inexistente: 404 `NO_ENCONTRADO`.
- No choca con `GET /vacunas/{codigo}/esquema-vigente` del contrato, que tiene un segmento más.

### `POST /vacunas` (`VACUNA_CREAR`)

**Cuerpo:**

```json
{
  "codigo": "MPOX",
  "nombre": "Viruela símica (Mpox)",
  "descripcion": "",
  "ordenInforme": 23,
  "dosis": [
    { "tipo": "DOSIS", "nombre": "Primera dosis", "esTrazadora": false },
    { "tipo": "DOSIS", "nombre": "Segunda dosis", "esTrazadora": true }
  ]
}
```

- Obligatorios: `codigo`, `nombre` y `dosis` (al menos una).
- `codigo` pasa por `validarCodigoVacuna`; `nombre` por `validarNombreVacuna`; `descripcion` (opcional, vacía guarda `NULL`) por `validarDescripcionVacuna`; el `nombre` de cada dosis por `validarNombreDosis`.
- `ordenInforme` es opcional, un entero de 0 a 65535; sin él, vale el mayor `orden_informe` más uno. Puede repetirse.
- `esTrazadora` es opcional y vale `false` por defecto. Puede haber varias trazadoras.
- `tipo` debe ser `UNICA`, `DOSIS` o `REFUERZO` (400).
- `activa`, `id` y cualquier otro campo de la vacuna responden 400 ("Campo no permitido: {nombre}."). En una dosis, `codigo`, `orden`, `completaEsquema`, `activa` y cualquier otro campo también.
- Una secuencia que no cumple las reglas del tipo responde 422 `SECUENCIA_INVALIDA`.
- Un código repetido responde 409 `VACUNA_DUPLICADA`. Un nombre repetido también, sin distinguir mayúsculas ni tildes (`utf8mb4_0900_ai_ci`).
- Dos dosis con el mismo nombre en la lista responden 409 `DOSIS_DUPLICADA`.
- La vacuna, sus dosis y el cálculo de `completa_esquema` van en una sola transacción.

**Respuesta 201:** la `Vacuna` creada. Bitácora: `CONFIGURACION` / `CREAR`, entidad `vacuna`, con el objeto completo (incluidas las dosis) en `valoresNuevos`. Una sola fila.

### `PATCH /vacunas/{id}` (`VACUNA_EDITAR`)

**Cuerpo:** uno o más de `nombre`, `descripcion` y `ordenInforme`.

- `codigo` responde 400 ("codigo no se puede cambiar."). `dosis`, `activa` y cualquier otro campo, 400 ("Campo no permitido: {nombre}."). Un cuerpo vacío, 400.
- Solo se validan los campos que cambian. Mismas reglas de duplicado que al crear, sin contar la propia vacuna.
- Funciona también con una vacuna inactiva.
- Si nada cambia (`diferencias` da `null`), responde 200 sin escribir ni registrar en la bitácora.
- **Respuesta 200:** la `Vacuna`. Bitácora: `CONFIGURACION` / `ACTUALIZAR`, entidad `vacuna`, con `diferencias(antes, despues)`.

### `POST /vacunas/{id}/desactivar` y `/reactivar` (`VACUNA_EDITAR`)

Sin cuerpo. La fila se lee con `FOR UPDATE`.

- Solo cambia `vacuna.activa`; las dosis quedan como están.
- Desactivar una inactiva, o reactivar una activa, responde 200 sin escribir en la bitácora.
- **Respuesta 200:** la `Vacuna`. Bitácora: `CONFIGURACION` / `DESACTIVAR` o `REACTIVAR`, entidad `vacuna`, con `diferencias`.

### `POST /vacunas/{id}/dosis` (`VACUNA_EDITAR`)

**Cuerpo:** `{ "tipo": "REFUERZO", "nombre": "Primer refuerzo", "esTrazadora": false }`, con las mismas reglas que una dosis de `POST /vacunas`.

- La primera consulta de la transacción es `SELECT id FROM vacuna WHERE id = ? FOR UPDATE` (nota del 2026-10-23). Después se calculan el código y el `orden` y se recalcula `completa_esquema`.
- Una `UNICA` en una vacuna que ya tiene una `UNICA` o dosis `DOSIS`, o una `DOSIS` en una que tiene `UNICA`, responde 422 `SECUENCIA_INVALIDA`.
- Un nombre repetido en la vacuna responde 409 `DOSIS_DUPLICADA`.
- Funciona también con una vacuna inactiva.
- **Respuesta 201:** la `Vacuna` completa. Bitácora: `CONFIGURACION` / `CREAR`, entidad `dosis`, con la dosis en `valoresNuevos`, más una fila `ACTUALIZAR` por cada otra dosis cuyo `completa_esquema` cambió.

### `PATCH /vacunas/{id}/dosis/{dosisId}` (`VACUNA_EDITAR`)

**Cuerpo:** uno o los dos de `nombre` y `esTrazadora`.

- `codigo`, `tipo`, `orden` y `completaEsquema` responden 400 ("{campo} no se puede cambiar."). `activa` y cualquier otro campo, 400 ("Campo no permitido: {nombre}."). Un cuerpo vacío, 400.
- Una dosis que no es de esa vacuna responde 404.
- Si nada cambia, responde 200 sin escribir.
- **Respuesta 200:** la `Vacuna` completa. Bitácora: `CONFIGURACION` / `ACTUALIZAR`, entidad `dosis`, con `diferencias`.

### `POST /vacunas/{id}/dosis/{dosisId}/desactivar` y `/reactivar` (`VACUNA_EDITAR`)

Sin cuerpo. La primera consulta es el `FOR UPDATE` sobre la vacuna.

- Desactivar la última dosis activa de la vacuna responde 409 `VACUNA_SIN_DOSIS_ACTIVAS` y no cambia nada. La regla vale también con la vacuna inactiva.
- Después de cambiar `activa`, se recalcula `completa_esquema`.
- Desactivar una inactiva, o reactivar una activa, responde 200 sin escribir.
- **Respuesta 200:** la `Vacuna` completa. Bitácora: `DESACTIVAR` o `REACTIVAR`, entidad `dosis`, más una fila `ACTUALIZAR` por cada otra dosis cuyo `completa_esquema` cambió.

### Errores de las vacunas

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Campo inválido, no permitido o que no se puede cambiar; tipo inválido; parámetro inválido; cuerpo vacío; vacuna sin dosis | El de la regla o los de arriba |
| 404 | `NO_ENCONTRADO` | La vacuna no existe, o la dosis no existe o es de otra vacuna | "La vacuna no existe." / "La dosis no existe." |
| 409 | `VACUNA_DUPLICADA` | Código o nombre repetido | "Ya hay una vacuna con ese código." / "Ya hay una vacuna con ese nombre." |
| 409 | `DOSIS_DUPLICADA` | Nombre de dosis repetido en la vacuna | "La vacuna ya tiene una dosis con ese nombre." |
| 409 | `VACUNA_SIN_DOSIS_ACTIVAS` | Desactivar la última dosis activa | "La vacuna debe conservar al menos una dosis activa; desactive la vacuna si ya no se aplica." |
| 422 | `SECUENCIA_INVALIDA` | Dos `UNICA`; `UNICA` con `DOSIS`; al crear, un refuerzo antes de una dosis | "Una vacuna con dosis única no lleva otras dosis, solo refuerzos." / "Los refuerzos van después de las dosis." |

Los 401 y 403 no cambian.

### Reglas de formato

En `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS`. Todas quitan los espacios de los extremos, reducen los dobles y devuelven `{ valor }` limpio o `{ error }`.

| Regla | Obligatoria | Largo (`LARGOS`) | Caracteres |
|---|---|---|---|
| `validarCodigoVacuna` | Sí | 2 a 20 (`codigoVacuna`) | Empieza con letra; letras A-Z sin tildes, dígitos y `_`. Se convierte a mayúsculas. |
| `validarNombreVacuna` | Sí | 3 a 120 (`nombreVacuna`) | Letras (con tildes, `ñ` y `ü`), dígitos, espacios y `. , - ( ) / + '` |
| `validarDescripcionVacuna` | No: vacío da `{ valor: null }` | Hasta 255 (`descripcionVacuna`) | Los de `validarNombreVacuna` más `; :` |
| `validarNombreDosis` | Sí | 3 a 60 (`nombreDosis`) | Letras, dígitos, espacios y `. , - ( ) /` |

Los códigos y nombres de las 21 vacunas y las 60 dosis de la semilla pasan sus reglas; una prueba lo comprueba.

### Frontend

**`src/api/catalogos.js`.** `listarVacunas({ activa } = {})`, `obtenerVacuna(id)`, `crearVacuna(datos)`, `editarVacuna(id, cambios)`, `desactivarVacuna(id)`, `reactivarVacuna(id)`, `agregarDosis(vacunaId, datos)`, `editarDosis(vacunaId, dosisId, cambios)`, `desactivarDosis(vacunaId, dosisId)` y `reactivarDosis(vacunaId, dosisId)`.

**Menú.** En `opcionesMenu.js`, la opción «Configuración» recibe dos `subrutas` más:

| Título | Ruta | Permiso |
|---|---|---|
| Registrar vacuna | `/configuracion/vacunas/nueva` | `VACUNA_CREAR` |
| Editar vacuna | `/configuracion/vacunas/:id/editar` | `VACUNA_EDITAR` |

**Pestaña «Vacunas» (`PestanaVacunas.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `vacunas`, después de «Establecimientos», con el permiso `VACUNA_CONSULTAR`. Pide `listarVacunas()`.

- Card "Vacunas y dosis" con el botón "Registrar vacuna" (solo con `VACUNA_CREAR`).
- Texto debajo del título: "Catálogo nacional: los cambios aplican a todas las DDRISS.".
- Filtros, aplicados en el cliente y guardados en la URL junto a `pestana` (`q`, `estado`): Input "Buscar por código o nombre" y Select "Todos los estados", "Activas" o "Inactivas".
- Tabla:

  | Orden | Código | Nombre | Dosis | Estado | Acciones |
  |---|---|---|---|---|---|

  - Dosis: un Badge por dosis activa con su código, en orden. La que completa el esquema lleva un ícono y el título "Completa el esquema". Las trazadoras van con la variante `secondary`. Las inactivas no se muestran.
  - Estado: Badge "Activa" o "Inactiva".
  - Acciones (solo con `VACUNA_EDITAR`), en un DropdownMenu con `modal={false}`: "Editar", y "Desactivar" o "Reactivar".
- Desactivar y reactivar: AlertDialog "¿Desactivar la vacuna {código} · {nombre}? No se ofrecerá en reportes nuevos; los reportes anteriores la conservan." o "¿Reactivar la vacuna {código} · {nombre}?". Al confirmar, la fila se reemplaza con la respuesta.
- Al volver de un formulario con un aviso en el `state` de la navegación: "Vacuna {código} registrada. Falta crear su esquema de captura para que aparezca en el formulario." o "Vacuna {código} actualizada.".
- Carga: Skeleton. Error: Alert "No se pudieron cargar las vacunas: {mensaje}" y "Reintentar". Sin vacunas: "No hay vacunas registradas." Sin resultados: "No hay vacunas que coincidan con los filtros."

**Registrar (`PaginaRegistrarVacuna.jsx` con `FormularioVacuna.jsx`).**

- Campos de la vacuna: Input "Código", Input "Nombre", Textarea "Descripción" e Input numérico "Orden en el informe" (vacío = al final).
- Sección "Dosis" con una fila por dosis: Select "Tipo" (Única, Dosis, Refuerzo), Input "Nombre", Checkbox "Trazadora", y los botones subir, bajar y quitar. El botón "Agregar dosis" agrega una fila al final.
- Cada fila muestra el código que tendrá (`UNICA`, `D1`, `R1`…), calculado en el cliente con la misma regla. Al elegir el tipo, el nombre se llena con el sugerido si estaba vacío o tenía el sugerido anterior.
- La fila que completará el esquema muestra el Badge "Completa el esquema", calculado en el cliente con la regla de este spec.
- Texto: "La dosis que completa el esquema la calcula el sistema: la última que no es refuerzo, o el último refuerzo si la vacuna solo tiene refuerzos.".
- Los errores de secuencia se muestran antes de enviar. Los campos se validan con `campos.js`. Los errores de la API (400, 409, 422) se muestran en un Alert arriba y el formulario conserva lo escrito.
- Al guardar, vuelve a `/configuracion?pestana=vacunas` con el aviso; "Cancelar" vuelve sin guardar, con los filtros que tenía (`state.volverA`, como Establecimientos).

**Editar (`PaginaEditarVacuna.jsx`).** Pide `obtenerVacuna(id)`.

- Card "Datos de la vacuna": el código como texto; Nombre, Descripción y Orden en el informe editables; botón "Guardar cambios", que envía solo lo que cambió.
- Card "Dosis": tabla con Orden, Código, Nombre, Marcas ("Completa el esquema", "Trazadora") y Estado, más acciones por fila: "Editar" (Dialog con Nombre y Trazadora), y "Desactivar" o "Reactivar" (AlertDialog). "Desactivar" se deshabilita en la única dosis activa, con el texto "Es la única dosis activa".
- Botón "Agregar dosis": Dialog con Tipo, Nombre y Trazadora, que muestra el código que tendrá. Los tipos que la secuencia no admite no se ofrecen.
- Cada acción de una dosis se guarda al confirmarla y la tabla se reemplaza con la `Vacuna` de la respuesta, así que la marca "Completa el esquema" se actualiza sola.
- "Volver" regresa a la pestaña con los filtros.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /vacunas y sus dosis, esquemas Vacuna, VacunaNueva, VacunaCambios, DosisNueva, DosisCambios
├── db/05_permisos_mysql.sql                   ← 3 permisos y su asignación; CONFIGURACION_CONSULTAR al Revisor
├── src/validaciones/campos.js                 ← las cuatro reglas
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← rutas de vacunas y dosis
│   ├── catalogos.controller.js                ← controladores nuevos
│   └── vacunas.service.js                     ← nuevo: listar, obtener, crear, editar, desactivar, reactivar, dosis
└── tests/
    ├── campos.test.js                         ← casos de las cuatro reglas y de la semilla
    └── vacunas.test.js                        ← nuevo
frontend/src/
├── validaciones/campos.js, campos.test.js     ← las cuatro reglas y sus casos
├── api/catalogos.js                           ← funciones de vacunas y dosis
├── componentes/layout/opcionesMenu.js         ← subrutas de Configuración
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Vacunas»
    ├── secuenciaDosis.js                      ← nuevo: código, orden y dosis que completa, para la vista previa
    ├── secuenciaDosis.test.js                 ← nuevo
    ├── PestanaVacunas.jsx                     ← nuevo
    ├── PestanaVacunas.test.jsx                ← nuevo
    ├── FormularioVacuna.jsx                   ← nuevo
    ├── FormularioVacuna.test.jsx              ← nuevo
    ├── PaginaRegistrarVacuna.jsx              ← nuevo
    ├── PaginaEditarVacuna.jsx                 ← nuevo
    └── PaginaEditarVacuna.test.jsx            ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-10; notas en HU-16, HU-19 y HU-20
CLAUDE.md                                      ← nota del tipo de dosis, completa_esquema y catálogo nacional
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, reemplazar el borrador de `/vacunas` por las diez operaciones de este spec, con los esquemas `Vacuna`, `Dosis`, `VacunaNueva`, `VacunaCambios`, `DosisNueva` y `DosisCambios`, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra todo.
2. **Permisos.** Agregar los tres permisos y sus asignaciones en `05_permisos_mysql.sql`, en un bloque "SPEC 15 (HU-10)", junto con `CONFIGURACION_CONSULTAR` para el REVISOR. **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen los tres códigos, y el del Revisor también `CONFIGURACION_CONSULTAR`.
3. **Reglas de formato.** Las cuatro reglas y sus `LARGOS` en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`: válido, espacios dobles, vacío, demasiado corto, demasiado largo, carácter no permitido, con tildes; en el código, minúsculas que pasan a mayúsculas y uno que empieza con dígito. En `backend/tests/campos.test.js`, un caso que lee `vacuna` y `dosis` de la base y comprueba que todos los códigos y nombres pasan. Comprobación: las dos pruebas de `campos` pasan.
4. **Backend: consultas.** `vacunas.service.js` con `listarVacunas` y `obtenerVacuna`, sus rutas y controladores. En `tests/vacunas.test.js`:
   - `GET /vacunas` trae las 21 de la semilla ordenadas por `ordenInforme`, cada una con sus dosis ordenadas por `orden` y su `tipo`;
   - todas las dosis de la semilla tienen un `tipo` válido, y cada vacuna tiene exactamente una dosis con `completaEsquema` que coincide con la regla de este spec;
   - `activa=true` filtra; `activa=abc`, un parámetro desconocido y uno repetido responden 400;
   - `GET /vacunas/{id}` devuelve HEXA con D3 como la que completa el esquema; un id inexistente responde 404;
   - una cuenta de Epidemiología de la semilla, con un token firmado con sus datos reales, recibe 403.

   Comprobación: `npm test` del backend pasa completo.
5. **Backend: registrar.** `crearVacuna` (validación, secuencia, códigos, `orden`, `completa_esquema`, duplicados y bitácora en `enTransaccion`). Las pruebas usan vacunas con código `ZVT_…` y nombre `vitest-hu10-…`, y las borran (primero las dosis) al inicio y en `afterAll`:
   - crear con `DOSIS`, `DOSIS`, `REFUERZO` devuelve 201 con `D1`, `D2`, `R1`, `orden` 1 a 3 y `D2` como la que completa el esquema;
   - crear solo con refuerzos marca el último refuerzo;
   - `UNICA` con `DOSIS`, dos `UNICA` o un refuerzo antes de una dosis responden 422 `SECUENCIA_INVALIDA`;
   - el código en minúsculas se guarda en mayúsculas; un código o un nombre repetido (con otras mayúsculas o sin tildes) responden 409 `VACUNA_DUPLICADA`;
   - dos dosis con el mismo nombre responden 409 `DOSIS_DUPLICADA`;
   - `dosis` vacío, `activa`, o `completaEsquema` en una dosis responden 400;
   - sin `ordenInforme`, queda el mayor más uno;
   - la bitácora tiene una sola fila `CONFIGURACION` / `CREAR`, entidad `vacuna`, con las dosis.

   Comprobación: `npm test` del backend pasa y no deja vacunas del prefijo.
6. **Backend: editar, desactivar y reactivar la vacuna.** `editarVacuna`, `desactivarVacuna` y `reactivarVacuna`, con sus rutas. Pruebas:
   - editar el nombre y el orden deja una fila `ACTUALIZAR`; con los mismos valores no deja fila;
   - `codigo`, `activa` o `dosis` en el cuerpo responden 400; un cuerpo vacío también;
   - desactivar deja una fila `DESACTIVAR`, la vacuna sale de `?activa=true` y sus dosis conservan su `activa`; reactivarla deja una fila `REACTIVAR` y vuelve igual;
   - desactivar una inactiva no deja fila;
   - `DELETE /vacunas/{id}` responde 404, porque la ruta no existe.

   Comprobación: `npm test` del backend pasa completo.
7. **Backend: dosis.** `agregarDosis`, `editarDosis`, `desactivarDosis` y `reactivarDosis`, con sus rutas. Pruebas:
   - agregar una `DOSIS` a una vacuna con `D1`, `D2`, `R1` devuelve `D3` con `orden` 4, que pasa a completar el esquema; quedan una fila `CREAR` de la dosis y una `ACTUALIZAR` de `D2`;
   - agregar una `UNICA` a una vacuna con dosis `DOSIS` responde 422;
   - dos `POST` de dosis en paralelo a la misma vacuna reciben códigos y órdenes distintos;
   - un código no se reutiliza: después de desactivar `D3`, la siguiente `DOSIS` es `D4`;
   - desactivar la que completa el esquema pasa la marca a la anterior; reactivarla la devuelve;
   - desactivar la única dosis activa responde 409 `VACUNA_SIN_DOSIS_ACTIVAS` y no cambia nada;
   - editar el nombre y `esTrazadora` deja una fila `ACTUALIZAR`; `codigo`, `tipo`, `orden` o `completaEsquema` responden 400;
   - un `dosisId` de otra vacuna responde 404;
   - con Epidemiología, `POST /vacunas`, `PATCH /vacunas/{id}` y `POST /vacunas/{id}/dosis` responden 403.

   Comprobación: `npm test` del backend pasa completo.
8. **Frontend: pestaña de solo lectura.** Las funciones de `src/api/catalogos.js`. `PestanaVacunas.jsx` con la tabla, los filtros en la URL y los estados de carga, error y vacío, sin acciones; la pestaña en `PESTANAS`. En `PestanaVacunas.test.jsx`:
   - la tabla muestra los Badge de las dosis activas en orden, con la marca de la que completa el esquema, y no muestra las inactivas;
   - la búsqueda y el filtro de estado reducen la tabla sin pedir de nuevo y quedan en la URL;
   - si falla la petición, se ve el Alert y "Reintentar" vuelve a pedir;
   - sin `VACUNA_CONSULTAR` no aparece la pestaña; con los permisos del Revisor solo aparece «Vacunas»;
   - las pruebas de `PestanaTerritorio.test.jsx` y `PestanaEstablecimientos.test.jsx` siguen pasando.

   Comprobación: `npm test` del frontend pasa.
9. **Frontend: registrar.** `secuenciaDosis.js` (código, orden, dosis que completa y errores de secuencia) con `secuenciaDosis.test.js`, que usa los mismos casos que las pruebas del backend. `FormularioVacuna.jsx`, `PaginaRegistrarVacuna.jsx`, la subruta y el botón. En `FormularioVacuna.test.jsx`:
   - agregar filas muestra los códigos `D1`, `D2`, `R1` y el Badge "Completa el esquema" en `D2`; subir `R1` antes de `D2` muestra el error de secuencia y no llama a la API;
   - elegir el tipo llena el nombre sugerido sin pisar uno escrito a mano;
   - un código con `-` o un nombre de 2 caracteres muestran el error de la regla y no llaman a la API;
   - registrar envía `tipo`, `nombre` y `esTrazadora` de cada dosis, sin `codigo` ni `orden`, y vuelve a la pestaña con el aviso del esquema de captura;
   - un 409 se muestra en el Alert y el formulario conserva lo escrito;
   - sin `VACUNA_CREAR` no aparece el botón.

   Comprobación: `npm test` del frontend pasa.
10. **Frontend: editar.** `PaginaEditarVacuna.jsx`, su subruta, el DropdownMenu de la pestaña, los Dialog y AlertDialog de las dosis. En `PaginaEditarVacuna.test.jsx` y `PestanaVacunas.test.jsx`:
    - "Guardar cambios" envía solo los campos que cambiaron;
    - agregar una dosis llama a `agregarDosis` y la tabla muestra la marca "Completa el esquema" que trae la respuesta;
    - en una vacuna con `UNICA`, el Dialog no ofrece el tipo "Dosis";
    - "Desactivar" está deshabilitado en la única dosis activa; un 409 se muestra en un Alert y la tabla no cambia;
    - desactivar la vacuna desde la pestaña muestra "Inactiva" y la acción "Reactivar";
    - sin `VACUNA_EDITAR` no hay columna de acciones.

    Comprobación: `npm test` del frontend pasa completo.
11. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright (la persona inicia sesión a mano):
    - **Como Administrador:** abrir la pestaña «Vacunas» y ver las 21 de la semilla; registrar una vacuna de prueba con dos dosis y un refuerzo y ver sus códigos y la marca; agregarle una dosis y ver que la marca se mueve; desactivar esa dosis y ver que la marca vuelve; editar el nombre; desactivar y reactivar la vacuna.
    - **Como Revisor:** ver que Configuración solo muestra «Vacunas» y que puede editar.
    - **Al terminar:** revisar por SQL las filas de la bitácora y desactivar la vacuna de prueba.

    Documentación:
    - en HU-10, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
    - en HU-16, agregar la nota: "Una vacuna registrada en HU-10 no tiene esquema de captura: el editor debe ofrecer las vacunas activas sin esquema vigente y solo sus dosis activas.";
    - en HU-19 y HU-20, agregar el criterio: "Una vacuna inactiva, o una dosis inactiva, no aparece en reportes nuevos; los reportes anteriores la conservan (viene de HU-10).";
    - en "Notas de contexto" de `CLAUDE.md`, una nota: el tipo de la dosis sale de su código (`UNICA`, `D{n}`, `R{n}`), `completa_esquema` lo recalcula el backend en cada cambio de dosis, y el catálogo de vacunas es nacional, sin filtro por DDRISS.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta las diez operaciones de vacunas y dosis con su `x-permiso`, el borrador anterior de `/vacunas` ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan vacunas ni dosis de prueba en la base.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] El Administrador y el Revisor pueden registrar una vacuna nueva con sus dosis desde la pantalla, sin cambiar el código del sistema.
- [ ] Cada dosis tiene un `orden` y un `tipo` (`UNICA`, `DOSIS` o `REFUERZO`), y su código (`UNICA`, `D{n}`, `R{n}`) y su `orden` los genera el backend.
- [ ] En cada vacuna, exactamente una dosis completa el esquema: la última activa que no es refuerzo o, si solo tiene refuerzos, el último refuerzo activo, y la marca se recalcula al agregar, desactivar o reactivar una dosis.
- [ ] Las marcas `completaEsquema` de las 21 vacunas de la semilla coinciden con la regla.
- [ ] Se pueden marcar varias dosis como trazadoras, y la marca se puede cambiar.
- [ ] Una secuencia inválida (`UNICA` con `DOSIS`, dos `UNICA`, un refuerzo antes de una dosis al crear) responde 422.
- [ ] Un código o un nombre de vacuna repetido, o un nombre de dosis repetido en la vacuna, responden 409.
- [ ] El código de la vacuna y el código, el tipo y el orden de una dosis no se pueden cambiar (400).
- [ ] Desactivar una vacuna no cambia sus dosis, la quita de `GET /vacunas?activa=true` y no borra nada; al reactivarla vuelve igual.
- [ ] No se puede desactivar la última dosis activa de una vacuna (409).
- [ ] Cada escritura deja su fila en la bitácora con el módulo `CONFIGURACION`, incluidas las filas `ACTUALIZAR` de las dosis cuya marca de completa cambió, y una operación que no cambia nada no deja fila.
- [ ] Sin `VACUNA_CONSULTAR`, `VACUNA_CREAR` o `VACUNA_EDITAR`, sus endpoints responden 403 y la pantalla oculta la pestaña, los botones o las acciones.
- [ ] El Revisor ve «Configuración» en el menú con solo la pestaña «Vacunas».
- [ ] La pestaña filtra por texto y estado, y los filtros siguen puestos al volver de un formulario.
- [ ] Al registrar una vacuna, la pantalla avisa que falta crear su esquema de captura.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-10 tiene su avance y sus criterios marcados; HU-16, HU-19 y HU-20 tienen sus notas o criterios que vienen de HU-10; y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** el tipo de la dosis sale del código (`UNICA`, `D{n}`, `R{n}`), que genera el backend. No cambia el modelo y la semilla ya sigue el formato. **No:** una columna `tipo`, que duplica lo que dice el código y toca `backend/db/`; **no:** código libre sin validar.
- **Sí:** número y `orden` automáticos: el siguiente del tipo y el siguiente de la vacuna, contando las inactivas. Un código no se reutiliza, así que un reporte histórico nunca apunta a una dosis con otro significado. **No:** que el usuario fije el orden.
- **Sí:** al crear, el orden de la lista del formulario es el `orden`, con los refuerzos después de las dosis. Después, una dosis nueva va al final y no se reordena. La deserción y los reportes históricos dependen del orden. **No:** reordenar después de crear.
- **Sí:** `completa_esquema` lo calcula el backend: la última dosis activa que no es refuerzo o, si no hay, el último refuerzo activo. El equipo descartó la regla de que un refuerzo nunca completa, por el caso de DPT. La regla reproduce la semilla, así que no hay que tocar `backend/db/`. **No:** marca manual; **no:** que una vacuna solo de refuerzos quede sin dosis que complete.
- **Sí:** el recálculo deja una fila `ACTUALIZAR` por cada dosis cuya marca cambió, porque toda escritura va en la bitácora (regla 7).
- **Sí:** `UNICA` no se combina con dosis `DOSIS`, pero sí con refuerzos. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** el código de la vacuna lo escribe el usuario (mayúsculas, dígitos y `_`) y no cambia. Es la llave legible que usan los esquemas de MongoDB. **No:** un código generado.
- **Sí:** catálogo nacional, sin filtro por DDRISS. Así está el modelo y el equipo lo confirmó. **No:** agregar `vacuna.ddriss_id` en este spec. Se planteó, y el equipo lo dejó para después porque arrastra cambios en las colecciones de MongoDB.
- **Sí:** el Administrador y el Revisor tienen `VACUNA_CONSULTAR`, `VACUNA_CREAR` y `VACUNA_EDITAR`, y el Revisor recibe `CONFIGURACION_CONSULTAR`. Lo pidió el equipo; la historia solo nombra al Administrador.
- **Sí:** `VACUNA_CONSULTAR` solo para esos dos roles por ahora. El spec de cada pantalla que lo necesite se lo asigna a su rol. **No:** dárselo ya a los cinco roles.
- **Sí:** desactivar una vacuna solo cambia `vacuna.activa`. Al reactivarla vuelve exactamente igual, sin un dato extra en el modelo. **No:** desactivar las dosis en cascada, porque al reactivar no se sabría cuáles estaban inactivas.
- **Sí:** una vacuna conserva siempre al menos una dosis activa (409), aunque esté inactiva. Así siempre hay una dosis que completa el esquema y reactivar la vacuna nunca falla.
- **Sí:** el criterio «una vacuna desactivada ya no aparece en reportes nuevos» pasa a HU-19 y HU-20, donde nacen los reportes y el formulario. Los históricos la conservan porque nada se borra y las llaves foráneas siguen.
- **Sí:** este spec no lee MongoDB. La pantalla solo avisa que falta el esquema, y HU-16 recibe la nota. **No:** una columna «Esquema» con `tieneEsquemaVigente`, que une los dos motores en este spec.
- **Sí:** rutas anidadas para las dosis (`/vacunas/{id}/dosis/{dosisId}`) que devuelven la `Vacuna` completa, para que la pantalla vea la marca recalculada sin pedir de nuevo.
- **Sí:** en la edición, cada acción de una dosis se guarda por separado y en su propia transacción. **No:** un solo "Guardar" con la vacuna y todas sus dosis, que serían varias llamadas sin atomicidad entre ellas.
- **Sí:** nombre de vacuna único sin distinguir mayúsculas ni tildes, y nombre de dosis único dentro de la vacuna. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** `ordenInforme` opcional, por defecto al final, y repetible; en un empate se ordena por nombre. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** la vista previa del código y de la marca se calcula en el cliente (`secuenciaDosis.js`) con los mismos casos que el backend. El backend sigue siendo el que decide.
- **Sí:** el borrador de `/vacunas` en `openapi.yaml` se reemplaza; no tiene código que lo use.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un Administrador o Revisor de otra DDRISS cambia el catálogo de todas | Hoy solo opera San Marcos. La pantalla lo avisa, cada cambio queda en la bitácora, y `ddriss_id` queda anotado para otro spec. |
| Dos altas de dosis a la vez generan el mismo código u orden | `FOR UPDATE` sobre la vacuna como primera consulta de la transacción (nota del 2026-10-23); hay una prueba con dos `POST` en paralelo. `UNIQUE (vacuna_id, codigo)` es la última barrera. |
| Recalcular `completa_esquema` cambia los indicadores de periodos ya cerrados | Hoy no hay motor de indicadores. Se anota para el spec del motor: los resultados guardados (`resultado_indicador`) no se recalculan solos. |
| La vista previa del cliente no coincide con lo que guarda el backend | `secuenciaDosis.test.js` usa los mismos casos que `vacunas.test.js`, y la pantalla siempre muestra la `Vacuna` de la respuesta. |
| Una vacuna nueva no aparece en el formulario y el usuario cree que falló | El aviso al registrar dice que falta el esquema de captura; HU-16 tiene la nota. |
| Las pruebas dejan vacunas o dosis en la base compartida | Códigos `ZVT_…` y nombres `vitest-hu10-…`, borrados (primero las dosis) al inicio y en `afterAll`. Las pruebas no crean reportes, y la bitácora no tiene llave foránea a `vacuna`. |
| El Revisor ve pestañas que no le corresponden | Cada pestaña exige sus propios permisos; una prueba comprueba que con los permisos del Revisor solo aparece «Vacunas». |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Las reglas de formato quedan distintas en el backend y en el frontend | La misma tabla `CASOS` en las dos pruebas de `campos`. |

## Lo que **no** entra en este spec

- `vacuna.ddriss_id` y los cambios en las colecciones de MongoDB.
- Crear o mostrar esquemas de captura (HU-16, HU-17).
- Ocultar las vacunas y dosis inactivas en los reportes nuevos (HU-19, HU-20).
- Cambiar códigos, tipos u órdenes, o reordenar dosis.
- Borrar vacunas o dosis.
- `VACUNA_CONSULTAR` para otros roles.
- Paginar `GET /vacunas`.
- Cambios al modelo de datos o a las semillas.

Cada uno, si se hace, va en su propio spec.
