# SPEC 37 — Corregir y reenviar un reporte devuelto

> **Estado:** Implementado
> **Historia:** HU-29
> **Depende de:** SPEC 23, SPEC 25, SPEC 26, SPEC 31, SPEC 33, SPEC 34, SPEC 35 y SPEC 36
> **Fecha:** 2026-10-31
> **Objetivo:** Que el Personal del establecimiento vea las observaciones de la última devolución junto a cada vacuna, vuelva el reporte a Borrador con «Corregir reporte», lo corrija y lo reenvíe, y que al reenviar se valide de nuevo y las observaciones queden atendidas.

## Por qué existe este spec

Con el SPEC 36 el revisor deja el reporte en `CORRECCION_SOLICITADA` con sus observaciones en `observacion_revision`, pero el establecimiento solo ve el comentario en «Mis reportes». La captura abre ese reporte en «Solo consulta» y no hay forma de volver a editarlo. `transicion_estado` (01) ya tiene `CORRECCION_SOLICITADA → BORRADOR` para el rol Establecimiento, sin comentario. `POST /reportes/{id}/transiciones` (SPEC 34) solo necesita el destino en `PERMISO_POR_DESTINO`.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Al reenviar se repiten las validaciones»: el envío ya valida lo guardado en su transacción (SPEC 34), y la captura ya pide «Validar reporte» antes de enviar (ajuste después del SPEC 34). Este spec solo comprueba que siga pasando con un reporte corregido.
- «El historial guarda cada envío y cada devolución»: `historial_estado_reporte` ya lo guarda en cada transición. Este spec lo comprueba en las pruebas. Mostrar la línea de tiempo (`GET /reportes/{id}/historial`) es de HU-34.
- La historia no dice qué hacer con `atendida` y `atendida_en`: al reenviar, las observaciones pendientes del reporte quedan atendidas.

## Alcance

**Entra:**

- El destino `BORRADOR` en `POST /reportes/{id}/transiciones` (permiso `REPORTE_EDITAR`, ya lo tiene el Personal), con el mes en `MESES_EDITABLES`. `revisor_id` y `asignado_en` no cambian.
- Al reenviar (`ENVIADO`), las observaciones con `atendida = FALSE` del reporte pasan a `atendida = TRUE` con `atendida_en = NOW()`, en la misma transacción y solo si el envío pasa.
- En la captura (`CapturaReporte.jsx`), con el reporte en `CORRECCION_SOLICITADA`: un aviso «Devuelto para corrección» con el botón «Corregir reporte».
- En la captura, en `CORRECCION_SOLICITADA` y en `BORRADOR`: las observaciones pendientes (las de la última devolución), la general arriba de las pestañas y la de cada vacuna dentro de su pestaña, con una marca en la pestaña.
- En el Borrador corregido se editan las cantidades y se agregan y quitan vacunas, como en cualquier Borrador. Quitar una vacuna con observaciones sigue respondiendo 409 `VACUNA_CON_OBSERVACIONES`.
- En la bandeja, `DialogoAsignarRevisor` preselecciona al revisor que tenía el reporte cuando se reenvía, y lo indica.
- En «Revisar reporte» (SPEC 36), las observaciones anteriores muestran si están atendidas y cuándo.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright, corrigiendo y reenviando el reporte 524.
- Avance y criterios de HU-29, notas en HU-31 y HU-34, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Abrir desde Registro y «Mis reportes» un reporte devuelto de un mes `EN_CIERRE`: HU-31, que trae el paso automático de `ABIERTO` a `EN_CIERRE` y cuyo criterio dice que «los que están en revisión o devueltos siguen su ciclo». Hoy Registro solo carga meses `ABIERTO`.
- `GET /reportes/{id}/historial` y la línea de tiempo de estados: HU-34.
- Mostrar en la captura las observaciones de devoluciones anteriores (la revisión ya las muestra).
- Marcar a mano cada observación como atendida.
- Observaciones por celda (`detalle_id`).
- Aprobar (HU-30) y cerrar el periodo.
- Justificar advertencias.
- Cambios al modelo de datos, a los permisos (`05_permisos_mysql.sql`), a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo ni los permisos**. Escribe las tablas del 01 tal como están:

```sql
-- Corregir: reporte_produccion (CORRECCION_SOLICITADA → BORRADOR); revisor_id y asignado_en no cambian
estado = 'BORRADOR', version_fila = version_fila + 1

-- Reenviar: además de lo del SPEC 34 (estado, enviado_en, validación), en la misma transacción
UPDATE observacion_revision SET atendida = TRUE, atendida_en = NOW()
 WHERE reporte_id = ? AND atendida = FALSE

-- historial_estado_reporte: una fila por cada transición, como siempre
```

