# SPEC 41 — Resolver una rectificación

> **Estado:** Implementado
> **Historia:** HU-33
> **Depende de:** SPEC 04, SPEC 05, SPEC 12, SPEC 34, SPEC 36 y SPEC 40
> **Fecha:** 2026-11-01
> **Objetivo:** Que el revisor de la DDRISS apruebe una solicitud de rectificación `PENDIENTE`, lo que aplica sus cambios al reporte y lo deja `CERRADO` en una sola transacción, o la rechace con un motivo sin tocar los datos, desde el detalle de la pantalla «Rectificaciones».

## Por qué existe este spec

Desde el SPEC 40, el Personal y el administrador crean solicitudes `PENDIENTE` con sus cambios en `rectificacion_detalle` (celda, cantidad anterior y nueva), pero nadie puede resolverlas: el reporte sigue `CERRADO` con los datos viejos. `transicion_estado` ya tiene `CERRADO → RECTIFICACION` y `RECTIFICACION → CERRADO` para REVISOR, ambas con comentario, y `reporte_produccion.numero_rectificacion` existe pero nadie lo sube.

**Diferencias con la historia, la semilla y `AGENTS.md`** (lo decidió el equipo en la fase de preguntas):

- «Se recalculan los indicadores afectados»: el motor de indicadores (HU-36) no existe todavía; queda fuera y se anota en HU-36. Las vistas `v_produccion*` leen el dato nuevo, porque el reporte termina `CERRADO`.
- Aprobar es autorizar y aplicar de una vez: la solicitud pasa de `PENDIENTE` a `APLICADA` sin quedar `AUTORIZADA`, y el reporte pasa por `RECTIFICACION` solo dentro de la transacción (dos filas de historial). `AUTORIZADA` queda sin uso en el flujo nuevo.
- La semilla (`03`) sigue el flujo anterior: el reporte 228 está en `RECTIFICACION` con la solicitud 2 `AUTORIZADA` sin detalle, y la solicitud 3 está `PENDIENTE` sin detalle. Se dejan como datos históricos: una `AUTORIZADA` no ofrece acciones, y una `PENDIENTE` sin detalle solo se puede rechazar.

## Alcance

**Entra:**

- `POST /rectificaciones/{id}/aprobar` y `POST /rectificaciones/{id}/rechazar`, con el permiso nuevo `RECTIFICACION_RESOLVER`, para cualquier revisor de la DDRISS del reporte.
- Aplicar los cambios: actualizar o crear las celdas en `detalle_produccion` (y `detalle_dimension`), las dos transiciones del reporte revisadas en `transicion_estado`, sus filas de `historial_estado_reporte`, y subir `numero_rectificacion` y `version_fila`.
- Las acciones de bitácora nuevas `APLICAR_RECTIFICACION` y `RECHAZAR_RECTIFICACION`.
- En `GET /rectificaciones/{id}`, para una `PENDIENTE`, el aviso de los totales declarados (`total_dosis_declarado`) que dejarían de cuadrar.
- Los permisos `RECTIFICACION_RESOLVER` (nuevo) y `RECTIFICACION_CONSULTAR` para REVISOR, en `05_permisos_mysql.sql`.
- En «Rectificaciones»: la lista del revisor (arranca en `PENDIENTE`) y, en el detalle de una `PENDIENTE`, «Aprobar» y «Rechazar» con sus diálogos, el aviso de totales y el enlace «Ver reporte».
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Criterios y avance de HU-33, una nota en HU-36 y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Recalcular indicadores (HU-36).
- Correr el motor de validación (HU-25) sobre el reporte rectificado: `resultado_validacion` no cambia.
- Corregir `datos_adicionales` (como `total_dosis_declarado`): solo se avisa.
- Resolver o cerrar los datos del flujo anterior de la semilla (reporte 228, solicitudes 2 y 3).
- Que el administrador resuelva (exigiría filas nuevas en `transicion_estado`).
- Notificaciones al solicitante, tarjetas de Inicio y la línea de tiempo del reporte (HU-34).
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe las tablas del 01 tal como están:

```sql
-- Aprobar (una transacción)
reporte_produccion:      estado CERRADO → RECTIFICACION → CERRADO, numero_rectificacion + 1, version_fila + 1
historial_estado_reporte: (CERRADO → RECTIFICACION) y (RECTIFICACION → CERRADO), con usuario_id del revisor
detalle_produccion:      UPDATE cantidad, actualizado_por  — o INSERT de la celda nueva (+ detalle_dimension)
reporte_vacuna:          total_declarado = la suma nueva de sus celdas (como al guardar la captura)
solicitud_rectificacion: estado = 'APLICADA', resuelto_por, comentario_resolucion (NULL si no hay),
                         resuelto_en = aplicado_en = NOW()

-- Rechazar
solicitud_rectificacion: estado = 'RECHAZADA', resuelto_por, comentario_resolucion, resuelto_en = NOW()
```

