# SPEC 67 — HU-50 Alertas de reportes pendientes y de proceso

> **Estado:** Implementado
> **Historia:** HU-50
> **Origen:** historia
> **Depende de:** SPEC 34, SPEC 35, SPEC 39, SPEC 48 y SPEC 57
> **Fecha:** 2026-11-15
> **Objetivo:** Que una tarea horaria del backend genere y descarte en `alerta` los avisos de fecha límite próxima, reporte sin enviar al vencer la fecha y reporte sin revisar por más de 3 días, para el Revisor y el Establecimiento, y que ambos los vean en una tarjeta de su Inicio.

## Por qué existe este spec

La estadígrafa sigue el mes a mano: revisa en la bandeja quién no ha enviado y qué reportes llevan días sin tomarse. La tabla `alerta` existe desde el modelo v0.5 y la tarea horaria del SPEC 39 ya pasa los meses vencidos a `EN_CIERRE`, pero nadie genera alertas de proceso salvo «Rectificaciones frecuentes» (SPEC 57), y el Inicio del Revisor tiene la tarjeta «Alertas de calidad y de proceso» en «Sin datos todavía» (SPEC 48).

Este spec agrega un módulo `alertas` en el backend con una tarea horaria que genera tres clases de alerta y descarta las que ya no aplican, un `GET /alertas` básico y la tarjeta de alertas en el Inicio del Revisor y del Establecimiento. Consultar todas, filtrarlas y marcarlas como atendidas queda para HU-52.

**Lo que se decidió en la fase de preguntas (2026-11-15):**

- Entra el backend y la tarjeta del Inicio; la pantalla Alertas, el ícono de la barra y «marcar como atendida» son de HU-52.
- «El periodo actual por cerrar» de la historia se cubre con la alerta **fecha límite próxima**: faltan 3 días o menos y el mes sigue `ABIERTO`.
- «Sin revisar» = reporte en `ENVIADO` (nadie lo ha tomado) con más de **3 días** desde `enviado_en`. N = 3, constante en el backend.
- Destinatarios: el REVISOR (por DDRISS) y el ESTABLECIMIENTO (su propio establecimiento).
- Permiso nuevo `ALERTA_CONSULTAR` en `05_permisos_mysql.sql` para REVISOR y ESTABLECIMIENTO (zona protegida, autorizado por el equipo en esta fase).
- `GET /alertas` básico: las `ACTIVA` del rol y el ámbito del usuario. Los filtros y la acción de atender, en HU-52.
- El Establecimiento recibe la de fecha próxima y la de fecha vencida; una tarjeta nueva «Alertas» en su Inicio.
- Cuando la condición desaparece, la misma tarea pasa la alerta a `DESCARTADA`.
- Para el Revisor, una alerta de reporte sin enviar **por establecimiento**.
- Severidades: fecha próxima `INFO`, sin revisar `ADVERTENCIA`, sin enviar al vencer `CRITICA`.
- Un reporte reenviado puede volver a generar «sin revisar»: una por envío.
- Código en un módulo nuevo `backend/src/modulos/alertas/`, que reutilizarán HU-51 y HU-52; el spec va en `specs/revision/`.

## Alcance

**Entra:**

- **Permiso** (zona protegida, autorizado): en `backend/db/05_permisos_mysql.sql`, `('ALERTA_CONSULTAR', 'REVISION', 'Consultar las alertas activas dirigidas a su rol en su ámbito')`, asignado a REVISOR y ESTABLECIMIENTO. El módulo es `REVISION`, uno de los que ya usa el 05 (como `REPORTE_AVANCE_CONSULTAR`). En la base de prueba se corren solo esos `INSERT IGNORE`, no el script entero.
- **Contrato** en `backend/openapi.yaml`: completar `GET /alertas` (`x-permiso: ALERTA_CONSULTAR`, respuestas 200, 400, 401 y 403; el 400 `ENTRADA_INVALIDA` es para cualquier parámetro, como en los demás endpoints) con el esquema `Alerta` y la respuesta `ListaAlertas`; quitar por ahora el parámetro `estado` del borrador (lo agrega HU-52).
- **Backend**, módulo nuevo `backend/src/modulos/alertas/`:
  - `generacion.service.js`: constantes (`DIAS_AVISO_FECHA_LIMITE = 3`, `DIAS_SIN_REVISAR = 3`, títulos de cada clase), `generarAlertas({ hoy, ahora })` y `iniciarTareaDeAlertas()`;
  - `alertas.service.js`, `alertas.controller.js` y `alertas.routes.js` para `GET /alertas`;
  - montar la ruta en `app.js` y arrancar la tarea en `server.js` (junto a `iniciarTareaDeCierre`, con su `clearInterval` en `detener`);
  - `CLAUDE.md` del módulo, con su primera nota.
