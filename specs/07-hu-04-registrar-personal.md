# SPEC 07 — Registrar personal y crear su cuenta

> **Estado:** Aprobado
> **Historia:** HU-04 (backend y frontend, más las lecturas mínimas de catálogos que necesita el formulario)
> **Depende de:** SPEC 01, SPEC 04, SPEC 05, SPEC 06
> **Fecha:** 2026-10-20
> **Objetivo:** Que el Administrador registre empleados de su DDRISS y, si lo necesitan, les cree una cuenta con uno de los cinco roles, desde una pantalla que consume `POST /empleados` y `POST /usuarios`.

## Por qué existe este spec

Hoy la única forma de crear personal es `npm run crear-usuario`, desde la consola. HU-04 lo lleva a la API y a una pantalla, **solo para el rol `ADMINISTRADOR`**: los permisos de este spec se asignan únicamente a ese rol en `05_permisos_mysql.sql`.

El formulario necesita listas de roles, DDRISS, municipios y establecimientos, y esos endpoints no existen todavía (los catálogos son HU-08 y HU-09). Este spec implementa **solo su lectura mínima**, filtrada por ámbito; HU-08 y HU-09 los amplían después. Las dos historias quedan anotadas para que nadie los vuelva a crear.

El listado de usuarios es HU-07. Por eso la opción "Usuarios" del menú abre una página con solo el botón "Registrar personal", y el formulario vive en `/usuarios/nuevo`.

## Alcance

**Entra:**

- `POST /empleados` y `POST /usuarios`, con validaciones, ámbito por DDRISS y bitácora.
- `GET /roles`, `GET /ddriss`, `GET /municipios` y `GET /establecimientos`, de solo lectura y filtrados por ámbito.
- Permisos nuevos en `05_permisos_mysql.sql`, asignados solo a `ADMINISTRADOR`.
- Contrato de los seis endpoints en `backend/openapi.yaml`, con `x-permiso`.
- Página `/usuarios` (botón "Registrar personal") y página `/usuarios/nuevo` con el formulario.
- Soporte de subrutas en `opcionesMenu.js` (rutas con permiso propio que no aparecen en el menú).
- Componentes de shadcn Select y Checkbox.
- Pruebas del backend (contra la base de prueba, borrando lo que crean) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual en el navegador con Playwright, como en el SPEC 06.
- Avance de HU-04 y notas en HU-07, HU-08 y HU-09 en `HISTORIAS_DE_USUARIO.md`; nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Listado, búsqueda y filtros de usuarios (HU-07).
- Editar, desactivar y restaurar cuentas o empleados; `PATCH /usuarios/{id}` (HU-05).
- `GET /empleados` y `GET /usuarios`.
- Obligar a cambiar la contraseña temporal al entrar (HU-03); aquí solo se guarda `debe_cambiar_contrasena = TRUE`, como ya hace la columna.
- Alta, edición y filtros completos de municipios, DDRISS y establecimientos (HU-08 y HU-09).
- Crear la autoridad nacional (empleado sin DDRISS) desde la pantalla: sigue con `npm run crear-usuario`.
- Elegir una DDRISS distinta a la del administrador.
- Generar la contraseña automáticamente o enviarla por correo.
- La integración de Playwright como herramienta del proyecto (spec pendiente).
- Cambios a `01_modelo_relacional_mysql.sql`.

## Modelo de datos

Este spec **no cambia el modelo**: usa `empleado`, `usuario`, `rol`, `ddriss`, `municipio` y `establecimiento` tal como están en el script 01. Sí agrega filas a `permiso` y `rol_permiso` con `05_permisos_mysql.sql`.

### Permisos

| Código | Módulo | Endpoint o ruta |
|---|---|---|
| `USUARIO_CONSULTAR` | `USUARIOS` | Opción "Usuarios" del menú (código provisional del SPEC 06, se confirma) |
| `EMPLEADO_CREAR` | `USUARIOS` | `POST /empleados` y la ruta `/usuarios/nuevo` |
| `USUARIO_CREAR` | `USUARIOS` | `POST /usuarios` |
| `ROL_CONSULTAR` | `USUARIOS` | `GET /roles` |
| `DDRISS_CONSULTAR` | `CONFIGURACION_CATALOGOS` | `GET /ddriss` |
| `MUNICIPIO_CONSULTAR` | `CONFIGURACION_CATALOGOS` | `GET /municipios` |
| `ESTABLECIMIENTO_CONSULTAR` | `CONFIGURACION_CATALOGOS` | `GET /establecimientos` |

