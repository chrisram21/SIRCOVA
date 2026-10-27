# SPEC 26 — Consultar mis reportes y su estado

> **Estado:** Implementado
> **Historia:** HU-23
> **Depende de:** SPEC 06, SPEC 12, SPEC 16, SPEC 22, SPEC 23
> **Fecha:** 2026-10-26
> **Objetivo:** Que el Personal de establecimiento vea en «Mis reportes» (`/reportes`) la lista de los reportes de su establecimiento con su mes, su estado y la fecha de su último cambio de estado, la filtre por año y estado, y vea destacados, con el comentario del revisor, los devueltos para corrección.

## Por qué existe este spec

El SPEC 22 ya hizo `GET /reportes`: lista los reportes del alcance del usuario (el Personal solo ve los de su establecimiento), pagina con la forma común y filtra por `periodoId` y `estado`. Lo usa `/registro` para saber si un mes abierto ya tiene reporte. Faltan tres cosas para HU-23:

- **Filtrar por año.** El endpoint no tiene ese filtro.
- **La fecha del último cambio de estado.** `actualizadoEn` también cambia al guardar cantidades (SPEC 23), así que no dice cuándo se envió, se devolvió o se aprobó el reporte.
- **El comentario de la corrección.** Está en `historial_estado_reporte.comentario` y el endpoint no lo devuelve.

En el menú, la opción «Reportes» (`/reportes`) existe desde el SPEC 06 con el permiso provisional `REPORTE_LISTAR`, que no existe en el 05, y sin pantalla.

**Diferencias con la historia** (mandan `AGENTS.md`, los mockups y lo que decidió el equipo):

- El «Cómo se hará» de HU-23 nombra `GET /reportes` como si fuera nuevo. Ya existe (SPEC 22): este spec le agrega el filtro `anio` y dos campos a cada elemento.
- La historia dice «fecha de último cambio». Aquí es la fecha del último cambio de **estado** (la fila más reciente de `historial_estado_reporte`), no la del último guardado.
- La historia dice «los reportes devueltos para corrección». Aquí son los que están en `CORRECCION_SOLICITADA`. Cuando el establecimiento lo retoma (`CORRECCION_SOLICITADA → BORRADOR`, HU-26), deja de destacarse.

## Alcance

**Entra:**

- En `GET /reportes`:
  - el parámetro de consulta `anio`, combinable con `periodoId`, `estado` y la paginación;
  - en cada elemento (`ReporteResumen`), `estadoDesde` (fecha del último cambio de estado), `correccion` (comentario y fecha de la corrección solicitada, solo en `CORRECCION_SOLICITADA`) y `periodo.estado` (el estado del mes en `cierre_periodo` de la DDRISS del establecimiento).
- El contrato en `openapi.yaml`, antes del código.
- La pantalla «Mis reportes» en `/reportes`:
  - la opción del menú pasa a llamarse «Mis reportes», con el permiso `REPORTE_CONSULTAR` y su página;
  - una tabla con el mes, el estado (insignia) y la fecha del último cambio de estado;
  - los filtros de año y estado (Select con «Todos»), en la URL;
  - la paginación común (SPEC 12);
  - las filas en `CORRECCION_SOLICITADA` destacadas, con el comentario del revisor;
  - un enlace «Abrir» a `/registro?periodo={id}` solo si el mes está `ABIERTO`.
- Un componente de insignia de estado del reporte, reutilizable.
- Pruebas de backend (`reportes.test.js`) y de frontend.
- Verificación manual con Playwright con `cs1201`.
- La documentación: avance y criterios de HU-23, y una nota en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Listar los meses abiertos que todavía no tienen reporte («Sin crear»): eso se ve en `/registro`.
- Abrir un reporte de un mes que no está `ABIERTO` (en cierre o cerrado). `/registro` solo carga los meses abiertos y no cambia aquí.
- Una pantalla de detalle o de historial del reporte (`GET /reportes/{id}/historial`).
- Cambiar el estado del reporte desde la lista (enviar, retomar una corrección): HU-25 y HU-26.
- La lista para otros roles (Revisor, Autoridad): la bandeja de revisión es otra historia. Si otro rol recibe `REPORTE_CONSULTAR`, su spec ajusta el título del menú y las columnas.
- Conteos por estado (chips con números, como en el mockup de Revisión).
- Exportar la lista.
- Cambios al modelo (`01`, `02`), a las semillas (`03`, `04`), a los permisos (`05`) o a `transicion_estado`.

