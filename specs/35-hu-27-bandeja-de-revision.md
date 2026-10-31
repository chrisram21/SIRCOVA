# SPEC 35 — Bandeja de revisión y asignación de revisor

> **Estado:** Implementado
> **Historia:** HU-27
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 12, SPEC 16, SPEC 22, SPEC 33 y SPEC 34
> **Fecha:** 2026-10-30
> **Objetivo:** Que la estadígrafa y los revisores de la DDRISS vean en «Revisión y cierre» los reportes de un mes, filtrados por estado y municipio, y asignen un reporte enviado a sí mismos o a otro revisor, lo que lo pasa a `EN_REVISION`.

## Por qué existe este spec

El menú ya tiene la opción «Revisión y cierre» (`/revision`, permiso provisional `REPORTE_REVISAR`, SPEC 06), pero sin pantalla. El SPEC 34 construyó `POST /reportes/{id}/transiciones` con el mecanismo común y dejó `PERMISO_POR_DESTINO` para que cada spec de revisión agregue su destino; `transicion_estado` (01) ya tiene `ENVIADO → EN_REVISION` del rol `REVISOR`. Hoy un reporte enviado no lo ve nadie de la DDRISS: el Revisor no tiene `REPORTE_CONSULTAR` y `GET /reportes` está pensado para el Personal.

**Diferencias con la historia y el mockup** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- De la pantalla 5 (`Revision.html`) entran el encabezado, los chips de estado, los filtros y la tabla. El panel de detalle con observaciones, «Solicitar corrección» y «Aprobar» es de HU-28, y «Cerrar periodo» y el avance «19 de 30 aprobados o cerrados» son del cierre del mes.
- «Puedo filtrar por periodo, municipio y estado»: el periodo es un mes a la vez (el selector tiene todos los meses de la DDRISS, también los cerrados), el municipio es un filtro y el estado son los chips.
- Además de asignar desde `ENVIADO`, el revisor asignado puede pasar un reporte `EN_REVISION` a otro revisor (reasignar), con un endpoint aparte porque no es una transición.
- Se agrega el chip «Asignados a mí», que no está en el mockup.

## Alcance

**Entra:**

- `GET /revision/bandeja`: los reportes de un mes de la DDRISS del usuario, con los establecimientos que todavía no envían, paginados y con los conteos de cada chip.
- `GET /revision/revisores`: los revisores activos de la DDRISS del usuario, para el diálogo de asignar.
- El destino `EN_REVISION` en `POST /reportes/{id}/transiciones`, con `revisorId` en el cuerpo: llena `revisor_id` y `asignado_en`.
- `PATCH /reportes/{id}/revisor`: el revisor asignado pasa un reporte `EN_REVISION` a otro revisor, sin cambiar el estado.
- Los permisos `REPORTE_REVISAR` y `REPORTE_ASIGNAR` (módulo `REVISION`), solo para el rol `REVISOR`, en `05_permisos_mysql.sql`.
- La pantalla «Bandeja de revisión» en `/revision` (`paginas/revision/`), con el selector de mes, el filtro de municipio, los chips, la tabla paginada y el diálogo de asignar o reasignar.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-27, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- El panel de detalle del reporte, las observaciones, aprobar y pedir corrección (HU-28).
- Abrir el reporte desde la fila: la fila no navega hasta que HU-28 tenga la vista de revisión.
- Cerrar el periodo y el avance del cierre del mes.
- Acciones sobre los establecimientos sin enviar (recordatorios, alertas de atraso).
- Quitar la asignación (volver a `ENVIADO`).
- La tarjeta de la bandeja en el Inicio del Revisor.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Lee y escribe las tablas del 01 tal como están:

