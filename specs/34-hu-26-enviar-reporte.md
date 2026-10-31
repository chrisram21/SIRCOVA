# SPEC 34 — Enviar el reporte a revisión

> **Estado:** Implementado
> **Historia:** HU-26
> **Depende de:** SPEC 04, SPEC 05, SPEC 22, SPEC 23, SPEC 25 y SPEC 33
> **Fecha:** 2026-10-30
> **Objetivo:** Que el Personal del establecimiento envíe a la DDRISS su reporte en borrador con `POST /reportes/{id}/transiciones`, que vuelve a validar lo guardado, rechaza el envío si quedan errores abiertos y deja el reporte en `ENVIADO`, sin edición.

## Por qué existe este spec

`backend/openapi.yaml` declara `POST /reportes/{id}/transiciones` (`estadoDestino`, `comentario`) como la única vía para cambiar el estado (regla 3 de `AGENTS.md`), pero no está implementado. La tabla `transicion_estado` (01) ya tiene las ocho transiciones por rol; la de este spec es `BORRADOR → ENVIADO` del rol `ESTABLECIMIENTO`, sin comentario obligatorio.

El SPEC 33 construyó el motor de validación (`validarReporte` de `modulos/produccion/validacion.service.js`) y el panel «Validación automática» de la captura, con la nota "Corrija los errores para poder enviar. Las advertencias no bloquean el envío.". Falta el botón y el envío.

Este spec construye el mecanismo **común** de las transiciones (revisar `transicion_estado` por rol, `historial_estado_reporte`, bitácora y `versionFila`), pero solo **habilita** el destino `ENVIADO`. HU-27, HU-28 y HU-29 agregan los suyos con sus efectos propios (`revisor_id`, `aprobado_por`, observaciones).

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Quedan visibles para el revisor»: las advertencias se envían tal cual y siguen `ABIERTO` en `resultado_validacion`. Mostrarlas al revisor es de HU-28, y justificarlas (`JUSTIFICADO`) queda fuera.
- «Ya no puedo editarlo»: lo garantiza lo que ya existe. El `PUT` de la captura, agregar o quitar una vacuna y validar responden 409 `REPORTE_NO_EDITABLE` fuera de `BORRADOR` (SPEC 23, 31 y 33), y la captura abre en «Solo consulta». Este spec lo comprueba con pruebas.

## Alcance

**Entra:**

- `POST /reportes/{id}/transiciones` con el cuerpo `{ estadoDestino, versionFila, comentario? }`, en un módulo nuevo `modulos/revision/`.
- El mecanismo común: el permiso según el destino (`PERMISO_POR_DESTINO`), la revisión contra `transicion_estado` por el rol del usuario, el `FOR UPDATE` del reporte, `versionFila`, una fila en `historial_estado_reporte` y una `CAMBIO_ESTADO` en la bitácora.
- Solo el destino `ENVIADO`; cualquier otro responde 422 `TRANSICION_NO_DISPONIBLE`.
- Al enviar: el motor del SPEC 33 sobre lo guardado, en la misma transacción. Con errores `ABIERTO`, 422 `REPORTE_CON_ERRORES` con la validación; sin errores, el reporte pasa a `ENVIADO` con `enviado_en`.
- Solo con el mes `ABIERTO` o `EN_CIERRE` (`MESES_EDITABLES`), sin bloqueo por `fecha_limite_envio`.
- El permiso `REPORTE_ENVIAR` (módulo `PRODUCCION`), solo para el Personal del establecimiento, en `05_permisos_mysql.sql`.
- Separar en `validacion.service.js` la parte de la corrida que recibe la conexión, para que el envío la reutilice.
- Separar en `middlewares/permisos.js` la revisión de un permiso (`revisarPermiso`), para que el servicio la use con el mismo 403 y la misma bitácora que `requierePermiso`.
- En la captura: el botón «Enviar a revisión» en la barra inferior, el diálogo de confirmación, el manejo del 422 y la recarga en «Solo consulta».
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-26, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Los demás destinos: asignar revisor y `EN_REVISION` (HU-27), pedir corrección y aprobar (HU-28), volver a `BORRADOR` desde `CORRECCION_SOLICITADA` (HU-29), cerrar y rectificar.
- `GET /reportes/{id}/historial` y `POST /reportes/{id}/observaciones`.
- Mostrar las advertencias al revisor o en la bandeja (HU-27, HU-28).
- Justificar advertencias (`JUSTIFICADO`, `justificacion`).
- Guardar y enviar en un solo clic.
- Un comentario del Personal al enviar (la pantalla no lo pide).
- Alertas de reportes atrasados o bloqueo por la fecha límite.
- Cambios en el Inicio o en «Mis reportes», que ya muestran el estado `ENVIADO`.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Lee `transicion_estado` y escribe en las tablas del 01 tal como están:

