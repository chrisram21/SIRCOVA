# Propuesta para el spec de sesiones · Backend

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo después de la asesoría de fin del sprint 2 (2026-10-28). No es el spec: el spec se escribe en `specs/NN-slug.md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** ajuste a HU-02 (cerrar sesión y expiración de la sesión). No hay historia nueva: HU-02 deja de aceptar el riesgo del token no revocable.
> **Depende de:** los SPEC 01, 03, 08, 09 y 10, que ya están en `main`.
> **Lo sigue:** la propuesta del frontend (`PROPUESTA_SESIONES_FRONTEND.md`). Se hace después de este spec, cuando el compañero que ajusta el frontend termine.
> **Rama sugerida:** `spec-27-hu-02-sesiones-backend`, desde `main`.
> **Toca una zona protegida:** agrega una tabla a MySQL. El equipo la autorizó el 2026-10-28, pero el spec igual pide confirmación antes de editar `backend/db/` y antes de correr cualquier script.

## 1. Por qué existe

Las pruebas del sprint 2 mostraron tres problemas de la sesión:

1. **Un usuario puede tener la sesión abierta en varios equipos a la vez.**
2. **La sesión dura como mucho 2 h** (el vencimiento del JWT). Se quería una jornada de 8 h, pero un JWT de 8 h que no se puede revocar es un riesgo considerable.
3. **El token sigue sirviendo después de cerrar la sesión.** Pasa al cerrar sesión, por inactividad o porque el administrador restablece la contraseña. El token vale hasta su `exp`, porque el servidor no guarda las sesiones.

El equipo decidió:

- **El servidor guarda las sesiones** en una tabla `sesion`. Con ella cada sesión se puede cerrar, y un usuario solo tiene una abierta.
- **El JWT sigue durando 2 h** y lleva el id de su sesión (`sid`). Cada petición revisa en la base que la sesión siga abierta.
- **Un refresh token en una cookie `HttpOnly`** renueva el JWT. La renovación funciona hasta un máximo de 8 h desde el inicio de sesión (la jornada).
- **Gana el último inicio de sesión.** Al entrar desde otro equipo, la sesión anterior se cierra.

## 2. Decisiones del equipo (2026-10-28)

| Tema | Decisión |
|---|---|
| Sesiones simultáneas | Una abierta por usuario. **Gana el último inicio de sesión**; la anterior se cierra con el motivo `REEMPLAZADA` |
| Duración del JWT | **2 h**, como hoy (`JWT_EXPIRACION=2h`) |
| Jornada | **8 h** desde el inicio de sesión, aunque se renueve el JWT |
| Inactividad | **30 min**, controlada también por el servidor (`ultimo_uso`) |
| Tabla y cookie | Autorizadas: tabla `sesion` (script 08 y v0.10 del 01) y refresh token en cookie `HttpOnly` |
| Varias pestañas | **Margen de 30 s** para el refresh token anterior (columna `hash_refresh_anterior`) |
| Bitácora | La renovación del token y `ultimo_uso` **no** van a la bitácora (excepción a la regla 7, escrita en el spec) |
| Cambio de la propia contraseña | **Se mantiene la sesión actual** |
| Pruebas | Durante el trabajo se corre solo el archivo de cada paso; la suite completa se corre **una vez al final** (sección 8) |

## 3. Lo que ya existe y hay que tener en cuenta

- `autenticar` es `[verificarToken, revisarCuenta, exigirContrasenaCambiada]` (`middlewares/autenticar.js`). **`revisarCuenta` ya consulta la base en cada petición**, así que revisar la sesión se suma a esa misma consulta y no agrega otra.
- `revisarCuenta` ya corta sesiones con 401 `CUENTA_DESACTIVADA` y `SESION_DESACTUALIZADA` cuando la cuenta cambia. **Esas revisiones se mantienen** como respaldo.
- `POST /auth/logout` hoy solo escribe `LOGOUT` en la bitácora. El comentario de `cerrarSesion` dice que el token no se revoca.
- `POST /auth/login` responde `{ token, usuario }`. **Esa respuesta no cambia**, para que el frontend actual siga funcionando hasta su spec.
- El frontend guarda la sesión en `sessionStorage`, cierra por inactividad de 30 min y ante cualquier 401 vuelve al login mostrando el `mensaje` del error. Por eso **los mensajes de los 401 nuevos deben servir tal como llegan**, sin cambios en el frontend.
- **Hoy, restablecer la contraseña de una sesión abierta** lleva al login con el 403 `CAMBIO_CONTRASENA_REQUERIDO` (SPEC 10). Con este spec, la sesión se cierra antes y responde 401. El mensaje debe decir lo mismo.
- Pruebas: `vitest.config.js` corre los archivos **en serie** (`fileParallelism: false`). **18 archivos firman tokens a mano** con `jwt.sign` y **15 inician sesión** con `POST /auth/login` (varios, con el usuario de prueba de `.env`).
- Funciones que deben cerrar sesiones (`modulos/usuarios/usuarios.service.js`): `restablecerContrasena`, `cambiarEstadoCuenta` (al desactivar), `cambiarRol` y `editarEmpleado` (si cambia `establecimientoId` o `municipioId`).

## 4. Diseño

### 4.1 Tabla `sesion`

```sql
CREATE TABLE sesion (
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
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
  CONSTRAINT ck_sesion_cierre CHECK ((cerrada_en IS NULL) = (motivo_cierre IS NULL))
) ENGINE=InnoDB COMMENT='Sesiones del personal; una abierta por usuario';
```

- **`id`** es el `sid` que va en el JWT.
- **`usuario_id`** tiene una llave foránea a `usuario`, porque cada sesión pertenece a una cuenta. `ON DELETE CASCADE` solo tiene efecto en las pruebas: el sistema nunca borra cuentas.
- **El refresh token** son 32 bytes aleatorios en base64url. En la base va su SHA-256, no bcrypt: el token es aleatorio (no hay que protegerlo de un ataque por diccionario) y hay que buscarlo por su hash.
- **`usuario_abierta` con su `UNIQUE`** hace que la propia base impida dos sesiones abiertas del mismo usuario, incluso con dos inicios de sesión al mismo tiempo.
- **Estados que se calculan y no se escriben:**
  - **vencida:** `expira_en <= NOW()`;
  - **inactiva:** `ultimo_uso` tiene más de 30 min.

  El middleware las rechaza al compararlas. `cerrada_en` solo se escribe cuando alguien cierra la sesión.
- **Datos:** solo del personal (regla 1). Las filas no se borran; son pocas (una por inicio de sesión).

### 4.2 Ciclo de una sesión

```
POST /auth/login
  ├─ dentro de la transacción del login: cierra la sesión abierta del usuario (REEMPLAZADA),
  │  inserta la nueva con expira_en = NOW() + 8 h
  ├─ responde { token, usuario }, igual que hoy; el JWT lleva sid
  └─ Set-Cookie: sircova_refresh=<token>

