# Propuesta para el spec de sesiones · Frontend

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo después de la asesoría de fin del sprint 2 (2026-10-28). No es el spec: el spec se escribe en `specs/NN-slug.md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** ajuste a HU-02 (cerrar sesión y expiración de la sesión).
> **Depende de:** el spec de sesiones del backend (`PROPUESTA_SESIONES_BACKEND.md`), integrado en `main`. **Se empieza cuando el compañero que ajusta el diseño del frontend termine**, para no chocar con sus cambios.
> **Rama sugerida:** `spec-NN-hu-02-sesiones-frontend`, desde `main`.
> **No toca zonas protegidas:** sin cambios en la base, los permisos ni `package.json`.

## 1. Por qué existe

El spec del backend deja listo lo siguiente:

- las sesiones guardadas en el servidor;
- una sola sesión abierta por usuario;
- la revocación;
- el refresh token en una cookie `HttpOnly`;
- la jornada de 8 h.

El frontend actual sigue funcionando sin cambios, pero no aprovecha nada de eso:

- **Cierra la sesión a las 2 h** (cuando vence el JWT), en lugar de renovarla hasta completar la jornada.
- **Guarda el JWT en `sessionStorage`**, donde cualquier script de la página lo puede leer.
- **Cada pestaña nueva pide iniciar sesión.** `sessionStorage` es distinto en cada pestaña. Con la regla de una sola sesión, ese nuevo inicio **cierra la sesión de la primera pestaña**.
- **Muestra el mensaje del 401 tal como llega**, sin distinguir los casos.

## 2. Decisiones del equipo (2026-10-28)

| Tema | Decisión |
|---|---|
| Dónde vive el JWT | **En memoria** (una variable del módulo de sesión), no en `sessionStorage` |
| Refresh token | En la cookie `HttpOnly` que pone el backend; el frontend no la lee ni la escribe |
| Al recargar o abrir otra pestaña | Se llama a `POST /auth/refrescar`; si responde 200, se sigue sin pedir el login |
| Duración | El JWT dura 2 h y se renueva antes de vencer, hasta la jornada de 8 h |
| Inactividad | Se mantienen los 30 min del frontend (`MINUTOS_INACTIVIDAD`); el backend también la controla |
| Cambio de la propia contraseña | La sesión se mantiene, como hoy (SPEC 09) |

**Por qué la cookie `HttpOnly` y no `sessionStorage`:** el JavaScript de la página puede leer `sessionStorage`. Si algún día entra un script malicioso (XSS), puede llevarse el token y usarlo desde otro equipo. Una cookie `HttpOnly` no la ve ningún script; el navegador la manda solo a `/api/v1/auth`. El JWT sigue en memoria porque cada petición lo necesita, pero dura 2 h y el servidor lo puede revocar. La credencial que dura toda la jornada es la que queda protegida. `HttpOnly` no evita el XSS: mientras la página está abierta, un script malicioso todavía puede hacer peticiones. Lo que sí evita es que se robe la sesión para usarla después.

## 3. Lo que ya existe y hay que tener en cuenta

- `src/api/sesion.js`: `guardarSesion`, `leerSesion`, `borrarSesion`, `leerTokenGuardado` y `leerVencimiento`, todos sobre `sessionStorage` (clave `sircova.sesion`).
- `src/api/cliente.js`: el único cliente de la API. Ante un 401, o un 403 `CAMBIO_CONTRASENA_REQUERIDO`, llama a `alPerderSesion`.
- `src/componentes/ProveedorSesion.jsx`: cada `SEGUNDOS_REVISION` compara la hora con el vencimiento del JWT (cierra con `AVISO_VENCIDA`) y con la última actividad (cierra por `INACTIVIDAD`). Compara horas en vez de usar un solo temporizador, porque el navegador retrasa los temporizadores de las pestañas ocultas.
- `src/componentes/RutaProtegida.jsx`: sin sesión, manda a `/login`.
- `src/paginas/login/PaginaLogin.jsx`: muestra el `aviso` del proveedor en un `Alert`.
- `frontend/.env.example`: `VITE_API_URL=http://localhost:3000/api/v1`. Vite y la API son el mismo sitio (el puerto no cuenta), así que la cookie `SameSite=Strict` sí viaja.
- Pruebas que usan `sessionStorage` o la sesión: `sesion.test.js`, `cliente.test.js`, `ProveedorSesion.test.jsx`, `RutaProtegida.test.jsx`, `PaginaLogin.test.jsx` y `PaginaInicio.test.jsx`. Se adaptan **sin cambiar lo que comprueba cada caso**.

## 4. Diseño

### 4.1 `src/api/sesion.js`
- La sesión `{ token, usuario }` vive en una variable del módulo.
- Las funciones conservan sus nombres para tocar poco a quienes las usan.
- Al cargar, se borra la clave vieja `sircova.sesion` de `sessionStorage`, si existe.

### 4.2 `src/api/cliente.js`
- `credentials: 'include'` en las llamadas a `/auth/login`, `/auth/refrescar` y `/auth/logout`, que son las únicas a las que viaja la cookie por su `Path`.
- **Ante un 401 `SESION_VENCIDA`:**
  - llama a `refrescar` **una sola vez** y repite la petición;
  - si varias peticiones fallan al mismo tiempo, **comparten la misma promesa de refresco**;
  - si el refresco responde 401, llama a `alPerderSesion` con el código del refresco.
