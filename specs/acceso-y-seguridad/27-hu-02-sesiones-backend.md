# SPEC 27 — Sesiones en el servidor (backend)

> **Estado:** Implementado
> **Historia:** HU-02 (ajuste del sprint 3: deja de aceptarse el riesgo del token no revocable)
> **Depende de:** SPEC 01, SPEC 03, SPEC 08, SPEC 09, SPEC 10
> **Fecha:** 2026-10-28
> **Objetivo:** Que el backend guarde las sesiones en la tabla `sesion`, con una sola abierta por usuario, y que cada sesión se pueda cerrar, renovar con un refresh token en una cookie `HttpOnly` hasta una jornada de 8 h y vencer por 30 min de inactividad, sin cambiar la respuesta del login que usa el frontend actual.

## Por qué existe este spec

Las pruebas del sprint 2 mostraron tres problemas de la sesión:

1. **Un usuario puede tener la sesión abierta en varios equipos a la vez.**
2. **La sesión dura como mucho 2 h** (el vencimiento del JWT). Se quería una jornada de 8 h, pero un JWT de 8 h que no se puede revocar es un riesgo considerable.
3. **El token sigue sirviendo después de cerrar la sesión.** Pasa al cerrar sesión, por inactividad o cuando el administrador restablece la contraseña: el servidor no guarda las sesiones, así que el token vale hasta su `exp`.

El equipo decidió, en la asesoría del 2026-10-28 (`docs/SPECS/PROPUESTA_SESIONES_BACKEND.md`):

- **El servidor guarda las sesiones** en una tabla `sesion`. Cada sesión se puede cerrar, y un usuario solo tiene una abierta.
- **El JWT sigue durando 2 h** y lleva el id de su sesión (`sid`). Cada petición revisa en la base que la sesión siga abierta.
- **Un refresh token en una cookie `HttpOnly`** renueva el JWT, hasta 8 h desde el inicio de sesión (la jornada).
- **Gana el último inicio de sesión.** Al entrar desde otro equipo, la sesión anterior se cierra.

**Lo que ya existe y se aprovecha:**

- `autenticar` es `[verificarToken, revisarCuenta, exigirContrasenaCambiada]` (`middlewares/autenticar.js`). `revisarCuenta` ya consulta la base en cada petición: revisar la sesión se suma a esa consulta con un `JOIN`, sin agregar otra.
- `revisarCuenta` ya corta las sesiones con 401 `CUENTA_DESACTIVADA` y `SESION_DESACTUALIZADA` cuando la cuenta cambia. Esas revisiones se mantienen como respaldo.
- El frontend ante cualquier 401 vuelve al login y muestra el `mensaje` del error. Por eso los mensajes nuevos sirven tal como llegan, sin cambiar el frontend.

**Diferencias con la historia y con la propuesta:**

- HU-02 aceptaba que el token no se revocara (SPEC 01 y SPEC 03). Este spec cambia eso: la sesión se cierra en el servidor.
- La propuesta ponía `express.json({ inflate: false })` en este spec. Va en el hotfix de Node, al final del sprint, junto con el resto de la CVE-2026-111497 (decidido en la fase de preguntas).
- La propuesta respondía 401 `SESION_CERRADA` al restablecer la contraseña. Aquí tiene su propio código, `CONTRASENA_RESTABLECIDA` (decidido en la fase de preguntas).

**Zona protegida:** el spec agrega una tabla a MySQL. El equipo la autorizó el 2026-10-28, pero el agente igual pide confirmación antes de editar `backend/db/` y antes de correr el 08 en Aiven.

## Alcance

**Entra:**

- La tabla `sesion`:
  - `backend/db/08_sesion_mysql.sql`, nuevo e idempotente;
  - la tabla en la v0.10 del `01_modelo_relacional_mysql.sql`;
  - la tabla y sus reglas en `docs/base-de-datos/CONTEXTO BD.md`.
- `modulos/auth/sesiones.service.js`: crear, buscar por refresh token (con el margen de 30 s), rotar, cerrar una sesión y cerrar la de un usuario.
- `POST /auth/login`: cierra la sesión abierta anterior, crea la nueva, pone el `sid` en el JWT y responde con la cookie. El cuerpo de la respuesta no cambia.
- `autenticar`: el `sid` en `verificarToken`, y en `revisarCuenta` el `JOIN sesion`, la jornada, la inactividad y `ultimo_uso`.
- `POST /auth/refrescar` (nuevo): renueva el JWT con la cookie y rota el refresh token.
- `POST /auth/logout`: cierra la sesión con el Bearer o solo con la cookie, y borra la cookie.
- Los cierres por el administrador en `usuarios.service.js`: restablecer la contraseña, desactivar la cuenta, cambiar el rol y cambiar el establecimiento o el municipio.
- `cors` con `credentials: true` en `app.js`.
- Las variables `SESION_DURACION_MAXIMA` y `SESION_INACTIVIDAD` en `.env.example` y `config/entorno.js`.
- `CLAVES_SENSIBLES`: `refreshToken`, `hashRefresh` y `hashRefreshAnterior`.
- El contrato en `openapi.yaml`, antes del código.
- El helper de pruebas `tokenDePrueba` y la adaptación de los archivos de prueba que firman tokens o inician sesión.
- Pruebas nuevas en `sesiones.test.js` y casos nuevos en `usuarios.test.js`.
- La documentación: el «Avance» de HU-02 y notas en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Todo el frontend: guardar el token en memoria, renovarlo con `POST /auth/refrescar`, mandar la cookie (`credentials: 'include'`), los avisos por código y quitar `sessionStorage`. Va en el spec de `PROPUESTA_SESIONES_FRONTEND.md`.
- `express.json({ inflate: false })` y la actualización de Node.js: van en el hotfix de Node.
- Una pantalla con las sesiones abiertas o un botón para cerrar todas.
- Purgar sesiones viejas.
- Detectar el reúso de un refresh token viejo (fuera del margen de 30 s) como robo.
- Cambios a `package.json`, a los permisos (`05`) o a `transicion_estado`.

