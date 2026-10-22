# Propuesta para el spec A · Seguridad de cuentas

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo acordado por el equipo después de la asesoría del 2026-10-21. No es el spec: el spec se escribe en `specs/NN-slug.md` con el formato de los anteriores (por ejemplo, `specs/08-hu-05-editar-desactivar-restaurar-usuarios.md`) y queda en Borrador hasta que el equipo lo apruebe.
> **Historias:** HU-62 (desbloquear cuenta) y HU-63 (restablecer contraseña), más un ajuste a HU-01 (aviso de bloqueo en el login) y otro a HU-04 (contraseña temporal generada por el sistema).
> **Depende de:** el spec de HU-03, que se implementa antes y aporta la política de fortaleza, el cambio obligatorio de contraseña y `CampoContrasena`. También depende de los SPEC 01, 03, 04, 05, 07 y 08.
> **Rama sugerida:** `spec-NN-hu-62-63-seguridad-de-cuentas`, desde `main`.

## 1. Por qué existe

En la asesoría se pidieron tres cosas:

1. Que el usuario bloqueado sepa qué hacer.
2. Que el administrador pueda resolver una emergencia (una cuenta bloqueada o una contraseña olvidada) sin esperar.
3. Que la contraseña temporal no la invente el administrador.

El equipo decidió:

- **El bloqueo de 15 minutos se mantiene.** Al quedar bloqueado, el login muestra un **modal informativo** que dice que contacte al administrador de su DDRISS o espere los minutos del bloqueo. El modal no muestra datos del administrador.
- **"Desbloquear" (HU-62) y "Restablecer contraseña" (HU-63) son dos acciones separadas**, cada una con su historia y su permiso. Van en la tabla de `/usuarios`, junto a Editar, Desactivar y Restaurar (HU-05).
- **La contraseña temporal la genera el sistema**, tanto al restablecer como al crear una cuenta (`POST /usuarios`). Se muestra una sola vez y obliga a cambiarla al entrar, con lo que resuelve HU-03.

Las historias, con sus criterios de aceptación, están en `docs/SPECS/HISTORIAS_DE_USUARIO.md`.

Como el spec cubre dos historias nuevas y ajusta dos ya terminadas, su encabezado debe decir `**Historia:** HU-62, HU-63 (más ajustes a HU-01 y HU-04)` y explicarlo en "Por qué existe este spec". `CLAUDE.md` pide una historia por spec; aquí se juntan porque comparten el generador de contraseñas, el diálogo que la muestra y la misma tabla.

## 2. Lo que ya existe y hay que tener en cuenta

| Dónde | Qué hay hoy |
|---|---|
| `backend/src/modulos/auth/auth.service.js` | `MAXIMO_INTENTOS = 5`, `MINUTOS_BLOQUEO = 15`. El 5.º intento fallido ya responde 423 `CUENTA_BLOQUEADA` con el mensaje "Su cuenta está bloqueada por ${MINUTOS_BLOQUEO} minutos…". El bloqueo vence solo y el siguiente login limpia los intentos |
| `backend/src/modulos/usuarios/usuarios.service.js` | El listado **no lee** `bloqueado_hasta` (lo dice un comentario). `POST /usuarios` recibe `contrasenaTemporal` (8 caracteres mínimo, 72 bytes máximo), la cifra con bcrypt (costo 12) y guarda `debe_cambiar_contrasena = TRUE`. Restaurar ya limpia `intentos_fallidos` y `bloqueado_hasta` |
| `backend/src/modulos/auditoria/auditoria.service.js` | `CLAVES_SENSIBLES` no incluye `contrasenaTemporal`. Hoy no hace falta porque la bitácora de `POST /usuarios` guarda el objeto de la respuesta, que no trae la contraseña; con este spec la respuesta sí la trae |
| `ACCIONES` (en el mismo archivo) | No existen `DESBLOQUEAR` ni `RESTABLECER_CONTRASENA` |
| `frontend/src/paginas/login/PaginaLogin.jsx` | Muestra el 423 como Alert rojo con el `mensaje` del backend; su prueba espera el texto actual |
| `frontend/src/paginas/usuarios/PaginaUsuarios.jsx` | Tabla de HU-05 con Editar, Desactivar (con AlertDialog) y Restaurar, según permisos |
| `frontend/src/paginas/usuarios/PaginaRegistrarPersonal.jsx` | Campos "Contraseña temporal" y "Confirmar contraseña" (Input `password`). Si se crea el empleado y falla la cuenta, se reintenta solo la cuenta |
| Pruebas del backend | Las cuentas que crean las pruebas **no deben iniciar sesión con éxito**, porque `LOGIN_OK` escribe `usuario_id` en la bitácora y ya no se podrían borrar. Un `LOGIN_FALLIDO` sí se puede, porque solo guarda el id en `entidad_id` |

