# SPEC 22 — Crear el reporte mensual de un establecimiento

> **Estado:** Aprobado
> **Historia:** HU-19
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 14, SPEC 15, SPEC 16, SPEC 19, SPEC 20, SPEC 21
> **Fecha:** 2026-10-25
> **Objetivo:** Que el Personal de establecimiento cree, desde «Registro de producción», el reporte en Borrador de su establecimiento para un mes abierto de su DDRISS, con las vacunas activas y la versión de esquema que aplica a ese mes fijadas al crearlo.

## Por qué existe este spec

HU-19 es la primera historia que escribe en `reporte_produccion`. Varias historias anteriores dejaron criterios para este momento:

- HU-09 (spec 14): un establecimiento desactivado no crea reportes nuevos.
- HU-10 (spec 15): una vacuna inactiva no aparece en reportes nuevos y los anteriores la conservan.
- HU-12 (spec 16): solo se crean reportes en un mes `ABIERTO` de la DDRISS.

También quedan dos pendientes que deben estar listos antes de HU-20:

- Darle `PERIODO_CONSULTAR` al Personal de establecimiento (nota de HU-19, spec 16).
- Devolver la `etiqueta` de cada desagregación en `GET /esquemas-captura/{id}` (nota de HU-19, spec 21).
- Que el Personal reciba los nombres de las dosis y las etiquetas de los valores de las dimensiones (nota de HU-20, spec 18). `armarFormulario` los toma de `GET /vacunas/{id}` y `GET /dimensiones`, que piden `VACUNA_CONSULTAR` y `DIMENSION_CONSULTAR`, y el Personal no los tiene. Este spec hace que `GET /reportes/{id}` los traiga para cada vacuna del reporte, sin darle permisos de configuración.

**Cómo se cumple lo de las vacunas.** El reporte fija sus vacunas **al crearse**. `POST /reportes` crea, en la misma transacción, una fila de `reporte_vacuna` por cada vacuna activa que tenga un esquema publicado que cubra el día 1 del mes. Cada fila guarda `esquema_mongo_id` y `esquema_version`. Después, aunque se desactive una vacuna o se publique otra versión, el reporte no cambia: un reporte creado antes conserva la vacuna, y uno creado después ya no la trae. Así queda resuelta la duda de HU-20 sobre «un reporte en borrador de un mes cuya versión cambió»: sigue con la versión con la que se creó.

**El esquema que aplica a un mes** es el de la DDRISS del establecimiento (`VIGENTE` o `HISTORICO`) cuya vigencia cubre el día 1 del mes. Si no hay ninguno, es el nacional que la cubra (nota de HU-20, spec 20). No basta con buscar el `VIGENTE`, porque puede tener un `desde` futuro. Una versión no vence por el paso del tiempo: su `hasta` solo se llena cuando se publica la siguiente. Por eso una vacuna solo se queda sin esquema para un mes en dos casos: nunca se le publicó uno, o el mes es anterior al `desde` de su primera versión. Esa vacuna se omite del reporte.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Una vacuna inactiva, **o una dosis inactiva**, no aparece en reportes nuevos». Para las **vacunas** se cumple aquí. Para las **dosis** pasa a HU-20: el reporte no guarda qué dosis lleva, solo la versión del esquema, y las versiones publicadas no se editan. La regla para HU-20: al armar el formulario de un reporte, se ocultan las dosis inactivas, salvo que ese reporte ya tenga cantidades guardadas de esa dosis. Queda en la nota de HU-20.
- «Solo puedo elegir periodos abiertos» se cumple en la pantalla (el Select solo lista meses `ABIERTO`) y en el backend (409 si el mes no está `ABIERTO`).
- El contrato provisional pedía `establecimientoId` en el cuerpo. La historia dice «el establecimiento se toma del usuario», así que el cuerpo es solo `{ periodoId }` y `establecimientoId` responde 400.
- `GET /vacunas/{codigo}/esquema-vigente`, un endpoint provisional del contrato que nunca se programó, se quita. La resolución por fecha queda en una función del backend (`esquemasDelPeriodo`) que usan `POST /reportes` y, después, HU-20.

## Alcance

**Entra:**

