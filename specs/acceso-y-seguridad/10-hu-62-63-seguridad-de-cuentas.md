# SPEC 10 — Seguridad de cuentas: desbloquear, restablecer contraseña y contraseña temporal generada

> **Estado:** Implementado
> **Historia:** HU-62, HU-63 (más ajustes a HU-01 y HU-04)
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 07, SPEC 08, SPEC 09
> **Fecha:** 2026-10-21
> **Objetivo:** Que el Administrador desbloquee cuentas y restablezca contraseñas desde `/usuarios`, que toda contraseña temporal la genere el sistema y se muestre una sola vez, y que el login explique en un modal qué hacer cuando la cuenta se bloquea.

## Por qué existe este spec

La asesoría del 2026-10-21 pidió tres cosas:

1. Que el usuario bloqueado sepa qué hacer.
2. Que el administrador resuelva una emergencia (cuenta bloqueada o contraseña olvidada) sin esperar.
3. Que la contraseña temporal no la invente el administrador.

El detalle acordado por el equipo estaba en la propuesta A (`docs/SPECS/PROPUESTA_SPEC_A_SEGURIDAD_DE_CUENTAS.md`, que ya no se conserva; su resumen está en HU-62 de `docs/SPECS/HISTORIAS_DE_USUARIO.md`). Este spec la tomó como base y cerró lo que dejaba abierto.

`CLAUDE.md` pide una historia por spec. Aquí se juntan HU-62 y HU-63 porque comparten el generador de contraseñas, el diálogo que la muestra y la misma tabla. También ajusta dos historias ya terminadas: HU-01 (el aviso de bloqueo pasa a un modal) y HU-04 (`POST /usuarios` deja de recibir la contraseña temporal).

También resuelve el riesgo que dejó el SPEC 09: una sesión abierta cuya contraseña restablece el administrador empieza a recibir 403 `CAMBIO_CONTRASENA_REQUERIDO`. Aquí el frontend cierra esa sesión con un aviso.

**Zonas protegidas autorizadas por el equipo al escribir este spec:**

- `backend/db/05_permisos_mysql.sql`: los permisos `USUARIO_DESBLOQUEAR` y `USUARIO_RESTABLECER_CONTRASENA`, solo para `ADMINISTRADOR`.
- `ACCIONES` en `auditoria.service.js`: `DESBLOQUEAR` y `RESTABLECER_CONTRASENA`.
- `CLAVES_SENSIBLES` en `auditoria.service.js`: `contrasenaTemporal`.

Aun así, al implementar se pide confirmación antes de editar `backend/db/` y antes de correr el 05, como dice `CLAUDE.md`.

## Alcance

**Entra:**

- Mensaje nuevo del 423 `CUENTA_BLOQUEADA`, con los minutos de `MINUTOS_BLOQUEO`.
- Modal "Usuario bloqueado" en el login y `CampoContrasena` en su campo de contraseña.
- `bloqueada` en `UsuarioDetalle` (sin la fecha ni los intentos).
- `POST /usuarios/{id}/desbloquear` (HU-62).
- Generador de contraseñas temporales en `backend/src/modulos/auth/contrasenaTemporal.service.js`.
- `POST /usuarios` sin `contrasenaTemporal` en la entrada y con ella en la respuesta 201 (`UsuarioCreado`).
- `POST /usuarios/{id}/restablecer-contrasena` (HU-63).
- Dos permisos nuevos, dos acciones nuevas en `ACCIONES` y `contrasenaTemporal` en `CLAVES_SENSIBLES`.
- En `/usuarios`: Badge "Bloqueada", botón Editar a la vista y un menú "Más acciones" (`DropdownMenu` de shadcn) con Desactivar/Restaurar, Desbloquear y Restablecer contraseña.
- Componente propio `DialogoContrasenaTemporal`, usado al crear una cuenta y al restablecer.
- "Registrar personal" sin los campos de contraseña.
- El frontend cierra la sesión ante un 403 `CAMBIO_CONTRASENA_REQUERIDO` y el login muestra un aviso.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance de HU-62 y HU-63 y notas en HU-01 y HU-04 en `HISTORIAS_DE_USUARIO.md`; nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Que el usuario recupere la contraseña por sí mismo (correo con enlace, preguntas de seguridad).
- Un formulario público para pedir el desbloqueo.
- Cambiar la duración del bloqueo o el número de intentos.
- Revocar tokens o cerrar sesiones desde el backend.
- Validación del formato de los campos del empleado y el CUI (spec B, `docs/SPECS/PROPUESTA_SPEC_B_DATOS_DEL_EMPLEADO.md`).
- Búsqueda, filtros y paginación del listado (HU-07).
- Cambios a `01_modelo_relacional_mysql.sql`.

## Modelo de datos

Este spec **no cambia el modelo**: usa `usuario.intentos_fallidos`, `usuario.bloqueado_hasta`, `usuario.hash_contrasena` y `usuario.debe_cambiar_contrasena` tal como están en el script 01. Sí agrega filas a `permiso` y `rol_permiso` con `05_permisos_mysql.sql`. No agrega dependencias: `crypto` viene con Node y zxcvbn ya llegó con el SPEC 09.

