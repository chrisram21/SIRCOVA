# SPEC 08 — Editar, desactivar y restaurar usuarios

> **Estado:** Implementado
> **Historia:** HU-05 (backend y frontend, más el listado mínimo de cuentas que necesitan las acciones)
> **Depende de:** SPEC 01, SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 07
> **Fecha:** 2026-10-21
> **Objetivo:** Que el Administrador vea las cuentas de su DDRISS en `/usuarios` y desde ahí cambie su rol o los datos del empleado, la desactive o la restaure, y que una cuenta desactivada o con datos de acceso cambiados pierda su sesión abierta.

## Por qué existe este spec

HU-05 dice "acciones en el listado de usuarios", pero el listado es HU-07 y todavía no existe. Como en el SPEC 07 con los catálogos, este spec implementa **un listado mínimo** (`GET /usuarios` sin búsqueda, filtros ni paginación) y HU-07 lo amplía después.

El JWT dura 2 horas y no se revoca. Sin cambios, una cuenta desactivada seguiría usando el sistema hasta que venza su token, y una cuenta con el rol cambiado seguiría con los permisos viejos. Por eso `autenticar` pasa a revisar la cuenta en la base en cada petición.

El contrato actual tiene `PATCH /usuarios/{id}` con `rolId` y `activo`. Este spec lo separa en tres endpoints para que cada acción tenga su propio permiso.

## Alcance

**Entra:**

- `GET /usuarios` mínimo y `GET /usuarios/{id}`, por ámbito.
- `PATCH /usuarios/{id}` (solo `rolId`), `POST /usuarios/{id}/desactivar`, `POST /usuarios/{id}/restaurar` y `PATCH /empleados/{id}`.
- Revisión de la cuenta en `autenticar`: cuenta o empleado inactivo, y rol, establecimiento o municipio distintos a los del token.
- Tres permisos nuevos en `05_permisos_mysql.sql`, asignados solo a `ADMINISTRADOR`.
- Contrato de los seis endpoints en `backend/openapi.yaml`, con `x-permiso`.
- Tabla de cuentas en `/usuarios` con las acciones Editar, Desactivar y Restaurar.
- Página `/usuarios/:id/editar`, con los datos del empleado y el rol.
- Componentes de shadcn Table, Badge y AlertDialog.
- Pruebas del backend (contra la base de prueba, borrando lo que crean) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual en el navegador con Playwright, como en el SPEC 07.
- Avance de HU-05 y nota en HU-07 en `HISTORIAS_DE_USUARIO.md`; nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Búsqueda, filtros por rol, establecimiento y estado, y paginación del listado (HU-07).
- Editar, desactivar o listar empleados **sin cuenta**; desactivar al empleado (`empleado.activo`).
- Cambiar el nombre de usuario.
- Restablecer la contraseña de otra cuenta o cambiar la propia (HU-03).
- Mover una cuenta a otra DDRISS o editar la autoridad nacional (sin DDRISS).
- Revocar tokens con una lista negra o un identificador de sesión.
- Cambios a `01_modelo_relacional_mysql.sql`.

## Modelo de datos

Este spec **no cambia el modelo**: usa `usuario.activo`, `usuario.desactivado_en`, `usuario.intentos_fallidos`, `usuario.bloqueado_hasta` y las columnas de `empleado` tal como están en el script 01. Sí agrega filas a `permiso` y `rol_permiso` con `05_permisos_mysql.sql`.

### Permisos

| Código | Módulo | Endpoint o ruta |
|---|---|---|
| `USUARIO_CONSULTAR` | `USUARIOS` | Ya existe (SPEC 07). Ahora también `GET /usuarios` y `GET /usuarios/{id}` |
| `USUARIO_EDITAR` | `USUARIOS` | `PATCH /usuarios/{id}` y la ruta `/usuarios/:id/editar` |
| `USUARIO_DESACTIVAR` | `USUARIOS` | `POST /usuarios/{id}/desactivar` y `POST /usuarios/{id}/restaurar` |
| `EMPLEADO_EDITAR` | `USUARIOS` | `PATCH /empleados/{id}` |

Los tres nuevos se asignan **solo a `ADMINISTRADOR`**.

### Ámbito y reglas comunes

- Una cuenta o un empleado de otra DDRISS, o que no existe, responde 404 `NO_ENCONTRADO` (como en el SPEC 04). El ámbito se filtra con `filtroAlcance`/`verificarAlcance` sobre `empleado.ddriss_id`.
- Una cuenta desactivada no se edita: `PATCH /usuarios/{id}`, y `PATCH /empleados/{id}` sobre un empleado cuya cuenta está desactivada, responden 409 `CUENTA_DESACTIVADA`. Primero hay que restaurarla.
- El administrador no puede cambiar su propio rol ni desactivar su propia cuenta: 422 `CUENTA_PROPIA`. Sí puede editar sus datos de empleado.
- Si la petición no cambia nada (`diferencias` da `null`), se responde 200 con el recurso y **no** se escribe ni se registra en la bitácora.