- `POST /reportes { periodoId }`: crea el reporte en `BORRADOR` del establecimiento del usuario, con sus filas de `reporte_vacuna`, una fila en `historial_estado_reporte` (`NULL` → `BORRADOR`) y una fila `CREAR` en la bitácora, todo en una transacción de MySQL.
- `GET /reportes` paginado, con los filtros `periodoId` y `estado` y filtrado por alcance (el Personal solo ve su establecimiento).
- `GET /reportes/{id}`: el detalle con el establecimiento, el periodo, la fecha límite, el estado del mes y las vacunas con su versión de esquema. Cada vacuna trae además las **etiquetas** de su esquema: el nombre, el orden y la marca `activa` de cada dosis que nombra el esquema, y cada dimensión que usa con su nombre, la `etiqueta` del esquema y las etiquetas de sus valores. Se leen del esquema guardado en `reporte_vacuna`, de `dosis` y de `catalogo_dimensiones`.
- `esquemasDelPeriodo` en `modulos/configuracion/esquemas.service.js`: resuelve por fecha el esquema que aplica a cada vacuna (DDRISS primero, después nacional).
- Permisos nuevos `REPORTE_CREAR` y `REPORTE_CONSULTAR` en `05_permisos_mysql.sql`, solo para `ESTABLECIMIENTO`, más `PERIODO_CONSULTAR` para ese rol. Es una zona protegida, autorizada en la fase de preguntas.
- La opción «Registro de producción» de `opcionesMenu.js` pasa a pedir `REPORTE_CONSULTAR` (el código provisional `REPORTE_REGISTRAR` desaparece) y recibe su `pagina`.
- `GET /esquemas-captura/{id}` devuelve la `etiqueta` de cada desagregación (general y por dosis), con su contrato y su prueba.
- `POST` y `PUT /esquemas-captura` aceptan una `etiqueta` opcional en cada desagregación y la guardan tal cual (texto de hasta 120 caracteres; vacía o `null` no se guarda). Así el editor, que reenvía lo que recibió, no falla con 400 ni la pierde al guardar, y una copia del vigente la conserva (`contenidoDeCopia`). El editor no la muestra ni la cambia.
- Se quita `GET /vacunas/{codigo}/esquema-vigente` de `openapi.yaml`.
- Pantalla `/registro` (`PaginaRegistro`): elegir un mes abierto, ver si ya tiene reporte o crearlo, y ver los pasos de estado y las pestañas de las vacunas del reporte, sin formulario.
- Pruebas de backend (`reportes.test.js`, casos nuevos en `esquemas.test.js`) y de frontend (`PaginaRegistro.test.jsx`).
- Verificación manual con Playwright con una cuenta de establecimiento de la semilla.
- Avance y criterios de HU-19; notas en HU-20 y en HU-09, HU-10 y HU-12 (criterios trasladados), y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- El formulario de captura, guardar cantidades, `GET /reportes/{id}/formulario` y `PUT /reportes/{id}/vacunas/{vacunaId}` (HU-20).
- Ocultar las dosis inactivas en el formulario (HU-20, con la regla de arriba).
- El contenido del esquema (secciones, desagregación por dosis, procedencia, campos adicionales, reglas) y las cantidades guardadas, que necesita `armarFormulario`: los trae `GET /reportes/{id}/formulario` (HU-20), que reutiliza las etiquetas de este spec.
- Dar `DIMENSION_CONSULTAR` o `VACUNA_CONSULTAR` al Personal: no hace falta, porque las etiquetas llegan con el reporte.
- Mostrar o cambiar la `etiqueta` de una desagregación en el editor de esquemas: solo se conserva.
- Enviar a revisión y cualquier transición (`POST /reportes/{id}/transiciones`, HU-22 y siguientes). `transicion_estado` no se toca.
- Crear reportes desde la DDRISS (Revisor o Administrador) para otro establecimiento.
- `REPORTE_CONSULTAR` para el Revisor y los demás roles, la bandeja y la opción «Reportes» del menú (sus propios specs).
- Validaciones automáticas, tarjeta B de procedencia, resumen y botones «Guardar borrador» / «Enviar a revisión» del mockup.
- Cambios al modelo (`01`, `02`) o a las semillas (`03`, `04`).

## Modelo de datos

Este spec **no cambia el modelo**. Escribe en tablas que ya existen en el 01:

```sql
reporte_produccion (establecimiento_id, periodo_id, estado = 'BORRADOR', creado_por)   -- uq_reporte_est_periodo
reporte_vacuna     (reporte_id, vacuna_id, esquema_mongo_id, esquema_version)           -- datos_adicionales y total_declarado quedan NULL
historial_estado_reporte (reporte_id, estado_anterior = NULL, estado_nuevo = 'BORRADOR', usuario_id)
bitacora           (modulo = 'PRODUCCION', accion = 'CREAR', entidad = 'reporte_produccion', valores_nuevos = el reporte completo con sus vacunas)
```

Lee `cierre_periodo` (estado del mes en la DDRISS del establecimiento), `establecimiento` (`activo`, `reporta_5c`, `ddriss_id`), `vacuna` (`activa`) y `esquemas_captura` de MongoDB. No escribe en MongoDB.

### Resolución del esquema (`esquemasDelPeriodo`)

```js
// modulos/configuracion/esquemas.service.js
export async function esquemasDelPeriodo(codigosVacuna, ddrissCodigo, fecha)
// → Map<codigoVacuna, { id, version }>; las vacunas sin esquema que cubra la fecha no aparecen.
```

- Busca en `esquemas_captura` los documentos con `estado` en `VIGENTE` o `HISTORICO`, `vigencia.desde <= fecha` y `vigencia.hasta` nula o `>= fecha`, de las vacunas pedidas, en el territorio de la DDRISS o en el nacional.
- Por cada vacuna, gana el de la DDRISS. Si no hay, el nacional.
- `fecha` es el día 1 del mes del periodo. Para comparar se usa la misma convención de fechas que la publicación (SPEC 20).

### Permisos

