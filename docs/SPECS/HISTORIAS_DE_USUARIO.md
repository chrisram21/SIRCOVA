# SIRCOVA: Historias de usuario

Sistema web para gestionar, validar y analizar la producción de vacunación de la DDRISS San Marcos.

Versión 5 · 18/10/2026 (sincronizada con el Word revisado por el equipo; incluye las aclaraciones del 17 y 18/10, la BD v0.8 y las tecnologías elegidas) · 60 historias · 280 story points. Basado en el contexto del proyecto v2.4 (incluye la información de campo del 10/10/2026 y las aclaraciones del 17 y 18/10/2026), la descripción de pantallas, el diseño de base de datos v0.8 y la guía de desarrollo.

## 1. Formato de cada historia

| Elemento | Qué responde |
|---|---|
| **ID** | Identificador único con el formato HU-01, HU-02, … |
| **Para quién** | Rol que usa la función (Como …) |
| **Qué quiere** | Función que necesita (quiero …) y su propósito (para …) |
| **Cómo se hará** | Enfoque técnico previsto: pantalla, endpoint de la API y tablas o colecciones involucradas |
| **Criterios de aceptación** | Condiciones verificables para dar la historia por terminada |
| **Story points, sprint y responsable** | Esfuerzo estimado, incremento donde se desarrolla e integrante a cargo |

Una historia se considera terminada cuando cumple sus criterios de aceptación, tiene pruebas unitarias o de integración del backend, está integrada con el frontend y se integró a `main` mediante un pull request (no requiere la aprobación de otro integrante; ver `AGENTS.md`, sección 7). Si una historia se divide en varios specs, solo se considera terminada cuando todos sus specs están implementados.

## 2. Criterios para asignar los story points

Se usa la escala de Fibonacci (1, 2, 3, 5, 8, 13), habitual en Scrum, porque la incertidumbre crece con el tamaño de la tarea. Los puntos son una medida **relativa** de esfuerzo, no de horas. Cada historia se comparó contra una historia de referencia (HU-01, iniciar sesión = 3 puntos) considerando cuatro criterios:

1. **Complejidad de la lógica:** reglas de negocio, cálculos o cambios de estado que implica.
2. **Capas involucradas:** si toca solo frontend, o también backend, MySQL y MongoDB.
3. **Incertidumbre:** datos o decisiones que aún dependen de la DDRISS (por ejemplo, el semáforo o el número de dosis por vacuna).
4. **Dependencias y pruebas:** cuántas otras historias dependen de ella y cuánto hay que probar.

| Puntos | Significado | Ejemplo |
|---|---|---|
| 1 | Cambio mínimo, sin lógica nueva | (no se usó) |
| 2 | Pantalla o consulta sencilla sobre datos ya existentes; una sola capa con poca lógica | HU-30 Aprobar un reporte |
| 3 | CRUD o acción sencilla de frontend y backend sobre un solo motor de base de datos | HU-01 Iniciar sesión |
| 5 | Varias tablas o reglas, validaciones propias, o una integración (Excel, cron, mapa de permisos) | HU-09 Establecimientos |
| 8 | Lógica compleja, usa MySQL y MongoDB, cálculos o motor de reglas; requiere varias pruebas | HU-36 Cobertura contra meta |
| 13 | Pieza central del sistema con alta incertidumbre; de la que dependen muchas historias | HU-20 Formulario dinámico |

## 3. Resumen por sprint

| Sprint | Incremento | Historias | Story points |
|---|---|---|---|
| Sprint 1 (24/09 – 03/10) | Acceso, usuarios y catálogos básicos | HU-01 a HU-11 (11) | 38 |
| Sprint 2 (04/10 – 13/10) | Configuración dinámica y registro de producción | HU-12 a HU-23 (12) | 64 |
| Sprint 3 (14/10 – 23/10) | Validación, revisión y cierre | HU-24 a HU-34 (11) | 50 |
| Sprint 4 (24/10 – 02/11) | Indicadores, análisis y visualización | HU-35 a HU-44 (10) | 57 |
| Sprint 5 (03/11 – 12/11) | Reportes, alertas y auditoría | HU-45 a HU-55 (11) | 47 |
| Fase final (13/11 – 30/11) | Despliegue, pruebas y entrega (tareas) | HU-56 a HU-60 (5) | 24 |
| **Total** | | **60** | **280** |

## 4. Reparto entre los integrantes

El reparto se hizo sprint por sprint: en cada uno, las historias se ordenaron de mayor a menor puntaje y cada una se asignó al integrante con menos puntos acumulados. Así todos tienen carga en cada sprint y el total queda equilibrado. La asignación de cada integrante a su carga se hizo al azar.

| Integrante | S1 | S2 | S3 | S4 | S5 | Final | Historias | **Total SP** |
|---|---|---|---|---|---|---|---|---|
| Christian Ramírez | 10 | 16 | 11 | 16 | 11 | 5 | 15 | **69** |
| Kenneth García | 10 | 16 | 13 | 13 | 11 | 8 | 14 | **71** |
| Andrea López | 10 | 16 | 13 | 13 | 13 | 6 | 17 | **71** |
| Luis Suárez | 8 | 16 | 13 | 15 | 12 | 5 | 14 | **69** |

- **Christian Ramírez (69 SP):** HU-01, HU-02, HU-04, HU-15, HU-16, HU-19, HU-25, HU-29, HU-35, HU-36, HU-37, HU-48, HU-50, HU-54, HU-56
- **Kenneth García (71 SP):** HU-03, HU-05, HU-06, HU-17, HU-21, HU-22, HU-27, HU-31, HU-33, HU-40, HU-41, HU-45, HU-49, HU-57
- **Andrea López (71 SP):** HU-07, HU-08, HU-09, HU-12, HU-13, HU-14, HU-23, HU-28, HU-32, HU-34, HU-42, HU-43, HU-46, HU-51, HU-55, HU-59, HU-60
- **Luis Suárez (69 SP):** HU-10, HU-11, HU-18, HU-20, HU-24, HU-26, HU-30, HU-38, HU-39, HU-44, HU-47, HU-52, HU-53, HU-58

## 5. Product Backlog: historias de usuario

### Sprint 1 (24/09 – 03/10): Acceso, usuarios y catálogos básicos

#### HU-01. Iniciar sesión

> **Como** usuario del sistema, **quiero** iniciar sesión con mi usuario y contraseña, **para** acceder solo a las funciones que corresponden a mi rol.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles | 3 | S1 | Christian Ramírez |

**Cómo se hará:** Pantalla de inicio de sesión en React; endpoint `POST /auth/login` en Express que verifica la contraseña cifrada (bcrypt) en la tabla `usuario` y devuelve un token JWT con el rol y los permisos.

**Criterios de aceptación:**
- [x] Con credenciales correctas el sistema abre la pantalla inicial de mi rol.
- [x] Con credenciales incorrectas muestra un mensaje de error genérico y permite reintentar.
- [x] Un usuario desactivado no puede iniciar sesión.
- [x] La contraseña nunca se guarda ni se devuelve en texto plano.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 02 a `main`. La parte backend está en `specs/01-hu-01-login.md` (`POST /auth/login`, bloqueo por intentos, bitácora y middleware `autenticar`) y la parte frontend en `specs/02-hu-01-login-frontend.md` (proyecto de React, pantalla de inicio de sesión, sesión en `sessionStorage` y página `/inicio` provisional), verificada contra la API real el 2026-10-19. La "pantalla inicial de mi rol" es por ahora la página `/inicio` provisional; la pantalla propia de cada rol llega con HU-11.

**Nota (2026-10-22, spec 10):** el aviso de cuenta bloqueada pasó del Alert rojo a un modal "Usuario bloqueado" con el mensaje "Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en 15 minutos.", que arma el backend con `MINUTOS_BLOQUEO`. El campo de contraseña del login usa `CampoContrasena` (HU-03). Si el administrador restablece la contraseña de una sesión abierta (HU-63), esa sesión vuelve al login con un aviso. Detalle en `specs/10-hu-62-63-seguridad-de-cuentas.md`.

#### HU-02. Cerrar sesión y expiración de la sesión

> **Como** usuario del sistema, **quiero** cerrar mi sesión y que el sistema la cierre solo tras un tiempo de inactividad, **para** evitar que otra persona use mi cuenta en un equipo compartido.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles | 2 | S1 | Christian Ramírez |

**Cómo se hará:** Botón de cierre en la barra de navegación; endpoint `POST /auth/logout`; el token tiene tiempo de vida limitado y el frontend redirige al inicio de sesión cuando expira.

**Criterios de aceptación:**
- [x] Al cerrar sesión se elimina el token y vuelvo a la pantalla de inicio de sesión.
- [x] Con un token vencido, cualquier petición responde 401 y el frontend pide iniciar sesión de nuevo.
- [x] El inicio y el cierre de sesión quedan en la bitácora.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 03 a `main`. Backend y frontend van en un solo spec, `specs/03-hu-02-cerrar-sesion.md`: `POST /auth/logout` (protegido con `autenticar`, registra `LOGOUT` con el motivo `MANUAL` o `INACTIVIDAD`), cierre por 30 minutos de inactividad, cierre al vencer el JWT, manejo global del 401 y aviso informativo en `/login`. Verificado contra la API real el 2026-10-19. El botón "Cerrar sesión" está en el encabezado del layout desde HU-11 (spec 06).

Ajuste del sprint 3, backend (`specs/27-hu-02-sesiones-backend.md`): ya no se acepta el riesgo del token no revocable. El servidor guarda cada sesión en la tabla `sesion` (v0.10), con una sola abierta por usuario: un inicio de sesión nuevo cierra la anterior, y el JWT (2 h) lleva el id de su sesión, que `autenticar` revisa en cada petición. Cerrar sesión, restablecer la contraseña, desactivar la cuenta y cambiar el rol, el establecimiento o el municipio cierran la sesión en el servidor. `POST /auth/refrescar` renueva el JWT con un refresh token en una cookie `HttpOnly` hasta una jornada de 8 h, y una sesión sin peticiones por 30 minutos deja de servir también en el servidor.

Ajuste del sprint 3, frontend (`specs/28-hu-02-sesiones-frontend.md`): el JWT vive en memoria y no en `sessionStorage`; al recargar o abrir otra pestaña, la sesión se recupera con `POST /auth/refrescar` y la cookie, sin pedir el login y sin perder la dirección. El token se renueva solo antes de vencer hasta el fin de la jornada, y un latido evita que el servidor dé por inactiva una sesión en la que se escribe sin guardar. La inactividad se cuenta entre todas las pestañas, cada cierre muestra el mensaje del servidor (reemplazada, inactiva, jornada terminada…), y otra cuenta que entra en el mismo navegador devuelve al login a las demás pestañas. Cambiar la propia contraseña ya no cierra la sesión. La cookie dura 1 h más que la jornada para que el aviso de jornada terminada llegue al navegador. Verificado contra la API real el 2026-10-29.

#### HU-03. Cambiar mi contraseña

> **Como** usuario del sistema, **quiero** cambiar mi contraseña indicando la actual, y que el sistema me obligue a cambiar la contraseña temporal que me dieron, **para** mantener mi cuenta segura.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles | 2 | S1 | Kenneth García |

**Cómo se hará:** Pantalla de cambio de contraseña en React, a la que se llega desde el encabezado y, de forma obligatoria, después del login cuando la cuenta tiene `debe_cambiar_contrasena = TRUE`. Endpoint del módulo `auth` (nombre por definir en su spec; por ejemplo, `POST /auth/contrasena`) que valida la contraseña actual, aplica la política de fortaleza y guarda el nuevo hash en `usuario` con `debe_cambiar_contrasena = FALSE`. El login devuelve `debeCambiarContrasena`, y `revisarCuenta` (dentro de `autenticar`) rechaza el resto de la API mientras la cuenta deba cambiar la contraseña. La fortaleza se mide con `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common` y `@zxcvbn-ts/language-es-es` en el backend (validación obligatoria) y en el frontend (medidor); son dependencias nuevas y requieren autorización en el spec. Componente propio `CampoContrasena`, con un botón para ver la contraseña mientras se mantiene presionado, que después reutilizan el login y las demás pantallas con contraseñas.

**Criterios de aceptación:**
- [x] Si la contraseña actual no coincide, el cambio se rechaza.
- [x] La nueva contraseña tiene al menos 12 caracteres y como máximo 72 bytes (límite de bcrypt), obtiene al menos 3 de 4 en zxcvbn y no contiene mi nombre de usuario, mis nombres ni mis apellidos. No se exigen mayúsculas, números ni símbolos. El backend valida la regla aunque el frontend también la revise.
- [x] La nueva contraseña no puede ser igual a la actual.
- [x] Mientras escribo la nueva contraseña, veo un medidor de fortaleza y el motivo por el que todavía no se acepta.
- [x] En los campos de contraseña puedo ver lo que escribo mientras mantengo presionado un botón (con el ratón, con el dedo o con la tecla Espacio), y se oculta al soltarlo.
- [x] Después del cambio, puedo iniciar sesión solo con la nueva contraseña, y la cuenta queda con `debe_cambiar_contrasena = FALSE`.
- [x] Si mi cuenta debe cambiar la contraseña, al iniciar sesión el sistema me lleva a la pantalla de cambio y no puedo abrir otras pantallas. El backend responde 403 `CAMBIO_CONTRASENA_REQUERIDO` a cualquier endpoint protegido, salvo el cambio de contraseña, `POST /auth/logout` y `GET /auth/yo`.
- [x] El cambio queda en la bitácora sin la contraseña actual ni la nueva.

**Ajustes de la asesoría (2026-10-21):** la historia pasó de "cambiar mi contraseña" a incluir también el cambio obligatorio de la contraseña temporal (controlado en el backend), la política de fortaleza con zxcvbn (antes eran 8 caracteres) y el campo para ver la contraseña. Se trabaja antes que el spec A (seguridad de cuentas, hoy `specs/10-hu-62-63-seguridad-de-cuentas.md`; su origen está resumido en HU-62) y el spec B de `docs/SPECS/PROPUESTA_SPEC_B_DATOS_DEL_EMPLEADO.md`, que dependen de ella. Los story points se pueden reestimar al escribir su spec.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 09 a `main`. Backend y frontend en `specs/09-hu-03-cambiar-contrasena.md`. El endpoint es `POST /auth/contrasena`, sin permiso (como el logout): una contraseña actual incorrecta responde 422 y no cuenta para el bloqueo; el cambio queda en la bitácora con la acción nueva `CAMBIO_CONTRASENA`. El login devuelve `debeCambiarContrasena` (no va en el JWT) y `autenticar` lo lee de la base en cada petición; `GET /auth/yo` sigue sin programar, así que hoy solo el cambio y el logout quedan exentos del 403. Tras el cambio, la sesión se cierra y el login pide entrar con la nueva. Pantalla `/cuenta/contrasena`: sola y sin menú si el cambio es obligatorio, o dentro del Layout desde el botón "Cambiar contraseña" del encabezado. `CampoContrasena` solo se usa en esa pantalla; el login y el registro lo adoptan en el spec A. Se agregaron `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common` y `@zxcvbn-ts/language-es-es` al backend y al frontend. Verificado contra la API real el 2026-10-21 con la cuenta "Prueba HU-03" (`prueba.hu03`, rol Revisor), que queda activa en la base de prueba.

#### HU-04. Registrar personal y crear su cuenta

> **Como** administrador, **quiero** registrar los datos de un empleado y, si lo necesita, crearle una cuenta con un rol, **para** que el personal autorizado pueda usar el sistema.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S1 | Christian Ramírez |

**Cómo se hará:** Pantalla de usuarios en React; endpoints `POST /empleados` y `POST /usuarios`; tablas `empleado` y `usuario` (relación 1:1, el empleado puede existir sin cuenta).

**Criterios de aceptación:**
- [x] Puedo registrar un empleado con su establecimiento y municipio.
- [x] Puedo crear una cuenta ligada a ese empleado con un rol de los 5 existentes.
- [x] No se permiten dos cuentas con el mismo nombre de usuario ni dos cuentas para el mismo empleado.
- [x] Solo el rol AUTORIDAD puede quedar sin DDRISS asignada.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 07 a `main`. Backend y frontend en `specs/07-hu-04-registrar-personal.md`: `POST /empleados` y `POST /usuarios` (con bitácora, sin devolver ni registrar la contraseña), solo para el Administrador (permisos `EMPLEADO_CREAR` y `USUARIO_CREAR` en `05_permisos_mysql.sql`); el empleado queda siempre en la DDRISS del administrador, con establecimiento el municipio se toma de él, y una cuenta `ESTABLECIMIENTO` exige establecimiento. Pantalla `/usuarios/nuevo` (botón "Registrar personal" en `/usuarios`), que crea al empleado y, si se pide, su cuenta; si falla solo la cuenta, se reintenta sin volver a crear al empleado. Para el formulario se agregaron las lecturas mínimas de `GET /roles`, `/ddriss`, `/municipios` y `/establecimientos` (ver HU-08 y HU-09). Verificado contra la API real el 2026-10-21. La autoridad nacional (sin DDRISS) se sigue creando con `npm run crear-usuario`, y obligar a cambiar la contraseña temporal es HU-03.

