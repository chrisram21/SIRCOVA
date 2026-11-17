# SPEC 69 — HU-52 Consultar y atender alertas

> **Estado:** Aprobado
> **Historia:** HU-52
> **Origen:** historia
> **Depende de:** SPEC 06, SPEC 57, SPEC 67 y SPEC 68
> **Fecha:** 2026-11-16
> **Objetivo:** Que cada usuario con alertas vea en la pantalla «Alertas» las dirigidas a su rol y ámbito, filtradas por estado, tipo y severidad, con una campana en el encabezado que cuente las activas, y que pueda marcar una como atendida guardando quién y cuándo.

## Por qué existe este spec

Los SPEC 67 y 68 generan alertas de proceso, de cobertura y de calidad, y el SPEC 57 las de «Rectificaciones frecuentes» del Administrador, pero solo se ven en una tarjeta del Inicio, que muestra una sola. La opción «Alertas» del menú abre «En construcción», `GET /alertas` no admite filtros y nadie puede marcar una alerta como atendida: las de ejemplo de la semilla, que la tarea no descarta, se quedan activas para siempre. El Administrador ni siquiera tiene `ALERTA_CONSULTAR`.

**Lo que se decidió en la fase de preguntas (2026-11-16):**

- El Administrador recibe `ALERTA_CONSULTAR` (sus «Rectificaciones frecuentes»). La Autoridad, no: todavía no tiene ninguna clase de alerta.
- Atender usa un permiso nuevo, `ALERTA_ATENDER`, para los cuatro roles que consultan.
- El ícono de la historia es una campana con insignia en el `Encabezado`, que enlaza a `/alertas`. El menú lateral no lleva insignia.
- Se atiende de a una; no hay acción para varias.
- Filtros por estado (por defecto `ACTIVA`), tipo y severidad, en la URL, con la lista paginada.
- `ATENDIDA` es definitiva: no se reactiva. Se confirma con un diálogo.
- Cada alerta enlaza a donde se resuelve, según lo que tenga y los permisos del usuario.
- El spec va en `specs/plataforma/`: la pantalla y la campana son de todos los roles.

## Alcance

**Entra:**

- **Permisos** (zona protegida, autorizado por el equipo en esta fase): en `backend/db/05_permisos_mysql.sql`,
  - asignar `ALERTA_CONSULTAR` también al ADMINISTRADOR;
  - permiso nuevo `('ALERTA_ATENDER', 'REVISION', 'Marcar como atendidas las alertas dirigidas a su rol en su ámbito')`, asignado a REVISOR, ESTABLECIMIENTO, EPIDEMIOLOGIA y ADMINISTRADOR.
  En la base de prueba se corren solo esos `INSERT IGNORE`, no el script entero.
- **Contrato** en `backend/openapi.yaml`:
  - `GET /alertas` con los parámetros `estado`, `tipo`, `severidad`, `pagina` y `porPagina`, y la respuesta paginada (ver «Modelo de datos»);
  - `POST /alertas/{id}/atender` (`x-permiso: ALERTA_ATENDER`), respuestas 200, 400, 401, 403, 404 y 409.
- **Backend** (`backend/src/modulos/alertas/`):
  - `alertas.service.js`: filtros y paginación en `listarAlertas` (con `revisarParametros`), los datos nuevos de cada alerta y `atenderAlerta(usuario, id, contexto)`;
  - `alertas.controller.js` y `alertas.routes.js`: la ruta de atender.
- **Frontend:**
  - `api/alertas.js`: `listarAlertas(filtros)` y `atenderAlerta(id)`;
  - pantalla nueva `paginas/alertas/PaginaAlertas.jsx` (y los componentes que necesite en esa carpeta), puesta como `pagina` de «Alertas» en `opcionesMenu.js`;
  - campana con insignia en `componentes/layout/Encabezado.jsx`, visible solo con `ALERTA_CONSULTAR`;
  - `paginas/inicio/TarjetaAlertas.jsx`: adaptarla a la respuesta nueva (se amplía, no se reemplaza). `InsigniaSeveridad` y `desgloseDeSeveridades` se reutilizan en la pantalla.
