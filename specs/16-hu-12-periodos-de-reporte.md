# SPEC 16 — Periodos de reporte

> **Estado:** Aprobado
> **Historia:** HU-12
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 12, SPEC 13
> **Fecha:** 2026-10-23
> **Objetivo:** Que el Administrador y el Revisor creen en `/configuracion` los 12 meses de un año en el calendario común, abran cada mes para su DDRISS con su fecha límite de envío y cambien esa fecha mientras el mes no esté cerrado.

## Por qué existe este spec

Las tablas `periodo` (calendario común: año, mes, fechas) y `cierre_periodo` (estado y fecha límite por DDRISS) ya existen en el script 01. La semilla trae los 12 meses de 2026; para San Marcos, enero a agosto están `CERRADO` y septiembre y octubre `ABIERTO`, con fecha límite el día 10 del mes siguiente. `backend/openapi.yaml` tiene un borrador de `GET /periodos` y `POST /periodos` sin código, sin `x-permiso` y sin errores. Hoy los periodos solo se cargan por SQL.

`cierre_periodo.estado` solo admite `ABIERTO`, `EN_CIERRE` y `CERRADO`: no hay estado «programado». Que exista la fila de un mes para una DDRISS quiere decir que el mes está abierto (o ya pasó por el cierre) en esa DDRISS.

**Diferencias con la historia y con el modelo** (mandan `AGENTS.md` y lo que decidió el equipo):

- «Puedo crear los 12 periodos de un año»: crear el año agrega los meses que falten en `periodo` (el calendario común), **sin abrirlos**. Después, cada mes se abre por separado para la DDRISS, con su fecha límite. Así no se puede reportar diciembre en enero.
- «Un periodo cerrado no admite reportes nuevos»: depende de `POST /reportes` (HU-19), que todavía no existe. El criterio pasa a HU-19. Este spec deja `GET /periodos` con el estado del mes en la DDRISS y el filtro `estado`, para que HU-19 ofrezca solo los meses abiertos.
- El comentario del script 01 dice que al abrir el mes el backend crea «una fila por DDRISS activa». El equipo decidió que **cada DDRISS abre sus meses**: al abrir se crea solo la fila de la DDRISS del usuario, como dice `CONTEXTO BD.md` y la regla 10. El script 01 no se toca; la diferencia queda anotada aquí.
- La historia es para el Administrador. Por decisión del equipo, el **Revisor** (estadígrafa) tiene los mismos permisos.
- Además de `GET /periodos`, hay `POST /periodos` (crear el año), `POST /periodos/{id}/abrir` y `PATCH /periodos/{id}` (fecha límite). El borrador de `POST /periodos` con `{ anio, mes, fechaLimiteEnvio }` se reemplaza.

El paso automático de `ABIERTO` a `EN_CIERRE` al vencer la fecha límite y el cierre final son de HU-31. Este spec solo permite **ampliar el plazo** de un mes en `EN_CIERRE`, lo que lo devuelve a `ABIERTO`.

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de las pestañas «Territorio» y «Vacunas» (tabla, filtros en la URL, diálogos).

## Alcance

**Entra:**

