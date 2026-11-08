# SPEC 48 — Resumen del Inicio por rol

> **Estado:** Implementado
> **Historia:** HU-40
> **Depende de:** SPEC 06, SPEC 35, SPEC 39, SPEC 41, SPEC 44, SPEC 45 y SPEC 47
> **Fecha:** 2026-11-05
> **Objetivo:** Que las tarjetas del Inicio de cada rol muestren datos reales (avance de los indicadores, proyección, ranking, avance del cierre del mes, bandeja, rectificaciones y validaciones pendientes) con los endpoints que ya existen más un endpoint nuevo de avance del cierre, y que cargue en menos de 3 segundos.

## Por qué existe este spec

El Inicio por rol ya existe (HU-11): `PaginaInicio.jsx` elige el componente del rol (`paginas/inicio/roles/`) y cada rol declara sus tarjetas en `TarjetasDelInicio` (`{ titulo, Datos, permisos }`). Hoy tienen datos solo cuatro tarjetas: «Usuarios activos» y «Esquemas de captura» (Administrador), «Estado y fecha límite de mi reporte» (Establecimiento) y «Periodos por cerrar» (Revisor). Las demás dicen «Sin datos todavía». Desde los SPEC 44 a 47 ya hay indicadores calculados, y desde los SPEC 35 a 41, bandeja, cierre y rectificaciones: esta historia llena las tarjetas que ya tienen de dónde leer.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- La historia habla de Epidemiología y la Autoridad. Este spec cubre **los cinco roles**, pero solo las tarjetas que ya tienen datos (ver la tabla de abajo). El Revisor (la estadígrafa) también tiene su resumen.
- Las tarjetas de alertas («Alertas activas», «Alertas de calidad y de proceso») y la columna «Alertas que requieren acción» de `Main.html` siguen en «Sin datos todavía»: la tabla `alerta` y `GET /alertas` son de HU-50, HU-51 y HU-52.
- El mockup dice «Reportes de agosto cerrados»: el mes que se muestra es **el que se está cerrando** (regla de abajo), no un mes fijo.
- El endpoint nuevo es `GET /revision/avance` y no `GET /reportes/avance`: `/reportes/:id` del módulo de producción se monta antes y tomaría `avance` como un id.

## Alcance

**Entra:**

| Rol | Tarjeta | Fuente |
|---|---|---|
| Epidemiología | Cobertura departamental | `GET /indicadores/resultados` |
| Epidemiología | Municipios en meta | `GET /indicadores/resultados` |
| Epidemiología | Reportes cerrados del mes | `GET /revision/avance` (nuevo) |
| Epidemiología | Avance del cierre del mes (segunda fila, barra apilada) | `GET /revision/avance` (nuevo) |
| Autoridad | Indicadores clave | `GET /indicadores/resultados` |
| Autoridad | Avance y proyección | `GET /indicadores/resultados` |
| Autoridad | Ranking de municipios | `GET /indicadores/resultados` |
| Revisor | Estado de los reportes del periodo | `GET /revision/avance` (nuevo) |
| Revisor | Bandeja de pendientes | `GET /revision/bandeja` |
| Revisor | Solicitudes de rectificación | `GET /rectificaciones` |
| Revisor | Avance del cierre del mes (segunda fila, barra apilada) | `GET /revision/avance` (nuevo) |
| Establecimiento | Validaciones pendientes | `GET /reportes/{id}/validacion` |

