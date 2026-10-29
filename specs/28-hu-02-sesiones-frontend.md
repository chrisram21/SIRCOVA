# SPEC 28 — Sesiones en el frontend

> **Estado:** Implementado
> **Historia:** HU-02 (ajuste del sprint 3: el frontend de las sesiones del SPEC 27)
> **Depende de:** SPEC 02, SPEC 03, SPEC 09, SPEC 25, SPEC 27 y el rediseño del frontend (PR #32, sin spec)
> **Fecha:** 2026-10-29
> **Objetivo:** Que el frontend guarde el JWT en memoria, recupere y renueve la sesión con `POST /auth/refrescar` y la cookie `sircova_refresh` hasta la jornada de 8 h, la comparta entre pestañas y la conserve después de cambiar la propia contraseña.

## Por qué existe este spec

El SPEC 27 dejó en el servidor las sesiones guardadas, una sola abierta por usuario, la revocación, el refresh token en la cookie `sircova_refresh`, la jornada de 8 h y la inactividad de 30 min. El frontend funciona sin cambios, pero no aprovecha nada de eso:

- **Cierra la sesión a las 2 h**, cuando vence el JWT, en lugar de renovarla hasta completar la jornada.
- **Guarda el JWT en `sessionStorage`** (clave `sircova.sesion`), donde cualquier script de la página lo puede leer.
- **Cada pestaña nueva y cada recarga piden iniciar sesión.** Con la regla de una sola sesión, ese nuevo inicio cierra la sesión de la primera pestaña.
- **No manda `credentials: 'include'`**, así que el navegador descarta la cookie del login. Este spec es el primero que la usa desde un navegador.
- **Después de cambiar la propia contraseña vuelve al login**, aunque el equipo decidió que la sesión se mantiene.

La base del spec es `docs/SPECS/PROPUESTA_SESIONES_FRONTEND.md` (decisiones del equipo del 2026-10-28, ajustadas el 2026-10-29). En la fase de preguntas se agregaron dos casos que la propuesta no cubría: la inactividad contada entre todas las pestañas y otra cuenta que inicia sesión en el mismo navegador.

**Diferencias con la historia:** HU-02 dice que «el frontend redirige al inicio de sesión cuando expira» el token. Desde este spec, el vencimiento del JWT (2 h) ya no cierra la sesión: el frontend lo renueva. La sesión termina por cierre manual, por inactividad, al terminar la jornada (8 h) o cuando el servidor la cierra.

## Alcance

**Entra:**

- `api/sesion.js`: la sesión en una variable del módulo, con los mismos nombres de funciones. Agrega `leerSid()` y borra la clave vieja `sircova.sesion` de `sessionStorage`.
- `api/cliente.js`:
  - `credentials: 'include'` en todas las peticiones;
  - `refrescar()`, con una sola promesa compartida y la revisión de que la cuenta sea la misma;
  - el reintento ante el 401 `SESION_VENCIDA`;
  - la hora de la última petición.
- `api/cache.js`: la caché por `sid`, no por token.
- `componentes/ProveedorSesion.jsx`:
  - el arranque con el estado `cargando` y `refrescar()`;
  - la renovación programada;
  - el latido;
  - la inactividad contada entre todas las pestañas;
  - `actualizarTrasCambioContrasena()` en lugar de `terminarTrasCambioContrasena()`.
- `App.jsx` y una pantalla de carga mientras se recupera la sesión, sin redirigir.
- `paginas/cuenta/PaginaCambiarContrasena.jsx`: la sesión se mantiene después del cambio voluntario y del obligatorio.
- `preparar-pruebas.js`: `borrarSesion()` después de cada prueba, y el 401 `NO_AUTENTICADO` del `fetch` falso a `/auth/refrescar`.
- Las pruebas que miran `sessionStorage.getItem('sircova.sesion')` pasan a `leerSesion()`, y se agregan pruebas nuevas (sección «Pruebas»).
- **Solo si falla la verificación de la cookie `Secure` en `http://localhost`:** una variable de desarrollo en el backend que quita `Secure` (paso 6). No hizo falta: el navegador la aceptó.
- **Agregado en el paso 7:** la cookie `sircova_refresh` dura la jornada más 1 h (`MARGEN_COOKIE_SEGUNDOS` en `backend/src/modulos/auth/cookieRefresh.js`), con su descripción en `openapi.yaml` y dos pruebas de `sesiones.test.js`, para que el aviso de jornada terminada llegue al navegador.
- La documentación: el «Avance» de HU-02 y notas en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Otros cambios del backend, aparte del margen de la cookie; el SPEC 27 ya está integrado.
- Avisar a las otras pestañas en el mismo instante en que se cierra la sesión (`BroadcastChannel`). Se enteran en su siguiente petición o revisión.
- Una pantalla de sesiones abiertas, o mostrar en «Mi perfil» cuándo termina la jornada.
- Conservar lo escrito en un formulario cuando la sesión se pierde por otra causa (reemplazada, restablecida).
- Quitar los `sessionStorage.clear()` de los 27 archivos de prueba. Se dejan.
- Volver a la ruta pedida después de un login que vino de una sesión perdida. El login sigue llevando a `/inicio`.
- `express.json({ inflate: false })` y la actualización de Node.js (hotfix aparte).

## Modelo de datos

Este spec no cambia la base ni el contrato. Solo cambian estructuras del frontend.

### Sesión en memoria (`api/sesion.js`)

```js
let sesion = null // { token, usuario }: la respuesta de POST /auth/login o /auth/refrescar
```

- `guardarSesion(s)`, `leerSesion()`, `borrarSesion()`, `leerTokenGuardado()` y `leerVencimiento(token)` conservan su nombre y lo que reciben y devuelven.
- `leerSesion()` ya no descarta el token vencido. Un JWT vencido se renueva, no se descarta: si se descartara, `solicitar` iría sin token y el backend respondería `NO_AUTENTICADO` en vez de `SESION_VENCIDA`.
- `leerSid()` devuelve el `sid` del payload del token guardado, o `null`. Lee el payload como ya lo hace `leerVencimiento` con el `exp`.
- Al cargar el módulo se borra `sessionStorage['sircova.sesion']` si existe. La dejó la versión anterior.

### Actividad compartida (`localStorage`)

- Clave `sircova.actividad`: la hora (`Date.now()`) de la última actividad del usuario en **cualquier** pestaña. Es solo un número, no un dato sensible.
- Cada pestaña la escribe como mucho una vez cada 15 s mientras hay actividad, y también al iniciar o recuperar la sesión.
- Toda lectura y escritura va en `try/catch`. Si `localStorage` no está disponible, cada pestaña cuenta solo su propia actividad.

### Estado del proveedor (`ProveedorSesion.jsx`)

```js
{ sesion, cargando, aviso, iniciar, cerrar, actualizarTrasCambioContrasena, tienePermiso }
```

- `cargando` es `true` solo al montar sin sesión en memoria, mientras espera `refrescar()`.

### Constantes nuevas

| Constante | Valor | Dónde |
|---|---|---|
| `MINUTOS_RENOVACION` | 5 (renueva cuando faltan 5 min para el `exp`) | `ProveedorSesion.jsx` |
| `MINUTOS_LATIDO` | 10 (sin peticiones y con actividad, renueva) | `ProveedorSesion.jsx` |
| `CLAVE_ACTIVIDAD` | `'sircova.actividad'` | `ProveedorSesion.jsx` |

Se mantienen `MINUTOS_INACTIVIDAD = 30` y `SEGUNDOS_REVISION = 15`. `AVISO_VENCIDA` y `AVISO_CAMBIO_CONTRASENA` dejan de usarse y se quitan.

### Código de error solo del frontend

Como `SIN_RESPUESTA` y `SIN_CONEXION`, `refrescar()` puede lanzar un `ErrorApi` que no viene de la API:

| `status` | `codigo` | `mensaje` |
|---|---|---|
| 401 | `SESION_OTRA_CUENTA` | «Se inició sesión con otra cuenta en este navegador. Inicie sesión de nuevo.» |

## Diseño

### `refrescar()` (en `api/cliente.js`, no en `api/auth.js`)

- **Va en `cliente.js` por las pruebas.** Las 24 que simulan `@/api/auth.js` lo hacen con una lista fija de funciones. Si el proveedor importara `refrescar` de ahí, Vitest fallaría en todas con «No "refrescar" export is defined on the mock», el mismo problema de la nota del 2026-10-28 sobre `obtenerPerfil`. Nadie simula `cliente.js`.
- Hace `POST /auth/refrescar` sin Bearer y con `credentials: 'include'`, con el mismo límite de 30 s (`ESPERA_MAXIMA_MS`).
- Usa **una sola promesa compartida**: si se llama mientras otra está en curso, devuelve la misma. Así cubre:
  - varias peticiones que reciben `SESION_VENCIDA` a la vez;
  - el doble efecto de `<StrictMode>` en desarrollo;
  - la renovación programada que coincide con un reintento o con el latido.
- **Con 200:**
  - si hay sesión en memoria y el `usuario.id` nuevo es distinto, **no** guarda nada y lanza `SESION_OTRA_CUENTA`;
  - si no, guarda la sesión nueva con `guardarSesion` y la devuelve.
- **Con un error:** lo lanza sin llamar a `alPerderSesion`. Quien llamó decide qué hacer.

### `solicitar`

- `credentials: 'include'` en **todas** las peticiones. El navegador solo manda la cookie a `/api/v1/auth`, por su `Path`.
- Manda el token guardado aunque haya vencido (`leerTokenGuardado()`), para que el backend responda `SESION_VENCIDA`.
- **Ante un 401 `SESION_VENCIDA`:**
  - si el token guardado ya no es el que se mandó (otra petición ya renovó), repite la petición con el actual;
  - si no, espera `refrescar()` y repite **una sola vez**;
  - si `refrescar()` falla con un 401, llama a `alPerderSesion` con **el error del refresco**, solo si el token guardado sigue siendo el que se mandó, y lanza ese error;
  - si `refrescar()` falla por la red (`SIN_CONEXION`, `SIN_RESPUESTA`), lanza ese error sin llamar a `alPerderSesion`: la sesión sigue (decidido en el paso 2).
- **No reintenta** ante otros 401, ni cuando falla la llamada a `/auth/refrescar` o a `/auth/login`. Así no entra en un bucle.
- Se mantiene la regla de hoy: un 401 que llega cuando el token guardado ya no es el que se mandó no cierra la sesión actual.
- Anota la hora de cada petición con token que recibió respuesta, y la de cada `refrescar()` correcto (también actualiza `ultimo_uso` en el servidor; sin anotarla, el latido se repetiría cada 15 s). `leerUltimaPeticion()` la devuelve para el latido.

### Caché (`api/cache.js`)

- La entrada guarda el `sid` (`leerSid()`) en lugar del token.
- Una renovación conserva la caché, y otra sesión (otro login u otra cuenta) la descarta.

### Arranque (`ProveedorSesion.jsx` y `App.jsx`)

- **Con sesión en memoria** al montar, la usa sin llamar a la API. Es lo que hacen las pruebas con `guardarSesion` antes de montar, y por eso esas 27 no cambian.
- **Sin sesión en memoria**, queda `cargando` y llama a `refrescar()`:
  - con 200, guarda la sesión;
  - con 401 `NO_AUTENTICADO`, queda sin sesión y **sin aviso**: es una visita normal al login;
  - con otro 401, queda sin sesión con su `mensaje` como aviso (por ejemplo, `SESION_REEMPLAZADA` o `JORNADA_TERMINADA`);
  - con `SIN_CONEXION` o `SIN_RESPUESTA`, queda sin sesión con su `mensaje` como aviso.
- **Mientras está `cargando`**, `App` muestra la pantalla de carga en lugar de las rutas: ni `RutaProtegida`, ni `/login`, ni la ruta comodín redirigen. La pantalla usa `FondoMarca`, `MarcaSircova` y la animación `barra-carga`.
- Al recuperar la sesión se queda en la ruta pedida, con su búsqueda (`/registro?periodo=…`). Con `debeCambiarContrasena: true` va al cambio obligatorio, como hoy.

### Revisión cada 15 s (`revisar()`)

Se mantiene la comparación de horas, porque el navegador retrasa los temporizadores de las pestañas ocultas. En cada revisión, en este orden:

1. **Inactividad.** Toma la actividad más reciente entre la propia y `sircova.actividad`. Con 30 min o más sin actividad, llama a `logout('INACTIVIDAD')` y cierra con `AVISO_INACTIVIDAD`, como hoy. Si otra pestaña tuvo actividad, no cierra.
2. **Renovación programada.** Si faltan 5 min o menos para el `exp` del JWT, o ya venció, llama a `refrescar()`.
3. **Latido.** Si hubo actividad propia en los últimos 10 min y `leerUltimaPeticion()` tiene 10 min o más, llama a `refrescar()`, que actualiza `ultimo_uso` en el servidor.

El latido existe porque el servidor cuenta 30 min **sin peticiones** y el frontend cuenta 30 min **sin actividad**. Sin él, quien llena el formulario de captura durante 35 min sin guardar recibiría 401 `SESION_INACTIVA` al guardar y perdería lo escrito.

Si `refrescar()` falla en la renovación o en el latido:

- con un 401 (incluido `SESION_OTRA_CUENTA`), cierra **sin logout** con el `mensaje` del error;
- con `SIN_CONEXION` o `SIN_RESPUESTA`, no cierra. Lo vuelve a intentar en la siguiente revisión y, si el JWT ya venció, el reintento de `solicitar` lo cubre.

**Sin logout** en `SESION_OTRA_CUENTA` porque la cookie ya es de la otra cuenta: el logout le cerraría la sesión a ella.

### Cierres

- `cerrar()`: igual que hoy, `logout('MANUAL')`. El logout manda la cookie, así que funciona aunque el JWT haya vencido.
- `alPerderSesion`: igual que hoy, con el `mensaje` del error. El 403 `CAMBIO_CONTRASENA_REQUERIDO` se mantiene como respaldo, con `AVISO_CONTRASENA_RESTABLECIDA`.
- Cada renovación trae los permisos y los datos actuales, así que el menú se actualiza solo si cambiaron.

### Cambio de la propia contraseña (`PaginaCambiarContrasena.jsx`)

El equipo decidió que **la sesión se mantiene**. Si se dejara como hoy (volver al login sin logout), la cookie seguiría viva y una recarga recuperaría la sesión: sería incoherente.

- **Cambio voluntario** (desde el menú de la cuenta): después del 204, `toast.success('Contraseña cambiada.')` y navega a `/inicio`.
- **Cambio obligatorio** (contraseña temporal): después del 204 llama a `actualizarTrasCambioContrasena()`. Esa función llama a `refrescar()`, que trae `debeCambiarContrasena: false`, y actualiza la sesión. Con eso, `App` deja de mostrar la pantalla sola y va a `/inicio` dentro del `Layout`, con el mismo toast.
  - Si `refrescar()` falla, cierra la sesión sin logout con el `mensaje` del error.
- «Cancelar» y «Cerrar sesión» de esa pantalla no cambian.

### Varias pestañas

- Comparten la cookie, así que una pestaña nueva recupera la sesión con `refrescar()` sin pedir el login.
- Si dos pestañas renuevan a la vez, el backend acepta el refresh token anterior durante 30 s. Por ejemplo, A y B renuevan a la vez con `R1`: A recibe `R2`, y B, que mandó `R1` un instante después, también recibe su JWT.
- Cada pestaña programa su propia renovación con su propio JWT; todas comparten el `sid`.
- Si se cierra sesión en una pestaña, las otras se enteran en su siguiente petición (401 `SESION_CERRADA`) o en su siguiente renovación, y vuelven al login con el mensaje.
- Una pestaña quieta no cierra la sesión mientras otra tenga actividad (actividad compartida).
- Si en otra pestaña se inicia sesión con otra cuenta, la siguiente renovación de esta pestaña recibe `SESION_OTRA_CUENTA` y vuelve al login sin cerrarle la sesión a la otra cuenta.

### Archivos que aparecen o cambian

| Archivo | Cambio |
|---|---|
| `frontend/src/api/sesion.js` | Sesión en memoria, `leerSid()`, limpieza de la clave vieja |
| `frontend/src/api/cliente.js` | `credentials`, `refrescar()`, reintento, `leerUltimaPeticion()` |
| `frontend/src/api/cache.js` | Entrada por `sid` |
| `frontend/src/componentes/ProveedorSesion.jsx` | Arranque, `cargando`, revisión, actividad compartida, `actualizarTrasCambioContrasena()` |
| `frontend/src/componentes/PantallaCargaSesion.jsx` | **Nuevo**: la pantalla de carga |
| `frontend/src/App.jsx` | La pantalla de carga mientras `cargando` |
| `frontend/src/paginas/cuenta/PaginaCambiarContrasena.jsx` | La sesión se mantiene; toast y `/inicio` |
| `frontend/src/preparar-pruebas.js` | `borrarSesion()` en el `afterEach`; 401 a `/auth/refrescar` |
| `frontend/src/api/sesion.test.js`, `cliente.test.js`, `cache.test.js` | Casos adaptados y nuevos |
| `frontend/src/componentes/ProveedorSesion.test.jsx`, `RutaProtegida.test.jsx`, `layout/Layout.test.jsx` | Casos adaptados y nuevos |
| `frontend/src/paginas/login/PaginaLogin.test.jsx`, `paginas/cuenta/PaginaCambiarContrasena.test.jsx` | Casos adaptados y nuevos |
| `frontend/src/paginas/usuarios/PaginaUsuarios.test.jsx`, `PaginaRegistrarPersonal.test.jsx` | Un caso más: la contraseña generada no está en la sesión en memoria |
| `docs/SPECS/HISTORIAS_DE_USUARIO.md`, `CLAUDE.md` | Avance de HU-02 y notas |
| Solo si falla el paso 6: `backend/src/config/entorno.js`, `backend/.env.example` | La variable de desarrollo que quita `Secure` (no hizo falta) |
| `backend/src/modulos/auth/cookieRefresh.js`, `backend/openapi.yaml`, `backend/tests/sesiones.test.js`, `specs/27-hu-02-sesiones-backend.md` | La cookie dura la jornada más 1 h (agregado en el paso 7) |
| `frontend/src/componentes/RutaConPermiso.test.jsx` | Un caso sin sesión espera el login con `findBy` (la pantalla de carga va antes) |

`RutaProtegida.jsx` no cambia: `App` no la monta mientras `cargando`.

## Plan de implementación

Durante el trabajo se corren solo los archivos de prueba de cada paso. La suite completa del frontend se corre al final de los pasos 1 y 5.

1. **Sesión en memoria y preparación de pruebas.**
   - `api/sesion.js`: la variable del módulo, `leerSid()`, la limpieza de la clave vieja, y `leerSesion()` sin descartar el vencido.
   - `preparar-pruebas.js`: `borrarSesion()` en el `afterEach` y el 401 `NO_AUTENTICADO` a `/auth/refrescar` (el resto de las peticiones sigue pendiente).
   - Las pruebas que miran `sessionStorage.getItem('sircova.sesion')` pasan a `leerSesion()`. Los casos de `sesion.test.js` sobre JSON mal formado y token vencido se reemplazan por los de la sesión en memoria y `leerSid()`.

   Comprobación: `npm test` del frontend pasa completo **sin otros cambios**. Así se ve que el cambio de almacén no rompe nada antes de agregar comportamiento.

2. **Cliente y caché.** `credentials: 'include'`, `refrescar()` con la promesa compartida y la revisión de la cuenta, el reintento ante `SESION_VENCIDA`, el token vencido en la petición y `leerUltimaPeticion()`. La caché por `sid`.

   Comprobación: `cliente.test.js` y `cache.test.js` pasan con los casos nuevos.

3. **Proveedor y pantalla de carga.** El arranque con `cargando`, `PantallaCargaSesion.jsx`, `App.jsx`, y `revisar()` con la inactividad compartida, la renovación programada y el latido.

   Comprobación: `ProveedorSesion.test.jsx`, `RutaProtegida.test.jsx`, `Layout.test.jsx` y `PaginaLogin.test.jsx` pasan.

4. **Cambio de la propia contraseña.** `actualizarTrasCambioContrasena()`, el toast y `/inicio`, y el cambio obligatorio con `refrescar()`.

   Comprobación: `PaginaCambiarContrasena.test.jsx` pasa con los casos nuevos.

5. **Suite completa.** `npm test` del frontend. Si la máquina está cargada y fallan por tiempo `PaginaUsuarios`, `PaginaEditarUsuario` o `PaginaCambiarContrasena`, se repiten solas (nota del 2026-10-22).

6. **Cookie en el navegador.** Con Playwright contra la API real (la persona inicia sesión a mano), se comprueba que después del login `sircova_refresh` aparece en el navegador como `HttpOnly`, `Secure` y `SameSite=Strict` en `http://localhost:5173`, y que una recarga recupera la sesión.

   **Solo si el navegador la rechaza:** pedir confirmación antes de tocar el backend. Después, agregar una variable de desarrollo que quita `Secure` (por ejemplo, `COOKIE_REFRESH_SEGURA=false`). La variable es opcional y vale `true` si falta, se documenta en `.env.example` y en las decisiones del SPEC 27, y se vuelve a comprobar.

7. **Verificación manual** (Playwright, contra la API real):
   - `sessionStorage` queda vacío;
   - recargar `/registro?periodo=…` no pide el login y se queda en esa dirección;
   - abrir una segunda pestaña no pide el login, y la primera sigue funcionando;
   - con una pestaña quieta y otra con actividad, la quieta no cierra la sesión a los 30 min (con `MINUTOS_INACTIVIDAD` reducido solo para la prueba, sin dejar el cambio);
   - iniciar sesión en otro navegador: el primero vuelve al login con «Se inició sesión con su cuenta en otro equipo…»;
   - iniciar sesión con otra cuenta en otra pestaña: la primera vuelve al login con el aviso de `SESION_OTRA_CUENTA`, y la segunda sigue abierta;
   - con `JWT_EXPIRACION=7m` en el `backend/.env` local, la sesión se renueva sola y no se cierra (con `3m` renovaría en cada revisión de 15 s, porque el margen de renovación es de 5 min);
   - con `SESION_DURACION_MAXIMA` corta aparece el aviso de jornada terminada, y con `SESION_INACTIVIDAD` corta (y `MINUTOS_LATIDO` reducido solo para la prueba) no aparece mientras hay actividad sin peticiones (latido);
   - cambiar la contraseña desde el menú muestra el toast y la sesión sigue; entrar con una contraseña temporal y cambiarla lleva a `/inicio` sin volver a iniciar sesión;
   - cerrar sesión y recargar: ya no la recupera.

   Al terminar, se restauran los valores del `backend/.env` local.

8. **Documentación.** El «Avance» de HU-02 (el frontend ya no falta) y las notas de `CLAUDE.md`:
   - el JWT vive en memoria y la sesión se recupera con `refrescar()` de `cliente.js`, no de `auth.js`;
   - el `fetch` falso de las pruebas responde 401 a `/auth/refrescar`;
   - la caché es por `sid`;
   - el latido y la actividad compartida en `sircova.actividad`;
   - `SESION_OTRA_CUENTA` es un código solo del frontend.

## Pruebas

**`preparar-pruebas.js`:**

- `borrarSesion()` en el `afterEach`, junto a `vaciarCache()`. La sesión en memoria sobrevive entre las pruebas de un archivo, y `sessionStorage.clear()` ya no la borra. Los `sessionStorage.clear()` de los 27 archivos se dejan.
- También borra `sircova.actividad` de `localStorage`.
- El `fetch` falso responde 401 `NO_AUTENTICADO` a `/auth/refrescar` y deja pendiente todo lo demás, como hoy. Sin esto, una prueba que monta la app sin sesión quedaría para siempre en `cargando`. Las pruebas con su propio `fetch` (`vi.stubGlobal`) no cambian.

**Casos que cambian** (lo que comprueba cada uno no cambia, salvo los que este spec cambia a propósito):

- Los que miran `sessionStorage.getItem('sircova.sesion')` pasan a `leerSesion()`: `sesion.test.js`, `ProveedorSesion.test.jsx`, `cliente.test.js`, `cache.test.js`, `Layout.test.jsx`, `PaginaLogin.test.jsx` y `PaginaCambiarContrasena.test.jsx`.
- `ProveedorSesion.test.jsx`: «al llegar al vencimiento del token cierra la sesión sin llamar a la API» pasa a «renueva cinco minutos antes del vencimiento».
- `PaginaCambiarContrasena.test.jsx`: «un envío válido cambia la contraseña, cierra la sesión sin logout…» pasa a comprobar el toast, la navegación a `/inicio` y que la sesión sigue.
- `cache.test.js`: el caso que compara tokens pasa a comparar `sid`, y se agrega que una renovación con el mismo `sid` conserva la caché.

**Casos nuevos:**

- `sesion.test.js`: `leerSid()`; la clave vieja de `sessionStorage` se borra al cargar el módulo.
- `cliente.test.js`, con `fetch` simulado:
  - toda petición va con `credentials: 'include'`;
  - un 401 `SESION_VENCIDA` renueva y repite;
  - dos peticiones a la vez hacen **un solo** refresco;
  - si el token ya cambió, repite sin renovar;
  - un refresco que falla con 401 no repite y llama a `alPerderSesion` con su error; uno que falla por la red no lo llama;
  - otro 401 no intenta renovar;
  - un refresco que trae otro `usuario.id` lanza `SESION_OTRA_CUENTA` y no cambia la sesión guardada.
- `ProveedorSesion.test.jsx`, con temporizadores falsos:
  - arranque con refresco correcto, con 401 `NO_AUTENTICADO` (sin aviso), con otro 401 (con el aviso) y con `SIN_CONEXION` (con el aviso);
  - con sesión en memoria, no llama a `refrescar` al montar;
  - la renovación programada;
  - el latido: con actividad y sin peticiones durante 10 min llama a `refrescar`; sin actividad, no;
  - con `sircova.actividad` reciente (otra pestaña), no cierra por inactividad aunque esta pestaña lleve 30 min quieta;
  - un fallo de red en la renovación no cierra la sesión;
  - `SESION_OTRA_CUENTA` cierra sin llamar a `logout`.
- `RutaProtegida.test.jsx` (monta `App`): mientras carga no redirige y muestra la pantalla de carga; al recuperar la sesión, se queda en la ruta pedida.
- `PaginaCambiarContrasena.test.jsx`: el cambio obligatorio llama a `refrescar` y deja la sesión con `debeCambiarContrasena: false`; si `refrescar` falla, cierra la sesión.
- `PaginaUsuarios.test.jsx` y `PaginaRegistrarPersonal.test.jsx`: la contraseña generada tampoco está en la sesión en memoria.

## Criterios de aceptación

- [ ] `sessionStorage` no tiene la clave `sircova.sesion` después del login, y el JWT no está en ningún almacén del navegador.
- [ ] Después del login, el navegador tiene la cookie `sircova_refresh` como `HttpOnly`, `Secure` (o sin `Secure` solo con la variable de desarrollo del paso 6) y `SameSite=Strict`.
- [ ] Recargar `/registro?periodo=…` con la sesión abierta no pide el login y se queda en esa dirección, con la pantalla de carga mientras tanto.
- [ ] Una segunda pestaña no pide el login, y la primera sigue funcionando.
- [ ] Con `JWT_EXPIRACION=7m`, la sesión se renueva sola durante más de 7 min sin cerrarse.
- [ ] Un 401 `SESION_VENCIDA` renueva y repite la petición una sola vez; dos peticiones a la vez hacen un solo refresco.
- [ ] Al terminar la jornada aparece el aviso `JORNADA_TERMINADA` en el login.
- [ ] Con actividad y sin peticiones durante 10 min, el frontend llama a `/auth/refrescar` (latido), y con `SESION_INACTIVIDAD` corta no aparece `SESION_INACTIVA` mientras se escribe en la captura.
- [ ] Una pestaña quieta no cierra la sesión mientras otra pestaña tenga actividad.
- [ ] Iniciar sesión con otra cuenta en otra pestaña deja a la primera en el login con el aviso de `SESION_OTRA_CUENTA`, y la segunda sigue abierta.
- [ ] Iniciar sesión en otro navegador deja al primero en el login con «Se inició sesión con su cuenta en otro equipo…».
- [ ] Una visita al login sin cookie no muestra ningún aviso.
- [ ] Cambiar la contraseña desde el menú muestra «Contraseña cambiada.», lleva a `/inicio` y la sesión sigue.
- [ ] Cambiar la contraseña temporal lleva a `/inicio` dentro del menú, sin volver a iniciar sesión.
- [ ] Cerrar sesión y recargar lleva al login: la sesión ya no se recupera.
- [ ] Una renovación conserva la caché de catálogos, y otro login la descarta.
- [ ] `npm test` del frontend pasa completo, sin desactivar ni quitar pruebas.
- [ ] Ningún `package.json`, la base, los permisos ni `transicion_estado` cambian, y el backend solo cambia en el margen de la cookie.
- [ ] HU-02 tiene su avance actualizado y `CLAUDE.md` tiene las notas.

## Decisiones

- **Sí:** el JWT en memoria y el refresh token en la cookie `HttpOnly` (decisión del equipo). **No:** `sessionStorage`, que lee cualquier script de la página (XSS). La credencial que dura toda la jornada queda protegida, y el JWT dura 2 h y se puede revocar.
- **Sí:** se conservan los nombres de `api/sesion.js` (decidido en la propuesta). **No:** nombres nuevos, que obligarían a tocar las 27 pruebas que usan `guardarSesion`.
- **Sí:** `leerSesion()` ya no descarta el JWT vencido (decidido al escribir el spec). **No:** descartarlo, que haría que el backend respondiera `NO_AUTENTICADO` en vez de `SESION_VENCIDA` y no se renovaría.
- **Sí:** `refrescar()` en `cliente.js` (decidido en la propuesta). **No:** en `auth.js`, que rompería las 24 pruebas que lo simulan con una lista fija.
- **Sí:** `credentials: 'include'` en todas las peticiones (decidido en la propuesta). **No:** decidir por ruta: el `Path` de la cookie ya limita a dónde viaja.
- **Sí:** un solo reintento por petición, y nunca sobre `/auth/refrescar` ni `/auth/login` (decidido en la propuesta). **No:** reintentos ilimitados, que pueden entrar en un bucle si la cookie no viaja.
- **Sí:** la caché por `sid` (decidido en la propuesta). **No:** por token, que la vaciaría en cada renovación.
- **Sí:** la pantalla de carga mientras se recupera la sesión, en `App` (decidido al escribir el spec). **No:** redirigir mientras tanto, que pierde la dirección pedida. **No:** repetir la espera en `RutaProtegida`, `/login` y la ruta comodín.
- **Sí:** renovar 5 min antes del `exp` (decidido en la propuesta). **No:** esperar al 401 `SESION_VENCIDA`, que deja la renovación solo en manos de las peticiones.
- **Sí:** el latido con `refrescar()` cada 10 min con actividad y sin peticiones (decidido en la propuesta). **No:** aceptar que se pierda lo escrito en un formulario largo.
- **Sí:** la inactividad se cuenta entre todas las pestañas con `sircova.actividad` en `localStorage` (decidido en la fase de preguntas). **No:** el cierre solo local, que deja recuperar la sesión con una recarga. **No:** dejar que una pestaña quieta cierre la sesión de todas.
- **Sí:** si `refrescar()` trae otra cuenta, la pestaña vuelve al login con `SESION_OTRA_CUENTA` y sin logout (decidido en la fase de preguntas). **No:** aceptar el cambio de cuenta en silencio, que puede dejar en pantalla datos de la cuenta anterior.
- **Sí:** un fallo de red en la renovación no cierra la sesión (decidido al escribir el spec). **No:** cerrarla por un corte de red breve.
- **Sí:** la sesión se mantiene después de cambiar la propia contraseña (decisión del equipo, 2026-10-28). El cambio voluntario lleva a `/inicio` con un toast (decidido en la fase de preguntas). **No:** volver a la pantalla anterior con `navigate(-1)`, que puede salir de la app.
- **Sí:** el cambio obligatorio actualiza la sesión con `refrescar()` (decidido en la propuesta). **No:** marcar `debeCambiarContrasena: false` a mano en el frontend, que dejaría permisos o datos desactualizados.
- **Sí:** si el navegador rechaza la cookie `Secure` en `localhost`, la variable de desarrollo va en este spec, como paso condicional y con confirmación (decidido en la fase de preguntas). **No:** detener el spec y abrir un hotfix aparte.
- **Sí:** se dejan los `sessionStorage.clear()` de las 27 pruebas (decidido en la fase de preguntas). **No:** quitarlos aquí, que agranda el cambio y choca con otras ramas.
- **Sí:** el 403 `CAMBIO_CONTRASENA_REQUERIDO` sigue cerrando la sesión como respaldo (decidido en la propuesta), aunque el backend ya responde antes el 401 `CONTRASENA_RESTABLECIDA`.

- **Sí:** en `solicitar`, solo un 401 del refresco llama a `alPerderSesion`; un fallo de red lanza el error y la sesión sigue (decidido en el paso 2). **No:** cerrar la sesión por un corte de red durante el reintento.
- **Sí:** un `refrescar()` correcto también actualiza la hora de la última petición (decidido en el paso 2): el backend actualiza `ultimo_uso` al rotar, y sin anotarla el latido se repetiría en cada revisión.
- **Sí:** la última actividad vive en un `ref` del proveedor, fuera del efecto que depende del token (decidido en el paso 3). **No:** reiniciarla con cada token nuevo, que haría que una renovación alargara la sesión de alguien que no usa el equipo.
- **Sí:** en cada revisión, el proveedor toma la sesión que el cliente ya renovó por un `SESION_VENCIDA` (decidido en el paso 3), para no renovar dos veces y actualizar los permisos del menú. Una renovación que llega después de cerrar la sesión no la revive.
- **Sí:** las pruebas que montan la app sin sesión esperan el login con `findBy` (`abrirLogin` es `async`), porque antes pasa la pantalla de carga (decidido en el paso 3). Lo que comprueba cada caso no cambia.
- **Sí:** la cookie dura la jornada más 1 h (decidido en el paso 7, al ver «Debe iniciar sesión.» al terminar la jornada en lugar de `JORNADA_TERMINADA`). Con `Max-Age` igual a la jornada, el navegador la borraba justo a esa hora y `refrescar` llegaba sin ella. Cambia el backend (contrato, `cookieRefresh.js` y dos pruebas de `sesiones.test.js`), fuera del alcance original. **No:** un texto propio del frontend, que no sabe si fue la jornada. **No:** aceptar el mensaje genérico.
- **Sí:** la verificación manual usó `JWT_EXPIRACION=7m` (decidido en el paso 7). **No:** `3m`, que con el margen de 5 min renovaría en cada revisión de 15 s.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las 24 pruebas que simulan `@/api/auth.js` fallan por la función nueva | `refrescar()` va en `cliente.js`, que nadie simula. |
| Las pruebas sin sesión quedan para siempre en `cargando` | El `fetch` falso responde 401 a `/auth/refrescar`. |
| Una prueba existente guarda a propósito un token vencido y espera quedar sin sesión | El paso 1 corre la suite completa; si aparece, el caso pasa a usar `borrarSesion()` sin cambiar lo que comprueba. |
| Un bucle de refrescos si la cookie no viaja | Un solo reintento por petición; el fallo de `refrescar` o `login` nunca se reintenta. |
| `<StrictMode>` llama dos veces al refresco del arranque | La promesa compartida de `refrescar()`; aun sin ella, el margen de 30 s del backend lo acepta. |
| Se pierde lo escrito en un formulario largo por la inactividad del servidor | El latido cada 10 min con actividad. |
| Una pestaña quieta cierra la sesión de todas | La actividad compartida en `sircova.actividad`. |
| `localStorage` no disponible (navegación privada o bloqueada) | `try/catch`: cada pestaña cuenta su propia actividad, como hoy. |
| El navegador rechaza la cookie `Secure` en `http://localhost` | Se comprobó en el paso 6: Opera GX la acepta, y la variable no hizo falta. |
| Aiven apagado deja la pantalla de carga hasta 30 s | `ESPERA_MAXIMA_MS` la corta y el login muestra el aviso de conexión (nota de Aiven en la memoria del equipo). |
| La cookie `SameSite=Strict` no viaja si la API se despliega en otro dominio | El despliegue debe tener el frontend y la API en el mismo sitio. Va como nota para el sprint de Docker. |
| Las pestañas ocultas retrasan los temporizadores | Se mantiene la comparación de horas; el reintento ante `SESION_VENCIDA` cubre lo que se escape. |
| Correr las pruebas del backend cierra la sesión del navegador del usuario de prueba | Ya está en las notas del SPEC 27; en la verificación manual, usar otra cuenta mientras corren. |

## Lo que **no** entra en este spec

- Cambios del backend, salvo el margen de 1 h de la cookie.
- Avisar a las otras pestañas en el mismo instante (`BroadcastChannel`).
- Una pantalla de sesiones abiertas, o la hora de fin de la jornada en «Mi perfil».
- Conservar lo escrito en un formulario cuando la sesión se pierde por otra causa.
- Quitar los `sessionStorage.clear()` de las pruebas.
- Volver a la ruta pedida después de un login que vino de una sesión perdida.
- `express.json({ inflate: false })` y la actualización de Node.js.

Cada uno, si se hace, va en su propio spec.
