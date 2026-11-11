# SPEC 57 — Control de rectificaciones por establecimiento

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec E» de Chris, punto 6 de `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 05, SPEC 40 y SPEC 41
> **Fecha:** 2026-11-10
> **Objetivo:** Contar las solicitudes de rectificación de cada establecimiento por mes, avisar en pantalla desde la 5.ª (sin bloquear nada) y crear una sola alerta de proceso para el Administrador al llegar a 5.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hoy un establecimiento puede pedir rectificaciones sin límite y nadie se entera de que pide muchas. Chris lo dejó en `specs/spec-E-control-rectificaciones.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Decisiones de Chris (2026-11-10), del documento E:** se cuenta por establecimiento, el umbral es 5 al mes, la alerta la recibe el Administrador y es solo un aviso, sin bloqueo.

**Lo que se decidió en la fase de preguntas:**

- La pantalla «Nueva rectificación» pide el conteo a un endpoint nuevo antes de enviar.
- Quien solicita ve el aviso solo cuando su solicitud será la 5.ª o una posterior.
- Quien resuelve ve siempre el conteo del mes en el detalle, como aviso ámbar desde 5.
- El mes es el calendario de Guatemala (UTC−6), no el de UTC: Aiven guarda las fechas en UTC.
- La alerta lleva severidad `ADVERTENCIA`, el municipio del establecimiento y el reporte de la solicitud que llegó a 5.
- La creación de la alerta va a la bitácora, en la misma transacción que la solicitud.
- Dos solicitudes simultáneas del mismo establecimiento se ordenan con un bloqueo de su fila en `establecimiento` mientras dura la transacción. El bloqueo dura milisegundos, solo evita una alerta repetida y no impide nada a ningún usuario.

## Alcance

**Entra:**

- En `backend/src/modulos/revision/rectificaciones.service.js`:
  - la constante `UMBRAL_RECTIFICACIONES_MES = 5`;
  - el reloj `RELOJ` y la función `contarSolicitudesDelMes`;
  - en `solicitarRectificacion`: el bloqueo del establecimiento, `solicitado_en` tomado del reloj, y la alerta con su bitácora al llegar a 5;
  - en `leerSolicitud`: el campo `solicitudesDelMes`.
- El endpoint nuevo `GET /reportes/{id}/rectificaciones/conteo-del-mes`, con `RECTIFICACION_SOLICITAR` (permiso que ya existe), primero en `backend/openapi.yaml`.
- `solicitudesDelMes` en el esquema `SolicitudRectificacion` del contrato. Lo traen `GET /rectificaciones/{id}`, la respuesta del `POST` y la de aprobar y rechazar, porque todas usan `leerSolicitud`.
- En el frontend:
  - `contarRectificacionesDelMes` en `api/rectificaciones.js`;
  - el aviso ámbar en `paginas/rectificaciones/PaginaNuevaRectificacion.jsx`;
  - la línea del conteo (ámbar desde 5) en `PaginaDetalleRectificacion.jsx`.
- Pruebas del backend (archivo nuevo `backend/tests/controlRectificaciones.test.js`) y del frontend (en las pruebas de las dos pantallas).
- Notas en HU-50 y HU-52 de `docs/SPECS/HISTORIAS_DE_USUARIO.md`, la nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-E-control-rectificaciones.md`.

**Fuera de alcance (para otros specs):**

- Ver, filtrar o atender la alerta (HU-52, Sprint 5): hasta entonces solo existe en la tabla `alerta`.
- Bloquear, frenar o pedir otra aprobación a partir de la 5.ª solicitud.
- Un umbral configurable (por DDRISS, en pantalla o en MongoDB): es una constante del backend.
- Contar por reporte, por municipio o por usuario.
- Avisar a quien solicita por debajo de la 5.ª.
- Mostrar el conteo en la lista de «Rectificaciones» o en el Inicio.
- Cambios a tablas, colecciones, permisos, `transicion_estado` o `package.json`.

## Modelo de datos

Este spec no cambia tablas ni colecciones. Usa `solicitud_rectificacion` (`reporte_id`, `solicitado_en`), `reporte_produccion` (`establecimiento_id`), `establecimiento` (`ddriss_id`, `municipio_id`), `periodo`, `rol` y `alerta` tal como están en el 01.

### Conteo

Cuentan las solicitudes de **todos** los reportes del establecimiento cuyo `solicitado_en` cae en el mes calendario de Guatemala, **en cualquier estado** (también `RECHAZADA` y `APLICADA`):

```sql
SELECT COUNT(*) AS cantidad
  FROM solicitud_rectificacion s
  JOIN reporte_produccion r ON r.id = s.reporte_id
 WHERE r.establecimiento_id = ?
   AND s.solicitado_en >= FROM_UNIXTIME(?) AND s.solicitado_en < FROM_UNIXTIME(?)