- Endpoint `GET /revision/avance` con su contrato y el permiso nuevo `REPORTE_AVANCE_CONSULTAR` (Epidemiología, Autoridad, Revisor y Administrador) en `05_permisos_mysql.sql`.
- Selector de DDRISS en el resumen de la Autoridad nacional.
- Pruebas del backend (`avance.test.js`) y del frontend (`PaginaInicio.test.jsx` y una prueba por rol).
- Medición manual del tiempo de carga con Playwright, avance de HU-40 y nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Alertas en cualquier rol: HU-50, HU-51 y HU-52 agregan su `Datos` a las tarjetas de alertas.
- «Cambios en catálogos» y «Actividad de la bitácora» del Administrador: dependen de `GET /auditoria/bitacora` (HU-54).
- «Cobertura de mi municipio» del Establecimiento: el Personal no tiene `INDICADOR_CONSULTAR` y `GET /indicadores/resultados` no filtra por su municipio; ninguna historia lo cubre todavía.
- «Tendencia mensual» del Establecimiento: es una serie de varios meses (una gráfica), y la historia pide solo tarjetas.
- Gráficas de Recharts en el Inicio: las de análisis están en «Indicadores» (HU-41) y en «Mapa territorial» (HU-42).
- Descarga del informe en Excel o PDF desde el Inicio de la Autoridad (HU-45, HU-47 y HU-48).
- Cambiar las tarjetas que ya tienen datos («Usuarios activos», «Esquemas», «Mi reporte», «Periodos por cerrar»).
- Cambios en `backend/db/` fuera del 05, en `transicion_estado` o en los `package.json`.

## Modelo de datos

Este spec no cambia tablas ni colecciones. Agrega un permiso en `05_permisos_mysql.sql` (zona protegida: se confirma antes de editarlo) y un endpoint de solo lectura.

### Permiso nuevo

```sql
-- SPEC 48 (HU-40): el avance del cierre del mes (solo conteos) para el resumen del Inicio
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('REPORTE_AVANCE_CONSULTAR', '<el módulo de REPORTE_REVISAR>', 'Consultar cuántos reportes del mes hay en cada estado');

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('EPIDEMIOLOGIA', 'AUTORIDAD', 'REVISOR', 'ADMINISTRADOR')
   AND p.codigo = 'REPORTE_AVANCE_CONSULTAR';
```

### `GET /revision/avance`

`modulos/revision/avance.service.js` (nuevo), ruta en `revision.routes.js` con `autenticar` + `requierePermiso('REPORTE_AVANCE_CONSULTAR')`.

