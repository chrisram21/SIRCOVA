# SPEC 40 — Solicitar una rectificación

> **Estado:** Implementado
> **Historia:** HU-32
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 12, SPEC 23, SPEC 24, SPEC 25, SPEC 26 y SPEC 39
> **Fecha:** 2026-10-31
> **Objetivo:** Que el Personal del establecimiento o el administrador pidan, desde la pantalla «Rectificaciones», la corrección de un reporte `CERRADO` con una justificación y las cantidades nuevas escritas en el formulario de captura, lo que deja una solicitud `PENDIENTE` con el valor anterior y el nuevo de cada celda.

## Por qué existe este spec

El 01 ya tiene `solicitud_rectificacion` (`PENDIENTE`, `AUTORIZADA`, `RECHAZADA`, `APLICADA`) y `rectificacion_detalle` (la celda, `cantidad_anterior` y `cantidad_nueva`), pero nadie las escribe. `transicion_estado` tiene `CERRADO → RECTIFICACION → CERRADO` solo para REVISOR, con comentario. El contrato solo tiene un esbozo de `POST /reportes/{id}/rectificaciones` con `motivo`. El 05 no tiene permisos de rectificación. Desde el SPEC 39 hay meses y reportes `CERRADO` que ya no se pueden corregir de otra forma.

**Diferencias con la historia, la semilla y `AGENTS.md`** (lo decidió el equipo en la fase de preguntas):

- «Como personal del establecimiento»: también la pide el administrador, para cualquier establecimiento de su DDRISS (por ejemplo, un error que la DDRISS detecta meses después). Para leer los reportes cerrados, el administrador recibe `REPORTE_CONSULTAR`.
- La solicitud trae los cambios desde el principio: la justificación y las cantidades nuevas se guardan juntas, y el reporte sigue `CERRADO` mientras la solicitud está `PENDIENTE`. HU-33 autoriza y aplica de una vez. La semilla (`03`) sigue otro flujo en el reporte 228 (solicitud `AUTORIZADA` sin detalle y el reporte en `RECTIFICACION`, a la espera de que se editen las cantidades); queda como dato histórico y se anota en HU-33.
- Pedir la rectificación no cambia el estado del reporte, así que no pasa por `/transiciones` ni toca `transicion_estado`. El paso por `RECTIFICACION` es de HU-33.
- «Indicando los cambios»: solo las cantidades de las celdas. Los campos adicionales (`datos_adicionales`, como `total_dosis_declarado`) no se rectifican, porque `rectificacion_detalle` solo guarda celdas.

## Alcance

**Entra:**

- `POST /reportes/{id}/rectificaciones`, con el permiso nuevo `RECTIFICACION_SOLICITAR`: crea la solicitud `PENDIENTE` y sus filas de `rectificacion_detalle` en una transacción, con su bitácora. Solo para un reporte `CERRADO` del ámbito del usuario y sin otra solicitud `PENDIENTE`.
- `GET /rectificaciones` (paginado) y `GET /rectificaciones/{id}`, con el permiso nuevo `RECTIFICACION_CONSULTAR`, por ámbito: el Personal ve las de su establecimiento y el administrador las de su DDRISS.
- Los permisos `RECTIFICACION_SOLICITAR` y `RECTIFICACION_CONSULTAR` (módulo `RECTIFICACION`) para ESTABLECIMIENTO y ADMINISTRADOR, y `REPORTE_CONSULTAR` para ADMINISTRADOR, en `05_permisos_mysql.sql`.
- La opción de menú «Rectificaciones» (`/rectificaciones`) con su lista de solicitudes, la pantalla «Nueva solicitud» (`/rectificaciones/nueva`) y la de detalle (`/rectificaciones/:id`).
- La edición de las cantidades con el formulario de captura (`FormularioCaptura` y `TarjetaProcedencias`), con los valores actuales del reporte cerrado y las celdas cambiadas resaltadas.
- En «Mis reportes», «Solicitar rectificación» en las filas `CERRADO` (o «Ver solicitud» si ya hay una `PENDIENTE`).
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Criterios y avance de HU-32, una nota en HU-33 y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Autorizar, rechazar y aplicar la solicitud, el paso por `RECTIFICACION`, `numero_rectificacion` y la bandeja del revisor (HU-33).
- Recalcular indicadores (HU-36).
- Retirar o cancelar una solicitud `PENDIENTE` (el 01 no tiene un estado para eso).
- Corregir campos adicionales (`datos_adicionales`, `total_declarado`).
- Subir un documento de respaldo (`evidencia_ruta` queda `NULL`).
- Correr el motor de validación sobre las cantidades propuestas.
- Agregar o quitar vacunas del reporte en una rectificación.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe las tablas del 01 tal como están:

```sql
-- Una solicitud por pedido; el reporte no cambia (sigue CERRADO, sin subir version_fila)
solicitud_rectificacion: reporte_id, solicitado_por = <usuario>, motivo, estado = 'PENDIENTE'
                         (evidencia_ruta, resuelto_por, comentario_resolucion, resuelto_en y aplicado_en quedan NULL)

-- Una fila por celda que cambia
rectificacion_detalle: solicitud_id, detalle_id (NULL si la celda no existía), reporte_vacuna_id, dosis_id,
                       municipio_procedencia_id, clave_combinacion, cantidad_anterior, cantidad_nueva
```

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `RECTIFICACION_SOLICITAR` | `RECTIFICACION` | Solicitar la rectificación de un reporte cerrado de su ámbito | ESTABLECIMIENTO, ADMINISTRADOR |
| `RECTIFICACION_CONSULTAR` | `RECTIFICACION` | Consultar las solicitudes de rectificación de su ámbito | ESTABLECIMIENTO, ADMINISTRADOR |
| `REPORTE_CONSULTAR` (ya existe) | `PRODUCCION` | — | se agrega ADMINISTRADOR |

`RECTIFICACION` es un módulo nuevo del 05: se anota en su lista de módulos.

### Solicitar: `POST /reportes/{id}/rectificaciones`

```json
{
  "motivo": "Faltó sumar la jornada de vacunación del 28 de agosto.",
  "versionFila": 14,
  "cambios": [
    {
      "vacunaId": 3,
      "dosisCodigo": "D3",
      "municipioProcedenciaId": 7,
      "dimensiones": { "grupo_edad": "MENOR_1" },
      "cantidadNueva": 93
    }
  ]
}
```

- `motivo`: obligatorio, recortado, de 1 a 1000 caracteres.
- `versionFila`: la del reporte que vio el usuario; si cambió, 409 `REPORTE_DESACTUALIZADO`. Asegura que la cantidad anterior es la que estaba en pantalla.
- `cambios`: de 1 a 500 celdas, sin repetir una celda. Cada celda usa el formato de las del guardado (`leerCelda` de `captura.service.js`) con `cantidadNueva` en lugar de `cantidad`: entero de 0 a `CANTIDAD_MAXIMA`.
- La cantidad anterior la lee el backend, nunca el cliente: la de `detalle_produccion` o 0 si la celda no existe (`detalle_id` `NULL`).
- Una celda debe ser válida para la versión del esquema fijada en `reporte_vacuna` (`celdasDelEsquema`) y su procedencia debe estar permitida o tener filas en la vacuna, con la misma regla del guardado (SPEC 24). Si no, el mismo 422 que el guardado.
- Una celda cuya `cantidadNueva` es igual a la anterior responde 422 `CAMBIO_SIN_DIFERENCIA`: el frontend solo manda las que cambiaron.
- No se puede vaciar una celda que tiene cantidad: se escribe 0 (`cantidad_nueva` no admite `NULL`).

En una transacción:

1. `SELECT … FOR UPDATE` del reporte como **primera** consulta (así dos solicitudes a la vez sobre el mismo reporte no se cruzan).
2. El alcance, el estado, la versión y la solicitud `PENDIENTE` existente.
3. Las celdas y sus cantidades anteriores.
4. El `INSERT` de la solicitud, un solo `INSERT` de sus detalles y la bitácora.

| Caso | Respuesta |
|---|---|
| Sin `RECTIFICACION_SOLICITAR` | 403 `SIN_PERMISO` (con `ACCESO_DENEGADO`) |
| Cuerpo inválido, campo desconocido o `cambios` vacío | 400 `ENTRADA_INVALIDA` |
| El reporte no existe o está fuera del ámbito | 404 `NO_ENCONTRADO` (como el resto de `/reportes/{id}`) |
| El reporte no está `CERRADO` | 409 `REPORTE_NO_CERRADO` «Solo se rectifican reportes cerrados.» |
| Ya tiene una solicitud `PENDIENTE` | 409 `RECTIFICACION_PENDIENTE` «El reporte ya tiene una solicitud de rectificación pendiente.», con `solicitudId` |
| `versionFila` vieja | 409 `REPORTE_DESACTUALIZADO` |
| Celda inválida o sin diferencia | 422 |
| Todo bien | 201 con la solicitud (el mismo objeto de `GET /rectificaciones/{id}`) |

Bitácora: una `CREAR` (módulo `RECTIFICACION`, entidad `solicitud_rectificacion`) con el objeto completo en `valoresNuevos`: `reporteId`, `motivo`, `estado` y `cambios` con la celda, la cantidad anterior y la nueva.

### Consultar: `GET /rectificaciones` y `GET /rectificaciones/{id}`

- `GET /rectificaciones`: la forma paginada común (`{ elementos, total, pagina, porPagina }`), con `estado` (`PENDIENTE`, `AUTORIZADA`, `RECHAZADA`, `APLICADA`), `Pagina` y `PorPagina`, revisados con la regla del SPEC 12. Ordenada por `solicitado_en` descendente. Cada elemento: `id`, `reporte` (`id`, establecimiento, periodo), `estado`, `motivo`, `solicitadoPor` (nombre), `solicitadoEn` y `cambios` (el número de celdas).
- `GET /rectificaciones/{id}`: lo mismo más `resueltoPor`, `comentarioResolucion`, `resueltoEn`, `aplicadoEn` y `cambios` como lista: vacuna, dosis, procedencia, las dimensiones con sus etiquetas (de la versión fijada del esquema), `cantidadAnterior` y `cantidadNueva`. Fuera del ámbito: 404.
- El ámbito se filtra con `filtroAlcance` / `verificarAlcance` sobre el establecimiento del reporte.
- Las rutas, el controlador y el servicio van en `modulos/revision/` (`rectificaciones.routes.js` o en `revision.routes.js`, `rectificaciones.service.js`); las fechas con `UNIX_TIMESTAMP`, como `aFechaIso`.

### Pantallas