**Nota (2026-10-22, spec 10):** la contraseña temporal ya no la escribe el administrador. `POST /usuarios` la genera (12 caracteres de un alfabeto sin caracteres que se confunden, que cumplen la política de HU-03), la devuelve una sola vez en `contrasenaTemporal` y responde 400 si el cuerpo la trae. "Registrar personal" ya no tiene campos de contraseña: al crear la cuenta muestra un diálogo con la contraseña y un botón para copiarla. La bitácora `CREAR` no la guarda. Detalle en `specs/10-hu-62-63-seguridad-de-cuentas.md`.

**Nota (2026-10-22, spec 11):** ajuste pedido en la asesoría del 2026-10-21 para no registrar dos veces a la misma persona y validar cómo se escriben los datos. El código de empleado se reemplazó por el **CUI del DPI**, obligatorio al registrar: se guarda solo su huella HMAC-SHA256 (`empleado.cui_hmac`, modelo v0.9), nunca el número, y un CUI repetido responde 409 `CUI_DUPLICADO`. Se valida que tenga 13 dígitos, el dígito verificador y un departamento entre 01 y 22. El **correo** pasa a ser obligatorio (de cualquier dominio) y no se repite. Nombres, apellidos, cargo, teléfono, correo y nombre de usuario se validan con las reglas de `validaciones/campos.js`, iguales en el backend y en el frontend: el teléfono se guarda como `NNNN-NNNN`, el correo en minúsculas, y el nombre de usuario lleva de 4 a 50 caracteres en minúsculas, números, punto, guion o guion bajo. "Registrar personal" muestra el error debajo de cada campo y no deja enviar mientras haya uno. Detalle en `specs/11-fix-validacion-campos-empleado-y-cui.md`.

#### HU-05. Editar, desactivar y restaurar usuarios

> **Como** administrador, **quiero** editar, desactivar y restaurar cuentas de usuario, **para** mantener actualizado el acceso del personal sin borrar su historial.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S1 | Kenneth García |

**Cómo se hará:** Acciones en el listado de usuarios; endpoint `PATCH /usuarios/{id}`; la desactivación es lógica (campo de estado), no se elimina el registro.

**Criterios de aceptación:**
- [x] Puedo cambiar el rol o los datos de una cuenta.
- [x] Una cuenta desactivada no puede iniciar sesión, pero sus acciones pasadas siguen visibles en la bitácora.
- [x] Puedo restaurar una cuenta desactivada.
- [x] Cada cambio queda registrado en la bitácora con el usuario que lo hizo.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 08 a `main`. Backend y frontend en `specs/08-hu-05-editar-desactivar-restaurar-usuarios.md`. El contrato separó el `PATCH /usuarios/{id}` previsto en tres endpoints, uno por permiso: `PATCH /usuarios/{id}` (solo el rol, `USUARIO_EDITAR`), `POST /usuarios/{id}/desactivar` y `/restaurar` (`USUARIO_DESACTIVAR`), más `PATCH /empleados/{id}` para los datos del empleado (`EMPLEADO_EDITAR`), todos solo para el Administrador. La desactivación es lógica y solo de la cuenta (`usuario.activo`); restaurar también quita el bloqueo por intentos. El administrador no puede cambiar su propio rol ni desactivarse, y una cuenta desactivada no se edita hasta restaurarla. `autenticar` revisa la cuenta en cada petición, así que una sesión abierta se cierra si la cuenta se desactiva (401 `CUENTA_DESACTIVADA`) o si cambian su rol, establecimiento o municipio (401 `SESION_DESACTUALIZADA`). Pantallas: tabla de cuentas en `/usuarios` con Editar, Desactivar (con confirmación) y Restaurar, y `/usuarios/:id/editar`. Para la tabla se agregó un `GET /usuarios` mínimo (ver HU-07). Verificado contra la API real el 2026-10-21 con la cuenta "Prueba HU-05" (`prueba.hu05`, rol Revisor), que queda activa en la base de prueba.

**Nota (2026-10-22, spec 11):** al editar un empleado, `PATCH /empleados/{id}` valida solo los campos que llegan, así que un dato viejo que no cumple las reglas nuevas no impide cambiar otro. El correo y el CUI no se pueden borrar. Los empleados que ya existían quedaron sin CUI (el 07 vació los códigos de empleado): se les puede registrar al editarlos. Si ya tienen CUI, la pantalla muestra "Registrado" y el botón "Reemplazar CUI", nunca el número. La bitácora no guarda el CUI ni su huella; registra `cuiRegistrado` y, al reemplazarlo, `cuiReemplazado: true`. Detalle en `specs/11-fix-validacion-campos-empleado-y-cui.md`.

#### HU-06. Control de acceso por permiso y ámbito

> **Como** administrador, **quiero** que cada función del sistema exija su propio permiso y que los roles agrupen esos permisos, **para** que nadie pueda ver o modificar información que no le corresponde y para poder dar o quitar funciones a un rol sin cambiar el sistema.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S1 | Kenneth García |

**Cómo se hará:** Tablas `permiso` (un código por función, con la forma `ENTIDAD_ACCION`, por ejemplo `REPORTE_APROBAR`) y `rol_permiso`; middleware de Express `requierePermiso(codigo)` en cada ruta, que lee los permisos del token; utilidades de ámbito (establecimiento o DDRISS) para las consultas; y una guardia que impide escrituras al rol `AUTORIDAD`. La matriz de qué rol tiene qué permiso no se fija aquí: cada historia crea los permisos de sus endpoints y los asigna.

**Criterios de aceptación:**
- [x] Cada endpoint protegido declara el código de permiso que exige, en su ruta y en `openapi.yaml`.
- [x] Una petición sin ese permiso responde 403, aunque el rol tenga otros permisos del mismo módulo.
- [x] Asignar o quitar un permiso a un rol en `rol_permiso` cambia el acceso desde el siguiente inicio de sesión, sin cambiar el código.
- [x] El personal de establecimiento solo ve los recursos de su establecimiento y el resto de los roles solo los de su DDRISS; un recurso fuera de ese ámbito responde 404.
- [x] La autoridad tiene acceso de solo consulta, aunque por error se le asigne un permiso de escritura.
- [x] El mecanismo se prueba con al menos un caso permitido y uno denegado; cada historia posterior agrega las pruebas de los permisos de sus propios endpoints.

**Avance:** criterios cumplidos a nivel de mecanismo; queda terminada al integrar el spec 04 a `main`. Está en `specs/04-hu-06-permisos-por-rol.md`: middleware `requierePermiso(codigo)` (403 `SIN_PERMISO`, con la guardia de solo consulta de `AUTORIDAD`), utilidades de ámbito `filtroAlcance` y `verificarAlcance` (404 `NO_ENCONTRADO`), catálogo idempotente `backend/db/05_permisos_mysql.sql`, convención `x-permiso` y respuesta `SinPermiso` en el contrato, y `tienePermiso()` en `useSesion()`. Verificado contra la base de prueba el 2026-10-20: al quitar `POBLACION_REGISTRAR` al Administrador el siguiente inicio de sesión recibe 403, y al correr el 05 vuelve a recibir 200. Todavía no existe ningún endpoint de negocio: los criterios 1 y 4 se aplican en cada historia que cree endpoints (declarar `x-permiso`, usar `requierePermiso` y filtrar con las utilidades de ámbito). La matriz de permisos por rol no está definida; la pantalla para gestionarla es HU-61.

#### HU-07. Consultar el listado de usuarios

> **Como** administrador, **quiero** ver el listado de usuarios con búsqueda y filtros por rol, establecimiento y estado, **para** encontrar rápidamente una cuenta para revisarla o modificarla.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 2 | S1 | Andrea López |

**Cómo se hará:** Tabla paginada en React; endpoint `GET /usuarios` con parámetros de filtro y paginación.