### Permisos

| Código | Módulo | Endpoint |
|---|---|---|
| `USUARIO_DESBLOQUEAR` | `USUARIOS` | `POST /usuarios/{id}/desbloquear` |
| `USUARIO_RESTABLECER_CONTRASENA` | `USUARIOS` | `POST /usuarios/{id}/restablecer-contrasena` |

Los dos se asignan **solo a `ADMINISTRADOR`**. El 05 es idempotente y se corre dos veces en la base de prueba para comprobarlo.

### Acciones de la bitácora

`ACCIONES` agrega `DESBLOQUEAR` y `RESTABLECER_CONTRASENA`. `CLAVES_SENSIBLES` agrega `contrasenaTemporal`.

### Mensaje del bloqueo (HU-01)

El 423 `CUENTA_BLOQUEADA` de `auth.service.js` cambia su mensaje a:

`Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en ${MINUTOS_BLOQUEO} minutos.`

No cambian la lógica del bloqueo, el código HTTP, el formato del error ni las constantes.

### `bloqueada` en el listado

`UsuarioDetalle` (en `GET /usuarios`, `GET /usuarios/{id}` y las respuestas de las acciones) agrega `bloqueada: boolean`.

- Se calcula en SQL con `COALESCE(u.bloqueado_hasta > NOW(), FALSE)`.
- No se devuelven `bloqueado_hasta` ni `intentos_fallidos`.
- El comentario de `usuarios.service.js` que dice que nunca se lee `bloqueado_hasta` se corrige.

### Generador de contraseñas temporales

`backend/src/modulos/auth/contrasenaTemporal.service.js` exporta `generarContrasenaTemporal(datosPersonales)`.

- 12 caracteres (la constante `LARGO`, el mínimo de la política del SPEC 09) elegidos con `crypto.randomInt`, nunca con `Math.random`.
- Alfabeto de 56 caracteres, sin los que se confunden (`0 O o 1 l I`): `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`.
- Recibe `{ nombreUsuario, nombres, apellidos }` y revisa el resultado con `evaluarContrasena` de `politicaContrasena.service.js`. Si tiene algún motivo, genera otra.

### Errores nuevos o reutilizados

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 409 | `CUENTA_NO_BLOQUEADA` | Desbloquear una cuenta que no está bloqueada | "La cuenta no está bloqueada." |
| 409 | `CUENTA_DESACTIVADA` | Desbloquear una cuenta desactivada | "La cuenta está desactivada; al restaurarla se quita el bloqueo." |
| 409 | `CUENTA_DESACTIVADA` | Restablecer la contraseña de una cuenta desactivada | "La cuenta está desactivada; restáurela antes de restablecer su contraseña." |
| 422 | `CUENTA_PROPIA` | Restablecer la contraseña propia | "Para cambiar su propia contraseña use «Cambiar contraseña»." |

`CUENTA_DESACTIVADA` y `CUENTA_PROPIA` ya existen (SPEC 08); solo cambia el mensaje según la acción.

### `POST /usuarios/{id}/desbloquear` (`USUARIO_DESBLOQUEAR`)

Sin cuerpo. Orden de revisión:

| Caso | Respuesta |
|---|---|
| El id no es válido, la cuenta no existe o está fuera del alcance | 404 `NO_ENCONTRADO` |
| La cuenta está desactivada | 409 `CUENTA_DESACTIVADA` |
| `bloqueado_hasta` es NULL o ya pasó | 409 `CUENTA_NO_BLOQUEADA` |
| Cuenta bloqueada | Pone `intentos_fallidos = 0` y `bloqueado_hasta = NULL`; responde 200 con `UsuarioDetalle` |

- En `enTransaccion`, con la bitácora: `USUARIOS` / `DESBLOQUEAR`, entidad `usuario`, `{ bloqueada: true }` → `{ bloqueada: false }`.
- Se permite desbloquear la cuenta propia: alguien pudo bloquearla con intentos mientras el administrador tenía una sesión abierta.

### `POST /usuarios` (ajuste a HU-04)

- `UsuarioEntrada` ya no tiene `contrasenaTemporal`. Si llega, responde 400 `ENTRADA_INVALIDA` (así se detectan clientes viejos).
- El backend genera la contraseña con `generarContrasenaTemporal`, con el `nombreUsuario` de la entrada y los nombres y apellidos del empleado.
- La respuesta 201 usa el esquema nuevo `UsuarioCreado`: el objeto `Usuario` de hoy más `contrasenaTemporal` (en claro, una sola vez). La forma actual de la respuesta no cambia en lo demás.
- La bitácora `CREAR` sigue guardando el objeto `Usuario` **sin** `contrasenaTemporal`. `CLAVES_SENSIBLES` la filtra como segunda protección. El comentario de la línea que explica esto se corrige.
- `LARGO_MINIMO_CONTRASENA` y `BYTES_MAXIMOS_CONTRASENA` de `usuarios.service.js` se quitan si ya nadie los usa.

