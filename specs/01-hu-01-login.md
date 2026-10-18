# SPEC 01 — Inicio de sesión (backend)

> **Estado:** Aprobado
> **Historia:** HU-01 (parte backend; la pantalla de inicio de sesión va en el spec siguiente)
> **Depende de:** —
> **Fecha:** 2026-10-18
> **Objetivo:** `POST /api/v1/auth/login` valida el nombre de usuario y la contraseña, bloquea la cuenta tras intentos fallidos, registra cada intento en la bitácora y devuelve un JWT con el rol, los permisos y el alcance del usuario.

## Por qué existe este spec

HU-01 abarca backend y frontend, y el frontend todavía no existe. Se dividió en dos specs: este cubre la API, las pruebas del backend y la forma de crear usuarios. El siguiente cubre el proyecto de React y la pantalla de inicio de sesión. Además, la base no tiene ningún usuario, así que este spec incluye un script para crear el primero.

## Alcance

**Entra:**

- Actualizar el contrato de `POST /auth/login` en `backend/openapi.yaml` antes de programar.
- `POST /api/v1/auth/login` con nombre de usuario y contraseña.
- Respuestas: 200 (token y datos de la sesión), 400 (datos mal formados), 401 (credenciales incorrectas, mensaje genérico), 403 (cuenta desactivada o sin alcance), 423 (cuenta bloqueada).
- Bloqueo de 5 intentos fallidos seguidos durante 15 minutos.
- Registro en `bitacora` de `LOGIN_OK`, `LOGIN_FALLIDO`, `CUENTA_BLOQUEADA` y `CREAR` (script).
- Middleware `autenticar`, que verifica el JWT y deja los datos de la sesión en `req.usuario`. En este spec no se monta en ninguna ruta.
- Script `npm run crear-usuario` para crear un empleado y su cuenta desde la terminal.
- Configuración de pruebas con Vitest y Supertest, y pruebas de integración contra las bases de prueba (Aiven y Atlas).
- Dependencias nuevas de la lista permitida: `jsonwebtoken`, `bcrypt`, `vitest` y `supertest`.
- `JWT_EXPIRACION=2h` en `backend/.env.example`.

**Fuera de alcance (para otros specs):**

- Proyecto de React y pantalla de inicio de sesión (spec siguiente, HU-01 frontend).
- `GET /auth/yo` (spec del frontend o HU-02).
- `POST /auth/logout` y cierre por inactividad (HU-02).
- Permisos por ruta y respuestas 403 por falta de permiso (HU-06).
- Cambio obligatorio de contraseña con `debe_cambiar_contrasena` (HU-03).
- Inicio de sesión con el correo institucional.
- Recuperación de contraseña, tokens de renovación y revocación de tokens.
- Creación de usuarios desde la API (HU-04).
- Datos de prueba de catálogos (establecimientos, etc.); los carga el equipo aparte.
- Límite de peticiones por IP y configuración de `trust proxy` para el despliegue.

## Modelo de datos

Este spec **no cambia el modelo**: no hay tablas, columnas ni colecciones nuevas. Usa `usuario`, `empleado`, `rol`, `permiso`, `rol_permiso`, `ddriss`, `establecimiento` y `bitacora` del script `01_modelo_relacional_mysql.sql` (v0.8).

Columnas de `usuario` que se usan: `nombre_usuario`, `hash_contrasena`, `rol_id`, `activo`, `intentos_fallidos`, `bloqueado_hasta` y `ultimo_acceso`. `debe_cambiar_contrasena` se ignora en este spec.

**Cuerpo de la petición:**

```json
{ "nombreUsuario": "jperez", "contrasena": "********" }
```

**Respuesta 200** (`UsuarioSesion` gana `empleado.ddrissId`):

```json
{
  "token": "eyJ...",
  "usuario": {
    "id": 7,
    "nombreUsuario": "jperez",
    "rol": "ADMINISTRADOR",
    "permisos": ["POBLACION_REGISTRAR"],
    "empleado": {
      "nombres": "Juan",
      "apellidos": "Pérez",
      "ddrissId": 1,
      "establecimientoId": null,
      "municipioId": null
    }
  }
}
```

**Contenido del JWT** (HS256, vence según `JWT_EXPIRACION`):