`rectificacion_detalle.detalle_id` no cambia: una celda creada al aplicar queda con `detalle_id` `NULL` y se identifica por `clave_combinacion` (como dice el comentario del 01).

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `RECTIFICACION_RESOLVER` | `RECTIFICACION` | Aprobar o rechazar las solicitudes de rectificación de su DDRISS | REVISOR |
| `RECTIFICACION_CONSULTAR` (ya existe) | `RECTIFICACION` | — | se agrega REVISOR |

### Aprobar: `POST /rectificaciones/{id}/aprobar`

```json
{ "comentario": "Se verificó con el libro de vacunación." }
```

- `comentario`: opcional, recortado, de 1 a 500 caracteres si viene; vacío cuenta como ausente.

Antes de la transacción se lee la solicitud con su reporte y se revisa el ámbito (`verificarAlcance` sobre el establecimiento). En la transacción:

1. `SELECT … FOR UPDATE` del reporte como **primera** consulta (el mismo orden que `solicitarRectificacion`, así no se cruzan).
2. `SELECT … FOR UPDATE` de la solicitud: debe seguir `PENDIENTE` y tener detalle; el reporte debe estar `CERRADO`.
3. Las dos transiciones en `transicion_estado` para el rol del usuario (como `/transiciones`).
4. Cada celda del detalle se busca por su llave (`reporte_vacuna_id`, `dosis_id`, `municipio_procedencia_id`, `clave_combinacion`): su cantidad actual (o 0 si no existe) debe ser igual a `cantidad_anterior`; si no, 409 y no se aplica nada. Si existe, `UPDATE`; si no, `INSERT` con su `detalle_dimension` (las dimensiones salen de la clave). Se reutiliza la escritura de celdas de `captura.service.js`, exportando lo necesario sin cambiar su comportamiento. El `total_declarado` de cada vacuna que cambia pasa a ser la suma nueva de sus celdas.
5. El reporte: `RECTIFICACION` y su historial, luego `CERRADO` y su historial, `numero_rectificacion` y `version_fila` + 1 (`cerrado_en` no cambia).
6. La solicitud `APLICADA` y la bitácora.

Comentarios del historial (la transición los exige), armados por el backend:

- `CERRADO → RECTIFICACION`: «Rectificación {n} autorizada (solicitud {id}).» y, si hay, « {comentario}».
- `RECTIFICACION → CERRADO`: «Rectificación {n} aplicada: {k} celdas.»

Bitácora (módulo `RECTIFICACION`):

- `APLICAR_RECTIFICACION` sobre `solicitud_rectificacion`: `valoresAnteriores` `{ estado: 'PENDIENTE' }`; `valoresNuevos` con `estado: 'APLICADA'`, `comentario`, `reporteId`, `numeroRectificacion` y `cambios` (por celda: `detalleId`, `vacunaId`, `dosisCodigo`, `municipioProcedenciaId`, `claveCombinacion`, `cantidadAnterior`, `cantidadNueva`).
- Dos `CAMBIO_ESTADO` sobre `reporte_produccion`, con el estado anterior y el nuevo.

### Rechazar: `POST /rectificaciones/{id}/rechazar`

```json
{ "comentario": "El libro de vacunación no muestra esas dosis." }
```

- `comentario`: obligatorio, recortado, de 1 a 500 caracteres.
- En una transacción: `FOR UPDATE` del reporte (primera consulta) y de la solicitud, que debe seguir `PENDIENTE`; el estado del reporte no se revisa (una `PENDIENTE` de la semilla sin detalle se puede rechazar). La solicitud pasa a `RECHAZADA`; el reporte y sus celdas no cambian.
- Bitácora: `RECHAZAR_RECTIFICACION` sobre `solicitud_rectificacion`, con `{ estado: 'PENDIENTE' }` → `{ estado: 'RECHAZADA', comentario }`.

### Respuestas de los dos endpoints