- **Frontend:**
  - `frontend/src/api/alertas.js` con `listarAlertas()`;
  - `frontend/src/paginas/inicio/TarjetaAlertas.jsx` (compartida), usada por la tarjeta «Alertas de calidad y de proceso» de `InicioRevisor.jsx` y por una tarjeta nueva «Alertas» en `InicioEstablecimiento.jsx`, las dos con `permisos: ['ALERTA_CONSULTAR']`.
- **Pruebas:** `backend/tests/alertas.test.js` (generación, descarte y endpoint); `frontend/src/paginas/inicio/TarjetaAlertas.test.jsx`; ajustar `PaginaInicio.test.jsx` por la tarjeta nueva del Establecimiento.
- **Documentación:** agregar `alertas` a la tabla «Notas de contexto» del `CLAUDE.md` de la raíz; avance de HU-50 y una nota en HU-52 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`; `node scripts/mapa-obsidian.mjs`.

**Fuera de alcance (para otros specs):**

- La pantalla «Alertas», el ícono con insignia en la barra, los filtros por tipo y estado y marcar como atendida (HU-52).
- Alertas de cobertura y de calidad, y la tarjeta «Alertas activas» de Epidemiología (HU-51).
- Mostrar las alertas «Rectificaciones frecuentes» del Administrador (HU-52; el Administrador no recibe `ALERTA_CONSULTAR` aquí).
- Notificaciones por correo o en tiempo real.
- Plazos configurables (N días) o guardados en la base.
- Alertas de reportes en `EN_REVISION` o `CORRECCION_SOLICITADA` estancados.
- Cambios al modelo de datos, a `transicion_estado` o a `package.json`.

## Modelo de datos

No cambia el modelo: se escribe en la tabla `alerta` existente. Lo único nuevo en la base es el permiso `ALERTA_CONSULTAR` y sus dos asignaciones.

### Clases de alerta

Cada clase se identifica por su `titulo`, que es una constante del backend (así no se confunde con «Rectificaciones frecuentes», que también es `PROCESO`).

| Clase | `tipo` | `severidad` | `titulo` | `rol_destino_id` | Referencias |
|---|---|---|---|---|---|
| Fecha límite próxima (DDRISS) | `REPORTE_PENDIENTE` | `INFO` | `Fecha límite próxima` | REVISOR | `ddriss_id`, `periodo_id` |
| Fecha límite próxima (establecimiento) | `REPORTE_PENDIENTE` | `INFO` | `Fecha límite próxima` | ESTABLECIMIENTO | `ddriss_id`, `periodo_id`, `municipio_id`, `establecimiento_id`, `reporte_id` si existe |
| Reporte sin enviar | `REPORTE_PENDIENTE` | `CRITICA` | `Reporte sin enviar` | REVISOR y ESTABLECIMIENTO (una fila para cada uno) | `ddriss_id`, `periodo_id`, `municipio_id`, `establecimiento_id`, `reporte_id` si existe |
| Reporte sin revisar | `PROCESO` | `ADVERTENCIA` | `Reporte sin revisar` | REVISOR | `ddriss_id`, `periodo_id`, `municipio_id`, `establecimiento_id`, `reporte_id` |

`ddriss_id` es el de `cierre_periodo` (o el del establecimiento, en «sin revisar»); `municipio_id` es el del establecimiento.

Mensajes (el mes con `NOMBRES_MES`, la fecha en `dd/mm/aaaa`):

- Fecha próxima, DDRISS: «{Mes} de {año} vence el {fecha}; faltan {n} reportes por enviar.» (con «falta 1 reporte» en singular).
- Fecha próxima, establecimiento: «El reporte de {mes} de {año} vence el {fecha} y todavía no se ha enviado.»
- Sin enviar: «{código} {nombre} no envió el reporte de {mes} de {año}; la fecha límite fue el {fecha}.»
- Sin revisar: «El reporte de {mes} de {año} de {código} {nombre} lleva {d} días enviado sin que nadie lo tome.»

### Condiciones de generación

Un **establecimiento obligado** de un mes es uno `activo` con `reporta_5c` de la DDRISS de ese `cierre_periodo`. **Sin enviar** = no tiene `reporte_produccion` en ese periodo, o lo tiene con `enviado_en IS NULL` (un reporte devuelto ya se envió una vez y no cuenta como sin enviar).

`hoy` es la fecha de Guatemala (`hoyGuatemala()`); `ahora`, el instante actual. Los dos son parámetros de `generarAlertas` para que las pruebas usen fechas fijas.

| Clase | Se genera cuando |
|---|---|
| Fecha próxima (DDRISS) | `cierre_periodo.estado = 'ABIERTO'`, `fecha_limite_envio − 3 días ≤ hoy ≤ fecha_limite_envio` y al menos un establecimiento obligado está sin enviar |
| Fecha próxima (establecimiento) | La misma ventana, por cada establecimiento obligado sin enviar |
| Sin enviar | `fecha_limite_envio < hoy`, `cierre_periodo.estado <> 'CERRADO'` y el establecimiento obligado está sin enviar |
| Sin revisar | `reporte_produccion.estado = 'ENVIADO'` y `enviado_en ≤ ahora − 3 × 24 h` |

### Sin duplicados

Antes de insertar se busca una alerta con el mismo `titulo` y `rol_destino_id`, **en cualquier estado** (así una atendida a mano en HU-52 no se vuelve a crear cada hora):

- Fecha próxima (DDRISS): mismo `ddriss_id` y `periodo_id`.
- Fecha próxima (establecimiento) y sin enviar: mismo `establecimiento_id` y `periodo_id`.
- Sin revisar: mismo `reporte_id` y `generada_en ≥ enviado_en` del reporte. Si el reporte se devuelve y se reenvía, `enviado_en` cambia y la espera nueva puede generar otra.

### Descarte

En cada corrida, las alertas `ACTIVA` de estas clases cuya condición ya no se cumple pasan a `DESCARTADA` (sin `atendida_por` ni `atendida_en`):

| Clase | Se descarta cuando |
|---|---|
| Fecha próxima (DDRISS) | `hoy > fecha_limite_envio` o ya no queda ningún obligado sin enviar |
| Fecha próxima (establecimiento) | El establecimiento envió o `hoy > fecha_limite_envio` |
| Sin enviar | El establecimiento envió o el mes quedó `CERRADO` |
| Sin revisar | El reporte ya no está en `ENVIADO`, o su `enviado_en` es posterior a `generada_en` |

### Corrida

`generarAlertas` corre en una transacción: primero descarta y después genera, para que una alerta descartada y su condición nueva (por ejemplo, un reenvío) no choquen. Cubre todas las DDRISS. Cada alerta creada deja una fila `CREAR` (entidad `alerta`) y cada descarte una `ACTUALIZAR` (`{ estado: 'ACTIVA' }` → `{ estado: 'DESCARTADA' }`), con `modulo: REVISION` y `usuarioId: null`, como el cierre automático. Devuelve `{ creadas, descartadas }`.

`iniciarTareaDeAlertas` la corre al arrancar y cada hora; un fallo se escribe en consola y no detiene la API (igual que `iniciarTareaDeCierre`). La arranca `server.js`, no `app.js`, para que las pruebas no la corran.

### `GET /alertas`

Permiso `ALERTA_CONSULTAR`. Devuelve las alertas `ACTIVA` con `rol_destino_id` del rol del usuario y dentro de su ámbito (`ambitoDe` de `auth/alcance.service.js`): DDRISS → `ddriss_id` igual; ESTABLECIMIENTO → `establecimiento_id` igual; nacional → todas. Orden: severidad (`CRITICA`, `ADVERTENCIA`, `INFO`) y luego `generada_en` descendente. Hasta 50 filas.

```json
{
  "total": 12,
  "porSeveridad": { "CRITICA": 9, "ADVERTENCIA": 2, "INFO": 1 },
  "alertas": [
    {
      "id": 41,
      "tipo": "REPORTE_PENDIENTE",
      "severidad": "CRITICA",
      "titulo": "Reporte sin enviar",
      "mensaje": "CS-1209 C/S Ocós no envió el reporte de octubre de 2026; la fecha límite fue el 05/11/2026.",
      "generadaEn": "2026-11-06T06:00:12.000Z",
      "periodo": { "id": 322, "anio": 2026, "mes": 10 },
      "establecimiento": { "id": 9, "codigo": "CS-1209", "nombre": "C/S Ocós" },
      "reporteId": null
    }
  ]
}
```

`total` y `porSeveridad` cuentan todas las activas, aunque la lista se corte en 50. `periodo` y `establecimiento` son `null` si la alerta no los tiene.

### Pantallas

`TarjetaAlertas` (sobre `TarjetaResumen`, como las demás del Inicio) muestra:

- el total de activas como cifra principal y el desglose «{n} críticas, {n} advertencias, {n} informativas» (solo las que no son cero);
- **una sola** alerta, la primera de la lista: la de mayor severidad (`CRITICA` > `ADVERTENCIA` > `INFO`) y, en la misma severidad, la más reciente, que es el orden de `GET /alertas`. Lleva un `Badge` de severidad (Crítica, Advertencia, Informativa; colores del tema: `destructive`, `--advertencia` y el secundario) y su mensaje en 2 líneas como máximo (el completo en el `title`);
- abajo, el enlace «Ver alertas» a `/alertas`, como el enlace de las otras tarjetas.

Ajuste del equipo en la verificación del paso 7 (2026-11-15): con las 3 primeras dentro, la tarjeta estiraba toda la fila; se probó un panel desplegable con las 3 y se descartó (a Christian no le gustó). Queda una alerta más el enlace a la pantalla;
- sin alertas: «No hay alertas activas.»;
- error: el mismo estado de error de las demás tarjetas.

Hasta HU-52, «Ver alertas» abre «En construcción» (la opción «Alertas» del menú no tiene `pagina`); HU-52 solo pone su pantalla y el enlace de la tarjeta ya llega a ella (pedido del equipo, 2026-11-15).

## Plan de implementación

1. **Permiso.** Agregar `ALERTA_CONSULTAR` y sus asignaciones a REVISOR y ESTABLECIMIENTO en `05_permisos_mysql.sql`, y correr solo esos `INSERT IGNORE` en la base de prueba. Comprobar que un login del Revisor y de `cs1206` trae el permiso.
2. **Contrato.** Completar `GET /alertas` en `openapi.yaml` con `Alerta` y `ListaAlertas`.
3. **Generación.** Crear `modulos/alertas/generacion.service.js` con `generarAlertas` y su `CLAUDE.md`. Pruebas en `backend/tests/alertas.test.js`, con el año **1998** preparado por SQL (`cierre_periodo`, reportes con `enviado_en` fijo) en la DDRISS ficticia `ZVT_HU50`, con establecimientos `ZVT50-*` copiados de CS-1201, y `hoy`/`ahora` fijos en 1998. Se cambió del 2006 previsto porque ese año lo usa `corridas.test.js` (`periodo` es un calendario común), y la DDRISS propia evita cambiar los conteos de la DDRISS 1 que usan `bandeja.test.js` y `avance.test.js`. Los casos que necesitan enero `ABIERTO` lo vuelven a abrir antes de correr, porque `pasarMesesVencidos` de otras pruebas lo pasa a `EN_CIERRE`. La limpieza borra las `alerta` de la DDRISS antes que los reportes:
   - 3 días antes de la fecha límite se crea la de la DDRISS y una por cada establecimiento sin enviar; 4 días antes, ninguna;
   - un establecimiento con borrador nunca enviado cuenta como sin enviar; uno con reporte devuelto, no;
   - el día después de la fecha, una `CRITICA` para el Revisor y otra para el establecimiento, y las de fecha próxima quedan `DESCARTADA`;
   - un reporte `ENVIADO` hace 3 días y 1 hora genera «sin revisar»; uno de 2 días, no;
   - correr dos veces no duplica nada, tampoco si la alerta quedó `ATENDIDA`;
   - al enviar el reporte pendiente, su alerta «sin enviar» se descarta; al cerrar el mes, todas las de ese mes;
   - un reporte tomado en revisión descarta su «sin revisar»; reenviado y otra vez 3 días en `ENVIADO`, genera una nueva;
   - cada creación y cada descarte dejan su fila en la bitácora sin usuario;
   - un establecimiento inactivo o sin `reporta_5c` no genera nada.
4. **Tarea.** `iniciarTareaDeAlertas` y su arranque en `server.js`. Comprobar a mano que la API arranca y la tarea corre sin error.
5. **Endpoint.** Servicio, controlador y ruta de `GET /alertas`, montada en `app.js`. Pruebas en el mismo archivo:
   - el Revisor ve las de su DDRISS para REVISOR y no las del ESTABLECIMIENTO ni las del ADMINISTRADOR;
   - el Establecimiento ve solo las de su establecimiento;
   - no aparecen las `ATENDIDA` ni las `DESCARTADA`;
   - orden por severidad y fecha, `total` y `porSeveridad` correctos;
   - 400 con un parámetro (`?estado=ACTIVA`), 401 sin sesión y 403 sin `ALERTA_CONSULTAR` (Epidemiología).
6. **Frontend.** `api/alertas.js`, `TarjetaAlertas.jsx` y su uso en `InicioRevisor.jsx` e `InicioEstablecimiento.jsx`. Pruebas en `TarjetaAlertas.test.jsx` (con alertas, sin alertas, error, desglose sin ceros, solo 3 en la lista) y ajustar los títulos del Establecimiento en `PaginaInicio.test.jsx`.
7. **Verificación manual** con la API real, Vite y Playwright: comprobar en `alerta` lo que generó la tarea al arrancar (por ejemplo, los reportes sin enviar de septiembre de 2026, que está `EN_CIERRE`), ver la tarjeta como Revisor y como `cs1206`, y a 390 px que no desborda. Lo que quede en la base se anota en la nota del `CLAUDE.md` del módulo.
8. **Documentación.** `alertas` en la tabla de «Notas de contexto» del `CLAUDE.md` de la raíz, avance de HU-50 y nota en HU-52 en `HISTORIAS_DE_USUARIO.md`, y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [ ] `ALERTA_CONSULTAR` existe en el 05 y en la base de prueba, asignado solo a REVISOR y ESTABLECIMIENTO.
- [ ] Con la fecha límite a 3 días o menos y el mes `ABIERTO`, se crea una alerta `INFO` «Fecha límite próxima» para el REVISOR de la DDRISS y una para cada establecimiento obligado sin enviar.
- [ ] El día después de la fecha límite, por cada establecimiento obligado sin enviar, se crea una alerta `CRITICA` «Reporte sin enviar» para el REVISOR y otra para el establecimiento.
- [ ] Un reporte en `ENVIADO` por más de 3 días genera una alerta `ADVERTENCIA` «Reporte sin revisar» para el REVISOR.
- [ ] Correr la tarea varias veces no duplica alertas del mismo tipo para el mismo reporte o establecimiento y mes, aunque la anterior esté atendida o descartada; solo un reenvío permite una nueva «sin revisar».
- [ ] Las alertas cuya condición desaparece pasan a `DESCARTADA` en la corrida siguiente.
- [ ] Cada alerta creada o descartada deja su fila en la bitácora, sin usuario.
- [ ] La tarea corre al arrancar la API y cada hora, y si falla la API sigue respondiendo.
- [ ] `GET /alertas` devuelve solo las `ACTIVA` del rol y el ámbito del usuario, ordenadas por severidad y fecha, con `total` y `porSeveridad`; responde 400 con cualquier parámetro, 401 sin sesión y 403 sin el permiso.
- [ ] El Inicio del Revisor muestra en «Alertas de calidad y de proceso» el total, el desglose, la alerta de mayor severidad (la más reciente si empatan) y el enlace «Ver alertas» a `/alertas`; el del Establecimiento, lo mismo en la tarjeta nueva «Alertas».
- [ ] Sin alertas, la tarjeta dice «No hay alertas activas.»; los colores salen de las variables del tema.
- [ ] El contrato describe `GET /alertas` y la API arranca.
- [ ] Pasan `alertas.test.js`, `TarjetaAlertas.test.jsx`, `PaginaInicio.test.jsx` y la suite del frontend.
- [ ] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** backend y tarjeta del Inicio en este spec. Las alertas se pueden ver sin esperar a HU-52, y la tarjeta ya estaba reservada desde el SPEC 48.
- **No:** la pantalla Alertas ni «marcar como atendida». Son el contenido de HU-52.
- **Sí:** permiso propio `ALERTA_CONSULTAR`. Reusar `REPORTE_CONSULTAR` mezclaría dos cosas y HU-52 tendría que separarlas.
- **Sí:** «periodo por cerrar» como fecha límite próxima (3 días). Avisa antes del vencimiento, cuando todavía se puede actuar; el mes en `EN_CIERRE` ya se ve en «Periodos por cerrar».
- **No:** una alerta por mes demorado en `EN_CIERRE`. Nadie la pidió.
- **Sí:** «sin revisar» = `ENVIADO` por más de 3 días desde `enviado_en`. Es la espera que depende de la DDRISS; los reportes `EN_REVISION` ya tienen a alguien asignado.
- **Sí:** N fijo en el backend, como `UMBRAL_RECTIFICACIONES_MES` (SPEC 57). La historia lo pide así.
- **Sí:** el Establecimiento también recibe las suyas (fecha próxima y vencida). Es quien puede resolverlas.
- **Sí:** una alerta «sin enviar» por establecimiento, también para el Revisor. Cumple el criterio literal y permite atender cada una en HU-52.
- **No:** un resumen por mes. Su mensaje cambiaría mientras van enviando y no se atiende por establecimiento.
- **Sí:** la clase de alerta se identifica por su `titulo` constante. No hay columna para la subclase y `PROCESO` ya lo usa «Rectificaciones frecuentes».
- **Sí:** buscar duplicados en cualquier estado. Una alerta atendida a mano no debe reaparecer cada hora.
- **Sí:** una «sin revisar» por envío (`generada_en ≥ enviado_en`). Un reenvío es una espera nueva.
- **Sí:** la tarea descarta las alertas que ya no aplican. La tarjeta no muestra avisos resueltos; `ATENDIDA` queda para la acción manual de HU-52.
- **Sí:** una tarea propia en el módulo `alertas`, junto a la de cierre en `server.js`. Las condiciones usan la fecha y no el estado `EN_CIERRE`, así que el orden entre las dos tareas no importa.
- **Sí:** módulo nuevo `alertas` en el backend, que reutilizarán HU-51 y HU-52; el spec va en `specs/revision/` porque las alertas son del proceso de envío y revisión.
- **Sí:** bitácora con `modulo: REVISION` y sin usuario, como el cierre automático (SPEC 39). El `ENUM` de `bitacora.modulo` no tiene un módulo de alertas y no se toca el modelo.
- **Sí:** dejar visible la opción «Alertas» del menú (`opcionesMenu.js`, permiso provisional `ALERTA_CONSULTAR`, sin `pagina`). Con el permiso creado, el Revisor y el Personal la ven y abre «En construcción» hasta HU-52, como cualquier pantalla pendiente; HU-52 solo pone su `pagina` (decisión del equipo, 2026-11-15).
- **No:** quitar el parámetro `estado` para siempre. Se saca del borrador del contrato porque aquí solo se devuelven las activas; HU-52 lo agrega con su filtro.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La primera corrida en la base de prueba crea muchas alertas de meses viejos que siguen `EN_CIERRE` | Antes del paso 4 se consulta qué meses están `EN_CIERRE` con establecimientos sin enviar; si hay meses de prueba olvidados, se anota y se decide con el equipo antes de arrancar la tarea. |
| Las pruebas corren `generarAlertas` sobre toda la base y descartan o crean alertas reales | `hoy` y `ahora` fijos en 1998 solo alcanzan los meses y reportes de 1998 para crear; el descarte de alertas reales solo ocurre si su condición de verdad desapareció, que es lo correcto. |
| Dos instancias de la API correrían la tarea a la vez y podrían duplicar | Hoy hay una sola instancia; la transacción bloquea con `FOR UPDATE` los `cierre_periodo` que revisa. Se anota en el `CLAUDE.md` del módulo. |
| Aiven apagado por inactividad hace fallar la tarea | Se registra en consola y se reintenta en una hora, como la tarea de cierre. |
| La semilla (`03`) trae alertas de ejemplo `ACTIVA` con otros títulos («Centro de Salud …: 5C de septiembre pendiente»), que la tarea no descarta: en el Inicio del Revisor se ven junto a las «Reporte sin enviar» de septiembre | Se dejan así (decisión del equipo, 2026-11-15): son datos de ejemplo y se limpian cuando estén todas las funciones de alertas (HU-52 permite atenderlas). |
| El Establecimiento ve «fecha próxima» de un mes que su reporte ya envió en otra pestaña | La tarjeta lee al cargar el Inicio; la próxima corrida horaria la descarta. |

## Lo que **no** entra en este spec

- La pantalla Alertas, el ícono de la barra, los filtros y marcar como atendida (HU-52).
- Alertas de cobertura y de calidad (HU-51).
- Plazos configurables, correo o notificaciones en tiempo real.
- Cambios al modelo de datos, a `transicion_estado` o a `package.json`.

Cada uno, si llega, va en su propio spec.