## Modelo de datos

Este spec **no cambia el modelo** ni los permisos. Lee `reporte_produccion`, `periodo`, `cierre_periodo` y `historial_estado_reporte`.

### `GET /reportes`

Parámetros (los nuevos en negrita):

| Parámetro | Tipo | Regla |
|---|---|---|
| `periodoId` | entero ≥ 1 | sin cambios |
| **`anio`** | entero de 2000 a 2100 | `p.anio = ?`; fuera de rango o no entero: 400 `ENTRADA_INVALIDA` «anio debe ser un número entero entre 2000 y 2100.» |
| `estado` | `EstadoReporte` | sin cambios |
| `pagina`, `porPagina` | comunes | sin cambios |

El orden sigue igual: año y mes descendentes, nombre del establecimiento e id.

### `ReporteResumen`

```js
{
  id: 255,
  establecimiento: { id: 8, codigo: 'CS-1208', nombre: 'C/S Tacaná' },
  periodo: {
    id: 9, anio: 2026, mes: 9,
    estado: 'ABIERTO'               // nuevo: ABIERTO | EN_CIERRE | CERRADO | null (sin fila en cierre_periodo)
  },
  estado: 'CORRECCION_SOLICITADA',
  actualizadoEn: '2026-10-12T20:00:00.000Z',
  estadoDesde: '2026-10-12T20:00:00.000Z',   // nuevo: fecha de la fila más reciente de historial_estado_reporte
  correccion: {                              // nuevo: solo si estado = CORRECCION_SOLICITADA; si no, null
    comentario: 'Hexavalente D1 en menores de 1 año es muy alto…',
    fecha: '2026-10-12T20:00:00.000Z'
  }
}
```

Reglas:

- `periodo.estado` sale de `cierre_periodo` con la DDRISS **del establecimiento** (`e.ddriss_id`), como en `GET /reportes/{id}`.
- `estadoDesde` es `MAX(fecha)` de `historial_estado_reporte` del reporte. Todo reporte tiene al menos la fila de su creación (`null → BORRADOR`, SPEC 22). Si no tuviera ninguna, vale `actualizadoEn`.
- `correccion` sale de la fila más reciente con `estado_nuevo = 'CORRECCION_SOLICITADA'`. Su `comentario` puede ser `null`, aunque la transición lo exige (`requiere_comentario`).
- Las fechas se leen con `UNIX_TIMESTAMP` y se devuelven con `aFechaIso`, como `actualizadoEn` (nota del 2026-10-21).
- El `COUNT(*)` y la página siguen usando el mismo `WHERE`. Los dos campos del historial se leen con subconsultas por reporte o con una segunda consulta sobre los ids de la página, sin cambiar el `total`.
- `/registro` sigue usando `listarReportes({ periodoId })`: los campos nuevos no le cambian nada.

### Pantalla `/reportes`

Referencia de estilo: la tabla del mockup `docs/mockups/pantallas/Revision.html` (insignias de estado y fechas), sin sus chips con conteos ni sus datos de ejemplo.

- **Encabezado:** antetítulo «Mis reportes · {nombre del establecimiento}» (el de la sesión; si la lista trae elementos, el de `establecimiento.nombre`) y título «Reportes mensuales».
- **Filtros** (dentro de un `<form>`, como en Usuarios):
  - **Año:** Select con «Todos los años» y los años del calendario (`GET /periodos`, sin repetir, de mayor a menor);
  - **Estado:** Select con «Todos los estados» y los siete estados con su nombre;
  - van en la URL (`?anio=&estado=&pagina=`) con `useSearchParams`; cambiar un filtro vuelve a la página 1.
- **Tabla:**

  | Columna | Contenido |
  |---|---|
  | Mes | «Septiembre de 2026» |
  | Estado | insignia de estado |
  | Último cambio | `estadoDesde` como «DD/MM/AAAA HH:MM», en la hora local del navegador |
  | (acción) | enlace «Abrir» a `/registro?periodo={periodo.id}` si `periodo.estado === 'ABIERTO'`; si no, nada |