**Criterios de aceptación:**
- [x] Puedo buscar por nombre o usuario.
- [x] Puedo filtrar por rol, establecimiento y activo/inactivo.
- [x] El listado se página y nunca muestra contraseñas.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 12 a `main`. Backend y frontend en `specs/12-hu-07-listado-usuarios.md`. `GET /usuarios` (permiso `USUARIO_CONSULTAR`, sin permisos nuevos) filtra y pagina en el servidor con `busqueda` (nombre completo o nombre de usuario, sin distinguir mayúsculas ni tildes; `%`, `_` y `\` se buscan como texto), `rolId`, `establecimientoId` (un id o `ninguno` para la sede de la DDRISS), `estado` (`ACTIVA`, `DESACTIVADA` o `BLOQUEADA`; las bloqueadas también salen en `ACTIVA` con su Badge "Bloqueada"), `pagina` y `porPagina` (1 a 100, por defecto 20). Responde `{ elementos, total, pagina, porPagina }`, la forma que deben repetir los demás listados paginados; un parámetro inválido, desconocido o repetido responde 400 y una página fuera de rango responde 200 vacía con el total. La pantalla `/usuarios` tiene la barra de filtros (la búsqueda espera 300 ms), el pie con "Mostrando X a Y de Z", 10, 20 o 50 filas por página y la paginación, y guarda todo en la URL. Verificado contra la API real el 2026-10-22: búsqueda, filtros combinados, 10 filas por página, vuelta desde "Editar" con Atrás conservando los filtros, página fuera de rango y los 400.

**Nota (2026-10-21, spec 07):** la página `/usuarios` ya existe (`frontend/src/paginas/usuarios/PaginaUsuarios.jsx`, permiso `USUARIO_CONSULTAR`) y solo tiene el botón "Registrar personal", que lleva a `/usuarios/nuevo`. A esta historia le falta agregarle el listado y `GET /usuarios`, sin mover el formulario de registro.

**Nota (2026-10-21, spec 08):** HU-05 agregó una versión mínima del listado: `GET /usuarios` (permiso `USUARIO_CONSULTAR`) devuelve todas las cuentas de la DDRISS del usuario, activas y desactivadas, como un arreglo de `UsuarioDetalle` sin parámetros, y `/usuarios` las muestra en una tabla con las acciones Editar, Desactivar y Restaurar. A esta historia le faltan la búsqueda por nombre o usuario, los filtros por rol, establecimiento y estado, y la paginación. Si la respuesta pasa a ser paginada, hay que ajustar `PaginaUsuarios.jsx`, que es la única que la consume.

#### HU-08. Gestionar el catálogo territorial

> **Como** administrador, **quiero** consultar los departamentos, municipios, DDRISS y distritos de salud, **para** que la producción y los indicadores se asignen al territorio correcto.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S1 | Andrea López |

**Cómo se hará:** Tablas `departamento`, `municipio`, `ddriss` y `distrito_salud`; carga inicial con los 30 municipios de San Marcos y el registro 9999 «Migrantes / fuera de San Marcos»; endpoint `GET /municipios`.

**Criterios de aceptación:**
- [x] El catálogo trae cargados los 30 municipios de San Marcos.
- [x] Existe el registro especial «Migrantes / fuera de San Marcos» (9999), que también se usa para procedencia desconocida.
- [x] Puedo registrar y editar distritos de salud ligados a un municipio.
- [x] No puedo eliminar un municipio que ya tiene producción registrada.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 13 a `main`. Backend y frontend en `specs/13-hu-08-catalogo-territorial.md`. Hay dos diferencias con la historia, porque mandan `AGENTS.md` y el modelo. Primera: los municipios son de solo consulta (regla 6), así que no hay ninguna ruta para borrarlos, crearlos ni editarlos, y el último criterio se cumple porque la ruta no existe. Segunda: "editar" un distrito es solo cambiarle el nombre; el código y el municipio no cambian, y para otro municipio se desactiva el distrito y se registra otro. `GET /municipios` suma `alcance=procedencia` (agrega el 9999 y los municipios de los establecimientos externos, como Coatepeque), `incluirInactivos` y `departamentoNombre`; sin parámetros responde lo mismo que antes. Distritos: `GET`/`POST /distritos`, `PATCH /distritos/{id}` (nombre) y `POST /distritos/{id}/desactivar` y `/reactivar`, con los permisos `DISTRITO_CONSULTAR`, `DISTRITO_CREAR` y `DISTRITO_EDITAR`. El backend genera el código `DS-{INE}-{NN}`. Un nombre repetido en el municipio responde 409, igual que desactivar un distrito con establecimientos activos. La pantalla es la pestaña «Territorio» de `/configuracion` (`CONFIGURACION_CONSULTAR`). Verificado contra la API real el 2026-10-22: se registró `DS-1207-02` en Tacaná y se renombró, desactivó y reactivó, con sus cuatro filas en la bitácora; el nombre duplicado dio 409 dentro del diálogo; "Desactivar" quedó deshabilitado en `DS-1201`, que tiene establecimientos activos; y los parámetros inválidos dieron 400. El distrito de prueba quedó desactivado.

**Avance (2026-10-20):** los códigos INE de los 30 municipios de la semilla (`backend/db/01_modelo_relacional_mysql.sql`, 1201 a 1230) se verificaron el 2026-10-20 contra los P-codes del COD-AB de Guatemala de OCHA (GT1201 a GT1230), y coinciden en código y nombre; Coatepeque también coincide (GT0920). Queda resuelta la nota "verificar códigos contra el catálogo INE y el GeoJSON" para los municipios de San Marcos. Ese mismo archivo es la base del GeoJSON del mapa (HU-42).

**Nota (2026-10-21, spec 07):** `GET /municipios` y `GET /ddriss` ya existen en versión mínima, de solo lectura y filtradas por ámbito (`backend/src/modulos/catalogos/`, permisos `MUNICIPIO_CONSULTAR` y `DDRISS_CONSULTAR`, hoy solo del Administrador), porque las necesita el formulario de HU-04. Esta historia los amplía en lugar de crearlos de nuevo. `GET /municipios` devuelve los municipios activos del departamento sede de la DDRISS del usuario (todos para la autoridad nacional) y ya no tiene el parámetro `jurisdiccion` ni el campo `esJurisdiccion`, que quedaron obsoletos con el modelo v0.5.

#### HU-09. Gestionar establecimientos e instituciones

> **Como** administrador, **quiero** registrar, editar y desactivar establecimientos de salud e instituciones, **para** que cada reporte quede ligado a quien lo produjo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S1 | Andrea López |

**Cómo se hará:** Pantalla de establecimientos; endpoints `GET/POST /establecimientos` y `PATCH /establecimientos/{id}`; tablas `establecimiento` (marcas `reporta_5c`, `solo_cobertura` y `es_externo`) y `tipo_establecimiento` (CS, CAP, CAIMI, puesto, CC, CM, hospital, institución).

**Criterios de aceptación:**
- [x] Puedo registrar un establecimiento con tipo, municipio, distrito, dirección, teléfono, correo y contacto.
- [x] Puedo marcar qué establecimientos envían el 5C (31: el que centraliza cada municipio y el Hospital de San Marcos).
- [x] Puedo marcar un establecimiento cuya producción solo cuenta para cobertura (Hospital de San Marcos) y uno externo (por ejemplo, el de Coatepeque).
- [x] Un establecimiento desactivado no puede crear reportes nuevos. (Se cumplió en HU-19, spec 22.)
- [x] Puedo filtrar el listado por municipio y tipo.

**Avance:** criterios cumplidos, salvo el de los reportes nuevos, que pasa a HU-19; queda terminada al integrar el spec 14 a `main`. Backend y frontend en `specs/14-hu-09-establecimientos.md`. Hay cuatro diferencias con la historia, porque mandan `AGENTS.md` y el modelo. Primera: "un establecimiento desactivado no puede crear reportes nuevos" depende de `POST /reportes`, que todavía no existe; el criterio pasa a HU-19, y este spec garantiza que el establecimiento quede inactivo y no aparezca en los formularios que piden `activo=true`. Segunda: editar es solo cambiar el nombre, la dirección, el teléfono, el correo, el contacto y las marcas; el código no se renombra (regla 6), y el tipo, el municipio y el distrito no cambian (para eso se desactiva y se registra otro). Tercera: desactivar y reactivar van en `POST /establecimientos/{id}/desactivar` y `/reactivar`, no en el `PATCH`. Cuarta: `es_externo` no es una casilla: lo deduce el backend del departamento del municipio. Endpoints: `GET /establecimientos` (más campos, filtro `tipoEstablecimientoId`), `GET`/`PATCH /establecimientos/{id}`, `POST /establecimientos`, `GET /tipos-establecimiento` y `GET /municipios?alcance=todos`, con los permisos `ESTABLECIMIENTO_CREAR`, `ESTABLECIMIENTO_EDITAR` y `TIPO_ESTABLECIMIENTO_CONSULTAR`. El backend genera el código `{TIPO}-{INE}-{NN}`. Un nombre repetido en el municipio responde 409, igual que desactivar un establecimiento con cuentas activas; `reporta5c` o `soloCobertura` sin `reportaProduccion` responden 422. La pantalla es la pestaña «Establecimientos» de `/configuracion`, con subrutas para registrar y editar. Verificado contra la API real el 2026-10-23: la pestaña mostró los 40 establecimientos de la semilla y "Envían el 5C: 31"; se registraron `PS-1209-36` en Tajumulco y `CS-0920-01` en Coatepeque (externo, sin distrito); se editó el contacto del externo y se desactivó y reactivó, con sus filas en la bitácora; "Desactivar" quedó deshabilitado en `CS-1201`, que tiene cuentas; y el desactivado no apareció en `/usuarios/nuevo`. Los dos establecimientos de prueba quedaron desactivados.

**Nota (2026-10-25, spec 22):** el criterio de los reportes nuevos se cumplió en HU-19: `POST /reportes` responde 409 `ESTABLECIMIENTO_INACTIVO` si el establecimiento de la cuenta está desactivado, y 422 `ESTABLECIMIENTO_NO_REPORTA` si no tiene `reporta_5c`.

**Nota (2026-10-21, spec 07):** `GET /establecimientos` ya existe en versión mínima, de solo lectura (`backend/src/modulos/catalogos/`, permiso `ESTABLECIMIENTO_CONSULTAR`, hoy solo del Administrador), porque lo necesita el formulario de HU-04. Devuelve los campos del contrato, filtrados por ámbito con `filtroAlcance`, y acepta `municipioId` y `activo`. Esta historia lo amplía (filtro por tipo, alta y edición) en lugar de crearlo de nuevo.

#### HU-10. Gestionar vacunas y dosis

> **Como** administrador, **quiero** registrar las vacunas y sus dosis, indicando cuál completa el esquema y cuál es trazadora, **para** que el formulario y los indicadores usen el catálogo vigente.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S1 | Luis Suárez |

**Cómo se hará:** Tablas `vacuna` y `dosis` (campos `completa_esquema` y `es_trazadora`); endpoints `GET/POST /vacunas`; carga inicial según el Registro Único de Vacunación (21 vacunas; Polio agrupa IPV y OPV y Hexavalente reemplaza a Pentavalente).

**Criterios de aceptación:**
- [x] Puedo agregar una vacuna nueva sin cambiar el código del sistema.
- [x] Cada dosis tiene un orden y un tipo (primera, segunda, refuerzo, etc.).
- [x] Puedo marcar qué dosis completa el esquema (la última dosis sin contar refuerzos). (La calcula el sistema; ver el avance.)
- [x] Una vacuna desactivada ya no aparece en reportes nuevos, pero sí en los históricos. (Se cumplió en HU-19, spec 22.)

**Avance:** criterios cumplidos, salvo el de los reportes nuevos, que pasa a HU-19 y HU-20; queda terminada al integrar el spec 15 a `main`. Backend y frontend en `specs/15-hu-10-vacunas-y-dosis.md`. Hay cinco diferencias con la historia, porque mandan `AGENTS.md` y el modelo. Primera: `dosis` no tiene columna `tipo` y el modelo no cambia; el tipo sale del código, que genera el backend: `UNICA`, `D{n}` (dosis) o `R{n}` (refuerzo), y el `orden` es el siguiente de la vacuna; un código no se reutiliza. Segunda: `completa_esquema` no se marca a mano: lo calcula el backend en cada cambio de las dosis activas (la activa `UNICA` o `DOSIS` de mayor orden o, si no hay, el último refuerzo activo, como en DPT), y la regla reproduce las marcas de las 21 vacunas de la semilla. Tercera: "una vacuna desactivada ya no aparece en reportes nuevos" depende de `POST /reportes` y del formulario, que todavía no existen; el criterio pasa a HU-19 y HU-20, y este spec garantiza que la vacuna quede inactiva sin borrar nada y no aparezca en `GET /vacunas?activa=true`. Cuarta: además de `GET/POST /vacunas` hay `GET`/`PATCH /vacunas/{id}`, `/desactivar`, `/reactivar` y rutas propias para agregar, editar, desactivar y reactivar dosis. Quinta: el Revisor (estadígrafa) tiene los mismos permisos que el Administrador (`VACUNA_CONSULTAR`, `VACUNA_CREAR`, `VACUNA_EDITAR`, y `CONFIGURACION_CONSULTAR` para ver el menú). El catálogo es nacional: no se filtra por DDRISS. Una secuencia inválida (dos `UNICA`, `UNICA` con `DOSIS` o un refuerzo antes de una dosis) responde 422; un código o nombre de vacuna repetido, o un nombre de dosis repetido en la vacuna, 409; desactivar la última dosis activa, 409. La pantalla es la pestaña «Vacunas» de `/configuracion`, con subrutas para registrar y editar. Verificado contra la API real el 2026-10-23: la pestaña mostró las 21 vacunas de la semilla con su marca; como Administrador se registró `PRUEBA_HU10` con D1, D2 y R1 (marca en D2), se le agregó D3 (la marca pasó a D3), se desactivó D3 (volvió a D2), se editó el nombre y se desactivó y reactivó la vacuna, con los filtros puestos al volver; como Revisor, Configuración mostró solo «Vacunas» y se editó la descripción. La bitácora tiene una fila por operación, más las `ACTUALIZAR` de D2 por la marca. La vacuna de prueba quedó desactivada.

**Nota (2026-10-25, spec 22):** el criterio de los reportes nuevos se cumplió en HU-19 para las vacunas: el reporte fija al crearse sus vacunas activas con la versión de esquema de ese mes (`reporte_vacuna`), así que una vacuna desactivada después sigue en los reportes anteriores y no entra en los nuevos. Las dosis inactivas pasan a HU-20: se ocultan en el formulario salvo que el reporte ya tenga cantidades de esa dosis.

**Nota (2026-10-25, spec 23):** la parte de las dosis se cumplió en HU-20: una dosis inactiva no aparece en el formulario de un reporte, y el `PUT` de captura la rechaza, salvo que ese reporte ya tenga filas de ella.

#### HU-11. Navegación y pantalla inicial según el rol

> **Como** usuario del sistema, **quiero** ver un menú y una pantalla inicial con solo las opciones de mi rol, **para** trabajar sin distracciones ni opciones que no puedo usar.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles | 3 | S1 | Luis Suárez |

**Cómo se hará:** Layout en React con barra de navegación que se arma con los permisos del token; rutas protegidas; menú con el componente Sidebar de shadcn/ui y paleta en azules y celestes del MSPAS (azul marino #2c4660, celeste #5aa0d0) definida en las variables del tema.

**Criterios de aceptación:**
- [x] Cada rol ve solo las opciones de menú que le corresponden.
- [x] Si escribo la dirección de una pantalla sin permiso, el sistema me redirige.
- [x] La pantalla inicial es ligera; las gráficas están en pantallas propias del menú.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 06 a `main`. Un solo spec, `specs/06-hu-11-navegacion-por-rol.md`: layout con el Sidebar de shadcn y encabezado (usuario, nombre del rol y "Cerrar sesión"); las 12 opciones del menú están en `frontend/src/componentes/layout/opcionesMenu.js`, cada una con un permiso **provisional**, y se muestran o se bloquean con `tienePermiso` (sin el permiso, la ruta redirige a `/inicio`); las opciones sin pantalla muestran "En construcción". La pantalla inicial se elige por el rol, con tarjetas todavía sin datos y accesos rápidos filtrados por permiso, sin gráficas. El login devuelve también `rolNombre`. Como ningún permiso de pantalla existe aún en `05_permisos_mysql.sql`, con la sesión real todos los roles ven por ahora solo "Inicio"; el filtrado por permiso se comprobó con pruebas sobre sesiones simuladas, y el resto contra la API real el 2026-10-20. Cada spec de pantalla confirma su código, lo crea en el 05 y pone su página en `opcionesMenu.js`.

### Sprint 2 (04/10 – 13/10): Configuración dinámica y registro de producción

#### HU-12. Gestionar periodos de reporte

> **Como** administrador, **quiero** abrir los periodos mensuales y definir su fecha límite de envío por DDRISS, **para** que los establecimientos sepan para qué mes y hasta cuándo deben reportar.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S2 | Andrea López |

**Cómo se hará:** Tablas `periodo` (calendario común) y `cierre_periodo` (estado y fecha límite por DDRISS); endpoint `GET /periodos`.

**Criterios de aceptación:**
- [x] Puedo crear los 12 periodos de un año.
- [x] Puedo definir la fecha límite de envío de cada periodo.
- [x] Un periodo cerrado no admite reportes nuevos. (Se cumplió en HU-19, spec 22.)

**Avance:** criterios cumplidos, salvo el de los reportes nuevos, que pasa a HU-19; queda terminada al integrar el spec 16 a `main`. Backend y frontend en `specs/16-hu-12-periodos-de-reporte.md`. Hay cuatro diferencias con la historia, porque mandan `AGENTS.md` y el modelo. Primera: `cierre_periodo` no tiene un estado «programado», así que crear su fila es abrir el mes; por eso «crear los 12 periodos» (`POST /periodos { anio }`) solo agrega al calendario común (`periodo`) los meses que falten del año, sin abrir ninguno, y cada mes se abre aparte para la DDRISS del usuario con `POST /periodos/{id}/abrir { fechaLimiteEnvio }`. Los años van de 2020 al siguiente al actual (fecha de Guatemala); un año con sus 12 meses responde 409 y uno incompleto se completa. Segunda: al abrir se crea solo la fila de la DDRISS del usuario, no una por DDRISS activa como dice el comentario del script 01, que no se tocó. Tercera: la fecha límite se cambia con `PATCH /periodos/{id}` en un mes `ABIERTO` o `EN_CIERRE` (no en uno sin abrir o `CERRADO`, 409), y debe ser posterior al fin del mes (422); en `EN_CIERRE`, una fecha de hoy o posterior lo devuelve a `ABIERTO`. Cuarta: «un periodo cerrado no admite reportes nuevos» depende de `POST /reportes`, que todavía no existe; el criterio pasa a HU-19, y `GET /periodos` ya devuelve cada mes con el estado y la fecha límite de la DDRISS del usuario (`null` si no está abierto) y filtra por `anio` y `estado`. El Administrador y el Revisor tienen `PERIODO_CONSULTAR`, `PERIODO_CREAR` y `PERIODO_EDITAR`. La pantalla es la pestaña «Periodos» de `/configuracion`, con el año en `?anio=`. Verificado contra la API real el 2026-10-23: como Administrador, la pestaña mostró 2026 con el estado de la semilla; se creó 2025 (12 meses "Sin abrir", 12 filas `CREAR`); se abrió diciembre de 2025 con la fecha sugerida 10/01/2026 y se cambió a 20/01/2026; y al recargar, 2025 siguió elegido. Como Revisor, Configuración mostró «Vacunas» y «Periodos», y se cambió la fecha límite de octubre de 2026 y se devolvió a 10/11/2026, con sus filas `ACTUALIZAR`. El año 2025 quedó en el calendario.

**Nota (2026-10-25, spec 22):** el criterio de los reportes nuevos se cumplió en HU-19: `POST /reportes` solo crea en un mes `ABIERTO` en `cierre_periodo` de la DDRISS del establecimiento; uno sin abrir, `EN_CIERRE` o `CERRADO` responde 409 `PERIODO_NO_ABIERTO`. El Personal de establecimiento ya tiene `PERIODO_CONSULTAR`.

#### HU-13. Registrar la población objetivo

> **Como** administrador, **quiero** registrar la población anual de cada municipio por grupo de edad que envía el MSPAS, **para** que el sistema tenga el denominador para calcular coberturas y metas.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S2 | Andrea López |

**Cómo se hará:** Pantalla de población por año y municipio; endpoint `POST /poblaciones-objetivo`; tablas `poblacion_objetivo` y `clasificacion_poblacion` (grupos = encabezados del 5C, como «< 1 año» y «De 1 a < 6 años»).

**Criterios de aceptación:**
- [x] Puedo registrar la población por municipio, año y grupo de edad.
- [x] No se permite registrar dos veces el mismo municipio, año y grupo.
- [x] Las cantidades deben ser enteros no negativos.
- [x] Cada cambio de población queda en la bitácora.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 17 a `main`. Backend y frontend en `specs/17-hu-13-poblacion-objetivo.md`. Hay cuatro diferencias con la historia, decididas por el equipo. Primera: en lugar de `POST /poblaciones-objetivo` se usa `PUT /poblaciones-objetivo/{municipioId}/{anio} { fuente?, grupos: { CODIGO: cantidad } }`, que crea o corrige en una sola transacción los grupos que vienen; los demás no cambian y nunca se borra una fila, así que «no registrar dos veces» lo garantizan el `UNIQUE (municipio_id, anio, clasificacion_poblacion_id)` y el `PUT`, sin un 409 por duplicado (solo hay 409 `POBLACION_EN_CONFLICTO` si dos guardados del mismo grupo chocan). Segunda: solo se registra la población de los años con al menos un mes en el calendario de periodos (422 `ANIO_SIN_PERIODOS`) y de los municipios activos del departamento sede de la DDRISS, sin el `9999` ni los externos como Coatepeque (404). Tercera: la cantidad es un entero de 0 a 9 999 999 (`validarCantidadPoblacion` en los dos `campos.js`); se puede guardar solo una parte de los grupos, y un grupo ya registrado se corrige pero no se vacía. La `fuente` es opcional; sin ella, una fila existente conserva la suya. Cuarta: el Administrador y el Revisor tienen `POBLACION_CONSULTAR` (nuevo) y `POBLACION_REGISTRAR`. `GET /poblaciones-objetivo?anio=` devuelve los 7 grupos y los municipios con su población por grupo. La bitácora deja un `CREAR` por grupo creado y un `ACTUALIZAR` por grupo cuya cantidad o fuente cambió. La pantalla es la pestaña «Población» de `/configuracion`, con el año en `?anio=` y un Dialog por municipio. Verificado contra la API real el 2026-10-23: como Administrador, la pestaña mostró 2026 con los 30 municipios y la población de la semilla; San Marcos se editó (menores de 1 año de 1,450 a 1,460, con otra fuente), se mantuvo al recargar con el año en la URL, dejar vacío un grupo registrado mostró el error, y se devolvió a la semilla. Como Revisor, Configuración mostró «Vacunas», «Periodos» y «Población», y se corrigió Tacaná y se devolvió a su valor. Cada guardado dejó sus filas `ACTUALIZAR` en la bitácora.

#### HU-14. Importar la población desde Excel

> **Como** administrador, **quiero** cargar el archivo anual de población en Excel en lugar de digitarlo, **para** ahorrar tiempo y evitar errores de digitación.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S2 | Andrea López |

**Cómo se hará:** Carga de archivo en React; endpoint que lee el Excel con ExcelJS, valida las filas y muestra una vista previa antes de guardar.

**Criterios de aceptación:**
- [ ] El sistema muestra una vista previa con las filas válidas y las que tienen error.
- [ ] Las filas con municipio o grupo inexistente se reportan y no se guardan.
- [ ] Puedo confirmar o cancelar la importación.

**Nota (2026-10-23, spec 17):** la importación guarda con la misma lógica de `PUT /poblaciones-objetivo/{municipioId}/{anio}` (SPEC 17): solo años del calendario, municipios del departamento de la DDRISS, cantidades de `validarCantidadPoblacion`, y una fila de bitácora por grupo creado o cambiado.

#### HU-15. Gestionar el catálogo de dimensiones

> **Como** administrador, **quiero** definir las dimensiones de captura (grupo de edad, sexo, presentación IPV u OPV, etc.) y sus valores, **para** que cada vacuna pueda desagregarse de forma distinta sin cambiar la base de datos.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S2 | Christian Ramírez |

**Cómo se hará:** Colección `catalogo_dimensiones` en MongoDB; endpoint `GET /dimensiones`; pantalla de administración.

**Criterios de aceptación:**
- [x] Puedo crear una dimensión nueva con sus valores.
- [x] Los valores de grupo de edad coinciden con los códigos de `clasificacion_poblacion`.
- [x] No puedo borrar una dimensión que ya usa algún esquema.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 18 a `main`. Backend y frontend en `specs/18-hu-15-catalogo-de-dimensiones.md`. Es el primer módulo que escribe en MongoDB (módulo `configuracion` del backend): cada escritura deja primero su fila en la bitácora, dentro de la transacción de MySQL, después hace un solo cambio en `catalogo_dimensiones` y al final se confirma MySQL. Hay cuatro diferencias con la historia, decididas por el equipo. Primera: nada se borra (`AGENTS.md` §5.6); «no puedo borrar» se cumple porque no se puede **desactivar** una dimensión ni un valor que usa un esquema `VIGENTE` o `BORRADOR` de cualquier territorio (409 `DIMENSION_EN_USO` / `VALOR_EN_USO`); los esquemas `HISTORICO` no lo impiden. Segunda: los valores nuevos de `grupo_edad`, la única dimensión `RANGO_EDAD`, deben ser un código de `clasificacion_poblacion` y llevar su rango en meses; los de la semilla que no coinciden (`2_4`, `10_14`) se quedan y la pantalla los marca «Sin población». Un grupo de edad nuevo es un valor de `grupo_edad`, no una dimensión, y necesita existir antes en `clasificacion_poblacion` (hoy solo por SQL). Tercera: las dimensiones nuevas son siempre `CATEGORICA`; los códigos los escribe el usuario y no cambian, como tampoco el tipo ni el rango de un valor; se editan el nombre, la descripción, la etiqueta y el orden de los valores. Cuarta: el Administrador y el Revisor tienen `DIMENSION_CONSULTAR`, `DIMENSION_CREAR` y `DIMENSION_EDITAR`. Además de `GET /dimensiones` hay `GET /dimensiones/{codigo}`, `POST`, `PATCH`, `/desactivar`, `/reactivar` y las rutas de `/valores` (agregar, editar etiqueta, ordenar, desactivar y reactivar). La pantalla es la pestaña «Dimensiones» de `/configuracion`, con el estado en `?activa=`, y las subrutas `/configuracion/dimensiones/nueva` y `/configuracion/dimensiones/:codigo/editar`. Verificado contra la API real el 2026-10-24: como Administrador, la pestaña mostró las 5 dimensiones (las 4 de la semilla y `pueblo` del 04), todas «En uso»; `grupo_edad` marcó `2_4` y `10_14` «Sin población» y «Agregar valor» solo ofreció `NACIDOS_VIVOS` y `EMBARAZADAS`. Se creó `prueba_manual_hu15`, se renombró, se le agregó un valor, se reordenó, se desactivó un valor y la dimensión, y el filtro «Inactivas» se mantuvo al recargar. Como Revisor, Configuración mostró «Vacunas», «Dimensiones», «Periodos» y «Población», y se reactivó la dimensión y se editó una etiqueta. Cada acción dejó su fila en la bitácora (8 en total).

#### HU-16. Crear el esquema de captura de una vacuna

> **Como** administrador, **quiero** definir qué dosis, dimensiones y secciones (grupos de edad) pide el formulario de cada vacuna, **para** que el formulario se adapte a cada vacuna en lugar de ser fijo como el 5C.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 8 | S2 | Christian Ramírez |

**Cómo se hará:** Editor de esquemas en React; endpoint `POST /esquemas-captura`; colección `esquemas_captura` en MongoDB con `secciones[]` y desagregación por dosis.

**Criterios de aceptación:**
- [x] Puedo elegir las dosis de la vacuna y las dimensiones de cada una.
- [x] Puedo organizar el formulario en secciones por grupo de edad.
- [x] El esquema se guarda como borrador hasta publicarlo.
- [x] El sistema rechaza un esquema que use dimensiones o dosis inexistentes.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 19 a `main`. Backend y frontend en `specs/19-hu-16-esquema-de-captura.md`. Además de `POST /esquemas-captura` hay `GET /esquemas-captura` (una fila por vacuna con su vigente que aplica y el borrador de la DDRISS), `GET /esquemas-captura/{id}`, `PUT` y `DELETE`, con los permisos `ESQUEMA_CONSULTAR`, `ESQUEMA_CREAR` y `ESQUEMA_EDITAR`. Hay cuatro diferencias con la historia, decididas por el equipo. Primera: el Revisor tiene los mismos permisos que el Administrador, como en vacunas y dimensiones. Segunda: todo esquema que se crea es un `BORRADOR` de la DDRISS del usuario, uno por vacuna; empieza vacío o como copia del vigente que aplica (el de la DDRISS o el nacional), y descartarlo lo borra (bitácora `ELIMINAR`). Nadie crea esquemas nacionales. Tercera: este spec no publica; la vigencia la fija HU-17 y mientras tanto el borrador guarda una fecha provisional que la API no devuelve (`vigencia: null`). Cuarta: el editor arma dosis, desagregación general y por dosis, secciones y procedencia; las reglas de validación y los campos adicionales se copian de la base (o, en uno vacío, van `CAMPOS_COMPLETOS`, `DIMENSIONES_VALIDAS` y `NO_NEGATIVO`), y no se editan aquí. «Rechaza un esquema con dimensiones o dosis inexistentes» se cumple con 422 `ESQUEMA_INVALIDO`: dosis activas de la vacuna, dimensiones y valores activos del catálogo, `grupo_edad` en la desagregación de cada dosis si y solo si la vacuna lo usa, secciones coherentes (un grupo de edad distinto por sección y permitido por sus dosis, cada dosis en alguna) y combinaciones de hasta 255 caracteres; el editor muestra los mismos problemas antes de guardar. La pantalla es la pestaña «Esquemas» de `/configuracion` y las subrutas `/configuracion/esquemas/nuevo` y `/configuracion/esquemas/:id/editar`. Verificado contra la API real el 2026-10-24: como Administrador, la pestaña mostró las 21 vacunas activas, con Hexavalente v2 nacional y su borrador v3; se creó un borrador de Td copiando el vigente (R1 con su propia desagregación por edad), el editor marcó «La dosis R1 no aparece en ninguna sección.» al quitarla de las secciones, se guardó como versión 2, se editó la procedencia y se creó un borrador vacío de Varicela con la dimensión sexo (versión 1); los dos se descartaron. Como Revisor, se creó y descartó un borrador de Varicela. Cada acción dejó su fila en la bitácora (7 en total) y el borrador Hexavalente v3 del 04 no cambió.

**Nota (2026-10-23, spec 15):** Una vacuna registrada en HU-10 no tiene esquema de captura: el editor debe ofrecer las vacunas activas sin esquema vigente y solo sus dosis activas.

**Nota (2026-10-24, spec 18):** El esquema solo usa dimensiones y valores activos (`GET /dimensiones?activa=true`, SPEC 18); un esquema VIGENTE o BORRADOR impide desactivarlos. Los códigos de dimensión y de valor llegan a 30 caracteres: el esquema debe revisar que la combinación quepa en los 255 de `clave_combinacion`.

#### HU-17. Versionar y publicar esquemas

> **Como** administrador, **quiero** publicar una nueva versión de un esquema con fecha de vigencia, **para** adaptarme a cambios del esquema nacional sin alterar los reportes ya capturados.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 8 | S2 | Kenneth García |

**Cómo se hará:** Endpoint `POST /esquemas-captura/{id}/publicar`; índice único parcial que permite una sola versión VIGENTE por vacuna; cada `reporte_vacuna` guarda el id y la versión del esquema usado.

**Criterios de aceptación:**
- [x] Al publicar una versión nueva, la anterior deja de estar vigente.
- [x] Los reportes ya capturados siguen mostrándose con su versión original.
- [x] Puedo consultar el historial de versiones de una vacuna.

**Nota (2026-10-24, spec 19):** Los borradores los crea el SPEC 19 (solo de la DDRISS del usuario) con una `vigencia.desde` provisional que la API no devuelve: publicar debe fijar la vigencia, volver a pasar las reglas de coherencia de `esquemas.service.js` y crear `ESQUEMA_PUBLICAR`.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 20 a `main`. Backend y frontend en `specs/20-hu-17-publicar-esquemas.md`. Además de `POST /esquemas-captura/{id}/publicar` está `GET /esquemas-captura/historial?vacunaId=`, con el permiso nuevo `ESQUEMA_PUBLICAR` y `ESQUEMA_CONSULTAR`. Diferencias con la historia, decididas por el equipo:

- El Revisor también publica, como en los demás permisos de esquemas.
- Solo se publica un borrador de la DDRISS del usuario; nadie publica esquemas nacionales.
- La vigencia empieza el día 1 de un mes del calendario de `periodo`, desde el mes actual y después del vigente de la DDRISS, y puede ser futura. Al publicar, la versión pasa a `VIGENTE` de inmediato y la anterior de la DDRISS pasa a `HISTORICO`, con `hasta` = el día anterior; de ella solo cambian `estado` y `vigencia.hasta`. Los dos documentos se escriben en una transacción de MongoDB. El nacional no se toca.
- El motivo es obligatorio (de 1 a 300 caracteres), y publicar vuelve a pasar las reglas de coherencia del SPEC 19.
- «Cada `reporte_vacuna` guarda el id y la versión del esquema usado» lo llena HU-20. Este spec garantiza que esa versión no cambia y se sigue consultando, y el historial cuenta los reportes de la DDRISS que usan cada versión.

En la pantalla, «Publicar» está en la fila del borrador de la pestaña «Esquemas» y en el editor ("Guardar y publicar" si hay cambios), con un diálogo común. «Historial» abre `/configuracion/esquemas/historial/:vacunaId`, y "Ver" abre `/configuracion/esquemas/:id`, con el editor en solo lectura.

Verificado contra la API real el 2026-10-24:

- **Como Administrador:**
  - se registró la vacuna de prueba manual `ZVM_HU17`; su borrador vacío se publicó desde la fila con vigencia desde noviembre de 2026;
  - una copia se publicó desde el editor desde diciembre de 2026. El diálogo solo ofreció diciembre y avisó "La versión 1 dejará de usarse el 30/11/2026.";
  - el historial mostró la v2 vigente y la v1 histórica (01/11 – 30/11/2026), con su motivo y su usuario;
  - el historial de Hexavalente mostró la v1 histórica con los 248 reportes de la semilla, y su vista mostró los 34 controles deshabilitados.
- **Como Revisor:** se vio el historial, el diálogo avisó que no quedaban meses en el calendario, y se descartó el borrador.
- **Al terminar:** `ZVM_HU17` se desactivó. La bitácora tiene sus filas `CREAR`, `ACTUALIZAR`, `PUBLICAR_ESQUEMA` y `ELIMINAR`, y Hexavalente (v1, v2 y el borrador v3 del 04) no cambió.

#### HU-18. Previsualizar el formulario de un esquema

> **Como** administrador, **quiero** ver cómo quedará el formulario antes de publicar el esquema, **para** detectar errores de configuración antes de que lo use el personal.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S2 | Luis Suárez |

**Cómo se hará:** Reutiliza el componente de formulario dinámico en modo de solo lectura con el esquema en borrador.

**Criterios de aceptación:**
- [x] La vista previa muestra secciones, dosis y dimensiones tal como las verá el establecimiento.
- [x] La vista previa no guarda datos.

**Nota (2026-10-24, spec 19):** La vista previa parte de `GET /esquemas-captura/{id}` (SPEC 19) y puede ir como botón en el editor de borradores.

**Nota (2026-10-24, spec 20):** `EditorEsquema` tiene la prop `soloLectura` y `/configuracion/esquemas/:id` (SPEC 20) muestra una versión sin editar; la vista previa del formulario es otra cosa: reproduce lo que verá el establecimiento.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 21 a `main`. Solo frontend, en `specs/21-hu-18-vista-previa-formulario.md`: no hay endpoint nuevo ni cambia el backend. Como el formulario dinámico de HU-20 todavía no existía, este spec lo crea en `frontend/src/componentes/formulario/`: `armarFormulario` convierte el esquema en tablas (con la `claveCombinacion` de cada celda) y `FormularioCaptura` las dibuja con sus totales. Diferencias con la historia, decididas por el equipo:

- El Revisor también la ve, como los demás permisos de esquemas.
- «Modo de solo lectura»: los campos se pueden llenar (enteros ≥ 0) y los totales por fila, por columna y el general se calculan en pantalla, pero nada sale del navegador y todo se pierde al cerrar.
- Se abre con «Vista previa» desde el editor del borrador, con los cambios sin guardar, y desde `/configuracion/esquemas/:id`, para cualquier versión. Con problemas de coherencia, se abre igual y los lista en un aviso ámbar (color nuevo `--advertencia` del tema).
- De la procedencia solo describe el modo; la tarjeta B es de HU-21. Lista las reglas del esquema (código y versión) sin ejecutarlas, y dibuja los campos adicionales.
- Una versión publicada sin `secciones` (anterior a la v0.4, como Hexavalente v1) las deduce de los valores de `grupo_edad`.

Verificado contra la API real el 2026-10-25:

- **Como Administrador:**
  - Hexavalente v2: columnas «< 1 año» y «De 1 a < 6 años», 1.ª a 3.ª dosis, el campo adicional y las 5 reglas; con 78, 4 y 71 los totales dieron 82, 71, 149, 4 y 153, y `2.5` quedó marcado sin sumar. Al cerrar y reabrir, las cantidades estaban vacías y la página no hizo ninguna petición nueva a la API;
  - VPH por sexo (Masculino primero, como el catálogo), Polio con cuatro secciones por presentación (los refuerzos solo en las suyas) y Td con la tabla aparte de su refuerzo;
  - en el borrador Hexavalente v3, quitar D3 de las dos secciones sin guardar dejó «Guardar borrador» deshabilitado y la vista previa avisó «La dosis D3 no aparece en ninguna sección.»; no hubo ningún `PUT` y el borrador siguió igual en la base.
- **Como Revisor:** BCG (una columna «Cantidad») y Hexavalente v1 histórica, con su sección deducida «< 1 año» y la procedencia «juntas, como en el 5C».

#### HU-19. Crear el reporte mensual

> **Como** personal del establecimiento, **quiero** crear el reporte de mi establecimiento para un periodo abierto, **para** empezar a registrar la producción del mes.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 3 | S2 | Christian Ramírez |

**Cómo se hará:** Endpoint `POST /reportes`; tabla `reporte_produccion` en estado Borrador; el establecimiento se toma del usuario y debe tener `reporta_5c`.

**Criterios de aceptación:**
- [x] Solo puedo elegir periodos abiertos.
- [x] Solo los establecimientos que envían el 5C (uno por municipio y el Hospital de San Marcos) pueden crear reportes.
- [x] No puedo crear dos reportes del mismo establecimiento para el mismo periodo.
- [x] Un establecimiento desactivado no puede crear reportes nuevos (viene de HU-09).
- [x] Una vacuna inactiva, o una dosis inactiva, no aparece en reportes nuevos; los reportes anteriores la conservan (viene de HU-10). (Las vacunas, en este spec; las dosis, en HU-20, spec 23.)
- [x] Solo se crean reportes en un mes `ABIERTO` en la DDRISS del establecimiento; uno sin abrir, en cierre o cerrado no admite reportes nuevos (viene de HU-12).
- [x] El reporte nace en estado Borrador.

**Avance:** criterios cumplidos, salvo la parte de las dosis inactivas, que pasa a HU-20; queda terminada al integrar el spec 22 a `main`. Backend y frontend en `specs/22-hu-19-crear-reporte-mensual.md`. Diferencias con la historia, porque mandan `AGENTS.md`, el modelo y lo que decidió el equipo:

- El reporte **fija sus vacunas al crearse**. `POST /reportes { periodoId }` crea, en una transacción, una fila de `reporte_vacuna` por cada vacuna activa con un esquema publicado que cubra el día 1 del mes. El esquema es el de la DDRISS del establecimiento (`VIGENTE` o `HISTORICO`) o, si no hay, el nacional, y lo resuelve `esquemasDelPeriodo`. Desactivar una vacuna o publicar otra versión después no cambia el reporte. Una vacuna sin esquema para el mes se omite, y si no queda ninguna responde 422 `SIN_ESQUEMAS`.
- Las **dosis inactivas** pasan a HU-20: el reporte no guarda qué dosis lleva, y la versión publicada no se edita. El formulario las oculta salvo que el reporte ya tenga cantidades de esa dosis.
- El establecimiento sale de la cuenta: el cuerpo es solo `{ periodoId }`, y `establecimientoId` responde 400. Solo crea el Personal de establecimiento.
- La creación deja una fila en `historial_estado_reporte` (`NULL` → `BORRADOR`) y una `CREAR` en la bitácora.

Errores: 403 `SIN_ESTABLECIMIENTO`, 409 `ESTABLECIMIENTO_INACTIVO`, 422 `ESTABLECIMIENTO_NO_REPORTA`, 404 si el periodo no existe, 409 `PERIODO_NO_ABIERTO`, 409 `REPORTE_EXISTENTE` (también con dos altas en paralelo) y 422 `SIN_ESQUEMAS`.

Endpoints:

- `POST /reportes`;
- `GET /reportes`, paginado por alcance, con `periodoId` y `estado`;
- `GET /reportes/{id}`, con el estado y la fecha límite del mes en la DDRISS, y las vacunas con su versión. Cada vacuna trae, de esa versión, sus dosis (con `activa`) y las dimensiones que usa con sus etiquetas, para que el Personal no necesite los permisos del catálogo.

Permisos nuevos: `REPORTE_CREAR` y `REPORTE_CONSULTAR`, solo para el Personal de establecimiento, que además recibe `PERIODO_CONSULTAR`. La opción «Reportes» del menú pasó al código provisional `REPORTE_LISTAR`.

Pendientes que quedaron hechos antes de HU-20:

- `GET /esquemas-captura/{id}` devuelve la `etiqueta` de cada desagregación, y el `POST` y el `PUT` la aceptan y la guardan, para que el editor no la pierda al guardar ni al copiar;
- se quitó del contrato `GET /vacunas/{codigo}/esquema-vigente`.

La pantalla es «Registro de producción» (`/registro`): elige un mes abierto (`?periodo=`; sin él, el más antiguo sin reporte o en Borrador), crea el reporte y muestra los pasos de estado y una pestaña por vacuna con su versión, sus dimensiones y sus etiquetas, todavía sin formulario.

Verificado contra la API real el 2026-10-25:

- Con `cs1201` (C/S San Marcos), el menú mostró solo «Inicio» y «Registro de producción», y `/registro` abrió en octubre de 2026 (septiembre estaba `APROBADO`) con la fecha límite 10/11/2026.
- Se creó el reporte 287, que quedó en `BORRADOR` con su historial `NULL → BORRADOR`, su `CREAR` en la bitácora y 8 vacunas: BCG, Polio, Hexavalente v2, Rotavirus, Neumococo, SPR, VPH y Td.
- Las pestañas mostraron «Dosis · Grupo de edad» con «< 1 año» y «De 1 a < 6 años» en Hexavalente, «Dosis · Sexo» con «Masculino» y «Femenino» en VPH, y «Dosis · Grupo de edad · Estado de embarazo» en Td.
- Al recargar, el reporte siguió y el botón ya no apareció. Septiembre mostró el paso «Aprobado» con las 5 vacunas de la semilla.
- Con el Revisor, el menú no mostró «Registro de producción», y `/registro` llevó a `/inicio`.

El reporte 287 queda en Borrador y sirve para HU-20.

**Nota (2026-10-23, spec 16):** `GET /periodos?estado=ABIERTO` devuelve los meses abiertos en la DDRISS del usuario. Hoy solo el Administrador y el Revisor tienen `PERIODO_CONSULTAR`: el spec de HU-19 se lo asigna al Personal de establecimiento en `05_permisos_mysql.sql`.

**Nota (2026-10-25, spec 21):** `GET /esquemas-captura/{id}` no devuelve la `etiqueta` de cada desagregación (`aDesagregacion` en `esquemas.service.js` solo pasa `dimension` y `valores`), así que la vista previa siempre muestra el `nombre` del catálogo. El spec de HU-19 la agrega a la respuesta (general y por dosis), con su contrato y su prueba; debe quedar hecho y probado antes de HU-20, porque `armarFormulario` (SPEC 21) ya la usa si viene.

**Nota (2026-10-25, spec 23):** la parte de las dosis inactivas se cumplió en HU-20: el formulario oculta una dosis inactiva salvo que el reporte ya tenga filas de ella, y `PUT /reportes/{id}/vacunas/{vacunaId}` la rechaza con 422 en el mismo caso.

#### HU-20. Capturar la producción con el formulario dinámico

> **Como** personal del establecimiento, **quiero** llenar la producción por vacuna, dosis y grupo de edad, y por sexo u otra dimensión solo en las vacunas que la usan, en un formulario generado desde el esquema vigente, **para** reemplazar el proceso físico de envio del formulario 5C físico y la digitación posterior en Excel.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 13 | S2 | Luis Suárez |

**Cómo se hará:** Endpoint `GET /reportes/{id}/formulario` que arma el formulario desde MongoDB; componente React que lo dibuja por secciones; se guarda en `reporte_vacuna`, `detalle_produccion` y `detalle_dimension`.

**Criterios de aceptación:**
- [x] El formulario muestra solo las dosis y dimensiones del esquema vigente de cada vacuna (por ejemplo, sexo solo en VPH y Tdap de 10 años, IPV u OPV en cada dosis de Polio).
- [x] Solo acepta cantidades enteras no negativas.
- [x] Los totales por fila y columna se calculan en pantalla.
- [x] No se guarda ningún dato personal de pacientes.
- [x] Una vacuna inactiva, o una dosis inactiva, no aparece en reportes nuevos; los reportes anteriores la conservan (viene de HU-10).

**Avance:** criterios cumplidos; queda terminada al integrar el spec 23 a `main`. Backend y frontend en `specs/23-hu-20-capturar-produccion.md`. Diferencias con la historia, porque mandan `AGENTS.md`, el modelo y lo que decidió el equipo:

- Solo se capturan las dosis aplicadas a **residentes del municipio del establecimiento** (la tarjeta A). Las de otros municipios y Migrantes (la tarjeta B) son de HU-21.
- **Guardar** entra aquí, aunque HU-22 nombra el endpoint: sin él no se comprueba la carga de cantidades ni la regla de las dosis inactivas. A HU-22 le queda el aviso de cambios sin guardar.
- «Del esquema vigente»: el formulario usa la versión fijada en el reporte (SPEC 22), aunque después se publique otra.
- **Vacía ≠ 0.** Una celda vacía no tiene fila en `detalle_produccion`; una con 0 sí. Vale igual en la tarjeta B, dentro de cada fila que agregue el Personal.
- El **total** no lo escribe el Personal: el backend guarda en `reporte_vacuna.total_declarado` la suma de las cantidades de la vacuna (de todas las procedencias) en cada guardado.
- Los **campos adicionales** del esquema se dibujan y se guardan en `datos_adicionales`, validados por tipo; «obligatorio» no impide guardar el borrador.

Endpoints:

- `GET /reportes/{id}/formulario` (`REPORTE_CONSULTAR`): por cada vacuna, su versión de esquema, todas sus celdas guardadas, sus datos adicionales y su total, más `editable` y el municipio propio;
- `PUT /reportes/{id}/vacunas/{vacunaId}` (`REPORTE_EDITAR`, nuevo, solo para el Personal de establecimiento): reemplaza las celdas del municipio propio de la vacuna y no toca las de otras procedencias. Valida contra el esquema y escribe `detalle_produccion` y `detalle_dimension` en una transacción, con `versionFila` y una fila `ACTUALIZAR` en la bitácora; si nada cambió, no escribe nada.

Solo se guarda en `BORRADOR` con el mes `ABIERTO` o `EN_CIERRE`. Errores: 400 `ENTRADA_INVALIDA`, 404, 409 `REPORTE_NO_EDITABLE`, `PERIODO_CERRADO` y `REPORTE_DESACTUALIZADO`, y 422 `CELDA_INVALIDA`, `CELDA_REPETIDA` y `DATO_ADICIONAL_INVALIDO`. Una dosis inactiva se oculta en el formulario y el `PUT` la rechaza, salvo que el reporte ya tenga filas de ella. Las celdas válidas las calcula `celdas.service.js` con la misma regla que `armarFormulario`, incluida la deducción de secciones de una versión sin `secciones` (Hexavalente v1).

La pantalla es la captura de `/registro` (`CapturaReporte.jsx`): una pestaña por vacuna con la tarjeta «Dosis aplicadas a residentes de {municipio}» y sus datos adicionales, las cantidades de todas las pestañas en memoria, y un «Guardar borrador» que manda un `PUT` por vacuna con cambios. Un reporte que no se puede editar se ve en solo lectura.

Verificado contra la API real el 2026-10-25, con `cs1201`:

- en el reporte 287 (octubre de 2026) se escribieron cantidades en BCG, Hexavalente v2 (con el campo adicional), VPH y Td (con la tabla aparte de su refuerzo), con ceros y celdas vacías; `2.5` marcó la celda y deshabilitó «Guardar borrador»;
- al guardar hubo 4 `PUT` en el orden del reporte y «Borrador guardado.». Al recargar, cada cantidad volvió a su celda, los ceros como «0» y las vacías vacías;
- la base quedó con 14 filas del municipio propio, cada una con `detalle_dimension` igual a su clave, `total_declarado` 25, 215, 21 y 28, `version_fila = 5` y 4 filas `ACTUALIZAR` de `cs1201`;
- septiembre (`APROBADO`) se vio en solo lectura con las cantidades de la semilla, sin las 6 celdas de Hexavalente de otros municipios;
- el formulario del reporte 218 (agosto, `CERRADO`, Hexavalente v1 sin `secciones`) armó la sección deducida «< 1 año» con las claves de sus celdas guardadas.

Las cantidades del reporte 287 quedan para HU-21, HU-22 y HU-25.

**Nota (2026-10-24, spec 18):** Para mostrar las etiquetas, el formulario necesita leer el catálogo de dimensiones; el spec decide si da `DIMENSION_CONSULTAR` al personal de establecimiento o si `GET /reportes/{id}/formulario` trae las etiquetas.

**Nota (2026-10-24, spec 19):** `GET /esquemas-captura/{id}` devuelve el esquema en camelCase con `secciones[].grupoEdad` y `dosis[].desagregacion` (`null` = la general); el formulario resuelve el vigente que aplica igual que `GET /esquemas-captura`.

**Nota (2026-10-24, spec 20):** El esquema de un periodo es el de la DDRISS del establecimiento (`VIGENTE` o `HISTORICO`) cuya vigencia cubre el día 1 del mes; si no hay, el nacional que la cubra. Un `VIGENTE` puede tener `desde` futuro (SPEC 20), así que no basta con buscar el `VIGENTE`. Esto corrige la nota del spec 19. También queda por decidir qué pasa con un reporte en borrador de un mes cuya versión cambió.

**Nota (2026-10-25, spec 21):** El formulario se arma con `armarFormulario` y se dibuja con `FormularioCaptura` (`componentes/formulario/`, SPEC 21), que ya calculan la `claveCombinacion` de cada celda y los totales; la captura agrega guardar, cargar las cantidades del reporte y las validaciones. El backend debe armar la `clave_combinacion` con la misma regla (dimensiones ordenadas por código, `codigo=valor` unidas con `|`). Para una versión publicada sin `secciones` (como Hexavalente v1, la de los reportes de la semilla) se pasa `deducirSecciones: true`. Antes de HU-20 debe estar la `etiqueta` de cada desagregación en `GET /esquemas-captura/{id}` (nota en HU-19).

**Nota (2026-10-25, spec 22):**
- Las vacunas y la versión del esquema de cada una se fijan al crear el reporte (`reporte_vacuna`, SPEC 22). El formulario usa esa versión aunque se publique otra: eso resuelve la duda de la nota del spec 20 sobre un borrador de un mes cuya versión cambió.
- Las dosis inactivas se ocultan, salvo que el reporte ya tenga cantidades de esa dosis.
- `GET /reportes/{id}` ya trae, de la versión del reporte, los nombres de las dosis (con `activa`) y las etiquetas de las dimensiones de cada vacuna (`vacunas[].dosis` y `vacunas[].dimensiones`), porque el Personal no tiene `DIMENSION_CONSULTAR` ni `VACUNA_CONSULTAR`. Esto responde la nota del spec 18.
- `GET /reportes/{id}/formulario` agrega el contenido del esquema y las cantidades guardadas.
- `esquemasDelPeriodo` (`esquemas.service.js`) resuelve el esquema por fecha, y la `etiqueta` de cada desagregación ya está en `GET /esquemas-captura/{id}`.

#### HU-21. Registrar el municipio de procedencia

> **Como** personal del establecimiento, **quiero** indicar las dosis aplicadas a personas de otros municipios, separadas del municipio propio, **para** que la dosis se atribuya al municipio correcto al calcular cobertura.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 5 | S2 | Kenneth García |

**Cómo se hará:** Filas por municipio de procedencia en el formulario (municipio propio, "otros municipios" y Migrantes); campo `municipio_procedencia_id` en `detalle_produccion`.

**Criterios de aceptación:**
- [x] Por defecto, la procedencia es el municipio del establecimiento.
- [x] Puedo agregar filas para otros municipios de San Marcos o para Migrantes (fuera de San Marcos o procedencia desconocida).
- [x] No se permite repetir la misma combinación de vacuna, dosis, dimensiones y procedencia.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 24 a `main`. Backend y frontend en `specs/24-hu-21-municipio-de-procedencia.md`. Diferencias con la historia, porque mandan `AGENTS.md`, el modelo y lo que decidió el equipo:

- «Otros municipios de San Marcos» son los municipios activos del **departamento sede de la DDRISS del establecimiento** (sale de `ddriss`, sin fijar San Marcos), sin el propio. Un municipio de otro departamento, como Coatepeque, no se elige: va como `9999`.
- **El modo de procedencia del esquema** decide qué se ofrece: con `MUNICIPIO_DETALLADO`, el territorio y el `9999` (solo si `permiteNoEspecificado` es `true`); con `PROPIO_Y_OTROS` (el 5C, como Hexavalente v1), solo el `9999`, porque el 5C no identifica el municipio y esas dosis no se atribuyen a ninguno.
- Las filas de la tarjeta B son **municipio + dosis + grupo de edad** (o sección), con las demás dimensiones como columnas, como el mockup. Solo existen en la pantalla: la base guarda celdas, y al cargar se agrupan. Una fila con todas sus celdas vacías no se guarda.
- «No se permite repetir»: el Dialog deshabilita la combinación que ya existe, y el backend sigue respondiendo 422 `CELDA_REPETIDA`.

Cambios a los endpoints del SPEC 23 (mismos permisos):

- `GET /reportes/{id}/formulario` agrega `municipios` (los nombres del territorio, el `9999` y los municipios de las celdas guardadas, sin el propio) y, en cada vacuna, `procedenciasPermitidas`, calculadas en el backend (`procedencias.service.js`).
- `PUT /reportes/{id}/vacunas/{vacunaId}` acepta cualquier procedencia permitida y reemplaza **todas** las celdas de la vacuna, de cualquier procedencia. Una procedencia que ya no se ofrece (un municipio desactivado, el `9999` sin `permiteNoEspecificado`, otro departamento) es **heredada**: se acepta solo si la vacuna ya tenía filas de ella, como las dosis inactivas. Si no, 422 `CELDA_INVALIDA` («…tiene una procedencia que no se puede usar en esta vacuna.»).

La pantalla es la tarjeta «Dosis aplicadas a personas de otros municipios» de cada pestaña de `/registro` (`TarjetaProcedencias.jsx`): una tabla por cada tabla de la tarjeta A (el refuerzo de Td aparte), el total por fila, «+ Agregar municipio de procedencia» con un Dialog de tres Select y «Quitar fila». «Guardar borrador» manda en el mismo `PUT` las celdas de las dos tarjetas. En solo lectura no hay «Agregar» ni «Quitar fila».

Verificado contra la API real el 2026-10-26, con `cs1201`, en el reporte 287 (octubre de 2026):

- el Dialog ofreció los 29 municipios de San Marcos sin el propio y Migrantes al final, sin Coatepeque; al repetir Sibinal con la Primera dosis, «< 1 año» apareció deshabilitado;
- en Hexavalente se agregaron Sibinal · Primera dosis (< 1 año: 3; De 1 a < 6 años: 0), Migrantes · Tercera dosis · < 1 año (1) y San Pedro Sacatepéquez · Segunda dosis, vacía; en Td, Tacaná · Primer refuerzo · Mujer de 15 a 49 años (2), en la tabla aparte del refuerzo; `2.5` marcó la celda y deshabilitó «Guardar borrador»;
- al guardar hubo 2 `PUT` (Hexavalente y Td): la base quedó con 4 filas de otras procedencias, cada una con su `municipio_procedencia_id` y `detalle_dimension` igual a su clave, sin la fila vacía; `total_declarado` 219 y 30, `version_fila = 7` y 2 filas `ACTUALIZAR` con la procedencia en cada clave;
- al recargar, las filas volvieron en orden (Migrantes al final), con el 0 como «0» y sin la fila vacía; al quitar la fila de Sibinal De 1 a < 6 años y guardar, su celda se borró (`ACTUALIZAR` con `null`);
- septiembre (`APROBADO`) mostró en solo lectura las 6 celdas de la semilla de San Pedro Sacatepéquez y Migrantes agrupadas en filas.

El modo `PROPIO_Y_OTROS` no se probó a mano porque ningún reporte editable lo usa; lo cubren `procedencia.test.js` y `TarjetaProcedencias.test.jsx`. Las cantidades del reporte 287 quedan para HU-22 y HU-25.

**Nota (2026-10-25, spec 21):** La vista previa (SPEC 21) solo describe el modo de procedencia; la tarjeta B se agrega a `FormularioCaptura`.

**Nota (2026-10-25, spec 23):**
- `PUT /reportes/{id}/vacunas/{vacunaId}` (SPEC 23) solo acepta celdas del municipio del establecimiento (422 `CELDA_INVALIDA` con otro) y no toca las celdas de otras procedencias que ya existen, como las de la semilla. HU-21 lo extiende para reemplazar también las celdas que maneje la tarjeta B.
- `GET /reportes/{id}/formulario` ya trae todas las celdas de la vacuna, de cualquier procedencia; la tarjeta A de `CapturaReporte.jsx` solo dibuja las del municipio propio.
- La diferencia entre vacía y 0 también vale en la tarjeta B, dentro de cada fila que agrega el Personal. Una procedencia que no se agregó no tiene filas y no pide ceros.
- `total_declarado` ya suma las cantidades de todas las procedencias.

#### HU-22. Guardar el borrador y continuar después

> **Como** personal del establecimiento, **quiero** guardar lo capturado sin enviarlo y retomarlo más tarde, **para** no perder trabajo si me interrumpen.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 3 | S2 | Kenneth García |

**Cómo se hará:** Endpoint `PUT /reportes/{id}/vacunas/{vacuna}` que guarda parcialmente; el reporte sigue en Borrador.

**Criterios de aceptación:**
- [x] Al volver a abrir el reporte veo los datos guardados.
- [x] Solo puedo editar el reporte mientras está en Borrador.
- [x] El sistema avisa si salgo con cambios sin guardar.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 25 a `main`. Solo frontend, en `specs/25-hu-22-guardar-borrador-y-continuar.md`. Los dos primeros criterios los cumplió el spec 23 (ver la nota de abajo), y el aviso, el spec 25. Diferencias con la historia, porque mandan `AGENTS.md` y lo que decidió el equipo:

- El `PUT /reportes/{id}/vacunas/{vacunaId}` del «Cómo se hará» ya existía (SPEC 23 y SPEC 24): este spec no cambia el backend ni el contrato.
- «Salir» es ir a otra pantalla de la app (el menú, «Cambiar contraseña», el botón Atrás del navegador), cambiar de mes en `/registro`, cerrar sesión y cerrar o recargar la pestaña. No avisan «Recargar reporte» después de un 409 (lo escrito ya no se puede guardar) ni el cierre automático de la sesión (un 401).
- El aviso tiene «Seguir editando» y «Salir sin guardar», sin «Guardar y salir». Para el navegador es su diálogo nativo (`beforeunload`).
- «Cambios sin guardar» es la misma regla que habilita «Guardar borrador»: agregar una fila vacía en la tarjeta B no cuenta, y sigue contando mientras se guarda o si un guardado falló a la mitad.

La app pasó a un data router (`createBrowserRouter` con una ruta comodín en `main.jsx`) para usar `useBlocker`. El aviso es `useAvisoCambiosSinGuardar(hayCambios)` (`componentes/AvisoCambiosSinGuardar.jsx`), que anota los cambios en `ProveedorCambiosPendientes` (en el `Layout`). Con ese proveedor, «Cerrar sesión» pide su propia confirmación. En `/registro`, junto a «Guardar borrador», una insignia dice «Cambios sin guardar», «Guardado a las HH:MM» o «Último cambio: DD/MM/AAAA HH:MM» (`actualizadoEn` del reporte), y cada pestaña con cambios lleva un punto. En solo lectura no hay insignia, marcas ni aviso.

Verificado contra la API real el 2026-10-26, con `cs1201`, en el reporte 287 (octubre de 2026):

- al abrir, la insignia decía «Último cambio: 26/10/2026 18:40»; al escribir un 5 en Hexavalente aparecieron «Cambios sin guardar» y el punto en su pestaña;
- con ese cambio, «Inicio» en el menú, elegir septiembre en el Select y el botón Atrás abrieron el diálogo, que nombró Hexavalente, y «Seguir editando» dejó la ruta, el mes y el 5; «Cerrar sesión» abrió el suyo y la sesión siguió abierta; recargar la pestaña mostró el diálogo nativo, y al cancelarlo el 5 seguía;
- «Guardar borrador» mostró «Guardado a las 19:34», quitó el punto, y después el menú navegó sin diálogo. La base quedó con la celda en 5, `version_fila = 9` y una fila `ACTUALIZAR` (4 → 5);
- al volver a `/registro`, el 5 seguía y la insignia decía «Último cambio: 26/10/2026 19:34». Otro cambio descartado con el botón Atrás y «Salir sin guardar» llevó a `/inicio` y no llegó a la base;
- septiembre (`APROBADO`) se vio en solo lectura, sin insignia, marcas ni «Guardar borrador», y se llegó a él sin diálogo. «Cambiar contraseña» y el botón Atrás navegaron como antes con el data router.

«Cerrar sesión sin guardar» no se probó a mano para no cerrar la sesión de la prueba; lo cubre `Layout.test.jsx`.

**Nota (2026-10-25, spec 23):** guardar, retomar y «solo en Borrador» ya los cumple HU-20 (SPEC 23): `PUT /reportes/{id}/vacunas/{vacunaId}` guarda las cantidades de una vacuna, «Guardar borrador» de `/registro` manda un `PUT` por vacuna con cambios, y al recargar se ven los datos guardados. Solo se guarda en `BORRADOR` con el mes `ABIERTO` o `EN_CIERRE` (409 si no), y un reporte que no se puede editar se ve en solo lectura. Queda el aviso de cambios sin guardar: `CapturaReporte.jsx` ya sabe qué vacunas cambiaron (compara lo escrito con lo cargado o guardado).

#### HU-23. Consultar mis reportes y su estado

> **Como** personal del establecimiento, **quiero** ver la lista de mis reportes con su periodo y estado, **para** saber qué tengo pendiente, enviado o devuelto.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 3 | S2 | Andrea López |

**Cómo se hará:** Endpoint `GET /reportes` filtrado por el establecimiento del usuario; tabla en React con etiquetas de estado.

**Criterios de aceptación:**
- [x] Veo cada reporte con su periodo, estado y fecha de último cambio.
- [x] Puedo filtrar por año y estado.
- [x] Los reportes devueltos para corrección se destacan.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 26 a `main`. Backend y frontend, en `specs/26-hu-23-mis-reportes.md`: la pantalla «Mis reportes» (`/reportes`) con el permiso `REPORTE_CONSULTAR`. Diferencias con la historia, porque mandan `AGENTS.md` y lo que decidió el equipo:

- El `GET /reportes` del «Cómo se hará» ya existía (SPEC 22): este spec le agrega el filtro `anio` y, en cada reporte, `estadoDesde`, `correccion` y `periodo.estado`.
- La «fecha de último cambio» es la del último cambio de **estado** (`historial_estado_reporte`), no la del último guardado de cantidades.
- Se destacan, con el comentario del revisor, los reportes en `CORRECCION_SOLICITADA`; al retomarlos (pasan a Borrador, HU-26) dejan de destacarse.
- «Abrir» lleva a `/registro?periodo=` solo en los meses `ABIERTO`, porque `/registro` solo carga esos. No se listan los meses abiertos sin reporte: eso se ve en `/registro`.

### Sprint 3 (14/10 – 23/10): Validación, revisión y cierre

#### HU-24. Configurar reglas de validación

> **Como** administrador, **quiero** definir reglas de validación de tipo error o advertencia por vacuna, **para** ajustar los controles de calidad sin programar de nuevo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 8 | S3 | Luis Suárez |

**Cómo se hará:** Colección `reglas_validacion` en MongoDB con reglas declarativas (tipo, parámetros, severidad, territorio) y versión.

**Criterios de aceptación:**
- [ ] Puedo crear reglas de tipo error (bloquean el envío) o advertencia (solo avisan).
- [ ] Puedo activar o desactivar una regla.
- [ ] Cada regla tiene versión y queda en el historial de configuración.

#### HU-25. Validar automáticamente el reporte

> **Como** personal del establecimiento, **quiero** que el sistema revise mi reporte y me muestre errores y advertencias, **para** corregir los problemas antes de enviarlo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 8 | S3 | Christian Ramírez |

**Cómo se hará:** Endpoint `POST /reportes/{id}/validar`; motor de reglas en el backend que lee las reglas vigentes y guarda los resultados en `resultado_validacion`.

**Criterios de aceptación:**
- [ ] Se detectan campos obligatorios vacíos, cantidades negativas, totales que no cuadran y duplicados.
- [ ] Cada resultado indica la vacuna, dosis y regla que lo generó.
- [ ] Los errores y las advertencias se muestran con colores distintos.

**Nota (2026-10-25, spec 23):**
- **Vacía ≠ 0.** Una celda vacía no tiene fila en `detalle_produccion`; una con 0 sí (SPEC 23). `CAMPOS_COMPLETOS` (`cero_explicito: true` en el 02) revisa todas las celdas de la tarjeta A y, en la B, solo las de las filas que agregó el Personal, nunca combinaciones de municipios sin fila.
- **Total.** `reporte_vacuna.total_declarado` lo calcula el backend: es la suma del detalle, no un dato que escribe el Personal. El campo adicional `total_dosis_declarado` de Hexavalente v2 sigue en esa versión publicada, que no se edita: quitarlo pide publicar otra.
- **Obligatorio.** Un campo adicional con `requerido` no impide guardar el borrador; lo exige la validación.
- **Ya garantizado por el `PUT`.** Las cantidades negativas, las celdas que no son del esquema y las repetidas ya no se pueden guardar (400 y 422).

**Nota (2026-10-26, spec 24):**
- Las filas de la tarjeta B solo existen en la pantalla. Para el backend, una fila es (procedencia, dosis, sección) con al menos una celda guardada, y sus celdas que faltan son vacías. Así debe revisar `CAMPOS_COMPLETOS` la tarjeta B, nunca combinaciones de municipios sin filas. La sección de una celda se deduce de su `grupo_edad` (o es la única sección).
- `PROCEDENCIA_VALIDA` puede reutilizar `procedencias.service.js` (`leerProcedencias` y `procedenciasPermitidas`). Las procedencias heredadas (un municipio desactivado, el `9999` sin `permiteNoEspecificado`) ya se aceptan al guardar si la vacuna tenía filas de ellas: la regla decide si las marca como advertencia.

#### HU-26. Enviar el reporte

> **Como** personal del establecimiento, **quiero** enviar mi reporte a la DDRISS, **para** que la estadígrafa lo revise.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 3 | S3 | Luis Suárez |

**Cómo se hará:** Endpoint `POST /reportes/{id}/transiciones` con la acción ENVIAR; tabla `transicion_estado` define qué rol puede hacer cada cambio.

**Criterios de aceptación:**
- [ ] Solo puedo enviar si no hay errores de validación.
- [ ] Puedo enviar con advertencias, pero quedan visibles para el revisor.
- [ ] Al enviar, el reporte pasa a Enviado y ya no puedo editarlo.

**Nota (2026-10-26, spec 25):** «Enviar a revisión» no debe enviar con cambios sin guardar: la validación y el envío leen lo guardado, no lo que se ve. `CapturaReporte.jsx` ya los calcula (`conCambios`, la misma regla que habilita «Guardar borrador» y el aviso al salir). El botón puede deshabilitarse con ellos o guardar antes de enviar.

#### HU-27. Bandeja de revisión y asignación de revisor

> **Como** estadígrafa o revisor de la DDRISS, **quiero** ver los reportes enviados y asignármelos o asignarlos a otro revisor, **para** organizar la revisión del mes.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 5 | S3 | Kenneth García |

**Cómo se hará:** Pantalla de bandeja con filtros por periodo, municipio y estado; la asignación llena `revisor_id` y `asignado_en` y pasa el reporte a En revisión.

**Criterios de aceptación:**
- [ ] Veo los reportes enviados de mi DDRISS ordenados por fecha de envío.
- [ ] Al asignar un revisor, el reporte pasa a En revisión.
- [ ] Puedo filtrar por periodo, municipio y estado.

#### HU-28. Revisar y solicitar corrección

> **Como** estadígrafa o revisor de la DDRISS, **quiero** revisar el detalle de un reporte y devolverlo con observaciones, **para** que el establecimiento corrija las inconsistencias.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 5 | S3 | Andrea López |

**Cómo se hará:** Vista de detalle con resultados de validación; endpoint `POST /reportes/{id}/observaciones`; transición a Corrección solicitada, que regresa el reporte a Borrador.

**Criterios de aceptación:**
- [ ] Puedo escribir observaciones generales o por vacuna.
- [ ] Al devolverlo, el reporte vuelve a Borrador y el establecimiento ve las observaciones.
- [ ] No puedo devolver un reporte sin escribir al menos una observación.

#### HU-29. Corregir y reenviar un reporte devuelto

> **Como** personal del establecimiento, **quiero** ver las observaciones del revisor, corregir y reenviar, **para** completar el ciclo de revisión.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 3 | S3 | Christian Ramírez |

**Cómo se hará:** Las observaciones se muestran junto al formulario; al reenviar se repiten las validaciones.

**Criterios de aceptación:**
- [ ] Veo cada observación junto a la vacuna a la que se refiere.
- [ ] Al reenviar, el sistema vuelve a validar el reporte.
- [ ] El historial guarda cada envío y cada devolución.

#### HU-30. Aprobar un reporte

> **Como** estadígrafa o revisor de la DDRISS, **quiero** aprobar un reporte que pasó la revisión, **para** marcarlo como información válida.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 2 | S3 | Luis Suárez |

**Cómo se hará:** Transición APROBAR desde En revisión mediante `POST /reportes/{id}/transiciones`.

**Criterios de aceptación:**
- [ ] Solo puedo aprobar reportes En revisión asignados a mí o a mi DDRISS.
- [ ] El reporte aprobado ya no se puede editar.
- [ ] La aprobación queda con fecha y usuario en el historial.

#### HU-31. Cerrar el periodo

> **Como** estadígrafa o revisor de la DDRISS, **quiero** cerrar un periodo cuando sus reportes están aprobados, **para** que la información del mes quede fija y sirva de base para indicadores e informes.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 5 | S3 | Kenneth García |

**Cómo se hará:** Tarea programada (cron) que al vencer la fecha límite pasa `cierre_periodo` de ABIERTO a EN_CIERRE; endpoint `POST /periodos/{id}/cerrar` para el cierre final, que pasa los reportes aprobados a Cerrado y dispara el cálculo de indicadores.

**Criterios de aceptación:**
- [ ] Al vencer la fecha límite de envío, la entrega se cierra automáticamente: no se crean reportes nuevos, pero los que están en revisión o devueltos siguen su ciclo.
- [ ] El cierre final lo hace la estadígrafa; el sistema muestra cuántos reportes faltan por aprobar antes de cerrar.
- [ ] Al cerrar, todos los reportes aprobados del periodo pasan a Cerrado.
- [ ] Un reporte cerrado no se edita por el procedimiento ordinario.

**Nota (2026-10-23, spec 16):** Ampliar la fecha límite de un mes `EN_CIERRE` a hoy o después lo devuelve a `ABIERTO` (`PATCH /periodos/{id}`, SPEC 16); la tarea programada debe volver a revisarlo con la fecha nueva.

#### HU-32. Solicitar una rectificación

> **Como** personal del establecimiento, **quiero** pedir la corrección de un reporte ya cerrado indicando la justificación y los cambios, **para** corregir un error detectado después del cierre.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Personal de establecimiento | 5 | S3 | Andrea López |

**Cómo se hará:** Endpoint `POST /reportes/{id}/rectificaciones`; tablas `solicitud_rectificacion` y `rectificacion_detalle` con valores anteriores y nuevos.

**Criterios de aceptación:**
- [ ] Solo puedo solicitar rectificación de reportes Cerrados.
- [ ] La justificación es obligatoria.
- [ ] La solicitud muestra el valor anterior y el nuevo de cada dato.

#### HU-33. Resolver una rectificación

> **Como** estadígrafa o revisor de la DDRISS, **quiero** aprobar o rechazar las solicitudes de rectificación, **para** controlar los cambios a información cerrada.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 3 | S3 | Kenneth García |

**Cómo se hará:** Bandeja de rectificaciones; al aprobar, se aplican los cambios, el reporte regresa a Cerrado y se recalculan los indicadores afectados.

**Criterios de aceptación:**
- [ ] Al aprobar, los datos cambian y el reporte vuelve a Cerrado.
- [ ] Al rechazar, debo indicar el motivo y los datos no cambian.
- [ ] Toda rectificación queda en la bitácora con valores anteriores y nuevos.

#### HU-34. Historial de estados del reporte

> **Como** estadígrafa o revisor de la DDRISS, **quiero** ver la línea de tiempo de estados de un reporte, **para** saber quién hizo cada cambio y cuándo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 3 | S3 | Andrea López |

**Cómo se hará:** Endpoint `GET /reportes/{id}/historial`; tabla `historial_estado_reporte` que se llena automáticamente en cada transición.

**Criterios de aceptación:**
- [ ] Cada cambio de estado muestra estado anterior, nuevo, usuario, fecha y comentario.
- [ ] El historial no se puede editar ni borrar.
- [ ] El personal del establecimiento puede ver el historial de sus propios reportes.

### Sprint 4 (24/10 – 02/11): Indicadores, análisis y visualización

#### HU-35. Configurar indicadores

> **Como** integrante de Epidemiología, **quiero** configurar cada indicador (numerador, denominador, meta y prorrateo mensual) para las vacunas, **para** que el cálculo siga el método de la DDRISS y se pueda ajustar sin programar.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 5 | S4 | Christian Ramírez |

**Cómo se hará:** Colección `configuracion_indicadores` en MongoDB con versión; prorrateo `MENSUAL_LINEAL` (población ÷ 12 × número de mes).

**Criterios de aceptación:**
- [ ] Puedo definir la meta de cada indicador.
- [ ] Puedo indicar qué dosis cuenta para el numerador (la que completa el esquema, es decir, la última dosis sin refuerzos).
- [ ] Puedo definir los umbrales del semáforo que usa el mapa.
- [ ] Un cambio de configuración crea una versión nueva y no altera resultados anteriores.

#### HU-36. Calcular la cobertura contra la meta del mes

> **Como** integrante de Epidemiología, **quiero** obtener la cobertura acumulada por vacuna y municipio comparada con la meta del mes, **para** saber si cada municipio va al día con su meta.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 8 | S4 | Christian Ramírez |

**Cómo se hará:** Servicio de cálculo en el backend; endpoint `POST /indicadores/corridas`; usa solo reportes cerrados y la vista `v_produccion_atribuida` (Excel 3); guarda en `corrida_calculo` y `resultado_indicador`.

**Criterios de aceptación:**
- [ ] Meta del mes = población ÷ 12 × número de mes, y el avance es dosis acumuladas ÷ meta del mes × 100.
- [ ] Las dosis se asignan al municipio de residencia (procedencia); las de Migrantes no cuentan para la cobertura y las del Hospital de San Marcos sí.
- [ ] Un caso de prueba con datos conocidos (por ejemplo, 541 de población a junio ≈ 270 dosis) da el resultado esperado.
- [ ] Cada resultado guarda la versión de configuración usada.

#### HU-37. Calcular la brecha de dosis

> **Como** integrante de Epidemiología, **quiero** ver cuántas dosis faltan para alcanzar la meta, **para** planificar acciones de vacunación donde más se necesitan.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 3 | S4 | Christian Ramírez |

**Cómo se hará:** Se calcula en la misma corrida de indicadores: brecha = meta − dosis acumuladas.

**Criterios de aceptación:**
- [ ] La brecha se muestra por vacuna y municipio.
- [ ] Si se superó la meta, la brecha se muestra como 0 y se indica el excedente.

#### HU-38. Calcular la tasa de deserción entre dosis

> **Como** integrante de Epidemiología, **quiero** conocer la deserción entre la primera y la última dosis de una vacuna, **para** identificar municipios donde la gente no completa el esquema.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 5 | S4 | Luis Suárez |

**Cómo se hará:** Indicador configurado en MongoDB: (primera dosis − última dosis) ÷ primera dosis × 100.

**Criterios de aceptación:**
- [ ] Se calcula por vacuna, municipio y periodo.
- [ ] Si no hay primeras dosis, el indicador se muestra como no calculable, sin error.

#### HU-39. Proyectar la cobertura al cierre del año

> **Como** integrante de Epidemiología, **quiero** ver una proyección de la cobertura al final del año según el ritmo actual, **para** anticipar qué municipios no llegarán a la meta.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 8 | S4 | Luis Suárez |

**Cómo se hará:** Proyección lineal en el backend a partir del promedio mensual de dosis; se guarda como resultado de tipo estimación.

**Criterios de aceptación:**
- [ ] La proyección se muestra claramente marcada como estimación, distinta de los datos reales.
- [ ] Se recalcula al cerrar cada periodo.
- [ ] Se explica el método en una nota visible en pantalla.

#### HU-40. Dashboard por rol

> **Como** integrante de Epidemiología o autoridad, **quiero** ver un resumen de la información más importante al entrar al sistema, **para** conocer la situación general sin entrar a cada pantalla.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología / Autoridad | 5 | S4 | Kenneth García |

**Cómo se hará:** Pantalla inicial en React con tarjetas (componente Card de shadcn/ui): reportes pendientes, avance general y alertas activas según el rol.

**Criterios de aceptación:**
- [ ] La pantalla muestra solo tarjetas de resumen, sin gráficas pesadas.
- [ ] El contenido cambia según el rol (por ejemplo, el establecimiento ve sus reportes pendientes).
- [ ] Carga en menos de 3 segundos con datos de prueba.

#### HU-41. Pantalla de indicadores con gráficas y filtros

> **Como** integrante de Epidemiología, **quiero** consultar los indicadores en tablas y gráficas filtrando por vacuna, municipio, distrito y periodo, **para** analizar la cobertura con detalle.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 8 | S4 | Kenneth García |

**Cómo se hará:** Pantalla de indicadores con gráficas de Recharts a través del componente Chart de shadcn/ui (toman los colores del tema); endpoint `GET /indicadores/resultados` con filtros.

**Criterios de aceptación:**
- [ ] Puedo filtrar por vacuna, municipio, distrito y rango de meses.
- [ ] Veo cobertura, meta, brecha y deserción en tabla y gráfica.
- [ ] Los datos proyectados se dibujan con un estilo distinto a los reales.

#### HU-42. Mapa territorial con semáforo

> **Como** integrante de Epidemiología o autoridad, **quiero** ver un mapa de los municipios de San Marcos coloreado según su avance contra la meta del mes, **para** detectar de un vistazo las zonas con cobertura baja.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología / Autoridad | 8 | S4 | Andrea López |

**Cómo se hará:** Mapa con Leaflet y GeoJSON de los 30 municipios; el color sale de los resultados de indicadores; umbrales tomados de `configuracion_indicadores` (provisional: coral < 80 %, durazno 80-90 %, verde pastel ≥ 90 %, en tonos suaves en lugar de rojo, amarillo y verde intensos). Los límites salen de `frontend/public/geo/san-marcos.geojson` (adaptado del COD-AB de CONRED/OCHA publicado en HDX, licencia CC BY 3.0 IGO; detalle en `frontend/public/geo/FUENTES.md`), y cada polígono se une con los resultados por `codigo_ine`.

**Criterios de aceptación:**
- [ ] Cada municipio se colorea según su avance para la vacuna y el mes elegidos.
- [ ] Al pasar o hacer clic sobre un municipio veo dosis, meta, avance y brecha.
- [ ] Los umbrales del semáforo se toman de la configuración del indicador (HU-35), no están fijos en el código.
- [ ] El mapa muestra siempre, en su control de atribución, el crédito de los límites con el enlace a la fuente, el enlace a la licencia CC BY 3.0 IGO y la indicación "adaptado", además del crédito de Leaflet.
- [ ] El sistema tiene una sección de créditos con la fuente completa de los límites, los cambios hechos y la nota de que son límites de referencia, no límites legales oficiales; no usa logos de CONRED, OCHA, HDX ni de las Naciones Unidas.

**Avance:** el GeoJSON está en `frontend/public/geo/` desde el 2026-10-20, con su `FUENTES.md`. Se tomó `gtm_admin2.geojson` del conjunto COD-AB de Guatemala (v01, CONRED/OCHA, en HDX) y se dejaron solo los 30 municipios de San Marcos con los atributos `codigo_ine` y `nombre`. Los contornos se simplificaron al 20 % con mapshaper (1676 vértices, unos 40 KB). Los metadatos de fuente, licencia y cambios van en el propio archivo y en `FUENTES.md`. Los 30 códigos coinciden con `municipio.codigo_ine` (1201 a 1230) en código y nombre, y al unir los municipios queda un solo polígono sin huecos. Falta la pantalla del mapa, la unión con los resultados de indicadores (HU-36) y el crédito en pantalla.

#### HU-43. Comparar cobertura entre periodos

> **Como** integrante de Epidemiología, **quiero** comparar la cobertura entre meses y entre años, **para** ver si la situación mejora o empeora.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 5 | S4 | Andrea López |

**Cómo se hará:** Gráfica de líneas de Recharts (componente Chart de shadcn/ui) en la pantalla de indicadores, con series por periodo.

**Criterios de aceptación:**
- [ ] Puedo elegir dos o más periodos para comparar.
- [ ] La gráfica muestra la evolución mensual de la cobertura real de una vacuna y municipio (no la proyección, que es HU-39).

#### HU-44. Señalar coberturas mayores al 100 %

> **Como** integrante de Epidemiología, **quiero** identificar fácilmente y evaluar coberturas mayores al 100 %, **para** revisar si hay errores en la población o en los registros.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 2 | S4 | Luis Suárez |

**Cómo se hará:** Regla en el cálculo de indicadores que marca el resultado y genera una advertencia.

**Criterios de aceptación:**
- [ ] Toda cobertura mayor a 100 % aparece marcada en tablas y mapa.
- [ ] La marca indica que debe revisarse el denominador o los registros.

### Sprint 5 (03/11 – 12/11): Reportes, alertas y auditoría

#### HU-45. Generar informes con filtros

> **Como** estadígrafa o integrante de Epidemiología, **quiero** generar informes de producción por departamento, municipio, distrito, establecimiento y vacuna, filtrando por rango de meses y uno o varios municipios, **para** dejar de consolidar a mano los Excel actuales.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / Epidemiología | 8 | S5 | Kenneth García |

**Cómo se hará:** Pantalla de informes; consultas sobre `v_consolidado_establecimiento` (Excel 1 y 2) y `v_produccion_atribuida` (Excel 3); solo usa reportes cerrados salvo que se indique lo contrario.

**Criterios de aceptación:**
- [ ] Puedo generar los tres informes que hoy hace la estadígrafa: producción a la población propia (Excel 1), producción total con Migrantes (Excel 2) y dosis por municipio de residencia (Excel 3).
- [ ] Puedo elegir mes inicial y final y uno o varios municipios.
- [ ] Puedo elegir el nivel: departamento, municipio, distrito o establecimiento.
- [ ] Los totales coinciden con la suma de los reportes cerrados del periodo.

#### HU-46. Agrupar el informe por una dimensión

> **Como** estadígrafa o revisor de la DDRISS, **quiero** agrupar los totales del informe por sexo u otra dimensión, **para** obtener, por ejemplo, el total de niñas y de niños sin perder el detalle guardado.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 5 | S5 | Andrea López |

**Cómo se hará:** Parámetro de agrupación en la consulta del informe sobre `v_produccion_dimension`; la agrupación por sexo aplica a las vacunas que registran sexo (VPH y Tdap de 10 años).

**Criterios de aceptación:**
- [ ] Al agrupar por sexo, el informe suma todas las edades de cada sexo (ejemplo: 5 + 6 + 3 niñas = 14).
- [ ] Puedo cambiar la agrupación sin volver a generar el filtro.
- [ ] El detalle original no se modifica.

#### HU-47. Exportar informes a Excel

> **Como** estadígrafa o integrante de Epidemiología, **quiero** descargar cualquier informe generado al formato Excel, **para** trabajar los datos como lo hago hoy y compartirlos.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / Epidemiología | 5 | S5 | Luis Suárez |

**Cómo se hará:** Generación de .xlsx en el backend con ExcelJS, respetando los permisos y la DDRISS del usuario; botón de exportación en cada informe.

**Criterios de aceptación:**
- [ ] El archivo respeta los filtros y la agrupación elegidos.
- [ ] Incluye encabezado con título, periodo y fecha de generación.
- [ ] Los números se exportan como números, no como texto.

#### HU-48. Exportar informes a PDF

> **Como** integrante de Epidemiología o autoridad, **quiero** descargar un informe generado al formato PDF, **para** presentarlo o archivarlo en un formato que no se edita.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología / Autoridad | 3 | S5 | Christian Ramírez |

**Cómo se hará:** Generación de PDF en el backend con pdfmake, con la fuente IBM Plex Sans para que se vea como la aplicación.

**Criterios de aceptación:**
- [ ] El PDF incluye título, filtros usados, tabla y fecha de generación.
- [ ] El contenido coincide con el que se ve en pantalla.

#### HU-49. Informe acumulado anual

> **Como** integrante de Epidemiología, **quiero** generar el reporte acumulado anual por vacuna y municipio, **para** presentar los resultados al cierre del año.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 3 | S5 | Kenneth García |

**Cómo se hará:** Informe que suma los 12 periodos cerrados y los compara con la población anual.

**Criterios de aceptación:**
- [ ] Muestra dosis acumuladas, población, cobertura anual y brecha.
- [ ] Advierte si algún periodo del año no está cerrado.

#### HU-50. Alertas de reportes pendientes y de proceso

> **Como** estadígrafa o revisor de la DDRISS, **quiero** recibir alertas de establecimientos sin reporte, reportes sin revisar y el periodo actual por cerrar, **para** dar seguimiento a tiempo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Estadígrafa / revisor | 5 | S5 | Christian Ramírez |

**Cómo se hará:** Tarea programada (cron) en el backend que revisa fechas límite y estados y guarda en la tabla `alerta`.

**Criterios de aceptación:**
- [ ] Se genera una alerta cuando un establecimiento que envía el 5C no envió su reporte al vencer la fecha límite.
- [ ] Se genera una alerta cuando un reporte lleva más de N días sin revisar; N es un valor fijo definido en el backend (pendiente de confirmar con la estadígrafa).
- [ ] No se duplican alertas del mismo tipo para el mismo reporte.

#### HU-51. Alertas de cobertura y de calidad

> **Como** integrante de Epidemiología, **quiero** recibir alertas cuando un municipio queda bajo la meta o hay datos sospechosos, **para** actuar a tiempo en los municipios con problemas.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Epidemiología | 5 | S5 | Andrea López |

**Cómo se hará:** Se generan al terminar cada corrida de indicadores y se guardan en `alerta` con su DDRISS.

**Criterios de aceptación:**
- [ ] Se crea una alerta cuando el avance de un municipio queda en el rango más bajo del semáforo (menos de 80 %, provisional).
- [ ] Se crea una alerta cuando la cobertura supera el 100 %.
- [ ] Cada alerta indica municipio, vacuna, periodo y valor.

#### HU-52. Consultar y atender alertas

> **Como** usuario del sistema, **quiero** ver mis alertas y marcarlas como atendidas, **para** llevar control de lo que ya revisé.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles (según permiso) | 2 | S5 | Luis Suárez |

**Cómo se hará:** Icono de alertas en la barra de navegación; endpoint `GET /alertas` filtrado por `rol_destino_id` y ámbito del usuario; acción para marcarlas.

**Criterios de aceptación:**
- [ ] Veo solo las alertas dirigidas a mi rol, dentro de mi establecimiento o DDRISS.
- [ ] Puedo filtrar por tipo y estado.
- [ ] Al marcar una alerta como atendida, se guarda quién y cuándo.

#### HU-53. Registrar la bitácora de auditoría

> **Como** administrador, **quiero** que el sistema registre automáticamente cada acción importante, **para** tener evidencia de quién hizo qué y cuándo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 5 | S5 | Luis Suárez |

**Cómo se hará:** Función `registrarBitacora` del servicio de auditoría, que cada servicio llama dentro de la misma transacción del cambio, para que la fila se confirme o se revierta junto con él. Escribe en la tabla `bitacora` (usuario, acción, módulo, elemento, valores anteriores y nuevos, fecha, IP y agente). Módulos y acciones salen de constantes validadas. Los campos sensibles se quitan solos. Triggers de MySQL impiden modificar o borrar filas, y no hay rutas de edición ni de borrado.

**Criterios de aceptación:**
- [x] Se registran los inicios y cierres de sesión, toda escritura (usuarios, catálogos, producción, estados y configuración, incluida la de MongoDB), las exportaciones y los accesos denegados (403); cada historia registra sus propias escrituras.
- [x] Ninguna función del sistema ni ninguna sentencia SQL permite modificar o borrar la bitácora.
- [x] Cada registro guarda los valores anteriores y nuevos cuando aplica: el objeto creado al crear y solo los campos que cambiaron al actualizar.
- [x] Ningún registro contiene contraseñas, sus hashes ni tokens.

**Avance:** criterios cumplidos a nivel de mecanismo; queda terminada al integrar el spec 05 a `main`. Se adelantó del Sprint 5 para fijar la regla antes de crear endpoints. Está en `specs/05-hu-53-bitacora-auditoria.md`: constantes `MODULOS` y `ACCIONES` validadas en `registrarBitacora`, limpieza automática de campos sensibles, `diferencias(antes, despues)`, `contextoAuditoria(req)` (login y logout ya lo usan), `enTransaccion(fn)` para "cambio + bitácora (+ MongoDB)", registro `SISTEMA`/`ACCESO_DENEGADO` en cada 403 de `requierePermiso` y triggers que impiden `UPDATE` y `DELETE` en `backend/db/06_bitacora_inmutable_mysql.sql`. Verificado contra la base de prueba el 2026-10-20: el 06 corrió dos veces sin error y los intentos de modificar o borrar fallan. Todavía no hay endpoints de escritura de negocio ni escrituras en MongoDB: cada historia que los cree registra los suyos con esta convención (criterios 1 y 3). La consulta de la bitácora es HU-54.

#### HU-54. Consultar la auditoría

> **Como** administrador, **quiero** acceder a la bitácora del sistema y utilizarla mediante filtros de búsqueda, **para** investigar cambios o problemas.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S5 | Christian Ramírez |

**Cómo se hará:** Pantalla de auditoría; endpoint `GET /auditoria/bitacora` con filtros y paginación.

**Criterios de aceptación:**
- [ ] Puedo combinar filtros por usuario, rango de fechas, acción y módulo.
- [ ] Puedo ver el detalle de un registro con sus valores anteriores y nuevos.
- [ ] Puedo exportar el resultado a Excel.

#### HU-55. Historial de cambios de configuración

> **Como** administrador, **quiero** ver qué cambió en esquemas, reglas e indicadores, en qué versión y quién lo hizo, **para** entender por qué un resultado cambió entre periodos.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | S5 | Andrea López |

**Cómo se hará:** Consulta de las versiones guardadas en MongoDB junto con sus registros en la bitácora.

**Criterios de aceptación:**
- [ ] Veo la lista de versiones de cada esquema, regla o indicador con fecha y autor.
- [ ] Puedo comparar dos versiones de un esquema.

### Fase final (13/11 – 30/11): Despliegue, pruebas y entrega (tareas)

> **Nota del equipo:** HU-56 a HU-60 son tareas de cierre, no historias de usuario, aunque conserven este formato. Describen el trabajo a realizar más que una actividad de un usuario del sistema.

#### HU-56. Desplegar el sistema con Docker

> **Como** integrante del equipo de desarrollo, **quiero** levantar frontend, backend, MySQL y MongoDB con Docker Compose, **para** que el sistema funcione igual en cualquier equipo y en el servidor.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Equipo de desarrollo | 5 | Fase final | Christian Ramírez |

**Cómo se hará:** Dockerfile para frontend y backend; `docker-compose.yml` con los cuatro servicios, volúmenes y variables de entorno.

**Criterios de aceptación:**
- [ ] Con un solo comando se levanta todo el sistema en local.
- [ ] Las bases de datos conservan sus datos al reiniciar los contenedores.
- [ ] Ninguna contraseña queda escrita en el repositorio.

#### HU-57. Desplegar en DigitalOcean

> **Como** integrante del equipo de desarrollo, **quiero** publicar el sistema en un Droplet de DigitalOcean con HTTPS, **para** que la DDRISS pueda usarlo desde cualquier establecimiento.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Equipo de desarrollo | 8 | Fase final | Kenneth García |

**Cómo se hará:** Droplet Linux con Docker; proxy inverso (por ejemplo, Nginx) con certificado HTTPS; verificación en producción.

**Criterios de aceptación:**
- [ ] El sistema responde por HTTPS con un dominio o IP pública.
- [ ] El endpoint `/salud` confirma que backend, MySQL y MongoDB están conectados.
- [ ] Solo los puertos necesarios están abiertos.

#### HU-58. Pruebas de carga y estrés

> **Como** integrante del equipo de desarrollo, **quiero** medir cómo responde el sistema con muchos usuarios a la vez, **para** asegurar que aguante el cierre de mes, cuando todos los establecimientos reportan.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Equipo de desarrollo | 5 | Fase final | Luis Suárez |

**Cómo se hará:** Scripts de carga (por ejemplo, k6 o JMeter) sobre inicio de sesión, captura, envío e informes; informe de resultados.

**Criterios de aceptación:**
- [ ] Se simulan al menos 195 establecimientos enviando reportes al mismo tiempo.
- [ ] Se documentan tiempos de respuesta y tasa de errores.
- [ ] Se corrigen los cuellos de botella encontrados.

#### HU-59. Respaldos automáticos de las bases de datos

> **Como** administrador, **quiero** que se hagan respaldos periódicos de MySQL y MongoDB, **para** recuperar la información si falla el servidor.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | 3 | Fase final | Andrea López |

**Cómo se hará:** Tarea programada con `mysqldump` y `mongodump`; copias con fecha y retención definida.

**Criterios de aceptación:**
- [ ] Se genera un respaldo diario de ambas bases.
- [ ] Se prueba al menos una restauración completa en un ambiente de prueba.

#### HU-60. Manual de usuario y capacitación

> **Como** usuario del sistema, **quiero** contar con un manual por rol y una capacitación, **para** usar el sistema sin depender del equipo de desarrollo.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Todos los roles | 3 | Fase final | Andrea López |

**Cómo se hará:** Manual de usuario con capturas de pantalla por rol; sesión de capacitación con la DDRISS.

**Criterios de aceptación:**
- [ ] Existe una sección del manual para cada uno de los 5 roles.
- [ ] Se realiza la capacitación y se registra la asistencia.
- [ ] El manual cita las fuentes de datos de terceros con su licencia (por ahora, los límites municipales de CONRED/OCHA en HDX, CC BY 3.0 IGO, según `frontend/public/geo/FUENTES.md`).

### Historias agregadas después de la planificación

> **Nota del equipo:** estas historias surgieron durante el desarrollo. Siguen la numeración después de HU-60 para no alterar la secuencia planificada; su sprint, sus story points y su responsable se asignan cuando se decida trabajarlas, y no cuentan en los totales de las secciones 3 y 4 hasta entonces.

#### HU-61. Gestionar los permisos de cada rol

> **Como** administrador, **quiero** ver los permisos del sistema y asignarlos o quitarlos a cada rol desde una pantalla, **para** ajustar las funciones de cada rol sin editar los scripts de la base de datos.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | Por estimar | Sin asignar | Sin asignar |

**Cómo se hará:** Pantalla de roles y permisos en React, solo para el Administrador; endpoints para listar los roles y los permisos y para asignar o quitar un permiso a un rol; tabla `rol_permiso`. Usa el mecanismo de permisos granulares de HU-06 (`specs/04-hu-06-permisos-por-rol.md`).

**Criterios de aceptación:**
- [ ] Solo el Administrador puede ver la pantalla y usar sus endpoints, con un permiso propio.
- [ ] Puedo ver qué permisos tiene cada rol, agrupados por módulo.
- [ ] Puedo asignar o quitar un permiso a un rol, y el cambio aplica desde el siguiente inicio de sesión de los usuarios de ese rol.
- [ ] Desde la pantalla no se crean, renombran ni borran códigos de permiso; los códigos nuevos se crean con `backend/db/05_permisos_mysql.sql`.
- [ ] No se puede quitar al Administrador el permiso para gestionar permisos.
- [ ] Cada asignación o retiro queda registrado en la bitácora con el usuario que lo hizo.

#### HU-62. Desbloquear una cuenta

> **Como** administrador, **quiero** desbloquear una cuenta que quedó bloqueada por intentos fallidos, **para** que la persona pueda volver a entrar en una emergencia sin esperar a que el bloqueo venza.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | Por estimar | Sin asignar | Sin asignar |

**Cómo se hará:** Acción "Desbloquear" en la tabla de `/usuarios` (la pantalla de HU-05); endpoint `POST /usuarios/{id}/desbloquear` con su propio permiso, que pone `intentos_fallidos = 0` y `bloqueado_hasta = NULL` en `usuario`. El listado de cuentas indica si cada una está bloqueada, sin devolver la fecha del bloqueo. El bloqueo de 15 minutos por intentos fallidos (HU-01) se mantiene; esta acción solo evita esperar. Cuando la cuenta se bloquea, el login muestra un aviso en un modal que indica que debe contactar al administrador de su DDRISS o esperar los minutos del bloqueo, sin mostrar datos del administrador. Detalle en `specs/10-hu-62-63-seguridad-de-cuentas.md`.

**Origen (propuesta A, asesoría del 2026-10-21):** HU-62 y HU-63 salieron de la "Propuesta para el spec A · Seguridad de cuentas", un documento de trabajo que el equipo escribió después de la asesoría y que ya no se conserva; lo vigente es el SPEC 10. La asesoría pidió tres cosas: que el usuario bloqueado sepa qué hacer, que el administrador resuelva una cuenta bloqueada o una contraseña olvidada sin esperar, y que la contraseña temporal no la invente el administrador. El equipo acordó mantener el bloqueo de 15 minutos con un modal en el login, separar "Desbloquear" y "Restablecer contraseña" en dos acciones con su propio permiso (solo Administrador), y que el sistema genere toda contraseña temporal, también al crear una cuenta (HU-04), y la muestre una sola vez. No cambia la estructura de la base: solo agrega dos permisos en el 05, dos acciones a la bitácora y `contrasenaTemporal` a los campos que la bitácora nunca guarda. La propuesta pedía 16 caracteres; al implementar se bajó a 12, el mínimo de la política de HU-03, para que sea fácil de dictar.

**Criterios de aceptación:**
- [x] Al quedar bloqueada mi cuenta, el login muestra un modal informativo: "Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en N minutos", donde N sale de la misma constante del backend que define la duración del bloqueo, no de un texto fijo en el frontend. El modal no muestra datos del administrador.
- [x] En la tabla de usuarios veo cuáles cuentas están bloqueadas.
- [x] Puedo desbloquear una cuenta bloqueada de mi DDRISS; después, la persona puede iniciar sesión de inmediato con su contraseña.
- [x] Desbloquear una cuenta que no está bloqueada se rechaza (409).
- [x] Solo el Administrador puede desbloquear, con un permiso propio; una cuenta de otra DDRISS responde 404.
- [x] Cada desbloqueo queda en la bitácora con el usuario que lo hizo.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 10 a `main`. Backend y frontend en `specs/10-hu-62-63-seguridad-de-cuentas.md`, junto con HU-63. `POST /usuarios/{id}/desbloquear` con el permiso `USUARIO_DESBLOQUEAR` (solo Administrador, en `05_permisos_mysql.sql`) y la acción de bitácora `DESBLOQUEAR`. Se permite desbloquear la cuenta propia; una desactivada responde 409 `CUENTA_DESACTIVADA`, porque "Restaurar" ya quita el bloqueo. El listado devuelve `bloqueada` (sin la fecha ni los intentos). En `/usuarios`, Badge "Bloqueada" y la opción "Desbloquear" en el menú "Más acciones" (un `DropdownMenu` de shadcn que ahora también tiene Desactivar y Restaurar; "Editar" sigue a la vista), solo en cuentas activas bloqueadas. El modal del login se describe en la nota de HU-01. Verificado contra la API real el 2026-10-22 con la cuenta "Prueba HU-62 Seguridad" (`prueba-hu62`, rol Revisor), que queda activa en la base de prueba.

#### HU-63. Restablecer la contraseña de una cuenta

> **Como** administrador, **quiero** restablecer la contraseña de una cuenta cuando la persona la olvidó, **para** que vuelva a entrar con una contraseña temporal y la cambie por una propia.

| Para quién | Story points | Sprint | Responsable |
|---|---|---|---|
| Administrador | Por estimar | Sin asignar | Sin asignar |

**Cómo se hará:** Acción "Restablecer contraseña" en la tabla de `/usuarios` (la pantalla de HU-05), separada de "Desbloquear"; endpoint `POST /usuarios/{id}/restablecer-contrasena` con su propio permiso. El backend genera una contraseña temporal aleatoria (con `crypto` de Node), guarda su hash con `debe_cambiar_contrasena = TRUE`, quita el bloqueo si lo hay y devuelve la contraseña una sola vez para que el administrador se la entregue a la persona. El cambio obligatorio al entrar lo resuelve HU-03. En el mismo trabajo, `POST /usuarios` (HU-04) deja de recibir la contraseña temporal escrita por el administrador y usa el mismo generador. Detalle en `specs/10-hu-62-63-seguridad-de-cuentas.md`; el origen está resumido en HU-62.

**Criterios de aceptación:**
- [x] Puedo restablecer la contraseña de una cuenta activa de mi DDRISS; el sistema genera una contraseña temporal que cumple la política de fortaleza de HU-03 y me la muestra una sola vez, con un botón para copiarla.
- [x] La contraseña anterior deja de servir, y al entrar con la temporal el sistema obliga a cambiarla (HU-03).
- [x] Si la cuenta estaba bloqueada, también queda desbloqueada.
- [x] No puedo restablecer mi propia contraseña desde aquí (uso HU-03), ni la de una cuenta desactivada.
- [x] Solo el Administrador puede restablecer, con un permiso propio; una cuenta de otra DDRISS responde 404.
- [x] La contraseña temporal nunca se guarda en claro ni queda en la bitácora; el restablecimiento sí queda registrado con el usuario que lo hizo.
- [x] Al crear una cuenta (HU-04), la contraseña temporal también la genera el sistema y se muestra una sola vez.

**Avance:** criterios cumplidos; queda terminada al integrar el spec 10 a `main`. Backend y frontend en `specs/10-hu-62-63-seguridad-de-cuentas.md`, junto con HU-62. `POST /usuarios/{id}/restablecer-contrasena` con el permiso `USUARIO_RESTABLECER_CONTRASENA` (solo Administrador) responde `{ usuario, contrasenaTemporal }`. La contraseña la genera `generarContrasenaTemporal` (`backend/src/modulos/auth/contrasenaTemporal.service.js`): 12 caracteres con `crypto.randomInt`, de un alfabeto sin `0 O o 1 l I`, revisados con la política de HU-03; el largo es la constante `LARGO`. El mismo generador lo usa `POST /usuarios` (nota en HU-04). La acción de bitácora `RESTABLECER_CONTRASENA` se registra siempre, aunque ningún otro dato cambie, y `contrasenaTemporal` está en `CLAVES_SENSIBLES`. La sesión abierta de la cuenta recibe 403 `CAMBIO_CONTRASENA_REQUERIDO` y el frontend la lleva al login con el aviso "Su contraseña fue restablecida…". En `/usuarios`, opción "Restablecer contraseña" en el menú "Más acciones", con confirmación, y el diálogo `DialogoContrasenaTemporal` con el botón "Copiar". Verificado contra la API real el 2026-10-22 con la cuenta `prueba-hu62`.

## 6. Notas y pendientes

- Los umbrales del semáforo (HU-42) y las alertas de cobertura (HU-51) usan la propuesta 80/90 %, pendiente de confirmar con Epidemiología; por eso se definen en la configuración de indicadores (HU-35).
- El número de días para la alerta de reportes sin revisar (HU-50) debe confirmarse con la estadígrafa.
- Los informes y la cobertura por distrito (HU-41, HU-45) dependen de que la DDRISS aclare qué es un distrito de salud y cuántos hay por municipio.
- El registro de la población (HU-13, HU-14) se asignó al rol Administrador de forma provisional, según lo acordado el 10/10/2026.
- Los story points no cambiaron con las actualizaciones de la versión 4: los ajustes precisan datos y tecnologías, pero no agregan trabajo significativo.
- 2026-10-20: HU-06 pasó a seguridad granular (un permiso por función) y se agregó HU-61 (gestión de permisos por rol, solo Administrador), todavía sin estimar ni asignar. Los totales de las secciones 3 y 4 siguen contando 60 historias y 280 story points.
- 2026-10-21: ajustes de la asesoría. HU-03 incluye ahora el cambio obligatorio de la contraseña temporal, la política de fortaleza con zxcvbn y el campo para ver la contraseña, y se trabaja primero. Se agregaron HU-62 (desbloquear cuenta) y HU-63 (restablecer contraseña), todavía sin estimar ni asignar. También se acordó guardar en `empleado` solo una huella HMAC del CUI, en lugar de `codigo_empleado`, para impedir empleados repetidos, y validar el formato de los campos del personal; estos ajustes a HU-04 y HU-05 se describen en `docs/SPECS/PROPUESTA_SPEC_B_DATOS_DEL_EMPLEADO.md`. Los totales de las secciones 3 y 4 siguen contando 60 historias y 280 story points.
- 2026-10-20: los límites del mapa (HU-42) salen del COD-AB de Guatemala de CONRED/OCHA publicado en HDX (CC BY 3.0 IGO). La licencia obliga a dar crédito, enlazar la licencia, indicar los cambios y no sugerir respaldo de OCHA o de la ONU; por eso HU-42 y HU-60 tienen criterios de atribución. Si se cambia la fuente de los límites, hay que actualizar `frontend/public/geo/FUENTES.md` y el crédito del mapa.
