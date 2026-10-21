# SPEC 04 — Control de acceso por permiso y ámbito

> **Estado:** Implementado
> **Historia:** HU-06 (backend, más `tienePermiso` en el frontend como base)
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-20
> **Objetivo:** El backend exige un permiso por función con `requierePermiso(codigo)`, impide escrituras al rol `AUTORIDAD`, ofrece utilidades de ámbito por establecimiento o DDRISS y deja un script idempotente para crear permisos y asignarlos a los roles sin cambiar el código.

## Por qué existe este spec

HU-06 pedía permisos "por rol", pero el equipo decidió usar **seguridad granular**: un permiso por función (`USUARIO_CREAR`, `USUARIO_DESACTIVAR`), no uno por módulo. El rol es solo un conjunto de permisos en `rol_permiso`. La historia se ajustó en `HISTORIAS_DE_USUARIO.md` antes de escribir este spec.

Todavía no está definido qué rol puede hacer qué. Por eso este spec **no fija la matriz**: construye el mecanismo y la convención para agregar permisos. Cada spec posterior crea los permisos de sus propios endpoints y los asigna a los roles cuando se decida.

Hoy no existe ningún endpoint de negocio (solo `/salud` y `/auth/*`). El mecanismo se prueba con una app de Express creada dentro de la prueba, como `autenticar` en el SPEC 01.

## Alcance

**Entra:**

- Convención de códigos de permiso: `ENTIDAD_ACCION`, con el módulo en `permiso.modulo`.
- Middleware `requierePermiso(codigo)`, que lee `req.usuario.permisos` del token y responde 403 `SIN_PERMISO`.
- Guardia de solo consulta: dentro de `requierePermiso`, el rol `AUTORIDAD` recibe 403 en cualquier método distinto de `GET` y `HEAD`, aunque tenga el permiso.
- Utilidades de ámbito: `filtroAlcance(usuario, columnas)` para las consultas SQL y `verificarAlcance(usuario, recurso)`, que responde 404 si el recurso está fuera del ámbito.
- Script `backend/db/05_permisos_mysql.sql`, idempotente, para crear permisos y asignarlos a los roles sin recrear la base.
- Respuesta común `SinPermiso` y la extensión `x-permiso` en `backend/openapi.yaml`.
- Pruebas del backend: del middleware, de las utilidades de ámbito y una de integración con el token real del usuario de prueba.
- `tienePermiso(codigo)` en `useSesion()` del frontend, con sus pruebas, como base para HU-11.
- Actualizar el avance de HU-06 y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- La matriz de permisos por rol. Cada spec crea y asigna los permisos de sus endpoints.
- Aplicar `requierePermiso` a endpoints de negocio: no existe ninguno todavía.
- Pantalla de gestión de roles y permisos (solo para el Administrador). Es HU-61.
- Ocultar menús o proteger rutas del frontend por permiso (HU-11).
- Leer los permisos de la base en cada petición o revocar tokens.
- Registrar en la bitácora los accesos denegados.
- Cambios a `01_modelo_relacional_mysql.sql` o a las tablas `rol`, `permiso` y `rol_permiso`.
- Cambios a `transicion_estado`: las transiciones del reporte siguen su propia tabla.

## Modelo de datos

Este spec **no cambia el modelo**: no hay tablas, columnas ni colecciones nuevas. Usa `rol`, `permiso` y `rol_permiso` del script `01_modelo_relacional_mysql.sql` (v0.8). El login del SPEC 01 ya lee los permisos de `rol_permiso` y los pone en el JWT.

### Convención de permisos

- Un permiso por función que expone un endpoint: `ENTIDAD_ACCION`, en mayúsculas y singular. Ejemplos: `USUARIO_CREAR`, `USUARIO_DESACTIVAR`, `REPORTE_APROBAR`, `MUNICIPIO_CONSULTAR`.
- Las lecturas también llevan permiso propio (`..._CONSULTAR`), aunque se asignen a los cinco roles.
- `permiso.modulo` es el nombre de uno de los ocho módulos de la propuesta, en mayúsculas y `snake_case`, como el `CONFIGURACION_CATALOGOS` que ya existe. El código de cada módulo lo fija el primer spec que crea un permiso en él, y se anota en el encabezado de `05_permisos_mysql.sql`.
- Un código no se borra ni se renombra (regla 6 de `AGENTS.md`). Quitarle una función a un rol es borrar su fila de `rol_permiso`.
- `/salud`, `POST /auth/login`, `POST /auth/logout` y `GET /auth/yo` no llevan permiso.

