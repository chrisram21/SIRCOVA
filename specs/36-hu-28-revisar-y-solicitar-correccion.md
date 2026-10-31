# SPEC 36 — Revisar un reporte y solicitar corrección

> **Estado:** Implementado
> **Historia:** HU-28
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 23, SPEC 24, SPEC 25, SPEC 26, SPEC 33, SPEC 34 y SPEC 35
> **Fecha:** 2026-10-30
> **Objetivo:** Que el revisor asignado abra desde la bandeja el detalle de un reporte enviado, con sus cantidades y su validación, y lo devuelva al establecimiento con observaciones generales o por vacuna, lo que lo pasa a `CORRECCION_SOLICITADA`.

## Por qué existe este spec

La bandeja (SPEC 35) lista los reportes y los asigna, pero la fila no abre nada: el revisor no puede ver qué envió el establecimiento ni devolverlo. `POST /reportes/{id}/transiciones` (SPEC 34) tiene `PERMISO_POR_DESTINO` para que cada spec agregue su destino, y `transicion_estado` (01) ya tiene `EN_REVISION → CORRECCION_SOLICITADA` del rol `REVISOR` con `requiere_comentario`. La tabla `observacion_revision` existe desde el 01 y nadie la escribe; el contrato tiene un `POST /reportes/{id}/observaciones` provisional, sin implementar.

**Diferencias con la historia y el mockup** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Al devolverlo, el reporte vuelve a Borrador»: el revisor lo pasa a `CORRECCION_SOLICITADA`, como dice `transicion_estado`. Volver a `BORRADOR` es la transición del establecimiento (`CORRECCION_SOLICITADA → BORRADOR`, rol Establecimiento), que es de HU-29. Así el chip «Corrección solicitada» de la bandeja y la fila destacada de «Mis reportes» (SPEC 26) siguen teniendo sentido.
- La historia propone `POST /reportes/{id}/observaciones`. Las observaciones viajan en el cuerpo de la transición a `CORRECCION_SOLICITADA` y se guardan en la misma transacción, para que no queden observaciones sueltas de un reporte que después se aprueba. El `POST` provisional del contrato se reemplaza por un `GET` de lectura.
- Del panel de detalle de la pantalla 5 (`Revision.html`) entran el campo de observaciones y «Solicitar corrección», pero en una pantalla propia (`/revision/reportes/{id}`), no en un panel lateral. Las cifras «A residentes / A otros municipios», la advertencia de atribución y la mini gráfica de 6 meses quedan fuera. «Aprobar» es de HU-30.
- «Puedo escribir observaciones generales o por vacuna»: una general y una por vacuna como máximo en cada devolución. Las observaciones por celda (`detalle_id`) quedan fuera.

## Alcance

**Entra:**

- El destino `CORRECCION_SOLICITADA` en `POST /reportes/{id}/transiciones`, con el arreglo `observaciones` en el cuerpo, solo para el revisor asignado: escribe `observacion_revision`, el historial con su comentario y la `CAMBIO_ESTADO`, en una sola transacción.
- `GET /reportes/{id}/observaciones` (permiso `REPORTE_CONSULTAR`): las observaciones de todas las devoluciones del reporte, para el Personal de su establecimiento y el Revisor de su DDRISS. Reemplaza el `POST` provisional del contrato.
- `GET /reportes/{id}/validacion` (permiso `REPORTE_CONSULTAR`): los resultados guardados (`ABIERTO` y `JUSTIFICADO`) sin volver a correr el motor.
- El permiso nuevo `REPORTE_SOLICITAR_CORRECCION` (módulo `REVISION`) y `REPORTE_CONSULTAR` (ya existe) para el rol `REVISOR`, en `05_permisos_mysql.sql`.
- En el menú, «Registro de producción» y «Mis reportes» pasan a pedir `REPORTE_CREAR`, para que el Revisor no las vea al recibir `REPORTE_CONSULTAR`.
- La pantalla «Revisar reporte» en `/revision/reportes/:id` (`paginas/revision/PaginaRevisarReporte.jsx`), subruta de «Revisión y cierre»: el formulario de cada vacuna en solo consulta, la validación guardada, las observaciones anteriores y, para el revisor asignado de un reporte `EN_REVISION`, el formulario de observaciones con «Solicitar corrección».
- Las filas de la bandeja con un reporte enviado (de `ENVIADO` en adelante) abren esa pantalla.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright, devolviendo el reporte 524.
- Avance y criterios de HU-28, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Volver el reporte a `BORRADOR`, mostrar las observaciones junto a cada vacuna en la captura y marcarlas como atendidas (`atendida`, `atendida_en`): HU-29.
- Aprobar (HU-30) y cerrar el periodo.
- Observaciones por celda (`detalle_id`).
- Editar o borrar una observación ya enviada.
- Justificar advertencias (`JUSTIFICADO`, `justificacion`).
- Las cifras de atribución, la advertencia de procedencia y la mini gráfica del panel del mockup.
- Volver a correr la validación desde la revisión.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe las tablas del 01 tal como están:

