# SPEC 03 — Cerrar sesión y expiración de la sesión

> **Estado:** Implementado
> **Historia:** HU-02 (backend y frontend en un solo spec)
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-19
> **Objetivo:** `POST /api/v1/auth/logout` registra el cierre de sesión en la bitácora, y el frontend cierra la sesión con el botón, tras 30 minutos de inactividad, al vencer el JWT o ante cualquier 401 de una petición con token, y avisa del motivo en la pantalla de inicio de sesión.

## Por qué existe este spec

HU-01 se dividió en dos specs porque el frontend no existía y el SPEC 02 tuvo que crear todo el proyecto de React. HU-02 es más chica (2 SP) y reutiliza lo que ya está: el middleware `autenticar` y `registrarBitacora` del SPEC 01, y el cliente de la API, `ProveedorSesion` y la página `/inicio` del SPEC 02. Por eso va en un solo spec, en el orden contrato → endpoint → pantalla.

La "barra de navegación" de la historia todavía no existe (llega con HU-11). El botón "Cerrar sesión" sigue en la página `/inicio` provisional; HU-11 lo moverá a la barra.

## Alcance

**Entra:**

- Contrato de `POST /auth/logout` en `backend/openapi.yaml` antes de programar.
- `POST /api/v1/auth/logout` protegido con `autenticar`, con un `motivo` opcional (`MANUAL` por defecto o `INACTIVIDAD`), que responde 204.
- Fila `LOGOUT` en `bitacora` con el motivo, la IP y el agente de usuario.
- Pruebas de integración del endpoint contra las bases de prueba.
- Botón "Cerrar sesión" de `/inicio` conectado al endpoint.
- Cierre por inactividad en el frontend: 30 minutos sin actividad del usuario.
- Cierre en el frontend al llegar al `exp` del JWT, sin esperar a una petición.
- Manejo global del 401: si una petición con token responde 401, se cierra la sesión.
- Aviso informativo en `/login` cuando la sesión se cerró sola.
- Pruebas del frontend con Vitest y Testing Library.
- Actualizar el avance de HU-02 en `docs/SPECS/HISTORIAS_DE_USUARIO.md` y marcar sus criterios.

**Fuera de alcance (para otros specs):**

- Revocar el token en el backend (lista de revocados). Exige una tabla nueva en `backend/db/`.
- Diálogo de aviso antes del cierre por inactividad ("Seguir conectado").
- Renovar el token mientras el usuario está activo (tokens de renovación).
- Barra de navegación, menú y layout (HU-11).
- `GET /auth/yo`.
- Sincronizar el cierre entre pestañas. Con `sessionStorage`, cada pestaña ya tiene su propia sesión.
- Cambiar `JWT_EXPIRACION` o el contenido del token.

## Modelo de datos

Este spec **no cambia el modelo de datos**: no hay tablas, columnas ni colecciones nuevas. Usa `bitacora` del script `01_modelo_relacional_mysql.sql` (v0.8) a través de `registrarBitacora`.

### Backend

**Petición** `POST /api/v1/auth/logout`, con `Authorization: Bearer <token>`. El cuerpo es opcional:

```json
{ "motivo": "INACTIVIDAD" }
```

- Sin cuerpo, o sin `motivo`, se registra `MANUAL`.
- `motivo` solo admite `MANUAL` o `INACTIVIDAD`.

**Respuestas:**

| HTTP | `codigo` | `mensaje` | Cuándo |
|---|---|---|---|
| 204 | — | — | Cierre registrado |
| 400 | `ENTRADA_INVALIDA` | El motivo del cierre de sesión no es válido. | `motivo` presente y distinto de `MANUAL` o `INACTIVIDAD` |
| 401 | `NO_AUTENTICADO` | Debe iniciar sesión. | Sin token, o token mal formado o con otra firma (middleware) |
| 401 | `SESION_VENCIDA` | Su sesión venció; inicie sesión de nuevo. | Token vencido (middleware) |

