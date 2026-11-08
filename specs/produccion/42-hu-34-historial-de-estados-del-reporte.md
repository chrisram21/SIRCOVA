# SPEC 42 — Historial de estados del reporte

> **Estado:** Implementado
> **Historia:** HU-34
> **Depende de:** SPEC 04, SPEC 22, SPEC 23, SPEC 26, SPEC 34 y SPEC 36
> **Fecha:** 2026-11-01
> **Objetivo:** Que el revisor y el Personal del establecimiento vean la línea de tiempo de estados de un reporte (estado anterior y nuevo, usuario, fecha y comentario) con `GET /reportes/{id}/historial`, y que la base impida modificar esas filas.

## Por qué existe este spec

`historial_estado_reporte` ya se llena en cada creación, transición, cierre del mes y rectificación (SPEC 22, 34, 39 y 41), pero nadie puede leerla: `GET /reportes/{id}/historial` sigue provisional en el contrato, sin implementar. Solo «Mis reportes» usa la fila más reciente (`estadoDesde`) y la corrección vigente.

**Diferencias con la historia** (decididas en la fase de preguntas):

- «El historial no se puede editar ni borrar»: la base impide el `UPDATE` con un trigger (script nuevo `09`), pero no el `DELETE`, porque 14 archivos de prueba borran las filas de sus reportes al limpiar y la llave foránea lo exige. El borrado queda impedido en la API, que no tiene ningún endpoint para escribir ni borrar el historial; ningún código de la API hace `DELETE` sobre la tabla.
- El usuario de cada cambio se muestra con su rol **actual**: la tabla no guarda el rol que tenía en ese momento.

## Alcance

**Entra:**

- `GET /reportes/{id}/historial` con `REPORTE_CONSULTAR`, filtrado por ámbito como `GET /reportes/{id}/observaciones`.
- El script `backend/db/09_historial_inmutable_mysql.sql`, con un trigger que impide `UPDATE` sobre `historial_estado_reporte` (autorizado al definir el spec).
- Un componente común con la línea de tiempo, usado en tres lugares:
  - «Revisar reporte» (`PaginaRevisarReporte.jsx`): una tarjeta «Historial de estados» siempre visible, en cualquier estado del reporte.
  - «Mis reportes» (`PaginaMisReportes.jsx`): un botón «Historial» por fila que abre un diálogo.
  - La captura (`CapturaReporte.jsx`): una tarjeta plegable «Historial de estados», cerrada al abrir, que pide el historial al desplegarse.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Criterios y avance de HU-34, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Reasignaciones de revisor (`PATCH /reportes/{id}/revisor` no escribe historial) y cualquier otro evento que no sea un cambio de estado.
- Duración en cada estado o tiempos calculados.
- Una pantalla para el administrador, Epidemiología o Autoridad: el administrador puede llamar al endpoint (tiene `REPORTE_CONSULTAR`), pero no se le agrega ninguna entrada en el frontend.
- Una acción «Historial» en la bandeja de revisión.
- Guardar el rol del usuario en cada fila, o cualquier otro cambio al modelo.
- Impedir el `DELETE` del historial en la base.
- Cambios a permisos, a `transicion_estado` y a las semillas `01` a `08`.

## Modelo de datos

Este spec **no cambia tablas ni columnas**. Lee `historial_estado_reporte` del 01:

```sql
historial_estado_reporte (id, reporte_id, estado_anterior NULL, estado_nuevo, usuario_id, comentario NULL, fecha)
-- usuario_id → usuario → empleado (nombres, apellidos) y rol (codigo, nombre)
```

Agrega un script nuevo, `backend/db/09_historial_inmutable_mysql.sql`, con el mismo formato que el 06 (encabezado, idempotente, no recrea la base ni toca datos):

```sql
DROP TRIGGER IF EXISTS trg_historial_sin_update;
CREATE TRIGGER trg_historial_sin_update
  BEFORE UPDATE ON historial_estado_reporte
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El historial de estados no se puede modificar.';
```

Como el 06, recrear la base con el 01 borra el trigger: después del 01 se corren el 05, el 06 y el 09.

### Consultar: `GET /reportes/{id}/historial`