| Parte | Contenido |
|---|---|
| Menú | «Rectificaciones» (`/rectificaciones`, permiso `RECTIFICACION_CONSULTAR`) en `opcionesMenu.js`, con las subrutas «Nueva solicitud» (`/rectificaciones/nueva`, `RECTIFICACION_SOLICITAR`) y «Solicitud de rectificación» (`/rectificaciones/:id`, `RECTIFICACION_CONSULTAR`). |
| Lista | `paginas/rectificaciones/PaginaRectificaciones.jsx`: tabla con mes, establecimiento, estado (insignia), solicitante, fecha y celdas, filtro de estado y paginación en la URL (`useSearchParams`), y «Nueva solicitud» con `RECTIFICACION_SOLICITAR`. Cada fila abre el detalle. |
| Nueva solicitud, paso 1 | `paginas/rectificaciones/PaginaNuevaRectificacion.jsx` sin `?reporte=`: filtro de año y la tabla de reportes `CERRADO` (`GET /reportes?estado=CERRADO&anio=`) con mes y establecimiento. Cada fila dice «Solicitar» (lleva a `?reporte=id`) o, si tiene una solicitud `PENDIENTE` (`GET /rectificaciones?estado=PENDIENTE`), «Ver solicitud». |
| Nueva solicitud, paso 2 | Con `?reporte=id`: el encabezado con el mes y el establecimiento, el `Textarea` «Justificación» (obligatorio, contador de 1000), el formulario de captura con los valores actuales (`GET /reportes/{id}/formulario`, reutilizando `formularioDe` y `cantidadesDe`) y las celdas cambiadas resaltadas (`data-cambiada`, color del tema). Debajo, «Cambios (N)»: la tabla celda por celda con anterior → nuevo. Lleva `useAvisoCambiosSinGuardar`. |
| Enviar | «Enviar solicitud» abre un `AlertDialog` con la tabla de cambios y «Enviar» / «Cancelar». Al enviar se muestran los errores (justificación vacía, sin cambios, una celda vaciada que tenía cantidad: «Escriba 0 para dejarla en cero.») y el foco va al primero. Al terminar: `toast.success('Solicitud de rectificación enviada.')` y el detalle de la solicitud. |
| Errores al enviar | Un 409 (`REPORTE_DESACTUALIZADO`, `RECTIFICACION_PENDIENTE`, `REPORTE_NO_CERRADO`) se muestra con «Recargar»; otro error, sin «Recargar», encima de los botones. |
| Detalle | `paginas/rectificaciones/PaginaDetalleRectificacion.jsx`: estado (insignia), reporte, solicitante y fecha, la justificación y la tabla de cambios (vacuna, dosis, procedencia, combinación, anterior, nuevo y la diferencia con signo). Solo lectura. |
| Mis reportes | En las filas `CERRADO`, con `RECTIFICACION_SOLICITAR`: «Solicitar rectificación» (a `/rectificaciones/nueva?reporte=id`) o «Ver solicitud» si tiene una `PENDIENTE`. |

- Las insignias de la solicitud (`Pendiente`, `Autorizada`, `Rechazada`, `Aplicada`) usan colores del tema (`index.css`), en un componente propio `componentes/InsigniaEstadoRectificacion.jsx`.
- `src/api/rectificaciones.js`: `solicitarRectificacion(reporteId, cuerpo)`, `listarRectificaciones(filtros)` y `obtenerRectificacion(id)`.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: completar `POST /reportes/{id}/rectificaciones` (cuerpo, respuestas, ejemplos y `x-permiso`), agregar `GET /rectificaciones` y `GET /rectificaciones/{id}` con sus esquemas (`SolicitudRectificacion`, `PaginaRectificaciones`), y en `GET /reportes` y `GET /reportes/{id}/formulario` que el administrador también los usa. Comprobación: el YAML se lee bien y `/api/docs` carga sin errores.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 40 (HU-32)" con `RECTIFICACION_SOLICITAR` y `RECTIFICACION_CONSULTAR` para ESTABLECIMIENTO y ADMINISTRADOR, `REPORTE_CONSULTAR` para ADMINISTRADOR y el módulo `RECTIFICACION` en la lista de la cabecera. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, los permisos existen con esos roles.

