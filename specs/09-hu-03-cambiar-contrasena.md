# SPEC 09 — Cambiar mi contraseña

> **Estado:** Aprobado
> **Historia:** HU-03 (backend y frontend, con el cambio obligatorio de la contraseña temporal)
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 05, SPEC 06, SPEC 08
> **Fecha:** 2026-10-21
> **Objetivo:** Que cualquier usuario cambie su contraseña indicando la actual, con una política de fortaleza medida con zxcvbn, y que una cuenta con `debe_cambiar_contrasena = TRUE` no pueda usar el resto del sistema hasta cambiarla.

## Avance (2026-10-21)

Rama `spec-09-hu-03-cambiar-contrasena`. Hechos los pasos **1, 2 y 3**; se retoma en el **paso 4** (acción `CAMBIO_CONTRASENA` y `POST /auth/contrasena`). Antes de seguir, verificar:

1. **Contrato:** `/api/docs` carga y muestra `POST /auth/contrasena`, `CambioContrasenaEntrada`, `debeCambiarContrasena` en `UsuarioSesion` y la respuesta `CambioContrasenaRequerido`.
2. **Dependencias:** `npm ls @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-es-es` en `backend/` y `frontend/` muestra 4.2.0, 4.1.3 y 4.1.2, y `AGENTS.md` las lista. `npm test` pasó en los dos (frontend 102; backend 146, con 2 fallas por `ETIMEDOUT` de Aiven que pasaron al repetirlas).
3. **Política:** `npx vitest run tests/politicaContrasena.test.js` en `backend/` pasa 6 de 6. `evaluarContrasena` mide con zxcvbn solo los primeros 72 caracteres si la contraseña pasa de 72 bytes (igual se rechaza por largo); las advertencias de zxcvbn en español vienen sin punto final.

Esta sección se borra al pasar el spec a Implementado.

## Por qué existe este spec

Hoy las cuentas se crean con `debe_cambiar_contrasena = TRUE`, pero nada lo revisa: la persona entra con la contraseña temporal que le dio el administrador y la puede usar para siempre. La asesoría del 2026-10-21 amplió HU-03 para cerrar eso desde el backend, cambiar la regla de 8 caracteres por una política con zxcvbn y agregar el campo para ver la contraseña.

El spec A (`docs/SPECS/PROPUESTA_SPEC_A_SEGURIDAD_DE_CUENTAS.md`) depende de este: reutiliza la política, el cambio obligatorio y `CampoContrasena`.

zxcvbn no está en la lista de dependencias de `AGENTS.md`. **El equipo autorizó** `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common` y `@zxcvbn-ts/language-es-es` en el backend y en el frontend al escribir este spec; la lista de la sección 3 de `AGENTS.md` se actualiza en el mismo spec.

## Alcance

**Entra:**

- `POST /auth/contrasena`: cambio de la contraseña propia, sin `x-permiso`.
- Política de la contraseña nueva en el backend (obligatoria) y en el frontend (medidor), con las mismas reglas.
- `debeCambiarContrasena` en la respuesta del login (`UsuarioSesion`).
- 403 `CAMBIO_CONTRASENA_REQUERIDO` en todos los endpoints protegidos mientras la cuenta deba cambiar la contraseña, salvo `POST /auth/contrasena` y `POST /auth/logout`.
- Acción nueva `CAMBIO_CONTRASENA` en `ACCIONES` de la bitácora.
- Página `/cuenta/contrasena`: dentro del Layout si se abre desde el encabezado, y sola, sin menú, si el cambio es obligatorio.
- Botón "Cambiar contraseña" en el encabezado.
- Componentes propios `CampoContrasena` (ver mientras se mantiene presionado) y `MedidorContrasena`.
- Las tres dependencias de zxcvbn en `backend/package.json` y `frontend/package.json`, y en la lista de `AGENTS.md`.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual en el navegador con Playwright.
- Avance de HU-03 en `HISTORIAS_DE_USUARIO.md` y nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- `GET /auth/yo`: sigue en el contrato sin programar; cuando exista, también queda exento del 403.
- Usar `CampoContrasena` en el login y en "Registrar personal" (spec A).
- Contraseña temporal generada por el sistema, restablecer la contraseña de otra cuenta y desbloquear cuentas (spec A, HU-62 y HU-63).
- Cerrar las sesiones abiertas en otros equipos al cambiar la contraseña: necesita una columna nueva en `usuario`.
- Historial de contraseñas (no repetir las anteriores, solo la actual) y vencimiento periódico.
- Contar los intentos con la contraseña actual incorrecta para el bloqueo.
- Cambios a `01_modelo_relacional_mysql.sql` y a `05_permisos_mysql.sql`.