```sql
-- reporte_produccion: al asignar (ENVIADO → EN_REVISION)
estado = 'EN_REVISION', revisor_id = :revisorId, asignado_en = NOW(), version_fila = version_fila + 1

-- reporte_produccion: al reasignar (sigue EN_REVISION)
revisor_id = :revisorNuevo, asignado_en = NOW(), version_fila = version_fila + 1

-- historial_estado_reporte: solo la asignación (es una transición); reasignar no escribe historial
```

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REPORTE_REVISAR` | `REVISION` | Consultar la bandeja de revisión de su DDRISS y sus revisores | REVISOR |
| `REPORTE_ASIGNAR` | `REVISION` | Asignar los reportes enviados de su DDRISS y reasignar los suyos | REVISOR |

Además, el Revisor recibe `MUNICIPIO_CONSULTAR` (ya existe; solo lectura) para las opciones del filtro de municipio con `GET /municipios`. Se agregó en el paso 6, con autorización.

`PERMISO_POR_DESTINO` (`modulos/revision/transiciones.service.js`) queda `{ ENVIADO: 'REPORTE_ENVIAR', EN_REVISION: 'REPORTE_ASIGNAR' }`.

**Chips** (parámetro `grupo` de la bandeja; los conteos van siempre con el mes y el municipio elegidos):

| `grupo` | Etiqueta | Qué cuenta |
|---|---|---|
| `POR_ATENDER` (por defecto) | Por atender | `ENVIADO` + `EN_REVISION` |
| `ASIGNADOS_A_MI` | Asignados a mí | `EN_REVISION` con `revisor_id` del usuario |
| `EN_REVISION` | En revisión | `EN_REVISION` |
| `ENVIADO` | Enviado | `ENVIADO` |
| `CORRECCION_SOLICITADA` | Corrección solicitada | `CORRECCION_SOLICITADA` |
| `SIN_ENVIAR` | Sin enviar | establecimientos activos con `reporta_5c` de la DDRISS sin reporte del mes, más los reportes en `BORRADOR` |
| `APROBADO` | Aprobado | `APROBADO` |
| `CERRADO` | Cerrado | `CERRADO` + `RECTIFICACION` |
| `TODOS` | Todos | todo lo anterior, sin repetir |

**Respuesta de la bandeja** (paginada como el SPEC 12, más los conteos):

```json
{
  "elementos": [
    {
      "reporteId": 524,
      "versionFila": 13,
      "establecimiento": { "id": 9, "codigo": "CS-1209", "nombre": "Centro de Salud Tajumulco" },
      "municipio": { "id": 9, "nombre": "Tajumulco" },
      "estado": "ENVIADO",
      "enviadoEn": "2026-10-31T02:58:01.000Z",
      "revisor": null,
      "advertencias": 1,
      "dosisTotales": 85
    },
    { "reporteId": null, "versionFila": null, "establecimiento": { "...": "..." }, "municipio": { "...": "..." },
      "estado": null, "enviadoEn": null, "revisor": null, "advertencias": 0, "dosisTotales": null }
  ],
  "total": 6, "pagina": 1, "porPagina": 20,
  "conteos": { "POR_ATENDER": 6, "ASIGNADOS_A_MI": 2, "EN_REVISION": 4, "ENVIADO": 2, "CORRECCION_SOLICITADA": 3,
               "SIN_ENVIAR": 2, "APROBADO": 5, "CERRADO": 14, "TODOS": 30 }
}
```

- `estado: null` = el establecimiento no tiene reporte del mes. `revisor` es `{ id, nombre }` (nombres y apellidos del empleado) o `null`.
- `advertencias` = resultados `ADVERTENCIA` en `ABIERTO` o `JUSTIFICADO` de `resultado_validacion`; `dosisTotales` = la suma de `reporte_vacuna.total_declarado` (`null` si no hay ninguna).
- Orden: `enviado_en` ascendente (los más antiguos primero), los que no tienen `enviado_en` al final, y después por municipio y establecimiento.
- Parámetros: `periodoId` (obligatorio, un mes con `cierre_periodo` de la DDRISS del usuario), `municipioId`, `grupo`, `pagina`, `porPagina`. Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA`; un `periodoId` sin `cierre_periodo` de la DDRISS, 404.

