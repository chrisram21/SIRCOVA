# SPEC 06 — Navegación y pantalla inicial según el rol

> **Estado:** Implementado
> **Historia:** HU-11 (parte frontend de HU-06, más `rolNombre` en el login)
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04
> **Fecha:** 2026-10-20
> **Objetivo:** Reemplazar la página `/inicio` provisional por un layout con el menú lateral de shadcn, cuyas opciones y rutas se muestran o se bloquean según los permisos del token, y por una pantalla inicial propia de cada rol.

## Por qué existe este spec

El SPEC 04 dejó `tienePermiso(codigo)` en `useSesion()` sin usarlo en ninguna pantalla. Este spec lo aplica: el menú y las rutas del frontend se arman con los permisos del token, siguiendo la seguridad granular de HU-06 (un permiso por función, nunca el código del rol).

Hoy no existe ninguna pantalla de negocio ni ningún permiso de pantalla: el único permiso es `POBLACION_REGISTRAR`. Por eso este spec **declara las 12 opciones del menú con un permiso provisional cada una**, las lleva a una página "En construcción" y **no crea permisos**. Con la sesión real, todos los roles verán por ahora solo "Inicio"; el filtrado por permiso se comprueba con pruebas que montan el layout con sesiones simuladas. Cada spec que construya una pantalla confirma o cambia su código, lo crea en `05_permisos_mysql.sql` y reemplaza la página "En construcción" de su ruta.

La pantalla inicial sí se elige por el código del rol, porque su contenido depende del perfil (sección "La pantalla inicial según el rol" de `descripcion_pantallas.md`). Como no hay endpoints de datos todavía, sus tarjetas se muestran vacías.

## Alcance

**Entra:**

- Componente Sidebar de shadcn (`npx shadcn@latest add sidebar`) con los componentes y el hook que instala.
- Layout de las pantallas con sesión: menú lateral a la izquierda, encabezado arriba y el contenido de la ruta.
- Menú lateral: logo "SIRCOVA" y las opciones de `opcionesMenu.js` que el usuario puede ver; la opción activa resaltada.
- Comportamiento estándar del Sidebar: en escritorio, fijo de 240 px que se oculta y se muestra con un botón del encabezado; por debajo de 768 px se abre como panel deslizante.
- Encabezado: botón para mostrar u ocultar el menú, nombre y apellidos del usuario, nombre del rol (`rolNombre`) y botón "Cerrar sesión".
- Lista única de opciones del menú (`opcionesMenu.js`) con su título, ruta, permiso provisional, icono de Lucide y página.
- `RutaConPermiso`: si el usuario no tiene el permiso de la ruta, redirige a `/inicio` sin aviso.
- Página "En construcción" para las 11 opciones que aún no tienen pantalla.
- Pantalla inicial por rol: saludo, una pantalla para cada uno de los cinco roles con tarjetas sin datos y accesos rápidos filtrados por permiso.
- Backend: `rolNombre` (de `rol.nombre`) en el `usuario` que devuelve `POST /auth/login`, en el contrato y en sus pruebas.
- Pruebas del frontend con sesiones simuladas.
- Actualizar el avance de HU-11 (y la nota de HU-02 sobre dónde está "Cerrar sesión") en `HISTORIAS_DE_USUARIO.md` y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Crear o asignar permisos en `05_permisos_mysql.sql`, y la matriz de qué rol ve qué pantalla. Cada spec de pantalla crea el suyo.
- Las pantallas de negocio de las opciones del menú.
- Datos reales en las tarjetas del inicio (cobertura, reportes, alertas, bitácora…): los agrega el spec de cada dato.
- Insignias con conteos en el menú (por ejemplo, "Revisión y cierre 6").
- Nombre de la DDRISS o del establecimiento en el menú o en el encabezado.
- Proteger endpoints del backend: lo hace cada spec con `requierePermiso`.
- Aviso al redirigir por falta de permiso.
- Menú colapsable a iconos, submenús y modo oscuro.
- `GET /auth/yo` (sigue sin implementar; su esquema `UsuarioSesion` gana `rolNombre` en el contrato, pero no se programa aquí).

## Modelo de datos