| Código | Módulo | Rol |
|---|---|---|
| `REPORTE_CREAR` | `PRODUCCION` | `ESTABLECIMIENTO` |
| `REPORTE_CONSULTAR` | `PRODUCCION` | `ESTABLECIMIENTO` |
| `PERIODO_CONSULTAR` (ya existe) | `CONFIGURACION_CATALOGOS` | se agrega `ESTABLECIMIENTO` |

Como siempre, se agregan de forma idempotente en `05_permisos_mysql.sql` y aplican desde el siguiente inicio de sesión.

### Endpoints

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `POST /reportes` | `REPORTE_CREAR` | Crea el reporte del establecimiento del usuario |
| `GET /reportes` | `REPORTE_CONSULTAR` | Lista paginada por alcance; filtros `periodoId`, `estado` |
| `GET /reportes/{id}` | `REPORTE_CONSULTAR` | Detalle; 404 si no existe o está fuera del alcance |
| `GET /esquemas-captura/{id}` | `ESQUEMA_CONSULTAR` (sin cambio) | Agrega `etiqueta` a cada desagregación |

### Respuestas

`GET /reportes` (forma común `{ elementos, total, pagina, porPagina }`, ordenado por año y mes descendentes):

```json
{
  "elementos": [
    {
      "id": 412,
      "establecimiento": { "id": 1, "codigo": "CS-1201", "nombre": "Centro de Salud San Marcos" },
      "periodo": { "id": 10, "anio": 2026, "mes": 10 },
      "estado": "BORRADOR",
      "actualizadoEn": "2026-10-25T15:04:00.000Z"
    }
  ],
  "total": 1, "pagina": 1, "porPagina": 20
}
```

`POST /reportes` (201) y `GET /reportes/{id}` (200):

```json
{
  "id": 412,
  "establecimiento": { "id": 1, "codigo": "CS-1201", "nombre": "Centro de Salud San Marcos" },
  "periodo": { "id": 10, "anio": 2026, "mes": 10, "estado": "ABIERTO", "fechaLimiteEnvio": "2026-11-10" },
  "estado": "BORRADOR",
  "numeroRectificacion": 0,
  "versionFila": 1,
  "creadoEn": "2026-10-25T15:04:00.000Z",
  "actualizadoEn": "2026-10-25T15:04:00.000Z",
  "vacunas": [
    {
      "id": 2051,
      "vacuna": { "id": 3, "codigo": "HEXA", "nombre": "Hexavalente" },
      "esquema": { "id": "6717…", "version": 2 },
      "dosis": [
        { "codigo": "D1", "nombre": "1.ª dosis", "orden": 1, "activa": true },
        { "codigo": "D2", "nombre": "2.ª dosis", "orden": 2, "activa": true },
        { "codigo": "D3", "nombre": "3.ª dosis", "orden": 3, "activa": true }
      ],
      "dimensiones": [
        {
          "codigo": "grupo_edad",
          "nombre": "Grupo de edad",
          "etiqueta": null,
          "valores": [
            { "codigo": "MENOR_1", "etiqueta": "< 1 año", "orden": 1, "activo": true },
            { "codigo": "1_A_5", "etiqueta": "De 1 a < 6 años", "orden": 4, "activo": true }
          ]
        }
      ]
    }
  ]
}
```

- `periodo.estado` y `fechaLimiteEnvio` salen de `cierre_periodo` de la DDRISS del establecimiento (`null` si no tiene fila).
- `vacunas` va ordenada como el catálogo (`orden_informe`, `nombre`). Las fechas se leen con `UNIX_TIMESTAMP` (nota del 2026-10-21) y las `DATE` con `DATE_FORMAT`.
- El esquema `Reporte` del contrato se reemplaza por esta forma. Se agregan `ReporteResumen` y `PaginaReportes`.

### Etiquetas de cada vacuna

`dosis` y `dimensiones` salen del esquema guardado en `reporte_vacuna` (`esquema_mongo_id`), no del vigente, para que un reporte viejo siga mostrando sus etiquetas:

- **`dosis`:** las que nombra el esquema (`dosis[].codigo`), con `nombre`, `orden` y `activa` de la tabla `dosis` de la vacuna, ordenadas por `orden`. Van **también las inactivas**, con `activa: false`, para que HU-20 aplique su regla (ocultarlas salvo que el reporte tenga cantidades). Un código del esquema que no está en `dosis` se omite.
- **`dimensiones`:** cada dimensión que usa el esquema (la desagregación general, la de cada dosis y `secciones[].grupoEdad`), sin repetir, en el orden de `catalogo_dimensiones`. Cada una trae su `codigo` y su `nombre` del catálogo, la `etiqueta` de la desagregación en el esquema (`null` si no tiene; si dos desagregaciones la definen distinta, gana la general) y los **valores que el esquema usa**, con su `etiqueta`, `orden` y `activo` del catálogo, ordenados por `orden`. Los valores inactivos también van, porque una versión `HISTORICO` puede usarlos (spec 21). Un valor o una dimensión que no están en el catálogo se omiten.
- Una vacuna cuyo esquema desagrega solo por dosis tiene `dimensiones: []`.
- Se lee cada esquema y el catálogo una sola vez por petición (`find` con `_id: { $in }` y las dimensiones usadas), no una consulta por vacuna.