## Modelo de datos

Este spec **no cambia el modelo**: usa `usuario.hash_contrasena` y `usuario.debe_cambiar_contrasena` tal como están en el script 01. No agrega permisos.

### Política de la contraseña nueva

La misma regla vive en `backend/src/modulos/auth/politicaContrasena.service.js` y en `frontend/src/componentes/contrasena/politicaContrasena.js`. Recibe la contraseña y `{ nombreUsuario, nombres, apellidos }`, y devuelve el puntaje de zxcvbn y la lista de motivos por los que no se acepta (vacía si se acepta).

| Regla | Motivo (texto fijo) |
|---|---|
| Al menos 12 caracteres | "Debe tener al menos 12 caracteres." |
| Como máximo 72 bytes en UTF-8 (límite de bcrypt) | "Es demasiado larga." |
| No contiene una palabra de 3 letras o más del nombre de usuario, los nombres o los apellidos | "No debe contener su nombre ni su usuario." |
| Puntaje de zxcvbn de 3 o más (de 0 a 4) | La advertencia de zxcvbn traducida; si no trae, "Es fácil de adivinar; use una frase más larga." |

- La comparación con los nombres es sin mayúsculas ni tildes: "Pérez" choca con "perez2026". El nombre de usuario se parte en palabras por cualquier carácter que no sea letra ni número.
- Las mismas palabras se pasan a zxcvbn como `userInputs`.
- zxcvbn se configura con los diccionarios de `language-common` y `language-es-es` y las traducciones de `language-es-es`.
- No se exigen mayúsculas, números ni símbolos.
- "Igual a la actual" no es parte de la política: el backend la revisa con bcrypt y el frontend la compara con el campo "Contraseña actual".

### `POST /auth/contrasena` (sin permiso)

Usa `autenticarSinExigirCambio` (ver abajo). Entrada (`CambioContrasenaEntrada`):

| Campo | Regla |
|---|---|
| `contrasenaActual` | Texto obligatorio |
| `contrasenaNueva` | Texto obligatorio; cumple la política |

Orden de revisión y respuestas:

| Caso | Respuesta |
|---|---|
| Falta un campo, no es texto o viene otro campo | 400 `ENTRADA_INVALIDA` |
| `contrasenaActual` no coincide con `hash_contrasena` | 422 `CONTRASENA_ACTUAL_INCORRECTA`: "La contraseña actual no es correcta." |
| `contrasenaNueva` es igual a la actual (bcrypt) | 422 `CONTRASENA_REPETIDA`: "La contraseña nueva debe ser distinta de la actual." |
| `contrasenaNueva` no cumple la política | 422 `CONTRASENA_DEBIL`, con el primer motivo como `mensaje` |
| Todo bien | 204 |

- La contraseña actual incorrecta **no** suma a `intentos_fallidos` ni escribe en la bitácora.
- En `enTransaccion`: se guarda el nuevo hash (bcrypt, costo 12) con `debe_cambiar_contrasena = FALSE` y se registra la bitácora.
- Bitácora: `USUARIOS` / `CAMBIO_CONTRASENA`, entidad `usuario`, `usuarioId` y `entidadId` = la cuenta, `valoresAnteriores` = `{ debeCambiarContrasena: <antes> }`, `valoresNuevos` = `{ debeCambiarContrasena: false }`. Nunca las contraseñas ni el hash (`contrasenaActual` y `contrasenaNueva` ya están en `CLAVES_SENSIBLES`).
- El token sigue siendo válido hasta su `exp`; es el frontend el que cierra la sesión.