- `GET /periodos` (con `anio` y `estado`), `POST /periodos`, `POST /periodos/{id}/abrir` y `PATCH /periodos/{id}`.
- `fechaInicio` y `fechaFin` de cada mes calculadas por el backend.
- Rango de años permitido: de 2020 al año siguiente al actual.
- Paso de `EN_CIERRE` a `ABIERTO` al ampliar la fecha límite a hoy o después.
- Permisos `PERIODO_CONSULTAR`, `PERIODO_CREAR` y `PERIODO_EDITAR` para el Administrador y el Revisor, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`).
- Pestaña «Periodos» en `/configuracion`, con el selector de año, la tabla de meses y los diálogos para crear el año, abrir un mes y cambiar la fecha límite.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-12, notas en HU-19 y HU-31, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Impedir que se creen reportes en un mes sin abrir, en cierre o cerrado (HU-19).
- `PERIODO_CONSULTAR` para el Personal de establecimiento y los demás roles (HU-19 y los specs que lo necesiten).
- La tarea programada que pasa un mes de `ABIERTO` a `EN_CIERRE` al vencer la fecha límite (HU-31).
- Cerrar un mes (`POST /periodos/{id}/cerrar`, HU-31) y reabrir uno `CERRADO` (solo rectificación, HU-32).
- Abrir un mes para todas las DDRISS, o para una DDRISS distinta de la del usuario.
- Borrar meses del calendario o filas de `cierre_periodo`.
- Alertas de reportes pendientes basadas en la fecha límite (HU-50).
- Paginar `GET /periodos`.
- Cambios al modelo de datos y a las semillas de `backend/db/01` y `03`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa las tablas del script 01 tal como están:

- `periodo (id, anio, mes, fecha_inicio DATE, fecha_fin DATE)`, con `UNIQUE (anio, mes)`.
- `cierre_periodo (id, periodo_id, ddriss_id, fecha_limite_envio DATE, estado ENUM('ABIERTO','EN_CIERRE','CERRADO'), cerrado_por, cerrado_en)`, con `UNIQUE (periodo_id, ddriss_id)`.

Las columnas `DATE` se leen con `DATE_FORMAT(columna, '%Y-%m-%d')`, para no pasar por un `Date` de JavaScript y la zona horaria (nota del 2026-10-21). `cerrado_en` se lee con `UNIX_TIMESTAMP` y se devuelve en ISO, como `aFechaIso`.

**"Hoy" y el año actual** se calculan en el backend con la fecha de Guatemala (`America/Guatemala`), no con la de MySQL, que en Aiven está en UTC.

### Periodo (esquema `Periodo`)

```json
{
  "id": 10,
  "anio": 2026,
  "mes": 10,
  "fechaInicio": "2026-10-01",
  "fechaFin": "2026-10-31",
  "estado": "ABIERTO",
  "fechaLimiteEnvio": "2026-11-10",
  "cerradoEn": null
}
```

- `id` es el de `periodo`. La DDRISS no va en el cuerpo ni en la ruta: es la del token (`empleado.ddriss_id`).
- `estado`, `fechaLimiteEnvio` y `cerradoEn` salen de la fila de `cierre_periodo` de la DDRISS del usuario. Si el mes no está abierto en esa DDRISS, los tres valen `null`.

### `GET /periodos` (`PERIODO_CONSULTAR`)

- Parámetros opcionales: `anio` (entero) y `estado` (`ABIERTO`, `EN_CIERRE` o `CERRADO`). Sin parámetros, devuelve todos los meses del calendario, con su estado en la DDRISS.
- Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA` con `revisarParametros` (mensajes del SPEC 12, y "anio debe ser un número entero." / "estado debe ser ABIERTO, EN_CIERRE o CERRADO.").
- Orden: `anio` y después `mes`.
- **Respuesta 200:** arreglo de `Periodo`, sin paginar (son 12 por año).

### `POST /periodos` (`PERIODO_CREAR`)

Agrega al calendario común los meses que falten de un año. No abre ninguno.

- **Cuerpo:** `{ "anio": 2027 }`. Otro campo, o `anio` que no es entero, responde 400.
- `anio` fuera de 2020 a (año actual + 1) responde 422 `ANIO_FUERA_DE_RANGO`.
- Si ya están los 12 meses, responde 409 `PERIODO_ANIO_EXISTENTE`. Si falta alguno, se crean solo esos, con `fecha_inicio` el día 1 y `fecha_fin` el último día del mes.
- Un `INSERT` que choca con `UNIQUE (anio, mes)` (dos altas a la vez) deshace todo y responde el mismo 409.
- Bitácora: una fila `CREAR` por mes creado, con `entidad = 'periodo'` y el objeto completo.
- **Respuesta 201:** arreglo con los 12 `Periodo` del año.