`armarFormulario` recibe hoy `vacuna` (con sus dosis) y `dimensiones` del catálogo. Esta forma alcanza para armar esas dos entradas en HU-20, y el resto del esquema llega con `GET /reportes/{id}/formulario`.

`GET /esquemas-captura/{id}`: cada elemento de `desagregacion` (general y de cada dosis) pasa a ser `{ dimension, valores, etiqueta }`, con `etiqueta` nula si el documento no la trae.

### Errores de `POST /reportes`

Se revisan en este orden:

| Caso | Respuesta |
|---|---|
| Cuerpo que no es `{ periodoId }` entero positivo, o con otro campo (incluido `establecimientoId`) | 400 `ENTRADA_INVALIDA` |
| Cuenta sin establecimiento | 403 `SIN_ESTABLECIMIENTO` |
| Establecimiento inactivo | 409 `ESTABLECIMIENTO_INACTIVO` |
| Establecimiento con `reporta_5c = FALSE` | 422 `ESTABLECIMIENTO_NO_REPORTA` |
| El periodo no existe | 404 `NO_ENCONTRADO` |
| El mes no está `ABIERTO` en la DDRISS del establecimiento (sin abrir, `EN_CIERRE` o `CERRADO`) | 409 `PERIODO_NO_ABIERTO` |
| Ya hay un reporte de ese establecimiento y periodo (también si dos altas chocan en `uq_reporte_est_periodo`) | 409 `REPORTE_EXISTENTE` |
| Ninguna vacuna activa tiene esquema que cubra el mes | 422 `SIN_ESQUEMAS` |

Mensajes, en español y sin datos internos: «Su establecimiento está desactivado y no puede crear reportes.», «Su establecimiento no envía el formulario 5C.», «El mes no está abierto para reportes.», «Ya existe el reporte de este mes.», «No hay formularios de captura publicados para este mes.».

### Transacción

1. Fuera de la transacción: leer el establecimiento y la DDRISS de la cuenta, y resolver los esquemas en MongoDB con `esquemasDelPeriodo` (sobre las vacunas activas).
2. Dentro de `enTransaccion`, la **primera** consulta es `SELECT … FROM cierre_periodo … FOR SHARE` del mes y la DDRISS (nota del 2026-10-23 sobre REPEATABLE READ). Si el mes no está `ABIERTO`, se responde 409.
3. `INSERT` en `reporte_produccion` (un `ER_DUP_ENTRY` → 409 `REPORTE_EXISTENTE`), en `reporte_vacuna` (una fila por vacuna resuelta) y en `historial_estado_reporte`.
4. `registrarBitacora(conexion, { …contextoAuditoria(req), modulo: MODULOS.PRODUCCION, accion: ACCIONES.CREAR, entidad: 'reporte_produccion', … })` con el reporte completo, y se confirma.

### Pantalla `/registro`

Referencia: encabezado y pasos de estado de `docs/mockups/pantallas/Registro.html` (pantalla 4 de `descripcion_pantallas.md`), sin las tarjetas A y B, el panel de validación, el resumen ni los botones de envío.

- **Mes:** un Select con los meses `ABIERTO` de `GET /periodos?estado=ABIERTO`, con el elegido en `?periodo=`. Sin `?periodo=`, se elige el mes abierto más antiguo cuyo reporte no existe o sigue en `BORRADOR`; si todos están enviados, el más reciente. Para saberlo se llama `GET /reportes?periodoId=` por cada mes abierto (suelen ser uno o dos).
- **Sin meses abiertos:** el mensaje «No hay meses abiertos para reportar. La DDRISS abre cada mes en Configuración.» y nada más.
- **Mes sin reporte:** el título «Reporte mensual de {mes} de {año}», la fecha límite del mes y el botón «Crear reporte de {mes} de {año}». Al crear, se muestra el reporte. Un error del backend se muestra en un Alert con su mensaje (409 `REPORTE_EXISTENTE` recarga el reporte existente).
- **Mes con reporte:**
  - el encabezado «REGISTRO DE PRODUCCIÓN · {NOMBRE DEL ESTABLECIMIENTO}» y el título;
  - los pasos Borrador › Enviado › En revisión › Aprobado › Cerrado, con el estado actual resaltado (Corrección solicitada y Rectificación se muestran como una insignia junto a los pasos);
  - la fecha límite;
  - las pestañas de las vacunas del reporte. Cada una muestra:
    - «Formulario: {vacuna}, versión {n}»;
    - la franja celeste «Dimensiones de este esquema:» con Dosis y el nombre (o la `etiqueta`) de cada dimensión, como en el mockup;
    - la lista de dosis activas con su nombre y, por dimensión, sus valores con su etiqueta;
    - el texto «La captura de esta vacuna se habilita con el formulario de registro.».