- **Corrección solicitada:** la fila lleva fondo `bg-advertencia`, y debajo del mes (en la misma fila) el texto «Devuelto para corrección: {comentario}» en `text-advertencia-foreground`. Sin comentario, solo «Devuelto para corrección».
- **Paginación:** la de Usuarios (SPEC 12). Una página fuera de rango va a la última.
- **Estados vacíos:**
  - sin reportes y sin filtros: «Todavía no tiene reportes. Cree el del mes en Registro de producción.» con un enlace a `/registro`;
  - sin resultados con filtros: «No hay reportes con estos filtros.»;
  - error de carga: el mensaje de la API y «Reintentar».

### Insignia de estado

`componentes/InsigniaEstadoReporte.jsx` usa `Badge` con los colores del tema, sin colores escritos a mano:

| Estado | Texto | Clases |
|---|---|---|
| `BORRADOR` | Borrador | `bg-secondary text-secondary-foreground` |
| `ENVIADO` | Enviado | `bg-accent text-accent-foreground` |
| `EN_REVISION` | En revisión | `bg-accent text-accent-foreground` |
| `CORRECCION_SOLICITADA` | Corrección solicitada | `bg-advertencia text-advertencia-foreground` |
| `APROBADO` | Aprobado | `bg-primary text-primary-foreground` |
| `CERRADO` | Cerrado | `bg-primary text-primary-foreground` |
| `RECTIFICACION` | Rectificación | `bg-advertencia text-advertencia-foreground` |

Los nombres son los de `estado_reporte.nombre` en el 01. `PaginaRegistro.jsx` no cambia: sus pasos de estado son otro componente.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← anio en GET /reportes; estadoDesde, correccion y periodo.estado en ReporteResumen
├── src/modulos/produccion/reportes.service.js     ← leerFiltros (anio) y listarReportes (campos nuevos)
└── tests/reportes.test.js                         ← casos nuevos del listado
frontend/src/
├── api/produccion.js                              ← listarReportes acepta anio
├── componentes/
│   ├── InsigniaEstadoReporte.jsx                  ← nuevo
│   └── layout/opcionesMenu.js                     ← «Mis reportes», REPORTE_CONSULTAR y su página
└── paginas/reportes/
    ├── PaginaMisReportes.jsx                      ← nuevo
    └── PaginaMisReportes.test.jsx                 ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance y criterios de HU-23