### Middleware `requierePermiso(codigo)`

En `src/middlewares/permisos.js`. Se monta después de `autenticar`:

```js
router.post('/usuarios', autenticar, requierePermiso('USUARIO_CREAR'), usuariosController.crear);
```

Orden de evaluación:

1. Al crear el middleware, si `codigo` no cumple `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$`, lanza un `Error`. La API no arranca con un código mal escrito.
2. Sin `req.usuario` → 401 `NO_AUTENTICADO`.
3. Rol `AUTORIDAD` y método distinto de `GET` o `HEAD` → 403 `SIN_PERMISO`.
4. `codigo` no está en `req.usuario.permisos` → 403 `SIN_PERMISO`.
5. En otro caso, `next()`.

| HTTP | `codigo` | `mensaje` |
|---|---|---|
| 403 | `SIN_PERMISO` | No tiene permiso para realizar esta acción. |
| 404 | `NO_ENCONTRADO` | El recurso solicitado no existe. (utilidades de ámbito) |

### Utilidades de ámbito

En `src/modulos/auth/alcance.service.js`. Siguen la regla 10 de `AGENTS.md`:

| Rol | Ámbito |
|---|---|
| `ESTABLECIMIENTO` | Solo su `establecimientoId` |
| `REVISOR`, `EPIDEMIOLOGIA`, `ADMINISTRADOR` | Su `ddrissId` |
| `AUTORIDAD` con `ddrissId` | Su `ddrissId` |
| `AUTORIDAD` con `ddrissId` NULL | Todo el país |
| Cualquier otro caso (sin DDRISS o sin establecimiento cuando lo necesita) | Nada |

- `filtroAlcance(usuario, { establecimiento, ddriss })` recibe los nombres de las columnas, escritos por el programador y nunca por el usuario, y devuelve `{ condicion, parametros }` para agregar al `WHERE`:

  ```js
  filtroAlcance(usuario, { establecimiento: 'r.establecimiento_id', ddriss: 'r.ddriss_id' })
  // ESTABLECIMIENTO → { condicion: 'r.establecimiento_id = ?', parametros: [12] }
  // REVISOR         → { condicion: 'r.ddriss_id = ?', parametros: [1] }
  // AUTORIDAD país  → { condicion: '1 = 1', parametros: [] }
  // sin ámbito      → { condicion: '1 = 0', parametros: [] }
  ```

- `verificarAlcance(usuario, { establecimientoId, ddrissId })` recibe los datos de un recurso ya leído. Si está fuera del ámbito, lanza `ErrorApi(404, 'NO_ENCONTRADO', ...)`. Es el mismo 404 de un recurso que no existe, para no revelar qué existe fuera del ámbito.

### Script `backend/db/05_permisos_mysql.sql`

- Es el **catálogo real de permisos del sistema**, no un script de datos de prueba: se corre en la base de prueba y, más adelante, en producción.
- **No borra ni recrea la base**, a diferencia del 01 y del 03. No tiene `DROP` ni `TRUNCATE` y no toca la bitácora, los usuarios ni los reportes; solo agrega permisos y asignaciones que falten y, en su sección de retiradas, quita asignaciones concretas de `rol_permiso`.
- Se corre después de `01_modelo_relacional_mysql.sql`, y se puede volver a correr encima sin borrar nada.
- Sección **Permisos:** `INSERT IGNORE INTO permiso (codigo, modulo, descripcion)`.
- Sección **Asignaciones:** `INSERT IGNORE INTO rol_permiso (rol_id, permiso_id) SELECT r.id, p.id FROM rol r JOIN permiso p ... WHERE r.codigo = '...' AND p.codigo = '...'`, por códigos y nunca por ids.
- Sección **Asignaciones retiradas:** un `DELETE FROM rol_permiso` por códigos, para quitar una función a un rol.
- En este spec el script solo contiene `POBLACION_REGISTRAR` → `ADMINISTRADOR`, que ya existe en el 01, como ejemplo de cada sección (la de retiradas queda comentada). Los specs siguientes agregan sus líneas.
- El encabezado explica que el script no borra ni recrea la base, cómo agregar un permiso, cómo asignarlo y cómo retirarlo, y que el cambio aplica desde el siguiente inicio de sesión.