Todos se asignan **solo a `ADMINISTRADOR`**. El módulo `USUARIOS` se estrena aquí y se anota en el encabezado del 05. Los otros roles recibirán los permisos de consulta de catálogos en los specs que los necesiten.

### `POST /empleados` (`EMPLEADO_CREAR`)

Entrada (`EmpleadoEntrada`, se actualiza):

| Campo | Regla |
|---|---|
| `nombres`, `apellidos` | Obligatorios; se recortan los espacios; 1 a 100 caracteres |
| `codigoEmpleado` | Opcional; hasta 20; único |
| `cargo` | Opcional; hasta 100 |
| `correo` | Opcional; hasta 150; debe contener `@`; único |
| `telefono` | Opcional; hasta 20 |
| `establecimientoId` | Opcional; debe existir, estar activo y ser de la DDRISS del administrador |
| `municipioId` | Opcional y **solo sin establecimiento**; debe estar activo y ser del departamento sede de la DDRISS del administrador |

- `ddriss_id` es siempre la DDRISS del administrador (`req.usuario.ddrissId`); no viene en el cuerpo.
- Con establecimiento, `municipio_id` se copia del establecimiento. Enviar `establecimientoId` y `municipioId` juntos responde 400.
- Los textos vacíos se guardan como `NULL`.
- Respuesta 201 (`Empleado`): `id`, `codigoEmpleado`, `nombres`, `apellidos`, `cargo`, `correo`, `telefono`, `establecimientoId`, `municipioId`, `ddrissId`, `activo`.
- Bitácora, en la misma transacción: `USUARIOS` / `CREAR`, entidad `empleado`, `valoresNuevos` = el objeto de la respuesta.

### `POST /usuarios` (`USUARIO_CREAR`)

Entrada: `empleadoId`, `nombreUsuario`, `contrasenaTemporal`, `rolId`, todos obligatorios.

| Campo | Regla |
|---|---|
| `nombreUsuario` | 3 a 50 caracteres, sin espacios (`^\S{3,50}$`); único |
| `contrasenaTemporal` | 8 a 72 caracteres (límite de bcrypt) |
| `rolId` | Uno de los cinco roles de `rol` |
| `empleadoId` | Debe existir, estar activo, ser de la DDRISS del administrador y no tener cuenta |

- Se guarda con bcrypt (costo 12, como `crear-usuario`), `debe_cambiar_contrasena = TRUE` y `creado_por` = el administrador.
- Rol `ESTABLECIMIENTO` y empleado sin establecimiento → 422: el login lo rechazaría con `CUENTA_SIN_ALCANCE`.
- Se puede crear cualquiera de los cinco roles, incluidos `ADMINISTRADOR` y `AUTORIDAD`, siempre con la DDRISS del administrador.
- Respuesta 201 (`Usuario`): `id`, `empleadoId`, `nombreUsuario`, `rol`, `rolNombre`, `activo`, `debeCambiarContrasena`. Nunca la contraseña ni el hash.
- Bitácora, en la misma transacción: `USUARIOS` / `CREAR`, entidad `usuario`, `valoresNuevos` = el objeto de la respuesta (no el cuerpo de la petición, porque `contrasenaTemporal` no está en la lista de campos sensibles).

### Errores de los dos endpoints