Parámetros: `periodoId` (opcional) y `ddrissId` (`DdrissIdAutoridad`: obligatorio para la Autoridad nacional, 400 para los demás). Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA`.

- **Sin `periodoId`, el mes que se está cerrando** de la DDRISS, según su `cierre_periodo`:
  1. el más antiguo `EN_CIERRE`;
  2. si no hay, el más antiguo `ABIERTO`;
  3. si no hay, el último `CERRADO`;
  4. si la DDRISS no tiene ninguno, 200 con `periodo: null`, `esperados: 0` y los conteos en 0.
- **Con `periodoId`:** ese mes; si no tiene `cierre_periodo` de la DDRISS, 404 `NO_ENCONTRADO`.
- **Conteos:** reutiliza `consultaBase` y `GRUPOS` de `bandeja.service.js` (se exportan): los mismos establecimientos de la bandeja (activos con `reporta_5c`, más los que tienen reporte del mes), sin `ASIGNADOS_A_MI` ni `POR_ATENDER`. `esperados` es el conteo de `TODOS`.

```json
{
  "periodo": { "id": 32, "anio": 2026, "mes": 8, "estado": "EN_CIERRE", "fechaLimiteEnvio": "2026-09-10" },
  "esperados": 30,
  "conteos": { "SIN_ENVIAR": 2, "ENVIADO": 2, "EN_REVISION": 4, "CORRECCION_SOLICITADA": 3, "APROBADO": 5, "CERRADO": 14 }
}
```

`CERRADO` incluye `RECTIFICACION`, como en la bandeja. No escribe nada ni deja bitácora (es una lectura).

### Frontend

**Mes de los indicadores** (Epidemiología y Autoridad), en `paginas/inicio/indicadoresDelInicio.js` (nuevo):

- `listarCorridas({ anio })` del año en curso (`hoyGuatemala`, como «Indicadores»); el mes es el mayor `mesHasta` con una corrida `vigente`. Si el año no tiene ninguna, se busca en el año anterior.
- Con ese mes, un solo `listarResultados({ anio, mes, ddrissId })` alimenta todas las tarjetas de indicadores del rol (se pide una vez en el componente del rol y se reparte a sus tarjetas).
- El indicador es el mismo que elige «Indicadores» por defecto: el primer `AVANCE_META_MES` de los resultados. La proyección es el primer `PROYECCION`.
- Sin corrida en los dos años, o sin el indicador, las tarjetas dicen «Todavía no hay indicadores calculados.» (no «Sin datos todavía», que queda para lo que no tiene endpoint).
- Encima de las tarjetas, la línea del mockup: «Datos con corte a {mes} de {año} · calculado {dd/mm/aaaa}» (`finalizadaEn` de la corrida) y, si la corrida es `parcial`, la insignia «Parcial».

**Tarjetas por rol:**

- **Epidemiología** (`InicioEpidemiologia.jsx`):
  - *Cobertura departamental ({nombre corto de la vacuna y la dosis})*: el `valor` de la fila departamental con un decimal y su color de semáforo (`InsigniaValor` de «Indicadores»); debajo, «{n} puntos bajo la meta del mes de {meta} %» o «sobre la meta…». No calculable: «Sin población registrada».
  - *Municipios en meta*: `Cifra` con los municipios con `cumpleMeta` de los calculables («11 de 30») y «{k} municipios con brecha»; los no calculables se nombran aparte («2 sin población»).
  - *Reportes cerrados de {mes}*: `Cifra` con `conteos.CERRADO` de `esperados` y «Envío hasta {fecha}» (`fechaLimiteEnvio`). Con `periodo: null`: «No hay meses abiertos ni cerrados.».
  - *Alertas activas*: sigue «Sin datos todavía».
- **Autoridad** (`InicioAutoridad.jsx`):
  - *Indicadores clave*: el avance departamental (como la cobertura de Epidemiología) y los municipios en meta.
  - *Avance y proyección*: el avance actual y la cobertura proyectada a diciembre (`valor` de la fila departamental del primer `PROYECCION`), con la insignia «Estimación» y «Llega a la meta» o «No llega a la meta» (`cumpleMeta`). Sin proyección en la corrida, solo el avance.
  - *Ranking de municipios*: los 5 municipios calculables de menor avance, de menor a mayor (empates por nombre), cada uno con su valor y su color; enlace «Ver indicadores» (`/indicadores?anio=…&mes=…`).
  - **Selector de DDRISS**: si la Autoridad no tiene DDRISS (nacional), el resumen lleva un `Select` con `GET /ddriss` (por defecto la primera, como en «Indicadores»), visible solo si hay más de una; sin selector se nombra la DDRISS en la línea del corte. La DDRISS elegida va en la URL (`?ddriss=`). Una Autoridad con DDRISS ve la suya, sin selector.
- **Revisor** (`InicioRevisor.jsx`):
  - *Estado de los reportes de {mes}*: `Cifra` con `conteos.CERRADO` de `esperados` y el estado del mes en texto («Abierto», «En cierre», «Cerrado»), como lo muestra «Periodos».
  - *Bandeja de pendientes*: `obtenerBandeja({ periodoId: <el mes del avance>, porPagina: 1 })`; `Cifra` con `conteos.POR_ATENDER` y «{n} asignados a mí» (`ASIGNADOS_A_MI`); enlace «Ir a revisión» (`/revision?periodo={id}`).
  - *Solicitudes de rectificación*: `listarRectificaciones({ estado: 'PENDIENTE', porPagina: 1 })`; `Cifra` con el `total` y «por resolver»; enlace «Ver rectificaciones».
  - *Periodos por cerrar*: sin cambios. *Alertas de calidad y de proceso*: sigue «Sin datos todavía».
- **Establecimiento** (`InicioEstablecimiento.jsx`):
  - *Validaciones pendientes*: el reporte del mes que toca reportar (el mismo de «Mi reporte», `cargarMesesAbiertos` + `mesPendiente`) y `obtenerValidacionGuardada(reporte.id)`. Cuenta los `resultados` `ABIERTO` por severidad: «{e} errores · {a} advertencias», en rojo si hay errores. Sin reporte: «Todavía no ha creado el reporte de {mes}.»; con `validadoEn: null`: «Sin validar todavía.»; sin pendientes: «Sin observaciones pendientes». Enlace «Ir al registro». Permisos: `PERIODO_CONSULTAR` y `REPORTE_CONSULTAR`.

**Segunda fila: avance del cierre** (Epidemiología y Revisor), `paginas/inicio/AvanceCierre.jsx` (nuevo):

- Tarjeta «Avance del cierre de {mes}» bajo la fila de tarjetas, con el mismo avance (una sola petición compartida con «Reportes cerrados» o «Estado de los reportes»).
- Una barra apilada delgada hecha con `div` y anchos en porcentaje (sin Recharts), en el orden Cerrado, Aprobado, En revisión, Corrección solicitada, Enviado y Sin enviar, con los colores `--estado-*` de `InsigniaEstadoReporte` (sin enviar con `bg-muted`). Cada tramo lleva `aria-label` («Cerrado: 14»).
- Leyenda en dos columnas con el nombre (`ESTADOS_REPORTE`) y la cantidad de cada estado, incluidos los que valen 0.
- Enlace «Ir a revisión» solo si el usuario tiene `REPORTE_REVISAR`.
- Con `esperados` en 0: «No hay establecimientos que reporten en este mes.».

**Carga:** las peticiones de un rol salen en paralelo; las únicas que esperan a otra son los resultados (esperan el mes de las corridas) y la bandeja del Revisor (espera el mes del avance). Cada tarjeta muestra su `Skeleton` y su error con «Reintentar» (`TarjetaResumen`). Los permisos de cada tarjeta van en su `permisos` de `TarjetasDelInicio`: sin ellos, «Sin datos todavía».

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                  ← GET /revision/avance y su esquema AvanceCierre
├── db/05_permisos_mysql.sql                      ← REPORTE_AVANCE_CONSULTAR (zona protegida)
├── src/modulos/revision/avance.service.js        ← nuevo
├── src/modulos/revision/bandeja.service.js       ← exporta consultaBase y GRUPOS
├── src/modulos/revision/revision.routes.js, revision.controller.js
└── tests/avance.test.js                          ← nuevo (año 2002)
frontend/src/
├── api/revision.js                               ← obtenerAvance
└── paginas/inicio/
    ├── indicadoresDelInicio.js (+ .test)         ← nuevo: mes de corte, indicador, ranking
    ├── AvanceCierre.jsx                          ← nuevo
    ├── TarjetaSinDatos.jsx                       ← TarjetasDelInicio reparte datos compartidos
    ├── PaginaInicio.test.jsx
    └── roles/InicioEpidemiologia.jsx, InicioAutoridad.jsx, InicioRevisor.jsx, InicioEstablecimiento.jsx (+ .test)
docs/SPECS/HISTORIAS_DE_USUARIO.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** `GET /revision/avance` en `openapi.yaml` con `x-permiso: REPORTE_AVANCE_CONSULTAR`, sus parámetros, la regla del mes que se está cerrando, el esquema `AvanceCierre` y los 400, 401, 403 y 404. Comprobación: `/api/docs` carga.
2. **Permiso.** Confirmar con el equipo y agregar `REPORTE_AVANCE_CONSULTAR` al 05 (bloque del modelo de datos); correr el 05 en la base de prueba con `mysql2`. Comprobación: el 05 corre dos veces sin error y `rol_permiso` tiene las cuatro filas.
3. **Endpoint.** `avance.service.js`: lee los filtros, elige el mes y cuenta con `consultaBase` y `GRUPOS` de la bandeja; controlador y ruta. Comprobación: `bandeja.test.js` sigue pasando.
4. **Pruebas del backend.** `avance.test.js`, con el año 2002 (meses con fecha límite `'2099-12-31'` donde se crean reportes) y reportes de `CS-1201` y otros establecimientos de la semilla en distintos estados, todo por SQL. Casos:
   - sin `periodoId`: elige el `EN_CIERRE` más antiguo; sin `EN_CIERRE`, el `ABIERTO` más antiguo; con todos cerrados, el último `CERRADO` (cada caso cambia por SQL el estado de los meses de 2002 y lo restaura);
   - con `periodoId`: los conteos por estado y `esperados` coinciden con `conteos.TODOS` de `GET /revision/bandeja` del mismo mes;
   - `RECTIFICACION` cuenta como `CERRADO`;
   - un `periodoId` sin `cierre_periodo` de la DDRISS responde 404; un parámetro desconocido, 400;
   - la Autoridad nacional sin `ddrissId` responde 400, y con él ve la DDRISS pedida; otro rol con `ddrissId`, 400;
   - el Personal (sin el permiso) recibe 403.
   La limpieza (al inicio y al final) borra los reportes, su historial y los meses de 2002. Comprobación: la prueba y `bandeja.test.js` pasan.
5. **Frontend: datos.** `obtenerAvance` en `api/revision.js` e `indicadoresDelInicio.js` (mes de corte por las corridas, con el año anterior si hace falta; primer `AVANCE_META_MES` y primer `PROYECCION`; ranking de los 5 de menor avance; municipios en meta). Pruebas puras en `indicadoresDelInicio.test.js`. Comprobación: la prueba pasa.
6. **Frontend: tarjetas.** Los cuatro componentes de rol, `AvanceCierre.jsx`, el reparto de datos compartidos en `TarjetasDelInicio` y el selector de DDRISS de la Autoridad. Pruebas (con `vi.mock` de las API):
   - Epidemiología: cobertura con su color y los puntos bajo la meta, «11 de 30» municipios en meta, reportes cerrados, la barra con su leyenda, y «Alertas activas» en «Sin datos todavía»;
   - Autoridad: el ranking de menor a mayor, la proyección con «Estimación», el selector solo con más de una DDRISS y sin él para una Autoridad con DDRISS;
   - Revisor: bandeja (por atender y asignados), rectificaciones pendientes y el avance con «Ir a revisión»;
   - Establecimiento: validaciones con errores y advertencias, sin reporte y sin validar;
   - sin corrida: «Todavía no hay indicadores calculados.»; con corrida parcial, la insignia «Parcial»;
   - un error en una tarjeta muestra «Reintentar» y las demás cargan;
   - sin el permiso de una tarjeta, «Sin datos todavía».
   Comprobación: `npm test` del frontend pasa completo.
7. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas, entrar con `epidemiologia`, `autoridad.nacional`, la estadígrafa, `cs1206` y el administrador: comparar las cifras con «Indicadores», la bandeja y «Rectificaciones», y medir por rol el tiempo desde la navegación a `/inicio` hasta que no queda ningún `Skeleton` (debe ser menos de 3 s). Avance y criterios de HU-40 con los tiempos medidos; nota en HU-50/HU-51/HU-52 (las tarjetas de alertas esperan su `Datos`) y en HU-54 (las del Administrador); nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET /revision/avance` y `/api/docs` carga.
- [ ] `REPORTE_AVANCE_CONSULTAR` existe y lo tienen Epidemiología, la Autoridad, el Revisor y el Administrador; el 05 sigue siendo idempotente.
- [ ] Sin `periodoId`, `GET /revision/avance` devuelve el mes `EN_CIERRE` más antiguo, si no el `ABIERTO` más antiguo, si no el último `CERRADO`, y `periodo: null` si la DDRISS no tiene meses.
- [ ] Sus conteos y `esperados` coinciden con los de `GET /revision/bandeja` del mismo mes, con `RECTIFICACION` dentro de `CERRADO`.
- [ ] El endpoint respeta el ámbito: la Autoridad nacional exige `ddrissId`, los demás roles ven solo su DDRISS y el Personal recibe 403.
- [ ] El Inicio no tiene gráficas de Recharts: solo tarjetas y la barra apilada hecha con CSS.
- [ ] Epidemiología ve la cobertura departamental con su semáforo, los municipios en meta, los reportes cerrados del mes y el avance del cierre.
- [ ] La Autoridad ve el avance, la proyección marcada como estimación y los 5 municipios de menor avance; la nacional puede elegir la DDRISS cuando hay más de una.
- [ ] El Revisor ve el estado de los reportes del mes que se cierra, su bandeja (por atender y asignados), las rectificaciones pendientes y el avance del cierre.
- [ ] El Establecimiento ve las validaciones pendientes de su reporte del mes.
- [ ] Las tarjetas de indicadores usan el último mes con corrida vigente y muestran el corte, la fecha del cálculo y «Parcial» cuando aplica.
- [ ] Las tarjetas de alertas y las del Administrador sin endpoint siguen en «Sin datos todavía».
- [ ] El Inicio de cada rol carga en menos de 3 segundos contra las bases de prueba (medido con Playwright y anotado en HU-40).
- [ ] `avance.test.js` y `bandeja.test.js` pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar pruebas, y no quedan datos del año 2002.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [ ] HU-40 tiene su avance y sus criterios, las historias de alertas y de auditoría su nota, y `CLAUDE.md` está al día.

