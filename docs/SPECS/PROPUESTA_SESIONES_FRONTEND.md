# Propuesta para el spec de sesiones · Frontend

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo después de la asesoría de fin del sprint 2 (2026-10-28), ajustado el 2026-10-29 a lo que dejaron en `main` el SPEC 27 y el rediseño del frontend (#32). No es el spec: el spec se escribe en `specs/NN-slug.md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** ajuste a HU-02 (cerrar sesión y expiración de la sesión).
> **Depende de:** el SPEC 27 (sesiones en el servidor, backend) y el rediseño del frontend (#32), los dos ya en `main`.
> **Rama sugerida:** `spec-28-hu-02-sesiones-frontend`, desde `main` (el número es el siguiente libre al crearlo).
> **No toca zonas protegidas:** sin cambios en la base, los permisos, `transicion_estado` ni `package.json`. El backend no cambia.

## 1. Por qué existe

El SPEC 27 dejó en el servidor:

- las sesiones guardadas, con una sola abierta por usuario;
- la revocación;
- el refresh token en la cookie `sircova_refresh`;
- la jornada de 8 h y la inactividad de 30 min.

El frontend sigue funcionando sin cambios, pero no aprovecha nada de eso:

- **Cierra la sesión a las 2 h** (cuando vence el JWT), en lugar de renovarla hasta completar la jornada.
- **Guarda el JWT en `sessionStorage`**, donde cualquier script de la página lo puede leer.
- **Cada pestaña nueva y cada recarga piden iniciar sesión.** `sessionStorage` es distinto en cada pestaña. Con la regla de una sola sesión, ese nuevo inicio **cierra la sesión de la primera pestaña**.
- **No manda `credentials: 'include'`**, así que el navegador descarta la cookie que pone el login. El SPEC 27 la comprobó solo con `curl` y las pruebas. Este spec es el primero que la usa desde un navegador.
- **Después de cambiar la propia contraseña vuelve al login**, aunque el equipo decidió que la sesión se mantiene. El SPEC 27 la deja abierta en el servidor y dejó esta decisión al frontend.

## 2. Decisiones del equipo

| Tema | Decisión |
|---|---|
| Dónde vive el JWT | **En memoria** (una variable del módulo `api/sesion.js`), no en `sessionStorage` |
| Refresh token | En la cookie `HttpOnly` que pone el backend; el frontend no la lee ni la escribe, solo la manda con `credentials: 'include'` |
| Al recargar o abrir otra pestaña | Se llama a `POST /auth/refrescar`; si responde 200, se sigue sin pedir el login |
| Duración | El JWT dura 2 h y se renueva antes de vencer, hasta la jornada de 8 h |
| Inactividad | Se mantienen los 30 min del frontend (`MINUTOS_INACTIVIDAD`); el backend también la controla |
| Cambio de la propia contraseña | **La sesión se mantiene** (decisión del 2026-10-28; hoy el frontend vuelve al login) |

**Por qué la cookie `HttpOnly` y no `sessionStorage`:** el JavaScript de la página puede leer `sessionStorage`. Si algún día entra un script malicioso (XSS), puede llevarse el token y usarlo desde otro equipo. Una cookie `HttpOnly` no la ve ningún script; el navegador la manda solo a `/api/v1/auth`. El JWT sigue en memoria porque cada petición lo necesita, pero dura 2 h y el servidor lo puede revocar. La credencial que dura toda la jornada es la que queda protegida.

## 3. Lo que dejó el SPEC 27 (el backend que se consume)

| Endpoint | Lo que hace | Lo que importa para el frontend |
|---|---|---|
| `POST /auth/login` | Cierra la sesión anterior (`REEMPLAZADA`), crea la nueva y pone la cookie | El cuerpo **no cambió**: `{ token, usuario }`. Sin `credentials: 'include'` la cookie se pierde |
| `POST /auth/refrescar` | Sin Bearer, con la cookie. Rota el refresh token y acepta el anterior durante 30 s | Responde `{ token, usuario }` con los permisos y los datos **actuales**; funciona con `debeCambiarContrasena: true`. Un 401 borra la cookie |
| `POST /auth/logout` | Con el Bearer o solo con la cookie; borra la cookie | **Idempotente:** con la sesión ya cerrada o sin sesión responde 204. Sirve aunque el JWT haya vencido |
| `GET /auth/yo` | Perfil (rediseño, `PaginaMiPerfil`) | Usa `autenticarSinExigirCambio`, así que también revisa la sesión |

**Los 401 de la sesión** (tabla del SPEC 27). Todos traen un `mensaje` que sirve tal cual:

| `codigo` | Cuándo | Lo que hace el frontend |
|---|---|---|
| `SESION_VENCIDA` | Venció el JWT (2 h) | **Renueva** con `refrescar` y repite la petición |
| `SESION_REEMPLAZADA` | Otro inicio de sesión de la misma cuenta | Vuelve al login con el `mensaje` |
| `SESION_CERRADA` | Se cerró sesión en otra pestaña o por inactividad | Ídem |
| `CONTRASENA_RESTABLECIDA` | El administrador restableció la contraseña | Ídem. El texto es el mismo que hoy da el frontend para el 403 |
| `CUENTA_DESACTIVADA`, `SESION_DESACTUALIZADA` | El administrador desactivó la cuenta o cambió el rol o el ámbito | Ídem |
| `SESION_INACTIVA` | 30 min sin peticiones | Ídem |
| `JORNADA_TERMINADA` | Pasaron las 8 h | Ídem |
| `NO_AUTENTICADO` | Sin token, sin `sid`, o `refrescar` sin cookie válida | Vuelve al login; **sin aviso** si pasa al cargar la página |

Hoy el frontend ya muestra el `mensaje` de cualquier 401, así que **no hace falta una tabla de textos propia**: solo cambia el trato de `SESION_VENCIDA` (renovar) y el del arranque (sin aviso con `NO_AUTENTICADO`).

## 4. Lo que hay hoy en el frontend (después del rediseño)

- **`api/sesion.js`:** `guardarSesion`, `leerSesion`, `borrarSesion`, `leerTokenGuardado` y `leerVencimiento`, sobre `sessionStorage` (clave `sircova.sesion`). `leerSesion` descarta el token vencido.
- **`api/cliente.js`:** `solicitar` lee el token **antes de su primer `await`**. Cancela a los 30 s (`ESPERA_MAXIMA_MS`, `SIN_RESPUESTA`) y tiene `mensajeDeError`. Llama a `alPerderSesion` ante un 401, o ante un 403 `CAMBIO_CONTRASENA_REQUERIDO`, **solo si el token guardado sigue siendo el que se mandó**.
- **`api/cache.js`** (nuevo en el rediseño): `consultarConCache` guarda los catálogos 2 min **por token**. Con la renovación el token cambia cada 2 h aunque la sesión sea la misma, y la caché se pediría de nuevo sin necesidad.
- **`componentes/ProveedorSesion.jsx`:**
  - lee la sesión al montar con `useState(() => leerSesion())`;
  - cada 15 s compara la hora con el `exp` (cierra con `AVISO_VENCIDA`) y con la última actividad (cierra por `INACTIVIDAD` y avisa al servidor);
  - `cerrar()` llama a `logout('MANUAL')`;
  - `terminarTrasCambioContrasena()` cierra **sin** logout.
- **`componentes/RutaProtegida.jsx`:** sin sesión, `<Navigate to="/login">`. Con `debeCambiarContrasena`, todo va a `RUTA_CAMBIO_CONTRASENA`. Exporta `RUTA_PERFIL`.
- **`App.jsx`:** `/login` redirige a `/inicio` si hay sesión. La ruta comodín `*` redirige a `/inicio`. Las pantallas del menú se cargan con `lazy` y el `Layout` las espera con `Suspense`.
- **`main.jsx`:** `<StrictMode>`, data router (`createBrowserRouter`) y `<Toaster>` de `sonner`.
- **`componentes/layout/MenuUsuario.jsx`** (nuevo, al pie del menú lateral): «Mi perfil», «Cambiar contraseña» y «Cerrar sesión», con la confirmación de `useCambiosPendientes` si hay cambios sin guardar.
- **`paginas/login/PaginaLogin.jsx`** (rediseñada): el `aviso` del proveedor en un `Alert`, el diálogo «Usuario bloqueado» (423) y el acceso rápido de desarrollo (`.env.local`), que usa el login normal.
- **`paginas/cuenta/PaginaCambiarContrasena.jsx`:** al cambiar la contraseña llama a `terminarTrasCambioContrasena()` y navega a `/login`.
- **Convenciones del rediseño** (notas del 2026-10-28 en `CLAUDE.md`):
  - los avisos de guardado son `toast.success` de `sonner`, nunca `state.aviso`;
  - el texto de un error sale de `mensajeDeError`;
  - las superficies de marca usan `FondoMarca` y `MarcaSircova`;
  - la animación `barra-carga` existe en `index.css` y respeta `prefers-reduced-motion`.
- **Pruebas:**
  - `preparar-pruebas.js` deja `fetch` **sin respuesta** (una promesa que no termina), vacía la caché y simula `sonner`.
  - **27 archivos** usan `guardarSesion` y `sessionStorage.clear()`.
  - **24 archivos** hacen `vi.mock('@/api/auth.js', () => ({ iniciarSesion, cerrarSesion, … }))` con una lista fija de funciones.
  - **Ninguno** simula `@/api/cliente.js`.

## 5. Diseño

### 5.1 `api/sesion.js`: la sesión en memoria
- `{ token, usuario }` vive en una variable del módulo. **Se conservan los nombres** (`guardarSesion`, `leerSesion`, `borrarSesion`, `leerTokenGuardado`, `leerVencimiento`) para tocar poco a quienes los usan, incluidas las 27 pruebas.
- Al cargar el módulo se borra la clave vieja `sircova.sesion` de `sessionStorage`, si existe. Quedaría de quienes usaron la versión anterior.
- Una función nueva para la caché, `leerSid()`, que lee el `sid` del payload, como ya hace `leerVencimiento` con el `exp`.

### 5.2 `refrescar()` va en `api/cliente.js`, no en `api/auth.js`
- **El motivo son las pruebas:** las 24 que simulan `@/api/auth.js` lo hacen con una lista fija. Si el proveedor importara `refrescar` de ahí, Vitest fallaría en todas con «No "refrescar" export is defined on the mock», el mismo problema que la nota del 2026-10-28 describe para `obtenerPerfil`. Nadie simula `cliente.js`.
- `refrescar()` hace `POST /auth/refrescar` con `credentials: 'include'` y **una sola promesa compartida**: si se llama mientras otra está en curso, devuelve la misma. Así se cubren:
  - varias peticiones que reciben `SESION_VENCIDA` a la vez;
  - el doble efecto de `<StrictMode>` en desarrollo;
  - la renovación programada que coincide con un reintento.
- Si responde 200, guarda la sesión nueva (`guardarSesion`).

### 5.3 `solicitar` con la cookie y el reintento
- `credentials: 'include'` en **todas** las peticiones. El navegador solo manda la cookie a `/api/v1/auth` por su `Path`, así que en el resto no cambia nada. Es más simple que decidir por ruta.
- **Ante un 401 `SESION_VENCIDA`:**
  - si el token guardado ya no es el que se mandó (otra petición ya renovó), repite la petición con el actual;
  - si no, espera `refrescar()` y repite **una sola vez**;
  - si el refresco falla, llama a `alPerderSesion` con **el error del refresco** (su `mensaje` dice por qué, por ejemplo `JORNADA_TERMINADA`).
- **No reintenta** ante otros 401, ni cuando falla la propia llamada a `/auth/refrescar` o a `/auth/login`. Así no entra en un bucle.
- La regla de hoy se mantiene: un 401 que llega cuando el token guardado ya no es el que se mandó no cierra la sesión actual.

### 5.4 `ProveedorSesion.jsx`
- **Al montar:**
  - si ya hay sesión en memoria, la usa. Es lo que hacen las pruebas con `guardarSesion` antes de montar, y por eso esas 27 no cambian.
  - si no hay sesión en memoria, queda en estado **`cargando`** y llama a `refrescar()`:
    - con 200, guarda la sesión;
    - con 401 `NO_AUTENTICADO`, queda sin sesión y **sin aviso** (es una visita normal al login);
    - con otro 401, queda sin sesión **con el `mensaje` como aviso** (por ejemplo, quien vuelve a la pestaña después de que otra persona entró con su cuenta, o después de la jornada);
    - con un error de red, queda sin sesión y avisa que no se pudo conectar.
- **Renovación programada:**
  - en `revisar()` (cada 15 s), cuando faltan **5 min** para el `exp` del JWT, llama a `refrescar()` en vez de cerrar con `AVISO_VENCIDA`;
  - si el refresco falla con 401, cierra con su `mensaje`;
  - se mantiene la comparación de horas, porque el navegador retrasa los temporizadores de las pestañas ocultas.
- **Latido contra la inactividad del servidor:** el backend cuenta 30 min **sin peticiones**, y el frontend cuenta 30 min **sin actividad del usuario**. Si alguien llena el formulario de captura durante 35 min sin guardar, el frontend lo ve activo pero el servidor no, y al guardar recibiría 401 `SESION_INACTIVA` y perdería lo escrito. Para evitarlo:
  - si hubo actividad del usuario y no hubo ninguna petición en los últimos **10 min**, el proveedor llama a `refrescar()`, que actualiza `ultimo_uso` en el servidor;
  - `solicitar` anota la hora de la última petición.
- **Inactividad del frontend:** sin cambios. A los 30 min llama a `logout` con `INACTIVIDAD` y muestra el aviso.
- **`cerrar()`:** igual que hoy. El `logout` ya manda la cookie (5.3), así que funciona aunque el JWT haya vencido.
- **`terminarTrasCambioContrasena()` se reemplaza** por `actualizarTrasCambioContrasena()` (ver 5.7).
- **El aviso del 403 `CAMBIO_CONTRASENA_REQUERIDO`:** se mantiene, como respaldo. Después de un restablecimiento el backend ya responde antes el 401 `CONTRASENA_RESTABLECIDA`, con el mismo texto.
- **Los permisos:** cada renovación trae los permisos actuales, así que el menú se actualiza solo si cambiaron.

### 5.5 `RutaProtegida.jsx`, `App.jsx` y la pantalla de carga
- **Mientras el proveedor está `cargando`:**
  - `RutaProtegida`, la ruta `/login` y la ruta comodín **no redirigen**;
  - se muestra una pantalla de carga con `FondoMarca` + `MarcaSircova` y la `barra-carga`.
- Sin esto, recargar `/registro?periodo=…` mandaría al login o a `/inicio` un instante antes de recuperar la sesión, y se perdería la dirección.
- Después de recuperar la sesión se queda en la ruta pedida. Si `debeCambiarContrasena` es `true`, va al cambio obligatorio, como hoy.
- La espera es de una consulta a Aiven y suele durar menos de un segundo. Si Aiven está apagado (plan gratuito), la espera llega a los 30 s de `ESPERA_MAXIMA_MS` y termina en el login con el aviso de conexión.

### 5.6 `api/cache.js`
- La entrada de la caché pasa a ser **del `sid`** (`leerSid()`), no del token.
- Una renovación conserva la caché, y otra sesión (otro login u otra cuenta) la descarta, como hoy.
- Cambia el caso de `cache.test.js` que hoy compara tokens.

### 5.7 Cambio de la propia contraseña (`PaginaCambiarContrasena.jsx`)
El equipo decidió que **la sesión se mantiene**.

- **Si se deja como hoy (volver al login sin logout),** la cookie seguiría viva y una recarga recuperaría la sesión: sería incoherente.
- **Cambio voluntario** (desde el menú de la cuenta): después del 204, `toast.success('Contraseña cambiada.')` y vuelve a `/inicio`. Esa es la acción que hoy hace «Cancelar»; el spec puede elegir volver a la pantalla anterior.
- **Cambio obligatorio** (contraseña temporal): después del 204 llama a `refrescar()`, que trae `debeCambiarContrasena: false`. Con eso, `App` deja de mostrar la pantalla sola y va a `/inicio` dentro del `Layout`. Si `refrescar` falla, cierra la sesión con el `mensaje`.
- **El texto `AVISO_CAMBIO_CONTRASENA` del login ya no se usa.**
- **Cambian dos pruebas de `PaginaCambiarContrasena.test.jsx`:** «un envío válido cambia la contraseña, cierra la sesión sin logout…» pasa a comprobar el toast y que la sesión sigue. Se agrega el caso del cambio obligatorio.

### 5.8 Varias pestañas
- Comparten la cookie, así que una pestaña nueva recupera la sesión con `refrescar` sin pedir el login.
- Si dos pestañas renuevan al mismo tiempo, el backend acepta el refresh token anterior durante 30 s.
  - **Ejemplo:** las pestañas A y B renuevan a la vez con `R1`. A recibe `R2`, y B, que mandó `R1` un instante después, igual recibe su JWT.
- Cada pestaña programa su propia renovación con su propio JWT; todas comparten el `sid`.
- Si se cierra sesión en una pestaña, las otras se enteran en su siguiente petición (401 `SESION_CERRADA`) y vuelven al login con el mensaje.

## 6. Pruebas

**`preparar-pruebas.js`:**
- **`borrarSesion()` en el `afterEach`**, junto a `vaciarCache()`. La sesión en memoria sobrevive entre las pruebas de un mismo archivo; `sessionStorage.clear()` ya no la borra.
  - Los `sessionStorage.clear()` de los 27 archivos quedan sin efecto. Se pueden dejar o quitar en el mismo paso. El spec decide, pero quitarlos toca 27 archivos y choca más con otras ramas.
- **El `fetch` falso responde 401 `NO_AUTENTICADO` a `/auth/refrescar`** y deja pendiente todo lo demás, como hoy.
  - Sin esto, una prueba que monta la app sin sesión (las del login, `RutaProtegida` sin sesión, el cierre de sesión del `Layout`) quedaría para siempre en `cargando`.
  - Las pruebas que usan su propio `fetch` (`vi.stubGlobal`) no cambian.

**Lo que cambia en las pruebas existentes** (lo que comprueba cada caso no cambia):
- Las que miran `sessionStorage.getItem('sircova.sesion')` pasan a mirar `leerSesion()`:
  - `sesion.test.js`, `ProveedorSesion.test.jsx`, `cliente.test.js` y `cache.test.js`;
  - `Layout.test.jsx` (cerrar sesión);
  - `PaginaLogin.test.jsx` (login correcto, avisos);
  - `PaginaCambiarContrasena.test.jsx`.
- `PaginaUsuarios.test.jsx` y `PaginaRegistrarPersonal.test.jsx` comprueban que la contraseña generada no está en `sessionStorage`. Siguen valiendo, y conviene agregar que tampoco está en la sesión en memoria.
- `ProveedorSesion.test.jsx`: «al llegar al vencimiento del token cierra la sesión sin llamar a la API» pasa a «renueva cinco minutos antes del vencimiento».

**Pruebas nuevas:**
- **`cliente.test.js`**, con `fetch` simulado:
  - un 401 `SESION_VENCIDA` renueva y repite;
  - dos peticiones a la vez hacen **un solo** refresco;
  - si el token ya cambió, repite sin renovar;
  - un refresco que falla no repite y llama a `alPerderSesion` con su error;
  - otro 401 no intenta renovar;
  - toda petición va con `credentials: 'include'`.
- **`ProveedorSesion.test.jsx`**, con temporizadores falsos:
  - el arranque con refresco correcto, con 401 `NO_AUTENTICADO` (sin aviso) y con otro 401 (con el aviso);
  - la renovación programada;
  - el latido (con actividad y sin peticiones durante 10 min llama a `refrescar`; sin actividad, no);
  - con la sesión en memoria, no llama a `refrescar` al montar.
- **`RutaProtegida.test.jsx`:** mientras carga no redirige; al recuperar la sesión, se queda en la ruta pedida.
- **`PaginaCambiarContrasena.test.jsx`:** los dos casos de 5.7.

## 7. Plan tentativo (pasos del spec)

1. **Sesión en memoria y preparación de pruebas.** `api/sesion.js` (con `leerSid` y la limpieza de la clave vieja) y `preparar-pruebas.js` (`borrarSesion` y el 401 de `/auth/refrescar`). Las pruebas que miran `sessionStorage` pasan a `leerSesion()`.

   Comprobación: `npm test` del frontend pasa completo **sin otros cambios**. Así se ve que el cambio de almacén no rompe nada antes de agregar comportamiento.

2. **Cliente.** `credentials: 'include'`, `refrescar()` con la promesa compartida, el reintento ante `SESION_VENCIDA` y la hora de la última petición. La caché por `sid`. Pruebas en `cliente.test.js` y `cache.test.js`.
3. **Proveedor y rutas.** El arranque con `cargando`, la pantalla de carga, la renovación programada y el latido. Pruebas en `ProveedorSesion.test.jsx` y `RutaProtegida.test.jsx`.
4. **Cambio de la propia contraseña.** `actualizarTrasCambioContrasena`, el toast y el cambio obligatorio con `refrescar`. Pruebas en `PaginaCambiarContrasena.test.jsx`.
5. **Verificación manual y documentación** (sección 8).

## 8. Verificación final (sección 8 de `AGENTS.md`)

1. La app arranca con Vite y `npm test` del frontend pasa completo. Si la máquina está cargada y fallan por tiempo `PaginaUsuarios`, `PaginaEditarUsuario` o `PaginaCambiarContrasena`, se repiten solas (nota del 2026-10-22).
2. Manual, con Playwright contra la API real (la persona inicia sesión a mano):
   - **la cookie llega al navegador:** después del login, `sircova_refresh` aparece en las herramientas del navegador como `HttpOnly`, `Secure` y `SameSite=Strict` en `http://localhost`. Es la comprobación de `Secure` en `localhost` que el SPEC 27 dejó pendiente; si el navegador la rechaza, se agrega la variable de desarrollo que prevé ese spec;
   - `sessionStorage` queda vacío;
   - recargar `/registro?periodo=…` no pide el login y se queda en esa dirección;
   - abrir una segunda pestaña no pide el login, y la primera sigue funcionando;
   - iniciar sesión en otro navegador: el primero vuelve al login con «Se inició sesión con su cuenta en otro equipo…»;
   - con `JWT_EXPIRACION=3m` en el `backend/.env` local, la sesión se renueva sola y no se cierra;
   - con `SESION_DURACION_MAXIMA` corta, aparece el aviso de jornada terminada. Con `SESION_INACTIVIDAD` corta, no aparece mientras se escribe en el formulario de captura (latido);
   - cambiar la contraseña desde el menú: toast y la sesión sigue. Entrar con una contraseña temporal y cambiarla: llega a `/inicio` sin volver a iniciar sesión;
   - cerrar sesión y comprobar que una recarga ya no la recupera.
3. Actualizar el «Avance» de HU-02 (falta el frontend; ya no) y agregar a `CLAUDE.md`:
   - el JWT vive en memoria y la sesión se recupera con `refrescar` (de `cliente.js`, no de `auth.js`);
   - el `fetch` falso de las pruebas responde 401 a `/auth/refrescar`;
   - la caché es por `sid`;
   - el latido.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Las 24 pruebas que simulan `@/api/auth.js` fallan por la función nueva | `refrescar` va en `cliente.js`, que nadie simula |
| Las pruebas sin sesión quedan para siempre en `cargando` | El `fetch` falso responde 401 a `/auth/refrescar` |
| Un bucle de refrescos si la cookie no viaja | Un solo reintento por petición; el fallo de `refrescar` o `login` nunca se reintenta |
| `<StrictMode>` llama dos veces al refresco del arranque | La promesa compartida de `refrescar()`; aun sin ella, el margen de 30 s del backend lo aceptaría |
| Se pierde lo escrito en un formulario largo por la inactividad del servidor | El latido cada 10 min con actividad |
| El navegador rechaza la cookie `Secure` en `http://localhost` | Se comprueba primero en la verificación manual; el SPEC 27 prevé una variable solo para desarrollo |
| Aiven apagado deja la pantalla de carga hasta 30 s | `ESPERA_MAXIMA_MS` la corta y el login muestra el aviso de conexión (nota de Aiven en la memoria del equipo) |
| La cookie `SameSite=Strict` no viaja si la API se despliega en otro dominio | El despliegue debe tener el frontend y la API en el mismo sitio (el mismo dominio o subdominios). Va como nota para el sprint de Docker |
| Las pestañas ocultas retrasan los temporizadores | Se mantiene la comparación de horas; el reintento ante `SESION_VENCIDA` cubre lo que se escape |
| Correr las pruebas del backend cierra la sesión del navegador del usuario de prueba | Ya está en las notas del SPEC 27; para la verificación manual, usar otra cuenta mientras corren |

## 10. Fuera de alcance

- Cambios del backend (el SPEC 27 ya está integrado).
- Avisar a las otras pestañas en el mismo instante en que se cierra la sesión (`BroadcastChannel`); se enteran en su siguiente petición.
- Una pantalla de sesiones abiertas, o mostrar en «Mi perfil» cuándo vence la jornada.
- Conservar lo escrito en un formulario cuando la sesión se pierde por otra causa (reemplazada, restablecida).
- Quitar los `sessionStorage.clear()` de las pruebas, si el spec decide dejarlos.
- `express.json({ inflate: false })` y la actualización de Node.js (hotfix aparte).