El calendario es común: un Administrador o Revisor de cualquier DDRISS lo amplía para todas. No cambia el estado de ningún mes en ninguna DDRISS.

### `POST /periodos/{id}/abrir` (`PERIODO_EDITAR`)

Abre el mes para la DDRISS del usuario.

- **Cuerpo:** `{ "fechaLimiteEnvio": "2026-12-10" }`. Otro campo, o una fecha que no es `AAAA-MM-DD` válida, responde 400.
- Cualquier mes del calendario se puede abrir, sin orden obligatorio y aunque todavía no haya empezado.
- `fechaLimiteEnvio` debe ser posterior a `fechaFin` del mes; si no, 422 `FECHA_LIMITE_INVALIDA`.
- Si el mes ya tiene fila en la DDRISS (en cualquier estado), responde 409 `PERIODO_YA_ABIERTO`. El choque con `UNIQUE (periodo_id, ddriss_id)` (dos aperturas a la vez) responde lo mismo.
- Crea la fila de `cierre_periodo` con `estado = 'ABIERTO'`.
- Bitácora: fila `CREAR` con `entidad = 'cierre_periodo'` y el objeto completo.
- **Respuesta 201:** el `Periodo`. Mes inexistente: 404 `NO_ENCONTRADO`.

### `PATCH /periodos/{id}` (`PERIODO_EDITAR`)

Cambia la fecha límite del mes en la DDRISS del usuario.

- **Cuerpo:** `{ "fechaLimiteEnvio": "2026-11-15" }`. Otro campo, cuerpo vacío o fecha inválida responden 400.
- `fechaLimiteEnvio` debe ser posterior a `fechaFin` del mes; si no, 422 `FECHA_LIMITE_INVALIDA`.
- Según el estado del mes en la DDRISS:

  | Estado | Resultado |
  |---|---|
  | Sin fila (no abierto) | 409 `PERIODO_NO_ABIERTO` |
  | `ABIERTO` | Cambia la fecha; sigue `ABIERTO`, aunque la fecha nueva ya haya pasado (el paso a `EN_CIERRE` es de HU-31) |
  | `EN_CIERRE`, fecha nueva hoy o después | Cambia la fecha y vuelve a `ABIERTO`, en la misma transacción |
  | `EN_CIERRE`, fecha nueva antes de hoy | Cambia solo la fecha; sigue `EN_CIERRE` |
  | `CERRADO` | 409 `PERIODO_CERRADO` |

- La fila de `cierre_periodo` se lee con `SELECT … FOR UPDATE` como primera consulta de la transacción.
- Bitácora: fila `ACTUALIZAR` con `entidad = 'cierre_periodo'` y `diferencias(antes, despues)`, que incluye `estado` si cambió. Si la fecha es la misma, no se escribe ni se registra.
- **Respuesta 200:** el `Periodo`. Mes inexistente: 404 `NO_ENCONTRADO`.

### Errores de los periodos

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Campo no permitido, cuerpo vacío, `anio` no entero, fecha inválida, parámetro inválido | "anio debe ser un número entero." / "fechaLimiteEnvio debe ser una fecha AAAA-MM-DD." / los del SPEC 12 |
| 404 | `NO_ENCONTRADO` | El mes no existe en el calendario | "El periodo no existe." |
| 409 | `PERIODO_ANIO_EXISTENTE` | El año ya tiene los 12 meses | "El año {anio} ya tiene sus 12 meses en el calendario." |
| 409 | `PERIODO_YA_ABIERTO` | El mes ya tiene fila en la DDRISS | "El mes ya fue abierto en su DDRISS." |
| 409 | `PERIODO_NO_ABIERTO` | Cambiar la fecha de un mes sin abrir | "El mes no está abierto en su DDRISS." |
| 409 | `PERIODO_CERRADO` | Cambiar la fecha de un mes cerrado | "El mes está cerrado; solo admite rectificaciones." |
| 422 | `ANIO_FUERA_DE_RANGO` | `anio` antes de 2020 o después del año siguiente | "El año debe estar entre 2020 y {actual + 1}." |
| 422 | `FECHA_LIMITE_INVALIDA` | Fecha límite igual o anterior al fin del mes | "La fecha límite debe ser posterior al {fechaFin}." |