```js
{ sub: '7', rol: 'ADMINISTRADOR', permisos: ['POBLACION_REGISTRAR'],
  ddrissId: 1, establecimientoId: null, municipioId: null }
```

`autenticar` deja en `req.usuario`: `{ id, rol, permisos, ddrissId, establecimientoId, municipioId }`.

**Códigos de error** (formato común `{ error: { codigo, mensaje } }`):

| HTTP | `codigo` | `mensaje` |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Debe indicar el nombre de usuario y la contraseña. |
| 401 | `CREDENCIALES_INVALIDAS` | Usuario o contraseña incorrectos. |
| 403 | `CUENTA_DESACTIVADA` | Su cuenta está desactivada; contacte al administrador. |
| 403 | `CUENTA_SIN_ALCANCE` | Su cuenta no tiene una DDRISS o un establecimiento asignado; contacte al administrador. |
| 423 | `CUENTA_BLOQUEADA` | Su cuenta está bloqueada por 15 minutos por intentos fallidos. |
| 401 | `NO_AUTENTICADO` | Debe iniciar sesión. (middleware: falta el token o no es válido) |
| 401 | `SESION_VENCIDA` | Su sesión venció; inicie sesión de nuevo. (middleware: token vencido) |

**Orden de evaluación del login:**

1. Falta `nombreUsuario` o `contrasena`, o no son textos con contenido → 400.
2. El usuario no existe → se compara contra un hash ficticio (para que tarde lo mismo) → 401.
3. `bloqueado_hasta > NOW()` → 423, sin revisar la contraseña ni sumar intentos.
4. Si el bloqueo ya venció, se reinician `intentos_fallidos` y `bloqueado_hasta` antes de seguir.
5. Contraseña incorrecta → `intentos_fallidos + 1`. Al llegar a 5: `bloqueado_hasta = NOW() + 15 min` y se responde 423 en ese mismo intento. Antes de 5, se responde 401.
6. Contraseña correcta, pero `usuario.activo` o `empleado.activo` es FALSE → 403 `CUENTA_DESACTIVADA`. El contador no cambia.
7. Contraseña correcta, pero el rol no es `AUTORIDAD` y `empleado.ddriss_id` es NULL, o el rol es `ESTABLECIMIENTO` y no tiene `establecimiento_id` → 403 `CUENTA_SIN_ALCANCE`.
8. Login correcto → `intentos_fallidos = 0`, `bloqueado_hasta = NULL`, `ultimo_acceso = NOW()` → 200.

Las escrituras de cada intento (cambios en `usuario` y filas de `bitacora`) se hacen en una sola transacción, con `SELECT ... FOR UPDATE` sobre la fila del usuario. Las fechas se comparan con `NOW()` de MySQL, no con la hora del servidor de Node.

**Filas de `bitacora`** (módulo `USUARIOS`, entidad `usuario`, con `ip_origen` y `agente_usuario`):

| `accion` | `usuario_id` | `nombre_usuario_intento` | `entidad_id` | `valores_nuevos` |
|---|---|---|---|---|
| `LOGIN_OK` | id del usuario | NULL | id del usuario | NULL |
| `LOGIN_FALLIDO` | NULL | lo que se escribió | id o NULL si no existe | `{ "motivo": "CREDENCIALES" \| "BLOQUEADA" \| "DESACTIVADA" \| "SIN_ALCANCE" }` |
| `CUENTA_BLOQUEADA` | NULL | lo que se escribió | id del usuario | `{ "bloqueadoHasta": "..." }` |
| `CREAR` (script) | NULL | NULL | id del empleado o del usuario | datos creados, **sin** la contraseña ni su hash |

La contraseña nunca se guarda en la bitácora ni sale en una respuesta o en un log. Tampoco sale su hash.

**Variables de entorno:**

- Pasan a ser obligatorias en `src/config/entorno.js`: `JWT_SECRET` y `JWT_EXPIRACION`.
- Nuevas en `.env.example`, solo para las pruebas: `PRUEBA_USUARIO=` y `PRUEBA_CONTRASENA=`.
- `.env.example` queda con `JWT_EXPIRACION=2h`.

**Archivos que aparecen o cambian:**