`PERMISO_POR_DESTINO` (`modulos/revision/transiciones.service.js`) queda:

```js
{
  ENVIADO: 'REPORTE_ENVIAR',
  EN_REVISION: 'REPORTE_ASIGNAR',
  CORRECCION_SOLICITADA: 'REPORTE_SOLICITAR_CORRECCION',
  BORRADOR: 'REPORTE_EDITAR',
}
```

### Corregir: `POST /reportes/{id}/transiciones`

```json
{ "estadoDestino": "BORRADOR", "versionFila": 16 }
```

- `comentario` es opcional, como en `ENVIADO`; la pantalla no lo manda. `observaciones` y `revisorId` responden 400, como con los otros destinos.
- Con el mes fuera de `MESES_EDITABLES` responde 409 `PERIODO_CERRADO`, la misma revisión que hace `ENVIADO`.
- Orden de los errores: los del SPEC 34 (400, 403 `SIN_PERMISO`, 404, 422 `TRANSICION_NO_PERMITIDA`, 409 `PERIODO_CERRADO`, 409 `REPORTE_DESACTUALIZADO`).
- Bitácora: la `CAMBIO_ESTADO` con `valoresAnteriores: { estado: 'CORRECCION_SOLICITADA' }` y `valoresNuevos: { estado: 'BORRADOR' }`.
- Un reporte en otro estado responde 422 `TRANSICION_NO_PERMITIDA` (por ejemplo, uno `ENVIADO` o uno que ya volvió a `BORRADOR`).

### Reenviar

Es el mismo `ENVIADO` del SPEC 34. Si el envío pasa, marca las observaciones pendientes y, si marcó alguna, la `CAMBIO_ESTADO` lleva `observacionesAtendidas: n` en `valoresNuevos`, junto a `errores` y `advertencias`. Con errores de validación responde 422 `REPORTE_CON_ERRORES` como siempre, y las observaciones siguen pendientes. Un primer envío no tiene observaciones y no cambia.

### Captura (`/registro?periodo=`)

`CapturaReporte.jsx` pide `GET /reportes/{id}/observaciones` (SPEC 36) cuando el reporte está en `CORRECCION_SOLICITADA` o en `BORRADOR`, y se queda con las de `atendida: false`. Como el reenvío las marca, las pendientes son siempre las de la última devolución.

| Parte | Contenido |
|---|---|
| Aviso de devolución | Solo en `CORRECCION_SOLICITADA`, en lugar del aviso «Solo consulta»: `Alert` con los colores `--advertencia`, el título «Devuelto para corrección», el texto «{revisor} devolvió el reporte el {fecha}. Revise las observaciones y corríjalo.» y, si el usuario tiene `REPORTE_EDITAR`, el botón «Corregir reporte». |
| Observación general | Arriba de las pestañas: «Observación del revisor» con el texto, el autor y la fecha. Sin observación general, no se muestra. |
| Observación por vacuna | Dentro de la pestaña de la vacuna, arriba del formulario, con el mismo formato. La pestaña lleva un ícono de `lucide-react` con texto oculto «Tiene observaciones». |
| Error de carga | Si falla `GET …/observaciones`, `AvisoError` con «Reintentar»; el formulario se sigue viendo. |

- «Corregir reporte» llama a la transición con la `versionFila` del reporte, sin diálogo de confirmación. Al terminar, `toast.success('El reporte volvió a Borrador. Ya puede corregirlo.')` y se recargan el detalle y el formulario, que llegan con `editable: true`. Mientras se envía, el botón queda deshabilitado con «Abriendo…».
- Un 409 `REPORTE_DESACTUALIZADO` o un 422 `TRANSICION_NO_PERMITIDA` muestra el error en el aviso con «Recargar reporte».
- En el Borrador corregido todo sigue como en el SPEC 34: «Validar reporte», guardar, agregar y quitar vacunas, y «Enviar a revisión». Las observaciones pendientes siguen a la vista hasta reenviar.

### Bandeja y revisión