### Cambio obligatorio en `autenticar`

`backend/src/middlewares/autenticar.js`:

- `revisarCuenta` agrega `u.debe_cambiar_contrasena` a su consulta y lo deja en `req.usuario.debeCambiarContrasena`. No es un dato del token, así que no se compara.
- Nuevo `exigirContrasenaCambiada`: si `req.usuario.debeCambiarContrasena` es verdadero, responde 403 `CAMBIO_CONTRASENA_REQUERIDO`: "Debe cambiar su contraseña temporal antes de continuar.". No escribe en la bitácora.
- `autenticar` = `[verificarToken, revisarCuenta, exigirContrasenaCambiada]`, así que todas las rutas protegidas, actuales y futuras, quedan cubiertas sin tocarlas.
- `autenticarSinExigirCambio` = `[verificarToken, revisarCuenta]`, solo para `POST /auth/contrasena` y `POST /auth/logout`.
- Es un 403 y no un 401 para que el frontend no cierre la sesión.

### Login

`armarSesion` agrega `debeCambiarContrasena` a `usuario` en la respuesta. No va en el JWT. El login no cambia en lo demás.

### Errores nuevos

| HTTP | `codigo` | Caso |
|---|---|---|
| 403 | `CAMBIO_CONTRASENA_REQUERIDO` | La cuenta debe cambiar la contraseña y pide otro endpoint |
| 422 | `CONTRASENA_ACTUAL_INCORRECTA` | La contraseña actual no coincide |
| 422 | `CONTRASENA_REPETIDA` | La nueva es igual a la actual |
| 422 | `CONTRASENA_DEBIL` | La nueva no cumple la política |

### Frontend

**Ruta.** `/cuenta/contrasena`, sin permiso, declarada en `App.jsx` (no en `opcionesMenu.js`, porque no es una opción del menú ni una subruta de una).

- Con `sesion.usuario.debeCambiarContrasena` falso: se muestra dentro del Layout, con el título "Cambiar contraseña" y el botón "Cancelar", que vuelve a `/inicio`.
- Con `debeCambiarContrasena` verdadero: `RutaProtegida` lleva cualquier ruta a `/cuenta/contrasena`, y la página se muestra **fuera del Layout**: una tarjeta centrada, como el login, con el texto "Debe cambiar la contraseña temporal que le dieron antes de continuar." y el botón "Cerrar sesión" en lugar de "Cancelar".

**Encabezado.** Botón "Cambiar contraseña" (ícono `KeyRound`) junto a "Cerrar sesión", que lleva a `/cuenta/contrasena`.

**Formulario.** Tres `CampoContrasena`: "Contraseña actual", "Contraseña nueva" y "Confirmar contraseña nueva".

- Debajo de "Contraseña nueva", `MedidorContrasena`: cuatro barras que se llenan según el puntaje de zxcvbn, una etiqueta ("Muy débil", "Débil", "Aceptable", "Fuerte", "Muy fuerte") y la lista de motivos de la política. Mientras el campo está vacío no muestra nada.
- Si la nueva es igual a la actual, se agrega el motivo "Debe ser distinta de la actual."; si la confirmación no coincide, "Las contraseñas no coinciden." bajo la confirmación.
- "Cambiar contraseña" está deshabilitado mientras falte la actual, haya un motivo o la confirmación no coincida. Mientras se envía dice "Cambiando…".
- Si el backend responde un error, Alert con su `mensaje`; los campos conservan lo escrito.
- Con 204: el frontend borra la sesión **sin** llamar a `POST /auth/logout` y vuelve a `/login` con el aviso "Su contraseña se cambió. Inicie sesión con la nueva.". Para eso `ProveedorSesion` expone `terminarTrasCambioContrasena()`.