Antes de que exista un reporte, el encabezado no lleva el nombre del establecimiento, porque la sesión no lo trae. Se usan componentes de shadcn que ya están en `components/ui/` (Select, Tabs, Card, Button, Alert, Badge). No se agregan dependencias.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← /reportes (POST, GET, GET {id}), esquemas Reporte, ReporteResumen,
│                                                    PaginaReportes; etiqueta en la desagregación; sin /vacunas/{codigo}/esquema-vigente
├── db/05_permisos_mysql.sql                       ← REPORTE_CREAR, REPORTE_CONSULTAR; PERIODO_CONSULTAR para ESTABLECIMIENTO
├── src/app.js                                     ← monta produccionRoutes
├── src/modulos/produccion/
│   ├── produccion.routes.js                       ← nuevo
│   ├── produccion.controller.js                   ← nuevo
│   └── reportes.service.js                        ← nuevo
├── src/modulos/configuracion/esquemas.service.js  ← esquemasDelPeriodo; etiqueta en aDesagregacion y en leerDesagregacion
└── tests/
    ├── reportes.test.js                           ← nuevo
    └── esquemas.test.js                           ← casos de la etiqueta
frontend/src/
├── api/produccion.js                              ← nuevo: listarReportes, obtenerReporte, crearReporte
├── componentes/layout/opcionesMenu.js             ← «Registro de producción»: REPORTE_CONSULTAR y su pagina;
│                                                    «Reportes»: otro permiso provisional (decidido en el paso 1)
├── paginas/configuracion/PaginaRegistrarEsquema.jsx ← contenidoDeCopia conserva la etiqueta
├── paginas/configuracion/PaginaEditarEsquema.test.jsx, PaginaRegistrarEsquema.test.jsx ← casos de la etiqueta
└── paginas/registro/
    ├── PaginaRegistro.jsx                         ← nuevo
    └── PaginaRegistro.test.jsx                    ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance y criterios de HU-19; notas en HU-09, HU-10, HU-12 y HU-20