```sql
-- reporte_produccion: al pasar a ENVIADO
estado       = 'ENVIADO',
enviado_en   = NOW(),               -- se lee con UNIX_TIMESTAMP (nota del 2026-10-21)
version_fila = version_fila + 1

-- historial_estado_reporte: una fila por transición
reporte_id, estado_anterior = 'BORRADOR', estado_nuevo = 'ENVIADO',
usuario_id, comentario (NULL si no viene), fecha

-- resultado_validacion: lo escribe el motor del SPEC 33, también cuando el envío se rechaza
```

`transicion_estado` **no se modifica**: el backend la consulta con el estado actual, el destino y el `rol_id` del usuario.

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REPORTE_ENVIAR` | `PRODUCCION` | Enviar a revisión el reporte en borrador de su establecimiento | ESTABLECIMIENTO |

**Permiso según el destino** (`modulos/revision/transiciones.service.js`):

```js
// Cada spec de revisión agrega su destino; uno que no está aquí responde 422 TRANSICION_NO_DISPONIBLE.
const PERMISO_POR_DESTINO = { ENVIADO: 'REPORTE_ENVIAR' };
```

**Bitácora:** `MODULOS.REVISION`, `ACCIONES.CAMBIO_ESTADO` (ya existen), `entidad: 'reporte_produccion'`, con `valoresAnteriores: { estado: 'BORRADOR' }` y `valoresNuevos: { estado: 'ENVIADO', errores: 0, advertencias: N }`. Si el motor cambió resultados, la corrida deja además su fila `VALIDAR`, como en el SPEC 33.

**Respuesta 200:** el esquema `Reporte` del contrato (el mismo de `GET /reportes/{id}`), ya en `ENVIADO`.

**Respuesta 422 `REPORTE_CON_ERRORES`:** el formato común más la validación del SPEC 33:

```json
{
  "error": { "codigo": "REPORTE_CON_ERRORES", "mensaje": "El reporte tiene 2 errores de validación. Corríjalos para poder enviarlo." },
  "validacion": { "validadoEn": "…", "errores": 2, "advertencias": 1, "corregidos": 0, "resultados": [ … ] }
}
```

**Errores**, en el orden en que se revisan:

| Código HTTP | Código | Cuándo |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | id no entero positivo, `estadoDestino` fuera de `EstadoReporte`, `versionFila` ausente o no entera, `comentario` no texto o de más de 1000 caracteres, o claves de más |
| 422 | `TRANSICION_NO_DISPONIBLE` | el destino no está en `PERMISO_POR_DESTINO` |
| 403 | `SIN_PERMISO` | el usuario no tiene el permiso del destino, o es `AUTORIDAD` (con su fila `ACCESO_DENEGADO`) |
| 404 | `NO_ENCONTRADO` | el reporte no existe o no es del ámbito del usuario |
| 422 | `TRANSICION_NO_PERMITIDA` | no hay fila en `transicion_estado` para (estado actual, destino, rol) |
| 422 | `COMENTARIO_REQUERIDO` | la transición tiene `requiere_comentario` y no viene `comentario` (ninguna habilitada por ahora) |
| 409 | `PERIODO_CERRADO` | el mes no está `ABIERTO` ni `EN_CIERRE` |
| 409 | `REPORTE_DESACTUALIZADO` | `versionFila` no es la del reporte |
| 422 | `REPORTE_CON_ERRORES` | el motor deja resultados `ERROR` en `ABIERTO` |

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, en `POST /reportes/{id}/transiciones`: `x-permiso: REPORTE_ENVIAR` con la descripción del mapa por destino, `versionFila` requerido, `comentario` con `maxLength: 1000`, las respuestas 400, 403, 404, 409 y 422 con un ejemplo por cada error de la tabla, y el esquema `ErrorConValidacion` (el `Error` común más `validacion`, el esquema `Validacion` del SPEC 33). Comprobación: `/api/docs` carga sin errores y muestra la operación.

2. **Permiso.** En `05_permisos_mysql.sql`, un bloque "SPEC 34 (HU-26)" con `REPORTE_ENVIAR` (módulo `PRODUCCION`) asignado a ESTABLECIMIENTO. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token del Personal trae `REPORTE_ENVIAR` y el del Revisor no.

3. **Piezas reutilizables.**
   - En `middlewares/permisos.js`, `revisarPermiso(req, codigo)`, que hace lo de `requierePermiso` (bloqueo de `AUTORIDAD`, `ACCESO_DENEGADO` en la bitácora) y lanza el 403; `requierePermiso` la usa.
   - En `validacion.service.js`, separar de `validarReporte` la corrida con la conexión ya abierta y el reporte ya bloqueado (`corridaEnTransaccion(conexion, reporte, reglas, contexto)`), que devuelve la validación. `validarReporte` sigue igual por fuera.

   Comprobación: `npm test` del backend pasa completo sin cambiar `validacion.test.js` ni `permisos.test.js`.

4. **Backend: endpoint.** `modulos/revision/` con `revision.routes.js` (solo `autenticar`), `revision.controller.js` y `transiciones.service.js`, montado en `app.js`. El servicio revisa en el orden de la tabla de errores; desde el 404 todo va en una `enTransaccion` cuya primera consulta es el `SELECT … FOR UPDATE` del reporte (nota del 2026-10-23). Con errores, la transacción se confirma (quedan los resultados y su `VALIDAR`) y el controlador responde 422 con la validación; sin errores, actualiza el reporte, inserta el historial y la `CAMBIO_ESTADO`, y responde el `Reporte` con la lectura de `GET /reportes/{id}`. Las pruebas de `tests/transiciones.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes, los restos de corridas anteriores; los resultados de validación antes que los reportes):
   - en MySQL, por SQL: el año 2017 en `periodo` con sus filas de `cierre_periodo` de `DDRISS_SM`, la vacuna `ZVT_HU26` con su dosis y reportes de `CS-1201` en `BORRADOR`;
   - en MongoDB: un esquema `VIGENTE` de `ZVT_HU26` y una regla `ZVT_HU26_RANGO` de `DDRISS_SM` (`ERROR`) y otra de advertencia, con `aplica_a.vacunas` solo de `ZVT_HU26`;
   - el token se firma con `tokenDePrueba` para `cs1201`.

   Casos:
   - un reporte sin errores y con una advertencia pasa a `ENVIADO` con `enviado_en`, sube `versionFila`, deja una fila de historial `BORRADOR → ENVIADO` con el usuario y una `CAMBIO_ESTADO`; la advertencia sigue `ABIERTO`;
   - un reporte con un error responde 422 `REPORTE_CON_ERRORES` con `validacion.errores` mayor que 0, sigue en `BORRADOR` con la misma `versionFila`, y sus resultados quedan escritos;
   - después de enviarlo, el `PUT` de la captura, `POST …/vacunas` y `POST …/validar` responden 409 `REPORTE_NO_EDITABLE`, y enviarlo de nuevo responde 422 `TRANSICION_NO_PERMITIDA`;
   - una `versionFila` vieja responde 409 `REPORTE_DESACTUALIZADO`;
   - un mes `CERRADO` responde 409 `PERIODO_CERRADO`; uno `EN_CIERRE` deja enviar;
   - `estadoDestino: 'APROBADO'` responde 422 `TRANSICION_NO_DISPONIBLE`;
   - un reporte de otro establecimiento responde 404;
   - el Revisor de la semilla recibe 403 al pedir `ENVIADO` y queda su `ACCESO_DENEGADO`;
   - un cuerpo con claves de más o sin `versionFila` responde 400;
   - dos envíos en paralelo con la misma `versionFila`: uno pasa y el otro responde 409 o 422, con una sola fila de historial.

   Comprobación: `npm test` del backend pasa completo.