| HTTP | `codigo` | Caso |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Falta un campo obligatorio, un largo o formato no se cumple, o vienen establecimiento y municipio juntos |
| 404 | `NO_ENCONTRADO` | El empleado no existe, está inactivo o es de otra DDRISS |
| 409 | `CORREO_DUPLICADO` | Ya hay un empleado con ese correo |
| 409 | `CODIGO_EMPLEADO_DUPLICADO` | Ya hay un empleado con ese código |
| 409 | `EMPLEADO_CON_CUENTA` | El empleado ya tiene una cuenta |
| 409 | `NOMBRE_USUARIO_DUPLICADO` | Ya existe ese nombre de usuario |
| 422 | `ESTABLECIMIENTO_INVALIDO` | El establecimiento no existe, está inactivo o es de otra DDRISS |
| 422 | `MUNICIPIO_INVALIDO` | El municipio no existe, está inactivo o no es del departamento sede |
| 422 | `ROL_INVALIDO` | El rol no existe |
| 422 | `EMPLEADO_SIN_ESTABLECIMIENTO` | Rol `ESTABLECIMIENTO` para un empleado sin establecimiento |

Los duplicados se revisan antes de insertar y, si dos peticiones chocan, el `ER_DUP_ENTRY` de MySQL se traduce al mismo 409 según el nombre de la llave única. Los mensajes se escriben en español en el servicio.

### Lecturas de catálogos

| Endpoint | Permiso | Devuelve | Ámbito |
|---|---|---|---|
| `GET /roles` | `ROL_CONSULTAR` | `[{ id, codigo, nombre }]`, los cinco | Todos |
| `GET /ddriss` | `DDRISS_CONSULTAR` | `[{ id, codigo, nombre, departamentoId }]`, activas | La del usuario; `AUTORIDAD` sin DDRISS, todas |
| `GET /municipios` | `MUNICIPIO_CONSULTAR` | `[{ id, departamentoId, codigoIne, nombre, activo }]`, activos, por nombre | Los del departamento sede de la DDRISS del usuario; `AUTORIDAD` sin DDRISS, todos |
| `GET /establecimientos` | `ESTABLECIMIENTO_CONSULTAR` | Los campos que ya tiene el contrato (`id`, `codigo`, `nombre`, tipo, distrito, municipio, `reportaProduccion`, `esExterno`, `activo`), por nombre | `filtroAlcance` (SPEC 04) sobre `e.id` y `e.ddriss_id` |

- `GET /establecimientos` mantiene los filtros opcionales del contrato: `municipioId` y `activo`. El formulario pide `activo=true`.
- `GET /municipios` **pierde el parámetro `jurisdiccion` y el campo `esJurisdiccion`**: `municipio.es_jurisdiccion` se eliminó en el modelo v0.5. HU-08 agregará los filtros que necesite.

### Frontend

**Rutas.** Las entradas de `opcionesMenu.js` aceptan `subrutas: [{ ruta, permiso, pagina }]`, que `App.jsx` declara con `RutaConPermiso` y que el menú no muestra. La opción del menú sigue marcada como activa en sus subrutas (`pathname === ruta` o empieza por `ruta + '/'`).

| Ruta | Permiso | Página |
|---|---|---|
| `/usuarios` | `USUARIO_CONSULTAR` | `PaginaUsuarios`: título "Usuarios" y el botón "Registrar personal", visible con `EMPLEADO_CREAR` |
| `/usuarios/nuevo` | `EMPLEADO_CREAR` | `PaginaRegistrarPersonal` |

**Formulario `/usuarios/nuevo`.** Al cargar pide en paralelo `GET /ddriss`, `GET /roles`, `GET /municipios` y `GET /establecimientos?activo=true`. Mientras cargan, los campos están deshabilitados; si una falla, se muestra un Alert con el mensaje y no se puede enviar.