```sql
-- reporte_produccion (EN_REVISION → CORRECCION_SOLICITADA); revisor_id y asignado_en no cambian
estado = 'CORRECCION_SOLICITADA', version_fila = version_fila + 1

-- observacion_revision: una fila por observación de la devolución
(reporte_id, reporte_vacuna_id /* NULL = general */, detalle_id /* siempre NULL */, usuario_id, texto)
-- atendida = FALSE y atendida_en = NULL por defecto: los cambia HU-29

-- historial_estado_reporte: la fila EN_REVISION → CORRECCION_SOLICITADA con su comentario
```

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REPORTE_SOLICITAR_CORRECCION` | `REVISION` | Devolver con observaciones los reportes en revisión que tiene asignados | REVISOR |
| `REPORTE_CONSULTAR` (ya existe) | `PRODUCCION` | Consultar los reportes mensuales de su ámbito | se agrega REVISOR |

`PERMISO_POR_DESTINO` (`modulos/revision/transiciones.service.js`) queda `{ ENVIADO: 'REPORTE_ENVIAR', EN_REVISION: 'REPORTE_ASIGNAR', CORRECCION_SOLICITADA: 'REPORTE_SOLICITAR_CORRECCION' }`.

### Devolver: `POST /reportes/{id}/transiciones`

```json
{
  "estadoDestino": "CORRECCION_SOLICITADA",
  "versionFila": 15,
  "observaciones": [
    { "vacunaId": null, "texto": "Revise la procedencia de las dosis de octubre." },
    { "vacunaId": 3, "texto": "Hexavalente D1 en menores de 1 año es muy alto frente a septiembre." }
  ]
}
```

- `observaciones` es obligatorio con `CORRECCION_SOLICITADA` y no se acepta con otro destino (400). `comentario` no se acepta con `CORRECCION_SOLICITADA` (400): el comentario del historial lo arma el backend.
- Cada observación: `vacunaId` entero positivo o `null` (general) y `texto` sin espacios a los lados, de 1 a 1000 caracteres. Como máximo una general y una por vacuna (repetida: 400). Claves de más: 400.
- Un arreglo vacío responde 422 `OBSERVACION_REQUERIDA` («Escriba al menos una observación para devolver el reporte.»).
- Un `vacunaId` que no está en `reporte_vacuna` del reporte responde 422 `VACUNA_NO_EN_REPORTE`.
- Solo el revisor asignado (`revisor_id` = el usuario) devuelve: otro revisor recibe 403 `NO_ES_REVISOR_ASIGNADO`, sin fila `ACCESO_DENEGADO` (como reasignar, SPEC 35). Se revisa dentro de la transacción, después de `transicion_estado`.
- Comentario del historial: el texto de la observación general; sin general, «N observaciones por vacuna: {nombres}», recortado a 1000 caracteres. Es lo que muestra «Mis reportes» en `correccion.comentario`.
- Bitácora: la `CAMBIO_ESTADO` del SPEC 34 con `valoresNuevos: { estado: 'CORRECCION_SOLICITADA', observaciones: [{ vacunaId, texto }] }`. Las filas de `observacion_revision` no dejan filas propias: van en esa.

Orden de los errores: los del SPEC 34 (400, 403 `SIN_PERMISO`, 404, 409 `REPORTE_DESACTUALIZADO`, 422 `TRANSICION_NO_PERMITIDA`), luego 403 `NO_ES_REVISOR_ASIGNADO`, luego 422 `OBSERVACION_REQUERIDA` y `VACUNA_NO_EN_REPORTE`.

### `GET /reportes/{id}/observaciones`

Permiso `REPORTE_CONSULTAR` y `verificarAlcance` (404 fuera de ámbito). Responde las observaciones del reporte, de la devolución más reciente a la más antigua y, dentro, la general primero y luego en el orden de las vacunas del reporte:

```json
[
  {
    "id": 31,
    "vacuna": { "id": 3, "codigo": "HEXA", "nombre": "Hexavalente" },
    "texto": "Hexavalente D1 en menores de 1 año es muy alto frente a septiembre.",
    "autor": { "id": 3, "nombre": "Ana Pérez" },
    "creadoEn": "2026-10-31T15:10:00.000Z",
    "atendida": false,
    "atendidaEn": null
  }
]
```

`vacuna` es `null` en una observación general o si su `reporte_vacuna` ya no existe (`ON DELETE SET NULL`). Fechas con `UNIX_TIMESTAMP` y `aFechaIso` (nota del 2026-10-21).

### `GET /reportes/{id}/validacion`

Permiso `REPORTE_CONSULTAR` y `verificarAlcance`. Responde el esquema `Validacion` del contrato con lo **guardado**: `resultados` son los `ABIERTO` y `JUSTIFICADO` de `resultado_validacion`, en el mismo orden que `POST /validar`, con `celdas: []` y `campos: []` (no se guardan); `validadoEn` es el `ejecutado_en` más reciente (o `null` sin resultados) y `corregidos` es 0. No escribe nada y responde igual en cualquier estado del reporte.

### Pantalla `/revision/reportes/:id`

Subruta de «Revisión y cierre» en `opcionesMenu.js`: `{ titulo: 'Revisar reporte', ruta: '/revision/reportes/:id', permiso: 'REPORTE_REVISAR', pagina }`. Usa `GET /reportes/{id}`, `GET /reportes/{id}/formulario`, `GET /reportes/{id}/validacion` y `GET /reportes/{id}/observaciones`.

| Parte | Contenido |
|---|---|
| Encabezado | `EncabezadoPagina` con el antetítulo «Revisión y cierre · {establecimiento}», el título «Reporte de {mes} de {año}», la insignia del estado, el revisor asignado y «Volver» a la bandeja con sus filtros (`state.volverA`). |
| Validación | La lista de errores y advertencias guardados, en solo lectura, sin «Validar reporte» (reutiliza `PanelValidacion` o su lista). |
| Observaciones anteriores | Las de `GET …/observaciones`, agrupadas por fecha de devolución, con autor y vacuna; sin ninguna, no se muestra. |
| Vacunas | Una pestaña por vacuna con `FormularioCaptura`, `TarjetaProcedencias` y `CamposAdicionales` en `soloLectura`. |
| Observaciones nuevas | Solo si el reporte está `EN_REVISION`, el usuario es el revisor asignado y tiene `REPORTE_SOLICITAR_CORRECCION`: un `Textarea` «Observación general» arriba de las pestañas y un `Textarea` «Observación sobre {vacuna}» en cada pestaña, con contador de 1000 caracteres. |
| Acción | «Solicitar corrección» (borde naranja, como el mockup): con todo vacío muestra «Escriba al menos una observación para devolver el reporte.»; si no, abre un `AlertDialog` con el resumen de lo que se envía y «Devolver al establecimiento». Al confirmar, `toast.success` y vuelve a la bandeja. |

- Con observaciones escritas sin enviar, `useAvisoCambiosSinGuardar` avisa al salir.
- Un 409 `REPORTE_DESACTUALIZADO` o un 422 `TRANSICION_NO_PERMITIDA` muestra el error encima de los botones con «Recargar», sin perder lo escrito.
- En la bandeja, las filas con `reporteId` y estado distinto de `BORRADOR` llevan el enlace al detalle (el nombre del establecimiento), con `state.volverA` = su búsqueda.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: el destino `CORRECCION_SOLICITADA` en `POST /reportes/{id}/transiciones` (`REPORTE_SOLICITAR_CORRECCION`, `observaciones`, y los errores `OBSERVACION_REQUERIDA`, `VACUNA_NO_EN_REPORTE` y `NO_ES_REVISOR_ASIGNADO`, con un ejemplo cada uno); `GET /reportes/{id}/observaciones` con el esquema `ObservacionRevision` en lugar del `POST` provisional; `GET /reportes/{id}/validacion` con el esquema `Validacion`. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 36 (HU-28)" con `REPORTE_SOLICITAR_CORRECCION` (módulo `REVISION`) y la asignación de `REPORTE_SOLICITAR_CORRECCION` y `REPORTE_CONSULTAR` a REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, el permiso nuevo queda solo en REVISOR y REVISOR tiene `REPORTE_CONSULTAR`.

3. **Backend: lectura.** `GET /reportes/{id}/observaciones` y `GET /reportes/{id}/validacion` en `modulos/produccion/` (rutas con `autenticar` + `requierePermiso('REPORTE_CONSULTAR')`); la validación guardada reutiliza lo que arma la respuesta de `validacion.service.js` sin correr el motor. Confirmar que `GET /reportes/{id}` y `GET /reportes/{id}/formulario` responden al Revisor de la DDRISS (alcance `DDRISS`) con `editable: false`. Pruebas en `tests/revisarReporte.test.js`, con el año 2014 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, un reporte de `CS-1201` con las vacunas `ZVT_HU28*`, resultados y observaciones por SQL), que se borran al inicio y al final (las observaciones y los resultados antes que el reporte):
   - el Revisor de la DDRISS lee el detalle, el formulario, la validación y las observaciones; el Personal de otro establecimiento recibe 404;
   - la validación guardada trae solo `ABIERTO` y `JUSTIFICADO`, en orden, con `celdas` y `campos` vacíos, y no escribe nada;
   - las observaciones salen en el orden descrito, con `vacuna: null` en la general.

   Comprobación: las pruebas nuevas pasan.

4. **Backend: devolver.** En `transiciones.service.js`, `CORRECCION_SOLICITADA` en `PERMISO_POR_DESTINO`, `observaciones` en `leerPedido` (obligatorio solo con ese destino, sin `comentario`) y su efecto dentro de la transacción: revisar el revisor asignado y las vacunas, insertar `observacion_revision`, armar el comentario del historial y agregar las observaciones a la `CAMBIO_ESTADO`. Pruebas en `tests/solicitarCorreccion.test.js` (año 2014 con otro establecimiento de la semilla, o en el mismo archivo de lectura si comparten datos; se envía y se asigna el reporte antes de cada caso):
   - devolver con una general y una por vacuna: `CORRECCION_SOLICITADA`, dos filas de `observacion_revision`, historial con el texto general, `versionFila` sube, `revisor_id` igual y la `CAMBIO_ESTADO` con las observaciones;
   - solo por vacuna: el comentario es «1 observaciones por vacuna: …» y `GET /reportes` del Personal trae ese `correccion.comentario`;
   - arreglo vacío: 422 `OBSERVACION_REQUERIDA`; sin `observaciones`, texto vacío o de 1001 caracteres, general repetida, `comentario` presente u `observaciones` con otro destino: 400; vacuna ajena al reporte: 422 `VACUNA_NO_EN_REPORTE`;
   - otro revisor: 403 `NO_ES_REVISOR_ASIGNADO` sin `ACCESO_DENEGADO`; el Personal: 403 `SIN_PERMISO`; un reporte `ENVIADO`: 422 `TRANSICION_NO_PERMITIDA`; `versionFila` vieja: 409;
   - un error no deja observaciones, historial ni bitácora.

   Comprobación: `npm test` del backend pasa completo.

5. **Frontend: API y menú.** En `src/api/revision.js`: `solicitarCorreccion(reporteId, { versionFila, observaciones })`; en el cliente de reportes, `listarObservaciones(reporteId)` y `obtenerValidacionGuardada(reporteId)`. En `opcionesMenu.js`, «Registro de producción» y «Mis reportes» pasan a `REPORTE_CREAR` y se agrega la subruta de «Revisión y cierre». Pruebas: el menú del Revisor (con `REPORTE_CONSULTAR`) no muestra esas dos opciones y el del Personal sí. Comprobación: las pruebas del menú pasan.

6. **Frontend: pantalla.** `paginas/revision/PaginaRevisarReporte.jsx` (y `DialogoSolicitarCorreccion.jsx`) según la tabla de la pantalla; en `PaginaBandejaRevision.jsx`, el enlace de las filas. Pruebas en `PaginaRevisarReporte.test.jsx` (con `createMemoryRouter`, nota del 2026-10-26) y en la de la bandeja:
   - carga el detalle, las vacunas en solo consulta, la validación y las observaciones anteriores; el error de carga con «Reintentar»;
   - el formulario de observaciones solo aparece al revisor asignado de un reporte `EN_REVISION`;
   - con todo vacío no llama a la API y muestra el mensaje; con observaciones, el diálogo resume y llama una vez con la `versionFila` y solo las no vacías; `toast.success` y vuelta a la bandeja;
   - el 409 con «Recargar» conserva lo escrito; el aviso de cambios sin guardar;
   - en la bandeja, las filas enviadas enlazan al detalle y las `BORRADOR` y «Sin reporte» no.

   Comprobación: `npm test` del frontend pasa completo.

7. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, como la estadígrafa (`estadigrafa`), revisora asignada del reporte 524 (CS-1209, octubre de 2026):
   - desde la bandeja, abrir el 524: se ven sus vacunas en solo consulta y la advertencia de `SECUENCIA_DOSIS`;
   - «Solicitar corrección» sin escribir muestra el mensaje; con una observación general y una de Hexavalente, el diálogo las resume y el reporte pasa a «Corrección solicitada» en la bandeja;
   - por SQL: `observacion_revision` (2 filas), el historial `EN_REVISION → CORRECCION_SOLICITADA` con el comentario y la `CAMBIO_ESTADO`;
   - como `cs1209`: «Mis reportes» destaca el 524 con el comentario; `GET /reportes/524/observaciones` trae las dos;
   - como `revisor2`: abre el 524 sin el formulario de observaciones; no ve «Registro de producción» ni «Mis reportes».

   El 524 queda en `CORRECCION_SOLICITADA` para probar HU-29.

   Documentación:
   - en HU-28, marcar los criterios y escribir su «Avance» con las diferencias de este spec, y una nota en HU-29 (volver a `BORRADOR` y mostrar las observaciones son suyos; el 524 queda listo);
   - en `CONTEXTO BD.md`, que `observacion_revision` la escribe la transición a `CORRECCION_SOLICITADA` (sin `detalle_id` por ahora) y cómo se arma el comentario del historial;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: `CORRECCION_SOLICITADA` en `PERMISO_POR_DESTINO` con `observaciones`, los dos `GET`, el menú con `REPORTE_CREAR`, la pantalla y los datos de prueba (año 2014, `ZVT_HU28*`).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta el destino `CORRECCION_SOLICITADA` con `observaciones` y sus errores, `GET /reportes/{id}/observaciones` (sin el `POST` provisional) y `GET /reportes/{id}/validacion`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan datos del año 2014.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] El revisor asignado devuelve un reporte `EN_REVISION` con observaciones generales o por vacuna: queda `CORRECCION_SOLICITADA` con sus filas en `observacion_revision`, una fila de historial con comentario y una `CAMBIO_ESTADO`, todo en una transacción.
- [ ] Sin al menos una observación responde 422 `OBSERVACION_REQUERIDA`, y la pantalla no deja enviar sin escribir.
- [ ] Otro revisor recibe 403 `NO_ES_REVISOR_ASIGNADO`, el Personal 403, y un reporte que no está `EN_REVISION` 422.
- [ ] El establecimiento ve las observaciones: `GET /reportes/{id}/observaciones` se las devuelve y «Mis reportes» muestra el comentario de la devolución.
- [ ] La pantalla de revisión muestra las vacunas en solo consulta, la validación guardada y las observaciones anteriores, y el formulario solo al revisor asignado de un reporte `EN_REVISION`.
- [ ] Las filas enviadas de la bandeja abren la revisión; las `BORRADOR` y «Sin reporte» no.
- [ ] El Revisor no ve «Registro de producción» ni «Mis reportes» en el menú.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-28 tiene su avance y sus criterios marcados, HU-29 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** el revisor deja el reporte en `CORRECCION_SOLICITADA`; volver a `BORRADOR` es del establecimiento en HU-29 (decidido en la fase de preguntas). **No:** dos transiciones seguidas en una, que rompe `transicion_estado` y deja vacío el chip «Corrección solicitada».
- **Sí:** las observaciones van en el cuerpo de la transición, en la misma transacción (decidido en la fase de preguntas). **No:** `POST /reportes/{id}/observaciones` aparte, que deja observaciones de reportes que luego se aprueban y pide dos pasos.
- **Sí:** una pantalla propia, `/revision/reportes/:id`, con el formulario de la captura en solo consulta (decidido en la fase de preguntas). **No:** el panel lateral del mockup, que no muestra las cantidades.
- **Sí:** solo el revisor asignado devuelve, con 403 `NO_ES_REVISOR_ASIGNADO` como al reasignar (decidido en la fase de preguntas). **No:** cualquier revisor de la DDRISS.
- **Sí:** dar `REPORTE_CONSULTAR` al Revisor y reutilizar `GET /reportes/{id}` y `/formulario` (decidido en la fase de preguntas). **No:** un endpoint de revisión que repita el formulario.
- **Sí:** «Registro de producción» y «Mis reportes» pasan a `REPORTE_CREAR` en el menú, para que el Revisor no las vea (decidido en la fase de preguntas). El backend no cambia sus permisos.
- **Sí:** la validación que ve el revisor es la guardada, con `GET /reportes/{id}/validacion` (decidido en la fase de preguntas). **No:** volver a correr el motor, que escribiría fuera de `BORRADOR` y podría cambiar lo que se envió.
- **Sí:** `GET /reportes/{id}/observaciones` para el Personal y el Revisor, y «Mis reportes» con el comentario del historial; mostrarlas junto a cada vacuna en la captura es de HU-29 (decidido en la fase de preguntas).
- **Sí:** el permiso nuevo `REPORTE_SOLICITAR_CORRECCION`, solo para REVISOR (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** reutilizar `REPORTE_REVISAR`.
- **Sí:** una observación general y una por vacuna como máximo, escritas en un `Textarea` general y uno por pestaña; sin observaciones por celda (decidido en la fase de preguntas).
- **Sí:** la pantalla muestra las observaciones de devoluciones anteriores en solo lectura (decidido en la fase de preguntas).
- **Sí:** abren la revisión las filas de `ENVIADO` en adelante; solo `EN_REVISION` del revisor asignado tiene el formulario (decidido en la fase de preguntas).
- **Sí:** la prueba manual devuelve el reporte 524 y lo deja listo para HU-29 (decidido en la fase de preguntas).
- **Sí:** el comentario del historial lo arma el backend (la general, o «N observaciones por vacuna: …») y `comentario` no se acepta con este destino, para que `requiere_comentario` se cumpla con una sola fuente. Decidido al escribir el spec.
- **Sí:** las observaciones van en la `CAMBIO_ESTADO`, sin filas propias en la bitácora. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2014 y las vacunas `ZVT_HU28*`, que no usa ningún otro archivo. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `GET /reportes/{id}/formulario` o `/reportes/{id}` suponen que el usuario es del establecimiento (procedencias, `editable`) | El paso 3 lo comprueba con el Revisor de la DDRISS antes de construir la pantalla; si algo falla, se ajusta el servicio sin cambiar su contrato. |
| Con `REPORTE_CONSULTAR`, el Revisor también puede usar `GET /reportes` de su DDRISS | Es lectura dentro de su alcance (`filtroAlcance`), sin pantalla; se anota en `CLAUDE.md`. |
| El permiso nuevo no llega al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Quitar una vacuna con observaciones en HU-29 | Sigue el 409 `VACUNA_CON_OBSERVACIONES` del SPEC 31; la decisión es de HU-29 (nota en la historia). |
| La devolución de la prueba manual no se deshace | Es lo que se quiere: el 524 queda para HU-29. Volverlo a `EN_REVISION` solo por SQL con autorización. |

## Lo que **no** entra en este spec

- Volver a `BORRADOR`, las observaciones en la captura y marcarlas atendidas (HU-29).
- Aprobar y cerrar el periodo.
- Observaciones por celda, editarlas o borrarlas.
- Justificar advertencias o volver a validar desde la revisión.
- Las cifras de atribución y la mini gráfica del mockup.
- Cambios al modelo, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