Este spec **no cambia el modelo de datos**: no hay tablas, columnas ni colecciones nuevas, y no toca `05_permisos_mysql.sql`. Usa `rol.nombre`, que ya existe en el script 01.

### Cambio en la API

`components.schemas.UsuarioSesion` gana `rolNombre`, y `POST /auth/login` lo devuelve:

```json
{
  "token": "eyJ...",
  "usuario": {
    "id": 7,
    "nombreUsuario": "jperez",
    "rol": "REVISOR",
    "rolNombre": "Estadígrafa / revisor DDRISS",
    "permisos": [],
    "empleado": { "nombres": "Juan", "apellidos": "Pérez", "ddrissId": 1, "establecimientoId": null, "municipioId": null }
  }
}
```

- `rolNombre` sale de `rol.nombre` en la misma consulta del login que ya lee `r.codigo`.
- No va en el JWT: solo sirve para mostrarlo.
- Si una sesión guardada antes de este cambio no trae `rolNombre`, el encabezado muestra `rol`.

### Opciones del menú

`frontend/src/componentes/layout/opcionesMenu.js` exporta un arreglo con `{ titulo, ruta, permiso, icono, pagina }`, en este orden. `permiso: null` significa que todos la ven; `pagina` es el componente de la ruta, y si falta se usa `PaginaEnConstruccion`.

| # | Opción | Ruta | Permiso provisional | Pantalla de origen |
|---|---|---|---|---|
| 1 | Inicio | `/inicio` | ninguno | Main.html |
| 2 | Registro de producción | `/registro` | `REPORTE_REGISTRAR` | Registro.html |
| 3 | Reportes | `/reportes` | `REPORTE_CONSULTAR` | "Mis reportes" del establecimiento |
| 4 | Revisión y cierre | `/revision` | `REPORTE_REVISAR` | Revision.html |
| 5 | Indicadores | `/indicadores` | `INDICADOR_CONSULTAR` | Indicadores.html (incluye "Cobertura de mi municipio", filtrada por ámbito) |
| 6 | Mapa territorial | `/mapa` | `MAPA_CONSULTAR` | Mapa.html |
| 7 | Informes | `/informes` | `INFORME_CONSULTAR` | menú del mockup |
| 8 | Alertas | `/alertas` | `ALERTA_CONSULTAR` | menú del mockup |
| 9 | Auditoría | `/auditoria` | `BITACORA_CONSULTAR` | Auditoria.html |
| 10 | Usuarios | `/usuarios` | `USUARIO_CONSULTAR` | HU-04 / HU-07 |
| 11 | Configuración | `/configuracion` | `CONFIGURACION_CONSULTAR` | menú del mockup |
| 12 | Roles y permisos | `/permisos` | `PERMISO_CONSULTAR` | HU-61 |

Los códigos son **provisionales**: el spec que construye cada pantalla los confirma o los cambia aquí al crearlos en `05_permisos_mysql.sql`. Los iconos los elige la implementación entre los de `lucide-react`.

### Rutas

| Ruta | Sin sesión | Con sesión, sin el permiso | Con sesión y el permiso |
|---|---|---|---|
| `/login` | Pantalla de inicio de sesión | Redirige a `/inicio` | Redirige a `/inicio` |
| `/inicio` | Redirige a `/login` | — (no lleva permiso) | Layout + inicio del rol |
| Las otras 11 de la tabla | Redirige a `/login` | Redirige a `/inicio` | Layout + su página |
| `/` y cualquier otra | Redirige a `/inicio` | Redirige a `/inicio` | Redirige a `/inicio` |

En `App.jsx`, las rutas con sesión quedan anidadas bajo una ruta de layout envuelta en `RutaProtegida`; se generan recorriendo `opcionesMenu`, y cada una con permiso se envuelve en `RutaConPermiso`.

### Pantalla inicial por rol

`PaginaInicio` muestra el saludo ("Buenos días", "Buenas tardes" o "Buenas noches", según la hora local, y debajo nombre y apellidos) y, según `usuario.rol`, uno de estos componentes. Cada tarjeta es un Card con su título y el texto "Sin datos todavía".