Cada petición con autenticar
  ├─ verificarToken: firma, exp y sid
  └─ revisarCuenta: la misma consulta de hoy + JOIN sesion
       ├─ cerrada, vencida o inactiva → 401 con el código de la sección 4.5
       └─ si ultimo_uso tiene más de 1 min, lo actualiza (sin bitácora)

POST /auth/refrescar (sin Bearer, con la cookie)
  ├─ busca la sesión por hash_refresh (o por hash_refresh_anterior si rotó hace menos de 30 s)
  ├─ revisa que siga abierta, en su jornada y sin inactividad, y que la cuenta siga activa
  ├─ rota: hash_refresh_anterior = hash_refresh, hash_refresh = nuevo, rotado_en = NOW()
  └─ responde { token, usuario } con los permisos actuales + Set-Cookie con el refresh nuevo

POST /auth/logout (con Bearer o solo con la cookie)
  ├─ cerrada_en = NOW(), motivo MANUAL o INACTIVIDAD; LOGOUT en la bitácora, como hoy
  └─ borra la cookie; 204
```

### 4.3 El margen de 30 s (varias pestañas)

**Ejemplo:** Ana tiene abiertas dos pestañas del sistema, A y B. Las dos usan la misma cookie con el refresh token `R1`. Su JWT vence a las 10:00 y las dos pestañas lo renuevan a las 9:55, con milisegundos de diferencia.

- A manda `R1`. El servidor lo cambia por `R2` y responde con la cookie nueva.
- B ya había mandado `R1`, antes de que llegara la cookie `R2`.
  - **Sin margen,** el servidor ya no reconoce `R1` y responde 401: la pestaña B cierra la sesión sin motivo aparente.
  - **Con margen,** el servidor ve que `R1` es el `hash_refresh_anterior` de una sesión rotada hace menos de 30 s y le da a B un JWT nuevo.

Pasa lo mismo si Ana recarga las dos pestañas a la vez, porque cada recarga renueva el JWT.

**Cuando se acepta el anterior, no se vuelve a rotar ni se manda cookie.** El servidor no conoce `R2` en claro (solo guarda su hash), así que no puede reenviarlo. El navegador ya lo tiene, porque se lo dio la respuesta a la pestaña A.

### 4.4 La cookie

| Atributo | Valor | Por qué |
|---|---|---|
| Nombre | `sircova_refresh` | |
| `HttpOnly` | sí | El JavaScript de la página no la puede leer, así que un XSS no puede robarla |
| `Secure` | sí | Solo viaja por HTTPS. Chrome, Edge y Firefox tratan `http://localhost` como seguro; se confirma en la verificación manual |
| `SameSite` | `Strict` | No se manda desde otros sitios (protege contra CSRF) |
| `Path` | `/api/v1/auth` | Solo viaja a `login`, `refrescar` y `logout`, no en cada petición |
| `Max-Age` | los segundos que faltan para `expira_en` | La cookie muere con la jornada |