CLAUDE.md                                          ← nota de la pantalla y de los campos nuevos
```

No cambian `PaginaRegistro.jsx`, `CapturaReporte.jsx`, `backend/db/` ni ningún `package.json`.

## Plan de implementación

1. **Contrato.** En `openapi.yaml`:
   - `GET /reportes`: el parámetro `anio` (entero, 2000 a 2100) y un ejemplo de 400;
   - `ReporteResumen`: `estadoDesde` (requerido, `date-time`), `correccion` (objeto `{ comentario, fecha }`, `nullable`, requerido) y `periodo.estado` (`EstadoPeriodo`, `nullable`, requerido);
   - la descripción del `GET` explica de dónde sale cada campo nuevo.

   Comprobación: el YAML se lee sin errores y `/api/docs` muestra los cambios.

2. **Filtro por año.** En `reportes.service.js`, `leerFiltros` acepta `anio` y `listarReportes` agrega `p.anio = ?`. Casos nuevos en `reportes.test.js`:
   - `?anio=2022` trae solo reportes de 2022, y su `total` coincide;
   - `anio` combinado con `estado`;
   - `anio=abc`, `anio=1999` y `anio` repetido: 400 `ENTRADA_INVALIDA`.

   Comprobación: `reportes.test.js` pasa, también sus casos anteriores.

3. **Campos nuevos.** `listarReportes` devuelve `periodo.estado`, `estadoDesde` y `correccion`. Casos nuevos en `reportes.test.js`:
   - un reporte recién creado: `estadoDesde` igual a la fecha de su fila de historial, `correccion: null` y `periodo.estado: 'ABIERTO'`;
   - un reporte que la prueba pasa por SQL a `CORRECCION_SOLICITADA`, con su fila de historial y comentario: `correccion` trae ese comentario y su fecha, y `estadoDesde` es esa fecha;
   - un mes sin fila en `cierre_periodo` de la DDRISS: `periodo.estado: null`;
   - el `total` y el orden no cambian.

   La prueba limpia sus filas de historial al terminar, como ya limpia sus reportes del año 2022.

   Comprobación: `reportes.test.js` pasa; `captura.test.js` y `procedencia.test.js` también (usan `listarReportes`).

4. **Cliente e insignia.** `listarReportes` de `api/produccion.js` acepta `anio`. `InsigniaEstadoReporte.jsx` con la tabla de estados.

   Comprobación: `npm test` del frontend pasa sin cambios.

5. **Pantalla.** `PaginaMisReportes.jsx`, y en `opcionesMenu.js` la opción pasa a `{ titulo: 'Mis reportes', ruta: '/reportes', permiso: 'REPORTE_CONSULTAR', icono: FileText, pagina: PaginaMisReportes }`. Pruebas en `PaginaMisReportes.test.jsx`, con la API simulada en el módulo `@/api/…` como en las demás pruebas de pantalla:
   - muestra cada reporte con su mes, su insignia y su último cambio;
   - una fila en `CORRECCION_SOLICITADA` muestra «Devuelto para corrección: {comentario}»;
   - «Abrir» aparece solo en las filas con `periodo.estado === 'ABIERTO'` y apunta a `/registro?periodo={id}`;
   - elegir un año y un estado llama a `listarReportes` con esos filtros y `pagina: 1`, y los pone en la URL;
   - al cargar con `?anio=2026&estado=ENVIADO`, los Select muestran esos valores;
   - una página fuera de rango va a la última;
   - los dos estados vacíos y el error con «Reintentar».

   Comprobación: `npm test` del frontend pasa completo.

6. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas, `npm run dev` y Playwright (la persona inicia sesión a mano), con `cs1201`:
   - el menú dice «Mis reportes» y la pantalla carga sus reportes reales (octubre de 2026 en Borrador y septiembre aprobado);
   - filtrar por 2026 y por «Aprobado» deja solo septiembre; «Todos» vuelve a la lista completa;
   - «Abrir» en octubre lleva a `/registro?periodo=…` con ese reporte; septiembre no tiene «Abrir» si su mes no está abierto;
   - recargar conserva los filtros;
   - `GET /reportes?anio=2026` responde como dice el contrato en `/api/docs`.

   Si `cs1201` no tiene un reporte en `CORRECCION_SOLICITADA`, ese caso lo cubren las pruebas de los pasos 3 y 5 (el reporte 255 de la semilla es de otro establecimiento).

   Documentación:
   - en HU-23, marcar los tres criterios y escribir su «Avance»;
   - en «Notas de contexto» de `CLAUDE.md`, una nota: «Mis reportes» (`/reportes`, `PaginaMisReportes.jsx`) usa `REPORTE_CONSULTAR`; `GET /reportes` acepta `anio` y devuelve `estadoDesde`, `correccion` y `periodo.estado`; «Abrir» solo en meses `ABIERTO` porque `/registro` solo carga esos; la insignia de estado es `InsigniaEstadoReporte.jsx`.

## Criterios de aceptación

- [ ] `openapi.yaml` describe `anio` en `GET /reportes` y `estadoDesde`, `correccion` y `periodo.estado` en `ReporteResumen`, y la respuesta real coincide.
- [ ] `GET /reportes?anio=2026` trae solo reportes de 2026; `anio` inválido o repetido responde 400 `ENTRADA_INVALIDA`.
- [ ] El Personal de establecimiento solo ve los reportes de su establecimiento (sin cambios desde el SPEC 22).
- [ ] Cada fila muestra el mes, el estado con su insignia y la fecha del último cambio de estado.
- [ ] Los filtros de año y estado funcionan, combinados, y se conservan al recargar.
- [ ] Un reporte en `CORRECCION_SOLICITADA` se ve destacado, con el comentario del revisor.
- [ ] «Abrir» aparece solo en los reportes de meses `ABIERTO` y lleva a `/registro` con ese mes.
- [ ] El menú del Personal muestra «Mis reportes» y abre la pantalla, no «En construcción».
- [ ] `/registro` funciona como antes.
- [ ] Las pruebas del backend que tocan reportes (`reportes.test.js`, `captura.test.js`, `procedencia.test.js`) y `npm test` del frontend pasan, sin desactivar ni quitar pruebas.
- [ ] `backend/db/`, `transicion_estado` y los dos `package.json` no cambian.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-23 tiene su avance y sus criterios marcados, y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** «Abrir» lleva a `/registro?periodo={id}` y solo aparece si el mes está `ABIERTO` (decidido en la fase de preguntas). No hace falta otra pantalla. **No:** ampliar `/registro` a cualquier mes, que cambia `PaginaRegistro` y sus pruebas. **No:** una lista sin acción.
- **Sí:** la «fecha de último cambio» es la del último cambio de estado (`estadoDesde`, de `historial_estado_reporte`) (decidido en la fase de preguntas). **No:** `actualizadoEn`, que también cambia al guardar cantidades. **No:** las dos columnas.
- **Sí:** se destacan los reportes en `CORRECCION_SOLICITADA`, con el comentario del revisor; al pasar a Borrador dejan de destacarse (decidido en la fase de preguntas). **No:** seguir destacando el Borrador que viene de una corrección, que hay que deducir del historial. **No:** solo el color de la insignia.
- **Sí:** solo se listan reportes creados (decidido en la fase de preguntas). **No:** filas «Sin crear» para los meses abiertos, que complican la paginación y los filtros.
- **Sí:** la opción del menú es «Mis reportes» con `REPORTE_CONSULTAR`, que el Personal ya tiene (decidido en la fase de preguntas). No toca el 05. **No:** el título neutro «Reportes» con columna de establecimiento. **No:** un permiso nuevo `REPORTE_LISTAR` (zona protegida).
- **Sí:** el filtro por año es un parámetro `anio` de `GET /reportes` (decidido en la fase de preguntas). **No:** filtrar en el frontend, que rompe la paginación.
- **Sí:** el estado del mes viene en `periodo.estado` de cada elemento (decidido en la fase de preguntas). **No:** una segunda llamada a `GET /periodos?estado=ABIERTO` para cruzar ids.
- **Sí:** los filtros son dos Select con «Todos», en la URL (decidido en la fase de preguntas). **No:** chips de estado, con o sin conteo.
- **Sí:** los años del Select salen del calendario (`GET /periodos`), y por defecto no se filtra por año (decidido al escribir el spec). El Personal ya tiene `PERIODO_CONSULTAR`.
- **Sí:** `periodo.estado` es el de la DDRISS del establecimiento, no la del usuario, como en `GET /reportes/{id}` (decidido al escribir el spec). Para el Personal son la misma.
- **Sí:** la insignia de estado es un componente propio reutilizable, con los colores del tema (decidido al escribir el spec). La bandeja de revisión puede usarlo después.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Leer el historial por cada reporte hace lenta la página | Solo se leen los reportes de la página (como máximo 100), y `historial_estado_reporte` tiene el índice `(reporte_id, fecha)`. |
| Agregar campos a `ReporteResumen` rompe a `/registro` o a las pruebas que comparan el objeto completo | Los campos solo se agregan. Las pruebas de `captura.test.js` y `procedencia.test.js` se corren en el paso 3. |
| `estadoDesde` sale 6 h corrida por la zona horaria | Se lee con `UNIX_TIMESTAMP` y `aFechaIso`, como `actualizadoEn` (nota del 2026-10-21). |
| La prueba que pasa un reporte a `CORRECCION_SOLICITADA` por SQL deja filas de historial | La prueba las borra al terminar, junto con sus reportes de 2022. `historial_estado_reporte` no es inmutable, a diferencia de `bitacora`. |
| Los años de prueba (2020 a 2024, 2090) aparecen en el Select de año | Es el calendario real de la base de prueba. En producción solo habrá años reales. |

## Lo que **no** entra en este spec

- Filas «Sin crear» para los meses abiertos sin reporte.
- Abrir reportes de meses en cierre o cerrados, o una pantalla de detalle o historial.
- Cambiar el estado desde la lista.
- La lista para otros roles o conteos por estado.
- Exportar la lista.
- Cambios al modelo, a las semillas, a los permisos o a `transicion_estado`.

Cada uno, si se hace, va en su propio spec.