## Decisiones

- **Sí:** los cinco roles, pero solo con las tarjetas que ya tienen de dónde leer (decidido en la fase de preguntas). **No:** llenar «Cobertura de mi municipio», «Tendencia mensual», la bitácora y las alertas, que piden permisos y filtros nuevos o historias que todavía no están (HU-50 a HU-54).
- **Sí:** el Revisor también tiene su resumen completo (propuesto por el equipo); la historia solo nombraba a Epidemiología y a la Autoridad.
- **Sí:** reutilizar los endpoints actuales y agregar solo `GET /revision/avance`, con un permiso propio que solo da conteos (decidido en la fase de preguntas). **No:** un `GET /inicio/resumen` que repita la lógica de la bandeja y de los indicadores; **no:** darle a Epidemiología `REPORTE_REVISAR` (vería la bandeja completa); **no:** reutilizar `INDICADOR_CONSULTAR`, que mezcla dos funciones.
- **Sí:** el endpoint va en `/revision/avance` (decidido al escribir el spec), porque `/reportes/:id` del módulo de producción tomaría `avance` como id.
- **Sí:** sin `periodoId`, el backend elige el mes que se está cerrando (decidido en la fase de preguntas), así Epidemiología no necesita leer los periodos para saber cuál mostrar.
- **Sí:** el mes de los indicadores es el último con corrida vigente del año, o del anterior (decidido en la fase de preguntas). **No:** el mes anterior por calendario, que puede no tener corrida.
- **Sí:** el indicador es el primer `AVANCE_META_MES`, el mismo de «Indicadores» por defecto (decidido en la fase de preguntas). **No:** un código fijo en el frontend.
- **Sí:** la Autoridad nacional elige la DDRISS con un selector que solo aparece si hay más de una (decidido en la fase de preguntas). **No:** sumar todo el país, que el motor no calcula.
- **Sí:** la segunda fila del mockup como una barra apilada con CSS (decidido en la fase de preguntas), que cumple «sin gráficas pesadas». La columna de alertas de esa fila queda para HU-52.
- **Sí:** el tiempo de carga se mide a mano con Playwright (decidido en la fase de preguntas). **No:** una prueba automática de tiempo, que fallaría por la latencia de Aiven.

## Riesgos

- **Permiso sin uso.** La Autoridad y el Administrador reciben `REPORTE_AVANCE_CONSULTAR`, pero sus tarjetas de este spec no lo usan. Si al revisar el spec no se ve para qué lo tendrían, conviene dejarlo solo a Epidemiología y al Revisor antes de aprobarlo.
- **Tiempo de carga.** El Revisor encadena dos viajes (avance → bandeja) y Epidemiología/Autoridad otros dos (corridas → resultados); cada viaje a Aiven cuesta unos 130 ms y `GET /indicadores/resultados` trae todos los indicadores del mes. Si la medición pasa de 3 s, la primera medida es pedir los resultados con `indicador` (dos peticiones pequeñas en paralelo) en vez de todos.
- **Aiven apagado.** Con MySQL apagado por inactividad, todas las tarjetas fallan a la vez: cada una muestra su error con «Reintentar», sin romper la pantalla.
- **Datos de la base de prueba.** La tarea del cierre (SPEC 39) pasa meses a `EN_CIERRE` según la fecha: las pruebas de `avance.test.js` no deben depender del estado de los meses reales, solo de los de 2002.