3. **Backend: solicitar.** `modulos/revision/rectificaciones.service.js` con `solicitarRectificacion` según el modelo de datos, su controlador y su ruta. La lectura de celdas, la validación contra el esquema y las procedencias reutilizan lo de `captura.service.js`, `celdas.service.js` y `procedencias.service.js` (se exporta lo que haga falta, sin cambiar su comportamiento). Pruebas en `tests/rectificaciones.test.js`, con el año 2009 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, con la fecha límite `'2099-12-31'`) y la vacuna `ZVT_HU32` con esquema nacional desde enero de 2009 (con una dimensión y procedencias); cada reporte de `CS-1201` se crea y se guarda por la API, y luego el reporte y el mes pasan a `CERRADO` por SQL (`cerrado_por`, `cerrado_en`). Todo se borra al inicio y al final (detalles, solicitudes, reportes, meses):
   - el Personal (`cs1201`) pide con dos cambios (una celda existente y una nueva): 201, la solicitud `PENDIENTE` con `solicitado_por`, el detalle con `cantidad_anterior` leída de la base y `detalle_id` `NULL` en la nueva, la `CREAR` con los cambios, y el reporte sigue `CERRADO` con la misma `versionFila`;
   - el administrador de `DDRISS_SM` pide sobre el mismo tipo de reporte: 201;
   - un reporte `APROBADO` o `BORRADOR`: 409 `REPORTE_NO_CERRADO`; una segunda solicitud: 409 `RECTIFICACION_PENDIENTE`; `versionFila` vieja: 409; Personal de otro establecimiento: 404; un usuario sin el permiso (el Revisor): 403;
   - `motivo` vacío, `cambios` vacío, celda repetida o campo desconocido: 400; celda inválida o igual a la anterior: 422;
   - un error no deja solicitud, detalle ni bitácora.

   Comprobación: pasa `rectificaciones.test.js`, y `captura.test.js` y `procedencia.test.js` si se tocaron sus servicios.

4. **Backend: consultar.** `GET /rectificaciones` y `GET /rectificaciones/{id}` en el mismo servicio. Pruebas en `rectificaciones.test.js`:
   - la lista del Personal trae solo las de su establecimiento y la del administrador las de su DDRISS; el filtro `estado` y la paginación funcionan; un parámetro desconocido: 400;
   - el detalle trae los cambios con las etiquetas de las dimensiones y las cantidades; de otro establecimiento: 404;
   - el administrador lee `GET /reportes?estado=CERRADO` y `GET /reportes/{id}/formulario` de un reporte de su DDRISS.

   Comprobación: pasa `rectificaciones.test.js`. La suite completa del backend se corre una vez en este spec.

5. **Frontend: API, lista y detalle.** `src/api/rectificaciones.js`, `InsigniaEstadoRectificacion.jsx`, `PaginaRectificaciones.jsx`, `PaginaDetalleRectificacion.jsx` y la opción en `opcionesMenu.js` con sus subrutas. Pruebas en sus `.test.jsx`:
   - la opción solo aparece con `RECTIFICACION_CONSULTAR`, y «Nueva solicitud» solo con `RECTIFICACION_SOLICITAR`;
   - la lista muestra las filas, filtra por estado y pagina desde la URL; una carga fallida muestra `AvisoError` con «Reintentar»;
   - el detalle muestra la justificación y la tabla de cambios con anterior, nuevo y diferencia.

   Comprobación: pasan las pruebas de las dos pantallas.

6. **Frontend: nueva solicitud.** `PaginaNuevaRectificacion.jsx` con sus dos pasos según la tabla de pantallas. Pruebas en `PaginaNuevaRectificacion.test.jsx`:
   - el paso 1 lista los reportes cerrados y muestra «Ver solicitud» en uno con una solicitud `PENDIENTE`;
   - el paso 2 carga los valores actuales; cambiar una celda la resalta y la agrega a «Cambios» con anterior → nuevo; volver al valor original la quita;
   - enviar sin justificación o sin cambios muestra los errores y no llama a la API; vaciar una celda con cantidad muestra «Escriba 0 para dejarla en cero.»;
   - confirmar llama una vez a `solicitarRectificacion` con `versionFila`, el motivo recortado y solo las celdas cambiadas, muestra el toast y abre el detalle;
   - un 409 con «Recargar» y otro error sin «Recargar».

   Comprobación: pasan las pruebas de la pantalla.