**Asignar:** `POST /reportes/{id}/transiciones` con `{ estadoDestino: 'EN_REVISION', versionFila, revisorId }`. `revisorId` es obligatorio con `EN_REVISION` y no se acepta con otro destino (400). Debe ser una cuenta activa, con empleado activo, del rol `REVISOR` y de la DDRISS del reporte (422 `REVISOR_INVALIDO`). Bitácora: la `CAMBIO_ESTADO` del SPEC 34 con `valoresNuevos: { estado: 'EN_REVISION', revisorId }`.

**Reasignar:** `PATCH /reportes/{id}/revisor` con `{ revisorId, versionFila }`, permiso `REPORTE_ASIGNAR`:

| Código HTTP | Código | Cuándo |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | id o `revisorId` no enteros positivos, `versionFila` ausente o no entera, claves de más |
| 403 | `SIN_PERMISO` | sin `REPORTE_ASIGNAR` |
| 404 | `NO_ENCONTRADO` | el reporte no existe o no es de su DDRISS |
| 409 | `REPORTE_NO_EN_REVISION` | el reporte no está `EN_REVISION` |
| 403 | `NO_ES_REVISOR_ASIGNADO` | el usuario no es el revisor asignado |
| 422 | `REVISOR_INVALIDO` | el revisor nuevo no es un revisor activo de la DDRISS, o es el mismo asignado |
| 409 | `REPORTE_DESACTUALIZADO` | `versionFila` no es la del reporte |

Bitácora: `MODULOS.REVISION`, `ACCIONES.ACTUALIZAR`, `entidad: 'reporte_produccion'`, con `{ revisorId }` antes y después. Responde `{ versionFila, revisor }`.

**Revisores:** `GET /revision/revisores` (permiso `REPORTE_REVISAR`) responde `[{ id, nombre }]`: las cuentas activas, con empleado activo, del rol `REVISOR` de la DDRISS del usuario, ordenadas por nombre.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: `GET /revision/bandeja` (con el esquema `BandejaRevision`, sus parámetros y el enumerado de `grupo`), `GET /revision/revisores`, `PATCH /reportes/{id}/revisor` con un ejemplo por cada error de su tabla, y en `POST /reportes/{id}/transiciones` el destino `EN_REVISION` (`REPORTE_ASIGNAR`), `revisorId` y el 422 `REVISOR_INVALIDO`. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 35 (HU-27)" con `REPORTE_REVISAR` y `REPORTE_ASIGNAR` (módulo `REVISION`) asignados a REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, los dos permisos quedan solo en REVISOR.

3. **Backend: bandeja y revisores.** En `modulos/revision/`, `bandeja.service.js` con `GET /revision/bandeja` y `GET /revision/revisores` (rutas con `autenticar` + `requierePermiso('REPORTE_REVISAR')`). La bandeja arma una sola consulta base (los establecimientos activos con `reporta_5c` de la DDRISS con su reporte del mes, si tiene) que usan el `COUNT(*)`, la página y los conteos, con el filtro de municipio y el `WHERE` del grupo. Las fechas se leen con `UNIX_TIMESTAMP` (nota del 2026-10-21). Pruebas en `tests/bandeja.test.js`, con el año 2016 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, y reportes de establecimientos de la semilla en cada estado), que se borran al inicio y al final:
   - cada grupo trae lo suyo y los conteos coinciden con los elementos de cada grupo;
   - `SIN_ENVIAR` incluye un establecimiento sin reporte y uno en `BORRADOR`, y no uno inactivo ni uno sin `reporta_5c`;
   - el orden es por `enviado_en`, con los sin enviar al final;
   - `advertencias` y `dosisTotales` salen de `resultado_validacion` y `reporte_vacuna`;
   - el filtro de municipio, la paginación y una página fuera de rango;
   - parámetros inválidos responden 400, un mes sin `cierre_periodo` de la DDRISS 404, y el Personal del establecimiento 403;
   - `GET /revision/revisores` trae solo los revisores activos de la DDRISS.

   Comprobación: las pruebas nuevas pasan.