Los 401 y 403 no cambian.

### Frontend

**`src/api/catalogos.js`.** `listarPeriodos({ anio, estado } = {})`, `crearAnioPeriodos(anio)`, `abrirPeriodo(id, fechaLimiteEnvio)` y `cambiarFechaLimite(id, fechaLimiteEnvio)`.

**Pestaña «Periodos» (`PestanaPeriodos.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `periodos`, después de «Vacunas», con el permiso `PERIODO_CONSULTAR`. Pide `listarPeriodos()` una vez y filtra el año en el cliente.

- Card "Periodos de reporte" con el texto "El calendario es común; el estado y la fecha límite son de su DDRISS.".
- Select "Año" con los años que tienen meses en el calendario, guardado en la URL junto a `pestana` (`anio`). Sin `anio`, o con uno que no está, se elige el año actual si existe, y si no, el más reciente.
- Botón "Crear año" (solo con `PERIODO_CREAR`): Dialog con un Select de los años de 2020 a (actual + 1) que no tienen sus 12 meses. Si no hay ninguno, el botón se deshabilita con el título "Todos los años del rango ya están en el calendario". Al confirmar, la pestaña muestra el año creado y el aviso "Año {anio} agregado al calendario. Abra cada mes cuando corresponda.".
- Tabla de los meses del año elegido:

  | Mes | Del – al | Fecha límite de envío | Estado | Acciones |
  |---|---|---|---|---|

  - Mes: el nombre en español ("Octubre").
  - Fechas en formato `dd/mm/aaaa`.
  - Estado: Badge "Sin abrir", "Abierto", "En cierre" o "Cerrado".
  - Acciones (solo con `PERIODO_EDITAR`): "Abrir" en un mes sin abrir; "Cambiar fecha límite" en uno abierto o en cierre; nada en uno cerrado.
- **Dialog de la fecha límite (`DialogoFechaLimite.jsx`)**, el mismo para abrir y para cambiar:
  - Título "Abrir {mes} {anio}" o "Cambiar la fecha límite de {mes} {anio}".
  - Input `type="date"` "Fecha límite de envío". Al abrir, viene con el día 10 del mes siguiente; al cambiar, con la fecha actual.
  - Valida en el cliente que la fecha sea posterior al fin del mes, con el mismo mensaje del 422.
  - En un mes en cierre, el texto "Si la nueva fecha es hoy o posterior, el mes vuelve a Abierto y los establecimientos pueden enviar de nuevo.".
  - Al guardar, la fila se reemplaza con el `Periodo` de la respuesta. Un 409 o 422 se muestra en un Alert dentro del Dialog, que conserva la fecha escrita.
- Carga: Skeleton. Error: Alert "No se pudieron cargar los periodos: {mensaje}" y "Reintentar". Calendario vacío: "No hay años en el calendario." con el botón "Crear año".

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /periodos, /periodos/{id}, /periodos/{id}/abrir; esquemas Periodo, PeriodoAnioNuevo, FechaLimite
├── db/05_permisos_mysql.sql                   ← 3 permisos y su asignación al Administrador y al Revisor
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← rutas de periodos
│   ├── catalogos.controller.js                ← controladores nuevos
│   └── periodos.service.js                    ← nuevo: listar, crear año, abrir, cambiar fecha límite
└── tests/
    └── periodos.test.js                       ← nuevo
frontend/src/
├── api/catalogos.js                           ← funciones de periodos
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Periodos»
    ├── PestanaPeriodos.jsx                    ← nuevo
    ├── PestanaPeriodos.test.jsx               ← nuevo
    └── DialogoFechaLimite.jsx                 ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-12; notas en HU-19 y HU-31
CLAUDE.md                                      ← nota de periodos
```

`opcionesMenu.js` no cambia: la pestaña no tiene subrutas.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, reemplazar el borrador de `/periodos` por `GET` y `POST /periodos`, `PATCH /periodos/{id}` y `POST /periodos/{id}/abrir`, con los esquemas `Periodo`, `PeriodoAnioNuevo` y `FechaLimite`, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. `POST /periodos/{id}/cerrar` (HU-31) no se toca. Comprobación: `/api/docs` carga sin errores y muestra todo.
2. **Permisos.** Agregar `PERIODO_CONSULTAR`, `PERIODO_CREAR` y `PERIODO_EDITAR` (módulo `CONFIGURACION_CATALOGOS`) y su asignación al ADMINISTRADOR y al REVISOR en `05_permisos_mysql.sql`, en un bloque "SPEC 16 (HU-12)". **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen los tres códigos.
3. **Backend: consulta.** `periodos.service.js` con `listarPeriodos`, su ruta y su controlador. En `tests/periodos.test.js`:
   - `GET /periodos?anio=2026` trae los 12 meses de la semilla en orden, con enero a agosto `CERRADO`, septiembre y octubre `ABIERTO` con su fecha límite, y noviembre y diciembre con `estado`, `fechaLimiteEnvio` y `cerradoEn` en `null`;
   - las fechas salen como `AAAA-MM-DD` sin correrse un día (`fechaFin` de febrero de 2026 es `2026-02-28`);
   - `estado=ABIERTO` trae solo septiembre y octubre;
   - `anio=abc`, `estado=OTRO`, un parámetro desconocido y uno repetido responden 400;
   - una cuenta de Epidemiología de la semilla, con un token firmado con sus datos reales, recibe 403.

   Comprobación: la prueba pasa.
4. **Backend: crear el año.** `crearAnio`, con su ruta. Las pruebas usan el año **2020** y borran sus filas de `cierre_periodo` y `periodo` al inicio y en `afterAll`:
   - `POST { anio: 2020 }` crea los 12 meses con sus fechas (febrero de 2020 termina el 29), sin filas en `cierre_periodo`, y deja 12 filas `CREAR`;
   - con 3 meses de 2020 borrados por SQL, un nuevo `POST` crea solo esos 3 y deja 3 filas `CREAR`;
   - `POST { anio: 2026 }` responde 409 `PERIODO_ANIO_EXISTENTE`;
   - `2019` y (año actual + 2) responden 422; `"2020"` como texto, `2020.5` y un campo extra responden 400;
   - con Epidemiología, 403.

   Comprobación: la prueba pasa.
5. **Backend: abrir un mes.** `abrirPeriodo`, con su ruta. Pruebas, sobre meses de 2020:
   - abrir marzo de 2020 con `2020-04-10` crea la fila `ABIERTO` de la DDRISS del usuario (solo esa) y deja una fila `CREAR`;
   - abrirlo de nuevo responde 409 `PERIODO_YA_ABIERTO`, y también si la fila está `CERRADO`;
   - dos aperturas en paralelo del mismo mes: una 201 y otra 409;
   - una fecha igual o anterior al fin del mes responde 422; `2020-02-30` responde 400;
   - un id inexistente responde 404.

   Comprobación: la prueba pasa.
6. **Backend: cambiar la fecha límite.** `cambiarFechaLimite`, con su ruta. Pruebas, sobre meses de 2020 (el estado `EN_CIERRE` o `CERRADO` se pone por SQL, con `cerrado_por` de un usuario de la semilla):
   - en `ABIERTO`, cambia la fecha, sigue `ABIERTO` y deja una fila `ACTUALIZAR` con solo `fechaLimiteEnvio`;
   - en `EN_CIERRE` con una fecha de hoy o posterior, pasa a `ABIERTO` y la fila `ACTUALIZAR` trae `fechaLimiteEnvio` y `estado`;
   - en `EN_CIERRE` con una fecha pasada pero posterior al fin del mes, sigue `EN_CIERRE`;
   - la misma fecha responde 200 y no deja fila;
   - un mes sin abrir responde 409 `PERIODO_NO_ABIERTO`; uno `CERRADO`, 409 `PERIODO_CERRADO`;
   - un campo distinto de `fechaLimiteEnvio` o el cuerpo vacío responden 400.

   Comprobación: `npm test` del backend pasa completo.
7. **Frontend: pestaña de solo lectura.** Las funciones de `src/api/catalogos.js`. `PestanaPeriodos.jsx` con el selector de año, la tabla y los estados de carga, error y vacío, sin acciones; la pestaña en `PESTANAS`. En `PestanaPeriodos.test.jsx`:
   - la tabla muestra los 12 meses con su Badge, sus fechas en `dd/mm/aaaa` y "Sin abrir" donde `estado` es `null`;
   - cambiar el año en el Select cambia la tabla sin pedir de nuevo y queda en la URL; sin `anio` se elige el año actual;
   - si falla la petición, se ve el Alert y "Reintentar" vuelve a pedir;
   - sin `PERIODO_CONSULTAR` no aparece la pestaña;
   - las pruebas de las otras pestañas siguen pasando.

   Comprobación: `npm test` del frontend pasa.
8. **Frontend: crear el año.** El botón y el Dialog "Crear año". Pruebas:
   - el Select ofrece solo los años del rango que no tienen sus 12 meses;
   - confirmar llama a `crearAnioPeriodos` con el año, muestra el aviso y deja elegido el año nuevo;
   - con todos los años del rango completos, el botón está deshabilitado;
   - sin `PERIODO_CREAR` no aparece el botón.

   Comprobación: `npm test` del frontend pasa.
9. **Frontend: abrir y cambiar la fecha límite.** `DialogoFechaLimite.jsx` y las acciones de la tabla. Pruebas:
   - "Abrir" en noviembre viene con el día 10 de diciembre, llama a `abrirPeriodo` y la fila muestra "Abierto" con la fecha;
   - una fecha igual al fin del mes muestra el error y no llama a la API;
   - en un mes en cierre, el Dialog muestra el aviso de reapertura, y la fila muestra el estado que trae la respuesta;
   - un 409 de la API se muestra en el Alert del Dialog, que conserva la fecha;
   - un mes cerrado no tiene acciones; sin `PERIODO_EDITAR` no hay columna de acciones.

   Comprobación: `npm test` del frontend pasa completo.
10. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright (la persona inicia sesión a mano):
    - **Como Administrador:** abrir la pestaña «Periodos» y ver 2026 con el estado de la semilla; crear el año 2025 y ver sus 12 meses "Sin abrir"; abrir diciembre de 2025 con la fecha sugerida; cambiar su fecha límite; volver a la pestaña desde otra y ver que el año sigue elegido.
    - **Como Revisor:** ver las pestañas «Vacunas» y «Periodos», y cambiar la fecha límite de octubre de 2026.
    - **Al terminar:** revisar por SQL las filas de la bitácora, devolver la fecha límite de octubre de 2026 a `2026-11-10` desde la pantalla y, **con autorización**, borrar por SQL la fila de `cierre_periodo` de diciembre de 2025. El año 2025 queda en el calendario.

    Documentación:
    - en HU-12, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
    - en HU-19, agregar el criterio: "Solo se crean reportes en un mes `ABIERTO` en la DDRISS del establecimiento; uno sin abrir, en cierre o cerrado no admite reportes nuevos (viene de HU-12)", y la nota de que HU-19 asigna `PERIODO_CONSULTAR` al Personal de establecimiento;
    - en HU-31, agregar la nota: "Ampliar la fecha límite de un mes `EN_CIERRE` a hoy o después lo devuelve a `ABIERTO` (`PATCH /periodos/{id}`, SPEC 16); la tarea programada debe volver a revisarlo con la fecha nueva.";
    - en "Notas de contexto" de `CLAUDE.md`, una nota: crear el año solo llena el calendario común; abrir crea la fila de `cierre_periodo` solo de la DDRISS del usuario; las fechas `DATE` se leen con `DATE_FORMAT` y "hoy" se calcula con la hora de Guatemala; las pruebas usan el año 2020 y lo borran.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta las cuatro operaciones de periodos con su `x-permiso`, el borrador anterior de `/periodos` ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan filas de 2020 en `periodo` ni en `cierre_periodo`.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Desde la pantalla se pueden crear los 12 meses de un año entre 2020 y el año siguiente al actual, con sus fechas de inicio y fin correctas.
- [ ] Crear un año que ya tiene sus 12 meses responde 409, y uno incompleto se completa sin duplicar meses.
- [ ] Crear el año no abre ningún mes en ninguna DDRISS.
- [ ] Se puede abrir cualquier mes del calendario para la DDRISS del usuario, con una fecha límite posterior al fin del mes, y solo se crea la fila de esa DDRISS.
- [ ] Un mes ya abierto, en cierre o cerrado en la DDRISS no se puede volver a abrir (409).
- [ ] Se puede cambiar la fecha límite de un mes abierto o en cierre, y no la de uno sin abrir o cerrado (409).
- [ ] Ampliar la fecha límite de un mes en cierre a hoy o después lo devuelve a abierto; con una fecha pasada sigue en cierre.
- [ ] `GET /periodos` devuelve cada mes con el estado y la fecha límite de la DDRISS del usuario, o `null` si no está abierto, y filtra por `anio` y `estado`.
- [ ] Las fechas de la API salen como `AAAA-MM-DD` y coinciden con las de la base.
- [ ] Cada escritura deja su fila en la bitácora con el módulo `CONFIGURACION`, y un cambio a la misma fecha no deja fila.
- [ ] Sin `PERIODO_CONSULTAR`, `PERIODO_CREAR` o `PERIODO_EDITAR`, sus endpoints responden 403 y la pantalla oculta la pestaña, el botón o las acciones.
- [ ] El Revisor ve «Configuración» con las pestañas «Vacunas» y «Periodos».
- [ ] El año elegido queda en la URL y se conserva al recargar.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-12 tiene su avance y sus criterios marcados (el de los reportes nuevos pasa a HU-19); HU-19 y HU-31 tienen sus notas; y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** crear el año solo llena el calendario común (`periodo`) y cada mes se abre por separado. `cierre_periodo` no tiene un estado «programado», así que crear su fila es abrir el mes. **No:** abrir los 12 meses al crear el año, que dejaría reportar diciembre en enero; **no:** solo abrir mes por mes, sin una acción de año.
- **Sí:** abrir crea solo la fila de la DDRISS del usuario. Respeta el alcance por DDRISS (regla 10) y `CONTEXTO BD.md`. **No:** una fila por cada DDRISS activa, como dice el comentario del script 01; el script no se toca.
- **Sí:** se puede abrir cualquier mes del calendario, sin orden y aunque no haya empezado, para cargar meses atrasados o preparar el siguiente. **No:** solo meses ya iniciados; **no:** obligar a abrir en orden.
- **Sí:** la fecha límite debe ser posterior al fin del mes, sin un tope superior. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** la fecha límite se cambia en `ABIERTO` y en `EN_CIERRE`. **No:** cambiarla en `CERRADO`, que solo admite rectificación (HU-32).
- **Sí:** en `EN_CIERRE`, una fecha de hoy o posterior devuelve el mes a `ABIERTO` en la misma transacción. Así la tarea programada de HU-31 no lo vuelve a cerrar enseguida. **No:** dejarlo en `EN_CIERRE` y hacer de la reapertura otra acción.
- **Sí:** en `ABIERTO`, una fecha ya pasada se acepta y el mes sigue `ABIERTO`; el paso a `EN_CIERRE` es de HU-31.
- **Sí:** años de 2020 al siguiente al actual. Permite cargar años anteriores y evita errores como 2062. **No:** sin límite; **no:** solo del año anterior al siguiente.
- **Sí:** un año incompleto se completa; uno con los 12 meses responde 409. **No:** 409 en cuanto exista un mes, que no repararía un año incompleto.
- **Sí:** endpoints separados: `POST /periodos` (año), `POST /periodos/{id}/abrir` y `PATCH /periodos/{id}`, con `{id}` de `periodo` y la DDRISS del token, como `/desactivar` y `/reactivar` de los SPEC 13 a 15 y `/periodos/{id}/cerrar` del contrato. **No:** el borrador `POST /periodos { anio, mes, fechaLimiteEnvio }`.
- **Sí:** el Administrador y el Revisor tienen los tres permisos. Lo pidió el equipo; la historia solo nombra al Administrador, y el Revisor cierra los meses en HU-31. **No:** dar ya `PERIODO_CONSULTAR` al Personal; se lo asigna HU-19.
- **Sí:** el criterio «un periodo cerrado no admite reportes nuevos» pasa a HU-19, donde nacen los reportes. Este spec deja el estado y el filtro en `GET /periodos`.
- **Sí:** abrir un mes se registra como `CREAR` sobre `cierre_periodo`, y el cambio de fecha como `ACTUALIZAR` con `estado` dentro de las diferencias si cambió. No hace falta una acción nueva en `ACCIONES`. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** las fechas `DATE` se leen con `DATE_FORMAT` y "hoy" se calcula con la hora de Guatemala, por la diferencia de zona con Aiven (nota del 2026-10-21).
- **Sí:** la pestaña pide todos los periodos una vez y filtra el año en el cliente; son 12 por año. **No:** paginar.
- **Sí:** Input `type="date"` en el Dialog. **No:** agregar el componente Calendar de shadcn solo para esta fecha.
- **Sí:** las pruebas usan el año 2020, que el equipo no usa en la base de prueba, y lo borran. Para probar a mano se usa otro año.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las fechas `DATE` salen un día corridas por la zona horaria | `DATE_FORMAT` en las consultas y una prueba con el fin de febrero de 2026. |
| "Hoy" en el servidor o en MySQL no coincide con el de Guatemala, y la reapertura falla de noche | "Hoy" se calcula en Node con `America/Guatemala`; una prueba usa una fecha de hoy. |
| Dos aperturas o dos altas de año a la vez | `UNIQUE (periodo_id, ddriss_id)` y `UNIQUE (anio, mes)`; el choque se responde como 409. Hay una prueba en paralelo. |
| Un Administrador de otra DDRISS amplía el calendario de todas | El calendario es común por diseño y no cambia el estado de ningún mes en otra DDRISS; cada alta queda en la bitácora. |
| Las pruebas borran un 2020 cargado a propósito en la base de prueba | La nota de `CLAUDE.md` avisa que 2020 es de las pruebas; las pruebas no crean reportes en 2020. |
| Reabrir un mes en cierre deja que se envíen reportes después del plazo original | Es la intención de ampliar el plazo. El Dialog lo avisa y la bitácora guarda el cambio de estado. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Impedir reportes en meses sin abrir, en cierre o cerrados (HU-19).
- `PERIODO_CONSULTAR` para el Personal y otros roles.
- El paso automático a `EN_CIERRE` y el cierre final (HU-31).
- Reabrir un mes `CERRADO` (solo rectificación, HU-32).
- Abrir meses para otras DDRISS.
- Borrar meses o filas de `cierre_periodo`.
- Alertas de reportes pendientes (HU-50).
- Paginar `GET /periodos`.
- Cambios al modelo de datos o a las semillas.

Cada uno, si se hace, va en su propio spec.