En el contrato, la petición usa la seguridad global `bearerAuth`, el esquema nuevo `CierreSesionEntrada` (`motivo`: enum `MANUAL`, `INACTIVIDAD`) y las respuestas comunes `EntradaInvalida` y `NoAutenticado`.

**Fila de `bitacora`** (una por cierre):

| `modulo` | `accion` | `entidad` | `usuario_id` | `entidad_id` | `valores_nuevos` | `ip_origen`, `agente_usuario` |
|---|---|---|---|---|---|---|
| `USUARIOS` | `LOGOUT` | `usuario` | id del token | id del token | `{ "motivo": "MANUAL" \| "INACTIVIDAD" }` | de la petición |

Con un 400 o un 401 no se escribe ninguna fila. El endpoint no consulta ni modifica `usuario`: el token sigue siendo válido hasta su `exp`, pero el frontend ya lo borró.

### Frontend

**Constantes** (en `ProveedorSesion.jsx`):

- `MINUTOS_INACTIVIDAD = 30`
- `SEGUNDOS_REVISION = 15`: cada cuánto se revisan la inactividad y el vencimiento.

**Actividad del usuario:** los eventos `mousemove`, `pointerdown`, `keydown`, `wheel`, `touchstart` y `scroll` en `window` actualizan la hora de la última actividad. Las peticiones a la API no cuentan como actividad.

**Formas de cerrar la sesión:**

| Caso | Llama a `POST /auth/logout` | Aviso en `/login` |
|---|---|---|
| Botón "Cerrar sesión" | Sí, `motivo: MANUAL` | Ninguno |
| 30 min sin actividad | Sí, `motivo: INACTIVIDAD` | Su sesión se cerró por inactividad. Inicie sesión de nuevo. |
| El reloj llega al `exp` del JWT | No (el token ya venció) | Su sesión venció; inicie sesión de nuevo. |
| Una petición con token responde 401 | No | El `mensaje` del backend, tal cual |

En los cuatro casos, la sesión local se borra en el momento, sin esperar la respuesta de `POST /auth/logout`. Si esa llamada falla (sin conexión, 401 o 5xx), el error se ignora.

**Manejo global del 401** (en `src/api/cliente.js`):

- `alPerderSesion(manejador)` registra la función que se llama cuando la sesión deja de ser válida, y devuelve la función para quitar el registro. `ProveedorSesion` la registra al montar.
- Si una respuesta es 401, la petición llevaba token y en `sessionStorage` sigue guardado ese mismo token, `solicitar` llama al manejador con el `ErrorApi` y después lo lanza como siempre.
- `POST /auth/login` no lleva token, así que su 401 (`CREDENCIALES_INVALIDAS`) no cierra nada.
- Si la sesión ya se borró (por ejemplo, el `POST /auth/logout` de un cierre manual responde 401), no se llama al manejador.

**Contexto de sesión** (`useSesion()`):

```js
{
  sesion,              // igual que en el SPEC 02
  aviso,               // texto del aviso para /login, o null
  iniciar(respuesta),  // igual que en el SPEC 02; además borra el aviso
  cerrar(),            // cierre manual: llama a POST /auth/logout con MANUAL y borra la sesión
}
```

El aviso vive en el estado de React: si el usuario recarga `/login`, desaparece.

**Archivos que aparecen o cambian:**