| Caso | Respuesta |
|---|---|
| Sin `RECTIFICACION_RESOLVER` | 403 `SIN_PERMISO` (con `ACCESO_DENEGADO`) |
| `id` inválido, cuerpo inválido, campo desconocido o (al rechazar) sin comentario | 400 `ENTRADA_INVALIDA` |
| La solicitud no existe o su reporte está fuera del ámbito | 404 `NO_ENCONTRADO` |
| La solicitud ya no está `PENDIENTE` | 409 `RECTIFICACION_RESUELTA` «La solicitud ya fue resuelta.» |
| Aprobar y el reporte no está `CERRADO` | 409 `REPORTE_NO_CERRADO` |
| Aprobar y una celda ya no tiene la cantidad anterior | 409 `RECTIFICACION_DESACTUALIZADA` «Los datos del reporte cambiaron desde la solicitud; rechácela y pida otra.» |
| Aprobar una solicitud sin detalle | 422 `RECTIFICACION_SIN_CAMBIOS` «La solicitud no tiene cambios que aplicar.» |
| Falta la transición en `transicion_estado` para el rol | 422 `TRANSICION_NO_PERMITIDA` (como el cierre del mes) |
| Todo bien | 200 con la solicitud (el mismo objeto de `GET /rectificaciones/{id}`) |

### Consultar: cambios en `GET /rectificaciones/{id}`

- Para una `PENDIENTE`, `totales`: una entrada por vacuna con cambios cuyo campo adicional `total_dosis_declarado` (el que compara la regla `TOTAL_CUADRA`, en `reporte_vacuna.datos_adicionales`) es un número y no coincide con la suma de sus celdas después de aplicar: `{ vacunaId, vacuna, totalDeclarado, sumaActual, sumaConCambios }`. No se usa `reporte_vacuna.total_declarado`, que la captura guarda como la suma de las celdas. Vacío si todo cuadra; ausente en otro estado. Solo informa, no bloquea.
- `GET /rectificaciones` y `GET /rectificaciones/{id}` no cambian en lo demás; el revisor los usa con `RECTIFICACION_CONSULTAR`, filtrados por su DDRISS.
- Rutas, controlador y servicio en `modulos/revision/` (`revision.routes.js`, `revision.controller.js`, `rectificaciones.service.js`); `APLICAR_RECTIFICACION` y `RECHAZAR_RECTIFICACION` se agregan a `ACCIONES`.

### Pantallas

| Parte | Contenido |
|---|---|
| Menú | Sin cambios en `opcionesMenu.js`: «Rectificaciones» ya pide `RECTIFICACION_CONSULTAR`, y «Nueva solicitud» `RECTIFICACION_SOLICITAR` (el revisor no la ve). |
| Lista | En `PaginaRectificaciones.jsx`, con `RECTIFICACION_RESOLVER` y sin `estado` en la URL, el filtro arranca en `PENDIENTE`; «Todos» se guarda como `estado=todos`. Para los demás roles no cambia. |
| Detalle, acciones | En `PaginaDetalleRectificacion.jsx`, con `RECTIFICACION_RESOLVER` y la solicitud `PENDIENTE`: «Aprobar» y «Rechazar» en el encabezado (`EncabezadoPagina`). |
| Aprobar | `DialogoAprobarRectificacion.jsx` (`AlertDialog`): «Se cambiarán {k} celdas del reporte de {mes} de {establecimiento} y quedará cerrado.», el `Textarea` «Comentario (opcional)» con contador de 500, y «Aprobar y aplicar» / «Cancelar». |
| Rechazar | `DialogoRechazarRectificacion.jsx` (`AlertDialog`): el `Textarea` «Motivo del rechazo» obligatorio (contador de 500); al confirmar vacío, el error y el foco en él, sin llamar a la API. |
| Al terminar | `toast.success('Rectificación aplicada.')` o `toast.success('Solicitud rechazada.')` y el detalle se recarga: estado, quién resolvió, cuándo y el comentario. |
| Errores | Un 409 (`RECTIFICACION_RESUELTA`, `RECTIFICACION_DESACTUALIZADA`, `REPORTE_NO_CERRADO`) se muestra en el diálogo con «Recargar» (cierra el diálogo y recarga el detalle); otro error, sin «Recargar», encima de los botones del diálogo. Los textos con `mensajeDeError`. |
| Aviso de totales | Si `totales` no está vacío: un aviso ámbar (`--advertencia`) por vacuna: «{vacuna}: el total declarado ({totalDeclarado}) ya no cuadrará con la suma ({sumaActual} → {sumaConCambios}).» |
| Ver reporte | Con `REPORTE_REVISAR`, el enlace «Ver reporte» a `/revision/reportes/{reporteId}` (la pantalla de revisión, que ya es de solo lectura fuera de `EN_REVISION`). Manda `state.regresarA` con la solicitud, así su «Volver» dice «Volver a la solicitud» y regresa a ella (con los filtros de la lista), en lugar de ir a la bandeja. |

