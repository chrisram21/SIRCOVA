# SPEC 39 — Cerrar el periodo

> **Estado:** Implementado
> **Historia:** HU-31
> **Depende de:** SPEC 04, SPEC 05, SPEC 16, SPEC 22, SPEC 26, SPEC 34, SPEC 35, SPEC 37 y SPEC 38
> **Fecha:** 2026-10-31
> **Objetivo:** Que el mes de una DDRISS pase solo a `EN_CIERRE` al vencer su fecha límite y que el revisor lo cierre desde la bandeja o desde «Periodos» cuando ningún reporte sigue en el ciclo, lo que pasa el mes a `CERRADO` y sus reportes aprobados a `CERRADO`.

## Por qué existe este spec

`cierre_periodo` (01) ya tiene `ABIERTO`, `EN_CIERRE` y `CERRADO`, con `cerrado_por` y `cerrado_en`, pero nadie escribe `EN_CIERRE` ni `CERRADO`: hoy solo se llega a `EN_CIERRE` a mano y el `PATCH /periodos/{id}` (SPEC 16) lo devuelve a `ABIERTO`. `transicion_estado` ya tiene `APROBADO → CERRADO` para REVISOR, sin comentario, y `reporte_produccion` tiene `cerrado_en`. Crear un reporte ya exige el mes `ABIERTO` (SPEC 22) y guardar, validar y enviar aceptan `ABIERTO` y `EN_CIERRE` (`MESES_EDITABLES`). La bandeja (SPEC 35) ya tiene el mes y los conteos por grupo.

**Diferencias con la historia, el mockup y `AGENTS.md`** (lo decidió el equipo en la fase de preguntas):

- **Regla 3 de `AGENTS.md`.** Dice que el estado del reporte solo cambia con `POST /reportes/{id}/transiciones`. El cierre del mes (`POST /periodos/{id}/cerrar`) pasa los aprobados a `CERRADO` en la misma transacción que el mes, revisando `APROBADO → CERRADO` en `transicion_estado` para el rol, con historial y bitácora por reporte. Es una excepción, y se anota en la regla 3.
- «El cierre final lo hace la estadígrafa»: lo hace el rol `REVISOR` (estadígrafa y revisores; el modelo no los distingue), con el permiso nuevo `PERIODO_CERRAR`.
- «Dispara el cálculo de indicadores»: el motor (`corrida_calculo`, HU-36) todavía no existe. El cierre no crea corridas; se anota en HU-36 que debe dispararse al cerrar (motivo `CIERRE_PERIODO`).
- «Los que están en revisión o devueltos siguen su ciclo»: además, en `EN_CIERRE` el Personal puede seguir editando y enviando **cualquier** borrador que ya exista. Solo no se crean reportes nuevos.
- El mockup (`Revision.html`) pone el botón en la bandeja. También va en Administración › Periodos.

## Alcance

**Entra:**