- Ruta en `produccion.routes.js`, con `autenticar` + `requierePermiso('REPORTE_CONSULTAR')`; controlador en `produccion.controller.js` y servicio nuevo `modulos/produccion/historial.service.js` (`listarHistorial`), igual que `listarObservaciones`: `revisarParametros(query, [])`, el `id` entero positivo y `leerReporte` (404 si no existe o está fuera del ámbito).
- Orden: del más antiguo al más reciente, `ORDER BY h.fecha, h.id` (la rectificación y el cierre insertan filas en el mismo segundo).
- La fecha se lee con `UNIX_TIMESTAMP(h.fecha)` y se devuelve en ISO (como `aFechaIso`).
- Sin bitácora: es una lectura.

```json
[
  {
    "id": 1520,
    "estadoAnterior": null,
    "estadoNuevo": "BORRADOR",
    "usuario": { "id": 14, "nombre": "Ana Pérez", "rol": { "codigo": "ESTABLECIMIENTO", "nombre": "Personal del establecimiento" } },
    "fecha": "2026-10-02T15:10:00.000Z",
    "comentario": null
  },
  {
    "id": 1534,
    "estadoAnterior": "BORRADOR",
    "estadoNuevo": "ENVIADO",
    "usuario": { "id": 14, "nombre": "Ana Pérez", "rol": { "codigo": "ESTABLECIMIENTO", "nombre": "Personal del establecimiento" } },
    "fecha": "2026-10-05T21:42:00.000Z",
    "comentario": null
  }
]
```

| Caso | Respuesta |
|---|---|
| Sin `REPORTE_CONSULTAR` | 403 `SIN_PERMISO` (con `ACCESO_DENEGADO`) |
| `id` inválido o cualquier parámetro de consulta | 400 `ENTRADA_INVALIDA` |
| El reporte no existe o está fuera del ámbito (Personal: otro establecimiento; Revisor y administrador: otra DDRISS) | 404 `NO_ENCONTRADO` |
| Todo bien | 200 con la lista (vacía si el reporte no tuviera filas) |

### Pantallas

| Parte | Contenido |
|---|---|
| API | `listarHistorial(id)` en `src/api/produccion.js`. Sin caché: el historial cambia con cada transición. |
| Línea de tiempo | `componentes/HistorialEstadosReporte.jsx`, que recibe la lista ya cargada: un `<ol>` con una fila por cambio, con la insignia del estado nuevo (`InsigniaEstadoReporte`), «desde {estado anterior}» (o «Reporte creado» si es `null`), «{nombre} · {rol}», la fecha y hora en hora de Guatemala (`dd/mm/aaaa hh:mm`) y el comentario si hay. Sin filas: «Sin cambios de estado.». Los nombres de estado salen de `ESTADOS_REPORTE`. |
| Revisar reporte | En `PaginaRevisarReporte.jsx`, una `Card` «Historial de estados» al pie, cargada junto con la pantalla. Si falla, `AvisoError` con `onReintentar` dentro de la tarjeta, sin tapar el resto de la pantalla. Se vuelve a pedir con «Recargar» (después de un 409); asignar se hace en la bandeja, y devolver y aprobar regresan a ella, así que no hay otra recarga. |
| Mis reportes | En `PaginaMisReportes.jsx`, un botón «Historial» en cada fila (con o sin «Abrir»), que abre `paginas/reportes/DialogoHistorialReporte.jsx` (`Dialog` de shadcn) con el título «Historial · {mes}»; pide el historial al abrir, muestra la carga y, si falla, `AvisoError` con `onReintentar`. No cambia la URL ni `opcionesMenu.js`. |
| Captura | En `CapturaReporte.jsx`, un `Collapsible` «Historial de estados» al pie, cerrado al abrir. La primera vez que se despliega pide el historial; se vuelve a pedir si se despliega después de enviar el reporte. Si falla, `AvisoError` con `onReintentar`. |

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, completar `GET /reportes/{id}/historial`: descripción (orden, ámbito, que solo se escribe con las transiciones, el cierre y las rectificaciones, y que la base impide modificarlo), `x-permiso: REPORTE_CONSULTAR`, el esquema `CambioEstadoReporte` con su ejemplo y las respuestas 400, 401, 403 y 404. Comprobación: el YAML se lee bien y `/api/docs` carga sin errores.