- La cookie se lee con una función pequeña que interpreta el encabezado `Cookie`, sin `cookie-parser` (no está en la lista de dependencias permitidas).
- `app.js`: `cors({ origin: entorno.corsOrigen, credentials: true })`. Vite (`localhost:5173`) y la API (`localhost:3000`) son el mismo sitio, porque el puerto no cuenta.
- `app.js`: `express.json({ inflate: false })`. El frontend nunca manda cuerpos comprimidos, y así se cierra el camino de la CVE-2026-111497 (Brotli) y de fallas parecidas.

### 4.5 Cierres y códigos de error

| Evento | Dónde | Motivo guardado | Lo que recibe la sesión cerrada |
|---|---|---|---|
| Nuevo inicio de sesión | `iniciarSesion` | `REEMPLAZADA` | 401 `SESION_REEMPLAZADA`: «Se inició sesión con su cuenta en otro equipo.» |
| Cerrar sesión | `cerrarSesion` | `MANUAL` / `INACTIVIDAD` | 401 `SESION_CERRADA` |
| Restablecer contraseña (administrador) | `restablecerContrasena` | `CONTRASENA_RESTABLECIDA` | 401 `SESION_CERRADA`, con el mismo aviso de hoy (SPEC 10) |
| Desactivar la cuenta | `cambiarEstadoCuenta` | `CUENTA_DESACTIVADA` | 401 `CUENTA_DESACTIVADA` (el código de hoy) |
| Cambiar rol, establecimiento o municipio | `cambiarRol`, `editarEmpleado` | `DATOS_CAMBIADOS` | 401 `SESION_DESACTUALIZADA` (el código de hoy) |
| Sin peticiones por 30 min | se calcula | — | 401 `SESION_INACTIVA` |
| Pasaron las 8 h | se calcula | — | 401 `JORNADA_TERMINADA` |
| Venció el JWT (2 h) | `verificarToken` | — | 401 `SESION_VENCIDA` (el código de hoy; el frontend lo renovará en su spec) |
| Cambiar la propia contraseña | `cambiarContrasena` | — | **No se cierra** |

- **Los cierres por el administrador van en la misma transacción que su acción** (`enTransaccion`). Si la acción falla, la sesión sigue abierta.
- **Los nombres de los códigos los confirma el spec.** Lo que importa es que cada `mensaje` sirva por sí solo, porque el frontend actual lo muestra tal cual.

### 4.6 Bitácora

- `LOGIN_OK`: en `valoresNuevos` indica si cerró una sesión anterior, por ejemplo `{ sesionReemplazada: true }`.
- `LOGOUT`: igual que hoy, con su `motivo`.
- Restablecer, desactivar, cambiar el rol y editar al empleado: si cerraron una sesión, su fila lo indica. No se agrega otra fila.
- **Sin bitácora:** la renovación del token y la actualización de `ultimo_uso`. Es la excepción a la regla 7, igual que `ultimo_acceso`, y queda escrita en el spec.
- `CLAVES_SENSIBLES`: agregar `refreshToken`, `hashRefresh` y `hashRefreshAnterior`.