### `GET /usuarios` (`USUARIO_CONSULTAR`)

Devuelve un arreglo de `UsuarioDetalle` con todas las cuentas de la DDRISS del usuario, activas y desactivadas, ordenadas por apellidos y nombres. No tiene parámetros: los de paginación del contrato actual se quitan y HU-07 los vuelve a agregar.

`UsuarioDetalle` = los campos de `Usuario` (`id`, `empleadoId`, `nombreUsuario`, `rol`, `rolNombre`, `activo`, `debeCambiarContrasena`) más:

| Campo | Origen |
|---|---|
| `ultimoAcceso` | `usuario.ultimo_acceso` (ISO 8601 o `null`) |
| `desactivadoEn` | `usuario.desactivado_en` (ISO 8601 o `null`) |
| `empleado` | Objeto `Empleado` del SPEC 07, más `establecimientoNombre` y `municipioNombre` (o `null`) |

Nunca devuelve `hash_contrasena`, `intentos_fallidos` ni `bloqueado_hasta`.

### `GET /usuarios/{id}` (`USUARIO_CONSULTAR`)

Devuelve un `UsuarioDetalle`. La usa la página de edición.

### `PATCH /usuarios/{id}` (`USUARIO_EDITAR`)

Entrada: `{ rolId }`, obligatorio. Cualquier otro campo responde 400.

- Mismas reglas que al crear la cuenta: `rolId` debe existir (422 `ROL_INVALIDO`) y el rol `ESTABLECIMIENTO` exige que el empleado tenga establecimiento (422 `EMPLEADO_SIN_ESTABLECIMIENTO`).
- Orden de revisión: cuenta (404), cuenta desactivada (409), cuenta propia (422), rol (422), establecimiento (422).
- Respuesta 200: `UsuarioDetalle`.
- Bitácora, en la misma transacción: `USUARIOS` / `ACTUALIZAR`, entidad `usuario`, con `diferencias` sobre `{ rol }` antes y después.

### `POST /usuarios/{id}/desactivar` (`USUARIO_DESACTIVAR`)

Sin cuerpo.

- Pone `activo = FALSE` y `desactivado_en = NOW()`. El empleado no cambia.
- Cuenta propia → 422 `CUENTA_PROPIA`. Una cuenta ya desactivada responde 200 sin escribir.
- Respuesta 200: `UsuarioDetalle`.
- Bitácora: `USUARIOS` / `DESACTIVAR`, entidad `usuario`, con `{ activo: true }` → `{ activo: false }`.

### `POST /usuarios/{id}/restaurar` (`USUARIO_DESACTIVAR`)

Sin cuerpo.

- Pone `activo = TRUE`, `desactivado_en = NULL`, `intentos_fallidos = 0` y `bloqueado_hasta = NULL`.
- Una cuenta ya activa responde 200 sin escribir.
- Respuesta 200: `UsuarioDetalle`.
- Bitácora: `USUARIOS` / `REACTIVAR`, entidad `usuario`, con `{ activo: false }` → `{ activo: true }`.

### `PATCH /empleados/{id}` (`EMPLEADO_EDITAR`)

Entrada parcial (`EmpleadoCambios`): los mismos campos de `EmpleadoEntrada`, todos opcionales, y al menos uno.

| Campo | Regla |
|---|---|
| `nombres`, `apellidos` | Si vienen, no pueden quedar vacíos; 1 a 100 caracteres |
| `codigoEmpleado`, `cargo`, `correo`, `telefono` | Mismos largos y formato que al crear; `null` o texto vacío los borra; únicos |
| `establecimientoId` | Número o `null`; debe existir, estar activo y ser de la DDRISS (422 `ESTABLECIMIENTO_INVALIDO`) |
| `municipioId` | Número o `null`; solo sin establecimiento; del departamento sede (422 `MUNICIPIO_INVALIDO`) |

- Las reglas de establecimiento y municipio se aplican al **resultado** (lo guardado más lo que llega): con establecimiento, `municipio_id` se copia de él; establecimiento y municipio juntos en el cuerpo, ambos con valor, responden 400.
- Si la cuenta del empleado tiene rol `ESTABLECIMIENTO`, quitarle el establecimiento responde 422 `EMPLEADO_SIN_ESTABLECIMIENTO`.
- `ddrissId` y `activo` no se aceptan (400).
- Duplicados → 409 `CORREO_DUPLICADO` o `CODIGO_EMPLEADO_DUPLICADO`, también desde el `ER_DUP_ENTRY` de MySQL.
- Respuesta 200: `Empleado`.
- Bitácora: `USUARIOS` / `ACTUALIZAR`, entidad `empleado`, con `diferencias(antes, despues)`.