### Contrato

- `components.responses.SinPermiso` con el ejemplo de `SIN_PERMISO`.
- Ejemplo `NO_ENCONTRADO` en la respuesta común `NoEncontrado`.
- Convención documentada en `info.description`: cada operación protegida lleva `x-permiso: CODIGO` y la respuesta `"403": { $ref: "#/components/responses/SinPermiso" }`. Este spec no la aplica a ninguna operación, porque ninguna está implementada.

### Frontend

`useSesion()` gana `tienePermiso(codigo)`: devuelve `true` si `sesion.usuario.permisos` incluye el código, y `false` si no hay sesión o no lo incluye. Es solo una ayuda visual; quien decide es el backend.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                          ← SinPermiso, ejemplo NO_ENCONTRADO, convención x-permiso
├── db/05_permisos_mysql.sql              ← nuevo
├── src/
│   ├── middlewares/permisos.js           ← nuevo: requierePermiso
│   └── modulos/auth/alcance.service.js   ← nuevo: filtroAlcance, verificarAlcance
└── tests/
    ├── permisos.test.js                  ← nuevo
    └── alcance.test.js                   ← nuevo
frontend/src/componentes/
├── ProveedorSesion.jsx                   ← tienePermiso
└── ProveedorSesion.test.jsx              ← casos de tienePermiso
docs/SPECS/HISTORIAS_DE_USUARIO.md        ← avance de HU-06 (la historia ya se ajustó)
CLAUDE.md                                 ← nota de contexto sobre permisos
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, agregar la respuesta común `SinPermiso`, el ejemplo `NO_ENCONTRADO` en `NoEncontrado` y la convención `x-permiso` en `info.description`. Comprobación: `/api/docs` carga sin errores y muestra la descripción.
2. **Middleware.** Crear `requierePermiso(codigo)` en `src/middlewares/permisos.js` con el orden de evaluación del "Modelo de datos". Pruebas en `tests/permisos.test.js`, sobre una app de Express creada en la prueba con rutas `GET` y `POST` protegidas por `autenticar` y `requierePermiso('PRUEBA_CONSULTAR')`, y tokens firmados con `JWT_SECRET`:
   - con el permiso → 200;
   - sin permisos → 403 `SIN_PERMISO`;
   - con otro permiso del mismo módulo (`PRUEBA_CREAR`) → 403 `SIN_PERMISO`;
   - `AUTORIDAD` con el permiso: `GET` → 200 y `POST` → 403 `SIN_PERMISO`;
   - sin token → 401 `NO_AUTENTICADO` (lo responde `autenticar`);
   - `requierePermiso('minusculas')` y `requierePermiso('SINGUION')` lanzan un error al crearse.
   Comprobación: `npm test` del backend pasa.
3. **Integración con el login.** En `tests/permisos.test.js`, iniciar sesión con el usuario de prueba (`ADMINISTRADOR`) mediante `POST /auth/login` y usar su token real en la app de la prueba: una ruta con `requierePermiso('POBLACION_REGISTRAR')` responde 200 y una con `requierePermiso('PRUEBA_CREAR')` responde 403. Así se comprueba que el permiso sale de `rol_permiso`.
4. **Ámbito.** Crear `filtroAlcance` y `verificarAlcance` en `src/modulos/auth/alcance.service.js`. Pruebas unitarias en `tests/alcance.test.js`, una por fila de la tabla de ámbito:
   - `filtroAlcance` devuelve la condición y los parámetros esperados para cada rol;
   - `verificarAlcance` deja pasar un recurso del propio establecimiento o DDRISS y lanza 404 `NO_ENCONTRADO` con uno de otro;
   - un `ESTABLECIMIENTO` no ve otro establecimiento de su misma DDRISS;
   - `AUTORIDAD` sin DDRISS ve un recurso de cualquier DDRISS;
   - un rol distinto de `AUTORIDAD` con `ddrissId` NULL no ve nada (`1 = 0` y 404).
   Comprobación: `npm test` del backend pasa.