2. **Trigger.** Escribir `backend/db/09_historial_inmutable_mysql.sql`. **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`, como los demás). Comprobación: por SQL, un `UPDATE` sobre una fila de la tabla falla con el mensaje del trigger y un `DELETE` de una fila de prueba sigue funcionando.

3. **Backend: consulta.** `historial.service.js`, el controlador y la ruta según el modelo de datos. Pruebas en `tests/historial.test.js`, con el año 2007 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, con la fecha límite `'2099-12-31'`); los reportes de `CS-1201` y de otro establecimiento y sus filas de historial se insertan por SQL (el endpoint solo lee), con usuarios de distintos roles y dos filas en el mismo segundo. Todo se borra al inicio y al final (historial, reportes, meses):
   - `cs1201` lee el historial de su reporte: 200, en orden por fecha y luego por id, con `estadoAnterior`, `estadoNuevo`, `usuario` (`id`, `nombre`, `rol`), `fecha` en ISO con la hora correcta y `comentario` (`null` donde no hay);
   - el revisor y el administrador de `DDRISS_SM` lo leen: 200;
   - `cs1201` con el reporte de otro establecimiento, o un revisor de otra DDRISS: 404; un reporte que no existe: 404;
   - Epidemiología (sin `REPORTE_CONSULTAR`): 403; un `id` inválido o un parámetro de consulta: 400;
   - un `UPDATE` por SQL sobre una fila de prueba falla con el mensaje del trigger, y la limpieza (`DELETE`) funciona.

   Comprobación: pasan `historial.test.js` y `bitacora-inmutable.test.js`, y los archivos que borran historial al limpiar siguen pasando (`reportes.test.js`, `transiciones.test.js` y `resolverRectificacion.test.js` como muestra). La suite completa del backend no se corre en este spec: el trigger solo afecta al `UPDATE`, que ningún código ni prueba hace.

4. **Frontend: componente y «Revisar reporte».** `listarHistorial` en `src/api/produccion.js`, `HistorialEstadosReporte.jsx` y la tarjeta en `PaginaRevisarReporte.jsx`. Pruebas en `HistorialEstadosReporte.test.jsx` y `PaginaRevisarReporte.test.jsx` (sus mocks de `@/api/produccion.js` agregan `listarHistorial`):
   - la línea de tiempo muestra cada cambio en el orden recibido, «Reporte creado» en la fila sin estado anterior, el nombre y el rol, la fecha y hora en hora de Guatemala y el comentario solo si hay; sin filas, «Sin cambios de estado.»;
   - «Revisar reporte» muestra la tarjeta con el historial, también con el reporte `CERRADO`; si falla, el error con «Reintentar» queda solo en la tarjeta, y «Recargar» (después de un 409 al devolver) vuelve a pedir el historial.

   Comprobación: pasan esos archivos.

5. **Frontend: «Mis reportes» y captura.** `DialogoHistorialReporte.jsx`, el botón en `PaginaMisReportes.jsx` y el `Collapsible` en `CapturaReporte.jsx`. Pruebas en `PaginaMisReportes.test.jsx` y `CapturaReporte.test.jsx`:
   - «Historial» aparece en cada fila, también en un mes cerrado; al pulsarlo se abre el diálogo, llama una vez a `listarHistorial` con el id del reporte y muestra la línea de tiempo; si falla, el error con «Reintentar»;
   - en la captura, la tarjeta empieza cerrada y no llama a `listarHistorial`; al desplegarla, la llama y muestra la línea de tiempo.

   Comprobación: `npm test` del frontend pasa completo.

6. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, después de correr el 09:
   - como la estadígrafa: «Revisar reporte» del 524 (CS-1209, octubre de 2026, `APROBADO`) muestra el ciclo completo (creado, enviado, en revisión, corrección solicitada, borrador, enviado, en revisión, aprobado) con sus usuarios y comentarios; el del 223 muestra las dos filas de la rectificación;
   - como `cs1209` (sesión a mano: el acceso rápido entra como `cs1206`): «Mis reportes» → «Historial» del 524 abre el diálogo con la misma línea de tiempo; en la captura de octubre de 2026, «Historial de estados» empieza cerrada y al desplegarla la muestra;
   - por SQL: un `UPDATE` sobre una fila del 524 falla con el mensaje del trigger.

   Documentación:
   - en HU-34, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en `CONTEXTO BD.md`, el script 09 y que el historial no admite `UPDATE` (el `DELETE` solo lo hacen las pruebas);
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: el endpoint y su permiso, el orden, el componente común y sus tres lugares, que después del 01 se corren el 05, el 06 y el 09, y los datos de prueba (año 2007).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET /reportes/{id}/historial` con su esquema, su permiso y sus respuestas, y `/api/docs` carga sin errores.
- [ ] En `backend/` pasan los archivos de prueba del paso 3 y en `frontend/` pasa `npm test`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2007.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y en `backend/db/` solo aparece `09_historial_inmutable_mysql.sql`.
- [ ] Cada cambio de estado del historial muestra el estado anterior, el nuevo, el usuario con su rol, la fecha y hora y el comentario, del más antiguo al más reciente.
- [ ] Un `UPDATE` sobre `historial_estado_reporte` falla con el mensaje del trigger, y la API no tiene ningún endpoint que escriba o borre el historial fuera de las transiciones, el cierre del mes y las rectificaciones.
- [ ] El Personal ve el historial de sus propios reportes, también los cerrados, desde «Mis reportes»; el de otro establecimiento responde 404.
- [ ] El revisor ve el historial en «Revisar reporte» de los reportes de su DDRISS; uno de otra DDRISS responde 404.
- [ ] En la captura, el historial empieza plegado y solo se pide al desplegarlo.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-34 tiene su avance y sus criterios marcados, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** la línea de tiempo en «Revisar reporte», «Mis reportes» y la captura (decidido en la fase de preguntas). «Mis reportes» es la única entrada del Personal a los reportes de meses no abiertos. **No:** una acción en la bandeja de revisión.
- **Sí:** un trigger de `UPDATE` en un script nuevo `09`, como el 06 de la bitácora (decidido en la fase de preguntas). **No:** bloquear también el `DELETE`, que obligaría a cambiar la limpieza de 14 archivos de prueba; ni dejarlo solo a la API, sin protección contra sentencias a mano.
- **Sí:** el usuario con nombre y rol actual (decidido en la fase de preguntas). **No:** solo el nombre; ni guardar el rol en cada fila, que cambiaría el modelo.
- **Sí:** del más antiguo al más reciente, desempatando por id (decidido en la fase de preguntas). **No:** el orden inverso de las observaciones.
- **Sí:** en «Mis reportes», un diálogo (decidido en la fase de preguntas). **No:** una pantalla propia con su subruta.
- **Sí:** en la captura, una tarjeta plegable cerrada que pide el historial al desplegarse (decidido en la fase de preguntas). **No:** una tarjeta siempre visible, que suma una petición a cada carga; ni un botón con diálogo.
- **Sí:** solo cambios de estado (decidido en la fase de preguntas). **No:** sumar las reasignaciones desde la bitácora, que mezcla dos fuentes.
- **Sí:** solo fecha y hora (decidido en la fase de preguntas). **No:** la duración en cada estado.
- **Sí:** el endpoint en `modulos/produccion/` con `REPORTE_CONSULTAR` y `leerReporte`, como `GET /reportes/{id}/observaciones`, así sirve al Personal, al revisor y al administrador sin permisos nuevos. Decidido al escribir el spec.
- **Sí:** el componente de la línea de tiempo en `componentes/`, porque lo usan pantallas de `registro/`, `revision/` y `reportes/`. Decidido al escribir el spec.
- **Sí:** las pruebas del backend insertan los reportes y su historial por SQL (el endpoint solo lee) y usan el año 2007, que no usa ningún otro archivo. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Recrear la base con el 01 borra el trigger | Se anota en `CLAUDE.md` y `CONTEXTO BD.md` que después del 01 se corre el 09, y `historial.test.js` falla si falta. |
| Un spec futuro necesita corregir una fila del historial | No debe: el historial solo crece. Si hiciera falta, se decide en su spec y con autorización sobre `backend/db/`. |
| Los mocks de `@/api/produccion.js` de otras pruebas no traen `listarHistorial` | «Revisar reporte» lo pide siempre, así que su prueba lo agrega; la captura solo lo pide al desplegar, así que sus pruebas actuales no lo necesitan. |
| El rol mostrado no es el que tenía el usuario al hacer el cambio | Es una diferencia aceptada y escrita en el spec; el contrato lo dice en la descripción. |

## Lo que **no** entra en este spec

- Reasignaciones y otros eventos que no son cambios de estado.
- Duraciones o tiempos calculados.
- Pantallas para el administrador, Epidemiología o Autoridad, y una acción en la bandeja.
- Guardar el rol en cada fila o impedir el `DELETE` en la base.
- Cambios a permisos, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