### Errores nuevos

| HTTP | `codigo` | Caso |
|---|---|---|
| 409 | `CUENTA_DESACTIVADA` | Se intenta editar una cuenta desactivada, o los datos de un empleado con la cuenta desactivada |
| 409 | `EMPLEADO_INACTIVO` | Se intenta restaurar una cuenta cuyo empleado está inactivo |
| 422 | `CUENTA_PROPIA` | El administrador intenta cambiar su propio rol o desactivar su propia cuenta |

Los demás (`ENTRADA_INVALIDA`, `NO_ENCONTRADO`, `ROL_INVALIDO`, `EMPLEADO_SIN_ESTABLECIMIENTO`, `ESTABLECIMIENTO_INVALIDO`, `MUNICIPIO_INVALIDO`, `CORREO_DUPLICADO`, `CODIGO_EMPLEADO_DUPLICADO`) ya existen desde el SPEC 07.

### Revisión de la cuenta en `autenticar`

`backend/src/middlewares/autenticar.js` se divide en dos:

- `verificarToken`: la lógica actual (firma, vencimiento, `sub`), sin base de datos.
- `revisarCuenta`: una consulta parametrizada por `req.usuario.id` a `usuario` + `empleado` + `rol`.
- `autenticar` = `[verificarToken, revisarCuenta]`. Express acepta el arreglo en las rutas, así que ningún router cambia.

| Caso | Respuesta |
|---|---|
| La cuenta no existe | 401 `NO_AUTENTICADO` |
| `usuario.activo` o `empleado.activo` es falso | 401 `CUENTA_DESACTIVADA`: "Su cuenta está desactivada; contacte al administrador." |
| El rol, `establecimientoId` o `municipioId` del token no coinciden con los de la base | 401 `SESION_DESACTUALIZADA`: "Sus datos de acceso cambiaron; inicie sesión de nuevo." |

- Se responde 401 (y no 403 como en el login) porque el frontend cierra la sesión ante cualquier 401 de una petición con token (SPEC 03) y muestra el `mensaje` en la pantalla de inicio de sesión. El frontend no necesita cambios para esto.
- `ddrissId` no se compara: ningún endpoint lo cambia, y las pruebas del SPEC 07 firman tokens con otra `ddrissId` para los casos de otro ámbito.
- Los permisos tampoco se comparan: un cambio en `rol_permiso` sigue aplicando desde el siguiente login (nota del 2026-10-20).
- Ninguno de estos 401 escribe en la bitácora.

### Frontend

**Rutas.** Nueva subruta en la opción "Usuarios" de `opcionesMenu.js`:

| Ruta | Permiso | Página |
|---|---|---|
| `/usuarios` | `USUARIO_CONSULTAR` | `PaginaUsuarios`: el botón "Registrar personal" y la tabla de cuentas |
| `/usuarios/:id/editar` | `USUARIO_EDITAR` | `PaginaEditarUsuario` |

**Tabla en `/usuarios`.** Al cargar pide `GET /usuarios`. Mientras carga, Skeleton; si falla, Alert con el mensaje; sin cuentas, el texto "No hay cuentas registradas en su DDRISS.".

| Columna | Contenido |
|---|---|
| Nombre | `nombres apellidos` y, debajo, el cargo |
| Usuario | `nombreUsuario` |
| Rol | `rolNombre` |
| Establecimiento | `establecimientoNombre`, o "DDRISS" si no tiene |
| Estado | Badge "Activa" o "Desactivada" |
| Acciones | Ver abajo |

- **Cuenta activa:** botón "Editar" (con `USUARIO_EDITAR`, lleva a `/usuarios/{id}/editar`) y botón "Desactivar" (con `USUARIO_DESACTIVAR`, no aparece en la fila propia).
- **Cuenta desactivada:** solo el botón "Restaurar" (con `USUARIO_DESACTIVAR`).
- "Desactivar" abre un AlertDialog: "¿Desactivar la cuenta {nombreUsuario}?" y el texto "No podrá iniciar sesión y su sesión abierta se cerrará. Sus acciones pasadas siguen en la bitácora.", con "Cancelar" y "Desactivar". Al confirmar llama al endpoint; mientras tanto, el botón dice "Desactivando…".
- "Restaurar" llama al endpoint directamente; mientras tanto, dice "Restaurando…".
- Al terminar, la fila se reemplaza con la respuesta y se muestra un Alert de éxito: "Se desactivó la cuenta {nombreUsuario}." o "Se restauró la cuenta {nombreUsuario}.". Si falla, un Alert de error con el `mensaje` del backend.