## Modelo de datos

### Tabla `sesion` (08 y v0.10 del 01)

```sql
CREATE TABLE IF NOT EXISTS sesion (
  id                     BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario_id             INT UNSIGNED     NOT NULL,
  hash_refresh           CHAR(64)         NOT NULL COMMENT 'SHA-256 del refresh token; nunca el token en claro',
  hash_refresh_anterior  CHAR(64)         NULL     COMMENT 'El anterior, aceptado 30 s después de rotar (varias pestañas)',
  rotado_en              DATETIME         NULL,
  creada_en              DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso             DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Inactividad del lado del servidor',
  expira_en              DATETIME         NOT NULL COMMENT 'Fin de la jornada: creada_en + 8 h',
  cerrada_en             DATETIME         NULL,
  motivo_cierre          ENUM('MANUAL','INACTIVIDAD','REEMPLAZADA','CONTRASENA_RESTABLECIDA',
                              'CUENTA_DESACTIVADA','DATOS_CAMBIADOS') NULL,
  ip_origen              VARCHAR(45)      NULL,
  agente_usuario         VARCHAR(255)     NULL,
  usuario_abierta        INT UNSIGNED     AS (IF(cerrada_en IS NULL, usuario_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sesion_refresh (hash_refresh),
  UNIQUE KEY uq_sesion_una_abierta (usuario_abierta) COMMENT 'Una sesión abierta por usuario',
  KEY ix_sesion_usuario (usuario_id, creada_en),
  KEY ix_sesion_refresh_anterior (hash_refresh_anterior),
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
  CONSTRAINT ck_sesion_cierre CHECK ((cerrada_en IS NULL) = (motivo_cierre IS NULL))
) ENGINE=InnoDB COMMENT='Sesiones del personal; una abierta por usuario';
```

Reglas:

- **`id`** es el `sid` que va en el JWT.
- **`usuario_id`** tiene llave foránea a `usuario`, sin `ON DELETE CASCADE`: MySQL no acepta una acción en cascada sobre la base de una columna generada `STORED` (`usuario_abierta`). El sistema nunca borra cuentas; las pruebas que las borran quitan antes sus sesiones.
- **El refresh token** son 32 bytes aleatorios en base64url (`crypto.randomBytes`). En la base va su SHA-256 en hexadecimal, no bcrypt: el token es aleatorio (no hace falta protegerlo de un diccionario) y hay que buscarlo por su hash.
- **`usuario_abierta` con su `UNIQUE`** hace que la base impida dos sesiones abiertas del mismo usuario, incluso con dos inicios de sesión al mismo tiempo.
- **Las fechas se calculan en MySQL** (`NOW()`, `NOW() + INTERVAL ? SECOND`), nunca en Node: así la comparación no depende de la zona horaria (nota del 2026-10-21).
- **Estados que se calculan y no se escriben:**
  - **jornada terminada:** `expira_en <= NOW()`;
  - **inactiva:** `ultimo_uso <= NOW() - INTERVAL {SESION_INACTIVIDAD} SECOND`.

  `cerrada_en` solo se escribe cuando alguien cierra la sesión.
- **Datos:** solo del personal (regla 1). Las filas no se borran; hay una por inicio de sesión.

El 08 usa `CREATE TABLE IF NOT EXISTS` y no recrea la base, como el 05 y el 07. Una base nueva creada con el 01 v0.10 ya trae la tabla: el 08 solo sirve para las bases que ya existen.

### Variables de entorno

```
JWT_EXPIRACION=2h          # ya existe
SESION_DURACION_MAXIMA=8h  # la jornada
SESION_INACTIVIDAD=30m
```

- Las dos nuevas son obligatorias, como `JWT_EXPIRACION`, y se leen como un número seguido de `s`, `m` o `h`. Sin ellas, o con otro formato, la API no arranca.
- `config/entorno.js` las expone en segundos: `entorno.sesion.duracionMaxima` y `entorno.sesion.inactividad`.

### El JWT

Lleva lo mismo de hoy más `sid` (el `id` de la sesión, como número). `verificarToken` responde 401 `NO_AUTENTICADO` si falta `sid` o no es un entero positivo.

### La cookie

