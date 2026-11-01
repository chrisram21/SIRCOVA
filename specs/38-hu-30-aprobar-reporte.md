# SPEC 38 — Aprobar un reporte

> **Estado:** Implementado
> **Historia:** HU-30
> **Depende de:** SPEC 04, SPEC 05, SPEC 34, SPEC 35, SPEC 36 y SPEC 37
> **Fecha:** 2026-10-31
> **Objetivo:** Que el revisor asignado apruebe desde «Revisar reporte» un reporte `EN_REVISION`, con un comentario opcional, lo que lo pasa a `APROBADO` con `aprobado_por` y `aprobado_en` y una fila en el historial.

## Por qué existe este spec

La revisión (SPEC 36) solo permite devolver. `transicion_estado` (01) ya tiene `EN_REVISION → APROBADO` para el rol `REVISOR`, sin comentario, y `reporte_produccion` tiene `aprobado_por` y `aprobado_en`, que nadie escribe. `POST /reportes/{id}/transiciones` (SPEC 34) solo necesita el destino en `PERMISO_POR_DESTINO`. Las vistas de indicadores (`v_consolidado_establecimiento`) ya cuentan los reportes `APROBADO`.

**Diferencias con la historia y el mockup** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Solo puedo aprobar reportes En revisión asignados a mí o a mi DDRISS»: solo aprueba el revisor asignado, como al devolver (SPEC 36). Otro revisor de la DDRISS recibe 403 `NO_ES_REVISOR_ASIGNADO`; si hace falta, primero se reasigna (SPEC 35).
- La historia habla de la transición «APROBAR»: el destino es el estado `APROBADO`, como los demás destinos de `/transiciones`.
- «Aprobar» va solo en «Revisar reporte», junto a «Solicitar corrección», como el panel de la pantalla 5 (`Revision.html`), y confirma con un `AlertDialog` (`descripcion_pantallas.md`). No va en las filas de la bandeja.

## Alcance

**Entra:**

- El destino `APROBADO` en `POST /reportes/{id}/transiciones`, con el permiso nuevo `REPORTE_APROBAR`, solo para el revisor asignado: llena `aprobado_por` y `aprobado_en` y deja la fila de historial (con el `comentario` opcional) y la `CAMBIO_ESTADO`, en una sola transacción.
- El permiso `REPORTE_APROBAR` (módulo `REVISION`) para el rol `REVISOR`, en `05_permisos_mysql.sql`.
- En «Revisar reporte» (`PaginaRevisarReporte.jsx`): el botón «Aprobar» y el diálogo `DialogoAprobarReporte.jsx`, que cuenta las advertencias abiertas y pide un comentario opcional.
- Con observaciones escritas en la revisión, «Aprobar» queda deshabilitado con una nota que manda a «Solicitar corrección».
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright, aprobando el reporte 524.
- Avance y criterios de HU-30, una nota en HU-32 y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Corregir un reporte de un mes `CERRADO`: es la rectificación (`CERRADO → RECTIFICACION → CERRADO` en `transicion_estado`), de HU-32 y HU-33.
- Cerrar el periodo y pasar los aprobados a `CERRADO` (HU-31).
- Justificar advertencias (`JUSTIFICADO`, `justificacion`).
- Aprobar desde la bandeja o aprobar varios reportes a la vez.
- Deshacer una aprobación (no hay transición `APROBADO → EN_REVISION`).
- Mostrar `aprobado_por` y `aprobado_en` en `GET /reportes/{id}` o en las pantallas; la línea de tiempo del historial es de HU-34.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe las tablas del 01 tal como están:

```sql
-- reporte_produccion (EN_REVISION → APROBADO); revisor_id y asignado_en no cambian
estado = 'APROBADO', aprobado_por = <usuario>, aprobado_en = NOW(), version_fila = version_fila + 1

-- historial_estado_reporte: la fila EN_REVISION → APROBADO con el usuario, la fecha y el comentario (o NULL)
```

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REPORTE_APROBAR` | `REVISION` | Aprobar los reportes en revisión que tiene asignados | REVISOR |

`PERMISO_POR_DESTINO` (`modulos/revision/transiciones.service.js`) queda:

```js
{
  ENVIADO: 'REPORTE_ENVIAR',
  EN_REVISION: 'REPORTE_ASIGNAR',
  CORRECCION_SOLICITADA: 'REPORTE_SOLICITAR_CORRECCION',
  BORRADOR: 'REPORTE_EDITAR',
  APROBADO: 'REPORTE_APROBAR',
}
```

### Aprobar: `POST /reportes/{id}/transiciones`

```json
{ "estadoDestino": "APROBADO", "versionFila": 21, "comentario": "Cifras coherentes con septiembre." }
```

- `comentario` es opcional (hasta 1000 caracteres, como en los demás destinos) y va al historial. `observaciones` y `revisorId` responden 400.
- Solo el revisor asignado (`revisor_id` = el usuario): otro revisor recibe 403 `NO_ES_REVISOR_ASIGNADO`, sin fila `ACCESO_DENEGADO` (como devolver). El mensaje se generaliza a «Solo el revisor asignado puede hacer esto con el reporte.».
- No revisa el estado del mes (`cierre_periodo`): un reporte `EN_REVISION` se aprueba con el mes `ABIERTO` o `EN_CIERRE`, y uno de un mes `CERRADO` no debería existir.
- Las advertencias `ABIERTO` no impiden aprobar. Los errores no pueden quedar: el envío los bloquea (SPEC 34).
- Bitácora: la `CAMBIO_ESTADO` con `valoresAnteriores: { estado: 'EN_REVISION' }` y `valoresNuevos: { estado: 'APROBADO', advertencias: n }`, donde `n` son los resultados `ADVERTENCIA` en `ABIERTO` del reporte.
- Orden de los errores: los del SPEC 34 (400, 403 `SIN_PERMISO`, 404, 422 `TRANSICION_NO_PERMITIDA`, 409 `REPORTE_DESACTUALIZADO`) y luego 403 `NO_ES_REVISOR_ASIGNADO`.

Un reporte `APROBADO` ya no se edita: guardar, agregar o quitar una vacuna y validar exigen `BORRADOR` y responden 409 `REPORTE_NO_EDITABLE` (SPEC 23, 31 y 33), y la captura lo abre en «Solo consulta». Este spec solo lo comprueba.

### Pantalla «Revisar reporte»

| Parte | Contenido |
|---|---|
| Botón | «Aprobar» (azul marino, el `default` del tema) junto a «Solicitar corrección», solo si el reporte está `EN_REVISION`, el usuario es el revisor asignado y tiene `REPORTE_APROBAR`. |
| Con observaciones escritas | Si algún `Textarea` de observaciones tiene texto, «Aprobar» queda deshabilitado con la nota «Con observaciones, el reporte va a corrección: use «Solicitar corrección».» (ligada con `aria-describedby`). |
| Diálogo | `DialogoAprobarReporte.jsx` (`AlertDialog`): el título «¿Aprobar el reporte?», el texto «El reporte de {establecimiento} queda aprobado y ya no se puede editar.», con advertencias abiertas «Tiene N advertencias abiertas; se aprueba igual.», un `Textarea` «Comentario (opcional)» con contador de 1000 caracteres y «Aprobar» / «Cancelar». |
| Al terminar | `toast.success('Reporte aprobado.')` y vuelta a la bandeja con sus filtros (`state.volverA`). |
| Errores | Un 409 `REPORTE_DESACTUALIZADO` o un 422 `TRANSICION_NO_PERMITIDA` se muestran en el diálogo con «Recargar»; otro error, sin «Recargar». El diálogo sigue abierto. |

- Las advertencias salen de la validación guardada que la pantalla ya carga (`GET /reportes/{id}/validacion`, SPEC 36).
- Un reporte `APROBADO` se ve en la revisión sin el formulario de observaciones ni los botones, como cualquier estado que no es `EN_REVISION`.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, en `POST /reportes/{id}/transiciones`: el destino `APROBADO` (`REPORTE_APROBAR`, solo el revisor asignado, llena `aprobadoPor`/`aprobadoEn`, `advertencias` en la `CAMBIO_ESTADO`) con un ejemplo, `x-permiso` y el mensaje general de `NO_ES_REVISOR_ASIGNADO`. Comprobación: el YAML se lee bien y `/api/docs` carga sin errores.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 38 (HU-30)" con `REPORTE_APROBAR` (módulo `REVISION`) y su asignación a REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, el permiso existe y solo lo tiene REVISOR.

3. **Backend: aprobar.** En `transiciones.service.js`, `APROBADO: 'REPORTE_APROBAR'` en `PERMISO_POR_DESTINO`, la revisión del revisor asignado también para este destino (con el mensaje general), `aprobado_por = ?` y `aprobado_en = NOW()` en los cambios, y el conteo de advertencias `ABIERTO` en el resumen. Pruebas en `tests/aprobarReporte.test.js`, con el año 2012 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL), la vacuna `ZVT_HU30` con esquema nacional desde enero de 2012 y una regla `ZVT_HU30_AVISO` (`ADVERTENCIA`) de `DDRISS_SM`; cada reporte de `CS-1201` va por la API hasta `EN_REVISION` (crear, guardar, enviar y asignar a la estadígrafa), y todo se borra al inicio y al final:
   - el revisor asignado aprueba con comentario: `APROBADO`, `aprobado_por` y `aprobado_en`, `versionFila` sube, `revisor_id` igual, la fila `EN_REVISION → APROBADO` con el comentario y la `CAMBIO_ESTADO` con `advertencias: 1`; sin comentario, el historial queda con `NULL`;
   - aprobado, guardar, agregar o quitar una vacuna y validar responden 409 `REPORTE_NO_EDITABLE`, y volver a aprobar o devolver responde 422 `TRANSICION_NO_PERMITIDA`;
   - otro revisor (`revisor2`): 403 `NO_ES_REVISOR_ASIGNADO` sin `ACCESO_DENEGADO`; el Personal: 403 `SIN_PERMISO`; un reporte `ENVIADO`: 422; `versionFila` vieja: 409; `observaciones` o `revisorId` en el cuerpo: 400;
   - un error no deja historial ni bitácora, y `aprobado_por` sigue vacío.

   Comprobación: pasan `aprobarReporte.test.js` y las pruebas de los archivos que usan `transiciones.service.js` (`transiciones.test.js`, `revisarReporte.test.js` y `corregirReporte.test.js`). La suite completa del backend no se corre en este spec.

4. **Frontend: API y diálogo.** En `src/api/revision.js`, `aprobarReporte(reporteId, { versionFila, comentario })` sobre la transición (sin `comentario` si está vacío). `paginas/revision/DialogoAprobarReporte.jsx` según la tabla de la pantalla. Pruebas en `DialogoAprobarReporte.test.jsx`:
   - el texto con y sin advertencias abiertas;
   - confirmar llama una vez con la `versionFila` y el comentario recortado, o sin comentario si está vacío; mientras envía, los botones quedan deshabilitados;
   - el 409 con «Recargar» y un error sin «Recargar», con el diálogo abierto.

   Comprobación: las pruebas del diálogo pasan.

5. **Frontend: pantalla.** En `PaginaRevisarReporte.jsx`, el botón «Aprobar», la nota con observaciones escritas, el diálogo, el `toast.success` y la vuelta a la bandeja (sin el aviso de cambios sin guardar). Pruebas en `PaginaRevisarReporte.test.jsx`:
   - «Aprobar» solo aparece al revisor asignado de un reporte `EN_REVISION` con `REPORTE_APROBAR`;
   - con texto en una observación queda deshabilitado con su nota, y al borrarlo se habilita;
   - aprobar muestra el toast y vuelve a la bandeja con sus filtros;
   - un reporte `APROBADO` no muestra los botones ni el formulario.

   Comprobación: `npm test` del frontend pasa completo.

6. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, sobre el reporte 524 (CS-1209, octubre de 2026), que quedó `EN_REVISION` con la estadígrafa:
   - como `revisor2`: abre el 524 sin «Aprobar» (no es el asignado);
   - como `estadigrafa`: en «Revisar reporte», escribir una observación deshabilita «Aprobar» con su nota; al borrarla se habilita; el diálogo dice cuántas advertencias hay; se aprueba con un comentario y la bandeja muestra el 524 en «Aprobado»;
   - por SQL: `APROBADO` con `aprobado_por` = la estadígrafa y `aprobado_en`, la fila `EN_REVISION → APROBADO` con el comentario y la `CAMBIO_ESTADO`;
   - como `cs1209`: «Mis reportes» muestra «Aprobado» y la captura abre en «Solo consulta».

   El 524 queda `APROBADO`, para probar HU-31.

   Documentación:
   - en HU-30, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-32, una nota: corregir las cantidades de un reporte de un mes `CERRADO` (lo que notifique la DDRISS meses después) es la rectificación, no una devolución, porque aprobar y devolver solo existen antes del cierre;
   - en `CONTEXTO BD.md`, que `aprobado_por` y `aprobado_en` los escribe la transición a `APROBADO`;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: `APROBADO: 'REPORTE_APROBAR'`, solo el revisor asignado, sin revisar el mes, `advertencias` en la bitácora, la nota de la pantalla y los datos de prueba (año 2012, `ZVT_HU30`).

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta el destino `APROBADO` y `/api/docs` carga sin errores.
- [x] En `backend/` pasan `aprobarReporte.test.js`, `transiciones.test.js`, `revisarReporte.test.js` y `corregirReporte.test.js`, y `npm test` pasa completo en `frontend/`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2012.
- [x] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [x] El revisor asignado aprueba un reporte `EN_REVISION`: queda `APROBADO` con `aprobado_por`, `aprobado_en`, una fila de historial con el usuario, la fecha y el comentario (o `NULL`) y una `CAMBIO_ESTADO`, todo en una transacción.
- [x] Otro revisor recibe 403 `NO_ES_REVISOR_ASIGNADO`, el Personal 403 y un reporte que no está `EN_REVISION` 422.
- [x] Un reporte `APROBADO` responde 409 `REPORTE_NO_EDITABLE` al guardar, agregar o quitar vacunas y validar, y la captura lo abre en «Solo consulta».
- [x] «Aprobar» solo aparece al revisor asignado de un reporte `EN_REVISION` y queda deshabilitado, con su nota, mientras haya observaciones escritas.
- [x] El diálogo cuenta las advertencias abiertas y manda el comentario solo si se escribió.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] HU-30 tiene su avance y sus criterios marcados, HU-32 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** solo el revisor asignado aprueba, con 403 `NO_ES_REVISOR_ASIGNADO` como al devolver (decidido en la fase de preguntas). **No:** cualquier revisor de la DDRISS, como dice la historia, que dejaría distintas las dos salidas de la revisión.
- **Sí:** el permiso nuevo `REPORTE_APROBAR`, solo para REVISOR (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** reutilizar `REPORTE_SOLICITAR_CORRECCION` o `REPORTE_REVISAR`, que no describen la acción.
- **Sí:** se aprueba con advertencias abiertas y el diálogo las cuenta (decidido en la fase de preguntas). **No:** exigir justificarlas, que está fuera de alcance.
- **Sí:** comentario opcional en el diálogo, que va al historial (decidido en la fase de preguntas). **No:** obligatorio, que contradice `requiere_comentario = FALSE` de `transicion_estado`.
- **Sí:** «Aprobar» solo en «Revisar reporte», después de ver las cantidades (decidido en la fase de preguntas). **No:** en las filas de la bandeja.
- **Sí:** con observaciones escritas, «Aprobar» queda deshabilitado con una nota que manda a «Solicitar corrección»: si hay observaciones, algo está mal y el reporte va a corrección (decidido en la fase de preguntas). **No:** aprobar y descartar lo escrito.
- **Sí:** aprobar no revisa el estado del mes (decidido en la fase de preguntas). Corregir un reporte de un mes `CERRADO` es la rectificación de HU-32 y HU-33, con su nota en HU-32.
- **Sí:** la prueba manual aprueba el 524 y lo deja `APROBADO` para HU-31 (decidido en la fase de preguntas).
- **Sí:** el mensaje de `NO_ES_REVISOR_ASIGNADO` se generaliza, porque ahora lo usan devolver y aprobar. Decidido al escribir el spec.
- **Sí:** la `CAMBIO_ESTADO` lleva `advertencias` (las abiertas al aprobar), como la del envío. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2012, la vacuna `ZVT_HU30` y la regla `ZVT_HU30_AVISO`, que no usa ningún otro archivo. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El permiso nuevo no llega al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Cambiar el mensaje de `NO_ES_REVISOR_ASIGNADO` rompe una prueba que lo compara | El paso 3 corre `revisarReporte.test.js` y `transiciones.test.js`; si alguna compara el texto, se ajusta al mensaje nuevo. |
| La aprobación de la prueba manual no se deshace | Es lo que se quiere: el 524 queda para HU-31. Volverlo atrás solo por SQL con autorización. |

## Lo que **no** entra en este spec

- Corregir reportes de meses cerrados (rectificación, HU-32 y HU-33).
- Cerrar el periodo (HU-31).
- Justificar advertencias.
- Aprobar desde la bandeja o en lote, y deshacer una aprobación.
- Mostrar quién aprobó y cuándo fuera del historial.
- Cambios al modelo, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