```

- Los límites se calculan en Node: el día 1 del mes a las 06:00 UTC y el día 1 del mes siguiente a las 06:00 UTC (Guatemala no tiene horario de verano).
- `FROM_UNIXTIME` y `UNIX_TIMESTAMP` son inversas en la misma sesión, así que no aparece el corrimiento de 6 h de `mysql2` (nota del 2026-10-21).

```js
export const UMBRAL_RECTIFICACIONES_MES = 5
export const RELOJ = { ahora: () => new Date() } // las pruebas lo fijan con vi.spyOn
export async function contarSolicitudesDelMes(ejecutor, establecimientoId, { anio, mes }) // → número
export function mesGuatemala(fecha) // → { anio, mes }
```

### `solicitado_en`

La solicitud nueva guarda `solicitado_en = FROM_UNIXTIME(segundos de RELOJ.ahora())`, en lugar del `DEFAULT CURRENT_TIMESTAMP`. Así el conteo, el mes de la alerta y la fecha guardada salen del mismo instante, y las pruebas pueden fijar un mes propio.

### Respuestas

```yaml
ConteoRectificacionesDelMes:     # GET /reportes/{id}/rectificaciones/conteo-del-mes
  anio: 2026
  mes: 11
  cantidad: 4                    # solicitudes que ya existen este mes (sin la que se va a crear)
  umbral: 5

SolicitudRectificacion:
  # … lo de hoy, más:
  solicitudesDelMes:
    anio: 2026                   # mes de Guatemala del solicitadoEn de esta solicitud
    mes: 11
    cantidad: 6                  # todas las del establecimiento en ese mes, incluida esta
    umbral: 5