5. **Frontend: API y diálogo.** `src/api/revision.js` con `cambiarEstadoReporte(reporteId, { estadoDestino, versionFila })` por el cliente único, y `paginas/registro/DialogoEnviarReporte.jsx` (`AlertDialog`): título «¿Enviar a revisión?», el texto "Después de enviarlo ya no podrá editar el reporte." y, si hay advertencias, "Se enviará con N advertencias; la estadígrafa las verá.". Pruebas en `DialogoEnviarReporte.test.jsx`:
   - muestra el número de advertencias, y sin advertencias no muestra esa línea;
   - «Enviar» llama una vez y queda deshabilitado mientras espera;
   - «Cancelar» cierra sin llamar.

   Comprobación: la prueba pasa.

6. **Frontend: captura.** En `CapturaReporte.jsx`, el botón «Enviar a revisión» (principal, a la derecha de «Guardar borrador», que pasa a `outline`), visible solo con `REPORTE_ENVIAR` y fuera de «Solo consulta». Se habilita sin cambios sin guardar, sin guardar ni validar en curso y con la validación cargada sin errores. Deshabilitado, una nota dice el motivo: "Guarde los cambios antes de enviar." o "Corrija los errores para poder enviar.". Al confirmar:
   - 200: `toast.success('Reporte enviado a revisión.')` y se recarga el reporte, que abre en «Solo consulta» sin panel;
   - 422 `REPORTE_CON_ERRORES`: el panel toma la `validacion` del error, se cierra el diálogo y se muestra `AvisoError` con el mensaje;
   - 409 `REPORTE_DESACTUALIZADO` u otro error: `AvisoError` con `mensajeDeError(err)` y «Recargar reporte».

   Las pruebas existentes que hacen `vi.mock` de las APIs de la captura agregan `cambiarEstadoReporte`. Casos nuevos en `CapturaReporte.test.jsx`:
   - sin `REPORTE_ENVIAR` no se ve el botón;
   - con errores o con cambios sin guardar queda deshabilitado con su nota;
   - sin errores, confirmar llama con la `versionFila` del reporte y, al responder, se ve «Solo consulta»;
   - un 422 con validación actualiza el panel.

   Comprobación: `npm test` del frontend pasa completo.

7. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), como Personal del establecimiento, en un reporte en borrador de un mes abierto:
   - con un error abierto, el botón está deshabilitado con su nota;
   - corregir, guardar y ver el botón habilitado; con un cambio sin guardar, deshabilitado;
   - enviar con una advertencia: el diálogo la cuenta, el aviso de éxito aparece y el reporte abre en «Solo consulta»;
   - en «Mis reportes», el reporte aparece en «Enviado»;
   - revisar por SQL `reporte_produccion.estado` y `enviado_en`, la fila de `historial_estado_reporte`, la advertencia `ABIERTO` y la `CAMBIO_ESTADO` de la bitácora.

   Como Revisor: `POST /reportes/{id}/transiciones` con `ENVIADO` responde 403.

   Documentación:
   - en HU-26, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en `CONTEXTO BD.md`, que `enviado_en` y `historial_estado_reporte` los escribe la transición y que las advertencias viajan `ABIERTO`;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: `modulos/revision/`, `PERMISO_POR_DESTINO` (cada spec de revisión agrega su destino), `revisarPermiso`, `corridaEnTransaccion`, el 422 con `validacion` y los datos de prueba (año 2017, `ZVT_HU26*`).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `POST /reportes/{id}/transiciones` con `x-permiso: REPORTE_ENVIAR`, `versionFila` y sus errores, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan datos del año 2017 ni `ZVT_HU26…`.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Un reporte en `BORRADOR` sin errores `ABIERTO` pasa a `ENVIADO`, con `enviado_en`, una fila en `historial_estado_reporte` y una `CAMBIO_ESTADO` en la bitácora.