- **Paso automático a `EN_CIERRE`:** una tarea del servidor (`setInterval` en `server.js`, sin librería nueva) que al arrancar y cada hora pasa a `EN_CIERRE` los `cierre_periodo` `ABIERTO` cuya `fecha_limite_envio` ya pasó (fecha de Guatemala), con una fila de bitácora por mes y `usuario_id` `NULL`.
- **Defensa al crear:** `POST /reportes` responde 409 `PERIODO_NO_ABIERTO` si la fecha límite ya pasó, aunque la tarea no haya corrido.
- **Cierre final:** `POST /periodos/{id}/cerrar`, con el permiso nuevo `PERIODO_CERRAR`, solo para un mes `EN_CIERRE` de la DDRISS del usuario y sin reportes en el ciclo. Pasa el mes a `CERRADO` (`cerrado_por`, `cerrado_en`) y cada reporte `APROBADO` a `CERRADO` (`cerrado_en`), con historial y bitácora, en una sola transacción.
- **Resumen del cierre en la bandeja:** `GET /revision/bandeja` agrega `cierre` con el estado del mes, la fecha límite y los conteos que usa el cierre.
- El permiso `PERIODO_CERRAR` (módulo `REVISION`) para el rol `REVISOR`, en `05_permisos_mysql.sql`.
- **Bandeja:** «N de M aprobados o cerrados» y el botón «Cerrar periodo de {mes}» en el encabezado, con el diálogo `DialogoCerrarPeriodo.jsx`.
- **Periodos:** el botón «Cerrar periodo» en las filas `EN_CIERRE`, con el mismo diálogo.
- **Registro e Inicio:** los meses `EN_CIERRE` donde el establecimiento tiene un reporte en `BORRADOR` o `CORRECCION_SOLICITADA` se ofrecen junto a los abiertos (nota de HU-31 del SPEC 37).
- **Mis reportes:** «Abrir» también en esos reportes de meses `EN_CIERRE`.
- La excepción en la regla 3 de `AGENTS.md`.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-31, notas en HU-36 y HU-32, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- El cálculo de indicadores al cerrar (HU-36).
- Reabrir un mes `CERRADO`. Corregir un reporte cerrado es la rectificación (HU-32 y HU-33).
- Cerrar por el administrador: `PERIODO_CERRAR` es solo de REVISOR y `transicion_estado` no se toca.
- Alertas o avisos de la fecha límite (HU de alertas).
- Qué pasa con los borradores nunca enviados de un mes cerrado: quedan `BORRADOR`, sin editarse, como un establecimiento que no reportó.
- Un aviso en la captura de que el mes está en cierre.
- Cambios al modelo de datos, a `transicion_estado` y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe las tablas del 01 tal como están:

```sql
-- Paso automático
cierre_periodo: estado 'ABIERTO' → 'EN_CIERRE'   -- si fecha_limite_envio < hoy (Guatemala)

-- Cierre final
cierre_periodo:      estado = 'CERRADO', cerrado_por = <usuario>, cerrado_en = NOW()
reporte_produccion:  estado 'APROBADO' → 'CERRADO', cerrado_en = NOW(), version_fila = version_fila + 1
historial_estado_reporte: una fila APROBADO → CERRADO por reporte, con el usuario y el comentario 'Cierre del periodo.'
```

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `PERIODO_CERRAR` | `REVISION` | Cerrar un mes en cierre de su DDRISS y pasar sus reportes aprobados a Cerrado | REVISOR |

### Reportes que impiden el cierre

Un reporte del mes (de un establecimiento de la DDRISS) **sigue en el ciclo** si está:

- `ENVIADO`, `EN_REVISION` o `CORRECCION_SOLICITADA`, o
- `BORRADOR` con `enviado_en` no nulo (devuelto en corrección).

Un `BORRADOR` nunca enviado no impide el cierre. Un establecimiento sin reporte tampoco. `faltanPorAprobar` cuenta los reportes en el ciclo, con la misma regla en la bandeja y en el cierre.

### Paso automático: `modulos/revision/cierre.service.js`

- `pasarMesesVencidos(hoy = hoyGuatemala())`: en `enTransaccion`, `SELECT … FOR UPDATE` de los `cierre_periodo` `ABIERTO` con `fecha_limite_envio < hoy` (de todas las DDRISS), los pasa a `EN_CIERRE` y deja por cada uno una fila de bitácora: `usuario_id` `NULL`, módulo `CONFIGURACION`, acción `ACTUALIZAR`, entidad `cierre_periodo`, `{ estado: 'ABIERTO' }` → `{ estado: 'EN_CIERRE' }`. Devuelve cuántos pasó.
- `iniciarTareaDeCierre()`: la llama `server.js` (no `app.js`, así las pruebas no la arrancan). Corre al arrancar y cada `INTERVALO_MS` (1 h). Un error se escribe con `console.error` y no detiene la API. `detener()` limpia el intervalo.
- `hoy` es un parámetro para que las pruebas usen una fecha fija y solo toquen sus meses.

### Cierre final: `POST /periodos/{id}/cerrar`

Sin cuerpo (un cuerpo con campos responde 400). Ruta en `revision.routes.js`, con `autenticar` + `requierePermiso('PERIODO_CERRAR')`.

En una transacción:

1. `SELECT … FOR UPDATE` del `cierre_periodo` del mes y la DDRISS del usuario, como **primera** consulta.
2. `SELECT … FOR UPDATE` de **todos** los reportes del mes de los establecimientos de la DDRISS (así un envío en curso termina antes o espera y ve el mes cerrado).
3. La transición `APROBADO → CERRADO` en `transicion_estado` para el rol del usuario.
4. Los cambios del modelo de datos, el historial y la bitácora.

| Caso | Respuesta |
|---|---|
| Sin `PERIODO_CERRAR` | 403 `SIN_PERMISO` (con `ACCESO_DENEGADO`, como todo `requierePermiso`) |
| El mes no existe o no tiene `cierre_periodo` de la DDRISS | 404 `NO_ENCONTRADO` |
| El mes está `ABIERTO` | 409 `PERIODO_NO_EN_CIERRE` «El mes sigue abierto: se cierra cuando vence su fecha límite.» |
| El mes ya está `CERRADO` | 409 `PERIODO_YA_CERRADO` |
| Hay reportes en el ciclo | 409 `PERIODO_CON_PENDIENTES` «Faltan N reportes por aprobar.», con `faltanPorAprobar` en el cuerpo |
| El rol no tiene `APROBADO → CERRADO` | 422 `TRANSICION_NO_PERMITIDA` |
| Todo bien | 200 con el periodo (el mismo objeto de `GET /periodos`) y `reportesCerrados` |

Un mes sin reportes aprobados también se cierra (`reportesCerrados: 0`).

Bitácora:

- una `CAMBIO_ESTADO` por reporte (módulo `REVISION`, entidad `reporte_produccion`): `{ estado: 'APROBADO' }` → `{ estado: 'CERRADO', cierrePeriodoId }`;
- una `ACTUALIZAR` del mes (módulo `REVISION`, entidad `cierre_periodo`): `{ estado: 'EN_CIERRE' }` → `{ estado: 'CERRADO', reportesCerrados: n }`.

Un reporte `CERRADO` ya no se edita: guardar, agregar o quitar una vacuna y validar exigen `BORRADOR` (409 `REPORTE_NO_EDITABLE`), y en un mes `CERRADO` responden 409 `PERIODO_CERRADO`. Este spec solo lo comprueba.

### Resumen en `GET /revision/bandeja`

```json
{
  "elementos": [],
  "total": 0,
  "pagina": 1,
  "porPagina": 20,
  "conteos": {},
  "cierre": {
    "estado": "EN_CIERRE",
    "fechaLimiteEnvio": "2026-11-10",
    "establecimientos": 30,
    "aprobados": 5,
    "cerrados": 14,
    "faltanPorAprobar": 9
  }
}
```

- `cierre` no depende de los filtros (`municipioId`, `grupo`, página): es de todo el mes de la DDRISS.
- `establecimientos` es el conteo de «Todos» sin filtro de municipio; `cerrados` cuenta `CERRADO` y `RECTIFICACION`, como el chip «Cerrado».

### Pantallas

| Parte | Contenido |
|---|---|
| Bandeja, encabezado | «{aprobados + cerrados} de {establecimientos} aprobados o cerrados» y el botón «Cerrar periodo de {mes}», solo con `PERIODO_CERRAR`. |
| Botón deshabilitado | Con el mes `ABIERTO`: nota «Se puede cerrar cuando venza la fecha límite ({dd/mm/aaaa}).»; con reportes en el ciclo: «Faltan N reportes por aprobar.» (ligada con `aria-describedby`). Con el mes `CERRADO`, en lugar del botón, la insignia «Cerrado». |
| Periodos | En las filas `EN_CIERRE`, el botón «Cerrar periodo», solo con `PERIODO_CERRAR`. |
| Diálogo | `paginas/revision/DialogoCerrarPeriodo.jsx` (`AlertDialog`). Al abrir pide el resumen fresco (`obtenerBandeja({ periodoId, porPagina: 1 })`). Título «¿Cerrar el periodo de {mes} de {año}?». Texto «Los N reportes aprobados pasan a Cerrado y el mes ya no admite cambios, solo rectificaciones.». Con pendientes: «Faltan N reportes por aprobar.» y «Cerrar periodo» deshabilitado. «Cerrar periodo» / «Cancelar». |
| Al terminar | `toast.success('Periodo de {mes} cerrado: N reportes cerrados.')`, el diálogo se cierra y la pantalla recarga sus datos. `cerrarPeriodo` invalida la caché de `/periodos` (`yLuegoInvalidar`). |
| Errores | Un 409 (`PERIODO_CON_PENDIENTES`, `PERIODO_NO_EN_CIERRE`, `PERIODO_YA_CERRADO`) se muestra en el diálogo con «Recargar»; otro error, sin «Recargar». El diálogo sigue abierto. |
| Registro | `cargarMesesAbiertos` (`paginas/registro/mesesAbiertos.js`) también trae los meses `EN_CIERRE` y se queda con los que tienen un reporte del establecimiento en `BORRADOR` o `CORRECCION_SOLICITADA`. En un mes `EN_CIERRE` nunca se ofrece crear un reporte. |
| Mis reportes | «Abrir» en los meses `ABIERTO` (como hoy) y en los `EN_CIERRE` si el reporte está en `BORRADOR` o `CORRECCION_SOLICITADA`. |

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: `POST /periodos/{id}/cerrar` (`x-permiso: PERIODO_CERRAR`, sus respuestas y ejemplos), el objeto `cierre` en la respuesta de `GET /revision/bandeja`, y en `POST /reportes` que una fecha límite vencida responde 409 `PERIODO_NO_ABIERTO`. Comprobación: el YAML se lee bien y `/api/docs` carga sin errores.