| Rol | Componente | Tarjetas (de "La pantalla inicial según el rol") |
|---|---|---|
| `ESTABLECIMIENTO` | `InicioEstablecimiento` | Estado y fecha límite de mi reporte · Validaciones pendientes · Cobertura de mi municipio · Tendencia mensual |
| `REVISOR` | `InicioRevisor` | Estado de los reportes del periodo · Bandeja de pendientes · Alertas de calidad y de proceso · Periodos por cerrar · Solicitudes de rectificación |
| `EPIDEMIOLOGIA` | `InicioEpidemiologia` | Cobertura departamental · Municipios en meta · Reportes cerrados del mes · Alertas activas |
| `AUTORIDAD` | `InicioAutoridad` | Indicadores clave · Avance y proyección · Ranking de municipios |
| `ADMINISTRADOR` | `InicioAdministrador` | Usuarios activos · Esquemas de captura vigentes o por vencer · Cambios en catálogos · Actividad de la bitácora |
| Otro código | ninguno | Solo el saludo y los accesos rápidos |

Debajo de las tarjetas, **"Accesos rápidos"**: un Card por cada opción del menú que el usuario puede ver, salvo Inicio, con su icono y su título, que lleva a su ruta. Si no puede ver ninguna, la sección no se muestra. La pantalla inicial no lleva gráficas.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                          ← rolNombre en UsuarioSesion
├── src/modulos/auth/auth.service.js      ← lee r.nombre y devuelve rolNombre
└── tests/auth.login.test.js              ← espera rolNombre
frontend/src/
├── App.jsx                               ← rutas anidadas bajo el layout
├── components/ui/                        ← sidebar y los que instala con él (shadcn)
├── hooks/use-mobile.js                   ← lo instala shadcn con el sidebar
├── componentes/
│   ├── RutaConPermiso.jsx                ← nuevo
│   ├── RutaConPermiso.test.jsx           ← nuevo
│   └── layout/
│       ├── opcionesMenu.js               ← nuevo
│       ├── Layout.jsx                    ← nuevo: SidebarProvider, MenuLateral, Encabezado, Outlet
│       ├── MenuLateral.jsx               ← nuevo
│       ├── Encabezado.jsx                ← nuevo
│       └── Layout.test.jsx               ← nuevo
└── paginas/
    ├── en-construccion/PaginaEnConstruccion.jsx   ← nuevo
    └── inicio/
        ├── PaginaInicio.jsx              ← reemplaza la provisional
        ├── PaginaInicio.test.jsx         ← se reescribe
        ├── AccesosRapidos.jsx            ← nuevo
        ├── TarjetaSinDatos.jsx           ← nuevo
        └── roles/                        ← nuevo: InicioEstablecimiento, InicioRevisor,
                                            InicioEpidemiologia, InicioAutoridad, InicioAdministrador