- **Pruebas:** casos nuevos en `backend/tests/alertas.test.js`; `frontend/src/paginas/alertas/PaginaAlertas.test.jsx`; ajustar `TarjetaAlertas.test.jsx`, `Layout.test.jsx` (campana) y `RutaConPermiso.test.jsx` (`/alertas` ya no está en construcción).
- **Documentación:** nota en `backend/src/modulos/alertas/CLAUDE.md`, avance de HU-52 en `docs/SPECS/HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

**Fuera de alcance (para otros specs):**

- Atender varias alertas a la vez.
- Reactivar una alerta atendida, o descartarla a mano.
- Una nota o comentario al atender (la tabla no tiene columna; no se toca el modelo).
- La insignia en la opción «Alertas» del menú lateral (`Main.html`).
- Alertas para la Autoridad y `ALERTA_CONSULTAR` para ella.
- Actualizar la campana en tiempo real o con un temporizador: se lee al cargar y después de atender.
- Notificaciones por correo.
- Limpiar por SQL las alertas de ejemplo de la semilla: se atienden desde la pantalla.
- Cambios al modelo de datos, a `transicion_estado` o a `package.json`.

## Modelo de datos

No cambia el modelo: se leen y actualizan filas de `alerta` (`estado`, `atendida_por`, `atendida_en`). Lo nuevo en la base es el permiso `ALERTA_ATENDER` y cinco asignaciones (`ALERTA_CONSULTAR` al ADMINISTRADOR y `ALERTA_ATENDER` a cuatro roles).

### Quién ve qué

Igual que en el SPEC 67: `rol_destino_id` del rol del usuario y su ámbito con `filtroAlcance` (`a.ddriss_id`, `a.establecimiento_id`). Ahora también para el Administrador (su DDRISS). Una alerta fuera de eso no existe para el usuario: ni se lista ni se atiende (404).

### `GET /alertas`

| Parámetro | Valores | Por defecto |
|---|---|---|
| `estado` | `ACTIVA`, `ATENDIDA`, `DESCARTADA`, `TODAS` | `ACTIVA` |
| `tipo` | `REPORTE_PENDIENTE`, `CALIDAD`, `COBERTURA_BAJO_META`, `PROCESO` | todos |
| `severidad` | `CRITICA`, `ADVERTENCIA`, `INFO` | todas |
| `pagina` | entero ≥ 1 (`Pagina` del contrato) | 1 |
| `porPagina` | 1 a 100 (`PorPagina`) | 20 |

Cualquier otro parámetro o valor responde 400 `ENTRADA_INVALIDA`. Orden: severidad (`CRITICA`, `ADVERTENCIA`, `INFO`) y `generada_en` descendente, como hasta ahora.

La respuesta sigue la forma común de los listados paginados (`elementos`, `total`, `pagina`, `porPagina`; `total` cuenta las que cumplen los filtros) y agrega `activas`, que cuenta **todas las activas del usuario sin filtros**, para la campana y la tarjeta del Inicio:

```json
{
  "elementos": [
    {
      "id": 812,
      "tipo": "PROCESO",
      "severidad": "ADVERTENCIA",
      "titulo": "Reporte sin revisar",
      "mensaje": "El reporte de septiembre de 2026 de CS-1219 C/S … lleva 4 días enviado sin que nadie lo tome.",
      "estado": "ATENDIDA",
      "generadaEn": "2026-11-15T18:00:12.000Z",
      "periodo": { "id": 321, "anio": 2026, "mes": 9 },
      "municipio": { "id": 12, "nombre": "Malacatán" },
      "establecimiento": { "id": 19, "codigo": "CS-1219", "nombre": "C/S …" },
      "reporteId": 540,
      "indicadorCodigo": null,
      "atendidaPor": { "usuarioId": 4, "nombre": "María López" },
      "atendidaEn": "2026-11-16T15:20:00.000Z"
    }
  ],
  "total": 37,
  "pagina": 1,
  "porPagina": 20,
  "activas": { "total": 47, "porSeveridad": { "CRITICA": 39, "ADVERTENCIA": 8, "INFO": 0 } }
}
```

- Nuevos en cada alerta: `estado`, `municipio`, `indicadorCodigo` (de su `resultado_indicador`, para el enlace a «Indicadores»), `atendidaPor` (nombre del `empleado` del usuario) y `atendidaEn`. Los que no tenga van en `null`.
- `alertas`, `total` y `porSeveridad` del SPEC 67 pasan a `elementos`, `activas.total` y `activas.porSeveridad`; `TarjetaAlertas` se adapta en este spec.

### `POST /alertas/{id}/atender`

Sin cuerpo (un cuerpo con campos responde 400). En una transacción:

1. Busca la alerta con el mismo filtro de rol y ámbito; si no está, 404 `NO_ENCONTRADO`.
2. `UPDATE alerta SET estado = 'ATENDIDA', atendida_por = ?, atendida_en = NOW() WHERE id = ? AND estado = 'ACTIVA'`. Si no cambia ninguna fila (ya atendida o descartada, también por otra pestaña o por la tarea en ese momento), 409 `ALERTA_NO_ACTIVA` con el mensaje «La alerta ya no está activa.».
3. Bitácora `ACTUALIZAR` de `alerta` con `modulo: REVISION`, `{ estado: 'ACTIVA' }` → `{ estado: 'ATENDIDA', atendidaPor, atendidaEn }` y el contexto del usuario (`contextoAuditoria`).

Responde 200 con la alerta, en la misma forma de los elementos de la lista.

La generación no cambia: ya busca duplicados en cualquier estado (SPEC 67 y 68), así que una atendida no se vuelve a crear.

### Pantalla «Alertas» (`/alertas`)

No hay HTML de referencia: sigue el estilo de las listas existentes (tarjeta con filtros arriba y tabla, como la bandeja de revisión).

- **Encabezado** con el desglose de activas (`desgloseDeSeveridades`).
- **Filtros** con `Select` de shadcn: Estado (Activas, Atendidas, Descartadas, Todas), Tipo (Reporte pendiente, Calidad, Cobertura bajo la meta, Proceso; «Todos») y Severidad (Crítica, Advertencia, Informativa; «Todas»). Van en la URL (`estado`, `tipo`, `severidad`, `pagina`); cambiar un filtro vuelve a la página 1.
- **Tabla:** Severidad (`InsigniaSeveridad`), Alerta (título y mensaje), Periodo («septiembre de 2026»), Generada (fecha y hora de Guatemala), Estado y la acción. En una atendida, «Atendida por {nombre} el {fecha}» en lugar del botón. A 390 px la tabla no desborda la página (se desplaza dentro de su contenedor o pasa a tarjetas, como las demás listas).
- **Enlace «Ver»** según lo que tenga la alerta y solo si el usuario tiene el permiso de la ruta:
  - con `reporteId` y `REPORTE_REVISAR`: `/revision/reportes/{reporteId}`;
  - con `periodo` y `REPORTE_CREAR` (Personal del establecimiento): `/registro?periodo={periodo.id}`;
  - con `indicadorCodigo` y el permiso de «Indicadores»: `/indicadores?anio=…&mes=…&indicador=…&municipios={municipio.id}`;
  - sin ninguno: sin enlace.
- **Atender:** botón «Marcar como atendida» en las `ACTIVA` (solo con `ALERTA_ATENDER`), con un `AlertDialog` de confirmación («La alerta quedará como atendida a su nombre y no se puede deshacer.»). Al confirmar, la fila se actualiza (o sale, si el filtro es «Activas»), se vuelve a leer la lista y la campana baja su conteo. Un 409 muestra su mensaje y recarga la lista.
- **Estados:** cargando (el de las demás pantallas), sin resultados («No hay alertas con estos filtros.»; con el filtro por defecto, «No hay alertas activas.»), error con «Reintentar».
- **Paginación** con el componente que ya usan las listas paginadas.

### Campana del encabezado

Botón con el ícono `Bell` (lucide) a la derecha del `Encabezado`, con `aria-label` «Alertas: {n} activas», que enlaza a `/alertas`. La insignia muestra `activas.total` (99+ si pasa de 99) con el color `destructive` si hay alguna crítica y el secundario si no; sin activas, sin insignia. Se lee con `GET /alertas?porPagina=1` al montar el `Layout` y al cambiar de ruta, y se vuelve a leer después de atender (un evento o contexto compartido; se decide al implementar con lo que ya exista en `Layout`). Si la consulta falla, la campana se ve sin insignia y sin mensaje de error.

## Plan de implementación

1. **Permisos.** Agregar a `05_permisos_mysql.sql` el permiso `ALERTA_ATENDER` y las asignaciones, con su comentario `-- SPEC 69 (HU-52)`, y correr solo esos `INSERT IGNORE` en la base de prueba. Comprobar con el login del Administrador que trae `ALERTA_CONSULTAR` y `ALERTA_ATENDER`, y con el de la Autoridad que no.
2. **Contrato.** `GET /alertas` con sus parámetros y la respuesta paginada con `activas`; `POST /alertas/{id}/atender`.
3. **Lista.** Filtros, paginación y los campos nuevos en `listarAlertas`. Pruebas en `alertas.test.js` (con las alertas `vitest-hu50 …` de la DDRISS 1, ahora de varias severidades, tipos y estados):
   - sin parámetros, las activas, 20 por página y `activas` igual a la base;
   - `estado=ATENDIDA` con `atendidaPor` y `atendidaEn`; `estado=TODAS`; `tipo` y `severidad` combinados;
   - `pagina` y `porPagina`; `total` cuenta las filtradas y `activas` no cambia con los filtros;
   - 400 con un valor fuera de la lista, `porPagina=101` o un parámetro desconocido;
   - el Administrador ve las suyas (alerta de prueba `PROCESO` para ADMINISTRADOR) y no las del Revisor; la Autoridad recibe 403.
4. **Atender.** `atenderAlerta`, su controlador y su ruta. Pruebas:
   - atiende una activa: 200, `estado`, `atendida_por` del usuario y `atendida_en` en la base, y su fila en la bitácora con el usuario;
   - otra vez la misma: 409 `ALERTA_NO_ACTIVA`; una `DESCARTADA`: 409;
   - de otro rol, de otra DDRISS u otro establecimiento, o inexistente: 404;
   - sin `ALERTA_ATENDER`: 403; sin sesión: 401; con cuerpo: 400;
   - después de atender, `generarAlertas` no la vuelve a crear (una de las clases del SPEC 67 en la DDRISS `ZVT_HU50`).
5. **Tarjeta del Inicio.** Adaptar `api/alertas.js` y `TarjetaAlertas.jsx` a `elementos` y `activas`, con sus pruebas; el Inicio se ve igual que antes.
6. **Pantalla.** `PaginaAlertas.jsx` y su `pagina` en `opcionesMenu.js`. Pruebas en `PaginaAlertas.test.jsx`: lista con insignias, filtros que pasan a la URL y a `listarAlertas`, enlaces según los datos y los permisos, atender con confirmación (y que sin `ALERTA_ATENDER` no hay botón), 409, vacío y error. Ajustar `RutaConPermiso.test.jsx`.
7. **Campana.** En `Encabezado.jsx`, con sus pruebas en `Layout.test.jsx`: con y sin permiso, con críticas, sin activas, 99+, y que baja después de atender.
8. **Verificación manual** con la API real, Vite y Playwright: como Revisor, filtrar y atender una alerta de ejemplo de la semilla y comprobar en `alerta` y `bitacora` quién y cuándo; como `cs1206`, ver solo las suyas y abrir el enlace a Registro; como Epidemiología, abrir el enlace a «Indicadores» de una «Municipio bajo la meta»; como Administrador, ver la alerta 33 «Rectificaciones frecuentes». La campana cambia al atender, y a 390 px nada desborda. Lo que quede atendido en la base se anota en el `CLAUDE.md` del módulo.
9. **Documentación.** Nota en el `CLAUDE.md` del módulo, avance de HU-52 en `HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [ ] `ALERTA_ATENDER` existe en el 05 y en la base de prueba, asignado solo a REVISOR, ESTABLECIMIENTO, EPIDEMIOLOGIA y ADMINISTRADOR; el ADMINISTRADOR tiene también `ALERTA_CONSULTAR` y la AUTORIDAD no tiene ninguno de los dos.
- [ ] `GET /alertas` devuelve solo las alertas del rol del usuario dentro de su establecimiento o DDRISS, filtradas por `estado` (por defecto `ACTIVA`), `tipo` y `severidad`, paginadas, con `activas` que cuenta todas las activas sin filtros.
- [ ] `GET /alertas` responde 400 con un parámetro o valor que no está en el contrato.
- [ ] `POST /alertas/{id}/atender` guarda `ATENDIDA`, `atendida_por` y `atendida_en`, y deja su fila en la bitácora con el usuario.
- [ ] Atender una alerta que no está activa responde 409; una fuera del rol o el ámbito del usuario, 404; sin `ALERTA_ATENDER`, 403.
- [ ] Una alerta atendida no se vuelve a crear en la corrida siguiente de la tarea ni de los indicadores.
- [ ] La pantalla «Alertas» lista las alertas con su severidad, filtra por estado, tipo y severidad con los filtros en la URL, y muestra en las atendidas quién y cuándo.
- [ ] «Marcar como atendida» pide confirmación, solo aparece con `ALERTA_ATENDER` en alertas activas, y al confirmar actualiza la lista y la campana.
- [ ] Cada alerta enlaza al reporte, al Registro o a «Indicadores» según sus datos y los permisos del usuario, y no muestra enlace si no tiene a dónde ir.
- [ ] La campana del encabezado se ve solo con `ALERTA_CONSULTAR`, muestra el total de activas (crítica en `destructive`) y enlaza a `/alertas`.
- [ ] La tarjeta de alertas del Inicio sigue mostrando el total, el desglose y la alerta de mayor severidad.
- [ ] Los colores salen de las variables del tema y a 390 px la pantalla no tiene desplazamiento horizontal.
- [ ] El contrato describe los dos endpoints y la API arranca.
- [ ] Pasan `alertas.test.js`, `PaginaAlertas.test.jsx`, `TarjetaAlertas.test.jsx`, `Layout.test.jsx`, `RutaConPermiso.test.jsx` y la suite del frontend.
- [ ] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** `ALERTA_CONSULTAR` para el Administrador. Ya recibe «Rectificaciones frecuentes» (SPEC 57) y no podía verlas.
- **No:** la Autoridad. No hay alertas dirigidas a ella; se agrega con la primera que lo esté.
- **Sí:** permiso propio `ALERTA_ATENDER`. Separa lectura y escritura como el resto de los módulos y permite dar una sin la otra.
- **Sí:** campana con insignia en el encabezado. Se ve en todas las pantallas y con el menú colapsado.
- **No:** insignia en la opción del menú lateral (`Main.html`). El menú no tiene insignias y la campana cumple el criterio.
- **No:** atender varias a la vez. Decisión del equipo: de a una basta; las de ejemplo de la semilla se atienden una por una.
- **Sí:** filtro por severidad además de tipo y estado, y lista paginada. Las atendidas crecen con el tiempo; el corte de 50 del SPEC 67 las dejaría fuera.
- **Sí:** la respuesta pasa a la forma común paginada (`elementos`, `total`, `pagina`, `porPagina`) con `activas` aparte. Es la forma de todo listado paginado del contrato; el cambio solo afecta a `TarjetaAlertas`, que se adapta aquí.
- **Sí:** `estado=ACTIVA` por defecto. Es lo que pide atención y lo que ya devolvía el endpoint.
- **No:** reactivar una atendida. `ATENDIDA` es final, como la trata la generación; por eso se confirma antes.
- **Sí:** 409 si la alerta ya no está activa, con el `UPDATE … WHERE estado = 'ACTIVA'`. Cubre dos pestañas y la tarea que la descarta en el mismo momento.
- **Sí:** 404 para una alerta fuera del rol o el ámbito. No revela que existe, como los reportes de otro establecimiento.
- **Sí:** enlaces según los datos y los permisos del usuario. Llevan a donde se resuelve sin mostrar rutas que el usuario no puede abrir.
- **Sí:** bitácora con `modulo: REVISION`, el módulo de los dos permisos. El `ENUM` de `bitacora.modulo` no tiene uno de alertas y no se toca el modelo.
- **Sí:** el spec en `specs/plataforma/`. La pantalla y la campana son de todos los roles.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El cambio de forma de `GET /alertas` rompe la tarjeta del Inicio | Se adapta en el paso 5, antes de la pantalla, con sus pruebas; Epidemiología, el Revisor y el Personal se revisan en la verificación. |
| La campana agrega una consulta en cada cambio de ruta | `porPagina=1` y el conteo usan el índice `ix_alerta_ddriss`; si se nota lento contra Aiven, se lee solo al montar y al atender, y se anota. |
| Las pruebas atienden alertas reales de la DDRISS 1 | Solo se atienden alertas `vitest-hu52 …` insertadas por la prueba (`generada_en` en 2099) y las de la DDRISS `ZVT_HU50`; la limpieza las borra. |
| La verificación manual atiende alertas de la semilla que otros integrantes usan para probar | Se atienden pocas y se anota en la nota del módulo cuáles quedaron atendidas. |
| La tarea descarta una alerta mientras el usuario la atiende | El `UPDATE` condicionado da 409 y la pantalla recarga la lista. |