- **No reintenta** con los otros 401, ni cuando falla la propia llamada a `refrescar`. Así no entra en un bucle.

### 4.3 `ProveedorSesion.jsx`
- **Al montar:** estado `cargando` y llamada a `refrescar`.
  - Si responde 200, guarda la sesión.
  - Si responde 401, queda sin sesión **y sin aviso** (es una visita normal al login).
- **Renovación programada:** cuando faltan unos 5 min para el `exp` del JWT, llama a `refrescar`. Se mantiene la comparación de horas en `revisar()`, que ahora renueva en vez de cerrar con `AVISO_VENCIDA`.
- **Inactividad:** sin cambios. A los 30 min llama a `logout` con `INACTIVIDAD` y muestra el aviso.
- **`cerrar()`:** llama a `logout` con la cookie. Funciona aunque el JWT ya haya vencido.

### 4.4 `RutaProtegida.jsx`
- Mientras el proveedor está `cargando`, no redirige: muestra la página vacía o un indicador. Si no, una recarga mandaría al login un instante antes de recuperar la sesión.

### 4.5 Mensajes en `/login` por código

| Código (401) | Aviso |
|---|---|
| `SESION_REEMPLAZADA` | «Se inició sesión con su cuenta en otro equipo.» |
| `SESION_INACTIVA` | El de inactividad que ya existe |
| `JORNADA_TERMINADA` | «Su jornada de sesión terminó. Inicie sesión de nuevo.» |
| `SESION_CERRADA` | El `mensaje` del backend (por ejemplo, contraseña restablecida) |
| `CUENTA_DESACTIVADA`, `SESION_DESACTUALIZADA` | El `mensaje` del backend, como hoy |
| Sin sesión al cargar | Ninguno |

Los textos finales y los nombres de los códigos se toman del spec del backend ya integrado.

### 4.6 Varias pestañas
- Comparten la cookie, así que una pestaña nueva recupera la sesión con `refrescar` sin pedir el login.
- Si dos pestañas renuevan al mismo tiempo, el backend acepta el refresh token anterior durante 30 s.
- **Ejemplo:** las pestañas A y B renuevan a la vez con `R1`. A recibe `R2`, y B, que mandó `R1` un instante después, igual recibe su JWT.
- Si se cierra sesión en una pestaña, las otras se enteran en su siguiente petición (401) y vuelven al login.

## 5. Plan tentativo (pasos del spec)

1. **`sesion.js` en memoria.** Se limpia la clave vieja. Pruebas en `sesion.test.js`.
2. **Cliente con refresco.** `refrescar()` en `src/api/auth.js`; el reintento único y la promesa compartida en `cliente.js`. Pruebas en `cliente.test.js` con `fetch` simulado:
   - un 401 `SESION_VENCIDA` renueva y repite;
   - dos peticiones a la vez hacen **un solo** refresco;
   - un refresco que falla no repite y llama a `alPerderSesion`;
   - otro 401 no intenta renovar.
3. **`ProveedorSesion` y `RutaProtegida`.** Arranque con refresco, renovación programada y estado `cargando`. Pruebas con temporizadores falsos.
4. **Mensajes en `/login`.** Pruebas por código en `PaginaLogin.test.jsx`.
5. **Verificación manual y documentación** (sección 6).

## 6. Verificación final (sección 8 de `AGENTS.md`)

1. La app arranca con Vite y `npm test` del frontend pasa completo.
2. Manual, con Playwright contra la API real (la persona inicia sesión a mano):
   - recargar la página no pide el login;
   - abrir una segunda pestaña no pide el login, y la primera sigue funcionando;
   - en las herramientas del navegador, `sessionStorage` está vacío y la cookie aparece como `HttpOnly`;
   - iniciar sesión en otro navegador: el primero vuelve al login con «Se inició sesión con su cuenta en otro equipo»;
   - acortar `JWT_EXPIRACION` a unos minutos en el `.env` local: la sesión se renueva sola y no se cierra;
   - acortar `SESION_INACTIVIDAD` o `SESION_DURACION_MAXIMA`: aparecen los avisos correctos;
   - cerrar sesión y comprobar que «Atrás» no recupera la sesión.
3. Actualizar el avance de HU-02 y agregar a `CLAUDE.md` una nota: el JWT vive en memoria y la sesión se recupera con `refrescar`.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Choques con los ajustes de diseño del compañero | Se empieza cuando él termine, desde un `main` actualizado |
| Un bucle de refrescos si la cookie no viaja | Un solo reintento por petición; el fallo de `refrescar` nunca se reintenta |
| La cookie `SameSite=Strict` no viaja si la API se despliega en otro dominio | El despliegue debe tener el frontend y la API en el mismo sitio (el mismo dominio o subdominios del mismo dominio). Va como nota para el sprint de Docker |
| Las pestañas ocultas retrasan los temporizadores | Se mantiene la comparación de horas; el reintento ante `SESION_VENCIDA` cubre lo que se escape |

## 8. Fuera de alcance

- Los cambios del backend (otro spec).
- Avisar a las otras pestañas en el mismo instante en que se cierra la sesión (`BroadcastChannel`); se enteran en su siguiente petición.
- Una pantalla de sesiones abiertas.