### 4.7 Configuración

`backend/.env.example` y `config/entorno.js`:

```
JWT_EXPIRACION=2h          # ya existe
SESION_DURACION_MAXIMA=8h  # la jornada
SESION_INACTIVIDAD=30m
```

## 5. Contrato (`backend/openapi.yaml`, antes de programar)

- `POST /auth/login`: documentar el `Set-Cookie` de la respuesta 200. El cuerpo no cambia.
- `POST /auth/refrescar` (nuevo): sin `bearerAuth`; requiere la cookie (un esquema de seguridad `apiKey` con `in: cookie`). Responde 200 `{ token, usuario }` con `Set-Cookie`, o 401 con `NO_AUTENTICADO`, `SESION_CERRADA`, `SESION_REEMPLAZADA`, `SESION_INACTIVA`, `JORNADA_TERMINADA` o `CUENTA_DESACTIVADA`.
- `POST /auth/logout`: acepta el Bearer o solo la cookie; 204 con el `Set-Cookie` que la borra.
- La respuesta 401 común lista los códigos nuevos en su descripción.
- La descripción de la seguridad explica el `sid`, la jornada y la inactividad.

## 6. Zonas protegidas (piden confirmación en el spec)

- **`backend/db/08_sesion_mysql.sql`** (nuevo): `CREATE TABLE IF NOT EXISTS`, idempotente, sin recrear la base (como el 05 y el 07).
- **`backend/db/01_modelo_relacional_mysql.sql`**: la tabla `sesion` en la v0.10, para que las bases nuevas la traigan.
- **`docs/base-de-datos/CONTEXTO BD.md`**: la tabla y sus reglas.
- **No se tocan:** `package.json`, los permisos (`refrescar` y `logout` no llevan permiso) ni `transicion_estado`.

## 7. Plan tentativo (pasos del spec)

1. **Contrato** (sección 5). Comprobación: `/api/docs` carga y muestra `/auth/refrescar`.
2. **Modelo de datos.** Pedir confirmación; crear el 08, actualizar el 01 y `CONTEXTO BD.md`; correr el 08 en Aiven. Comprobación: el 08 corre dos veces sin error y la tabla aparece.
3. **`modulos/auth/sesiones.service.js`.** Crear, buscar por refresh (con el margen), rotar, cerrar y cerrar las de un usuario, además de las variables de entorno. Todo recibe la `conexion`, para ir en la transacción de quien llama.
4. **Login y logout.** Crear la sesión, reemplazar la anterior, poner y borrar la cookie, `credentials: true` e `inflate: false`. Pruebas en `auth.login.test.js` y `auth.logout.test.js`.
5. **`autenticar` con la sesión.** El `sid`, el `JOIN sesion`, la jornada, la inactividad y `ultimo_uso`. Pruebas en `autenticar.test.js`.
6. **Helper de pruebas y adaptación de las suites.** `tokenDePrueba` (sección 8) y el cambio en los archivos que firman tokens. **Lo que comprueba cada caso no cambia.** Comprobación: cada archivo pasa solo.
7. **`POST /auth/refrescar`.** La rotación, el margen de 30 s, la jornada y los permisos actualizados.
8. **Cierres por el administrador.** En `usuarios.service.js`, dentro de cada transacción. Pruebas en `usuarios.test.js`.
9. **Verificación final y documentación** (sección 9).

## 8. Pruebas

**Helper `tokenDePrueba(usuarioId)`** (por ejemplo en `tests/sesionDePrueba.js`):

- Como el `UNIQUE` admite una sola sesión abierta, **reutiliza la sesión abierta del usuario si existe y está vigente**; si no, la crea. Después firma el JWT con su `sid`.
- Para las cuentas que las pruebas crean y borran, la cascada borra sus sesiones.

**Cuidados por la regla de una sola sesión:**