## 3. Bloques

Cada bloque se implementa y se verifica por separado, en este orden. Antes del bloque A1 va el contrato (sección 4) y, con autorización, los permisos (sección 5).

### A1. Aviso de bloqueo y ver la contraseña en el login

**Backend**
- El mensaje del 423 `CUENTA_BLOQUEADA` cambia a: `Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en ${MINUTOS_BLOQUEO} minutos.` Los minutos salen de la constante `MINUTOS_BLOQUEO`, que ya se usa para calcular `bloqueado_hasta`. Así el frontend no tiene el número escrito a mano.
- No cambia la lógica del bloqueo, ni el código HTTP, ni el formato del error.

**Frontend**
- Con un 423, en lugar del Alert rojo se abre un `AlertDialog` (ya instalado) con el título "Usuario bloqueado", el `mensaje` del backend como texto y un solo botón: "Entendido". Al cerrarlo, el formulario queda como estaba, con la contraseña vacía.
- Los demás errores del login siguen como Alert.
- El campo de contraseña pasa a usar `CampoContrasena` (creado en HU-03).

**Verificación**
- `auth.login.test.js`: el 423 trae el mensaje nuevo con el número de `MINUTOS_BLOQUEO`.
- `PaginaLogin.test.jsx`: un 423 abre el diálogo con el `mensaje`; "Entendido" lo cierra; un 401 sigue mostrando el Alert; el botón para ver la contraseña existe en el login.
- Prueba manual: 5 intentos fallidos con una cuenta de prueba muestran el modal.

### A2. HU-62: Desbloquear cuenta

**Listado.** `UsuarioDetalle` agrega `bloqueada: boolean`, calculado en SQL con `COALESCE(u.bloqueado_hasta > NOW(), FALSE)`. Ni la fecha ni `intentos_fallidos` se devuelven. Hay que actualizar el comentario de `usuarios.service.js` que dice que nunca se lee `bloqueado_hasta`.

**`POST /usuarios/{id}/desbloquear`** (`USUARIO_DESBLOQUEAR`), sin cuerpo:

| Caso | Respuesta |
|---|---|
| La cuenta no existe, está fuera del alcance o el id no es válido | 404 `NO_ENCONTRADO` |
| La cuenta está desactivada | 409 `CUENTA_DESACTIVADA` (para eso está "Restaurar", que ya quita el bloqueo) |
| La cuenta no está bloqueada (`bloqueado_hasta` es NULL o ya pasó) | 409 `CUENTA_NO_BLOQUEADA` |
| Cuenta bloqueada | Pone `intentos_fallidos = 0` y `bloqueado_hasta = NULL`; responde 200 con `UsuarioDetalle` |

- Bitácora, en la misma transacción: módulo `USUARIOS`, acción nueva `DESBLOQUEAR`, entidad `usuario`, con `{ bloqueada: true }` → `{ bloqueada: false }`.
- Se permite desbloquear la cuenta propia: alguien pudo bloquearla con intentos mientras el administrador tenía una sesión abierta.

**Frontend (`/usuarios`)**
- En la columna Estado, un Badge "Bloqueada" junto a "Activa" cuando `bloqueada` es `true`.
- Botón "Desbloquear", solo en las filas bloqueadas y con `USUARIO_DESBLOQUEAR`. Sin confirmación, como "Restaurar", porque no hace daño. Mientras tanto dice "Desbloqueando…". Al terminar, la fila se reemplaza con la respuesta y aparece el Alert de éxito "Se desbloqueó la cuenta {nombreUsuario}."; si falla, el Alert de error con el `mensaje`.