```
backend/
├── openapi.yaml                       ← contrato de /auth/login
├── package.json                       ← dependencias y scripts test / crear-usuario
├── .env.example                       ← JWT_EXPIRACION=2h, PRUEBA_*
├── vitest.config.js                   ← nuevo
├── scripts/crear-usuario.js           ← nuevo
├── tests/
│   ├── preparar-entorno.js            ← nuevo: carga .env con process.loadEnvFile
│   ├── salud.test.js                  ← nuevo
│   ├── auth.login.test.js             ← nuevo
│   └── autenticar.test.js             ← nuevo
└── src/
    ├── app.js                         ← monta las rutas de auth
    ├── config/entorno.js              ← JWT_SECRET, JWT_EXPIRACION
    ├── middlewares/errores.js         ← clase ErrorApi
    ├── middlewares/autenticar.js      ← nuevo
    └── modulos/
        ├── auditoria/auditoria.service.js   ← nuevo: registrarBitacora
        └── auth/auth.routes.js, auth.controller.js, auth.service.js  ← nuevos
```

## Plan de implementación

1. **Contrato.** Actualizar `POST /auth/login` en `backend/openapi.yaml`: respuestas 400, 401, 403 (`CUENTA_DESACTIVADA`, `CUENTA_SIN_ALCANCE`) y 423 con sus ejemplos, `empleado.ddrissId` en `UsuarioSesion` y los códigos `NO_AUTENTICADO` y `SESION_VENCIDA` en `NoAutenticado`. Comprobación: `/api/docs` muestra los cambios.
2. **Pruebas.** Instalar `vitest` y `supertest` como dependencias de desarrollo. Crear `vitest.config.js` (archivos en serie, `tests/preparar-entorno.js` como archivo de preparación), agregar el script `"test": "vitest run"` y escribir `tests/salud.test.js`, que comprueba el 200 de `/salud`. Comprobación: `npm test` pasa.
3. **Configuración y errores.** Agregar `JWT_SECRET` y `JWT_EXPIRACION` a las obligatorias de `entorno.js`, actualizar `.env.example` y agregar la clase `ErrorApi(status, codigo, mensaje)` en `errores.js`, que `manejarErrores` convierte al formato común. Comprobación: la API arranca, y sin `JWT_SECRET` no arranca.
4. **Bitácora.** Crear `registrarBitacora(conexion, datos)` en `modulos/auditoria/auditoria.service.js`, con INSERT parametrizado que recibe la conexión de la transacción en curso. Comprobación: `npm test` sigue pasando.
5. **Script crear-usuario.** Instalar `bcrypt`. Crear `scripts/crear-usuario.js` y el script `"crear-usuario": "node --env-file=.env scripts/crear-usuario.js"`.
   - Pregunta con `node:readline`: nombres, apellidos, correo (opcional), nombre de usuario, contraseña dos veces (oculta, mínimo 8 caracteres), código de rol, código de DDRISS (opcional solo para `AUTORIDAD`) y, para `ESTABLECIMIENTO`, el id de un establecimiento activo de esa DDRISS.
   - Inserta `empleado`, `usuario` (bcrypt con costo 12) y dos filas `CREAR` en una transacción.
   - Comprobación: crear el usuario de prueba (rol `ADMINISTRADOR`, DDRISS `DDRISS_SM`) y anotarlo en `PRUEBA_USUARIO` y `PRUEBA_CONTRASENA`.
6. **Login correcto e incorrecto.** Instalar `jsonwebtoken`. Crear `auth.service.js`, `auth.controller.js` y `auth.routes.js`, y montarlos en `app.js` bajo `/api/v1/auth`. Implementar los pasos 1, 2, 5 (sin bloqueo) y 8 del orden de evaluación, con la bitácora. Pruebas en `auth.login.test.js`: 200 con token válido, 401 por contraseña incorrecta, 401 por usuario inexistente con el mismo cuerpo de respuesta, y 400.
7. **Bloqueo, cuenta desactivada y alcance.** Implementar los pasos 3, 4, 6 y 7. Pruebas que modifican directamente al usuario de prueba y lo restauran en `afterEach`:
   - 4 fallos dan 401 y el 5.º da 423.
   - Con el bloqueo activo, la contraseña correcta da 423.
   - Con `bloqueado_hasta` en el pasado, la contraseña correcta da 200 y el contador vuelve a 0.
   - Con la cuenta desactivada: 403 con la contraseña correcta y 401 con la incorrecta.
   - Con `ddriss_id` NULL en el empleado: 403 `CUENTA_SIN_ALCANCE`.