### `POST /usuarios/{id}/restablecer-contrasena` (`USUARIO_RESTABLECER_CONTRASENA`)

Sin cuerpo. Orden de revisión:

| Caso | Respuesta |
|---|---|
| El id no es válido, la cuenta no existe o está fuera del alcance | 404 `NO_ENCONTRADO` |
| La cuenta está desactivada | 409 `CUENTA_DESACTIVADA` |
| Es la cuenta propia | 422 `CUENTA_PROPIA` |
| Cualquier otra | Genera la contraseña, guarda su hash (bcrypt, costo 12) con `debe_cambiar_contrasena = TRUE`, `intentos_fallidos = 0` y `bloqueado_hasta = NULL`; responde 200 con `RestablecimientoContrasena` |

```js
// RestablecimientoContrasena
{ usuario: UsuarioDetalle, contrasenaTemporal: 'Hk7pQ2...' }
```

- Bitácora en la misma transacción: `USUARIOS` / `RESTABLECER_CONTRASENA`, entidad `usuario`, con `{ debeCambiarContrasena, bloqueada }` antes y después. Nunca la contraseña ni el hash.
- **Excepción a la regla de "sin cambios, sin bitácora":** el restablecimiento se registra **siempre**, aunque `diferencias` dé `null` (la cuenta ya debía cambiar la contraseña y no estaba bloqueada), porque la contraseña sí cambió.
- La sesión abierta de esa cuenta no se toca en el backend: `exigirContrasenaCambiada` (SPEC 09) le responde 403 `CAMBIO_CONTRASENA_REQUERIDO` desde la siguiente petición.

### Frontend

**Login (`PaginaLogin.jsx`).**

- Con un 423, en lugar del Alert rojo se abre un `AlertDialog` con el título "Usuario bloqueado", el `mensaje` del backend y un solo botón, "Entendido".
- Al cerrarlo, el formulario queda como estaba, con la contraseña vacía.
- Los demás errores siguen como Alert.
- El campo de contraseña pasa a `CampoContrasena` (SPEC 09).

**Cierre por contraseña restablecida (`cliente.js` y `ProveedorSesion.jsx`).**

- Un 403 con `codigo` `CAMBIO_CONTRASENA_REQUERIDO`, con el mismo token guardado, llama al mismo manejador que el 401 (`alPerderSesion`).
- `ProveedorSesion` cierra la sesión localmente, **sin** llamar a `POST /auth/logout`, y el login muestra el aviso: "Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador."
- Los demás 403 no cierran la sesión.

**Tabla de `/usuarios` (`PaginaUsuarios.jsx`).**

- Columna Estado: Badge "Bloqueada" junto a "Activa" cuando `bloqueada` es `true`.
- Acciones de cada fila: el botón "Editar" queda a la vista (como hoy). Las demás van en un `DropdownMenu` de shadcn, con un botón de ícono `MoreHorizontal` y `aria-label` "Más acciones". El menú solo aparece si la fila tiene al menos una opción.

| Opción del menú | Cuándo aparece | Qué hace |
|---|---|---|
| Desactivar | Cuenta activa, no propia, con `USUARIO_DESACTIVAR` (regla del SPEC 08) | Abre el `AlertDialog` que ya existe |
| Restaurar | Cuenta desactivada, con `USUARIO_DESACTIVAR` | Igual que hoy, sin confirmación |
| Desbloquear | `bloqueada` es `true`, con `USUARIO_DESBLOQUEAR` | Sin confirmación |
| Restablecer contraseña | Cuenta activa, no propia, con `USUARIO_RESTABLECER_CONTRASENA` | Pide confirmación |

- Desbloquear: mientras tanto, la fila queda ocupada (como Restaurar). Al terminar, la fila se reemplaza con la respuesta y aparece el Alert de éxito "Se desbloqueó la cuenta {nombreUsuario}."; si falla, el Alert de error con el `mensaje`.
- Restablecer contraseña: `AlertDialog` "¿Restablecer la contraseña de {nombreUsuario}?" con el texto "La contraseña actual dejará de funcionar. El sistema generará una temporal que la persona deberá cambiar al iniciar sesión." y los botones "Cancelar" y "Restablecer" (mientras tanto, "Restableciendo…"). Al terminar, reemplaza la fila con `usuario` y abre `DialogoContrasenaTemporal`. Si falla, Alert de error con el `mensaje`.
- Un `DropdownMenuItem` que abre un `AlertDialog` lo hace desde `onSelect`, después de cerrar el menú, para que el foco no quede atrapado.

**`DialogoContrasenaTemporal`** (`frontend/src/paginas/usuarios/DialogoContrasenaTemporal.jsx`), sobre `AlertDialog`. Recibe `nombreUsuario`, `contrasena` y `alCerrar`. Muestra:

- el nombre de usuario y la contraseña en letra monoespaciada (la contraseña se puede seleccionar);
- un botón "Copiar" (`navigator.clipboard.writeText`), que dice "Copiada" por 2 segundos, o "No se pudo copiar" si falla o no existe `navigator.clipboard`;
- el aviso "Esta contraseña no se volverá a mostrar. Entréguela a la persona de forma segura; deberá cambiarla al iniciar sesión.";
- un solo botón para cerrar: "Ya la anoté".

Al cerrarlo, la página que lo abrió borra la contraseña de su estado. Nunca se guarda en `sessionStorage`, en `localStorage` ni en la URL.

**"Registrar personal" (`PaginaRegistrarPersonal.jsx`).**

- Se quitan "Contraseña temporal" y "Confirmar contraseña", y la constante de largo mínimo que usaban.
- Después de crear la cuenta se abre `DialogoContrasenaTemporal` con `nombreUsuario` y `contrasenaTemporal` de la respuesta. Al cerrarlo sigue el flujo de éxito actual.
- El reintento cuando se creó el empleado y falló la cuenta sigue funcionando igual.

**API (`frontend/src/api/usuarios.js`).** `desbloquearCuenta(id)` y `restablecerContrasena(id)`. `crearCuenta` deja de enviar `contrasenaTemporal`.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← endpoints, esquemas y errores nuevos
├── db/05_permisos_mysql.sql                       ← dos permisos (autorizado; confirmar antes de editar y de correr)
├── src/modulos/auth/
│   ├── auth.service.js                            ← mensaje del 423
│   └── contrasenaTemporal.service.js              ← nuevo
├── src/modulos/auditoria/auditoria.service.js     ← ACCIONES y CLAVES_SENSIBLES
├── src/modulos/usuarios/
│   ├── usuarios.routes.js                         ← dos rutas nuevas
│   ├── usuarios.controller.js
│   └── usuarios.service.js                        ← bloqueada, desbloquear, restablecer, crearCuenta con generador
└── tests/
    ├── contrasenaTemporal.test.js                 ← nuevo
    ├── auth.login.test.js                         ← mensaje del 423
    ├── auditoria.test.js                          ← contrasenaTemporal filtrada
    └── usuarios.test.js                           ← HU-62, HU-63 y POST /usuarios ajustado
frontend/
├── src/components/ui/dropdown-menu.jsx            ← nuevo, con la CLI de shadcn
└── src/
    ├── api/cliente.js (+ cliente.test.js)         ← 403 CAMBIO_CONTRASENA_REQUERIDO cierra la sesión
    ├── api/usuarios.js                            ← desbloquearCuenta, restablecerContrasena; crearCuenta sin contraseña
    ├── componentes/ProveedorSesion.jsx            ← aviso de contraseña restablecida
    ├── paginas/login/PaginaLogin.jsx (+ test)     ← modal del 423 y CampoContrasena
    └── paginas/usuarios/
        ├── PaginaUsuarios.jsx (+ test)            ← Badge, menú, Desbloquear, Restablecer
        ├── PaginaRegistrarPersonal.jsx (+ test)   ← sin campos de contraseña; diálogo
        ├── DialogoContrasenaTemporal.jsx          ← nuevo
        └── DialogoContrasenaTemporal.test.jsx     ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance de HU-62 y HU-63; notas en HU-01 y HU-04