**Verificación** (`usuarios.test.js`, con cuentas de prefijo `vitest-hu62-` bloqueadas por SQL y borradas en `afterAll`)
- Desbloquear responde 200 con `bloqueada: false`; en la base quedan `intentos_fallidos = 0` y `bloqueado_hasta = NULL`; hay una fila `DESBLOQUEAR`.
- Después, un login con contraseña **incorrecta** responde 401 y no 423, lo que demuestra que el bloqueo se quitó sin crear un `LOGIN_OK`.
- Una cuenta no bloqueada responde 409 `CUENTA_NO_BLOQUEADA`, y una desactivada 409 `CUENTA_DESACTIVADA`.
- Una cuenta de otra DDRISS responde 404; sin el permiso, 403.
- `GET /usuarios` trae `bloqueada` y no trae `bloqueadoHasta`.
- `PaginaUsuarios.test.jsx`: la insignia y el botón aparecen solo en filas bloqueadas y con el permiso; al pulsarlo se llama a `desbloquearCuenta` y la fila se actualiza.

### A3. Generador de contraseñas temporales y su uso en `POST /usuarios` (ajuste a HU-04)

**Generador (backend)**
- La función `generarContrasenaTemporal()` va junto a la política de contraseñas que crea HU-03, en el módulo `auth`. El spec define el archivo exacto.
- Usa `crypto.randomInt` de Node, sin dependencias nuevas, y no `Math.random`.
- La contraseña tiene **16 caracteres** de un alfabeto sin caracteres que se confunden (sin `0 O o 1 l I`). Así es fácil dictarla o copiarla a mano.
- Debe pasar la política de HU-03 (zxcvbn ≥ 3, no contener el usuario ni el nombre). Si no la pasa, se genera otra. Con 16 caracteres al azar es casi imposible que falle, pero queda cubierto.

**`POST /usuarios`**
- `UsuarioEntrada` **ya no tiene** `contrasenaTemporal`. Si llega, responde 400 `ENTRADA_INVALIDA`, para detectar clientes viejos.
- La respuesta 201 agrega `contrasenaTemporal` (en claro, una sola vez) al objeto `Usuario`. El spec decide si se usa un esquema propio, por ejemplo `UsuarioCreado`.
- La bitácora sigue guardando el objeto `Usuario` **sin** la contraseña. Además, `contrasenaTemporal` se agrega a `CLAVES_SENSIBLES`, como segunda protección.
- `LARGO_MINIMO_CONTRASENA` y `BYTES_MAXIMOS_CONTRASENA` de `usuarios.service.js` se quitan si ya nadie los usa (la política de HU-03 los reemplaza).

**Frontend**
- `PaginaRegistrarPersonal.jsx` quita "Contraseña temporal" y "Confirmar contraseña".
- Después de crear la cuenta se abre `DialogoContrasenaTemporal`, un componente propio en `paginas/usuarios/` sobre `AlertDialog`. Muestra:
  - el nombre de usuario y la contraseña en letra monoespaciada;
  - un botón "Copiar" (`navigator.clipboard.writeText`), que cambia a "Copiada" por unos segundos;
  - el aviso "Esta contraseña no se volverá a mostrar. Entréguela a la persona de forma segura; deberá cambiarla al iniciar sesión.";
  - un solo botón para cerrar: "Ya la anoté".
- Al cerrarlo sigue el flujo de éxito actual. La contraseña no se guarda en el estado después de cerrar, ni en `sessionStorage` ni en la URL.
- El reintento cuando solo falla la cuenta sigue funcionando igual.

**Verificación**
- Prueba unitaria del generador: largo 16, solo caracteres del alfabeto, pasa la política y 100 llamadas dan 100 valores distintos.
- `usuarios.test.js`:
  - la respuesta 201 trae `contrasenaTemporal`;
  - `bcrypt.compare` de esa contraseña contra el `hash_contrasena` guardado da `true` (sin iniciar sesión);
  - `debe_cambiar_contrasena` es `TRUE`;
  - la fila `CREAR` de la bitácora no contiene la contraseña;
  - enviar `contrasenaTemporal` responde 400.
- `PaginaRegistrarPersonal.test.jsx`: ya no hay campos de contraseña; con éxito se abre el diálogo con la contraseña de la respuesta; "Copiar" llama al portapapeles (simulado); al cerrar desaparece. Las pruebas de este archivo que llenaban la contraseña se **ajustan**, no se desactivan.

### A4. HU-63: Restablecer contraseña

**`POST /usuarios/{id}/restablecer-contrasena`** (`USUARIO_RESTABLECER_CONTRASENA`), sin cuerpo. Los casos se revisan en este orden:

| Caso | Respuesta |
|---|---|
| La cuenta no existe o está fuera del alcance | 404 `NO_ENCONTRADO` |
| La cuenta está desactivada | 409 `CUENTA_DESACTIVADA` |
| Es la cuenta propia | 422 `CUENTA_PROPIA` (usa HU-03) |
| Cualquier otra | Genera la contraseña con el generador de A3 y guarda su hash con `debe_cambiar_contrasena = TRUE`, `intentos_fallidos = 0` y `bloqueado_hasta = NULL`. Responde 200 con `{ usuario: UsuarioDetalle, contrasenaTemporal }` |

- **Bitácora:** módulo `USUARIOS`, acción nueva `RESTABLECER_CONTRASENA`, entidad `usuario`, con `{ debeCambiarContrasena, bloqueada }` antes y después y **sin** la contraseña. Se registra **siempre**, aunque `diferencias` dé `null` (por ejemplo, si la cuenta ya debía cambiar la contraseña y no estaba bloqueada), porque la contraseña sí cambió. Es una excepción a la regla de "sin cambios, sin bitácora", y el spec debe dejarla escrita.
- **Sesión abierta de la cuenta:** no hay que hacer nada aparte. Con `debe_cambiar_contrasena = TRUE`, `revisarCuenta` (HU-03) le responde 403 `CAMBIO_CONTRASENA_REQUERIDO`, y para cambiarla necesita la contraseña temporal, que solo tiene el administrador.

**Frontend (`/usuarios`)**
- Botón "Restablecer contraseña" en las filas de cuentas activas, salvo la propia, con `USUARIO_RESTABLECER_CONTRASENA`.
- Pide confirmación con `AlertDialog`: "¿Restablecer la contraseña de {nombreUsuario}?" y el texto "La contraseña actual dejará de funcionar. El sistema generará una temporal que la persona deberá cambiar al iniciar sesión.", con los botones "Cancelar" y "Restablecer".
- Al terminar abre `DialogoContrasenaTemporal` (de A3) y reemplaza la fila con `usuario`. Si falla, Alert de error con el `mensaje`.

**Verificación** (`usuarios.test.js`, prefijo `vitest-hu63-`)
- Restablecer responde 200 con `contrasenaTemporal`. El hash cambió y `bcrypt.compare` con la temporal da `true`; con la anterior, `false`.
- Quedan `debe_cambiar_contrasena = TRUE`, `intentos_fallidos = 0` y `bloqueado_hasta = NULL`.
- Hay una fila `RESTABLECER_CONTRASENA` sin la contraseña, también cuando no cambió ningún otro dato.
- La cuenta propia responde 422 y una desactivada 409. Otra DDRISS responde 404; sin el permiso, 403.
- `PaginaUsuarios.test.jsx`:
  - el botón no aparece en la fila propia, en las desactivadas ni sin el permiso;
  - "Cancelar" no llama a la API;
  - confirmar llama a `restablecerContrasena` y abre el diálogo con la contraseña.

## 4. Contrato (`backend/openapi.yaml`, antes de programar)

- `POST /usuarios/{id}/desbloquear` y `POST /usuarios/{id}/restablecer-contrasena`, cada uno con su `x-permiso` y sus respuestas 200, 401, 403, 404, 409 y 422.
- `UsuarioDetalle`: `bloqueada`.
- `UsuarioEntrada` sin `contrasenaTemporal`; la respuesta 201 de `POST /usuarios` con `contrasenaTemporal`.
- Esquema de la respuesta del restablecimiento: `{ usuario, contrasenaTemporal }`.
- Ejemplo del 423 de `POST /auth/login` con el mensaje nuevo.
- Error nuevo: 409 `CUENTA_NO_BLOQUEADA`.

**Comprobación:** `/api/docs` carga sin errores y muestra los dos endpoints con su permiso.

## 5. Zonas protegidas (piden autorización expresa en el spec)

| Qué | Por qué |
|---|---|
| `backend/db/05_permisos_mysql.sql` | Dos permisos nuevos del módulo `USUARIOS`, asignados **solo a `ADMINISTRADOR`**: `USUARIO_DESBLOQUEAR` y `USUARIO_RESTABLECER_CONTRASENA`. El script es idempotente; se corre dos veces en la base de prueba |
| `ACCIONES` en `auditoria.service.js` | `DESBLOQUEAR` y `RESTABLECER_CONTRASENA` (regla de la nota del 2026-10-20 de `CLAUDE.md`) |
| `CLAVES_SENSIBLES` | Agregar `contrasenaTemporal`. Cambia lo que se guarda en la bitácora, así que conviene confirmarlo |