2. **Permisos.** En `05_permisos_mysql.sql`, un bloque "SPEC 39 (HU-31)" con `PERIODO_CERRAR` (módulo `REVISION`) y su asignación a REVISOR. **Pedir autorización antes de correr el 05** en la base de prueba. Comprobación: por SQL, el permiso existe y solo lo tiene REVISOR.

3. **Backend: paso automático y defensa al crear.** `modulos/revision/cierre.service.js` con `pasarMesesVencidos` e `iniciarTareaDeCierre`, llamada desde `server.js`. En `reportes.service.js`, la consulta `FOR SHARE` de `cierre_periodo` también lee `fecha_limite_envio` y responde 409 `PERIODO_NO_ABIERTO` si ya pasó. Pruebas en `tests/cierrePeriodo.test.js`, con el año 2011 (sus meses y `cierre_periodo` de `DDRISS_SM` por SQL, borrados al inicio y al final):
   - `pasarMesesVencidos('2011-12-31')` pasa a `EN_CIERRE` un mes con la fecha límite vencida, deja su bitácora con `usuario_id` `NULL` y no toca uno con la fecha límite de hoy o después;
   - correrla dos veces no repite la bitácora;
   - crear un reporte en un mes `ABIERTO` con la fecha límite vencida responde 409 `PERIODO_NO_ABIERTO`.

   Las pruebas de otros archivos que crean reportes en meses de años pasados tenían la fecha límite también en el pasado, así que la defensa al crear (y la tarea, si el servidor de desarrollo corre a la vez) las haría fallar. En sus `INSERT INTO cierre_periodo`, la fecha límite pasa a `'2099-12-31'` (`aprobarReporte`, `bandeja`, `captura`, `corregirReporte`, `procedencia`, `reasignar`, `reportes`, `revisarReporte`, `transiciones`, `vacunasDelReporte` y `validacion`). Solo cambian esos datos de preparación y las dos comparaciones de `reportes.test.js` que leen esa fecha; ninguna prueba se desactiva. Decidido durante la implementación.

   Comprobación: pasan `cierrePeriodo.test.js`, `reportes.test.js` y los diez archivos cuyas fechas límite cambiaron.