4. **Backend: asignar y reasignar.** En `transiciones.service.js`, `EN_REVISION: 'REPORTE_ASIGNAR'` en `PERMISO_POR_DESTINO`, `revisorId` en el cuerpo (obligatorio solo con `EN_REVISION`) y su efecto: revisar el revisor dentro de la transacción y llenar `revisor_id` y `asignado_en`. `PATCH /reportes/{id}/revisor` en `revision.routes.js` y un servicio propio, en una `enTransaccion` cuya primera consulta es el `SELECT … FOR UPDATE` del reporte, revisando en el orden de la tabla de errores. Pruebas en `tests/transiciones.test.js` (casos nuevos, con su año 2017: se envía un reporte y luego se asigna) y `tests/reasignar.test.js` (año 2015). No usan 2016 porque `bandeja.test.js` borra ese año y Vitest corre los archivos en paralelo:
   - asignarse un reporte `ENVIADO` lo pasa a `EN_REVISION` con `revisor_id`, `asignado_en`, historial y `CAMBIO_ESTADO`; asignarlo a otro revisor también;
   - `revisorId` que no es revisor activo de la DDRISS responde 422 `REVISOR_INVALIDO`; sin `revisorId`, 400; con `revisorId` y destino `ENVIADO`, 400;
   - el Personal recibe 403 al pedir `EN_REVISION`; un reporte `EN_REVISION` no se vuelve a asignar (422 `TRANSICION_NO_PERMITIDA`);
   - el revisor asignado reasigna: cambia `revisor_id` y `asignado_en`, sube `versionFila`, deja la fila `ACTUALIZAR` y no escribe historial;
   - otro revisor recibe 403 `NO_ES_REVISOR_ASIGNADO`; un reporte que no está `EN_REVISION`, 409; el mismo revisor o uno inválido, 422; `versionFila` vieja, 409.

   Comprobación: `npm test` del backend pasa completo.

5. **Frontend: API y diálogo.** En `src/api/revision.js`: `obtenerBandeja({ periodoId, municipioId, grupo, pagina, porPagina })`, `listarRevisores()`, `asignarRevisor(reporteId, { versionFila, revisorId })` (la transición a `EN_REVISION`) y `reasignarRevisor(reporteId, { versionFila, revisorId })`. `paginas/revision/DialogoAsignarRevisor.jsx` (`AlertDialog`): en modo asignar, «Asignármelo» y un `Select` con los otros revisores; en modo reasignar, solo el `Select`, sin el revisor actual. Pruebas en `DialogoAsignarRevisor.test.jsx`: los dos modos, que llama una vez con la `versionFila`, el error (409 con «Recargar») y «Cancelar».

   Comprobación: la prueba pasa.

6. **Frontend: bandeja.** `paginas/revision/PaginaBandejaRevision.jsx` como `pagina` de «Revisión y cierre» en `opcionesMenu.js` (se confirma `REPORTE_REVISAR`):
   - `EncabezadoPagina` con el antetítulo «Revisión y cierre · Periodo {mes}» y el título «Bandeja de revisión»;
   - el selector de mes (los meses de `GET /periodos` con `cierre_periodo` de la DDRISS, por defecto el `ABIERTO` o `EN_CIERRE` más antiguo, y sin ninguno, el más reciente), el filtro de municipio y los chips con sus conteos, todo en la URL (`useSearchParams`);
   - la tabla con Municipio · establecimiento, Enviado, Estado (`InsigniaEstadoReporte`; «Sin reporte» para `estado: null`), Validación («N advertencias» o «sin advertencias»), Dosis totales, Revisor y la acción: «Asignar» en `ENVIADO` (con `REPORTE_ASIGNAR`) y «Reasignar» en `EN_REVISION` cuando el usuario es el revisor asignado;
   - `PaginacionUsuarios`, estados de carga, vacío y error (`AvisoError` con «Reintentar»), y `toast.success` al asignar o reasignar, que recarga la página de la bandeja.

   Pruebas en `PaginaBandejaRevision.test.jsx`: el mes por defecto, los chips y la URL, las columnas (también una fila sin reporte), cuándo se ven «Asignar» y «Reasignar», asignar recarga con el `toast`, y el error de carga. Comprobación: `npm test` del frontend pasa completo.

7. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright, como la estadígrafa (`estadigrafa`) en octubre de 2026:
   - el reporte 524 (CS-1209, enviado en la prueba del SPEC 34) aparece en «Por atender» y en «Enviado», y los que faltan en «Sin enviar»;
   - el filtro de municipio y otro mes (uno cerrado) cambian la tabla y la URL;
   - asignarlo a otro revisor (`revisor2`): pasa a «En revisión» con ese revisor; como `revisor2`, aparece en «Asignados a mí» y lo reasigna a la estadígrafa;
   - revisar por SQL `revisor_id`, `asignado_en`, el historial `ENVIADO → EN_REVISION` y las filas `CAMBIO_ESTADO` y `ACTUALIZAR` de la bitácora.

   Como Personal del establecimiento: `GET /revision/bandeja` responde 403 y «Revisión y cierre» no aparece en el menú.

   Documentación:
   - en HU-27, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en `CONTEXTO BD.md`, que `revisor_id` y `asignado_en` los escriben la asignación y la reasignación, y que reasignar no deja historial;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: `bandeja.service.js`, los grupos, `EN_REVISION` en `PERMISO_POR_DESTINO` con `revisorId`, el `PATCH` de reasignar y los datos de prueba (año 2016).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET /revision/bandeja`, `GET /revision/revisores`, `PATCH /reportes/{id}/revisor` y el destino `EN_REVISION` de `/transiciones` con sus permisos y errores, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan datos de los años 2015, 2016 ni 2017.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] La bandeja solo muestra reportes y establecimientos de la DDRISS del usuario, de un mes, ordenados por fecha de envío, con los sin enviar al final.
- [ ] Los chips filtran por su grupo y sus conteos coinciden con lo que muestran; «Sin enviar» incluye los establecimientos sin reporte del mes.
- [ ] Se puede filtrar por mes (también uno cerrado) y por municipio, y los filtros quedan en la URL.
- [ ] Al asignar un reporte `ENVIADO` a sí mismo o a otro revisor activo de la DDRISS, pasa a `EN_REVISION` con `revisor_id`, `asignado_en`, una fila de historial y una `CAMBIO_ESTADO`.
- [ ] Solo el revisor asignado puede reasignar un reporte `EN_REVISION`; reasignar cambia `revisor_id` y `asignado_en`, deja una `ACTUALIZAR` y no cambia el estado ni escribe historial.
- [ ] Un revisor inválido responde 422 `REVISOR_INVALIDO`, una `versionFila` vieja 409, y el Personal del establecimiento 403 en la bandeja y al pedir `EN_REVISION`.
- [ ] «Revisión y cierre» abre la bandeja solo con `REPORTE_REVISAR`, y «Asignar» y «Reasignar» solo aparecen cuando el usuario puede usarlos.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-27 tiene su avance y sus criterios marcados, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** de la pantalla 5, solo la bandeja y asignar (decidido en la fase de preguntas). **No:** el panel de detalle, que es de HU-28, ni «Cerrar periodo».
- **Sí:** un endpoint propio, `GET /revision/bandeja`, con los conteos de los chips en la misma respuesta (decidido en la fase de preguntas). **No:** ampliar `GET /reportes` y dar `REPORTE_CONSULTAR` al Revisor, que mezcla la lista del Personal con la de la DDRISS y pide otra petición para los conteos.
- **Sí:** asignar a sí mismo o a otro revisor activo de la DDRISS, con `GET /revision/revisores` (decidido en la fase de preguntas). **No:** solo «tomar para revisar».
- **Sí:** reasignar con `PATCH /reportes/{id}/revisor`, solo por el revisor asignado (decidido en la fase de preguntas). No es una transición: no pasa por `/transiciones` ni escribe historial, pero sí bitácora. **No:** que cualquier revisor reasigne, ni pedir motivo.
- **Sí:** los permisos `REPORTE_REVISAR` (consultar) y `REPORTE_ASIGNAR` (asignar y reasignar), solo para REVISOR (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** un solo permiso.
- **Sí:** «Sin enviar» lista los establecimientos activos con `reporta_5c` sin reporte del mes y los reportes en `BORRADOR` (decidido en la fase de preguntas). **No:** solo reportes enviados.
- **Sí:** un mes a la vez; por defecto el `ABIERTO` o `EN_CIERRE` más antiguo, y en el selector todos los meses de la DDRISS, también los cerrados (decidido en la fase de preguntas). **No:** varios meses juntos.
- **Sí:** los chips del mockup más «Asignados a mí»; las columnas del mockup más «Revisor»; la paginación común (decidido en la fase de preguntas).
- **Sí:** `revisorId` en el cuerpo de `/transiciones`, obligatorio solo con `EN_REVISION`. El diálogo manda el id propio con «Asignármelo». Decidido al escribir el spec, para no inventar un endpoint de asignar fuera del mecanismo común.
- **Sí:** «Cerrado» cuenta también `RECTIFICACION`, que el mockup no tiene. Decidido al escribir el spec.
- **Sí:** `advertencias` cuenta las `ADVERTENCIA` en `ABIERTO` o `JUSTIFICADO`, las que viajan con el reporte (SPEC 34). Decidido al escribir el spec.
- **Sí:** quien no es el revisor asignado recibe 403 `NO_ES_REVISOR_ASIGNADO` al reasignar, sin fila `ACCESO_DENEGADO` (no es un permiso que le falta). Decidido al escribir el spec.
- **Sí:** las pruebas de la bandeja usan el año 2016 y establecimientos de la semilla; las de asignar, el 2017 de `transiciones.test.js`, y las de reasignar, el 2015, porque Vitest corre los archivos en paralelo y cada uno borra su año. Decidido al escribir el spec y corregido en el paso 4.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los conteos de los chips y la página salen de consultas distintas y no coinciden | Una sola consulta base para el `COUNT(*)`, la página y los conteos (nota del 2026-10-22); una prueba compara cada conteo con los elementos de su grupo. |
| Dos revisores asignan el mismo reporte a la vez | El `FOR UPDATE` del SPEC 34 y `versionFila`: el segundo recibe 409 o 422 `TRANSICION_NO_PERMITIDA`. |
| Un revisor desactivado sigue asignado | La bandeja lo muestra igual; reasignar a otro sigue disponible para quien lo tiene asignado, y si es el desactivado, queda para un spec de administración. |
| El permiso nuevo no llega al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |
| La asignación de la prueba manual no se deshace | Usar el reporte 524, ya enviado para pruebas; para volverlo a `ENVIADO`, solo por SQL con autorización. |

## Lo que **no** entra en este spec

- El detalle del reporte, las observaciones, aprobar y pedir corrección.
- Cerrar el periodo y su avance.
- Recordatorios o alertas a los establecimientos sin enviar.
- Quitar la asignación.
- La bandeja en el Inicio.
- Cambios al modelo, a `transicion_estado` o a las semillas.

Cada uno, si se hace, va en su propio spec.