| Atributo | Valor | Por qué |
|---|---|---|
| Nombre | `sircova_refresh` | |
| `HttpOnly` | sí | El JavaScript de la página no la puede leer, así que un XSS no puede robarla |
| `Secure` | sí | Solo viaja por HTTPS; los navegadores tratan `http://localhost` como seguro (se confirma en la verificación manual) |
| `SameSite` | `Strict` | No se manda desde otros sitios (protege contra CSRF) |
| `Path` | `/api/v1/auth` | Solo viaja a `login`, `refrescar` y `logout` |
| `Max-Age` | los segundos que faltan para `expira_en`, más 1 h (`MARGEN_COOKIE_SEGUNDOS`, desde el SPEC 28) | Al terminar la jornada, `refrescar` todavía recibe la cookie y responde `JORNADA_TERMINADA` |

- Para borrarla se manda la misma cookie vacía con `Max-Age=0`.
- La cookie se lee con una función pequeña que interpreta el encabezado `Cookie`, sin `cookie-parser` (no está en la lista de dependencias permitidas). La lectura y la escritura van en `modulos/auth/cookieRefresh.js`.
- `app.js` pasa a `cors({ origin: entorno.corsOrigen, credentials: true })`. Vite (`localhost:5173`) y la API (`localhost:3000`) son el mismo sitio, porque el puerto no cuenta.
- El frontend actual no manda `credentials: 'include'`, así que el navegador no guarda la cookie todavía. Eso es del spec del frontend; aquí la cookie se comprueba con las pruebas y con `curl`.

### Ciclo de una sesión

```
POST /auth/login
  ├─ en la transacción del login (que ya bloquea la fila del usuario):
  │    cierra la sesión abierta del usuario con REEMPLAZADA,
  │    inserta la nueva con expira_en = NOW() + SESION_DURACION_MAXIMA
  ├─ responde { token, usuario }, igual que hoy; el JWT lleva sid
  └─ Set-Cookie: sircova_refresh=<token>

Cada petición con autenticar
  ├─ verificarToken: firma, exp y sid
  └─ revisarCuenta: la consulta de hoy + JOIN sesion ON s.id = sid AND s.usuario_id = sub
       ├─ sin sesión, cerrada, con la jornada terminada o inactiva → 401 (tabla de abajo)
       └─ si ultimo_uso tiene más de 1 min, lo actualiza (sin bitácora)

POST /auth/refrescar (sin Bearer, con la cookie)
  ├─ en una transacción, la primera consulta es un SELECT … FOR UPDATE de la sesión
  │    por hash_refresh, o por hash_refresh_anterior si rotado_en tiene menos de 30 s
  ├─ revisa que siga abierta, en su jornada y sin inactividad, y que la cuenta siga activa
  ├─ si llegó con hash_refresh: rota (anterior = actual, actual = nuevo, rotado_en = NOW())
  │    y manda la cookie nueva; si llegó con el anterior: no rota ni manda cookie
  ├─ ultimo_uso = NOW()
  └─ responde { token, usuario } con los permisos y datos actuales de la cuenta

POST /auth/logout (con Bearer o solo con la cookie)
  ├─ si la sesión está abierta: cerrada_en = NOW(), motivo MANUAL o INACTIVIDAD, y LOGOUT en la bitácora
  ├─ si ya estaba cerrada o no existe: no escribe nada
  └─ borra la cookie; 204
```

### Margen de 30 s (varias pestañas)

Dos pestañas usan la misma cookie `R1` y renuevan el JWT con milisegundos de diferencia. La primera cambia `R1` por `R2`. La segunda ya había mandado `R1`: el servidor lo encuentra como `hash_refresh_anterior` de una sesión rotada hace menos de 30 s y le da un JWT nuevo, sin rotar otra vez ni mandar cookie (el servidor no conoce `R2` en claro; el navegador ya lo recibió en la primera respuesta). Pasado ese margen, `R1` responde 401 `NO_AUTENTICADO`.

El margen es una constante (`MARGEN_ROTACION_SEGUNDOS = 30`) de `sesiones.service.js`, no una variable de entorno.

### Respuestas 401 de la sesión

| Situación | Motivo guardado | `codigo` | `mensaje` |
|---|---|---|---|
| Otro inicio de sesión de la misma cuenta | `REEMPLAZADA` | `SESION_REEMPLAZADA` | Se inició sesión con su cuenta en otro equipo. Inicie sesión de nuevo para continuar aquí. |
| Cerró sesión (botón o inactividad del frontend) | `MANUAL` / `INACTIVIDAD` | `SESION_CERRADA` | Su sesión se cerró; inicie sesión de nuevo. |
| El administrador restableció la contraseña | `CONTRASENA_RESTABLECIDA` | `CONTRASENA_RESTABLECIDA` | Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador. |
| El administrador desactivó la cuenta | `CUENTA_DESACTIVADA` | `CUENTA_DESACTIVADA` | (el de hoy) Su cuenta está desactivada; contacte al administrador. |
| El administrador cambió el rol, el establecimiento o el municipio | `DATOS_CAMBIADOS` | `SESION_DESACTUALIZADA` | (el de hoy) Sus datos de acceso cambiaron; inicie sesión de nuevo. |
| 30 min sin peticiones | — (se calcula) | `SESION_INACTIVA` | Su sesión se cerró por inactividad. Inicie sesión de nuevo. |
| Pasaron las 8 h de la jornada | — (se calcula) | `JORNADA_TERMINADA` | Su jornada de 8 horas terminó; inicie sesión de nuevo. |
| Venció el JWT (2 h) | — | `SESION_VENCIDA` | (el de hoy) |
| Sin token, token sin `sid`, o `sid` inexistente o de otra cuenta | — | `NO_AUTENTICADO` | (el de hoy) Debe iniciar sesión. |
| `refrescar` sin cookie, o con un refresh desconocido o fuera del margen | — | `NO_AUTENTICADO` | (el de hoy) |