- **Un `POST /auth/login` cierra la sesión anterior del mismo usuario.** En un archivo que primero obtiene un token y después prueba el login con la misma cuenta, el primer token deja de servir. Hay que pedir los tokens en el orden correcto o usar una cuenta propia para las pruebas de login.
- **Correr las pruebas cierra la sesión del navegador** de quien esté conectado con el usuario de prueba de `.env`. Va como nota en `CLAUDE.md`.
- Los archivos corren en serie (`fileParallelism: false`), así que dos archivos no se pisan entre sí.

**Pruebas nuevas** (`sesiones.test.js` o repartidas en las de `auth`):

- un segundo login deja al primer token con 401 `SESION_REEMPLAZADA`;
- dos logins en paralelo dejan una sola sesión abierta;
- refrescar rota la cookie; el token anterior se acepta dentro de los 30 s y se rechaza después (se mueve `rotado_en` por SQL);
- jornada vencida y sesión inactiva (se mueven `creada_en`, `expira_en` y `ultimo_uso` por SQL);
- logout con el JWT vencido y solo la cookie;
- un token sin `sid`, o con el `sid` de otra cuenta, responde 401;
- cada cierre por el administrador y su código;
- cambiar la propia contraseña no cierra la sesión;
- la bitácora no tiene filas de la renovación y no contiene el refresh token ni su hash.

**La suite completa (decisión 7):** es necesaria **una vez, al final**. Este spec cambia `autenticar`, que usan todos los endpoints, y modifica las pruebas de casi todos los módulos, así que solo la suite completa demuestra que no se rompió nada. Durante el trabajo se corre solo el archivo de cada paso. Si al final falla algún archivo por un timeout de Aiven, se repite solo ese archivo y no la suite. Si la rama se actualiza con cambios de `main` antes del PR, conviene volver a correrla.

## 9. Verificación final (sección 8 de `AGENTS.md`)

1. La API arranca; `/api/docs` muestra los endpoints de `auth` como dice el contrato.
2. `npm test` del backend pasa completo (una corrida; los archivos que fallen por timeout de Aiven se repiten solos).
3. Manual, con Postman o `curl` contra Aiven:
   - un login en un "equipo" y otro login en otro: el primer token recibe 401 `SESION_REEMPLAZADA`;
   - `refrescar` con la cookie devuelve un token nuevo y otra cookie;
   - después del logout, el token y la cookie ya no sirven;
   - restablecer la contraseña desde otra cuenta cierra la sesión;
   - el frontend **actual** sigue funcionando: inicia sesión, navega y cierra sesión. Con dos navegadores, el primero vuelve al login con el mensaje de sesión reemplazada.
4. Actualizar HU-02 en `HISTORIAS_DE_USUARIO.md` (ya no se acepta el riesgo del token no revocable) y agregar las notas de contexto a `CLAUDE.md`: la tabla `sesion`, `tokenDePrueba`, que el 08 se corre después del 01 junto con el 05 y el 06, y que las pruebas cierran la sesión del usuario de prueba.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Choques con la rama del compañero, porque el spec toca `autenticar.js` y casi todas las pruebas | Empezar desde un `main` actualizado; si él integra antes, actualizar la rama y volver a correr la suite |
| Una prueba pierde su token porque otro login de la misma cuenta lo cerró | `tokenDePrueba` reutiliza la sesión abierta; las pruebas de login usan su propia cuenta |
| El `Secure` de la cookie no funciona en `http://localhost` en algún navegador | Se comprueba en la verificación; si falla, una variable de entorno lo desactiva solo en desarrollo |
| Actualizar `ultimo_uso` en cada petición agrega escrituras a Aiven | Solo si pasó más de 1 min desde la última actualización |
| El frontend actual no conoce los códigos nuevos | Muestra el `mensaje` de cualquier 401; los mensajes nuevos sirven tal como llegan |
| Recrear la base con el 01 sin el 08 | Desde la v0.10, el 01 ya trae la tabla; el 08 sirve para las bases que ya existen |

## 11. Fuera de alcance

- Todo el frontend: guardar el token en memoria, renovarlo, los mensajes por código y quitar `sessionStorage`. Va en `PROPUESTA_SESIONES_FRONTEND.md`.
- Una pantalla con las sesiones abiertas o un botón para cerrar todas.
- Purgar sesiones viejas.
- Actualizar Node.js (hotfix aparte) y la vista previa obligatoria antes de publicar (spec congelado).
