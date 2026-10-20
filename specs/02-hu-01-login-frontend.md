# SPEC 02 — Inicio de sesión (frontend)

> **Estado:** Aprobado
> **Historia:** HU-01 (parte frontend; la parte backend está en el SPEC 01)
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-19
> **Objetivo:** Crear el proyecto de React y la pantalla de inicio de sesión, que consume `POST /api/v1/auth/login`, guarda la sesión en `sessionStorage` y lleva al usuario a una página `/inicio` provisional y protegida.

## Por qué existe este spec

HU-01 se dividió en dos specs. El SPEC 01 dejó lista la API (`POST /auth/login`, bloqueo, bitácora y middleware `autenticar`). Este spec cubre la otra mitad: el frontend todavía no existe (`frontend/` solo tiene `.env.example`), así que además de la pantalla crea la base del proyecto (Vite, Tailwind, shadcn, tema del MSPAS, cliente de la API y pruebas), que usarán todas las pantallas siguientes.

La pantalla inicial según el rol y el menú son HU-11. Por eso aquí `/inicio` es una página provisional que HU-11 reemplazará.

## Alcance

**Entra:**

- Proyecto de React con Vite en `frontend/`, en JavaScript (JSX), sin ESLint.
- Tailwind CSS con `@tailwindcss/vite` y shadcn/ui inicializado (`components.json`, `lib/utils.js`, alias `@`).
- Variables del tema en `src/index.css`, con los colores de la tabla de `docs/mockups/descripcion_pantallas.md` ("Implementación en React"), más `--enlace` (#2f6fa6) y las fuentes IBM Plex Sans y Mono.
- Fuentes IBM Plex Sans e IBM Plex Mono cargadas desde Google Fonts en `index.html`.
- Componentes de shadcn: Button, Input, Label y Alert.
- Cliente único de la API en `src/api/`, que toma la URL base de `VITE_API_URL`.
- Sesión en `sessionStorage` (token y usuario de la respuesta del login), que se descarta si el JWT ya venció.
- Rutas con `react-router-dom`: `/login`, `/inicio` (protegida) y redirecciones.
- Pantalla de inicio de sesión según `docs/mockups/pantallas/Login.html`, con los ajustes de la sección "Decisiones".
- Página `/inicio` provisional: saludo con el nombre, el rol y el botón "Cerrar sesión" (solo local).
- Pruebas con Vitest, Testing Library y jsdom.
- Comandos del frontend documentados en `README.md` y en `AGENTS.md` (sección 8).
- Actualizar el avance de HU-01 en `docs/SPECS/HISTORIAS_DE_USUARIO.md` y marcar sus criterios.

**Fuera de alcance (para otros specs):**

- Menú lateral, layout y pantalla inicial según el rol (HU-11).
- `POST /auth/logout`, registro del cierre de sesión en la bitácora y cierre por inactividad (HU-02).
- Manejo global del 401 `SESION_VENCIDA` en peticiones posteriores (HU-02).
- `GET /auth/yo` y cualquier cambio en el backend.
- Casilla "Recordar este equipo" y sesión en `localStorage`.
- Recuperación de contraseña (el enlace queda deshabilitado).
- Inicio de sesión con el correo institucional.
- Cambio obligatorio de contraseña (HU-03).
- Variables del tema para los estados del reporte, la escala de cobertura y el semáforo (llegan con las pantallas que las usan).
- ESLint, Prettier o cualquier otra herramienta de lint.
- Dockerfile del frontend (HU-56).

## Modelo de datos

Este spec **no cambia el modelo de datos** ni la API. Usa `POST /api/v1/auth/login` tal como lo dejó el SPEC 01 (cuerpo, respuesta 200 y códigos de error en `backend/openapi.yaml`).

**Sesión guardada** en `sessionStorage`, clave `sircova.sesion`:

```json
{
  "token": "eyJ...",
  "usuario": {
    "id": 7,
    "nombreUsuario": "jperez",
    "rol": "ADMINISTRADOR",
    "permisos": ["POBLACION_REGISTRAR"],
    "empleado": { "nombres": "Juan", "apellidos": "Pérez", "ddrissId": 1, "establecimientoId": null, "municipioId": null }
  }
}
```

- Se guarda exactamente la respuesta 200 del login; nunca la contraseña.
- Al leerla, se decodifica el payload del JWT (base64url, sin verificar la firma) y, si `exp * 1000 <= Date.now()`, se borra y se trata como sin sesión.
- Si el JSON o el token están mal formados, también se borra.

**Errores del cliente** (`ErrorApi` en `src/api/cliente.js`, con `status`, `codigo` y `mensaje`):

| Caso | `status` | `codigo` | `mensaje` que se muestra |
|---|---|---|---|
| Respuesta 4xx con el formato común | el de la respuesta | el de la respuesta | el `mensaje` del backend, tal cual |
| No se pudo conectar (fallo de `fetch`) | 0 | `SIN_CONEXION` | No se pudo conectar con el servidor. Revise su conexión e intente de nuevo. |
| Respuesta 5xx o sin el formato común | el de la respuesta | `ERROR_INESPERADO` | Ocurrió un error inesperado. Intente de nuevo. |

**Rutas:**

| Ruta | Sin sesión | Con sesión |
|---|---|---|
| `/login` | Pantalla de inicio de sesión | Redirige a `/inicio` |
| `/inicio` | Redirige a `/login` | Página provisional |
| `/` y cualquier otra | Redirige a `/inicio` (y de ahí a `/login`) | Redirige a `/inicio` |

**Archivos que aparecen o cambian:**

```
frontend/
├── package.json, package-lock.json    ← nuevos (scripts dev, build, preview, test)
├── index.html                         ← nuevo: título "SIRCOVA", link de Google Fonts
├── vite.config.js                     ← nuevo: react, tailwind, alias @, test (jsdom, globals)
├── jsconfig.json                      ← nuevo: alias @ para shadcn
├── components.json                    ← nuevo: lo genera shadcn init
├── .gitignore                         ← nuevo: node_modules, dist, .env
├── .env.example                       ← sin cambios (VITE_API_URL)
└── src/
    ├── main.jsx, App.jsx              ← App declara las rutas
    ├── index.css                      ← Tailwind y variables del tema
    ├── lib/utils.js                   ← cn (shadcn)
    ├── components/ui/                 ← button, input, label, alert (shadcn)
    ├── api/
    │   ├── cliente.js                 ← solicitar() y ErrorApi
    │   ├── auth.js                    ← iniciarSesion(nombreUsuario, contrasena)
    │   ├── sesion.js                  ← guardarSesion, leerSesion, borrarSesion
    │   └── sesion.test.js
    ├── componentes/
    │   ├── ProveedorSesion.jsx        ← contexto con sesion, iniciar() y cerrar(); hook useSesion
    │   └── RutaProtegida.jsx
    └── paginas/
        ├── login/PaginaLogin.jsx
        ├── login/PaginaLogin.test.jsx
        └── inicio/PaginaInicio.jsx
README.md                              ← comandos del frontend
AGENTS.md                              ← sección 3: cn y shadcn; sección 8: comandos del frontend
CLAUDE.md                              ← nota de contexto sobre cn
docs/SPECS/HISTORIAS_DE_USUARIO.md     ← avance y criterios de HU-01
```

## Plan de implementación

1. **Proyecto Vite.** Crear el proyecto en `frontend/` con la plantilla `react` (JavaScript) de `npm create vite`, conservando `.env.example`. Quitar ESLint, sus paquetes (`eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` y los `@types/*`) y `eslint.config.js`, y borrar el contenido de ejemplo (logos, contador, `App.css`). Dejar los scripts `dev`, `build` y `preview`. Comprobación: `npm run dev` abre una página en blanco con el título "SIRCOVA" en `http://localhost:5173`, y `package.json` solo tiene dependencias de la lista de `AGENTS.md`.
2. **Tailwind, shadcn y tema.** Instalar `tailwindcss` y `@tailwindcss/vite`, configurar el alias `@` → `src` en `vite.config.js` y `jsconfig.json`, y ejecutar `npx shadcn@latest init`. Escribir en `index.css` las variables del tema (tabla de `descripcion_pantallas.md`, `--radius: 0.5rem`, `--enlace`, `--font-sans` y `--font-mono`) y agregar el `<link>` de Google Fonts en `index.html`. Agregar Button, Input, Label y Alert con `npx shadcn@latest add`. Comprobación: un Button temporal en `App.jsx` se ve azul marino con IBM Plex Sans (se quita al terminar el paso).
3. **Pruebas.** Instalar `vitest`, `@testing-library/react` y `jsdom` como dependencias de desarrollo. Agregar a `vite.config.js` la sección `test` (`environment: 'jsdom'`, `globals: true`) y el script `"test": "vitest run"`. Comprobación: `npm test` corre (sin pruebas todavía, o con una prueba mínima que se reemplaza en el paso 4).
4. **Sesión y cliente de la API.** Crear `src/api/sesion.js`, `src/api/cliente.js` y `src/api/auth.js` según el "Modelo de datos". `solicitar(ruta, opciones)` antepone `VITE_API_URL`, envía y recibe JSON, agrega `Authorization: Bearer` si hay sesión y lanza `ErrorApi` en los casos de la tabla. Pruebas en `sesion.test.js`:
   - guardar y leer devuelven el mismo objeto;
   - un token con `exp` en el pasado da `null` y borra la clave;
   - un token o un JSON mal formado dan `null` y borran la clave;
   - `borrarSesion` elimina la clave.
5. **Rutas y sesión en la app.** Instalar `react-router-dom`. Crear `ProveedorSesion.jsx` (lee la sesión al montar y expone `sesion`, `iniciar(respuestaLogin)` y `cerrar()`), `RutaProtegida.jsx` y `PaginaInicio.jsx` (saludo "Hola, {nombres} {apellidos}", el rol y el botón "Cerrar sesión", que llama a `cerrar()` y navega a `/login`). Declarar las rutas en `App.jsx` según la tabla, con `/login` todavía como un texto temporal. Comprobación: sin sesión, abrir `/inicio` lleva a `/login`.
6. **Pantalla de inicio de sesión.** Crear `PaginaLogin.jsx` según `Login.html` y las decisiones de este spec (panel institucional a partir de `lg`, campos "Usuario" y "Contraseña", alerta, enlace deshabilitado, botón y nota). Al enviar, llama a `iniciarSesion`, guarda la sesión con `iniciar()` y navega a `/inicio`. Si hay un error, muestra la alerta con `error.mensaje`, marca los campos con `aria-invalid`, vacía la contraseña y le da el foco. Pruebas en `PaginaLogin.test.jsx`, con `vi.mock` sobre `@/api/auth.js` y la página dentro de `MemoryRouter` y `ProveedorSesion`:
   - "Ingresar" está deshabilitado si falta el usuario o la contraseña;
   - con una respuesta correcta se guarda la sesión y se muestra `/inicio`;
   - con un `ErrorApi` 401 se muestra su `mensaje` en la alerta y se puede volver a enviar;
   - con un `ErrorApi` 423 o 403 se muestra su `mensaje`;
   - con `SIN_CONEXION` se muestra el texto de falta de conexión;
   - mientras la petición está en curso, el botón dice "Ingresando…" y está deshabilitado.
7. **Documentación.** Agregar a `README.md` (sección de arranque) y a `AGENTS.md` (sección 8) los comandos del frontend: `npm install`, `npm run dev` y `npm test`, desde `frontend/`. Los del backend no se tocan. Agregar `cn` y `shadcn` a la lista de dependencias del frontend en `AGENTS.md` (sección 3), aclarando que `cn` reemplaza a `clsx` + `tailwind-merge`. Actualizar el "Avance" de HU-01 en `HISTORIAS_DE_USUARIO.md` y marcar sus cuatro criterios cuando se cumplan los de este spec.

## Criterios de aceptación

- [x] `npm install` y `npm run dev` en `frontend/` levantan la app en `http://localhost:5173`.
- [x] `npm test` en `frontend/` pasa sin desactivar ninguna prueba.
- [x] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md` (sección 3) y no contiene ESLint.
- [x] Los colores y las fuentes de la pantalla salen de las variables de `index.css`; ningún componente propio tiene colores escritos a mano.
- [x] Ninguna pantalla llama a `fetch` directamente; todas usan `src/api/`.
- [x] Con el backend levantado contra Aiven y credenciales correctas, "Ingresar" lleva a `/inicio`, que muestra el nombre, los apellidos y el rol del usuario.
- [x] Con una contraseña incorrecta o un usuario inexistente se muestra "Usuario o contraseña incorrectos." y se puede reintentar sin recargar.
- [x] Con una cuenta desactivada y su contraseña correcta se muestra "Su cuenta está desactivada; contacte al administrador.".
- [x] Tras 5 intentos fallidos se muestra el mensaje de cuenta bloqueada del backend.
- [x] Con el backend apagado se muestra "No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.".
- [x] Después de iniciar sesión, `sessionStorage` tiene la clave `sircova.sesion` con `token` y `usuario`, y en ninguna parte del almacenamiento aparece la contraseña.
- [x] Al recargar `/inicio` con una sesión vigente, la página sigue abierta sin volver a iniciar sesión.
- [x] Con un token vencido en `sessionStorage`, abrir `/inicio` lleva a `/login` y la clave se borra.
- [x] Sin sesión, `/inicio` y cualquier otra ruta llevan a `/login`; con sesión, `/login` lleva a `/inicio`.
- [x] "Cerrar sesión" borra `sircova.sesion` y lleva a `/login`.
- [x] Al cerrar la pestaña y abrir la app de nuevo, se pide iniciar sesión.
- [x] Por debajo de 1024 px de ancho solo se ve el formulario con el logo; a partir de 1024 px se ve también el panel institucional.
- [x] El enlace "¿Olvidó su contraseña?" se ve atenuado, no tiene `href` y no hace nada al hacer clic.
- [x] `README.md` y `AGENTS.md` documentan `npm install`, `npm run dev` y `npm test` del frontend.
- [x] HU-01 en `HISTORIAS_DE_USUARIO.md` tiene sus cuatro criterios marcados y su avance actualizado.

## Decisiones

- **Sí:** página `/inicio` provisional (saludo, rol y "Cerrar sesión"). Cumple "abre la pantalla inicial" sin adelantar HU-11, que la reemplaza.
- **No:** layout con menú o una página por rol. Se cruzan con HU-11 y amplían el alcance.
- **Sí:** guardar la respuesta del login y leer `exp` del JWT para descartar sesiones vencidas. No requiere cambios en el backend.
- **No:** implementar `GET /auth/yo` en este spec. Agrega trabajo de backend; queda para HU-02 o para cuando haga falta.
- **Sí:** `sessionStorage`. La sesión termina al cerrar la pestaña, lo más seguro para equipos compartidos.
- **No:** casilla "Recordar este equipo" ni `localStorage`. Se quita la casilla del mockup.
- **Sí:** el enlace "¿Olvidó su contraseña?" se mantiene visible, pero deshabilitado (atenuado, `aria-disabled`, sin `href`). Conserva el aspecto del mockup hasta que exista la recuperación.
- **Sí:** campo "Usuario", no "Usuario o correo institucional". Ajuste ya decidido en el SPEC 01.
- **Sí:** mostrar el `mensaje` del backend tal cual en los 4xx. Los textos viven en un solo lugar; el frontend solo escribe los de falta de conexión y error inesperado.
- **No:** traducir cada `codigo` a un texto propio. Duplica los mensajes.
- **Sí:** "Ingresar" deshabilitado mientras falte un campo o la petición esté en curso. Evita el 400 y los envíos dobles.
- **Sí:** tras un error, vaciar la contraseña y darle el foco. Facilita reintentar.
- **Sí:** "Cerrar sesión" solo local (borra `sessionStorage`). HU-02 agrega `POST /auth/logout` y la bitácora.
- **Sí:** quitar ESLint de la plantilla de Vite. Sus paquetes no están en la lista permitida; el lint sigue pendiente en `AGENTS.md`. La plantilla actual (create-vite 9.3) trae oxlint en lugar de ESLint, y se quitó igual. Decidido durante la implementación.
- **Sí:** shadcn con base `radix` y preset `radix-nova` (iconos de Lucide). `AGENTS.md` fija Radix UI. Decidido durante la implementación.
- **Sí:** conservar `cn` y `shadcn`, que instala la CLI de shadcn. `cn` reemplaza a `clsx` + `tailwind-merge` y los componentes generados lo importan directamente; `shadcn` aporta `shadcn/tailwind.css` (variantes y animaciones que usan los componentes). Se agregan a la lista de `AGENTS.md` en el paso 7. Autorizado por el equipo durante la implementación.
- **No:** volver a `clsx` + `tailwind-merge` a mano. Obligaría a corregir cada componente que agregue la CLI.
- **No:** `@fontsource-variable/geist`, la fuente del preset. Se desinstaló; la app usa IBM Plex desde Google Fonts.
- **Sí:** sin modo oscuro: se quitó el bloque `.dark` que genera shadcn, porque los mockups no lo tienen.
- **Sí:** pruebas de componente con `vi.mock` sobre `src/api/auth.js`, sin servidor falso, más la verificación manual contra la API real en Aiven. Respeta la regla de no usar servidores simulados.
- **No:** `@testing-library/jest-dom` ni `@testing-library/user-event`. No están en la lista permitida; se usan las consultas de Testing Library y `fireEvent`.
- **Sí:** Google Fonts en `index.html`. No agrega dependencias.
- **No:** `@fontsource` ni archivos de fuentes en `public/`. El primero no está permitido; el segundo suma archivos sin necesidad.
- **Sí:** ocultar el panel institucional por debajo de `lg` (1024 px). El formulario sigue usable en pantallas angostas.
- **Sí:** solo las variables del tema que usa esta pantalla, más la tabla base de shadcn. Los colores de estados, cobertura y semáforo llegan con sus pantallas.
- **Sí:** la URL de la API viene de `VITE_API_URL` y el backend ya permite `http://localhost:5173` en `CORS_ORIGEN`. No hace falta el proxy de Vite.
- **Sí:** documentar en `README.md` y `AGENTS.md` solo los comandos del frontend. Los del backend siguen como estén.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `npx shadcn@latest init` cambia sus pasos o pide TypeScript | Se sigue su guía para Vite con `jsconfig.json`. Si exige algo fuera de la lista de `AGENTS.md`, se detiene el paso 2 y se consulta al equipo. |
| La CLI de shadcn instala una dependencia que no está en la lista | Se revisa `package.json` después de cada `shadcn add`; si aparece algo nuevo, se consulta antes de seguir. |
| El JWT se lee en el navegador sin verificar la firma | Solo se usa para saber si venció; la API verifica la firma en cada petición. Alguien que altere el token no gana permisos. |
| Un token en `sessionStorage` es accesible a scripts de la página (XSS) | React escapa el contenido y no se usa `dangerouslySetInnerHTML`. Las cookies `httpOnly` exigirían cambiar el backend; quedan para otro spec si hace falta. |
| Las pruebas manuales bloquean la cuenta de prueba | Se usa un usuario propio y, para el criterio del bloqueo, se espera 15 minutos o se usa otro usuario. |
| Sin internet no cargan las fuentes de Google | La pila de fuentes cae a `sans-serif` y `monospace`; la pantalla sigue funcionando. |

## Lo que **no** entra en este spec

- Menú lateral, layout y pantalla inicial por rol (HU-11).
- `POST /auth/logout`, bitácora del cierre, inactividad y manejo global de `SESION_VENCIDA` (HU-02).
- `GET /auth/yo` y cualquier cambio en el backend.
- "Recordar este equipo", recuperación de contraseña e inicio de sesión con correo.
- Cambio obligatorio de contraseña (HU-03).
- ESLint y el Dockerfile del frontend.

Cada uno, si se hace, va en su propio spec.