- **Datos del empleado:** nombres*, apellidos*, código de empleado, cargo, correo y teléfono (Input); DDRISS como texto de solo lectura; establecimiento (Select, con la primera opción "Sin establecimiento (personal de la DDRISS)"). Con establecimiento, se muestra su municipio como texto; sin él, aparece el Select de municipio, opcional.
- **Cuenta de acceso:** Checkbox "Crear cuenta de acceso". Al marcarlo aparecen nombre de usuario*, contraseña temporal*, confirmar contraseña* (Input `password`) y rol* (Select con `nombre`).
- **Validaciones en el cliente** (el backend valida igual): obligatorios, contraseña de 8 caracteres o más e igual a su confirmación, y rol "Personal del establecimiento" solo con establecimiento. Mientras falte algo, "Registrar" está deshabilitado.
- **Envío:** "Registrar" llama a `POST /empleados` y, si se marcó la cuenta, a `POST /usuarios` con el `id` del empleado. Mientras tanto, el botón dice "Registrando…" y está deshabilitado.
- **Resultados:**
  - Todo bien → Alert de éxito: "Se registró a {nombres} {apellidos}." y, con cuenta, "Se creó la cuenta {nombreUsuario}.", con los botones "Registrar otro" (vacía el formulario) y "Volver a Usuarios".
  - Falla el empleado → Alert de error con el `mensaje` del backend; el formulario conserva lo escrito (la contraseña se vacía).
  - El empleado se crea y falla la cuenta → Alert: "Se registró a {nombres} {apellidos}, pero no se pudo crear la cuenta: {mensaje}". El formulario pasa a modo "solo cuenta": los datos del empleado quedan como texto y el botón "Crear cuenta" reintenta solo `POST /usuarios`.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← seis endpoints, Empleado, Usuario, EmpleadoEntrada, UsuarioEntrada
├── db/05_permisos_mysql.sql                   ← siete permisos y sus asignaciones a ADMINISTRADOR
├── src/app.js                                 ← monta los routers nuevos
├── src/modulos/usuarios/
│   ├── usuarios.routes.js                     ← nuevo: /empleados, /usuarios, /roles
│   ├── usuarios.controller.js                 ← nuevo
│   └── usuarios.service.js                    ← nuevo
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← nuevo: /ddriss, /municipios, /establecimientos
│   ├── catalogos.controller.js                ← nuevo
│   └── catalogos.service.js                   ← nuevo
└── tests/
    ├── usuarios.test.js                       ← nuevo
    └── catalogos.test.js                      ← nuevo
frontend/src/
├── App.jsx                                    ← subrutas
├── components/ui/select.jsx, checkbox.jsx    ← shadcn
├── api/usuarios.js                            ← nuevo: registrarEmpleado, crearCuenta, listarRoles
├── api/catalogos.js                           ← nuevo: listarDdriss, listarMunicipios, listarEstablecimientos
├── componentes/layout/opcionesMenu.js         ← pagina y subrutas de Usuarios
├── componentes/layout/MenuLateral.jsx         ← activa en subrutas
├── componentes/layout/Layout.test.jsx         ← caso de subruta activa
└── paginas/usuarios/
    ├── PaginaUsuarios.jsx                     ← nuevo
    ├── PaginaRegistrarPersonal.jsx            ← nuevo
    └── PaginaRegistrarPersonal.test.jsx       ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance de HU-04; notas en HU-07, HU-08 y HU-09
CLAUDE.md                                      ← nota sobre subrutas y catálogos mínimos
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: completar `POST /empleados` y `POST /usuarios` (cuerpos, respuestas 201 con `Empleado` y `Usuario`, y 400, 403, 404, 409 y 422 con los códigos de la tabla); agregar `GET /roles` y `GET /ddriss`; ajustar `GET /municipios` (sin `jurisdiccion` ni `esJurisdiccion`) y `GET /establecimientos` (respuestas 403); poner `x-permiso` en los seis. Comprobación: `/api/docs` carga sin errores y muestra los seis endpoints con su permiso.
2. **Permisos.** **Pedir confirmación antes de editar y antes de correr** `05_permisos_mysql.sql` (zona protegida). Agregar los siete permisos y sus asignaciones a `ADMINISTRADOR`, y anotar el módulo `USUARIOS` en el encabezado. Con autorización, correrlo dos veces en la base de prueba de Aiven. Comprobación: no da error ninguna de las dos veces, hay una sola fila por asignación y el login del usuario de prueba trae los siete códigos.
3. **Catálogos.** Crear el módulo `catalogos` con `GET /ddriss`, `GET /municipios` y `GET /establecimientos`, y `GET /roles` en el módulo `usuarios`. Pruebas en `tests/catalogos.test.js`, con el token del usuario de prueba:
   - `GET /roles` devuelve los cinco roles;
   - `GET /ddriss` devuelve solo la DDRISS del usuario;
   - `GET /municipios` devuelve solo municipios del departamento sede y ninguno inactivo;
   - `GET /establecimientos` devuelve solo establecimientos de su DDRISS, y con `activo=true` ninguno inactivo;
   - cada uno responde 403 `SIN_PERMISO` con un token sin su permiso.
   Comprobación: `npm test` del backend pasa.