- `src/api/rectificaciones.js`: `aprobarRectificacion(id, cuerpo)` y `rechazarRectificacion(id, cuerpo)`.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: `POST /rectificaciones/{id}/aprobar` y `POST /rectificaciones/{id}/rechazar` (cuerpo, respuestas, ejemplos y `x-permiso: RECTIFICACION_RESOLVER`), `totales` en `SolicitudRectificacion`, y que el revisor también usa `GET /rectificaciones` y `GET /rectificaciones/{id}`. Comprobación: el YAML se lee bien y `/api/docs` carga sin errores.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 41 (HU-33)" con `RECTIFICACION_RESOLVER` para REVISOR y `RECTIFICACION_CONSULTAR` para REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, los permisos existen con esos roles.

3. **Backend: aprobar y rechazar.** En `rectificaciones.service.js`, `aprobarRectificacion` y `rechazarRectificacion` según el modelo de datos, con su controlador y sus rutas; las acciones nuevas en `ACCIONES`. Pruebas en `tests/resolverRectificacion.test.js`, con el año 2008 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, con la fecha límite `'2099-12-31'`) y la vacuna `ZVT_HU33` con esquema nacional desde enero de 2008 (con una dimensión y procedencias); cada reporte de `CS-1201` se crea y se guarda por la API, luego el reporte y el mes pasan a `CERRADO` por SQL, y la solicitud se crea por la API (`POST /reportes/{id}/rectificaciones`). Todo se borra al inicio y al final (detalles de rectificación, solicitudes, historial, reportes, meses):
   - el revisor de `DDRISS_SM` aprueba con dos cambios (una celda existente y una nueva): 200, la solicitud `APLICADA` con `resuelto_por`, `resuelto_en` y `aplicado_en`; las cantidades nuevas en `detalle_produccion` y la celda nueva con su `detalle_dimension`; el reporte `CERRADO` con `numero_rectificacion` 1 y `version_fila` + 1; dos filas de historial; la `APLICAR_RECTIFICACION` con las cantidades anterior y nueva, y dos `CAMBIO_ESTADO`;
   - aprobar sin comentario: 200 con `comentario_resolucion` `NULL`;
   - rechazar con comentario: 200, `RECHAZADA` con el comentario, las celdas y el reporte sin cambios (`version_fila` igual) y la `RECHAZAR_RECTIFICACION`; sin comentario: 400;
   - aprobar o rechazar una ya resuelta: 409 `RECTIFICACION_RESUELTA`; una celda cambiada por SQL después de la solicitud: 409 `RECTIFICACION_DESACTUALIZADA` sin cambiar nada; una solicitud sin detalle (insertada por SQL): 422 al aprobar y 200 al rechazar;
   - el Personal o el administrador: 403; un revisor de otra DDRISS (o una solicitud de un reporte de otra DDRISS): 404;
   - `GET /rectificaciones/{id}` trae `totales` cuando el total declarado deja de cuadrar y lo omite en una resuelta; el revisor lista las de su DDRISS;
   - un error no deja cambios en las celdas, el reporte, la solicitud ni la bitácora.

   Comprobación: pasan `resolverRectificacion.test.js` y `rectificaciones.test.js`, y, si se exporta la escritura de celdas de `captura.service.js`, los archivos de los módulos que lo usan (`captura.test.js`, `vacunasDelReporte.test.js`, `validacion.test.js` y `transiciones.test.js`). La suite completa del backend no se corre en este spec: el 05 solo agrega permisos al REVISOR, que ninguna prueba revisa, y lo demás está cubierto por esos archivos.

4. **Frontend: lista y detalle.** `aprobarRectificacion`/`rechazarRectificacion` en `src/api/rectificaciones.js`, el filtro inicial de la lista, los dos diálogos y el detalle según la tabla de pantallas. Pruebas en `PaginaRectificaciones.test.jsx` y `PaginaDetalleRectificacion.test.jsx`:
   - con `RECTIFICACION_RESOLVER`, la lista pide `PENDIENTE` sin `estado` en la URL, y «Todos» lo quita; sin el permiso, sigue igual;
   - «Aprobar» y «Rechazar» solo aparecen con `RECTIFICACION_RESOLVER` y la solicitud `PENDIENTE`;
   - aprobar llama una vez a `aprobarRectificacion` con el comentario recortado (o sin él), muestra el toast y recarga el detalle;
   - rechazar sin motivo muestra el error y no llama a la API; con motivo, llama a `rechazarRectificacion`, muestra el toast y recarga;
   - un 409 con «Recargar» y otro error sin «Recargar»;
   - el aviso de totales aparece con `totales` y el enlace «Ver reporte» solo con `REPORTE_REVISAR`.

   Comprobación: `npm test` del frontend pasa completo.

5. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, después de correr el 05 y volver a iniciar sesión:
   - como la estadígrafa (REVISOR de `DDRISS_SM`): «Rectificaciones» abre en pendientes y muestra las solicitudes 12 y 13; en la 12 (reporte 223, CS-1206), «Ver reporte» abre el reporte cerrado; «Aprobar» sin comentario la aplica y el detalle queda `APLICADA`; «Rechazar» la 13 sin motivo muestra el error, y con motivo queda `RECHAZADA`;
   - por SQL: el reporte 223 `CERRADO` con las cantidades nuevas (97 y 5), `numero_rectificacion` 1, `version_fila` + 1, dos filas de historial y la `APLICAR_RECTIFICACION`; el reporte 233 con las mismas cantidades y la misma `version_fila`, y la `RECHAZAR_RECTIFICACION`;
   - como `cs1206`: «Mis reportes» vuelve a ofrecer «Solicitar rectificación» en agosto de 2026 y la lista muestra la 12 `APLICADA`.

   Documentación:
   - en HU-33, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-36, una nota: una rectificación aplicada debe disparar una corrida con motivo `RECTIFICACION`;
   - en `CONTEXTO BD.md`, que aprobar pasa la solicitud de `PENDIENTE` a `APLICADA` (sin `AUTORIZADA`) y el reporte por `RECTIFICACION` dentro de la transacción, y que el 228 y las solicitudes 2 y 3 de la semilla son del flujo anterior;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: los endpoints y el permiso, el orden de los bloqueos, la comparación con `cantidad_anterior`, las acciones nuevas y los datos de prueba (año 2008, `ZVT_HU33`).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `POST /rectificaciones/{id}/aprobar`, `POST /rectificaciones/{id}/rechazar` y `totales`, y `/api/docs` carga sin errores.