docs/SPECS/HISTORIAS_DE_USUARIO.md        ← avance de HU-11 y nota de HU-02
CLAUDE.md                                 ← nota de contexto sobre opcionesMenu
```

Si `shadcn add sidebar` instala Card no hace falta agregarlo aparte; si no, se agrega con `npx shadcn@latest add card`.

## Plan de implementación

1. **Contrato.** Agregar `rolNombre` (string, ejemplo `Estadígrafa / revisor DDRISS`) a `UsuarioSesion` en `backend/openapi.yaml`. Comprobación: `/api/docs` carga sin errores y la respuesta 200 del login muestra el campo.
2. **Backend.** En `auth.service.js`, agregar `r.nombre AS rol_nombre` a la consulta del login y `rolNombre` al `usuario` de la sesión. En `tests/auth.login.test.js`, esperar `rolNombre: 'Administrador'` (o el nombre que tenga el rol del usuario de prueba en la siembra) y comprobar que el JWT no lo trae. Comprobación: `npm test` del backend pasa.
3. **Sidebar de shadcn.** Ejecutar `npx shadcn@latest add sidebar` (y `card` si no viene). Revisar `package.json`: si aparece una dependencia fuera de la lista de `AGENTS.md`, detenerse y consultar. Comprobación: `npm test` del frontend sigue pasando y `npm run dev` arranca.
4. **Opciones y rutas.** Crear `opcionesMenu.js` con la tabla del "Modelo de datos", `RutaConPermiso.jsx` (usa `tienePermiso`; sin el permiso, `<Navigate to="/inicio" replace />`) y `PaginaEnConstruccion.jsx` (título de la opción y "Esta pantalla está en construcción."). Reorganizar `App.jsx` según la tabla de rutas, con un layout provisional que solo pinte `<Outlet />`. Pruebas en `RutaConPermiso.test.jsx`, con `MemoryRouter` y una sesión simulada en `sessionStorage`:
   - con el permiso, `/indicadores` muestra su página;
   - sin el permiso, `/indicadores` lleva a `/inicio`;
   - sin sesión, `/indicadores` lleva a `/login`;
   - una ruta inexistente lleva a `/inicio`.
5. **Layout.** Crear `Layout.jsx`, `MenuLateral.jsx` y `Encabezado.jsx` con los componentes del Sidebar: logo "SIRCOVA" (cuadro `bg-primary` con una cruz blanca), las opciones visibles con `NavLink` e `isActive`, el `SidebarTrigger`, el usuario, `rolNombre ?? rol` y "Cerrar sesión" (llama a `cerrar()` y navega a `/login`, como hoy). Los colores salen de las variables `--sidebar-*` que ya están en `index.css`. Pruebas en `Layout.test.jsx`:
   - una sesión sin permisos ve solo "Inicio";
   - una sesión con `INDICADOR_CONSULTAR` y `BITACORA_CONSULTAR` ve Inicio, Indicadores y Auditoría, y no ve Registro de producción;
   - una sesión con los 11 permisos ve las 12 opciones, en el orden de la tabla;
   - la opción de la ruta actual está marcada como activa;
   - el encabezado muestra nombre, apellidos y `rolNombre`, y sin `rolNombre` muestra `rol`;
   - "Cerrar sesión" borra `sircova.sesion` y lleva a `/login`.
6. **Pantalla inicial.** Crear `TarjetaSinDatos.jsx`, `AccesosRapidos.jsx`, los cinco componentes de `roles/` y la nueva `PaginaInicio.jsx` según el "Modelo de datos"; quitar la página provisional. Reescribir `PaginaInicio.test.jsx`:
   - cada uno de los cinco roles muestra el título de sus tarjetas y no las de otro rol;
   - un código de rol desconocido muestra solo el saludo;
   - sin permisos no aparece "Accesos rápidos"; con `INDICADOR_CONSULTAR` aparece un acceso a Indicadores que lleva a `/indicadores`;
   - el saludo cambia según la hora (con `vi.setSystemTime`).
   Comprobación: `npm test` del frontend pasa.
7. **Verificación manual y documentación.** Con el backend levantado contra Aiven: iniciar sesión con el usuario de prueba y comprobar que se ve el layout, solo "Inicio" en el menú, el `rolNombre` en el encabezado y el inicio de su rol; escribir `/indicadores` y `/auditoria` en la barra de direcciones y comprobar que regresa a `/inicio`; achicar la ventana por debajo de 768 px y abrir el menú con el botón; cerrar sesión. Actualizar el "Avance" de HU-11 (y la nota de HU-02 sobre dónde quedó "Cerrar sesión") en `HISTORIAS_DE_USUARIO.md`, y marcar sus criterios cuando se cumplan los de este spec. Agregar en "Notas de contexto" de `CLAUDE.md` que cada pantalla nueva confirma su permiso en `opcionesMenu.js`, lo crea en el 05 y pone su componente en `pagina`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` tiene `rolNombre` en `UsuarioSesion` y `/api/docs` carga sin errores.
- [x] `POST /auth/login` devuelve `usuario.rolNombre` con el `rol.nombre` del usuario, y el JWT no lo contiene.
- [x] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba.
- [x] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md` (sección 3).
- [x] Una sesión ve en el menú solo las opciones cuyo permiso trae en `usuario.permisos`, más "Inicio", en el orden de la tabla.
- [x] Una sesión con todos los permisos de la tabla ve las 12 opciones; una sin permisos ve solo "Inicio".
- [x] Escribir la ruta de una opción sin tener su permiso lleva a `/inicio` sin mostrar la página.
- [x] Sin sesión, cualquier ruta lleva a `/login`; con sesión, `/login`, `/` y una ruta inexistente llevan a `/inicio`.
- [x] La opción de la ruta actual se ve resaltada con los colores `--sidebar-accent` y `--sidebar-accent-foreground`.
- [x] El encabezado muestra nombre, apellidos y `rolNombre` (o `rol` si la sesión no lo trae) y el botón "Cerrar sesión", que borra `sircova.sesion` y lleva a `/login`.
- [x] En escritorio el menú se oculta y se vuelve a mostrar con el botón del encabezado; por debajo de 768 px se abre como panel deslizante.
- [x] `/inicio` muestra el saludo según la hora y las tarjetas del rol del usuario con "Sin datos todavía"; un rol desconocido ve solo el saludo.
- [x] "Accesos rápidos" muestra solo las opciones que el usuario puede ver (sin Inicio) y no aparece si no hay ninguna.
- [x] La pantalla inicial no contiene gráficas.
- [x] Las opciones sin pantalla muestran "En construcción" con su título.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] Con el backend contra Aiven, el usuario de prueba ve el layout, solo "Inicio" en el menú, su `rolNombre` y el inicio de su rol, y `/indicadores` lo regresa a `/inicio`.
- [x] HU-11 en `HISTORIAS_DE_USUARIO.md` tiene su avance actualizado.

## Decisiones

- **Sí:** cada opción del menú declara un código de permiso y se muestra con `tienePermiso`. Sigue la seguridad granular de HU-06: cambiar qué ve un rol no exige cambiar el código.
- **No:** armar el menú con una lista fija por rol. Contradice HU-06.
- **Sí:** no crear permisos en `05_permisos_mysql.sql` en este spec. Fijar la matriz de pantallas por rol no le toca a HU-11; cada spec de pantalla crea el suyo.
- **Sí:** códigos provisionales, propuestos aquí. El spec que construye la pantalla los confirma o los cambia, porque es quien define los endpoints que protegen.
- **Sí:** declarar las 12 opciones desde ahora con una página "En construcción". El menú y las rutas quedan completos y cada spec solo cambia `pagina` y, si hace falta, el código.
- **No:** listar solo las pantallas construidas. Dejaría el menú vacío y obligaría a cada spec a tocar el layout.
- **Sí:** Usuarios y Roles y permisos como opciones propias, aunque no estén en el menú del mockup. Son pantallas de HU-04/HU-07 y HU-61.
- **Sí:** "Cobertura de mi municipio" del establecimiento va dentro de Indicadores, que se filtra por ámbito.
- **Sí:** verificar el filtrado con pruebas sobre sesiones simuladas. Con la sesión real ningún rol tiene todavía permisos de pantalla.
- **No:** insertar permisos de prueba a mano en `rol_permiso`. Es zona protegida y la prueba automática cubre lo mismo.
- **Sí:** sin permiso, redirigir a `/inicio` sin aviso. Cumple HU-11 sin agregar mensajes.
- **No:** página 403 dentro del layout. Revelaría qué pantallas existen sin aportar nada al usuario.
- **Sí:** la pantalla inicial se elige por el código del rol. Su contenido es un perfil de trabajo, no una función protegida; los datos de cada tarjeta los protegerán sus propios endpoints.
- **Sí:** cinco pantallas iniciales con tarjetas vacías. Fijan la estructura de cada rol; los specs de cada dato las llenan.
- **Sí:** accesos rápidos filtrados por permiso, como en el mockup de Inicio, y ocultos si no hay ninguno.
- **Sí:** `rolNombre` en la respuesta del login, leído de `rol.nombre`. El nombre vive en la base y no se duplica en el frontend.
- **No:** una tabla de nombres de rol en el frontend. Duplica la siembra y se desactualiza si cambia un nombre.
- **No:** `rolNombre` en el JWT. Solo se muestra; el token sigue llevando solo lo que el backend usa.
- **Sí:** si la sesión guardada no trae `rolNombre`, mostrar `rol`. Las sesiones abiertas antes del cambio siguen funcionando hasta que vencen.
- **Sí:** el logo dice solo "SIRCOVA". El token no trae el nombre de la DDRISS y `AGENTS.md` prohíbe fijar San Marcos.
- **Sí:** "Cerrar sesión" en el encabezado, junto al usuario, en lugar del pie del menú del mockup. Queda visible aunque el menú esté oculto.
- **Sí:** el Sidebar de shadcn con su comportamiento estándar (oculto con un botón en escritorio, panel deslizante por debajo de 768 px). `AGENTS.md` pide usar primero shadcn, y la app se adapta al ancho de la ventana.
- **No:** menú colapsable a iconos ni submenús. No están en el mockup.
- **No:** insignias con conteos en el menú. Necesitan endpoints que todavía no existen.
- **Sí:** `src/preparar-pruebas.js`, cargado desde `setupFiles` en `vite.config.js`, con un `matchMedia` falso. jsdom no lo implementa y el Sidebar lo usa (hook `use-mobile`); así no se repite en cada archivo de pruebas. Decidido durante la implementación.
- **Sí:** el ancho de 240 px se fija con `--sidebar-width: 15rem` en `Layout.jsx`, sin editar `sidebar.jsx`, que trae 16rem. Los archivos de shadcn quedan como los genera su CLI. Decidido durante la implementación.
- **No:** `TooltipProvider` en la app, aunque la CLI lo sugiere al instalar el Sidebar. Solo se usa con el menú reducido a iconos, que está fuera del alcance. Decidido durante la implementación.
- **Sí:** el saludo es "Buenos días" de 5:00 a 11:59, "Buenas tardes" de 12:00 a 18:59 y "Buenas noches" el resto. El spec solo pedía "según la hora local". Decidido durante la implementación.
- **Sí:** en pantallas angostas, el panel del menú se cierra al elegir una opción, para que no tape la página. Decidido durante la implementación.
- **Sí:** las dos pruebas de cierre de sesión de `PaginaInicio.test.jsx` (aviso `MANUAL` al servidor y cierre aunque falle `POST /auth/logout`) pasaron a `Layout.test.jsx`, porque el botón se movió al encabezado. No se pierde ninguna prueba al reescribir el archivo. Decidido durante la implementación.
- **Sí:** la verificación manual del paso 7 se hizo con Playwright (herramienta de la sesión, sin agregarlo al proyecto). La sesión se obtuvo con `POST /auth/login` real desde un script con las credenciales de `backend/.env` y se guardó en `sessionStorage`, para no escribir la contraseña en el formulario. El formulario de login ya lo verificó el SPEC 02. Decidido durante la implementación.
- **Sí:** `.playwright-mcp/` en `.gitignore`, porque ahí guarda Playwright sus capturas y registros. Su integración como herramienta de pruebas del proyecto queda para el siguiente spec. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `shadcn add sidebar` instala una dependencia fuera de la lista de `AGENTS.md` | Se revisa `package.json` en el paso 3; si aparece algo nuevo, se consulta antes de seguir. |
| Un spec de pantalla crea su permiso con un código distinto al de `opcionesMenu.js` y la opción nunca aparece | La nota de `CLAUDE.md` lo recuerda; la prueba del spec de pantalla, con su permiso real, muestra enseguida si la opción no aparece. |
| Se cree que ocultar una opción protege los datos | `tienePermiso` es solo visual; cada endpoint lleva `requierePermiso` (SPEC 04). |
| Las sesiones abiertas antes del cambio no traen `rolNombre` | El encabezado muestra `rol`; la sesión vence en 2 h como máximo. |
| La prueba de login espera un `rolNombre` que no coincide con la siembra | El paso 2 toma el nombre de `rol.nombre` del usuario de prueba, no de un texto escrito a mano. |

## Lo que **no** entra en este spec

- Crear o asignar permisos y fijar la matriz de pantallas por rol.
- Las pantallas de negocio y los datos reales de las tarjetas del inicio.
- Insignias, nombre de la DDRISS, aviso de acceso denegado, menú a iconos, submenús y modo oscuro.
- `GET /auth/yo` y la protección de endpoints del backend.

Cada uno, si se hace, va en su propio spec.