**Página `/usuarios/:id/editar`.** Al cargar pide en paralelo `GET /usuarios/{id}`, `GET /roles`, `GET /municipios` y `GET /establecimientos?activo=true`. Mientras cargan, los campos están deshabilitados; si una falla, Alert con el mensaje y no se puede guardar.

- Si la cuenta está desactivada, en lugar del formulario se muestra el Alert "La cuenta {nombreUsuario} está desactivada; restáurela para editarla." con el botón "Volver a Usuarios".
- **Datos del empleado:** los mismos campos que el registro, ya llenos. Para no duplicarlos, la tarjeta "Datos del empleado" de `PaginaRegistrarPersonal.jsx` se extrae a `paginas/usuarios/CamposEmpleado.jsx` y la usan las dos páginas.
- **Cuenta de acceso:** el nombre de usuario como texto de solo lectura y el Select de rol. En la cuenta propia, el Select está deshabilitado con el texto "No puede cambiar su propio rol.".
- **Validaciones en el cliente** (el backend valida igual): nombres y apellidos obligatorios, y rol "Personal del establecimiento" solo con establecimiento. Sin cambios o con algo inválido, "Guardar cambios" está deshabilitado.
- **Envío:** "Guardar cambios" llama a `PATCH /empleados/{empleadoId}` solo con los campos que cambiaron (si cambió alguno) y después a `PATCH /usuarios/{id}` (si cambió el rol). Mientras tanto, el botón dice "Guardando…". Junto a él, "Cancelar" vuelve a `/usuarios`.
- **Resultados:**
  - Todo bien → Alert de éxito "Se guardaron los cambios de {nombres} {apellidos}." con el botón "Volver a Usuarios"; el formulario toma los datos de las respuestas.
  - Falla el empleado → Alert de error con el `mensaje`; no se intenta el rol y el formulario conserva lo escrito.
  - Se guarda el empleado y falla el rol → Alert "Se guardaron los datos de {nombres} {apellidos}, pero no se pudo cambiar el rol: {mensaje}". Los datos guardados pasan a ser los nuevos valores de partida y "Guardar cambios" reintenta solo el rol.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← seis endpoints, UsuarioDetalle, EmpleadoCambios, errores nuevos
├── db/05_permisos_mysql.sql                   ← tres permisos y sus asignaciones a ADMINISTRADOR
├── src/middlewares/autenticar.js              ← verificarToken + revisarCuenta
├── src/modulos/usuarios/
│   ├── usuarios.routes.js                     ← rutas nuevas
│   ├── usuarios.controller.js
│   └── usuarios.service.js                    ← listar, obtener, cambiar rol, desactivar, restaurar, editar empleado
└── tests/
    ├── autenticar.test.js                     ← casos de cuenta desactivada y sesión desactualizada
    ├── permisos.test.js                       ← usa verificarToken en su app de prueba
    └── usuarios.test.js                       ← casos de HU-05
frontend/src/
├── components/ui/table.jsx, badge.jsx, alert-dialog.jsx   ← shadcn
├── api/usuarios.js                            ← listarUsuarios, obtenerUsuario, cambiarRol, desactivarCuenta, restaurarCuenta, editarEmpleado
├── componentes/layout/opcionesMenu.js         ← subruta /usuarios/:id/editar
├── componentes/RutaConPermiso.test.jsx        ← caso de la subruta de edición
└── paginas/usuarios/
    ├── PaginaUsuarios.jsx                     ← tabla y acciones
    ├── PaginaUsuarios.test.jsx                ← nuevo
    ├── CamposEmpleado.jsx                     ← nuevo, extraído del registro
    ├── PaginaRegistrarPersonal.jsx            ← usa CamposEmpleado
    ├── PaginaEditarUsuario.jsx                ← nuevo
    └── PaginaEditarUsuario.test.jsx           ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance de HU-05; nota en HU-07