CLAUDE.md                                          ← nota de contexto
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`:
   - `POST /usuarios/{id}/desbloquear` y `POST /usuarios/{id}/restablecer-contrasena`, con su `x-permiso` y sus respuestas 200, 401, 403, 404, 409 y 422 (la 422 solo en el restablecimiento);
   - `bloqueada` en `UsuarioDetalle`;
   - `UsuarioEntrada` sin `contrasenaTemporal`; esquema `UsuarioCreado` en la 201 de `POST /usuarios`;
   - esquema `RestablecimientoContrasena`;
   - ejemplo del 423 de `POST /auth/login` con el mensaje nuevo;
   - error 409 `CUENTA_NO_BLOQUEADA`.
   Comprobación: `/api/docs` carga sin errores y muestra los dos endpoints con su permiso.
2. **Permisos y bitácora.** **Pedir confirmación** antes de editar `05_permisos_mysql.sql` y antes de correrlo. Agregar los dos permisos, asignados solo a `ADMINISTRADOR`, y correr el 05 dos veces en la base de prueba. Agregar `DESBLOQUEAR` y `RESTABLECER_CONTRASENA` a `ACCIONES` y `contrasenaTemporal` a `CLAVES_SENSIBLES`, con un caso en `auditoria.test.js` que comprueba que se filtra. Comprobación: `npm test` del backend pasa.
3. **Mensaje del bloqueo.** Cambiar el mensaje del 423 en `auth.service.js`. En `auth.login.test.js`, el 423 trae el mensaje nuevo con el número de `MINUTOS_BLOQUEO`.
4. **Login en el frontend.** Modal del 423 y `CampoContrasena` en `PaginaLogin.jsx`. En `PaginaLogin.test.jsx`: un 423 abre el diálogo con el `mensaje`; "Entendido" lo cierra y la contraseña queda vacía; un 401 sigue mostrando el Alert; el botón para ver la contraseña existe. Comprobación: `npm test` del frontend pasa.
5. **`bloqueada` y desbloquear en el backend.** `bloqueada` en las consultas de `UsuarioDetalle` y `POST /usuarios/{id}/desbloquear`. Pruebas en `usuarios.test.js`, con cuentas de prefijo `vitest-hu62-` bloqueadas por SQL y borradas en `afterAll`:
   - `GET /usuarios` trae `bloqueada` y no trae `bloqueadoHasta` ni `intentosFallidos`;
   - desbloquear responde 200 con `bloqueada: false`; en la base quedan `intentos_fallidos = 0` y `bloqueado_hasta = NULL`; hay una fila `DESBLOQUEAR`;
   - después, un login con contraseña **incorrecta** responde 401 y no 423 (sin crear un `LOGIN_OK`);
   - una cuenta no bloqueada, o con `bloqueado_hasta` ya pasado, responde 409 `CUENTA_NO_BLOQUEADA`; una desactivada, 409 `CUENTA_DESACTIVADA`;
   - una cuenta de otra DDRISS responde 404; sin el permiso, 403 (como las pruebas de 403 del SPEC 08).
6. **Generador.** `contrasenaTemporal.service.js`. Pruebas en `tests/contrasenaTemporal.test.js`, sin base de datos: largo `LARGO` (12) y nunca menor que el mínimo de la política; solo caracteres del alfabeto; `evaluarContrasena` no da motivos con los datos personales que recibió; 100 llamadas dan 100 valores distintos.
7. **`POST /usuarios` con el generador.** Quitar `contrasenaTemporal` de la entrada, generar la contraseña y responder `UsuarioCreado`. En `usuarios.test.js`, las pruebas de los SPEC 07 y 08 que enviaban la contraseña se **ajustan** (ninguna se quita) y se agregan:
   - la 201 trae `contrasenaTemporal`;
   - `bcrypt.compare` de esa contraseña contra el `hash_contrasena` guardado da `true` (sin iniciar sesión);
   - `debe_cambiar_contrasena` es `TRUE`;
   - la fila `CREAR` de la bitácora no contiene la contraseña;
   - enviar `contrasenaTemporal` responde 400 `ENTRADA_INVALIDA`.
   Comprobación: `npm test` del backend pasa completo.
8. **Restablecer en el backend.** `POST /usuarios/{id}/restablecer-contrasena`. Pruebas en `usuarios.test.js`, prefijo `vitest-hu63-`:
   - responde 200 con `contrasenaTemporal` y `usuario`; el hash cambió; `bcrypt.compare` con la temporal da `true` y con la anterior, `false`;
   - quedan `debe_cambiar_contrasena = TRUE`, `intentos_fallidos = 0` y `bloqueado_hasta = NULL`, también si la cuenta estaba bloqueada;
   - hay una fila `RESTABLECER_CONTRASENA` sin la contraseña, también cuando la cuenta ya tenía `debe_cambiar_contrasena = TRUE` y no estaba bloqueada;
   - la cuenta propia responde 422 `CUENTA_PROPIA`; una desactivada, 409; otra DDRISS, 404; sin el permiso, 403.
   Comprobación: `npm test` del backend pasa completo.
9. **Cierre de sesión por el 403.** En `cliente.js`, el 403 `CAMBIO_CONTRASENA_REQUERIDO` con el mismo token llama al manejador de `alPerderSesion`; `ProveedorSesion` usa el aviso de contraseña restablecida para ese `codigo`. En `cliente.test.js`: ese 403 llama al manejador; un 403 `SIN_PERMISO` no lo llama; sin sesión guardada no lo llama. Comprobación: `npm test` del frontend pasa.
10. **Menú de acciones.** Agregar `dropdown-menu` con `npx shadcn@latest add dropdown-menu` (comprobar que no agrega dependencias fuera de la lista de `AGENTS.md`). Pasar Desactivar y Restaurar al menú de `PaginaUsuarios.jsx` sin cambiar su comportamiento; ajustar `PaginaUsuarios.test.jsx` para abrirlos desde "Más acciones". Comprobación: `npm test` del frontend pasa.
11. **Desbloquear en el frontend.** `desbloquearCuenta` en `api/usuarios.js`, el Badge "Bloqueada" y la opción del menú. En `PaginaUsuarios.test.jsx`: la insignia y la opción aparecen solo en filas bloqueadas y con el permiso; al elegirla se llama a `desbloquearCuenta`, la fila se actualiza y aparece el Alert de éxito.
12. **`DialogoContrasenaTemporal` y "Registrar personal".** El componente y su prueba (`DialogoContrasenaTemporal.test.jsx`): muestra usuario y contraseña; "Copiar" llama al portapapeles (simulado) y cambia a "Copiada"; si el portapapeles falla, "No se pudo copiar"; "Ya la anoté" llama a `alCerrar`. En "Registrar personal", quitar los campos y abrir el diálogo. En `PaginaRegistrarPersonal.test.jsx`, las pruebas que llenaban la contraseña se **ajustan**: ya no hay campos de contraseña; `crearCuenta` se llama sin `contrasenaTemporal`; con éxito se abre el diálogo con la contraseña de la respuesta; al cerrarlo sigue el flujo de éxito; el reintento de solo la cuenta sigue funcionando.
13. **Restablecer en el frontend.** `restablecerContrasena` en `api/usuarios.js` y la opción del menú. En `PaginaUsuarios.test.jsx`: la opción no aparece en la fila propia, en las desactivadas ni sin el permiso; "Cancelar" no llama a la API; confirmar llama a `restablecerContrasena`, actualiza la fila y abre el diálogo con la contraseña. Comprobación: `npm test` del frontend pasa completo.
14. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright:
    - bloquear una cuenta de prueba con 5 intentos y ver el modal con "15 minutos";
    - verla como "Bloqueada" en `/usuarios`, desbloquearla desde el menú y entrar;
    - con esa sesión abierta en otra pestaña, restablecer su contraseña y comprobar que la siguiente petición la lleva al login con el aviso;
    - copiar la temporal, entrar con ella y comprobar que obliga a cambiarla (SPEC 09);
    - registrar a una persona con cuenta y ver el diálogo con la contraseña generada;
    - revisar en `bitacora` las filas `DESBLOQUEAR`, `RESTABLECER_CONTRASENA` y `CREAR`, sin contraseñas.
    Actualizar el avance de HU-62 y HU-63, marcar sus criterios y agregar notas en HU-01 y HU-04. Nota en "Notas de contexto" de `CLAUDE.md`: la contraseña temporal la genera el backend y se devuelve una sola vez; el restablecimiento se registra aunque `diferencias` dé `null`; un 403 `CAMBIO_CONTRASENA_REQUERIDO` cierra la sesión en el frontend.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los dos endpoints nuevos con su `x-permiso`, `bloqueada`, `UsuarioCreado`, `RestablecimientoContrasena`, `UsuarioEntrada` sin `contrasenaTemporal`, el 423 nuevo y `CUENTA_NO_BLOQUEADA`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba, y no deja cuentas ni empleados de prueba en la base.
- [ ] `USUARIO_DESBLOQUEAR` y `USUARIO_RESTABLECER_CONTRASENA` existen y solo los tiene `ADMINISTRADOR`; correr el 05 dos veces no falla ni duplica filas.
- [ ] El 5.º intento fallido responde 423 con "Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en 15 minutos.", donde 15 sale de `MINUTOS_BLOQUEO`.
- [ ] Con un 423, el login abre el modal "Usuario bloqueado" con ese mensaje y el botón "Entendido", sin datos del administrador; los demás errores siguen como Alert.
- [ ] El campo de contraseña del login permite ver lo escrito con `CampoContrasena`.
- [ ] `GET /usuarios` devuelve `bloqueada` y no devuelve la fecha del bloqueo ni los intentos.
- [ ] En `/usuarios`, las cuentas bloqueadas muestran el Badge "Bloqueada".
- [ ] Desbloquear una cuenta bloqueada de mi DDRISS la deja con `intentos_fallidos = 0` y `bloqueado_hasta = NULL`, y la persona puede iniciar sesión enseguida.
- [ ] Desbloquear una cuenta no bloqueada responde 409 `CUENTA_NO_BLOQUEADA`, y una desactivada 409 `CUENTA_DESACTIVADA`.
- [ ] La contraseña temporal generada tiene 12 caracteres del alfabeto sin `0 O o 1 l I` y cumple la política del SPEC 09.
- [ ] `POST /usuarios` con `contrasenaTemporal` en el cuerpo responde 400; sin ella, la 201 trae la contraseña generada y la cuenta queda con `debe_cambiar_contrasena = TRUE`.
- [ ] "Registrar personal" no tiene campos de contraseña y, al crear la cuenta, muestra `DialogoContrasenaTemporal` con la contraseña.
- [ ] Restablecer la contraseña de una cuenta activa de mi DDRISS hace que la anterior deje de servir, la deja con `debe_cambiar_contrasena = TRUE` y sin bloqueo, y muestra la temporal en `DialogoContrasenaTemporal`.
- [ ] Restablecer la contraseña propia responde 422 `CUENTA_PROPIA`, y la de una cuenta desactivada 409; en la tabla, la opción no aparece en esas filas.
- [ ] Una cuenta de otra DDRISS responde 404 en los dos endpoints nuevos, y sin el permiso responden 403.
- [ ] `DialogoContrasenaTemporal` copia la contraseña con "Copiar", dice "No se pudo copiar" si el portapapeles falla, y avisa que no se volverá a mostrar.
- [ ] La contraseña temporal no se guarda en `sessionStorage`, `localStorage` ni en la URL, y desaparece del estado al cerrar el diálogo.
- [ ] En `/usuarios`, Editar queda a la vista y Desactivar/Restaurar, Desbloquear y Restablecer contraseña están en el menú "Más acciones", cada una solo con su permiso.
- [ ] Una sesión abierta cuya contraseña se restableció vuelve al login con "Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador." en su siguiente petición.
- [ ] Cada desbloqueo deja una fila `USUARIOS` / `DESBLOQUEAR`, y cada restablecimiento una fila `USUARIOS` / `RESTABLECER_CONTRASENA`, aunque no cambie ningún otro dato.
- [ ] Ninguna fila de la bitácora contiene una contraseña temporal ni un hash.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-62 y HU-63 tienen su avance y sus criterios marcados, y HU-01 y HU-04 una nota sobre el ajuste.

## Decisiones

- **Sí:** un solo spec para HU-62 y HU-63, con los ajustes a HU-01 y HU-04. Comparten el generador, el diálogo y la tabla; separarlos obligaría a tocar los mismos archivos dos veces.
- **Sí:** el archivo `10-hu-62-63-seguridad-de-cuentas.md` y la rama `spec-10-hu-62-63-seguridad-de-cuentas`, con el patrón de los specs anteriores.
- **Sí:** el bloqueo de 15 minutos se mantiene; desbloquear solo evita esperar. Decidido por el equipo tras la asesoría.
- **Sí:** el mensaje del modal lo arma el backend con `MINUTOS_BLOQUEO`. El frontend no tiene el número escrito a mano.
- **No:** mostrar en el modal los datos del administrador. Decidido por el equipo.
- **Sí:** "Desbloquear" y "Restablecer contraseña" son dos acciones con dos permisos. Desbloquear no toca la contraseña y puede delegarse aparte.
- **Sí:** Desbloquear sin confirmación, como Restaurar. No hace daño. Restablecer sí la pide, porque la contraseña anterior deja de servir.
- **Sí:** en la tabla, la opción "Desbloquear" solo aparece en cuentas activas y bloqueadas; el Badge "Bloqueada" sí aparece también en las desactivadas. En una desactivada el backend responde 409 y "Restaurar" ya quita el bloqueo. Decidido durante la implementación.
- **Sí:** se permite desbloquear la cuenta propia. Alguien pudo bloquearla mientras el administrador tenía una sesión abierta.
- **No:** restablecer la contraseña propia. Para eso está "Cambiar contraseña" (SPEC 09), que pide la actual.
- **Sí:** el generador va en su propio archivo, `auth/contrasenaTemporal.service.js`, y usa `evaluarContrasena`. Mantiene la política de HU-03 sin cambios y se prueba por separado.
- **Sí:** 12 caracteres de un alfabeto de 56 sin caracteres que se confunden, con `crypto.randomInt`. Unos 70 bits de entropía. El largo es la constante `LARGO` de `contrasenaTemporal.service.js` y una prueba impide que baje del mínimo de la política.
- **No:** símbolos en el alfabeto. Complican el dictado y no hacen falta con 12 caracteres al azar.
- **No:** 16 caracteres, como decía la propuesta. El equipo lo cambió a 12 durante la implementación: la contraseña se dicta o se copia a mano, 16 es largo y 12 es el mínimo que acepta la política. Decidido durante la implementación.
- **Sí:** la 201 de `POST /usuarios` es `UsuarioCreado` (`Usuario` + `contrasenaTemporal`). No cambia la forma actual de la respuesta.
- **No:** `{ usuario, contrasenaTemporal }` en la 201. Sería igual al restablecimiento, pero cambia la respuesta que ya consumen el frontend y las pruebas.
- **Sí:** el restablecimiento responde `{ usuario, contrasenaTemporal }`. La página necesita el `UsuarioDetalle` para reemplazar la fila.
- **Sí:** enviar `contrasenaTemporal` a `POST /usuarios` responde 400. Un cliente viejo falla en lugar de creer que eligió la contraseña.
- **Sí:** el restablecimiento se registra en la bitácora aunque `diferencias` dé `null`. La contraseña cambió aunque no cambie ningún otro dato; es una excepción escrita a la regla del SPEC 05.
- **Sí:** `contrasenaTemporal` en `CLAVES_SENSIBLES`, además de no pasarla a la bitácora. Dos protecciones contra el mismo error.
- **Sí:** las acciones van en un `DropdownMenu` de shadcn, con Editar a la vista. La fila llegaría a cuatro botones. `dropdown-menu` lo instala la CLI de shadcn y usa `radix-ui`, que ya está.
- **No:** todos los botones en línea, ni todas las acciones dentro del menú. Editar es la acción más usada.
- **Sí:** ante un 403 `CAMBIO_CONTRASENA_REQUERIDO`, el frontend cierra la sesión localmente y el login muestra un aviso propio. Con la sesión abierta no puede cambiar la contraseña, porque no conoce la temporal.
- **No:** llevar esa sesión a `/cuenta/contrasena`. Pediría la contraseña actual, que la persona no tiene.
- **No:** llamar a `POST /auth/logout` en ese cierre. Mismo criterio que el 401 y que el cierre tras cambiar la contraseña (SPEC 09).
- **Sí:** las pruebas comprueban la contraseña generada con `bcrypt.compare` contra el hash, sin iniciar sesión. Un `LOGIN_OK` dejaría el `usuario_id` en la bitácora y la cuenta no se podría borrar.
- **Sí:** los permisos, las acciones y `CLAVES_SENSIBLES` quedaron autorizados por el equipo al escribir este spec; al implementar igual se confirma antes de editar `backend/db/` y de correr el 05.
- **Sí:** el generador intenta como máximo 20 veces y, si ninguna contraseña cumple la política, lanza un error (500). Evita un ciclo infinito si un error futuro hiciera fallar siempre la política. Decidido durante la implementación.
- **Sí:** `MINUTOS_BLOQUEO` se exporta desde `auth.service.js` para que la prueba arme el mensaje del 423 con la misma constante. Decidido durante la implementación.
- **Sí:** `crearCuenta` y `restablecerContrasena` leen los nombres del empleado antes de abrir la transacción, para generar y cifrar la contraseña sin retener el bloqueo de la fila mientras trabaja bcrypt; la transacción vuelve a revisar todo. Al restablecer, esa lectura previa ya responde 404 a una cuenta inexistente o de otra DDRISS, así que no se gasta bcrypt ni se distinguen por el tiempo. Decidido durante la implementación.
- **Sí:** el menú "Más acciones" es `DropdownMenu modal={false}`, y la fila ocupada deshabilita su menú y muestra el texto del proceso ("Restaurando…", "Desbloqueando…"). Así el `AlertDialog` que abre una opción no hereda el bloqueo del menú; se comprobó en el navegador que la página no queda con `pointer-events: none`. Decidido durante la implementación.
- **Sí:** en el login, al cerrar el modal "Usuario bloqueado" el cursor vuelve al campo de contraseña, como tras un 401. Decidido durante la implementación.
- **Sí:** `DialogoContrasenaTemporal` no se cierra con Escape, solo con "Ya la anoté", para no perder la contraseña sin querer. Decidido durante la implementación.
- **Sí:** al cerrar el diálogo del restablecimiento también se ve el Alert de éxito "Se restableció la contraseña de {nombreUsuario}.", como en las demás acciones de la tabla. Decidido durante la implementación.
- **Sí:** la verificación manual usó la cuenta `prueba-hu62` ("Prueba HU-62 Seguridad", rol Revisor), que inició sesión y por eso queda en la base de prueba, como `prueba.hu03` del SPEC 09. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La contraseña temporal termina en la bitácora o en un log | No se pasa a la bitácora, `contrasenaTemporal` está en `CLAVES_SENSIBLES` y las pruebas revisan las filas `CREAR` y `RESTABLECER_CONTRASENA`. |
| El administrador cierra el diálogo sin anotar la contraseña | Puede volver a restablecerla; el texto del diálogo lo advierte. |
| `navigator.clipboard` no está disponible (sin HTTPS fuera de `localhost`) | La contraseña se ve en pantalla y se puede seleccionar; el botón dice "No se pudo copiar". |
| Cambiar `POST /usuarios` rompe pruebas de los SPEC 07 y 08 | Se ajustan para no enviar la contraseña y leerla de la respuesta; no se quita ningún caso. |
| Las pruebas necesitan entrar con la cuenta restablecida | Se usa `bcrypt.compare`; el login real se comprueba a mano con Playwright. |
| El `DropdownMenu` de Radix no abre con `click` en jsdom | Las pruebas lo abren con los eventos de puntero o de teclado que espera Radix; si hace falta, se agrega a `src/preparar-pruebas.js` lo que falte, como con `ResizeObserver`. |
| Un `AlertDialog` abierto desde el menú deja el foco o `pointer-events` bloqueados | Se abre desde `onSelect` después de cerrar el menú; la prueba manual con Playwright lo revisa. |
| La CLI de shadcn agrega una dependencia fuera de la lista | El paso 10 revisa `package.json` antes de seguir. |
| Un 403 `CAMBIO_CONTRASENA_REQUERIDO` llega en la pantalla obligatoria de cambio y cierra la sesión | Esa pantalla solo llama a `POST /auth/contrasena` y `POST /auth/logout`, que no lo responden (SPEC 09). |

## Lo que **no** entra en este spec

- Recuperar la contraseña por correo o con preguntas de seguridad.
- Formulario público para pedir el desbloqueo.
- Cambiar la duración del bloqueo o el número de intentos.
- Revocar tokens desde el backend.
- Formato de los campos del empleado y el CUI (spec B).
- Búsqueda, filtros y paginación del listado (HU-07).

Cada uno, si se hace, va en su propio spec.