8. **Middleware autenticar.** Crear `middlewares/autenticar.js`. Lee `Authorization: Bearer <token>`, verifica con HS256 y `JWT_SECRET`, y llena `req.usuario`; responde `NO_AUTENTICADO` o `SESION_VENCIDA`. Pruebas en `autenticar.test.js` sobre una app de Express creada dentro de la prueba, con una ruta que devuelve `req.usuario`: sin encabezado, token mal formado, token firmado con otro secreto, token vencido y token válido.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta las respuestas 200, 400, 401, 403 y 423 de `POST /auth/login`, y `/api/docs` las muestra.
- [ ] `npm test` pasa contra Aiven y Atlas sin desactivar ninguna prueba.
- [ ] `npm run crear-usuario` crea un empleado y su cuenta, y la contraseña queda guardada solo como hash bcrypt en `usuario.hash_contrasena`.
- [ ] El script rechaza un nombre de usuario repetido, una contraseña de menos de 8 caracteres, un rol inexistente, un rol distinto de `AUTORIDAD` sin DDRISS y un rol `ESTABLECIMIENTO` sin establecimiento válido.
- [ ] Con credenciales correctas, el login responde 200 con `token` y `usuario` (`id`, `nombreUsuario`, `rol`, `permisos`, `empleado`).
- [ ] El token decodificado contiene `sub`, `rol`, `permisos`, `ddrissId`, `establecimientoId` y `municipioId`, y vence según `JWT_EXPIRACION`.
- [ ] Una contraseña incorrecta y un usuario inexistente responden el mismo 401 `CREDENCIALES_INVALIDAS`, con el mismo cuerpo.
- [ ] Un cuerpo sin `nombreUsuario` o sin `contrasena` responde 400 `ENTRADA_INVALIDA`.
- [ ] El 5.º intento fallido seguido responde 423 `CUENTA_BLOQUEADA`, y durante 15 minutos la contraseña correcta también responde 423.
- [ ] Un login correcto deja `intentos_fallidos = 0`, `bloqueado_hasta = NULL` y actualiza `ultimo_acceso`.
- [ ] Una cuenta desactivada (usuario o empleado) responde 403 `CUENTA_DESACTIVADA` solo con la contraseña correcta; con una incorrecta responde 401.
- [ ] Una cuenta que no es `AUTORIDAD` y no tiene DDRISS responde 403 `CUENTA_SIN_ALCANCE`.
- [ ] Cada intento deja su fila en `bitacora` (`LOGIN_OK`, `LOGIN_FALLIDO` o `CUENTA_BLOQUEADA`) con IP y agente de usuario, y ninguna fila contiene la contraseña ni su hash.
- [ ] Ninguna respuesta de la API contiene `contrasena`, `hash_contrasena` ni `hashContrasena`.
- [ ] `autenticar` responde 401 `NO_AUTENTICADO` sin token, con un token mal formado o firmado con otro secreto, y 401 `SESION_VENCIDA` con un token vencido.
- [ ] Con un token válido, `autenticar` deja en `req.usuario` los campos `id`, `rol`, `permisos`, `ddrissId`, `establecimientoId` y `municipioId`.
- [ ] `GET /api/v1/salud` sigue respondiendo 200.

## Decisiones