5. **Script de permisos.** Crear `backend/db/05_permisos_mysql.sql` con su encabezado y las tres secciones. **Antes de crearlo y antes de correrlo, pedir confirmación** (zona protegida). Con autorización, correrlo dos veces sobre la base de prueba de Aiven. Comprobación: no da error ninguna de las dos veces y `rol_permiso` sigue teniendo una sola fila de `POBLACION_REGISTRAR` → `ADMINISTRADOR`.
6. **Frontend.** Agregar `tienePermiso(codigo)` al contexto de `ProveedorSesion.jsx`. Pruebas en `ProveedorSesion.test.jsx`:
   - sin sesión → `false`;
   - con una sesión cuyo `usuario.permisos` incluye el código → `true`;
   - con un código que no está → `false`.
   Comprobación: `npm test` del frontend pasa.
7. **Verificación manual y documentación.** Con autorización, sobre la base de prueba. El borrado de este paso es un `DELETE` de una sola fila que se corre a mano; el 05 solo la vuelve a crear:
   - borrar la fila `POBLACION_REGISTRAR` → `ADMINISTRADOR` de `rol_permiso`, iniciar sesión con el usuario de prueba y comprobar que el token ya no trae ese permiso y que la prueba del paso 3 responde 403;
   - correr `05_permisos_mysql.sql`, iniciar sesión de nuevo y comprobar que vuelve a responder 200.
   Agregar en "Notas de contexto" de `CLAUDE.md` la convención `ENTIDAD_ACCION` y que los permisos se crean y asignan en `05_permisos_mysql.sql`. Actualizar el "Avance" de HU-06 y marcar sus criterios cuando se cumplan los de este spec.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` tiene la respuesta común `SinPermiso`, el ejemplo `NO_ENCONTRADO` y la convención `x-permiso`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba.
- [ ] Una ruta con `requierePermiso` responde 200 a un token que tiene el permiso y 403 `SIN_PERMISO` a uno que no lo tiene.
- [ ] Un token con otro permiso del mismo módulo recibe 403 `SIN_PERMISO`.
- [ ] Un token de `AUTORIDAD` con el permiso recibe 403 `SIN_PERMISO` en `POST` y 200 en `GET`.
- [ ] `requierePermiso` con un código que no cumple `ENTIDAD_ACCION` lanza un error al crearse.
- [ ] Con el token real del usuario de prueba, `requierePermiso('POBLACION_REGISTRAR')` responde 200.
- [ ] Al quitar `POBLACION_REGISTRAR` del `ADMINISTRADOR` en `rol_permiso`, el siguiente inicio de sesión recibe 403; al correr `05_permisos_mysql.sql` y volver a entrar, recibe 200. No se cambia código.
- [ ] `filtroAlcance` y `verificarAlcance` limitan `ESTABLECIMIENTO` a su establecimiento, los demás roles a su DDRISS y `AUTORIDAD` sin DDRISS a todo el país.
- [ ] Un recurso fuera del ámbito produce 404 `NO_ENCONTRADO`, y un rol distinto de `AUTORIDAD` sin DDRISS no ve nada.
- [ ] `05_permisos_mysql.sql` se puede correr dos veces seguidas sin error y sin duplicar filas.
- [ ] `useSesion().tienePermiso(codigo)` devuelve `true` solo si la sesión incluye el código.
- [ ] `/salud`, `POST /auth/login` y `POST /auth/logout` siguen respondiendo como antes.
- [ ] HU-06 en `HISTORIAS_DE_USUARIO.md` tiene su avance actualizado.

## Decisiones

- **Sí:** seguridad granular, un permiso por función. Es más segura y permite dar o quitar una sola función a un rol.
- **No:** un permiso por módulo (`USUARIO_GESTIONAR`). Obliga a dar todo el módulo o nada.
- **No:** revisar el código de rol en las rutas (`requiereRol`). Cambiar qué hace un rol obligaría a cambiar el código.
- **Sí:** no fijar la matriz de permisos en este spec. El equipo aún no define qué rol hace qué; cada spec crea y asigna los permisos de sus endpoints.
- **Sí:** los permisos se leen del JWT. Sigue la decisión del SPEC 01: un cambio en `rol_permiso` aplica desde el siguiente inicio de sesión, a más tardar en 2 h.
- **No:** consultar `rol_permiso` en cada petición. Una consulta más por endpoint y contradice el SPEC 01.
- **Sí:** las lecturas también llevan permiso (`..._CONSULTAR`). Es coherente con la seguridad granular, aunque al principio se asignen a los cinco roles.
- **Sí:** `05_permisos_mysql.sql` idempotente, con `INSERT IGNORE` y asignaciones por código. Se puede correr sobre la base de prueba sin recrearla y crece con cada spec.
- **No:** agregar los permisos a la siembra del 01. Obliga a recrear la base, que borra la bitácora y los datos de prueba.
- **Sí:** número `05`, porque `03` y `04` ya son los datos de prueba.
- **Sí:** la guardia de `AUTORIDAD` vive dentro de `requierePermiso`. Toda escritura protegida pasa por ahí, y `POST /auth/logout`, que no lleva permiso, sigue funcionando para la autoridad.
- **No:** una guardia global por método montada en `app.js`. Tendría que exceptuar las rutas de `auth` y se salta si alguien monta una ruta antes.
- **Sí:** la guardia responde el mismo 403 `SIN_PERMISO`. Para el usuario no hay diferencia entre "no tiene el permiso" y "su rol es de solo consulta".
- **Sí:** un recurso fuera del ámbito responde 404, como ya fija `INSTRUCCIONES_BACKEND.md`. No revela qué existe fuera del ámbito.
- **Sí:** las utilidades de ámbito fallan cerrado: un rol distinto de `AUTORIDAD` sin DDRISS no ve nada, aunque el login ya lo impide.
- **Sí:** las utilidades de ámbito reciben los nombres de las columnas del programador y devuelven parámetros `?`. Ningún dato del usuario entra en el SQL.
- **Sí:** `requierePermiso` valida el formato del código al crearse. Un error de dedo detiene el arranque en lugar de dejar una ruta que siempre responde 403.
- **No:** registrar en la bitácora los accesos denegados. La bitácora guarda escrituras; si se necesita, va en otro spec.
- **Sí:** `tienePermiso` en el frontend ahora, sin usarlo en pantallas. Deja la base para HU-11; el backend sigue siendo quien decide.
- **No:** pantalla de gestión de roles en este spec. Será solo para el Administrador y quedó como HU-61 en el backlog.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un endpoint nuevo se monta sin `requierePermiso` y queda abierto a cualquier sesión | La convención `x-permiso` en el contrato y la nota en `CLAUDE.md` lo recuerdan; cada spec debe incluir una prueba denegada de sus endpoints. |
| Un cambio en `rol_permiso` tarda hasta 2 h en aplicarse | Riesgo aceptado en el SPEC 01. El encabezado de `05_permisos_mysql.sql` lo advierte. |
| Se edita `05_permisos_mysql.sql` y se olvida correrlo en la base de prueba | El permiso no llega al token y las pruebas permitidas responden 403, así que el error se ve enseguida. |
| La verificación manual del paso 7 deja al `ADMINISTRADOR` sin `POBLACION_REGISTRAR` | El mismo paso corre `05_permisos_mysql.sql`, que restaura la fila. |
| Un permiso de escritura asignado a `AUTORIDAD` por error | La guardia de `requierePermiso` lo bloquea igual. |

## Lo que **no** entra en este spec

- La matriz de permisos por rol y la protección de endpoints de negocio.
- Pantalla de gestión de roles y permisos (HU-61, solo Administrador).
- Ocultar menús o proteger rutas del frontend (HU-11).
- Leer permisos de la base en cada petición, revocar tokens y registrar accesos denegados.
- Cambios a `01_modelo_relacional_mysql.sql` y a `transicion_estado`.

Cada uno, si se hace, va en su propio spec.