4. **`POST /empleados`.** Servicio con las validaciones del "Modelo de datos", `enTransaccion` y `registrarBitacora`. Pruebas en `tests/usuarios.test.js`, que crean datos con el prefijo `vitest-hu04-` en el correo y el código y los borran en `afterAll` (nunca inician sesión con las cuentas creadas: la bitácora tiene llave foránea a `usuario`):
   - con datos mínimos responde 201, guarda la DDRISS del administrador y deja una fila `USUARIOS`/`CREAR` de entidad `empleado`;
   - con establecimiento, el municipio sale del establecimiento;
   - sin nombres responde 400; con establecimiento y municipio juntos, 400;
   - un establecimiento de otra DDRISS o inactivo responde 422 `ESTABLECIMIENTO_INVALIDO`; un municipio de otro departamento, 422 `MUNICIPIO_INVALIDO`;
   - un correo repetido responde 409 `CORREO_DUPLICADO`; un código repetido, 409 `CODIGO_EMPLEADO_DUPLICADO`;
   - sin `EMPLEADO_CREAR` responde 403.
5. **`POST /usuarios`.** Servicio con bcrypt, `enTransaccion` y `registrarBitacora`. Pruebas en `tests/usuarios.test.js`:
   - responde 201 sin hash ni contraseña, con `debeCambiarContrasena: true`; en la base, `hash_contrasena` es bcrypt y `creado_por` es el administrador;
   - la fila de bitácora no contiene la contraseña;
   - un segundo intento para el mismo empleado responde 409 `EMPLEADO_CON_CUENTA`; un nombre de usuario repetido, 409 `NOMBRE_USUARIO_DUPLICADO`;
   - un empleado inexistente o de otra DDRISS responde 404; un rol inexistente, 422 `ROL_INVALIDO`;
   - rol `ESTABLECIMIENTO` para un empleado sin establecimiento responde 422 `EMPLEADO_SIN_ESTABLECIMIENTO`, y con establecimiento, 201;
   - un nombre de usuario con espacios o una contraseña de 7 caracteres responden 400;
   - sin `USUARIO_CREAR` responde 403.
   Comprobación: `npm test` del backend pasa y deja la base sin los empleados ni las cuentas de la prueba.
6. **Frontend: base.** `npx shadcn@latest add select checkbox` y revisar `package.json`. Crear `src/api/usuarios.js` y `src/api/catalogos.js`. Agregar `subrutas` a `opcionesMenu.js` y `App.jsx`, la regla de opción activa en `MenuLateral.jsx` y `PaginaUsuarios.jsx`. Pruebas: en `Layout.test.jsx`, "Usuarios" sigue activa en `/usuarios/nuevo`; en `RutaConPermiso.test.jsx`, `/usuarios/nuevo` sin `EMPLEADO_CREAR` lleva a `/inicio`. Comprobación: `npm test` del frontend pasa.
7. **Frontend: formulario.** Crear `PaginaRegistrarPersonal.jsx` según el "Modelo de datos". Pruebas en `PaginaRegistrarPersonal.test.jsx`, con `vi.mock` sobre `@/api/usuarios.js` y `@/api/catalogos.js`:
   - muestra la DDRISS y las opciones de los Select;
   - "Registrar" está deshabilitado sin nombres o con contraseñas distintas;
   - el rol "Personal del establecimiento" sin establecimiento muestra el aviso y no deja enviar;
   - con establecimiento no aparece el Select de municipio y se muestra el municipio del establecimiento;
   - sin cuenta, llama solo a `registrarEmpleado` y muestra el éxito;
   - con cuenta, llama a las dos funciones con el `id` del empleado y muestra los dos mensajes;
   - si falla la cuenta, muestra el aviso parcial, pasa a "solo cuenta" y "Crear cuenta" reintenta solo `crearCuenta`;
   - un 409 del empleado muestra su `mensaje`; si falla un catálogo, se muestra el error y no se puede enviar;
   - "Registrar otro" vacía el formulario.
   Comprobación: `npm test` del frontend pasa.
8. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright (la sesión se obtiene con `POST /auth/login` y se guarda en `sessionStorage`, como en el SPEC 06): el menú muestra "Usuarios"; `/usuarios` muestra el botón; registrar "Prueba HU-04" con un establecimiento y una cuenta `ESTABLECIMIENTO`; repetir el nombre de usuario y ver el aviso parcial; revisar las filas de `bitacora`. Los registros de esta verificación quedan en la base de prueba con el prefijo "Prueba HU-04". Actualizar el "Avance" de HU-04 y marcar sus criterios; agregar a HU-07 que `/usuarios` ya existe y solo le falta el listado; agregar a HU-08 y HU-09 que `GET /municipios`, `GET /ddriss` y `GET /establecimientos` ya existen en versión mínima (solo lectura, por ámbito) y se amplían ahí. Nota en "Notas de contexto" de `CLAUDE.md` sobre `subrutas` y los catálogos mínimos.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los seis endpoints con su `x-permiso` y sus errores, y `/api/docs` carga sin errores.
- [ ] `05_permisos_mysql.sql` se corre dos veces seguidas sin error ni filas duplicadas, y el login del Administrador de prueba trae los siete permisos; ningún otro rol los tiene.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba, y las pruebas del backend no dejan empleados ni cuentas en la base.
- [ ] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md`.
- [ ] Un token sin el permiso de cada endpoint recibe 403 `SIN_PERMISO`.
- [ ] `POST /empleados` crea el empleado con la DDRISS del administrador; con establecimiento, el municipio es el del establecimiento.
- [ ] `POST /empleados` rechaza con 422 un establecimiento de otra DDRISS o inactivo y un municipio fuera del departamento sede.
- [ ] `POST /usuarios` crea la cuenta con uno de los cinco roles, contraseña en bcrypt, `debe_cambiar_contrasena = TRUE` y `creado_por` del administrador, y la respuesta no trae contraseña ni hash.
- [ ] No se crean dos cuentas con el mismo nombre de usuario ni dos cuentas para el mismo empleado (409).
- [ ] Una cuenta `ESTABLECIMIENTO` exige un empleado con establecimiento (422).
- [ ] Ningún empleado creado por la API queda sin DDRISS.
- [ ] Cada alta deja una fila `USUARIOS`/`CREAR` en `bitacora`, sin la contraseña.
- [ ] `GET /roles`, `/ddriss`, `/municipios` y `/establecimientos` devuelven solo lo del ámbito del usuario.
- [ ] Con sesión de Administrador, el menú muestra "Usuarios"; `/usuarios` tiene el botón "Registrar personal" y `/usuarios/nuevo` el formulario.
- [ ] Sin `EMPLEADO_CREAR`, `/usuarios/nuevo` lleva a `/inicio`.
- [ ] El formulario registra un empleado con o sin cuenta y muestra el mensaje de éxito con "Registrar otro" y "Volver a Usuarios".
- [ ] Si la cuenta falla después de crear al empleado, se muestra el aviso parcial y se puede reintentar solo la cuenta.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-04 tiene su avance y sus criterios marcados, y HU-07, HU-08 y HU-09 tienen su nota.

## Decisiones

- **Sí:** un solo spec con backend y pantalla. HU-04 vale 5 SP y `AGENTS.md` pide contrato, endpoint y pantalla en cada spec.
- **Sí:** lecturas mínimas de catálogos en este spec, anotadas en HU-08 y HU-09. El formulario no se puede usar sin ellas y no conviene esperar a otra historia.
- **No:** un endpoint ad hoc de opciones del formulario. Duplicaría lo que HU-08 y HU-09 tienen que exponer de todos modos.
- **Sí:** dos endpoints y una pantalla en dos pasos, como dicen la historia y el contrato. Un empleado puede existir sin cuenta, y si falla la cuenta se reintenta solo esa parte.
- **No:** un endpoint atómico que cree empleado y cuenta. Cambia el contrato y obliga a tener otra ruta para empleados que ya existen.
- **Sí:** solo `ADMINISTRADOR` registra personal y crea cuentas: los siete permisos se asignan únicamente a ese rol.
- **Sí:** el administrador escribe la contraseña temporal y se guarda `debe_cambiar_contrasena = TRUE`. Obligar a cambiarla queda para HU-03.
- **No:** generar la contraseña en el sistema. Exigiría mostrarla una sola vez y un flujo de entrega que la historia no pide.
- **Sí:** la DDRISS del empleado es siempre la del administrador (regla 10). Las listas de establecimientos y municipios ya vienen filtradas a ella.
- **No:** crear la autoridad nacional desde la pantalla. Es un caso raro y sigue cubierto por `npm run crear-usuario`.
- **Sí:** con establecimiento, el municipio se toma del establecimiento. Evita datos contradictorios; sin establecimiento, el municipio es opcional (coordinador municipal).
- **Sí:** los municipios de una DDRISS son los de su departamento sede. Funciona con la siembra del 01; los distritos de salud solo existen en los datos de prueba.
- **Sí:** se puede crear cualquiera de los cinco roles, incluido `ADMINISTRADOR`.
- **Sí:** rol `ESTABLECIMIENTO` exige establecimiento al crear la cuenta. Sin él, el login respondería `CUENTA_SIN_ALCANCE`.
- **Sí:** un empleado de otra DDRISS responde 404, como cualquier recurso fuera del ámbito (SPEC 04); un establecimiento, municipio o rol inválido en el cuerpo responde 422.
- **Sí:** la bitácora guarda el objeto de la respuesta y no el cuerpo, porque `contrasenaTemporal` no está entre los campos sensibles que limpia `registrarBitacora`.
- **Sí:** `GET /municipios` pierde `jurisdiccion` y `esJurisdiccion`, que quedaron obsoletos con el modelo v0.5.
- **Sí:** `/usuarios/nuevo` como subruta fuera del menú y `/usuarios` con solo el botón. HU-07 agrega el listado sin mover el formulario.
- **Sí:** `subrutas` en `opcionesMenu.js`. Mantiene una sola lista de rutas y permisos, como decidió el SPEC 06.
- **Sí:** las pruebas del backend borran los empleados y las cuentas que crean, y no inician sesión con ellas. La bitácora es inmutable y tiene llave foránea a `usuario`.
- **Sí:** los avisos del formulario con Alert. Sonner necesita el paquete `sonner`, que no está en la lista de `AGENTS.md`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Editar o correr el 05 sin autorización | El paso 2 pide confirmación antes de cada uno; el script es idempotente y no borra datos. |
| Una prueba inicia sesión con una cuenta creada y ya no se puede borrar | Las pruebas no lo hacen; si ocurre, la cuenta queda desactivada con el prefijo `vitest-hu04-` y se anota. |
| Una prueba falla a medias y deja datos | `afterAll` borra por prefijo, no por los ids guardados en memoria. |
| HU-08 o HU-09 vuelven a crear los mismos endpoints | Quedan anotados en las dos historias y en `CLAUDE.md`. |
| Quitar `jurisdiccion` de `GET /municipios` choca con lo que planeaba HU-08 | El campo ya no existe en la base; HU-08 define sus filtros sobre el modelo actual. |
| La contraseña temporal queda en el historial del navegador o en el código | Input `password`, se vacía tras un error, y la bitácora guarda el objeto de la respuesta. |
| Dos peticiones simultáneas con el mismo nombre de usuario | La llave única de MySQL lo impide y el `ER_DUP_ENTRY` se traduce al mismo 409. |

## Lo que **no** entra en este spec

- Listado de usuarios (HU-07) y edición, desactivación y restauración (HU-05).
- Cambio obligatorio de contraseña (HU-03).
- Alta y edición de catálogos (HU-08 y HU-09).
- Autoridad nacional desde la pantalla y DDRISS distinta a la del administrador.
- Integración de Playwright como herramienta del proyecto.

Cada uno, si se hace, va en su propio spec.