```

El endpoint nuevo:

- revisa el ámbito con `leerReporte`, igual que el `POST`;
- responde 404 si el reporte no existe o está fuera del ámbito;
- no exige que el reporte esté `CERRADO`, porque solo informa.

### Alerta

La alerta se crea en la misma transacción que la solicitud, solo cuando el conteo con la solicitud nueva es **exactamente** `UMBRAL_RECTIFICACIONES_MES`:

| Columna | Valor |
|---|---|
| `tipo` | `PROCESO` |
| `severidad` | `ADVERTENCIA` |
| `titulo` | `Rectificaciones frecuentes` |
| `mensaje` | `{código} {nombre} lleva 5 solicitudes de rectificación en {mes} de {año}.` |
| `ddriss_id` | `establecimiento.ddriss_id` |
| `periodo_id` | el `periodo` de ese año y mes; `NULL` si no existe |
| `municipio_id` | `establecimiento.municipio_id` |
| `establecimiento_id` | el del reporte |
| `reporte_id` | el reporte de la 5.ª solicitud |
| `rol_destino_id` | `SELECT id FROM rol WHERE codigo = 'ADMINISTRADOR'` |
| `generada_en` | `FROM_UNIXTIME` del mismo instante de `RELOJ` |
| `estado` | `ACTIVA` (por defecto) |

Bitácora: una fila más con `modulo: MODULOS.RECTIFICACION`, `accion: ACCIONES.CREAR`, `entidad: 'alerta'`, el id de la alerta y la fila completa en `valoresNuevos`. No hay acción nueva en `ACCIONES`.

### Orden dentro de la transacción de `solicitarRectificacion`

1. `SELECT … FROM reporte_produccion WHERE id = ? FOR UPDATE`: sigue siendo la primera consulta.
2. `SELECT id FROM establecimiento WHERE id = ? FOR UPDATE`: va antes de cualquier lectura sin bloqueo. Con REPEATABLE READ, la primera lectura sin bloqueo fija lo que ve la transacción (nota del 2026-10-23). Si fuera antes de esperar este bloqueo, la segunda de dos solicitudes simultáneas no vería la primera.
3. Lo de hoy: la solicitud pendiente, `versionFila`, los cambios, el `INSERT` de la solicitud y su detalle, y su bitácora.
4. `contarSolicitudesDelMes`. Si da `UMBRAL_RECTIFICACIONES_MES`, el `INSERT` en `alerta` y su bitácora.

### Pantallas

- **Nueva rectificación:** al elegir el reporte, pide `contarRectificacionesDelMes(reporteId)`.
  - Si `cantidad + 1 >= umbral`, muestra encima de los botones un aviso ámbar (`--advertencia` / `--advertencia-foreground`): «El establecimiento lleva {cantidad} solicitudes de rectificación en {mes}; esta será la {cantidad + 1}.ª».
  - El envío sigue igual.
  - Si el conteo falla, no se muestra ni el aviso ni un error, y la solicitud se puede enviar igual.
- **Detalle:** siempre muestra la línea «Solicitudes del establecimiento en {mes} de {año}: {cantidad}».
  - Si `cantidad >= umbral`, la línea es un aviso ámbar que agrega «Llega al límite de {umbral} al mes.».
  - Sin `solicitudesDelMes` (una respuesta vieja), no se muestra nada.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`:
   - el path `GET /reportes/{id}/rectificaciones/conteo-del-mes` (`x-permiso: RECTIFICACION_SOLICITAR`, respuestas 200, 400, 401, 403 y 404);
   - el esquema `ConteoRectificacionesDelMes`;
   - `solicitudesDelMes` en `SolicitudRectificacion`;
   - en la descripción del `POST /reportes/{id}/rectificaciones`, la alerta al llegar a 5.
2. **Conteo.** En `rectificaciones.service.js`, agregar `UMBRAL_RECTIFICACIONES_MES`, `RELOJ`, `mesGuatemala` y `contarSolicitudesDelMes`. Agregar el endpoint nuevo (servicio, controlador y la ruta en `revision`, antes de cualquier `/:id` que la tape). Probarlo en `controlRectificaciones.test.js`:
   - cuenta las solicitudes del mes de varios reportes del establecimiento, en cualquier estado;
   - no cuenta las de otro mes, incluidas las del último día del mes anterior a las 23:00 de Guatemala (05:00 UTC del día 1);
   - no cuenta las de otro establecimiento;
   - responde 404 fuera del ámbito.
3. **Solicitud y alerta.** En `solicitarRectificacion`: el bloqueo del establecimiento, `solicitado_en` del reloj, y la alerta con su bitácora. Pruebas:
   - la 5.ª se guarda (201) y crea una alerta con los valores de la tabla de arriba y su fila `CREAR` de `alerta` en la bitácora;
   - la 4.ª y la 6.ª no crean alerta, y al final hay una sola por establecimiento y mes;
   - el 5.º de otro establecimiento u otro mes no crea alerta en este;
   - dos solicitudes en paralelo que serían la 5.ª y la 6.ª dejan una sola alerta.