No cambia el modelo de datos: usa `intentos_fallidos`, `bloqueado_hasta` y `debe_cambiar_contrasena`, que ya existen. Tampoco agrega dependencias (`crypto` viene con Node; zxcvbn ya llega con HU-03).

## 6. Archivos que se tocan (aproximado)

```
backend/
├── openapi.yaml
├── db/05_permisos_mysql.sql                  ← con autorización
├── src/modulos/auth/auth.service.js          ← mensaje del 423
├── src/modulos/auth/<política de HU-03>      ← generarContrasenaTemporal
├── src/modulos/auditoria/auditoria.service.js ← ACCIONES y CLAVES_SENSIBLES
├── src/modulos/usuarios/usuarios.{routes,controller,service}.js
└── tests/ auth.login.test.js, usuarios.test.js, auditoria.test.js, prueba del generador
frontend/src/
├── api/usuarios.js                           ← desbloquearCuenta, restablecerContrasena
├── paginas/login/PaginaLogin.jsx (+ test)
└── paginas/usuarios/
    ├── PaginaUsuarios.jsx (+ test)
    ├── PaginaRegistrarPersonal.jsx (+ test)
    └── DialogoContrasenaTemporal.jsx (+ test)
docs/SPECS/HISTORIAS_DE_USUARIO.md            ← avance de HU-62 y HU-63; nota en HU-01 y HU-04
CLAUDE.md                                     ← nota de contexto
```

## 7. Verificación final (sección 8 de `AGENTS.md`)

1. `npm test` pasa en `backend/` y `frontend/` sin desactivar pruebas, y no deja cuentas ni empleados de prueba en la base.
2. Con Playwright, contra Aiven:
   - bloquear una cuenta de prueba con 5 intentos y ver el modal con "15 minutos";
   - desbloquearla desde `/usuarios` y entrar;
   - restablecer su contraseña, copiar la temporal, entrar con ella y comprobar que obliga a cambiarla (HU-03);
   - registrar a una persona con cuenta y ver el diálogo con la contraseña generada;
   - revisar en `bitacora` las filas `DESBLOQUEAR`, `RESTABLECER_CONTRASENA` y `CREAR`, sin contraseñas.
3. Actualizar el avance de HU-62, HU-63, HU-01 y HU-04 en `HISTORIAS_DE_USUARIO.md` y agregar una línea en "Notas de contexto" de `CLAUDE.md`. Por ejemplo: la contraseña temporal la genera el backend y se devuelve una sola vez; el restablecimiento se registra aunque `diferencias` dé `null`.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| La contraseña temporal termina en la bitácora o en un log | La bitácora guarda el objeto sin ella, `contrasenaTemporal` está en `CLAVES_SENSIBLES` y una prueba revisa la fila |
| El administrador cierra el diálogo sin anotar la contraseña | Puede volver a restablecerla; el texto del diálogo lo advierte |
| `navigator.clipboard` no está disponible (por ejemplo, sin HTTPS fuera de `localhost`) | La contraseña también se ve en pantalla y se puede seleccionar; si falla la copia, el botón muestra "No se pudo copiar" |
| Cambiar `POST /usuarios` rompe pruebas de los SPEC 07 y 08 | Se ajustan para leer la contraseña de la respuesta; no se quita ningún caso |
| Las pruebas necesitan entrar con la cuenta restablecida | Se usa `bcrypt.compare` contra el hash; el login real se comprueba a mano con Playwright |
| La fila tiene demasiados botones | Si no cabe, el spec puede agrupar "Desbloquear" y "Restablecer contraseña" en un `DropdownMenu` de shadcn (`npx shadcn@latest add dropdown-menu`; usa `radix-ui`, que ya está instalado) |

## 9. Fuera de alcance

- Que el usuario recupere su contraseña por sí mismo (correo con enlace, preguntas de seguridad).
- Un formulario público para pedir el desbloqueo.
- Cambiar la duración del bloqueo o el número de intentos.
- Revocar tokens.
- Validación de formato de los campos del empleado y el CUI (spec B).