7. **Frontend: Mis reportes.** En `PaginaMisReportes.jsx`, «Solicitar rectificación» o «Ver solicitud» en las filas `CERRADO`. Pruebas en `PaginaMisReportes.test.jsx`: aparece solo con `RECTIFICACION_SOLICITAR` y solo en reportes `CERRADO`, y lleva a la ruta correcta. Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, después de correr el 05 y volver a iniciar sesión:
   - como el Personal de un establecimiento con un reporte `CERRADO` con cantidades de la semilla (un mes de 2026 hasta agosto; se elige al implementar uno sin solicitud): «Mis reportes» muestra «Solicitar rectificación»; en la nueva solicitud, cambiar dos celdas las resalta y las lista; enviar sin justificación muestra el error; con justificación, se envía y abre el detalle con anterior y nuevo. «Mis reportes» ahora dice «Ver solicitud»;
   - como `admin`: «Rectificaciones» lista la solicitud anterior; «Nueva solicitud» lista los reportes cerrados de la DDRISS y pide otra para un establecimiento distinto;
   - por SQL: las dos solicitudes `PENDIENTE` con su detalle y sus `CREAR`, y los reportes siguen `CERRADO` con la misma `version_fila`.

   Las dos solicitudes quedan `PENDIENTE`, para probar HU-33.

   Documentación:
   - en HU-32, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-33, una nota: la solicitud ya trae los cambios en `rectificacion_detalle`, así que autorizar debe aplicarlos y dejar el reporte `CERRADO` (decidir si pasa por `RECTIFICACION` en la misma transacción); la semilla del reporte 228 sigue el flujo anterior (autorizada sin detalle, el reporte en `RECTIFICACION`); y el revisor necesita `RECTIFICACION_CONSULTAR`;
   - en `CONTEXTO BD.md`, quién escribe `solicitud_rectificacion` y `rectificacion_detalle`, y que el reporte no cambia al solicitar;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: los permisos, el administrador con `REPORTE_CONSULTAR`, una `PENDIENTE` por reporte, la cantidad anterior la lee el backend, el formulario reutilizado y los datos de prueba (año 2009, `ZVT_HU32`).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `POST /reportes/{id}/rectificaciones`, `GET /rectificaciones` y `GET /rectificaciones/{id}`, y `/api/docs` carga sin errores.