- [ ] Un reporte con errores `ABIERTO` después de validar lo guardado responde 422 `REPORTE_CON_ERRORES` con la validación y sigue en `BORRADOR`.
- [ ] Un reporte con advertencias se envía, y sus advertencias siguen `ABIERTO` en `resultado_validacion`.
- [ ] Después de enviarlo, guardar, agregar o quitar una vacuna y validar responden 409 `REPORTE_NO_EDITABLE`, y la captura lo abre en «Solo consulta».
- [ ] La transición se revisa contra `transicion_estado` por el rol del usuario: enviar un reporte que no está en `BORRADOR` responde 422 `TRANSICION_NO_PERMITIDA`.
- [ ] Un destino distinto de `ENVIADO` responde 422 `TRANSICION_NO_DISPONIBLE`.
- [ ] Sin `REPORTE_ENVIAR` responde 403; de otro establecimiento, 404; con `versionFila` vieja, 409; con el mes `CERRADO`, 409.
- [ ] «Enviar a revisión» solo se ve con `REPORTE_ENVIAR`, y está deshabilitado con cambios sin guardar o con errores, con su nota.
- [ ] El envío pide confirmación en un diálogo que cuenta las advertencias.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-26 tiene su avance y sus criterios marcados, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** el endpoint genérico `POST /reportes/{id}/transiciones` con el mecanismo común, pero solo el destino `ENVIADO` habilitado (decidido en la fase de preguntas). HU-27, HU-28 y HU-29 agregan sus destinos con sus efectos. **No:** habilitar las ocho transiciones solo con el cambio de estado, que deja `revisor_id` y `aprobado_por` vacíos; **no:** un `POST /reportes/{id}/enviar`, que contradice el contrato y la regla 3 de `AGENTS.md`.
- **Sí:** el permiso nuevo `REPORTE_ENVIAR`, solo para el Personal (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** reutilizar `REPORTE_EDITAR`; **no:** un `REPORTE_TRANSICIONAR` común, que no distingue quién hace qué.
- **Sí:** el permiso se revisa según el destino, en el servicio, con `PERMISO_POR_DESTINO` y la misma `revisarPermiso` de `requierePermiso` (decidido en la fase de preguntas). La ruta solo lleva `autenticar`. **No:** `requierePermiso('REPORTE_ENVIAR')` en la ruta, que HU-27 tendría que deshacer porque el Revisor no tiene ese permiso.
- **Sí:** además del permiso, la transición se revisa contra `transicion_estado` por el rol, como pide la regla 3 de `AGENTS.md`. El permiso dice qué puede pedir el usuario; la tabla, desde qué estado.
- **Sí:** las advertencias se envían tal cual y siguen `ABIERTO` (decidido en la fase de preguntas). **No:** justificación obligatoria u opcional, que pide UI y un endpoint propios.
- **Sí:** se envía con el mes `ABIERTO` o `EN_CIERRE`, sin bloqueo por `fecha_limite_envio` (decidido en la fase de preguntas): lo que se puede capturar se puede enviar, también tarde. **No:** solo `ABIERTO`; **no:** bloquear tras la fecha límite, que deja sin salida un reporte atrasado.
- **Sí:** con cambios sin guardar, el botón queda deshabilitado con una nota (decidido en la fase de preguntas): el backend envía lo guardado. **No:** guardar y enviar en cadena, que encadena varios fallos posibles.
- **Sí:** un diálogo de confirmación sin comentario (decidido en la fase de preguntas), porque el envío no se deshace. El backend acepta `comentario` opcional porque el endpoint es común y lo guarda en el historial, pero la pantalla no lo manda. **No:** enviar sin confirmar.
- **Sí:** el 422 `REPORTE_CON_ERRORES` lleva la validación, para actualizar el panel sin otra petición (decidido en la fase de preguntas). Los resultados de esa corrida quedan escritos. **No:** solo el mensaje, que pide volver a llamar a `/validar`.
- **Sí:** después de enviar, la captura se recarga en «Solo consulta» con un `toast.success` (decidido en la fase de preguntas). **No:** navegar a «Mis reportes».
- **Sí:** el botón en la barra inferior, junto a «Guardar borrador» (decidido en la fase de preguntas), siempre visible al bajar por las tablas. **No:** debajo del panel, como el mockup, que en pantallas angostas queda al final de la página.
- **Sí:** el envío valida en la misma transacción que cambia el estado, con el reporte bloqueado por `FOR UPDATE` como primera consulta, para que nadie guarde entre la validación y el envío. Decidido al escribir el spec. **No:** llamar a `validarReporte` y después cambiar el estado en otra transacción.
- **Sí:** `versionFila` obligatoria en el cuerpo, como en el `PUT` y en las vacunas del reporte (SPEC 23 y 31). Decidido al escribir el spec. Así no se envía un reporte que otra pestaña cambió.
- **Sí:** el módulo `modulos/revision/`, porque el contrato pone `/transiciones` en «Revisión» y HU-27 y HU-28 lo amplían. La bitácora usa `MODULOS.REVISION` y `ACCIONES.CAMBIO_ESTADO`, que ya existen. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2017 y la vacuna `ZVT_HU26` con reglas `ZVT_HU26_*` de `DDRISS_SM` solo para ella. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Separar `corridaEnTransaccion` cambia por dentro `validarReporte` | `validacion.test.js` no cambia y debe pasar completo en el paso 3. |
| Separar `revisarPermiso` cambia `requierePermiso`, que usan todos los endpoints | `permisos.test.js` no cambia y debe pasar completo en el paso 3. |
| Un envío confirma la transacción con errores para guardar los resultados y luego responde 422 | El servicio devuelve el rechazo y el controlador lanza el 422 **después** de confirmar; una prueba revisa que los resultados quedaron y el estado no cambió. |
| Un envío y un guardado del mismo reporte al mismo tiempo | El `FOR UPDATE` como primera consulta los ordena, y `versionFila` rechaza el que llega segundo. |
| HU-27 o HU-28 agregan un destino sin su permiso | `PERMISO_POR_DESTINO` responde 422 a lo que no está; la nota de `CLAUDE.md` dice que cada spec agrega su fila. |
| El permiso nuevo no llega al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Un envío no se deshace en la prueba manual | Usar un reporte de prueba o un mes real de prueba, nunca un reporte que el equipo esté usando; para volverlo a `BORRADOR`, solo por SQL con autorización. |

## Lo que **no** entra en este spec

- Los demás destinos de `/transiciones` (asignar, pedir corrección, aprobar, volver a borrador, cerrar, rectificar).
- El historial y las observaciones del reporte.
- Las advertencias a la vista del revisor y su justificación.
- Guardar y enviar en un clic, y un comentario del Personal.
- Alertas o bloqueos por la fecha límite.
- Cambios en el Inicio, en «Mis reportes», en `transicion_estado`, en el modelo o en las semillas.

Cada uno, si se hace, va en su propio spec.