CLAUDE.md                                      ← nota sobre revisarCuenta y verificarToken
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: completar `GET /usuarios` (sin parámetros, arreglo de `UsuarioDetalle`); agregar `GET /usuarios/{id}`, `POST /usuarios/{id}/desactivar`, `POST /usuarios/{id}/restaurar` y `PATCH /empleados/{id}`; dejar `PATCH /usuarios/{id}` solo con `rolId`; agregar los esquemas `UsuarioDetalle` y `EmpleadoCambios`, las respuestas 400, 401, 403, 404, 409 y 422 con sus códigos, y `x-permiso` en los seis. Documentar en la descripción de la seguridad los 401 `CUENTA_DESACTIVADA` y `SESION_DESACTUALIZADA`. Comprobación: `/api/docs` carga sin errores y muestra los seis endpoints con su permiso.
2. **Permisos.** **Pedir confirmación antes de editar y antes de correr** `05_permisos_mysql.sql` (zona protegida). Agregar `USUARIO_EDITAR`, `USUARIO_DESACTIVAR` y `EMPLEADO_EDITAR` con sus asignaciones a `ADMINISTRADOR`. Con autorización, correrlo dos veces en la base de prueba de Aiven. Comprobación: no da error ninguna de las dos veces, hay una sola fila por asignación y el login del usuario de prueba trae los tres códigos.
3. **`autenticar`.** Dividirlo en `verificarToken` y `revisarCuenta` según el "Modelo de datos". En `permisos.test.js`, la app de prueba usa `verificarToken`, porque prueba `requierePermiso` y firma tokens de roles que no existen en la base; ningún caso se quita. En `autenticar.test.js`, los casos de token siguen sobre `verificarToken` y se agregan, con una cuenta creada por la prueba (prefijo `vitest-hu05-`, token firmado a mano y sin iniciar sesión con ella):
   - con la cuenta activa y los datos del token correctos, una ruta protegida responde 200;
   - con la cuenta desactivada, 401 `CUENTA_DESACTIVADA`;
   - con otro rol, otro `establecimientoId` u otro `municipioId` en el token, 401 `SESION_DESACTUALIZADA`;
   - con un `sub` que no existe, 401 `NO_AUTENTICADO`;
   - ninguno de esos 401 deja filas en `bitacora`.
   Comprobación: `npm test` del backend pasa completo, incluidas las pruebas de los specs anteriores.
4. **Lecturas.** `GET /usuarios` y `GET /usuarios/{id}` en el módulo `usuarios`. Pruebas en `tests/usuarios.test.js`:
   - `GET /usuarios` devuelve solo cuentas de la DDRISS del usuario, activas y desactivadas, sin hash ni contraseña;
   - `GET /usuarios/{id}` de una cuenta de otra DDRISS (token con otra `ddrissId`) o inexistente responde 404;
   - sin `USUARIO_CONSULTAR`, 403.
5. **Cambiar rol.** `PATCH /usuarios/{id}` con `enTransaccion`, `diferencias` y `registrarBitacora`. Pruebas, con cuentas creadas con el prefijo `vitest-hu05-` y borradas en `afterAll`:
   - cambiar el rol responde 200 y deja una fila `USUARIOS`/`ACTUALIZAR` de entidad `usuario` con el rol antes y después;
   - el mismo rol responde 200 sin fila nueva en la bitácora;
   - el rol propio responde 422 `CUENTA_PROPIA`; una cuenta desactivada, 409 `CUENTA_DESACTIVADA`;
   - un rol inexistente, 422 `ROL_INVALIDO`; rol `ESTABLECIMIENTO` sin establecimiento, 422 `EMPLEADO_SIN_ESTABLECIMIENTO`;
   - un campo distinto de `rolId`, 400; sin `USUARIO_EDITAR`, 403.
6. **Desactivar y restaurar.** Los dos endpoints. Pruebas:
   - desactivar responde 200 con `activo: false` y `desactivadoEn`; en la base, la cuenta queda inactiva y el empleado activo; hay una fila `DESACTIVAR`;
   - después, un token firmado para esa cuenta recibe 401 `CUENTA_DESACTIVADA` y `POST /auth/login` con ella responde 403 `CUENTA_DESACTIVADA` (el `LOGIN_FALLIDO` guarda el id solo en `entidad_id`, no en `usuario_id`, así que la cuenta se puede borrar después);
   - restaurar responde 200 con `activo: true`; en la base, `desactivado_en`, `intentos_fallidos` y `bloqueado_hasta` quedan limpios; hay una fila `REACTIVAR`;
   - repetir cualquiera de los dos responde 200 sin fila nueva;
   - desactivar la cuenta propia responde 422 `CUENTA_PROPIA`;
   - sin `USUARIO_DESACTIVAR`, 403.
7. **Editar empleado.** `PATCH /empleados/{id}`. Pruebas:
   - cambiar el cargo responde 200 y deja una fila `ACTUALIZAR` de entidad `empleado` solo con el cargo;
   - poner un establecimiento copia su municipio; quitarlo y poner un municipio guarda el municipio;
   - quitar el establecimiento a un empleado con cuenta `ESTABLECIMIENTO` responde 422 `EMPLEADO_SIN_ESTABLECIMIENTO`;
   - nombres vacíos, cuerpo vacío o `ddrissId` en el cuerpo responden 400;
   - un correo de otro empleado responde 409 `CORREO_DUPLICADO`;
   - un empleado con la cuenta desactivada responde 409 `CUENTA_DESACTIVADA`; uno de otra DDRISS, 404;
   - sin `EMPLEADO_EDITAR`, 403.
   Comprobación: `npm test` del backend pasa y deja la base sin los empleados ni las cuentas de la prueba.