- En `revisarCuenta` se revisa, en este orden: que exista la sesión, que esté abierta (el código sale de `motivo_cierre`), la jornada, la inactividad y después las revisiones de hoy (cuenta activa y datos del token).
- Un 401 de `refrescar` también borra la cookie.
- Ningún 401 de la sesión va a la bitácora, como los de hoy.
- El 403 `CAMBIO_CONTRASENA_REQUERIDO` sigue igual. Después de restablecer la contraseña ya no llega a la sesión abierta, porque `revisarCuenta` responde antes el 401 `CONTRASENA_RESTABLECIDA`.
- Cambiar la propia contraseña (`POST /auth/contrasena`) **no** cierra la sesión.

### Cierres por el administrador (`usuarios.service.js`)

| Función | Cuándo cierra | Motivo |
|---|---|---|
| `restablecerContrasena` | siempre | `CONTRASENA_RESTABLECIDA` |
| `cambiarEstadoCuenta` | al desactivar (no al restaurar) | `CUENTA_DESACTIVADA` |
| `cambiarRol` | si el rol cambia | `DATOS_CAMBIADOS` |
| `editarEmpleado` | si cambia `establecimientoId` o `municipioId` | `DATOS_CAMBIADOS` |

- El cierre va en la misma transacción (`enTransaccion`) que la acción. Si la acción falla, la sesión sigue abierta.
- `cerrarSesionDeUsuario(conexion, usuarioId, motivo)` devuelve si cerró una sesión.

### Bitácora

- `LOGIN_OK`: `valoresNuevos: { sesionReemplazada: true }` solo si la sesión que cerró seguía vigente (abierta, en su jornada y sin inactividad). Si estaba vencida o inactiva, se cierra igual con `REEMPLAZADA`, pero la fila no lo indica.
- `LOGOUT`: igual que hoy, `valoresNuevos: { motivo }`, con el `usuario_id` de la sesión (también cuando llega solo con la cookie). No se escribe si la sesión ya estaba cerrada.
- Restablecer, desactivar, cambiar el rol y editar al empleado: si cerraron una sesión, su fila lleva `sesionCerrada: true` en `valoresNuevos`. No se agrega otra fila.
- **Sin bitácora:** la renovación del token (`refrescar`) y la actualización de `ultimo_uso`. Es una excepción a la regla 7, como `ultimo_acceso`: no son acciones de la persona sobre los datos, y escribirlas llenaría la bitácora con una fila por petición.
- `CLAVES_SENSIBLES` agrega `refreshToken`, `hashRefresh` y `hashRefreshAnterior`.

### Contrato (`openapi.yaml`)

- Un esquema de seguridad nuevo, `cookieRefresh` (`type: apiKey`, `in: cookie`, `name: sircova_refresh`).
- `POST /auth/login`: el encabezado `Set-Cookie` en la respuesta 200. El cuerpo no cambia.
- `POST /auth/refrescar` (nuevo): `security: [{ cookieRefresh: [] }]`, sin cuerpo. Responde 200 `RespuestaLogin` con `Set-Cookie` (solo cuando rota), o 401 con `NO_AUTENTICADO`, `SESION_CERRADA`, `SESION_REEMPLAZADA`, `CONTRASENA_RESTABLECIDA`, `SESION_INACTIVA`, `JORNADA_TERMINADA`, `CUENTA_DESACTIVADA` o `SESION_DESACTUALIZADA`.
- `POST /auth/logout`: `security: [{ bearerAuth: [] }, { cookieRefresh: [] }]`; 204 con el `Set-Cookie` que la borra, también si la sesión ya estaba cerrada.
- La respuesta común `NoAutenticado` lista los códigos nuevos en su descripción.
- La descripción de la seguridad explica el `sid`, la jornada, la inactividad y que solo hay una sesión abierta por usuario.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                    ← cookieRefresh, /auth/refrescar, login y logout
├── .env.example                                    ← SESION_DURACION_MAXIMA y SESION_INACTIVIDAD
├── db/
│   ├── 01_modelo_relacional_mysql.sql              ← v0.10: tabla sesion
│   └── 08_sesion_mysql.sql                         ← nuevo, idempotente
├── src/
│   ├── app.js                                      ← cors con credentials: true
│   ├── config/entorno.js                           ← las dos variables, en segundos
│   ├── middlewares/autenticar.js                   ← sid, JOIN sesion, jornada, inactividad, ultimo_uso
│   └── modulos/
│       ├── auditoria/auditoria.service.js          ← CLAVES_SENSIBLES
│       ├── auth/
│       │   ├── sesiones.service.js                 ← nuevo
│       │   ├── cookieRefresh.js                    ← nuevo: leer, poner y borrar la cookie
│       │   ├── auth.service.js                     ← login, refrescar y logout
│       │   ├── auth.controller.js                  ← cookie en las respuestas; refrescar
│       │   └── auth.routes.js                      ← POST /refrescar; logout con su propio middleware
│       └── usuarios/usuarios.service.js            ← los cuatro cierres
└── tests/
    ├── sesionDePrueba.js                           ← nuevo: tokenDePrueba
    ├── sesiones.test.js                            ← nuevo
    ├── usuarios.test.js                            ← casos de los cierres
    └── (los archivos que firman tokens o inician sesión) ← usan tokenDePrueba