```
backend/
├── openapi.yaml                          ← /auth/logout y CierreSesionEntrada
├── src/modulos/auth/
│   ├── auth.routes.js                    ← POST /logout con autenticar
│   ├── auth.controller.js                ← logout
│   └── auth.service.js                   ← cerrarSesion
└── tests/auth.logout.test.js             ← nuevo
frontend/src/
├── api/
│   ├── auth.js                           ← cerrarSesion(motivo)
│   ├── cliente.js                        ← alPerderSesion y aviso del 401
│   ├── cliente.test.js                   ← nuevo
│   └── sesion.js                         ← leerVencimiento(token)
├── componentes/
│   ├── ProveedorSesion.jsx               ← cerrar(), aviso, inactividad y vencimiento
│   └── ProveedorSesion.test.jsx          ← nuevo
└── paginas/
    ├── inicio/PaginaInicio.jsx           ← botón con el cierre nuevo
    ├── inicio/PaginaInicio.test.jsx      ← nuevo
    ├── login/PaginaLogin.jsx             ← alerta del aviso
    └── login/PaginaLogin.test.jsx        ← casos del aviso
docs/SPECS/HISTORIAS_DE_USUARIO.md        ← avance y criterios de HU-02
```

## Plan de implementación

1. **Contrato.** Actualizar `POST /auth/logout` en `backend/openapi.yaml`: cuerpo opcional `CierreSesionEntrada`, respuestas 204, 400 (`EntradaInvalida`, con el ejemplo del motivo) y 401 (`NoAutenticado`). Comprobación: `/api/docs` muestra el endpoint con el candado de `bearerAuth` y sus tres respuestas.
2. **Endpoint.** Crear `cerrarSesion(usuario, datos, contexto)` en `auth.service.js`. Valida el `motivo` y escribe la fila `LOGOUT` con `registrarBitacora`, usando el pool como conexión porque es una sola escritura. Agregar `logout` en `auth.controller.js`, que pasa `req.usuario`, `req.body ?? {}`, la IP y el agente y responde 204, y montar `router.post('/logout', autenticar, authController.logout)`. Pruebas en `tests/auth.logout.test.js`, con un token del usuario de prueba obtenido con `POST /auth/login`:
   - sin cuerpo → 204 y una fila `LOGOUT` con `motivo: MANUAL`, el `usuario_id` del token, IP y agente;
   - con `motivo: INACTIVIDAD` → 204 y una fila con ese motivo;
   - con `motivo: OTRO` → 400 `ENTRADA_INVALIDA` y ninguna fila nueva;
   - sin token → 401 `NO_AUTENTICADO` y ninguna fila nueva;
   - con un token vencido (firmado en la prueba con `JWT_SECRET` y `expiresIn` negativo) → 401 `SESION_VENCIDA`.
   Comprobación: `npm test` del backend pasa.
3. **Cliente de la API.** Agregar `cerrarSesion(motivo)` en `src/api/auth.js`, `leerVencimiento(token)` en `src/api/sesion.js` (devuelve `exp * 1000`, o `null` si el token está mal formado) y `alPerderSesion` en `src/api/cliente.js`, con el aviso del 401 según el "Modelo de datos". Pruebas en `src/api/cliente.test.js`, con `fetch` reemplazado por `vi.fn()`:
   - un 401 con sesión guardada llama al manejador con el `ErrorApi` y lo lanza;
   - un 401 sin sesión guardada (como el de `/auth/login`) no llama al manejador;
   - un 401 cuando el token guardado ya no es el que se envió no llama al manejador;
   - un 403 o un 422 no llaman al manejador;
   - la función que devuelve `alPerderSesion` quita el registro.