- [ ] En `backend/` pasa la suite completa y en `frontend/` pasa `npm test`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2009.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Solo se puede solicitar la rectificación de un reporte `CERRADO`: otro estado responde 409 `REPORTE_NO_CERRADO`.
- [ ] Sin justificación, la API responde 400 y la pantalla muestra el error sin llamar a la API.
- [ ] La solicitud queda `PENDIENTE` con una fila de `rectificacion_detalle` por celda cambiada, con la cantidad anterior leída de la base y la nueva, todo en una transacción con su `CREAR` en la bitácora; el reporte sigue `CERRADO` con la misma `versionFila`.
- [ ] Un reporte con una solicitud `PENDIENTE` responde 409 `RECTIFICACION_PENDIENTE` a otra.
- [ ] El Personal solo pide y ve las solicitudes de su establecimiento, y el administrador las de su DDRISS; sin el permiso, 403.
- [ ] La pantalla de nueva solicitud muestra el formulario de captura con los valores actuales, resalta las celdas cambiadas y lista cada cambio con el valor anterior y el nuevo antes de enviar.
- [ ] El detalle de la solicitud muestra la justificación y, por celda, el valor anterior y el nuevo.
- [ ] «Mis reportes» muestra «Solicitar rectificación» o «Ver solicitud» solo en los reportes `CERRADO`.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-32 tiene su avance y sus criterios marcados, HU-33 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** la solicitud trae la justificación y las cantidades nuevas juntas, y HU-33 autoriza y aplica de una vez (decidido en la fase de preguntas). **No:** autorizar primero y editar después, como la semilla del reporte 228, que agrega pasos y no mostraría valores en la solicitud.
- **Sí:** la piden el Personal (su establecimiento) y el administrador (su DDRISS) (decidido en la fase de preguntas). **No:** solo el Personal, porque la DDRISS también detecta errores después del cierre.
- **Sí:** el administrador recibe `REPORTE_CONSULTAR` para reutilizar `GET /reportes` y `GET /reportes/{id}/formulario` (decidido en la fase de preguntas). Puede consultar cualquier reporte de su DDRISS. **No:** endpoints propios de rectificación para leer reportes cerrados.
- **Sí:** permisos nuevos `RECTIFICACION_SOLICITAR` y `RECTIFICACION_CONSULTAR` en el módulo nuevo `RECTIFICACION` (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** reutilizar `REPORTE_EDITAR`, que es del borrador.
- **Sí:** las cantidades se escriben en el formulario de captura con los valores actuales y se envían solo las celdas cambiadas (decidido en la fase de preguntas). **No:** una lista de celdas a mano.
- **Sí:** una sola solicitud `PENDIENTE` por reporte (decidido en la fase de preguntas). **No:** varias a la vez, con valores anteriores que podrían chocar al aplicar.
- **Sí:** solo se revisan el formato y las celdas válidas del esquema fijado; el motor de reglas no corre (decidido en la fase de preguntas). El revisor juzga en HU-33.
- **Sí:** la pantalla «Rectificaciones» con lista, nueva solicitud y detalle, más el acceso desde «Mis reportes» (decidido en la fase de preguntas). HU-33 agrega ahí lo del revisor.
- **No:** retirar una solicitud, corregir campos adicionales y subir un documento de respaldo (decidido en la fase de preguntas).
- **Sí:** la cantidad anterior la lee el backend y el cuerpo exige la `versionFila` del reporte, para que lo que se guarda como «anterior» sea lo que el usuario vio. Decidido al escribir el spec.
- **Sí:** una celda igual a la anterior responde 422 y una celda con cantidad no se vacía (se escribe 0), porque `cantidad_nueva` no admite `NULL` y una fila sin cambio no es evidencia. Decidido al escribir el spec.
- **Sí:** el código vive en `modulos/revision/`, junto al cierre y las transiciones, sin módulo nuevo en `src/modulos/`. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2009 y la vacuna `ZVT_HU32`, que no usa ningún otro archivo, y cierran el reporte y el mes por SQL. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| Dar `REPORTE_CONSULTAR` al administrador le muestra algo inesperado en el menú o en Inicio | «Registro» y «Mis reportes» piden `REPORTE_CREAR` (SPEC 36) y la tarjeta de Inicio que usa `REPORTE_CONSULTAR` es solo del Personal; la prueba manual entra como `admin` y revisa el menú. |
| Reutilizar `FormularioCaptura` en un reporte no editable | La pantalla de rectificación pasa su propia marca de edición en lugar de `formulario.editable`; las pruebas del paso 6 cubren que se puede escribir. |
| Cambiar las cantidades deja `total_dosis_declarado` (campo adicional) distinto de la suma | Queda fuera de alcance; se anota en HU-33 para que el revisor lo tenga en cuenta. |
| Dos solicitudes en paralelo sobre el mismo reporte | El `FOR UPDATE` del reporte es la primera consulta: la segunda espera y ve la `PENDIENTE` (409). |
| Las solicitudes de la prueba manual no se deshacen | Es lo que se quiere: quedan `PENDIENTE` para HU-33. |

## Lo que **no** entra en este spec

- Autorizar, rechazar y aplicar la rectificación, y el estado `RECTIFICACION` del reporte (HU-33).
- Recalcular indicadores (HU-36).
- Retirar una solicitud pendiente.
- Corregir campos adicionales o agregar y quitar vacunas.
- Documentos de respaldo.
- El motor de validación sobre las cantidades propuestas.
- Cambios al modelo, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