- `DialogoAsignarRevisor.jsx`, al asignar un reporte `ENVIADO` que ya tiene `revisor`: si es otro revisor y está en la lista, queda elegido en el Select; si es el propio usuario, nada queda elegido y aparece la nota «Usted revisó este reporte antes.». En los dos casos se lee «Lo revisó antes: {nombre}.». Reasignar (`EN_REVISION`) no cambia.
- `PaginaRevisarReporte.jsx`, en «Observaciones anteriores»: cada observación atendida lleva «Atendida el {fecha y hora}».

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, en `POST /reportes/{id}/transiciones`: el destino `BORRADOR` (`REPORTE_EDITAR`, solo desde `CORRECCION_SOLICITADA`, 409 `PERIODO_CERRADO` con el mes fuera de `ABIERTO`/`EN_CIERRE`) con un ejemplo, y en `ENVIADO`, que marca atendidas las observaciones pendientes. En `GET /reportes/{id}/observaciones`, que `atendida` y `atendidaEn` cambian al reenviar. Comprobación: `/api/docs` carga sin errores y muestra los cambios.

2. **Backend: corregir.** En `transiciones.service.js`, `BORRADOR` en `PERMISO_POR_DESTINO` y la revisión del mes en `MESES_EDITABLES` también para ese destino. Pruebas en `tests/corregirReporte.test.js`, con el año 2013 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, un reporte de `CS-1201` con las vacunas `ZVT_HU29*`), que se borran al inicio y al final (observaciones, resultados e historial antes que el reporte). Cada caso lleva el reporte por SQL o por la API hasta `CORRECCION_SOLICITADA`:
   - el Personal corrige: `BORRADOR`, `versionFila` sube, `revisor_id` y `asignado_en` iguales, la fila `CORRECCION_SOLICITADA → BORRADOR` del historial y la `CAMBIO_ESTADO`;
   - después, guardar con `PUT /reportes/{id}/vacunas/{vacunaId}`, agregar y quitar una vacuna sin observaciones funcionan, y quitar una con observaciones responde 409 `VACUNA_CON_OBSERVACIONES`;
   - el Revisor recibe 403 `SIN_PERMISO`; un reporte `ENVIADO` o ya en `BORRADOR`, 422 `TRANSICION_NO_PERMITIDA`; `versionFila` vieja, 409; el mes `CERRADO`, 409 `PERIODO_CERRADO`; `observaciones` en el cuerpo, 400;
   - un error no deja historial ni bitácora.

   Comprobación: las pruebas nuevas pasan.

3. **Backend: reenviar.** En el bloque `enviar` de `cambiarEstado`, después de comprobar que no hay errores, el `UPDATE` de `observacion_revision` y `observacionesAtendidas` en el resumen si es mayor que 0. Pruebas en el mismo archivo:
   - reenviar un reporte corregido sin errores: `ENVIADO`, las observaciones con `atendida` y `atendidaEn` en `GET …/observaciones`, `observacionesAtendidas` en la `CAMBIO_ESTADO` y `revisor_id` igual;
   - reenviar con errores: 422 `REPORTE_CON_ERRORES`, las observaciones siguen pendientes y los resultados de la corrida quedan escritos;
   - el ciclo completo (enviar, asignar, devolver, corregir, reenviar) deja en orden las filas `NULL → BORRADOR`, `BORRADOR → ENVIADO`, `ENVIADO → EN_REVISION`, `EN_REVISION → CORRECCION_SOLICITADA`, `CORRECCION_SOLICITADA → BORRADOR` y `BORRADOR → ENVIADO`;
   - una segunda devolución tiene sus propias observaciones pendientes y las de la primera siguen atendidas.

   Comprobación: pasan `corregirReporte.test.js` y las pruebas de los archivos que usan `transiciones.service.js` (`transiciones.test.js` y `revisarReporte.test.js`), con `npx vitest run tests/corregirReporte.test.js tests/transiciones.test.js tests/revisarReporte.test.js`. La suite completa del backend no se corre en este spec.

4. **Frontend: API.** En `src/api/revision.js`, `corregirReporte(reporteId, { versionFila })` sobre la transición. Comprobación: la usan las pruebas del paso 5.

5. **Frontend: captura.** En `CapturaReporte.jsx` (o en un componente propio en `paginas/registro/`, por ejemplo `ObservacionesRevisor.jsx`), el aviso de devolución con «Corregir reporte» y las observaciones pendientes según la tabla de la captura. Pruebas en `CapturaReporte.test.jsx`:
   - en `CORRECCION_SOLICITADA`: el aviso con el revisor y la fecha, la observación general, la de la vacuna en su pestaña y la marca de la pestaña; sin `REPORTE_EDITAR`, sin el botón;
   - «Corregir reporte» llama una vez con la `versionFila`, muestra el `toast.success` y vuelve a pedir el detalle y el formulario; el formulario queda editable y las observaciones siguen a la vista;
   - el 409 muestra el error con «Recargar reporte»;
   - en un `BORRADOR` sin observaciones pendientes no se ve nada nuevo, y el error de `GET …/observaciones` muestra «Reintentar».

   Comprobación: las pruebas de la captura pasan.