4. **Proveedor de sesión.** En `ProveedorSesion.jsx`:
   - agregar `aviso`;
   - `cerrar()`: llama a `cerrarSesion('MANUAL')` sin esperar la respuesta, ignora sus errores, borra la sesión y deja `aviso` en `null`;
   - registrar `alPerderSesion`, que borra la sesión y pone el `mensaje` del error como aviso;
   - mientras haya sesión, escuchar los eventos de actividad y revisar cada `SEGUNDOS_REVISION`: si pasaron `MINUTOS_INACTIVIDAD` desde la última actividad, llamar a `cerrarSesion('INACTIVIDAD')` y cerrar con el aviso de inactividad; si se llegó al vencimiento del token, cerrar sin llamar a la API y con el aviso de sesión vencida. Al cerrar la sesión o desmontar, se quitan los eventos y el intervalo.
   Pruebas en `ProveedorSesion.test.jsx`, con `vi.useFakeTimers()`, `vi.mock` sobre `@/api/auth.js` y un token de prueba con `exp` controlado:
   - tras 30 min sin eventos, la sesión se borra, `cerrarSesion` se llama con `INACTIVIDAD` y `aviso` es el texto de inactividad;
   - un `keydown` a los 29 min reinicia la cuenta: a los 30 min sigue abierta y a los 59 min se cierra;
   - al llegar al `exp`, la sesión se borra, `cerrarSesion` no se llama y `aviso` es el texto de sesión vencida;
   - el manejador del 401 borra la sesión y pone el `mensaje` del error como aviso;
   - `iniciar()` borra el aviso.
   Comprobación: `npm test` del frontend pasa.
5. **Pantallas.** `PaginaInicio.jsx` usa el nuevo `cerrar()` y navega a `/login`. `PaginaLogin.jsx` muestra `aviso` en un `Alert` informativo, con los colores del tema y no con la variante `destructive`, encima del formulario. El aviso se oculta al enviar el formulario. Pruebas:
   - `PaginaInicio.test.jsx`: "Cerrar sesión" llama a `cerrarSesion` con `MANUAL`, borra `sircova.sesion` y muestra `/login` sin aviso;
   - `PaginaLogin.test.jsx`: con un aviso en el contexto se muestra la alerta informativa; al enviar el formulario desaparece.
6. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y el frontend en Vite:
   - el botón lleva a `/login` y deja la fila `LOGOUT` (`MANUAL`) en `bitacora`;
   - con `MINUTOS_INACTIVIDAD` bajado temporalmente a 1, la sesión se cierra sola, aparece el aviso y queda la fila `INACTIVIDAD`; luego se restaura el valor a 30;
   - con `JWT_EXPIRACION=2m` temporal en `backend/.env`, la sesión se cierra a los 2 minutos con el aviso de sesión vencida; luego se restaura `2h`.
   Actualizar el "Avance" de HU-02 en `HISTORIAS_DE_USUARIO.md` y marcar sus tres criterios cuando se cumplan los de este spec.

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta `POST /auth/logout` con `bearerAuth`, el cuerpo opcional `CierreSesionEntrada` y las respuestas 204, 400 y 401, y `/api/docs` las muestra.
- [x] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba.
- [x] `POST /auth/logout` con un token válido y sin cuerpo responde 204 y deja una fila `LOGOUT` con `motivo: MANUAL`, el `usuario_id` del token, IP y agente de usuario.
- [x] `POST /auth/logout` con `motivo: INACTIVIDAD` deja la fila con ese motivo.
- [x] Un `motivo` distinto de `MANUAL` o `INACTIVIDAD` responde 400 `ENTRADA_INVALIDA` y no escribe en la bitácora.
- [x] Sin token, `POST /auth/logout` responde 401 `NO_AUTENTICADO`; con un token vencido responde 401 `SESION_VENCIDA`. En ningún caso escribe en la bitácora.
- [x] El inicio de sesión sigue dejando su fila `LOGIN_OK` (SPEC 01), así que el inicio y el cierre quedan en la bitácora.
- [x] "Cerrar sesión" borra `sircova.sesion`, lleva a `/login` sin aviso y deja la fila `LOGOUT` (`MANUAL`).
- [x] Tras 30 minutos sin actividad, la sesión se cierra, `/login` muestra "Su sesión se cerró por inactividad. Inicie sesión de nuevo." y queda la fila `LOGOUT` (`INACTIVIDAD`).
- [x] Mover el mouse o usar el teclado reinicia la cuenta de inactividad.
- [x] Al llegar al `exp` del JWT, la sesión se cierra sin ninguna petición y `/login` muestra "Su sesión venció; inicie sesión de nuevo.".
- [x] Si una petición con token responde 401, la sesión se borra y `/login` muestra el `mensaje` del backend.
- [x] Un 401 de `POST /auth/login` (credenciales incorrectas) no cambia nada de la sesión y sigue mostrando su mensaje en la alerta de error.
- [x] El aviso de `/login` usa los colores del tema, no la variante `destructive`, y desaparece al enviar el formulario.
- [x] Ningún componente llama a `fetch` directamente ni tiene colores escritos a mano.
- [x] HU-02 en `HISTORIAS_DE_USUARIO.md` tiene sus tres criterios marcados y su avance actualizado.