docs/base-de-datos/CONTEXTO BD.md                   ← tabla sesion y sus reglas
docs/base-de-datos/Diagrama Relacional.dbml         ← v0.10: tabla sesion, su enum, su llave y su grupo
docs/SPECS/HISTORIAS_DE_USUARIO.md                  ← avance de HU-02
README.md                                           ← 33 tablas
CLAUDE.md                                           ← notas de contexto
```

No cambian el frontend, ningún `package.json`, `05_permisos_mysql.sql` ni `transicion_estado`.

## Plan de implementación

Durante el trabajo se corre solo el archivo de prueba de cada paso. La suite completa del backend se corre una vez, en el paso 9.

1. **Contrato.** Los cambios de la sección «Contrato» en `openapi.yaml`.

   Comprobación: el YAML se lee sin errores y `/api/docs` muestra `/auth/refrescar` y el esquema `cookieRefresh`.

2. **Modelo de datos.** Pedir confirmación antes de editar `backend/db/`. Crear el 08, agregar la tabla al 01 (v0.10, con su nota de cambios) y documentarla en `CONTEXTO BD.md`. Pedir autorización y correr el 08 en Aiven con `mysql2` y `multipleStatements` (nota del 2026-10-20).

   Comprobación: el 08 corre dos veces seguidas sin error y `SHOW CREATE TABLE sesion` coincide con el script.

3. **Servicio de sesiones y configuración.** `config/entorno.js` y `.env.example` con las dos variables. `sesiones.service.js` con `crearSesion`, `buscarPorRefresh` (con el margen), `rotarRefresh`, `cerrarSesion` y `cerrarSesionDeUsuario`; todas reciben la `conexion` para ir en la transacción de quien llama. `cookieRefresh.js`. Nadie las usa todavía.

   Comprobación: la API arranca; sin `SESION_INACTIVIDAD`, o con `SESION_INACTIVIDAD=30x`, no arranca y lo dice.

4. **Login y logout.** `iniciarSesion` cierra la sesión anterior y crea la nueva en su transacción, con el `sid` en el JWT; el controlador pone la cookie. `logout` deja `autenticarSinExigirCambio` y usa su propio middleware: toma la sesión del Bearer (si es válido y no venció) o de la cookie, y responde 401 como hoy si no hay ninguno de los dos. `cors` con `credentials: true`. `CLAVES_SENSIBLES`.

   En este paso `autenticar` todavía no revisa la sesión, así que las suites existentes siguen pasando.

   Comprobación: `auth.login.test.js` y `auth.logout.test.js` pasan, más los primeros casos de `sesiones.test.js` (cookie del login, `LOGIN_OK` con `sesionReemplazada`, logout solo con la cookie, logout de una sesión ya cerrada).

5. **Helper de pruebas.** `tests/sesionDePrueba.js` exporta `tokenDePrueba(usuarioId, carga, opciones)`:
   - reutiliza la sesión abierta y vigente del usuario; si no hay, cierra la que esté vencida o inactiva y crea una por SQL, sin bitácora;
   - firma el JWT con `carga` + `sid`, con las mismas opciones que hoy usan las pruebas (`expiresIn`, `subject`).

   Los archivos que firman tokens con `jwt.sign` pasan a `tokenDePrueba`. Los que inician sesión con `POST /auth/login` se revisan: si una misma cuenta inicia sesión dos veces en un archivo, se pide el token una sola vez o se usa `tokenDePrueba`. **Lo que comprueba cada caso no cambia.** Las pruebas que firman a propósito un token inválido (vencido, otra firma, otro algoritmo) siguen usando `jwt.sign`.

   Comprobación: cada archivo modificado pasa solo.

6. **`autenticar` con la sesión.** El `sid` en `verificarToken`; en `revisarCuenta`, el `JOIN sesion`, los 401 de la tabla, la jornada, la inactividad y la actualización de `ultimo_uso` (si tiene más de 1 min). Casos en `autenticar.test.js` (token sin `sid`, con el `sid` de otra cuenta) y en `sesiones.test.js`:
   - un segundo login deja al primer token con 401 `SESION_REEMPLAZADA`;
   - dos logins en paralelo dejan una sola sesión abierta;
   - después del logout, el token responde 401 `SESION_CERRADA`;
   - con `ultimo_uso` movido 31 min atrás por SQL: 401 `SESION_INACTIVA`;
   - con `expira_en` en el pasado: 401 `JORNADA_TERMINADA`;
   - `ultimo_uso` se actualiza si tenía más de 1 min y no se toca si tenía menos.

   Comprobación: `autenticar.test.js`, `sesiones.test.js` y tres archivos de módulos distintos (`usuarios.test.js`, `reportes.test.js`, `esquemas.test.js`) pasan solos.

7. **`POST /auth/refrescar`.** La ruta, el servicio y el controlador. Casos en `sesiones.test.js`:
   - refrescar devuelve un token nuevo con los permisos actuales y una cookie distinta, y el token nuevo sirve;
   - el refresh anterior se acepta dentro de los 30 s (sin cookie nueva) y responde 401 `NO_AUTENTICADO` con `rotado_en` movido 31 s atrás por SQL;
   - sin cookie o con una cookie inventada: 401 `NO_AUTENTICADO`, con la cookie borrada;
   - con la sesión cerrada, inactiva o con la jornada terminada: el 401 de la tabla;
   - funciona con `debe_cambiar_contrasena = TRUE` y devuelve `debeCambiarContrasena: true`;
   - la bitácora no tiene filas del refresco, y ninguna fila de la cuenta contiene el refresh token ni su hash.

   Comprobación: `sesiones.test.js` pasa.

8. **Cierres por el administrador.** Los cuatro cierres en `usuarios.service.js`, dentro de cada transacción, con `sesionCerrada: true` en la fila de bitácora de la acción. Casos en `usuarios.test.js`, con cuentas creadas por la prueba y su sesión de `tokenDePrueba` (sin iniciar sesión con ellas):
   - restablecer la contraseña: 401 `CONTRASENA_RESTABLECIDA`;
   - desactivar: 401 `CUENTA_DESACTIVADA`; restaurar no crea ni abre sesiones;
   - cambiar el rol, y cambiar el establecimiento o el municipio: 401 `SESION_DESACTUALIZADA`;
   - editar otro dato del empleado (por ejemplo, el teléfono) no cierra la sesión;
   - si la acción falla (por ejemplo, un 409), la sesión sigue abierta.

   En `sesiones.test.js`: cambiar la propia contraseña no cierra la sesión.

   Comprobación: `usuarios.test.js` y `sesiones.test.js` pasan.

9. **Verificación final y documentación.**
   - `npm test` del backend, completo, una vez. Si un archivo falla por un timeout de Aiven, se repite solo ese archivo, no la suite.
   - Verificación manual con `curl` contra Aiven (sección «Criterios de aceptación»).
   - El frontend actual (`npm run dev`): inicia sesión, navega y cierra sesión; con dos navegadores, el primero vuelve al login con el mensaje de sesión reemplazada.
   - `README.md`: el conteo de tablas de MySQL pasa a 33.
   - HU-02: actualizar su «Avance» (SPEC 27; el token ya se revoca) y quitar la frase del riesgo aceptado. Sus criterios no cambian.
   - «Notas de contexto» de `CLAUDE.md`: la tabla `sesion` y la regla de una sesión abierta; `tokenDePrueba` y cuándo seguir usando `jwt.sign`; que el 08 solo migra bases creadas con un 01 anterior a la v0.10; que correr las pruebas cierra la sesión del navegador de quien use el usuario de prueba de `.env`; la cuenta permanente de `sesiones.test.js`.

## Pruebas

**`sesiones.test.js`** usa una cuenta propia, `vitest-hu02-sesiones`, que no se borra (sus filas `LOGIN_OK` en la bitácora lo impiden), como `vitest-hu03-permanente`. El archivo la crea si no existe y en cada corrida la reinicia por SQL: contraseña conocida, `activo = TRUE`, `debe_cambiar_contrasena = FALSE` y sin sesiones (sus filas de `sesion` sí se borran: la tabla no es inmutable).

**Cuidados por la regla de una sola sesión:**

- Un `POST /auth/login` cierra la sesión anterior de la misma cuenta. En un archivo que obtiene un token y después inicia sesión con la misma cuenta, el primer token deja de servir.
- Correr las pruebas cierra la sesión del navegador de quien esté conectado con el usuario de prueba de `.env`.
- Los archivos corren en serie (`fileParallelism: false`), así que dos archivos no se pisan.
- Las pruebas que crean y borran cuentas (`autenticar`, `auth.contrasena`, `catalogos`, `establecimientos` y `usuarios`) borran primero sus filas de `sesion` con una función de `sesionDePrueba.js`.

## Criterios de aceptación

- [ ] `openapi.yaml` describe `cookieRefresh`, `POST /auth/refrescar`, la cookie del login y el logout con cookie, y `/api/docs` los muestra.
- [ ] El 08 corre dos veces sin error en Aiven, y el 01 v0.10 y `CONTEXTO BD.md` tienen la tabla `sesion`.
- [ ] `POST /auth/login` responde el mismo cuerpo de hoy y la cookie `sircova_refresh` con `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth` y `Max-Age` igual a la jornada (desde el SPEC 28, la jornada más 1 h).
- [ ] Un segundo login de la misma cuenta deja al token anterior con 401 `SESION_REEMPLAZADA`, y la base tiene una sola sesión abierta de esa cuenta.
- [ ] Dos logins en paralelo de la misma cuenta dejan una sola sesión abierta.
- [ ] Un token sin `sid`, o con el `sid` de otra cuenta, responde 401 `NO_AUTENTICADO`.
- [ ] Después del logout, el token responde 401 `SESION_CERRADA` y la cookie ya no refresca.
- [ ] El logout funciona solo con la cookie (con el JWT vencido), y con una sesión ya cerrada responde 204 sin escribir en la bitácora.
- [ ] `POST /auth/refrescar` devuelve un token nuevo y otra cookie; el refresh anterior sirve dentro de los 30 s y no después.
- [ ] Con 30 min sin peticiones la sesión responde 401 `SESION_INACTIVA`, y pasadas las 8 h responde 401 `JORNADA_TERMINADA`, también en `refrescar`.
- [ ] Restablecer la contraseña, desactivar la cuenta y cambiar el rol, el establecimiento o el municipio cierran la sesión abierta con el código de la tabla, en la misma transacción que la acción.
- [ ] Cambiar la propia contraseña no cierra la sesión.
- [ ] La bitácora no tiene filas de `refrescar` ni de `ultimo_uso`, y ninguna fila contiene el refresh token ni su hash.
- [ ] El frontend actual, sin cambios, inicia sesión, navega y cierra sesión; con dos navegadores, el primero vuelve al login con «Se inició sesión con su cuenta en otro equipo…».
- [ ] Manual con `curl`: login, `refrescar` con la cookie y logout; después, el token y la cookie ya no sirven.
- [ ] `npm test` del backend pasa completo, sin desactivar ni quitar pruebas, y lo que comprueba cada caso existente no cambió.
- [ ] El frontend, ningún `package.json`, `05_permisos_mysql.sql` y `transicion_estado` no cambian.
- [ ] HU-02 tiene su avance actualizado y `CLAUDE.md` tiene las notas.

## Decisiones

- **Sí:** el servidor guarda las sesiones en la tabla `sesion`, con un JWT de 2 h que lleva el `sid` (decisión del equipo, 2026-10-28). **No:** una lista de tokens revocados, que no resuelve las sesiones simultáneas ni la jornada. **No:** un JWT de 8 h, que no se puede revocar.
- **Sí:** una sola sesión abierta por usuario; gana el último inicio de sesión (decisión del equipo). La base lo garantiza con `usuario_abierta` y su `UNIQUE`. **No:** rechazar el segundo login, que deja a la persona sin entrar si olvidó cerrar en otro equipo.
- **Sí:** refresh token en una cookie `HttpOnly`, `Secure`, `SameSite=Strict` y con `Path=/api/v1/auth` (decisión del equipo). **No:** guardarlo en `sessionStorage`, donde un XSS lo lee.
- **Sí:** el refresh token se guarda como SHA-256 (decidido en la propuesta). **No:** bcrypt: el token es aleatorio y hay que buscarlo por su hash.
- **Sí:** margen de 30 s para el refresh anterior, sin volver a rotar (decisión del equipo). **No:** rechazarlo de inmediato, que cierra la sesión de una de dos pestañas.
- **Sí:** la renovación y `ultimo_uso` no van a la bitácora (decisión del equipo; excepción a la regla 7). **No:** una fila por petición.
- **Sí:** `ultimo_uso` se actualiza solo si tiene más de 1 min (decidido en la propuesta). **No:** una escritura en Aiven por cada petición.
- **Sí:** `express.json({ inflate: false })` va en el hotfix de Node (decidido en la fase de preguntas). **No:** meterlo aquí, mezclado con las sesiones.
- **Sí:** restablecer la contraseña responde 401 `CONTRASENA_RESTABLECIDA`, con el mismo texto que hoy muestra el frontend (decidido en la fase de preguntas). **No:** `SESION_CERRADA` con un mensaje distinto según el motivo, que el frontend no puede distinguir por código.
- **Sí:** al iniciar sesión, la sesión anterior se cierra siempre con `REEMPLAZADA`, pero `LOGIN_OK` lleva `sesionReemplazada: true` solo si seguía vigente (decidido en la fase de preguntas). **No:** un motivo `VENCIDA` en el `ENUM`. **No:** marcar siempre `sesionReemplazada`.
- **Sí:** el logout es idempotente: con una sesión ya cerrada o una cookie desconocida, borra la cookie y responde 204 sin bitácora (decidido en la fase de preguntas). **No:** un 401, que haría fallar el botón «Cerrar sesión» de una sesión reemplazada.
- **Sí:** `refrescar` funciona con `debe_cambiar_contrasena = TRUE`, como el login (decidido en la fase de preguntas). El resto de la API sigue con el 403 `CAMBIO_CONTRASENA_REQUERIDO`.
- **Sí:** `Secure` siempre; una variable para quitarlo en desarrollo solo si la verificación en `localhost` falla (decidido en la fase de preguntas). **No:** la variable desde ahora, que puede quedar mal puesta en producción. En la verificación del SPEC 28 (Opera GX, `http://localhost:5173`, 2026-10-29) el navegador aceptó la cookie con `Secure`: la variable no hizo falta.
- **Sí (SPEC 28, 2026-10-29):** la cookie dura la jornada más 1 h (`MARGEN_COOKIE_SEGUNDOS` en `cookieRefresh.js`). Con `Max-Age` igual a la jornada, el navegador la borraba justo al terminar, `refrescar` llegaba sin cookie y la persona veía «Debe iniciar sesión.» en vez de `JORNADA_TERMINADA`. La sesión no se alarga: la jornada la revisa el servidor y el 401 borra la cookie. **No:** un texto propio del frontend para ese caso, que no sabe si fue la jornada.
- **Sí:** las pruebas nuevas van en `sesiones.test.js`, con una cuenta propia y permanente; los cierres por el administrador, en `usuarios.test.js` (decidido en la fase de preguntas). **No:** repartirlas en los archivos de `auth`.
- **Sí:** cambiar la propia contraseña mantiene la sesión (decisión del equipo). El frontend actual igual vuelve al login después del cambio; el spec del frontend decide si lo mantiene.
- **Sí:** `SESION_DURACION_MAXIMA` y `SESION_INACTIVIDAD` son obligatorias, como `JWT_EXPIRACION` (decidido al escribir el spec). **No:** valores por defecto en el código, que esconden una configuración olvidada.
- **Sí:** el logout tiene su propio middleware, que acepta el Bearer o la cookie y no exige la sesión abierta (decidido al escribir el spec). **No:** `autenticarSinExigirCambio`, que respondería 401 a una sesión ya cerrada.
- **Sí:** un refresh fuera del margen responde `NO_AUTENTICADO`, sin cerrar la sesión (decidido al escribir el spec). Detectar el reúso como robo queda fuera.
- **Sí:** el margen de 30 s es una constante del servicio, no una variable de entorno (decidido al escribir el spec).
- **Sí:** `refrescar` aplica la regla 10 como el login: una cuenta sin DDRISS (salvo `AUTORIDAD`) o de establecimiento sin establecimiento responde 401 `SESION_DESACTUALIZADA` en vez de recibir un token (decidido en el paso 7). Hoy ningún endpoint deja una cuenta así; es una defensa.
- **Sí:** `fk_sesion_usuario` sin `ON DELETE CASCADE`; las pruebas borran las sesiones antes que la cuenta (decidido en el paso 2, cuando MySQL 8.4 rechazó la llave con `ER_CANNOT_ADD_FOREIGN`). **No:** convertir `usuario_abierta` en una columna normal para conservar la cascada, porque la base dejaría de garantizar que coincide con `usuario_id`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Choques con la rama del compañero, porque el spec toca `autenticar.js` y casi todas las pruebas | Empezar desde un `main` actualizado; si él integra antes, actualizar la rama y volver a correr la suite. |
| Una prueba pierde su token porque otro login de la misma cuenta lo cerró | `tokenDePrueba` reutiliza la sesión abierta; las pruebas de sesiones usan su propia cuenta. |
| Las fechas de la sesión salen corridas 6 h y la jornada o la inactividad fallan | Todas las fechas se escriben y comparan con `NOW()` de MySQL, nunca con la hora de Node. |
| Dos refrescos simultáneos con el mismo refresh rotan dos veces | El `SELECT … FOR UPDATE` es la primera consulta de la transacción (nota del 2026-10-23): el segundo espera y entra por el margen. |
| El `Secure` de la cookie no funciona en `http://localhost` en algún navegador o en `curl` | Se comprueba en el paso 9; si falla, una variable de entorno lo desactiva solo en desarrollo y se anota en este spec. Comprobado en el SPEC 28: el navegador la acepta en `localhost`. |
| Los compañeros arrancan la API sin las variables nuevas | La API no arranca y dice cuáles faltan; `.env.example` y la nota de `CLAUDE.md` las nombran. |
| El frontend actual no conoce los códigos nuevos | Muestra el `mensaje` de cualquier 401; los mensajes nuevos sirven tal como llegan. |
| La sesión del navegador de quien prueba a mano se cierra al correr las pruebas | Nota en `CLAUDE.md`; para probar a mano mientras corren las pruebas, usar otra cuenta. |
| Recrear la base con un 01 anterior a la v0.10 deja la API sin la tabla | El 01 v0.10 ya la trae; el 08 sirve para las bases que ya existen. |

## Lo que **no** entra en este spec

- El frontend de las sesiones (token en memoria, renovación, cookie con `credentials: 'include'`, avisos por código).
- `express.json({ inflate: false })` y la actualización de Node.js.
- Una pantalla de sesiones abiertas, cerrar todas, o purgar sesiones viejas.
- Detectar el reúso de un refresh token como robo.
- Cambios a `package.json`, a los permisos o a `transicion_estado`.

Cada uno, si se hace, va en su propio spec.