6. **Frontend: bandeja y revisión.** La preselección y las notas de `DialogoAsignarRevisor.jsx` y «Atendida el …» en `PaginaRevisarReporte.jsx`. Pruebas en sus archivos:
   - un reporte `ENVIADO` con otro revisor lo trae elegido y con la nota; con el propio usuario, nada elegido y «Usted revisó este reporte antes.»; uno sin revisor, como siempre;
   - una observación atendida muestra la fecha y una pendiente no.

   Comprobación: `npm test` del frontend pasa completo.

7. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, sobre el reporte 524 (CS-1209, octubre de 2026), que quedó en `CORRECCION_SOLICITADA` con una observación general y una de Hexavalente:
   - como `cs1209`: «Mis reportes» destaca el 524; al abrirlo se ven el aviso, la observación general arriba y la de Hexavalente en su pestaña, con la marca;
   - «Corregir reporte»: el formulario queda editable y las observaciones siguen; se cambia una casilla, se guarda, se valida y se reenvía;
   - por SQL: el 524 `ENVIADO` con el mismo `revisor_id`, las dos observaciones atendidas con `atendida_en`, las filas del historial `CORRECCION_SOLICITADA → BORRADOR` y `BORRADOR → ENVIADO`, y las dos `CAMBIO_ESTADO` (la del reenvío con `observacionesAtendidas: 2`);
   - como `estadigrafa`: en la bandeja, el 524 aparece «Enviado» con su revisor; al asignar se lee «Usted revisó este reporte antes.» y se usa «Asignármelo»; en «Revisar reporte», las observaciones anteriores dicen «Atendida el …».

   El 524 queda `EN_REVISION` con la estadígrafa, para probar HU-30.

   Documentación:
   - en HU-29, marcar los criterios y escribir su «Avance» con las diferencias de este spec, y resolver la nota del SPEC 31 (en el Borrador corregido se agregan y quitan vacunas; quitar una con observaciones sigue con 409);
   - en HU-31, una nota: Registro y «Mis reportes» solo abren meses `ABIERTO`, así que un reporte devuelto en un mes `EN_CIERRE` no se puede corregir desde la pantalla, aunque el backend sí lo permite; esta historia debe resolverlo al pasar los meses a `EN_CIERRE`;
   - en HU-34, una nota: el historial ya guarda cada envío, devolución y corrección (comprobado en `corregirReporte.test.js`), y `GET /reportes/{id}/historial` sigue provisional en el contrato;
   - en `CONTEXTO BD.md`, que `atendida` y `atendida_en` los escribe el reenvío;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: `BORRADOR: 'REPORTE_EDITAR'` en `PERMISO_POR_DESTINO`, el reenvío marca atendidas, las pendientes son las de la última devolución, la preselección del revisor y los datos de prueba (año 2013, `ZVT_HU29*`).

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta el destino `BORRADOR` y que el reenvío marca atendidas las observaciones, y `/api/docs` carga sin errores.
- [x] En `backend/` pasan `corregirReporte.test.js`, `transiciones.test.js` y `revisarReporte.test.js`, y `npm test` pasa completo en `frontend/`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2013.
- [x] `frontend/package.json`, `backend/package.json` y `backend/db/` no cambian.
- [x] El Personal pasa un reporte de `CORRECCION_SOLICITADA` a `BORRADOR` con «Corregir reporte», con su fila de historial y su `CAMBIO_ESTADO`, y `revisor_id` no cambia.
- [x] El Revisor recibe 403 al corregir, un reporte que no está en `CORRECCION_SOLICITADA` 422 y un mes `CERRADO` 409.
- [x] En la captura, la observación general se ve arriba de las pestañas y cada observación de vacuna dentro de su pestaña, en `CORRECCION_SOLICITADA` y en el Borrador corregido.
- [x] En el Borrador corregido se editan cantidades, se agregan vacunas y se quitan las que no tienen observaciones.
- [x] Al reenviar se vuelve a validar: con errores responde 422 `REPORTE_CON_ERRORES` y las observaciones siguen pendientes; sin errores queda `ENVIADO` y las observaciones quedan atendidas con fecha.
- [x] El historial de un reporte devuelto y reenviado tiene, en orden, cada envío, la devolución y la corrección.
- [x] Al asignar un reporte reenviado, el diálogo indica quién lo revisó antes y lo preselecciona si es otro revisor.
- [x] «Revisar reporte» muestra cuándo se atendió cada observación anterior.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] HU-29 tiene su avance y sus criterios marcados, HU-31 y HU-34 sus notas, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** el Personal vuelve el reporte a `BORRADOR` con el botón «Corregir reporte», que usa la transición de `transicion_estado` (decidido en la fase de preguntas). **No:** pasar a `BORRADOR` al guardar, que mezcla captura y estados (regla 3), ni al abrir, que haría escribir a un `GET`.
- **Sí:** el destino `BORRADOR` pide `REPORTE_EDITAR` (decidido en la fase de preguntas). **No:** un permiso `REPORTE_CORREGIR` nuevo, que pide tocar el 05 sin ganar nada: corregir es volver a editar.
- **Sí:** la captura muestra solo las observaciones de la última devolución, la general arriba y la de cada vacuna en su pestaña, hasta reenviar (decidido en la fase de preguntas). **No:** mostrar las devoluciones anteriores en la captura; la revisión ya las muestra.
- **Sí:** al reenviar, las observaciones pendientes quedan atendidas en la misma transacción (decidido en la fase de preguntas). **No:** una casilla por observación, que pide un endpoint y filas de bitácora por cada marca. Así las pendientes son siempre las de la última devolución, sin comparar fechas.
- **Sí:** el historial se comprueba en las pruebas; su pantalla y `GET /reportes/{id}/historial` son de HU-34 (decidido en la fase de preguntas).
- **Sí:** `revisor_id` se conserva al corregir y al reenviar, y el diálogo de asignar preselecciona al revisor anterior (decidido en la fase de preguntas). **No:** limpiar `revisor_id`, que pierde quién conoce el reporte. **No:** pasar directo a `EN_REVISION`, que salta `transicion_estado`.
- **Sí:** el Borrador corregido es un Borrador más: se editan cantidades y se agregan y quitan vacunas, y quitar una con observaciones sigue con 409 `VACUNA_CON_OBSERVACIONES` (decidido en la fase de preguntas).
- **Sí:** los reportes devueltos de un mes `EN_CIERRE` quedan para HU-31, con una nota en esa historia (decidido en la fase de preguntas). El backend ya permite corregir y reenviar con el mes en `MESES_EDITABLES`.
- **Sí:** corregir con el mes fuera de `MESES_EDITABLES` responde 409 `PERIODO_CERRADO`: un Borrador que no se puede editar no tiene sentido. Decidido al escribir el spec.
- **Sí:** «Corregir reporte» no pide confirmación: no borra nada y lo escrito sigue igual. Decidido al escribir el spec.
- **Sí:** las observaciones atendidas van como `observacionesAtendidas` en la `CAMBIO_ESTADO` del reenvío, sin filas propias en la bitácora, como las de la devolución (SPEC 36). Decidido al escribir el spec.
- **Sí:** del backend se corren solo las pruebas de este spec y de lo que usa `transiciones.service.js`; la suite completa se corre al terminar las historias del día (decidido después de escribir el spec, porque tarda demasiado contra Aiven). La del frontend sí se corre completa.
- **Sí:** las pruebas usan el año 2013 y las vacunas `ZVT_HU29*`, que no usa ningún otro archivo. Decidido al escribir el spec.
- **Sí:** la prueba manual corrige y reenvía el 524 y lo deja `EN_REVISION` con la estadígrafa, para HU-30. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La captura muestra «Solo consulta» en `CORRECCION_SOLICITADA` y el aviso nuevo se encima | El aviso de devolución lo reemplaza en ese estado; lo cubren las pruebas del paso 5. |
| Después de corregir, la captura sigue con el detalle o el formulario viejos (`editable: false`) | «Corregir reporte» recarga los dos, como «Recargar reporte»; lo cubren las pruebas del paso 5. |
| Marcar atendidas en un envío rechazado (la transacción se confirma igual para guardar la corrida) | El `UPDATE` va después de comprobar que no hay errores; lo cubre la prueba del reenvío con errores. |
| Un reporte devuelto en un mes `EN_CIERRE` no se puede abrir desde la pantalla | Queda anotado en HU-31; mientras tanto el mes se puede devolver a `ABIERTO` ampliando la fecha límite (SPEC 16). |
| La prueba manual no se deshace | Es lo que se quiere: el 524 queda para HU-30. Volverlo atrás solo por SQL con autorización. |

## Lo que **no** entra en este spec

- Abrir reportes devueltos de meses `EN_CIERRE` desde la pantalla (HU-31).
- La línea de tiempo del historial y `GET /reportes/{id}/historial` (HU-34).
- Las devoluciones anteriores en la captura y marcar observaciones a mano.
- Observaciones por celda.
- Aprobar y cerrar el periodo.
- Cambios al modelo, a los permisos, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