## Decisiones

- **Sí:** un solo spec para backend y frontend. HU-01 se dividió porque había que crear el proyecto de React; HU-02 vale 2 SP y reutiliza la base existente.
- **No:** dos specs (backend y frontend). Duplicaba ramas y PRs para un endpoint pequeño.
- **Sí:** cierre por inactividad en el frontend, a los 30 minutos sin actividad. El JWT de 2 h sigue siendo el límite máximo de la sesión.
- **No:** 15 minutos. Es demasiado corto para quien captura el 5C con pausas largas.
- **No:** solo el vencimiento del JWT. Cierra la sesión aunque se esté usando y no cumple "tras un tiempo de inactividad".
- **Sí:** aviso informativo en `/login` cuando la sesión se cierra sola. Usa el `Alert` que ya existe.
- **No:** diálogo con cuenta regresiva antes de cerrar. Exige agregar `Dialog` de shadcn y más estado; queda para otro spec si la DDRISS lo pide.
- **Sí:** una sola acción `LOGOUT` con `valores_nuevos.motivo` (`MANUAL` o `INACTIVIDAD`). Sigue el patrón de `LOGIN_FALLIDO` con su `motivo`.
- **No:** acciones separadas (`LOGOUT_INACTIVIDAD`). Multiplica las acciones sin ganar información.
- **Sí:** `motivo` opcional, con `MANUAL` por defecto; un valor desconocido responde 400. Así un cliente sencillo puede cerrar sin cuerpo.
- **Sí:** al llegar al `exp`, el frontend cierra la sesión por su cuenta, sin esperar a una petición. Evita dejar abierta una pantalla con datos de una sesión que ya no sirve.
- **Sí:** al vencer el token no se llama a `POST /auth/logout`, porque respondería 401. Ese cierre no deja fila en la bitácora; el `LOGIN_OK` y la duración del token bastan para reconstruirlo.
- **Sí:** cualquier 401 de una petición con token cierra la sesión, sea `SESION_VENCIDA` o `NO_AUTENTICADO`. Un token alterado o un secreto cambiado tampoco tienen arreglo sin volver a iniciar sesión.
- **Sí:** el manejador del 401 solo actúa si el token guardado es el mismo que se envió. Evita que el `POST /auth/logout` de un cierre ya hecho dispare un segundo cierre con aviso.
- **Sí:** en el aviso del 401 se muestra el `mensaje` del backend tal cual, como decidió el SPEC 02. Solo el texto de inactividad lo escribe el frontend.
- **Sí:** el frontend borra la sesión sin esperar la respuesta de `POST /auth/logout` e ignora sus errores. Cerrar sesión nunca debe fallar para el usuario, aunque no haya conexión.
- **No:** revocar el token en el backend. Exige una tabla nueva (zona protegida `backend/db/`) y una consulta en cada petición. Se acepta el mismo riesgo del SPEC 01: el token sirve hasta su `exp`, pero el frontend ya lo borró.
- **Sí:** el endpoint escribe en la bitácora con el pool, sin transacción, porque es una sola escritura.
- **Sí:** un intervalo de 15 s que compara horas, en lugar de un `setTimeout` de 30 minutos. Los navegadores retrasan los temporizadores de las pestañas en segundo plano; comparar con `Date.now()` cierra a tiempo al volver a la pestaña.
- **Sí:** las peticiones a la API no cuentan como actividad. Una pantalla que se refresca sola no debe mantener abierta una sesión abandonada.
- **Sí:** el botón "Cerrar sesión" sigue en `/inicio`. La barra de navegación es de HU-11.
- **Sí:** en `cliente.test.js`, `fetch` se reemplaza con `vi.fn()`. Es una prueba unitaria del cliente, no un servidor simulado; las pantallas se verifican contra la API real en el paso 6.
- **Sí:** el aviso vive en el estado de React, no en `sessionStorage`. No hace falta que sobreviva a una recarga.
- **Sí:** el 400 de `/auth/logout` se escribe en el propio endpoint, no con la respuesta común `EntradaInvalida`: una referencia común no admite un ejemplo propio. Igual que el 400 de `/auth/login`. Decidido durante la implementación.
- **Sí:** `leerTokenGuardado()` en `sesion.js`, que lee el token guardado sin revisar su vencimiento. `leerSesion()` borraría un token vencido mientras React aún mantiene la sesión, y el cliente no podría comparar el token enviado con el guardado. Decidido durante la implementación.
- **Sí:** los eventos de actividad se escuchan en fase de captura, porque el `scroll` de un elemento con desplazamiento propio no llega hasta `window`. Decidido durante la implementación.
- **Sí:** el aviso de `/login` usa `role="status"` en lugar de `role="alert"`: es informativo y no debe interrumpir al lector de pantalla. Lo distingue además de la alerta de error. Decidido durante la implementación.
- **Sí:** `PaginaInicio.jsx` no cambió: ya llamaba a `cerrar()` y navegaba a `/login`; el nuevo comportamiento está en `ProveedorSesion`. Decidido durante la implementación.
- **Sí:** el caso "una petición con token responde 401" se verifica con pruebas automáticas (cliente real y proveedor juntos), no a mano: la única petición con token de la app es la del cierre, y para entonces la sesión ya se borró. Se verá en uso con las pantallas que consulten la API.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un token sigue sirviendo hasta 2 h después de cerrar sesión, si alguien lo copió | Riesgo aceptado en el SPEC 01. El frontend lo borra de `sessionStorage` al cerrar; la revocación queda para otro spec. |
| El reloj del equipo del usuario está adelantado o atrasado y el cierre por `exp` ocurre antes o después | Si va atrasado, el backend responde 401 `SESION_VENCIDA` en la siguiente petición y el manejador global cierra la sesión. Si va adelantado, la sesión se cierra antes de tiempo; solo afecta a ese equipo. |
| Una pestaña en segundo plano no cierra a los 30 minutos exactos | El intervalo compara horas y cierra en la primera revisión que logra correr, a más tardar al volver a la pestaña. |
| `mousemove` se dispara muchas veces por segundo | El manejador solo guarda `Date.now()` en una referencia, sin volver a renderizar. |
| Las pruebas manuales cambian `JWT_EXPIRACION` o `MINUTOS_INACTIVIDAD` y se olvida restaurarlos | El paso 6 indica restaurarlos. Antes de abrir el PR se revisa el diff: `MINUTOS_INACTIVIDAD` debe ser 30, y `backend/.env` no se sube. |
| La bitácora de la base de prueba crece con cada corrida de pruebas | Es esperado, igual que en el SPEC 01. |

## Lo que **no** entra en este spec

- Revocación de tokens, tokens de renovación y cambios en `JWT_EXPIRACION`.
- Diálogo de aviso antes del cierre por inactividad.
- Barra de navegación, menú y layout (HU-11).
- `GET /auth/yo`.
- Sincronizar el cierre entre pestañas.

Cada uno, si se hace, va en su propio spec.