8. **Frontend: tabla.** `npx shadcn@latest add table badge alert-dialog` y revisar `package.json`. Agregar las funciones a `src/api/usuarios.js` y la tabla con sus acciones a `PaginaUsuarios.jsx`. Pruebas en `PaginaUsuarios.test.jsx`, con `vi.mock` sobre `@/api/usuarios.js`:
   - muestra una fila por cuenta con su Badge de estado;
   - la fila propia no tiene "Desactivar"; una desactivada solo tiene "Restaurar";
   - sin `USUARIO_DESACTIVAR` no aparecen "Desactivar" ni "Restaurar"; sin `USUARIO_EDITAR` no aparece "Editar";
   - "Desactivar" abre el diálogo, "Cancelar" no llama a la API y "Desactivar" llama a `desactivarCuenta` y actualiza la fila;
   - "Restaurar" llama a `restaurarCuenta` y muestra el éxito; un error muestra el `mensaje`;
   - si falla la carga, se muestra el Alert de error.
   Comprobación: `npm test` del frontend pasa.
9. **Frontend: edición.** Extraer `CamposEmpleado.jsx` y usarlo en `PaginaRegistrarPersonal.jsx` (sus pruebas pasan sin cambios). Crear `PaginaEditarUsuario.jsx` y su subruta. Pruebas en `PaginaEditarUsuario.test.jsx`, con `vi.mock` sobre `@/api/usuarios.js` y `@/api/catalogos.js`:
   - carga los datos de la cuenta en el formulario;
   - "Guardar cambios" está deshabilitado sin cambios y con nombres vacíos;
   - cambiar solo el cargo llama solo a `editarEmpleado`, con `{ cargo }`;
   - cambiar solo el rol llama solo a `cambiarRol`;
   - si falla el rol después del empleado, muestra el aviso parcial y reintentar llama solo a `cambiarRol`;
   - en la cuenta propia, el Select de rol está deshabilitado;
   - una cuenta desactivada muestra el aviso y no el formulario.
   En `RutaConPermiso.test.jsx`: `/usuarios/5/editar` sin `USUARIO_EDITAR` lleva a `/inicio`. Comprobación: `npm test` del frontend pasa.
10. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright: la tabla muestra las cuentas; editar el cargo y el rol de la cuenta "Prueba HU-04" y ver el éxito; abrir una segunda sesión con esa cuenta, cambiarle el rol desde la primera y comprobar que la segunda vuelve al login con "Sus datos de acceso cambiaron"; desactivarla y comprobar que su login responde "Su cuenta está desactivada"; restaurarla; revisar las filas de `bitacora`. Actualizar el "Avance" de HU-05 y marcar sus criterios; agregar a HU-07 que `GET /usuarios` y la tabla ya existen en versión mínima y que le faltan la búsqueda, los filtros y la paginación. Nota en "Notas de contexto" de `CLAUDE.md` sobre `revisarCuenta` (los 401 nuevos) y sobre usar `verificarToken` en las pruebas que solo prueban middlewares.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los seis endpoints con su `x-permiso` y sus errores, y `/api/docs` carga sin errores.
- [ ] `05_permisos_mysql.sql` se corre dos veces seguidas sin error ni filas duplicadas, y el login del Administrador de prueba trae los tres permisos nuevos; ningún otro rol los tiene.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba, y las pruebas del backend no dejan empleados ni cuentas en la base.
- [ ] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md`.
- [ ] Un token sin el permiso de cada endpoint recibe 403 `SIN_PERMISO`.
- [ ] `GET /usuarios` devuelve solo las cuentas de la DDRISS del usuario, activas y desactivadas, y nunca el hash.
- [ ] Puedo cambiar el rol de una cuenta y los datos de su empleado; cada cambio deja una fila `ACTUALIZAR` con los valores antes y después y el usuario que lo hizo.
- [ ] Una petición que no cambia nada responde 200 y no deja fila en la bitácora.
- [ ] Desactivar deja la cuenta con `activo = FALSE` y `desactivado_en`, sin tocar al empleado, y deja una fila `DESACTIVAR`.
- [ ] Una cuenta desactivada no puede iniciar sesión, y su token ya emitido recibe 401 `CUENTA_DESACTIVADA` en la siguiente petición.
- [ ] Las filas de la bitácora de una cuenta siguen existiendo después de desactivarla.
- [ ] Restaurar deja la cuenta activa, sin `desactivado_en`, sin intentos fallidos ni bloqueo, y deja una fila `REACTIVAR`.
- [ ] Un token cuyo rol, establecimiento o municipio ya no coincide con la base recibe 401 `SESION_DESACTUALIZADA`, y el frontend vuelve al login con ese mensaje.
- [ ] El administrador no puede cambiar su propio rol ni desactivar su propia cuenta (422).
- [ ] Una cuenta desactivada no se puede editar (409) hasta restaurarla.
- [ ] Una cuenta `ESTABLECIMIENTO` no se queda sin establecimiento, ni al cambiar el rol ni al editar al empleado (422).
- [ ] `/usuarios` muestra la tabla con Editar, Desactivar (con confirmación) y Restaurar según el estado y los permisos.
- [ ] `/usuarios/:id/editar` guarda solo lo que cambió y, si falla el rol, permite reintentar solo el rol.
- [ ] Sin `USUARIO_EDITAR`, `/usuarios/:id/editar` lleva a `/inicio`.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-05 tiene su avance y sus criterios marcados, y HU-07 tiene su nota.

## Decisiones

- **Sí:** listado mínimo (`GET /usuarios` sin búsqueda, filtros ni paginación) en este spec, anotado en HU-07. Las acciones de HU-05 viven en el listado y no conviene esperar a otra historia, como pasó con los catálogos en el SPEC 07.
- **No:** implementar HU-07 completa aquí. Es otra historia, de otra persona, y agranda el spec.
- **No:** solo endpoints sin pantalla. `AGENTS.md` pide contrato, endpoint y pantalla en cada spec.
- **Sí:** se editan el rol de la cuenta y los datos del empleado, con dos endpoints (`PATCH /usuarios/{id}` y `PATCH /empleados/{id}`) que la página llama en orden. Son dos tablas y dos recursos, como el registro del SPEC 07.
- **No:** cambiar el nombre de usuario. La historia no lo pide y es el dato con el que la persona entra.
- **Sí:** tres permisos (`USUARIO_EDITAR`, `USUARIO_DESACTIVAR`, `EMPLEADO_EDITAR`) y, por eso, desactivar y restaurar en endpoints propios (`POST /usuarios/{id}/desactivar` y `/restaurar`). Con `activo` dentro del `PATCH`, un mismo endpoint necesitaría dos permisos según el cuerpo.
- **No:** `PATCH /usuarios/{id}` con `rolId` y `activo` juntos, como dice el contrato actual. El contrato cambia en el paso 1 antes de programar.
- **Sí:** desactivar afecta solo a la cuenta (`usuario.activo`); el empleado sigue activo. La historia habla de cuentas, y el historial del empleado queda intacto.
- **Sí:** restaurar limpia `intentos_fallidos` y `bloqueado_hasta`. Una cuenta restaurada no debe seguir bloqueada por intentos de antes.
- **Sí:** desactivar y restaurar son idempotentes: repetirlos responde 200 sin escribir, igual que cualquier petición sin cambios.
- **Sí:** el administrador no puede cambiar su propio rol ni desactivarse, para que una DDRISS no se quede sin administrador por error. Sí puede editar sus datos de empleado.
- **Sí:** una cuenta desactivada no se edita (409) hasta restaurarla. Evita cambios a cuentas que nadie usa.
- **Sí:** `autenticar` revisa la cuenta en la base en cada petición. Sin eso, una cuenta desactivada seguiría entrando hasta 2 horas. Cuesta una consulta por petición, por llave primaria.
- **No:** aceptar la sesión abierta hasta que venza el token. Deja sin cumplir lo que la historia pretende.
- **No:** lista negra de tokens o identificador de sesión. La consulta a la cuenta resuelve el caso sin tablas nuevas.
- **Sí:** la revisión vive dentro de `autenticar` (como arreglo `[verificarToken, revisarCuenta]`), no en un middleware aparte. Así todas las rutas protegidas, actuales y futuras, quedan cubiertas sin tocarlas.
- **Sí:** `permisos.test.js` usa `verificarToken`, porque prueba `requierePermiso` con roles firmados a mano que no existen en la base. Se adapta, no se desactiva ningún caso.
- **Sí:** si cambian el rol, el establecimiento o el municipio, la sesión abierta se cierra con 401 `SESION_DESACTUALIZADA`. El token lleva esos datos para el ámbito y los permisos; con datos viejos, el usuario vería o haría lo que ya no le corresponde. Sale de la misma consulta, sin costo extra.
- **No:** comparar la DDRISS ni los permisos. La DDRISS no se cambia por la API, y los permisos siguen aplicando desde el siguiente login.
- **Sí:** los 401 de `revisarCuenta` no escriben en la bitácora. No son un intento de acceso a una función, y así las pruebas pueden firmar tokens para cuentas creadas y borrarlas después.
- **Sí:** 401 `CUENTA_DESACTIVADA` en `autenticar`, aunque el login responde 403 con el mismo código. El 401 es lo que hace que el frontend cierre la sesión.
- **Sí:** página `/usuarios/:id/editar` como subruta, igual que `/usuarios/nuevo`. Un Dialog quedaría apretado con nueve campos y dos Select que dependen entre sí.
- **Sí:** extraer `CamposEmpleado.jsx` del registro. Las dos páginas usan los mismos campos y reglas, y las pruebas del registro deben seguir pasando sin cambios.
- **Sí:** desactivar pide confirmación con AlertDialog; restaurar no. Desactivar corta la sesión de otra persona; restaurar no tiene efecto dañino.
- **Sí:** la página de edición envía solo los campos que cambiaron. La bitácora registra solo eso y no se tocan datos que nadie editó.
- **Sí:** en `catalogos.test.js`, los casos de la autoridad nacional y del personal de establecimiento crean su propia cuenta por SQL (prefijo `vitest-hu05-cat-`, borrada en `afterAll`) y firman el token para ella. Antes firmaban con el id del Administrador de prueba y otro rol, y `revisarCuenta` los rechaza con `SESION_DESACTUALIZADA`. Lo que comprueba cada prueba no cambia. Se descartó simular `pool.query` (frágil, porque la misma petición consulta los catálogos) y dejar de comparar el rol (contradice la decisión de cerrar la sesión al cambiarlo). Decidido durante la implementación.
- **Sí:** `ultimoAcceso` y `desactivadoEn` se leen con `UNIX_TIMESTAMP()` y se convierten a ISO en JavaScript. Aiven guarda las fechas en UTC y `mysql2` lee un `DATETIME` como hora local de Node (Guatemala), así que la fecha salía 6 horas corrida. `UNIX_TIMESTAMP()` usa la zona de la propia base, y sirve igual con una base local. Decidido durante la implementación.
- **Sí:** un `id` que no es un número entero positivo en `/usuarios/{id}` responde 404 `NO_ENCONTRADO`, como uno que no existe. Decidido durante la implementación.
- **Sí:** en `PATCH /empleados/{id}`, quitar el establecimiento sin enviar `municipioId` conserva el municipio guardado (el del establecimiento anterior), porque la persona sigue en el mismo lugar. Enviar `municipioId` con valor mientras el resultado tiene establecimiento responde 400, y cualquier campo fuera de `EmpleadoCambios` también. Decidido durante la implementación.
- **Sí:** la verificación manual usó la cuenta nueva "Prueba HU-05" (`prueba.hu05`) en lugar de "Prueba HU-04", que ya no existe en la base de prueba. Se creó desde "Registrar personal" como Administrador, porque hoy solo ese rol tiene permisos y una sesión sin permisos no hace peticiones que reciban el 401. Termina como Revisor y activa. Las dos sesiones se probaron en la misma pestaña, guardando primero la de `prueba.hu05` (obtenida antes del cambio de rol), porque la extensión de Playwright no puede abrir una segunda pestaña. Decidido durante la implementación.
- **Sí:** `autenticar.test.js` prueba `revisarCuenta` contra la ruta real `GET /roles`, con tokens que llevan `ROL_CONSULTAR`. Un 403 de `requierePermiso` escribiría en la bitácora con el id de la cuenta de prueba, y entonces ya no se podría borrar. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Editar o correr el 05 sin autorización | El paso 2 pide confirmación antes de cada uno; el script es idempotente y no borra datos. |
| Cambiar `autenticar` rompe las pruebas de specs anteriores | El paso 3 corre toda la suite; `permisos.test.js` se adapta a `verificarToken` sin quitar casos. |
| Un token firmado en las pruebas con datos distintos a los del usuario de prueba recibe `SESION_DESACTUALIZADA` | Las funciones `firmar` de las pruebas toman rol, establecimiento y municipio de la respuesta del login. |
| La consulta extra por petición agrega latencia contra Aiven | Es una consulta por llave primaria; si se nota, se mide antes de optimizar. |
| El administrador edita su propio municipio o establecimiento y su sesión se cierra | Es el comportamiento esperado: vuelve a entrar con los datos nuevos. Se menciona en el texto de ayuda de la página. |
| HU-07 cambia la respuesta de `GET /usuarios` a una paginada | Solo `PaginaUsuarios.jsx` la consume; HU-07 ajusta las dos cosas juntas. Queda anotado en la historia. |
| El empleado se guarda y el rol falla | Aviso parcial y reintento solo del rol, como en el registro. |

## Lo que **no** entra en este spec

- Búsqueda, filtros y paginación del listado (HU-07).
- Empleados sin cuenta y desactivación del empleado.
- Cambio del nombre de usuario y restablecimiento de contraseñas (HU-03).
- Mover cuentas entre DDRISS o editar la autoridad nacional.
- Revocación de tokens con lista negra.

Cada uno, si se hace, va en su propio spec.