CLAUDE.md                                          ← nota de reportes
```

## Plan de implementación

1. **Contrato y permisos.** En `openapi.yaml`: `POST`/`GET /reportes` y `GET /reportes/{id}` con sus respuestas, errores y `x-permiso`; la `etiqueta` en la desagregación; quitar `/vacunas/{codigo}/esquema-vigente`. En `05_permisos_mysql.sql`: los dos permisos nuevos y `PERIODO_CONSULTAR` para `ESTABLECIMIENTO`. Correr el 05 contra Aiven (idempotente) **con la aprobación de Chris**.
   Comprobación: `/api/docs` muestra los endpoints; `permisos.test.js` pasa.

2. **Etiqueta de la desagregación.** `aDesagregacion` pasa `etiqueta ?? null`. Casos nuevos en `esquemas.test.js`: un esquema insertado en MongoDB con una `etiqueta` en la general y otra en una dosis las devuelve, y uno sin `etiqueta` devuelve `null`. Como el editor reenvía la desagregación que recibe, `leerDesagregacion` acepta la `etiqueta` opcional y la guarda (decidido al implementar este paso): un `PUT` la conserva, reenviar lo devuelto no cambia nada, vacía o `null` no se guarda, y un número o más de 120 caracteres dan 400. En el frontend, `contenidoDeCopia` la conserva, con pruebas en `PaginaEditarEsquema.test.jsx` y `PaginaRegistrarEsquema.test.jsx`.
   Comprobación: `esquemas.test.js`, `esquemas-publicar.test.js` y las pruebas de `paginas/configuracion` pasan.

3. **`esquemasDelPeriodo`.** La función y sus casos en `reportes.test.js`, con la vacuna ficticia `ZVT_HU19` (nacional v1 desde 2022-01-01 y `HISTORICO` hasta 2022-05-31, nacional v2 desde 2022-06-01) y un esquema de `DDRISS_SM` desde 2022-04-01:
   - febrero de 2022 da la nacional v1;
   - abril de 2022 da la de la DDRISS aunque haya nacional;
   - una vacuna sin esquema, o con su primer `desde` posterior al mes, no aparece.
   Comprobación: los casos pasan.

4. **`POST /reportes`.** Servicio, controlador y rutas en `modulos/produccion/`. Las pruebas firman el token de `cs1201` (cuenta de la semilla, `CS-1201`) como indica la nota del 2026-10-21, y usan el año 2022: crean sus meses en `periodo` y sus filas en `cierre_periodo` de la DDRISS 1 (`ABIERTO`, `EN_CIERRE`, `CERRADO` y uno sin fila) y los borran al inicio y al final, junto con sus reportes. La vacuna `ZVT_HU19` (activa) y `ZVT_HU19I` (inactiva, con esquema) se insertan en MySQL y en MongoDB y también se borran. Las filas de la bitácora quedan. Casos:
   - crea el reporte en `BORRADOR`, con `ZVT_HU19` y la versión que aplica, sin `ZVT_HU19I`, con su fila de historial y su `CREAR` en la bitácora;
   - en 2022 solo entran las vacunas de prueba, porque los esquemas de la semilla empiezan en 2026;
   - un segundo `POST` del mismo mes da 409 `REPORTE_EXISTENTE`, y dos en paralelo dan un 201 y un 409;
   - un mes sin abrir, `EN_CIERRE` o `CERRADO` da 409 `PERIODO_NO_ABIERTO`, y un periodo inexistente 404;
   - un mes sin ningún esquema da 422 `SIN_ESQUEMAS`, sin dejar nada en las tablas;
   - `CS-1201` con `reporta_5c = FALSE` da 422 y con `activo = FALSE` da 409. Se cambian por SQL y se restauran en un `finally`. `revisarCuenta` no mira el establecimiento, así que el token sigue valiendo;
   - `establecimientoId` en el cuerpo da 400; un rol sin `REPORTE_CREAR` (el Revisor) da 403;
   - desactivar `ZVT_HU19` después de crear el reporte no lo cambia: `GET /reportes/{id}` la sigue trayendo.
   Comprobación: `reportes.test.js` pasa.

5. **`GET /reportes` y `GET /reportes/{id}`.** Con el mismo archivo de pruebas:
   - la lista de `cs1201` filtrada por `periodoId` trae su reporte con la forma paginada;
   - `estado` inválido o un parámetro desconocido dan 400;
   - otra cuenta de la semilla (`cs1202`) no ve ese reporte en la lista y recibe 404 en el detalle;
   - el detalle trae el periodo con su estado y fecha límite, y las vacunas con su versión.
   Comprobación: `reportes.test.js` pasa.

6. **Etiquetas en `GET /reportes/{id}`.** El esquema de prueba de `ZVT_HU19` usa la dimensión `grupo_edad` en sus secciones y una dimensión ficticia `zvt_hu19` (insertada y borrada en `catalogo_dimensiones`) con `etiqueta` en la desagregación general. Una dosis tiene desagregación propia por `sexo`. Casos:
   - `dosis` trae los nombres de la tabla `dosis` en orden; al desactivar una dosis después de crear el reporte, sigue apareciendo con `activa: false`;
   - `dimensiones` trae `grupo_edad`, `sexo` y `zvt_hu19` una sola vez, con la `etiqueta` del esquema en `zvt_hu19` y `null` en las otras, y solo los valores que usa el esquema;
   - un valor desactivado en el catálogo después de crear el reporte sigue apareciendo con `activo: false`;
   - publicar otra versión de `ZVT_HU19` no cambia las etiquetas del reporte, que salen de su versión;
   - la cuenta de `cs1201` obtiene todo esto sin tener `DIMENSION_CONSULTAR` ni `VACUNA_CONSULTAR`.
   Comprobación: `reportes.test.js` pasa; después, la suite completa del backend.

7. **Pantalla `/registro`.** `api/produccion.js`, `PaginaRegistro.jsx`, la opción del menú y sus pruebas con `vi.mock` sobre `src/api/`:
   - sin meses abiertos, el mensaje;
   - con septiembre en `ENVIADO` y octubre sin reporte, elige octubre; con los dos sin reporte, elige septiembre; `?periodo=` manda;
   - «Crear reporte» llama a `crearReporte` con el `periodoId` y muestra los pasos y las pestañas;
   - un 422 muestra su mensaje en el Alert; un 409 `REPORTE_EXISTENTE` recarga el reporte;
   - un reporte en `CORRECCION_SOLICITADA` muestra la insignia;
   - la pestaña de una vacuna muestra la franja con la `etiqueta` de la dimensión cuando viene, y sus dosis y valores con su etiqueta; una dosis con `activa: false` no aparece en la lista.
   Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (Chris inicia sesión a mano):
   - con una cuenta de establecimiento de la semilla, `/registro` abre en el mes pendiente;
   - en un mes abierto sin reporte, se crea el reporte y aparecen las pestañas de las vacunas con esquema para ese mes, con su versión;
   - la pestaña de Hexavalente muestra «Dosis · Grupo de edad» y las etiquetas «< 1 año» y «De 1 a < 6 años», y la de VPH muestra Sexo con «Masculino» y «Femenino»;
   - al recargar, el reporte sigue y el botón ya no aparece;
   - el menú del Revisor no muestra «Registro de producción».
   El reporte creado queda en `BORRADOR` y sirve para HU-20.

   Documentación:
   - en HU-19, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-09, HU-10 y HU-12, una línea en el avance que diga que el criterio trasladado se cumplió en el spec 22 (la parte de las dosis de HU-10, en HU-20);
   - en HU-20, la nota: «Las vacunas y la versión del esquema de cada una se fijan al crear el reporte (`reporte_vacuna`, SPEC 22): el formulario usa esa versión aunque se publique otra. Las dosis inactivas se ocultan salvo que el reporte ya tenga cantidades de esa dosis. Los nombres de las dosis (con `activa`) y las etiquetas de las dimensiones de cada vacuna ya vienen en `GET /reportes/{id}` (`vacunas[].dosis` y `vacunas[].dimensiones`, SPEC 22), sacados de la versión del reporte; el Personal no tiene `DIMENSION_CONSULTAR` ni `VACUNA_CONSULTAR`. `GET /reportes/{id}/formulario` agrega el contenido del esquema y las cantidades. `esquemasDelPeriodo` (`esquemas.service.js`) resuelve el esquema por fecha.»;
   - en «Notas de contexto» de `CLAUDE.md`: reportes en `modulos/produccion/`, las vacunas fijadas al crear, `esquemasDelPeriodo`, las etiquetas de `GET /reportes/{id}` (de la versión del reporte, con inactivas), y que las pruebas usan `cs1201`, el año 2022, `ZVT_HU19*` y la dimensión `zvt_hu19`.

## Criterios de aceptación

- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba.
- [ ] `backend/db/01`, `02`, `03` y `04`, `transicion_estado` y los dos `package.json` no cambian.
- [ ] `POST /reportes { periodoId }` crea el reporte en `BORRADOR` del establecimiento de la cuenta, con una fila de historial y una `CREAR` en la bitácora.
- [ ] Solo se crea en un mes `ABIERTO` en la DDRISS del establecimiento: uno sin abrir, `EN_CIERRE` o `CERRADO` responde 409 `PERIODO_NO_ABIERTO`.
- [ ] Un establecimiento con `reporta_5c = FALSE` responde 422 y uno inactivo 409.
- [ ] Un segundo reporte del mismo establecimiento y mes responde 409, también si las dos altas van en paralelo.
- [ ] El reporte lleva una fila de `reporte_vacuna` por cada vacuna activa con esquema que cubre el día 1 del mes, con el esquema de la DDRISS antes que el nacional. Una vacuna inactiva o sin esquema no entra.
- [ ] Si ninguna vacuna tiene esquema, responde 422 `SIN_ESQUEMAS` y no deja nada escrito.
- [ ] Desactivar una vacuna o publicar otra versión después de crear el reporte no cambia sus vacunas ni sus versiones.
- [ ] `GET /reportes` y `GET /reportes/{id}` solo muestran reportes del establecimiento del Personal; uno ajeno responde 404.
- [ ] `GET /esquemas-captura/{id}` devuelve la `etiqueta` de cada desagregación (o `null`), general y por dosis.
- [ ] Guardar un borrador desde el editor sigue funcionando y conserva la `etiqueta` que traía; una copia del vigente también la conserva.
- [ ] `GET /reportes/{id}` trae, por vacuna, las dosis del esquema con su nombre, orden y `activa`, y las dimensiones que usa con su nombre, la `etiqueta` del esquema y las etiquetas de los valores que usa, todo de la versión guardada en el reporte e incluidos los inactivos.
- [ ] El Personal de establecimiento obtiene esas etiquetas sin tener `DIMENSION_CONSULTAR` ni `VACUNA_CONSULTAR`.
- [ ] `GET /vacunas/{codigo}/esquema-vigente` ya no está en `openapi.yaml`.
- [ ] El Personal de establecimiento tiene `REPORTE_CREAR`, `REPORTE_CONSULTAR` y `PERIODO_CONSULTAR`; ningún otro rol recibe los dos primeros.
- [ ] `/registro` solo deja elegir meses abiertos, abre en el más antiguo pendiente, crea el reporte y muestra sus pasos de estado y las pestañas de sus vacunas con su versión.
- [ ] HU-19 tiene su avance y sus criterios marcados; HU-09, HU-10, HU-12 y HU-20 tienen su nota, y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** fijar las vacunas y la versión del esquema al crear el reporte (decidido en la fase de preguntas). Cumple «los reportes anteriores la conservan» sin depender de la captura y resuelve el cambio de versión de un borrador abierto. **No:** crear solo `reporte_produccion` y dejar `reporte_vacuna` a HU-20, que deja el criterio sin cumplir y la versión sin fijar hasta guardar.
- **Sí:** una vacuna sin esquema que cubra el mes se omite (decidido en la fase de preguntas). **No:** rechazar el reporte, que con la semilla actual impediría crear cualquiera.
- **Sí:** si no queda ninguna vacuna, 422 `SIN_ESQUEMAS` (decidido en la fase de preguntas). **No:** crear un reporte vacío, que ocupa el único lugar del mes y no admite vacunas después.
- **Sí:** el esquema se elige por la fecha del día 1 del mes, primero el de la DDRISS (`VIGENTE` o `HISTORICO`) y después el nacional (nota del spec 20). **No:** el `VIGENTE` sin mirar la fecha, que usaría antes de tiempo una versión con `desde` futuro.
- **Sí:** las dosis inactivas se resuelven en HU-20 por los datos del reporte: se ocultan salvo que ese reporte ya tenga cantidades (decidido en la fase de preguntas). **No:** guardar la lista de dosis al crear en `datos_adicionales`, que es para los campos del esquema, o en una columna nueva, que toca `backend/db/`.
- **Sí:** solo el Personal crea, y el establecimiento sale de su cuenta; el cuerpo es `{ periodoId }` (decidido en la fase de preguntas, como dice la historia). **No:** `establecimientoId` en el cuerpo con creación desde la DDRISS, que no pide ninguna historia.
- **Sí:** `REPORTE_CREAR` y `REPORTE_CONSULTAR` solo para `ESTABLECIMIENTO`, y «Registro de producción» pide `REPORTE_CONSULTAR`, para que la pantalla siga visible con el reporte ya creado (decidido en la fase de preguntas). **No:** dárselos ya al Revisor, que vería «Reportes» como «En construcción».
- **Sí:** `GET /reportes` paginado y `GET /reportes/{id}` (decidido en la fase de preguntas). La pantalla necesita saber si el mes ya tiene reporte. **No:** solo el detalle con el id en el 409, que no deja elegir el mes pendiente.
- **Sí:** quitar `GET /vacunas/{codigo}/esquema-vigente` y resolver con `esquemasDelPeriodo` (decidido en la fase de preguntas). El endpoint buscaba el `VIGENTE`, que ya no es la regla, y nadie lo usa.
- **Sí:** los nombres de las dosis y las etiquetas de las dimensiones llegan al Personal en `GET /reportes/{id}`, dentro de este spec y sin permisos de configuración (decidido después de la fase de preguntas). HU-20 empieza con eso resuelto, y `/registro` ya puede mostrar las dimensiones de cada vacuna. **No:** dejarlo para `GET /reportes/{id}/formulario` de HU-20. **No:** dar `DIMENSION_CONSULTAR` y `VACUNA_CONSULTAR`, que abren todo el catálogo nacional y las pantallas de configuración al Personal.
- **Sí:** las etiquetas salen de la versión del esquema guardada en el reporte e incluyen las dosis y los valores inactivos, con su marca. Así, un reporte viejo no pierde sus encabezados, y HU-20 decide qué ocultar. **No:** solo los activos, que rompería un reporte con una dosis desactivada después.
- **Sí:** solo los valores que el esquema usa, no todo el catálogo de la dimensión. Es lo que dibuja el formulario.
- **Sí:** `POST` y `PUT /esquemas-captura` aceptan y guardan la `etiqueta` de una desagregación (decidido al implementar el paso 2). El editor reenvía lo que recibe, y sin esto, guardar cualquier borrador habría respondido 400 «Campo no permitido: etiqueta.». Además, la etiqueta ya no se pierde al guardar ni al copiar. **No:** quitarla en el cliente antes del `PUT`, que la perdería al guardar.
- **Sí:** el mes inicial es el abierto más antiguo pendiente (sin reporte o en `BORRADOR`), con `?periodo=` (decidido en la fase de preguntas). **No:** el más reciente, que esconde un mes atrasado.
- **Sí:** la creación deja una fila en `historial_estado_reporte` (`NULL` → `BORRADOR`). El historial del reporte arranca completo y la columna `estado_anterior` admite `NULL` para esto. **No:** esperar a la primera transición.
- **Sí:** las pruebas usan la cuenta `cs1201` de la semilla con token firmado a mano y el año 2022 (decidido en la fase de preguntas). **No:** una cuenta permanente creada por la prueba.
- **Sí:** `revisarCuenta` no cambia. Un establecimiento inactivo con una cuenta activa no debería existir (spec 14 no lo deja desactivar), así que el 409 es una defensa del endpoint. **No:** cerrar la sesión de las cuentas de un establecimiento inactivo, que cambiaría `autenticar` para todos los módulos.
- **Sí:** antes de crear el reporte, el encabezado no lleva el nombre del establecimiento, porque la sesión no lo trae. **No:** pedir `GET /establecimientos/{id}`, que exige `ESTABLECIMIENTO_CONSULTAR`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Dos altas del mismo mes al mismo tiempo | `uq_reporte_est_periodo` lo impide; el `ER_DUP_ENTRY` responde 409. Lo cubre la prueba en paralelo. |
| El mes pasa a `EN_CIERRE` mientras se crea el reporte | El `FOR SHARE` sobre `cierre_periodo` es la primera consulta de la transacción. |
| Se publica una versión entre la lectura de MongoDB y el `INSERT` | El reporte queda con la versión que aplicaba al leer, que es válida para ese mes, salvo que la nueva tenga `desde` en ese mismo mes. Es un caso raro, y la versión elegida queda guardada y auditada. |
| Las pruebas cambian `reporta_5c` o `activo` de `CS-1201` y fallan antes de restaurarlo | El cambio va en un `finally`, y el `beforeAll` lo restaura por si una corrida anterior quedó a medias. |
| Los esquemas de la semilla empiezan a cubrir 2022 | Las pruebas comprueban la lista de vacunas filtrando por los códigos `ZVT_HU19*`, no por cantidad total. |
| El 05 no se corre en Aiven antes de probar | La prueba de permisos falla; el paso 1 lo corre con aprobación. |
| MongoDB no responde al pedir `GET /reportes/{id}` | El detalle necesita el esquema para las etiquetas: responde el error común del servidor, igual que los demás endpoints de MongoDB. La lista `GET /reportes` no lee MongoDB. |
| El esquema guardado en `reporte_vacuna` ya no está en MongoDB | Las versiones publicadas no se borran (regla 5). Si falta, esa vacuna va con `dosis: []` y `dimensiones: []`, sin fallar el detalle. |
| La `etiqueta` se pierde al guardar o copiar un borrador | El `POST` y el `PUT` la aceptan y la guardan, y `contenidoDeCopia` la conserva (paso 2). Mostrarla y cambiarla en el editor queda fuera de alcance. |

## Lo que **no** entra en este spec

- El formulario de captura, guardar y cargar cantidades (HU-20).
- Ocultar las dosis inactivas (HU-20).
- Transiciones de estado y envío a revisión (HU-22 y siguientes).
- La bandeja y la consulta de reportes para la DDRISS.
- Editar la `etiqueta` de una desagregación.