4. **Backend: cierre final y resumen.** En `cierre.service.js`, `cerrarPeriodo` según el modelo de datos, con su controlador y su ruta en `revision.routes.js`. En `bandeja.service.js`, el objeto `cierre` con la misma regla de «reportes en el ciclo» (una función compartida). Pruebas en `cierrePeriodo.test.js`, con la vacuna `ZVT_HU31C` con esquema nacional desde enero de 2011; cada reporte de `CS-1201` va por la API hasta el estado que pide cada caso (un mes por caso, porque hay un reporte por establecimiento y mes):
   - con un reporte `APROBADO`, otro `BORRADOR` nunca enviado (de otro establecimiento, por SQL) y el mes `EN_CIERRE`: el mes queda `CERRADO` con `cerrado_por` y `cerrado_en`; el aprobado queda `CERRADO` con `cerrado_en`, `versionFila` sube, su historial `APROBADO → CERRADO` y su `CAMBIO_ESTADO`; el borrador sigue `BORRADOR`; la respuesta trae `reportesCerrados: 1`;
   - un reporte `ENVIADO`, `EN_REVISION`, `CORRECCION_SOLICITADA` o `BORRADOR` devuelto: 409 `PERIODO_CON_PENDIENTES` con `faltanPorAprobar`, y nada cambia;
   - mes `ABIERTO`: 409 `PERIODO_NO_EN_CIERRE`; mes `CERRADO`: 409 `PERIODO_YA_CERRADO`; mes sin `cierre_periodo`: 404; el Personal: 403; cuerpo con campos: 400;
   - ya cerrado, guardar y validar el reporte responden 409, y el borrador nunca enviado responde 409 `PERIODO_CERRADO` al guardar;
   - la bandeja trae `cierre` con los conteos del mes, igual con y sin filtro de municipio;
   - un envío y un cierre en paralelo terminan en un estado coherente: o el reporte queda `ENVIADO` y el mes `EN_CIERRE` (409 del cierre), o el mes `CERRADO` y el envío responde 409.

   Comprobación: pasan `cierrePeriodo.test.js`, `bandeja.test.js` y `reportes.test.js`. La suite completa del backend se corre una vez en este spec.

5. **Frontend: API y diálogo.** En `src/api/revision.js`, `cerrarPeriodo(periodoId)`, que invalida la caché de `/periodos`. `paginas/revision/DialogoCerrarPeriodo.jsx` según la tabla de pantallas. Pruebas en `DialogoCerrarPeriodo.test.jsx`:
   - el texto con y sin pendientes, y «Cerrar periodo» deshabilitado con pendientes;
   - confirmar llama una vez a `cerrarPeriodo` y muestra el toast; mientras envía, los botones quedan deshabilitados;
   - un 409 con «Recargar» y otro error sin «Recargar», con el diálogo abierto.

   Comprobación: las pruebas del diálogo pasan.

6. **Frontend: bandeja y Periodos.** En `PaginaBandejaRevision.jsx`, el conteo y el botón del encabezado con sus notas; en `PaginaPeriodos.jsx`, el botón de las filas `EN_CIERRE`. Pruebas en sus archivos `.test.jsx`:
   - el botón solo aparece con `PERIODO_CERRAR`;
   - deshabilitado con su nota con el mes `ABIERTO` y con pendientes; habilitado en `EN_CIERRE` sin pendientes;
   - al cerrar, la pantalla recarga y el mes se ve «Cerrado».

   Comprobación: pasan las pruebas de las dos pantallas.