4. **Detalle.** Agregar `solicitudesDelMes` en `leerSolicitud`. Probarlo en el mismo archivo y ajustar las pruebas de `rectificaciones.test.js` y `resolverRectificacion.test.js` que comparan la solicitud completa con `toEqual` (agregar el campo, sin cambiar lo que comprueban).
5. **Frontend, nueva solicitud.** Agregar `contarRectificacionesDelMes` en `api/rectificaciones.js` y el aviso en `PaginaNuevaRectificacion.jsx`. Pruebas en `PaginaNuevaRectificacion.test.jsx`:
   - con `cantidad: 4`, se ve «lleva 4 … esta será la 5.ª»;
   - con `cantidad: 3`, no se ve;
   - con el conteo fallido, no se ve y la solicitud se envía.

   Los mocks de `@/api/rectificaciones.js` de esa pantalla necesitan la función nueva.
6. **Frontend, detalle.** Agregar la línea del conteo en `PaginaDetalleRectificacion.jsx`. Pruebas en `PaginaDetalleRectificacion.test.jsx`:
   - con `cantidad: 3`, la línea normal;
   - con `cantidad: 5`, el aviso ámbar;
   - sin el campo, nada.
7. **Verificación manual** con la API real y Playwright, con el acceso rápido del login:
   - insertar por SQL 4 solicitudes `RECHAZADA` del mes actual sobre un reporte `CERRADO` de un establecimiento (por ejemplo, el reporte 897 de CS-1206);
   - con esa cuenta, en «Nueva rectificación», ver el aviso «esta será la 5.ª» y enviar;
   - comprobar en la base la alerta y su fila de bitácora;
   - como Revisor, ver el aviso ámbar en el detalle;
   - a 390 px, el aviso no desborda.

   Lo que quede en la base se anota en la nota de `CLAUDE.md`.