**zxcvbn en el frontend** se carga con `import()` dinámico la primera vez que se escribe en "Contraseña nueva", para no agrandar la carga inicial. Mientras carga, el medidor dice "Revisando…" y el botón sigue deshabilitado.

**`CampoContrasena`** (`frontend/src/componentes/contrasena/CampoContrasena.jsx`): un Input `password` con un botón al lado (ícono `Eye`, `aria-label` "Mantener presionado para ver la contraseña").

- Muestra el texto mientras se mantiene presionado con el ratón o el dedo (`pointerdown` → `pointerup`, `pointerleave` o `pointercancel`) o con la tecla Espacio sobre el botón (`keydown` → `keyup`), y lo oculta al soltar.
- El botón no envía el formulario (`type="button"`) y no le quita el foco al campo al hacer clic.
- Acepta las mismas props que Input (`id`, `value`, `onChange`, `autoComplete`, `aria-invalid`…).

### Archivos que aparecen o cambian

```
AGENTS.md                                          ← las tres dependencias de zxcvbn en la sección 3
backend/
├── package.json                                   ← @zxcvbn-ts/core, language-common, language-es-es
├── openapi.yaml                                   ← POST /auth/contrasena, debeCambiarContrasena, 403 nuevo
├── src/middlewares/autenticar.js                  ← exigirContrasenaCambiada, autenticarSinExigirCambio
├── src/modulos/auditoria/auditoria.service.js     ← acción CAMBIO_CONTRASENA
├── src/modulos/auth/
│   ├── auth.routes.js                             ← ruta nueva; logout con autenticarSinExigirCambio
│   ├── auth.controller.js
│   ├── auth.service.js                            ← cambiarContrasena; debeCambiarContrasena en la sesión
│   └── politicaContrasena.service.js              ← nuevo
└── tests/
    ├── politicaContrasena.test.js                 ← nuevo
    ├── auth.contrasena.test.js                    ← nuevo
    ├── auth.login.test.js                         ← debeCambiarContrasena en la respuesta
    ├── autenticar.test.js                         ← 403 obligatorio; sus cuentas con debe_cambiar = FALSE
    └── catalogos.test.js                          ← sus cuentas con debe_cambiar = FALSE
frontend/
├── package.json                                   ← @zxcvbn-ts/core, language-common, language-es-es
└── src/
    ├── App.jsx                                    ← ruta /cuenta/contrasena
    ├── api/auth.js                                ← cambiarContrasena
    ├── componentes/ProveedorSesion.jsx            ← terminarTrasCambioContrasena
    ├── componentes/RutaProtegida.jsx              ← redirige si debe cambiar
    ├── componentes/RutaProtegida.test.jsx         ← nuevo
    ├── componentes/layout/Encabezado.jsx          ← botón "Cambiar contraseña"
    ├── componentes/layout/Layout.test.jsx         ← caso del botón
    ├── componentes/contrasena/
    │   ├── politicaContrasena.js                  ← nuevo
    │   ├── politicaContrasena.test.js             ← nuevo
    │   ├── CampoContrasena.jsx                    ← nuevo
    │   ├── CampoContrasena.test.jsx               ← nuevo
    │   └── MedidorContrasena.jsx                  ← nuevo
    └── paginas/cuenta/
        ├── PaginaCambiarContrasena.jsx            ← nuevo
        └── PaginaCambiarContrasena.test.jsx       ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance de HU-03
CLAUDE.md                                          ← nota sobre exigirContrasenaCambiada y la cuenta de prueba
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: agregar `POST /auth/contrasena` con `CambioContrasenaEntrada`, la respuesta 204 y los 400, 401 y 422 con sus códigos; agregar `debeCambiarContrasena` a `UsuarioSesion`; agregar la respuesta reutilizable `CambioContrasenaRequerido` (403) y documentar en la descripción de la seguridad que todo endpoint protegido la responde salvo `POST /auth/contrasena`, `POST /auth/logout` y `GET /auth/yo`. Comprobación: `/api/docs` carga sin errores y muestra el endpoint nuevo.
2. **Dependencias.** **Pedir confirmación antes de editar** los dos `package.json` (zona protegida, aunque el equipo ya autorizó las librerías). Instalar las tres con `npm install` en `backend/` y en `frontend/`, revisar que no se agregó nada más y actualizar la lista de la sección 3 de `AGENTS.md`. Comprobación: `npm test` pasa en los dos sin cambios de código.
3. **Política en el backend.** `politicaContrasena.service.js` con la tabla del "Modelo de datos". Pruebas en `tests/politicaContrasena.test.js`, sin base de datos:
   - 11 caracteres → motivo de largo; 12 caracteres fuertes → sin motivos;
   - 73 bytes (por ejemplo, con letras con tilde) → "Es demasiado larga.";
   - con el apellido sin tilde, con mayúsculas o con el usuario dentro → motivo de nombre;
   - una palabra de 2 letras del nombre no cuenta;
   - `contrasena12345` → motivo de zxcvbn en español.
4. **Bitácora y endpoint.** Agregar `CAMBIO_CONTRASENA` a `ACCIONES`. Programar `POST /auth/contrasena` en `auth.routes.js`, `auth.controller.js` y `auth.service.js`, todavía con `autenticar`. Pruebas en `tests/auth.contrasena.test.js` (ver la decisión sobre la cuenta de prueba):
   - sin token, 401; cuerpo vacío o con otro campo, 400;
   - actual incorrecta, 422 `CONTRASENA_ACTUAL_INCORRECTA`, sin fila nueva en la bitácora y sin cambio en `intentos_fallidos`;
   - nueva igual a la actual, 422 `CONTRASENA_REPETIDA`; nueva débil, 422 `CONTRASENA_DEBIL`;
   - cambio correcto: 204; `debe_cambiar_contrasena` queda en `FALSE`; hay una fila `CAMBIO_CONTRASENA` sin contraseñas en sus valores; `POST /auth/login` con la nueva responde 200 y con la anterior, 401.
5. **Login.** `debeCambiarContrasena` en la respuesta. En `auth.login.test.js`, el login del usuario de prueba trae el campo como booleano. Comprobación: `npm test` del backend pasa completo.
6. **Cambio obligatorio.** `exigirContrasenaCambiada` y `autenticarSinExigirCambio` en `autenticar.js`; `POST /auth/contrasena` y `POST /auth/logout` pasan a `autenticarSinExigirCambio`. En `autenticar.test.js` y `catalogos.test.js`, las cuentas que crean las pruebas se insertan con `debe_cambiar_contrasena = FALSE` (lo que comprueba cada caso no cambia). Pruebas nuevas en `autenticar.test.js`, con una cuenta de prefijo `vitest-hu03-` y `debe_cambiar_contrasena = TRUE`, token firmado a mano:
   - `GET /roles` responde 403 `CAMBIO_CONTRASENA_REQUERIDO` y no deja fila en la bitácora;
   - `POST /auth/logout` no responde ese 403 (responde 204);
   - con `debe_cambiar_contrasena = FALSE`, `GET /roles` responde 200.
   Comprobación: `npm test` del backend pasa completo, incluidas las pruebas de los specs anteriores.
7. **Frontend: política y `CampoContrasena`.** `politicaContrasena.js` (mismos casos que el paso 3, en `politicaContrasena.test.js`), `CampoContrasena.jsx` y `MedidorContrasena.jsx`. Pruebas en `CampoContrasena.test.jsx`:
   - empieza como `password`;
   - `pointerdown` en el botón lo pasa a `text` y `pointerup` lo regresa; igual con `pointerleave`;
   - Espacio presionado sobre el botón lo muestra y al soltarla se oculta;
   - el botón no envía el formulario.
   Comprobación: `npm test` del frontend pasa.
8. **Frontend: página y rutas.** `cambiarContrasena` en `src/api/auth.js`, `terminarTrasCambioContrasena` en `ProveedorSesion.jsx`, `PaginaCambiarContrasena.jsx`, la ruta en `App.jsx`, la redirección en `RutaProtegida.jsx` y el botón del encabezado. Pruebas, con `vi.mock` sobre `@/api/auth.js`:
   - `PaginaCambiarContrasena.test.jsx`: el botón está deshabilitado con la nueva débil, igual a la actual o sin confirmación igual; el medidor muestra los motivos; un envío válido llama a `cambiarContrasena` con `{ contrasenaActual, contrasenaNueva }` y lleva a `/login` con el aviso; un 422 muestra el `mensaje` y conserva los campos; en modo obligatorio no hay menú y aparece "Cerrar sesión"; fuera de él, "Cancelar" vuelve a `/inicio`.
   - `RutaProtegida.test.jsx`: con `debeCambiarContrasena` verdadero, `/inicio` y `/usuarios` llevan a `/cuenta/contrasena`; con falso, no.
   - `Layout.test.jsx`: el encabezado tiene "Cambiar contraseña" y lleva a `/cuenta/contrasena`.
   Comprobación: `npm test` del frontend pasa.
9. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright: crear una cuenta "Prueba HU-03" desde "Registrar personal"; entrar con ella y comprobar que solo se ve la pantalla de cambio y que escribir otra ruta en la barra vuelve a ella; probar el botón de ver la contraseña con el ratón y con Espacio; ver el medidor con una contraseña débil, una con el apellido y una fuerte; cambiarla y comprobar que vuelve al login con el aviso, que la anterior ya no entra y que la nueva sí; cambiarla otra vez desde el encabezado; revisar las filas `CAMBIO_CONTRASENA` de `bitacora`. Actualizar el "Avance" de HU-03 y marcar sus criterios. Nota en "Notas de contexto" de `CLAUDE.md` sobre `exigirContrasenaCambiada` (las cuentas creadas en pruebas que usan endpoints protegidos van con `debe_cambiar_contrasena = FALSE`) y sobre la cuenta permanente `vitest-hu03-permanente`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `POST /auth/contrasena`, `debeCambiarContrasena` y el 403 `CAMBIO_CONTRASENA_REQUERIDO`, y `/api/docs` carga sin errores.
- [ ] Los dos `package.json` solo agregan `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common` y `@zxcvbn-ts/language-es-es`, y `AGENTS.md` las lista.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba.
- [ ] Con la contraseña actual incorrecta, el cambio responde 422 `CONTRASENA_ACTUAL_INCORRECTA` y la contraseña no cambia.
- [ ] Una contraseña nueva de 11 caracteres, de más de 72 bytes, con puntaje menor a 3 o que contiene el usuario, un nombre o un apellido (sin importar mayúsculas ni tildes) responde 422 `CONTRASENA_DEBIL`, aunque el frontend no la revise.
- [ ] Una contraseña de 12 caracteres o más, con puntaje de 3 o más y sin mayúsculas, números ni símbolos se acepta.
- [ ] Una contraseña nueva igual a la actual responde 422 `CONTRASENA_REPETIDA`.
- [ ] Después del cambio, el login funciona solo con la nueva y la cuenta queda con `debe_cambiar_contrasena = FALSE`.
- [ ] El login devuelve `debeCambiarContrasena`.
- [ ] Con `debe_cambiar_contrasena = TRUE`, cualquier endpoint protegido responde 403 `CAMBIO_CONTRASENA_REQUERIDO`, salvo `POST /auth/contrasena` y `POST /auth/logout`.
- [ ] Con `debeCambiarContrasena` verdadero en la sesión, cualquier ruta del frontend lleva a `/cuenta/contrasena`, que se muestra sin menú y con "Cerrar sesión".
- [ ] El encabezado tiene "Cambiar contraseña", que abre la pantalla dentro del Layout.
- [ ] Mientras escribo la nueva contraseña veo el medidor y los motivos por los que todavía no se acepta.
- [ ] En los tres campos puedo ver lo escrito mientras mantengo presionado el botón con el ratón, el dedo o la tecla Espacio, y se oculta al soltarlo.
- [ ] Tras un cambio correcto, la sesión se cierra y el login muestra "Su contraseña se cambió. Inicie sesión con la nueva.".
- [ ] Cada cambio deja una fila `USUARIOS` / `CAMBIO_CONTRASENA` sin la contraseña actual, la nueva ni el hash.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-03 tiene su avance y sus criterios marcados.

## Decisiones

- **Sí:** `@zxcvbn-ts/core`, `language-common` y `language-es-es` en backend y frontend, autorizadas por el equipo al escribir este spec. El backend valida (la regla obligatoria) y el frontend mide (la ayuda mientras se escribe).
- **No:** reglas propias sin zxcvbn, o zxcvbn solo en el backend. La historia pide el medidor en vivo con la misma medida que aplica el backend.
- **Sí:** `POST /auth/contrasena`, en el módulo `auth`, sin `x-permiso`. Es una acción sobre la cuenta propia, como `POST /auth/logout`, y todos los roles la necesitan.
- **No:** `POST /usuarios/yo/contrasena`. Mezcla la cuenta propia con la administración de cuentas.
- **Sí:** tras el cambio, el frontend cierra la sesión y pide entrar con la nueva. Comprueba enseguida que la persona recuerda la contraseña nueva.
- **No:** seguir con el mismo token. Funcionaría (el backend lee `debe_cambiar_contrasena` en cada petición), pero se eligió el cierre.
- **Sí:** el cierre tras el cambio no llama a `POST /auth/logout`; la fila `CAMBIO_CONTRASENA` ya deja el registro. Evita un motivo nuevo en el contrato del logout.
- **Sí:** la contraseña actual incorrecta responde 422 `CONTRASENA_ACTUAL_INCORRECTA`. Un 401 cerraría la sesión en el frontend (SPEC 03).
- **No:** contar esos intentos para el bloqueo ni escribirlos en la bitácora. La persona ya tiene una sesión válida.
- **Sí:** el 403 `CAMBIO_CONTRASENA_REQUERIDO` va en un tercer middleware de `autenticar` (`exigirContrasenaCambiada`), y las dos rutas exentas usan `autenticarSinExigirCambio`. Así toda ruta nueva queda cubierta sin acordarse de nada, y la excepción es explícita en las dos rutas que la necesitan.
- **Sí:** 403 y no 401, para que el frontend no cierre la sesión. No escribe en la bitácora, como los 401 de `revisarCuenta`.
- **Sí:** `debe_cambiar_contrasena` se lee de la base en `revisarCuenta`, no del token. La misma consulta ya existe y el valor cambia sin emitir un token nuevo.
- **No:** implementar `GET /auth/yo`. Nada lo consume todavía; el contrato ya lo marca como exento para cuando exista.
- **Sí:** la política compara cada palabra de 3 letras o más del usuario, los nombres y los apellidos, sin mayúsculas ni tildes, y además las pasa a zxcvbn como `userInputs`. Detecta "perez2026" con "Pérez"; las palabras de 1 o 2 letras ("de", "la") darían falsos rechazos.
- **No:** comparar solo el nombre completo o dejarlo solo a zxcvbn. Dejan pasar contraseñas con un nombre.
- **Sí:** motivos fijos en español para largo, bytes y nombre, y la advertencia traducida de zxcvbn para el puntaje. Las reglas propias tienen un texto claro y zxcvbn explica mejor por qué una contraseña es adivinable.
- **Sí:** la política está duplicada en el backend y en el frontend, con las mismas pruebas. Son dos proyectos con su propio `package.json` y no comparten código.
- **Sí:** zxcvbn se carga con `import()` dinámico en el frontend. Sus diccionarios pesan y solo se usan en esta pantalla.
- **Sí:** acción nueva `CAMBIO_CONTRASENA`. Se filtra fácil en la auditoría y no se confunde con las ediciones del administrador (`ACTUALIZAR`).
- **Sí:** una sola ruta `/cuenta/contrasena` con dos marcos: dentro del Layout si es voluntario y sola, sin menú, si es obligatorio. En el caso obligatorio el menú solo llevaría a rutas que la redirigen.
- **Sí:** `/cuenta/contrasena` va en `App.jsx` y no en `opcionesMenu.js`. No es una opción del menú, y en modo obligatorio se muestra fuera del Layout.
- **Sí:** `CampoContrasena` solo se usa en esta pantalla. El login y el registro lo adoptan en el spec A, que ya cambia esas dos pantallas.
- **No:** cerrar las sesiones abiertas en otros equipos. Necesita una columna nueva en `usuario` (zona protegida); queda como riesgo.
- **Sí:** las pruebas del cambio correcto usan una cuenta permanente, `vitest-hu03-permanente`, que se crea si no existe y cuya contraseña y `debe_cambiar_contrasena` se reinician por SQL en `beforeAll`; no se borra. La fila `CAMBIO_CONTRASENA` y el `LOGIN_OK` llevan su `usuario_id`, y la llave foránea de la bitácora impide borrarla. Las demás pruebas (actual incorrecta, débil, repetida, el 403) no escriben con su id y usan cuentas de prefijo `vitest-hu03-` que se borran en `afterAll`.
- **Sí:** las cuentas que crean las pruebas de `autenticar.test.js` y `catalogos.test.js` pasan a insertarse con `debe_cambiar_contrasena = FALSE`. Con el valor por defecto (`TRUE`) recibirían el 403 nuevo; lo que comprueba cada prueba no cambia.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Editar los `package.json` sin confirmación | El paso 2 pide confirmación antes de editarlos. |
| El 403 nuevo rompe las pruebas de specs anteriores que crean cuentas | El paso 6 inserta esas cuentas con `debe_cambiar_contrasena = FALSE` y corre la suite completa. |
| El Administrador de prueba tiene `debe_cambiar_contrasena = TRUE` en Aiven y todas las pruebas reciben 403 | El paso 6 lo revisa antes de correr la suite; si lo tiene, se cambia la contraseña con el endpoint o se pide autorización para ajustarlo por SQL. |
| La regla del backend y la del frontend se separan con el tiempo | Las dos tienen las mismas pruebas; un cambio a una se hace en las dos. Si el frontend acepta algo que el backend rechaza, el 422 muestra el motivo. |
| Otra sesión abierta de la misma cuenta sigue válida hasta 2 horas después del cambio | Fuera de alcance; necesita una columna nueva en `usuario`. Se anota para un spec futuro. |
| zxcvbn carga lento la primera vez | El medidor dice "Revisando…" y el botón sigue deshabilitado hasta que termine. |
| El administrador restablece la contraseña de una cuenta con sesión abierta (spec A) y esa sesión recibe el 403 sin haber pasado por el login | El spec A decide si el cliente lleva a `/cuenta/contrasena` ante ese 403; aquí la sesión solo lo sabe por el login. |
| La cuenta permanente de prueba acumula filas en la bitácora | Es una sola cuenta reutilizada y la bitácora no se borra; se documenta en `CLAUDE.md`. |

## Lo que **no** entra en este spec

- `GET /auth/yo`.
- `CampoContrasena` en el login y en "Registrar personal" (spec A).
- Contraseña temporal generada, restablecer contraseñas y desbloquear cuentas (spec A).
- Cerrar las sesiones abiertas en otros equipos al cambiar la contraseña.
- Historial y vencimiento de contraseñas.
- Contar los intentos con la contraseña actual incorrecta.

Cada uno, si se hace, va en su propio spec.