- [ ] En `backend/` pasan los archivos de prueba del paso 3 y en `frontend/` pasa `npm test`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2008.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Al aprobar, las celdas toman la cantidad nueva y el reporte queda `CERRADO` con `numero_rectificacion` + 1, todo en una transacción con dos filas de historial revisadas en `transicion_estado`; la solicitud queda `APLICADA`.
- [ ] Al rechazar, el motivo es obligatorio (400 en la API, error en la pantalla sin llamarla), la solicitud queda `RECHAZADA` y ni las celdas ni el reporte cambian.
- [ ] Toda resolución queda en la bitácora: `APLICAR_RECTIFICACION` con la cantidad anterior y la nueva de cada celda, o `RECHAZAR_RECTIFICACION` con el motivo.
- [ ] Una solicitud ya resuelta responde 409 `RECTIFICACION_RESUELTA`, y una celda que ya no tiene la cantidad anterior responde 409 `RECTIFICACION_DESACTUALIZADA` sin aplicar nada.
- [ ] Solo un revisor de la DDRISS del reporte resuelve: sin el permiso, 403; fuera del ámbito, 404.
- [ ] El detalle de una `PENDIENTE` muestra «Aprobar» y «Rechazar» solo al revisor, el aviso de totales cuando corresponde y el enlace «Ver reporte».
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-33 tiene su avance y sus criterios marcados, HU-36 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** resuelve cualquier revisor de la DDRISS del reporte, con el permiso nuevo `RECTIFICACION_RESOLVER` (decidido en la fase de preguntas). Encaja con `transicion_estado`, que no se toca. **No:** solo el revisor asignado (si ya no está activo, nadie resolvería) ni el administrador (necesitaría transiciones nuevas).
- **Sí:** aprobar autoriza y aplica en una transacción, con el paso por `RECTIFICACION` y dos filas de historial; la solicitud pasa directo a `APLICADA` (decidido en la fase de preguntas). **No:** dos pasos (autorizar y aplicar), ni aplicar sin pasar por `RECTIFICACION`, que no dejaría rastro en HU-34.
- **Sí:** si una celda ya no tiene la cantidad anterior, 409 y no se aplica (decidido en la fase de preguntas). Es una red de seguridad: con una `PENDIENTE` por reporte y el reporte cerrado, casi no puede pasar. **No:** aplicar igual.
- **Sí:** comentario opcional al aprobar y obligatorio al rechazar; los comentarios del historial los arma el backend (decidido en la fase de preguntas).
- **Sí:** dos endpoints, `/aprobar` y `/rechazar` (decidido en la fase de preguntas). **No:** uno con `decision`.
- **Sí:** acciones de bitácora nuevas `APLICAR_RECTIFICACION` y `RECHAZAR_RECTIFICACION`, además de los `CAMBIO_ESTADO` del reporte (decidido en la fase de preguntas). **No:** reutilizar `ACTUALIZAR`, que no distingue una rectificación en la auditoría.
- **Sí:** el revisor resuelve en «Rectificaciones», con la lista en pendientes y las acciones en el detalle (decidido en la fase de preguntas). **No:** una pestaña en la bandeja de revisión, que es por mes.
- **Sí:** el detalle lleva el enlace al reporte cerrado (decidido en la fase de preguntas). **No:** una columna con la cantidad actual de cada celda.
- **Sí:** no se corre el motor de validación; si un total declarado deja de cuadrar, solo se avisa (decidido en la fase de preguntas).
- **Sí:** el aviso compara `total_dosis_declarado` (el campo adicional de `TOTAL_CUADRA`) y al aplicar se recalcula `reporte_vacuna.total_declarado` como la suma nueva (decidido al implementar el paso 3). **No:** comparar `total_declarado`, que la captura guarda como la suma de las celdas y avisaría en toda solicitud.
- **No:** recalcular indicadores, porque HU-36 no existe todavía; se anota allá (decidido en la fase de preguntas).
- **No:** tocar el reporte 228 ni las solicitudes 2 y 3 de la semilla; quedan como datos del flujo anterior (decidido en la fase de preguntas).
- **Sí:** el reporte se bloquea antes que la solicitud, en el mismo orden que `solicitarRectificacion`, y las celdas se buscan por su llave y no por `detalle_id`, que puede ser `NULL`. Decidido al escribir el spec.
- **Sí:** `cerrado_en` del reporte no cambia al aplicar y `rectificacion_detalle.detalle_id` de una celda nueva queda `NULL`, como dice el 01. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2008 y la vacuna `ZVT_HU33`, que no usa ningún otro archivo. Decidido al escribir el spec.
- **Sí:** «Volver» de la pantalla de revisión regresa a la solicitud cuando se abre desde «Ver reporte» (pedido después de la prueba manual del paso 5, que mostró que llevaba a la bandeja). Se hizo como una convención común para otros specs: quien abre una pantalla fuera de su flujo manda en el `state` del enlace `regresarA: { ruta, texto, estado }`, y la pantalla abierta lo lee con `destinoDeVolver(state, rutaDeSiempre, textoDeSiempre)` de `componentes/EncabezadoPagina.jsx`; sin `regresarA`, o con una ruta que no empieza con «/», usa su destino de siempre. **No:** reutilizar `state.volverA`, que en cada pantalla es solo la búsqueda de su propia lista; ni cambiar las migas, que salen de `ubicarRuta.js` para todas las pantallas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los permisos nuevos no llegan al token del revisor | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Aprobar y solicitar a la vez sobre el mismo reporte | Los dos bloquean primero el reporte; la solicitud nueva espera y responde 409 si la otra sigue `PENDIENTE`, o ve el reporte ya rectificado. |
| Un revisor aprueba y otro rechaza la misma solicitud a la vez | El `FOR UPDATE` de la solicitud ordena las dos; la segunda responde 409 `RECTIFICACION_RESUELTA`. |
| Los indicadores calculados quedan desactualizados tras aplicar | Fuera de alcance; se anota en HU-36. |
| El total declarado deja de cuadrar con la suma | El detalle lo avisa antes de aprobar; corregirlo queda fuera de alcance. |
| La aprobación de la prueba manual no se deshace | Es lo esperado: el reporte 223 queda rectificado y el 233 sin cambios. |

## Lo que **no** entra en este spec

- Recalcular indicadores (HU-36).
- Correr el motor de validación sobre el reporte rectificado.
- Corregir totales declarados o campos adicionales.
- Resolver los datos del flujo anterior de la semilla.
- Que el administrador resuelva.
- Notificaciones, tarjetas de Inicio y la línea de tiempo del reporte (HU-34).
- Cambios al modelo, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