8. Notas en HU-50 y HU-52, la nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-E-control-rectificaciones.md`.

## Criterios de aceptación

- [ ] `GET /reportes/{id}/rectificaciones/conteo-del-mes` responde `{ anio, mes, cantidad, umbral: 5 }` con las solicitudes del establecimiento en el mes actual de Guatemala, en cualquier estado.
- [ ] Las solicitudes de otro mes o de otro establecimiento no cuentan, incluida una del último día del mes anterior después de las 18:00 de Guatemala.
- [ ] La 5.ª solicitud del mes de un establecimiento se guarda igual que las demás (201), sin ningún bloqueo para el usuario.
- [ ] Al guardarse la 5.ª se crea una fila en `alerta` con `tipo = 'PROCESO'`, `severidad = 'ADVERTENCIA'`, `rol_destino_id` del ADMINISTRADOR y el establecimiento, la DDRISS, el municipio, el periodo y el reporte correspondientes.
- [ ] La creación de la alerta deja una fila `CREAR` con entidad `alerta` en la bitácora, en la misma transacción.
- [ ] La 6.ª y las siguientes del mismo mes no crean otra alerta, tampoco dos solicitudes simultáneas.
- [ ] `GET /rectificaciones/{id}` trae `solicitudesDelMes` con el conteo del mes de esa solicitud.
- [ ] En «Nueva rectificación», el aviso «El establecimiento lleva 4 solicitudes de rectificación en noviembre; esta será la 5.ª» aparece cuando la nueva será la 5.ª o una posterior, y no aparece antes.
- [ ] Si el conteo falla, «Nueva rectificación» no muestra ningún error y la solicitud se envía.
- [ ] El detalle muestra siempre el conteo del mes, como aviso ámbar desde 5.
- [ ] Los colores del aviso salen de `--advertencia` / `--advertencia-foreground`.
- [ ] El contrato describe el endpoint nuevo y `solicitudesDelMes`, y la API arranca.
- [ ] Pasan `controlRectificaciones.test.js`, `rectificaciones.test.js`, `resolverRectificacion.test.js`, `PaginaNuevaRectificacion.test.jsx`, `PaginaDetalleRectificacion.test.jsx` y la suite del frontend.

## Decisiones

- **Sí:** endpoint propio para el conteo, que se pide antes de enviar. Así el aviso se ve antes de mandar la solicitud, como pide el documento E.
- **No:** el conteo en `GET /reportes/{id}`. Lo recibirían todas las pantallas que leen el reporte, sin usarlo.
- **No:** mostrar el conteo solo en el toast después de enviar. Llegaría tarde para quien solicita.
- **Sí:** el aviso a quien solicita solo desde la 5.ª. Por debajo del umbral no hay nada que avisar.
- **Sí:** el detalle muestra siempre el conteo, y en ámbar desde 5. A quien resuelve le sirve el contexto aunque no llegue al límite.
- **Sí:** el mes calendario de Guatemala. Con UTC, una solicitud del último día después de las 18:00 contaría en el mes siguiente.
- **No:** contar por el periodo del reporte rectificado. El documento E cuenta por la fecha de la solicitud.
- **Sí:** contar todas las solicitudes, también las rechazadas. Lo fija el documento E: lo que se mide es cuántas veces se pide.
- **Sí:** `solicitado_en` y `generada_en` tomados de `RELOJ`. El conteo y la fila guardada usan el mismo instante, y las pruebas fijan un mes propio (1999) sin chocar con las solicitudes reales de noviembre de 2026 ni con las de otros archivos de pruebas, que corren en paralelo.
- **Sí:** crear la alerta solo cuando el conteo es exactamente 5. Las solicitudes no se borran y el bloqueo las ordena, así que no hace falta buscar alertas anteriores en `alerta`.
- **No:** buscar si ya existe una alerta del mes. `periodo_id` puede ser `NULL` y no hay una columna que identifique el mes de la alerta.
- **Sí:** bloquear la fila de `establecimiento` (`FOR UPDATE`) durante la transacción. Es la única forma de que dos solicitudes simultáneas de reportes distintos no cuenten las dos 5 y creen dos alertas. No es un bloqueo del establecimiento para el usuario (aclaró Chris): dura lo que la transacción y nadie deja de poder hacer nada.
- **Sí:** severidad `ADVERTENCIA`, con el municipio y el reporte. El reporte de la 5.ª le da a HU-52 un enlace concreto. No es `CRITICA` porque no impide nada.
- **Sí:** la alerta en la bitácora, con `CREAR` y entidad `alerta` (regla 7: toda escritura se registra).
- **No:** una acción nueva en `ACCIONES`. `CREAR` con la entidad basta.
- **Sí:** umbral fijo en el backend (constante), como el «N días» de HU-50.
- **No:** un umbral configurable. Nadie lo pidió y exigiría un dato nuevo.
- **Sí:** reutilizar el permiso `RECTIFICACION_SOLICITAR` para el conteo. Quien puede solicitar puede saber cuántas lleva, y no hace falta tocar el 05.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El bloqueo de `establecimiento` espera a otra transacción que lo tenga (por ejemplo, editar el establecimiento) | La espera dura lo que tarde esa transacción. El orden reporte → establecimiento es el mismo en toda solicitud, así que dos solicitudes no se bloquean entre sí. |
| Si alguien cambia el umbral a uno menor con el mes ya pasado de ese número, ese mes no tiene alerta | Se acepta: el umbral es una decisión fija. Si cambia, se anota en `CLAUDE.md`. |
| Las pruebas que comparan la solicitud completa fallan por el campo nuevo | El paso 4 las ajusta agregando `solicitudesDelMes`, sin cambiar lo que comprueban. |
| La prueba manual deja solicitudes y una alerta reales en la base de prueba | Se anotan en la nota de `CLAUDE.md`, como en los specs anteriores. |

## Lo que **no** entra en este spec

- La pantalla o el ícono de alertas y marcarlas como atendidas (HU-52).
- Bloquear o frenar solicitudes desde la 5.ª.
- Un umbral configurable.
- El conteo en la lista de «Rectificaciones» o en el Inicio.
- Cambios a la base, los permisos, `transicion_estado` o `package.json`.

Cada uno, si llega, va en su propio spec.