- **Sí:** dividir HU-01 en backend (este spec) y frontend (spec siguiente). Juntas tocaban cinco áreas y no se podían revisar paso a paso.
- **Sí:** token completo, con rol, permisos y alcance. El middleware no consulta la base en cada petición.
- **No:** token mínimo con lectura de la base en cada petición. Era más seguro ante desactivaciones, pero el equipo prefirió el token completo con una vida más corta.
- **Sí:** `JWT_EXPIRACION=2h`. Limita a 2 horas el tiempo en que un token sigue sirviendo después de desactivar una cuenta o cambiar su rol.
- **Sí:** bloqueo de 5 intentos seguidos durante 15 minutos, con 423 en el mismo intento que bloquea. Las columnas ya existían y el contrato ya preveía el 423. Los números van en constantes de `auth.service.js`.
- **Sí:** mensaje propio para la cuenta desactivada, pero solo con la contraseña correcta. Solo descubre que la cuenta existe quien ya conoce la contraseña.
- **No:** mensaje de cuenta desactivada con cualquier contraseña. Permitía averiguar qué cuentas existen.
- **Sí:** comparar contra un hash ficticio cuando el usuario no existe, para que el tiempo de respuesta no revele qué usuarios existen.
- **Sí:** 403 `CUENTA_SIN_ALCANCE` si un rol distinto de `AUTORIDAD` no tiene DDRISS. Sin esto, el token llevaría `ddrissId: null`, que significa "todo el país" (regla 10 de `AGENTS.md`). Lo mismo para `ESTABLECIMIENTO` sin establecimiento.
- **Sí:** solo nombre de usuario. El texto "Usuario o correo institucional" del mockup se ajusta en el spec del frontend.
- **No:** inicio de sesión con correo. Fuera de este spec.
- **Sí:** separar `SESION_VENCIDA` de `NO_AUTENTICADO`, para que el frontend (HU-02) muestre el aviso correcto.
- **Sí:** solo el middleware `autenticar`. `GET /auth/yo` queda fuera y el middleware se prueba con una app creada dentro de la prueba, sin rutas de prueba en la API real.
- **No:** usar `debe_cambiar_contrasena` todavía. Es parte de HU-03; el login no la devuelve ni la revisa.
- **Sí:** script interactivo `crear-usuario` con `node:readline`, sin dependencias nuevas. Sirve también para crear el primer administrador en producción.
- **No:** INSERT manual o usuarios creados por las pruebas. El INSERT manual se presta a errores; los usuarios de las pruebas se acumularían, porque la bitácora impide borrarlos.
- **Sí:** el script registra `CREAR` en la bitácora con `usuario_id` NULL (proceso manual, regla 7).
- **Sí:** bcrypt con costo 12. Es un equilibrio entre seguridad y tiempo de respuesta.
- **Sí:** pruebas de integración contra las bases de prueba, con un usuario de prueba indicado en `.env`. Siguen la regla de no usar servidores simulados.
- **Sí:** el intento que bloquea la cuenta deja dos filas en la bitácora: `LOGIN_FALLIDO` (el intento falló) y `CUENTA_BLOQUEADA` (la cuenta quedó bloqueada). Así el registro es más completo. Decidido durante la implementación.
- **Sí:** las pruebas pueden modificar directamente al usuario de prueba (activo, intentos, bloqueo, DDRISS, y temporalmente su rol y su establecimiento para probar el rol `ESTABLECIMIENTO`) y lo restauran al terminar. Esos cambios no pasan por la API, así que no van a la bitácora; solo ocurren en la base de prueba.
- **Sí:** `process.loadEnvFile` en el archivo de preparación de Vitest, para cargar `.env` sin dependencias nuevas.
- **Sí:** comparar las fechas del bloqueo con `NOW()` de MySQL. Evita diferencias entre la hora del servidor de Node y la de Aiven.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `bcrypt` es un módulo nativo y su instalación puede fallar en Windows | Usa binarios precompilados para Node 22. Si falla, se detiene el paso 5 y se consulta al equipo antes de cambiar de librería. |
| Dos integrantes corren `npm test` a la vez con el mismo usuario de prueba y se bloquean entre sí | Cada integrante crea su propio usuario de prueba y lo pone en su `PRUEBA_USUARIO`. |
| La bitácora de la base de prueba crece con cada corrida de pruebas | Es esperado: la bitácora no se borra. La base de prueba se puede recrear con los scripts de `backend/db/`, con autorización. |
| Un token sigue sirviendo hasta 2 h después de desactivar la cuenta | Riesgo aceptado con el token completo. La revocación queda para otro spec si hace falta. |
| Intentos fallidos simultáneos sobre la misma cuenta se pierden al contar | `SELECT ... FOR UPDATE` en una transacción serializa los intentos de cada cuenta. |

## Lo que **no** entra en este spec

- La pantalla de inicio de sesión y el proyecto de React (spec siguiente).
- `GET /auth/yo`, `POST /auth/logout` y el cierre por inactividad.
- Permisos por ruta (HU-06) y el cambio obligatorio de contraseña (HU-03).
- Inicio de sesión con correo, recuperación de contraseña y tokens de renovación.
- Crear usuarios desde la API y cargar datos de prueba de catálogos.

Cada uno, si se hace, va en su propio spec.