7. **Frontend: Registro, Inicio y Mis reportes.** `cargarMesesAbiertos` con los meses `EN_CIERRE` según la tabla de pantallas, y «Abrir» de `PaginaMisReportes.jsx`. Pruebas:
   - Registro ofrece un mes `EN_CIERRE` con un reporte devuelto o en borrador y no ofrece uno sin reporte ni con el reporte aprobado;
   - Mis reportes muestra «Abrir» en un reporte devuelto de un mes `EN_CIERRE` y no en uno aprobado.

   Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright:
   - **Octubre de 2026 (paso automático y cierre bloqueado):** por SQL, poner su fecha límite en el pasado y reiniciar el backend; el mes pasa a `EN_CIERRE` con su bitácora. Como `estadigrafa`, la bandeja muestra el conteo y el botón deshabilitado con «Faltan N reportes por aprobar.». Como un Personal con un reporte devuelto o en borrador de octubre, Registro lo ofrece. Al final, devolverle la fecha límite original con `PATCH /periodos/{id}` (vuelve a `ABIERTO`).
   - **Un mes de 2010 (cierre completo):** crear el año y abrir un mes por la API, llevar un reporte de `CS-1201` hasta `APROBADO`, pasar el mes a `EN_CIERRE` (fecha límite vencida y la tarea). Como `estadigrafa`, cerrar desde «Periodos» o la bandeja; por SQL, el mes `CERRADO` y el reporte `CERRADO` con su historial y su bitácora. Como `cs1201`, «Mis reportes» dice «Cerrado» sin «Abrir». Ese mes queda `CERRADO`.

   Documentación:
   - en `AGENTS.md`, regla 3: el cierre del mes pasa sus reportes aprobados a `CERRADO` revisando `transicion_estado`, como única excepción;
   - en HU-31, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-36, una nota: el cálculo se dispara al cerrar el mes (`POST /periodos/{id}/cerrar`, motivo `CIERRE_PERIODO`);
   - en HU-32, una nota: el mes de 2010 de la prueba manual tiene un reporte `CERRADO` para probar la rectificación;
   - en `CONTEXTO BD.md`, quién escribe `EN_CIERRE`, `CERRADO`, `cerrado_por` y `cerrado_en` de `cierre_periodo` y `cerrado_en` del reporte;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: la tarea de `server.js`, la regla de «reportes en el ciclo», `PERIODO_CERRAR`, el `cierre` de la bandeja, los meses `EN_CIERRE` de Registro y los datos de prueba (año 2011, `ZVT_HU31C`, el mes de 2010).

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta `POST /periodos/{id}/cerrar`, el `cierre` de la bandeja y el 409 de `POST /reportes`, y `/api/docs` carga sin errores.
- [x] En `backend/` pasa la suite completa y en `frontend/` pasa `npm test`, sin desactivar ni quitar ninguna prueba; las pruebas no dejan datos del año 2011.
- [x] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [x] Al arrancar el backend, un mes `ABIERTO` con la fecha límite vencida queda `EN_CIERRE` con una fila de bitácora sin usuario; uno con la fecha límite de hoy o después sigue `ABIERTO`.
- [x] En un mes con la fecha límite vencida no se crea un reporte nuevo (409), aunque el mes siga `ABIERTO`.
- [x] En un mes `EN_CIERRE`, el Personal todavía guarda y envía un borrador, y corrige y reenvía uno devuelto, desde Registro.
- [x] El revisor cierra un mes `EN_CIERRE` sin reportes en el ciclo: el mes queda `CERRADO` con `cerrado_por` y `cerrado_en`, y cada reporte `APROBADO` queda `CERRADO` con `cerrado_en`, historial y `CAMBIO_ESTADO`, todo en una transacción.
- [x] Con algún reporte en el ciclo, el cierre responde 409 `PERIODO_CON_PENDIENTES` con `faltanPorAprobar` y no cambia nada; un borrador nunca enviado no lo impide.
- [x] Un mes `ABIERTO` o `CERRADO` responde 409, y un usuario sin `PERIODO_CERRAR` 403.
- [x] La bandeja muestra «N de M aprobados o cerrados» y, con `PERIODO_CERRAR`, «Cerrar periodo de {mes}», deshabilitado con su nota mientras el mes no está `EN_CIERRE` o faltan reportes por aprobar.
- [x] «Periodos» muestra «Cerrar periodo» en las filas `EN_CIERRE` solo con `PERIODO_CERRAR`, con el mismo diálogo.
- [x] Un reporte `CERRADO` responde 409 al guardar y validar, y la captura lo abre en «Solo consulta».
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] `AGENTS.md` tiene la excepción de la regla 3; HU-31 tiene su avance y sus criterios marcados, HU-36 y HU-32 sus notas, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** tarea con `setInterval` en `server.js`, al arrancar y cada hora (decidido en la fase de preguntas). **No:** una librería de cron, que no está en la lista de `AGENTS.md`. **No:** calcular `EN_CIERRE` al leer sin escribirlo, que deja distintos el estado guardado y el real.
- **Sí:** crear un reporte también revisa la fecha límite, para cubrir el tiempo entre la medianoche y la siguiente corrida (decidido en la fase de preguntas).
- **Sí:** la tarea vive en `server.js` y no en `app.js`, para que las pruebas no la arranquen; recibe `hoy` para probarla con una fecha fija. Decidido al escribir el spec.
- **Sí:** el cierre final solo desde `EN_CIERRE` (decidido en la fase de preguntas). **No:** cerrar un mes `ABIERTO` antes de su fecha límite.
- **Sí:** solo impiden el cierre los reportes en el ciclo: `ENVIADO`, `EN_REVISION`, `CORRECCION_SOLICITADA` y `BORRADOR` ya enviado (decidido en la fase de preguntas). **No:** que cualquier reporte no aprobado lo impida, porque un borrador abandonado frenaría a toda la DDRISS. **No:** cerrar sin revisar nada.
- **Sí:** en `EN_CIERRE` el Personal sigue editando y enviando cualquier borrador existente, como ya permite el backend (decidido en la fase de preguntas). Si lo envía antes del cierre, entra al ciclo y lo impide hasta aprobarse.
- **Sí:** permiso nuevo `PERIODO_CERRAR`, solo para REVISOR (decidido en la fase de preguntas, después de descartar al administrador). **No:** agregar `APROBADO → CERRADO` para ADMINISTRADOR en `transicion_estado`. **No:** reutilizar `PERIODO_EDITAR`.
- **Sí:** el cierre del mes cambia el estado de los reportes en su propia transacción, como excepción escrita en la regla 3 de `AGENTS.md`, revisando `transicion_estado` (decidido en la fase de preguntas). **No:** un `POST /transiciones` por reporte desde el frontend, que no es atómico.
- **Sí:** historial y `CAMBIO_ESTADO` por reporte, más una `ACTUALIZAR` del mes, para que cada reporte tenga su rastro. Decidido al escribir el spec.
- **Sí:** el cierre no crea `corrida_calculo`; lo engancha HU-36 (decidido en la fase de preguntas). **No:** crear una corrida vacía sin motor.
- **Sí:** el botón en la bandeja y en Administración › Periodos (decidido en la fase de preguntas).
- **Sí:** el resumen del cierre es un campo nuevo de `GET /revision/bandeja` (decidido en la fase de preguntas). **No:** un endpoint propio. El diálogo lo pide fresco al abrirse para servir también en «Periodos».
- **Sí:** Registro, Inicio y «Mis reportes» abren los reportes en `BORRADOR` o `CORRECCION_SOLICITADA` de los meses `EN_CIERRE` (decidido en la fase de preguntas; resuelve la nota del SPEC 37).
- **Sí:** la prueba manual no cierra octubre de 2026; lo usa solo para el paso automático y el cierre bloqueado, y cierra un mes de 2010 (decidido en la fase de preguntas).
- **Sí:** las pruebas usan el año 2011 y la vacuna `ZVT_HU31C`, que no usa ningún otro archivo. Decidido al escribir el spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un envío o un guardado corre a la vez que el cierre y deja un reporte en el ciclo dentro de un mes cerrado | El cierre bloquea primero `cierre_periodo` y después **todos** los reportes del mes con `FOR UPDATE`; el envío bloquea el reporte primero, así que uno espera al otro. Si el envío gana, el cierre lo cuenta como pendiente; si el cierre gana, el envío ve el mes cerrado. Una prueba con las dos peticiones en paralelo lo comprueba. |
| La tarea corre en las pruebas o toca meses reales | Vive en `server.js`, no en `app.js`; las pruebas llaman a `pasarMesesVencidos` con `hoy = '2011-12-31'`, que solo alcanza los meses de 2011. |
| El servidor está apagado al vencer la fecha límite | La tarea corre al arrancar, y crear un reporte revisa la fecha límite por su cuenta. |
| Varias instancias del backend corren la tarea a la vez | El `SELECT … FOR UPDATE` y la condición `estado = 'ABIERTO'` hacen que solo una escriba cada mes. |
| El cierre no se deshace | Las pruebas usan 2011 y lo borran por SQL; la prueba manual solo cierra un mes de 2010. Volver atrás un mes real, solo por SQL con autorización. |
| El permiso nuevo no llega al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- El cálculo de indicadores al cerrar (HU-36).
- Reabrir un mes cerrado y la rectificación (HU-32 y HU-33).
- El cierre por el administrador y cualquier cambio a `transicion_estado`.
- Alertas de la fecha límite.
- Un aviso en la captura de que el mes está en cierre.
- Cambios al modelo o a las semillas.

Cada uno, si se hace, va en su propio spec.
