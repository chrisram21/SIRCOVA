# SPEC 11 — Validación de los campos del empleado y CUI

> **Estado:** Implementado
> **Historia:** ninguna; ajustes a HU-04 (registrar personal) y HU-05 (editar empleado)
> **Depende de:** SPEC 05, SPEC 07, SPEC 08, SPEC 10
> **Fecha:** 2026-10-22
> **Objetivo:** Que los datos del personal se validen con reglas de formato compartidas entre backend y frontend, y que un empleado no se pueda registrar dos veces, usando el CUI del DPI guardado solo como huella HMAC-SHA256.

## Por qué existe este spec

La asesoría del 2026-10-21 pidió dos cosas:

1. No permitir empleados repetidos.
2. Validar que los campos del personal estén bien escritos.

El detalle acordado por el equipo está en `docs/SPECS/PROPUESTA_SPEC_B_DATOS_DEL_EMPLEADO.md`. Este spec la toma como base y cierra lo que dejaba abierto: la ubicación de las reglas, la validación exacta del CUI, el correo obligatorio y el largo de la clave.

No corresponde a una historia nueva: ajusta HU-04 y HU-05, ya implementadas en los SPEC 07 y 08. Esos specs no se reescriben. Este spec reemplaza lo que dicen sobre `codigoEmpleado`, sobre la validación de los campos y sobre el correo opcional.

**Por qué el CUI y no `codigo_empleado`.** Según la DDRISS, algunas personas tienen dos códigos, uno de ellos cambia seguido y el personal contratado tiene códigos de otro tipo. Lo único que identifica a una persona es el CUI del DPI.

**Por qué una huella y no el CUI.** `CONTEXTO BD.md` dice que no se guarda el DPI. Con la huella se comprueba que el CUI no se repite sin guardar el número. Se usa HMAC, con una clave secreta, y no un SHA-256 simple: el CUI tiene pocas combinaciones posibles y, sin clave, cualquiera con acceso a la base podría calcular las huellas de todos los CUI. No rompe la regla 1 de `AGENTS.md`, porque el CUI es del personal y no de pacientes. **Consecuencia:** el sistema nunca muestra el CUI de nadie. Solo indica si está registrado y permite reemplazarlo.

**Zonas protegidas autorizadas por el equipo al escribir este spec:**

- `backend/db/`: el script nuevo `07_cui_empleado_mysql.sql` y los cambios al 01 y al 03.
- La copia del script 01 en `docs/base-de-datos/diseño_bd/`, `docs/base-de-datos/CONTEXTO BD.md` (v0.9) y `docs/base-de-datos/Diagrama Relacional.dbml`.
- `CLAVES_SENSIBLES` en `auditoria.service.js`: `cui`, `cuiHmac` y `cui_hmac`.
- La variable obligatoria `CUI_HMAC_CLAVE` en `backend/src/config/entorno.js` y `backend/.env.example`.

Aun así, al implementar se pide confirmación antes de editar `backend/db/` y antes de correr el 07, como dice `CLAUDE.md`.

**Condición para aprobar este spec:** el equipo prueba la regla del dígito verificador (sección "CUI") **en local** con los CUI reales de sus integrantes, sin escribirlos en ningún archivo del repositorio. Si alguno válido no pasa, se quita el verificador antes de aprobar y se anota en las decisiones.

## Alcance

**Entra:**

- Módulos de reglas de formato `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus pruebas y la misma lista de casos.
- Validación de nombres, apellidos, cargo, teléfono, correo, CUI y nombre de usuario en `POST /empleados`, `PATCH /empleados/{id}` y `POST /usuarios`.
- Teléfono guardado como `NNNN-NNNN` y correo guardado en minúsculas.
- Correo obligatorio en `POST /empleados`; en `PATCH` no se puede borrar.
- Columna `empleado.codigo_empleado` renombrada a `cui_hmac` (`CHAR(64)`), con el índice `uq_empleado_cui`, mediante el script idempotente `07_cui_empleado_mysql.sql`.
- Variable `CUI_HMAC_CLAVE`, obligatoria y de al menos 32 caracteres.
- `cui` obligatorio en `POST /empleados`, opcional en `PATCH`; `cuiRegistrado` en las respuestas; 409 `CUI_DUPLICADO`.
- Bitácora sin el CUI ni la huella, con `cuiRegistrado` y `cuiReemplazado`.
- Campo "CUI (DPI)" en `CamposEmpleado.jsx`, en lugar de "Código de empleado", con el Badge "Registrado" y el botón "Reemplazar CUI" al editar.
- Mensajes de error debajo de cada campo y botón deshabilitado mientras haya un campo inválido.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Notas en HU-04 y HU-05 de `HISTORIAS_DE_USUARIO.md`, la carpeta `validaciones/` en la sección 4 de `AGENTS.md` y notas en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Validar los formularios de otros módulos (establecimientos, población, etc.). Esos specs usan `validaciones/campos.js` cuando lleguen.
- Validar el municipio del CUI contra el número de municipios de cada departamento.
- Consultar el CUI en el RENAP o en otro servicio externo.
- Mostrar, exportar o buscar por CUI.
- Pedir el CUI o el correo a los empleados que ya existen, o corregir sus datos viejos (teléfonos, correos con mayúsculas).
- Revisar el formato de los nombres de usuario que ya existen.
- Contraseñas, bloqueo y restablecimiento (SPEC 09 y SPEC 10).

## Modelo de datos

### Columna `empleado.cui_hmac` (script 07)

`backend/db/07_cui_empleado_mysql.sql` es **idempotente**, como el 05. MySQL no tiene `IF EXISTS` para renombrar columnas ni índices, así que el script consulta `information_schema` antes de cada cambio y no hace nada si ya está aplicado.

1. `UPDATE empleado SET codigo_empleado = NULL`. Los valores actuales (`EMP-0001`…) son códigos, no huellas, y no sirven. Este UPDATE **no pasa por la bitácora**: es una migración, no una acción de un usuario.
2. Renombrar `codigo_empleado` a `cui_hmac` y cambiarla a:

   ```sql
   cui_hmac CHAR(64) NULL COMMENT 'HMAC-SHA256 en hexadecimal del CUI (13 dígitos); nunca el CUI'
   ```

3. Renombrar el índice `uq_empleado_codigo` a `uq_empleado_cui`.

También cambian:

- El script 01, para que una base recreada ya tenga `cui_hmac` y `uq_empleado_cui`. Desde este spec, el 07 solo sirve para bases que ya existen.
- El script 03: los empleados de prueba quedan con `cui_hmac` en `NULL`, porque SQL no puede calcular el HMAC sin la clave.
- La copia del 01 en `docs/base-de-datos/diseño_bd/` y `Diagrama Relacional.dbml`, iguales al 01.
- `CONTEXTO BD.md` pasa a la v0.9: la columna nueva, el porqué, y la línea "No guarda DPI ni otros datos personales innecesarios." cambia a "No guarda el DPI; solo una huella HMAC del CUI para evitar empleados repetidos.".

La columna es `NULL` en la base y la API la exige al crear. Esa regla la valida el backend, como "solo AUTORIDAD puede no tener DDRISS". `correo` no cambia en la base: sigue `NULL` y con `uq_empleado_correo`, y la API lo exige al crear.

Después de recrear la base con el 01, hay que volver a correr el 05 y el 06. El 07 ya no hace falta, pero correrlo no hace daño.

### Clave del HMAC

- `CUI_HMAC_CLAVE=` (sin valor) en `backend/.env.example`, con un comentario que explica cómo generarla.
- Se agrega a `obligatorias` en `entorno.js`. Además, si tiene menos de 32 caracteres, la API no arranca y el error dice "CUI_HMAC_CLAVE debe tener al menos 32 caracteres.".
- Se genera una vez con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (64 caracteres). La genera Luis y la comparte con el equipo por un medio seguro.
- Todos usan la **misma** clave: con otra, las huellas guardadas ya no coinciden. No se cambia, salvo que se filtre. Si se pierde o se cambia, hay que poner `cui_hmac` en `NULL` y volver a registrar los CUI.

### Reglas de formato (`validaciones/campos.js`)

Cada regla es una función pura que recibe el valor y devuelve `{ valor }` con el valor limpio o `{ error }` con el mensaje. Todas quitan los espacios de los extremos y reducen los espacios dobles a uno. El módulo del backend y el del frontend son dos archivos separados con las mismas reglas, porque los dos paquetes no comparten código (como `politicaContrasena`).

| Campo | Regla | Válidos | Inválidos | Mensaje |
|---|---|---|---|---|
| Nombres, apellidos | `^\p{L}+(?:[ '’-]\p{L}+)*$` con la bandera `u`; de 1 a 100 caracteres. No se exige un número fijo de palabras | `María de los Ángeles`, `Chávez de León`, `B'alam`, `Pérez-Gómez` | `123`, `.-.{p´p.`, `Juan2`, `' Ana` | "Los nombres solo pueden tener letras, espacios, apóstrofos y guiones." (y "Los apellidos…") |
| Cargo (opcional) | Empieza con letra; letras, espacios y `. , ( ) / -`; al menos 2 letras; hasta 100 caracteres | `Enf. auxiliar (TSR)`, `Estadígrafa` | `123`, `---` | "El cargo solo puede tener letras, espacios y los signos . , ( ) / -." |
| Teléfono (opcional) | Acepta `+502`, espacios y guiones; sin ellos quedan **8 dígitos** que empiezan con 2 a 7. Se guarda como `NNNN-NNNN` | `5551-1001`, `+502 5551 1001`, `55511001` | `1234`, `9551-1001`, `5551-10012` | "El teléfono debe tener 8 dígitos y empezar con 2 a 7." |
| Correo (**obligatorio al crear**) | `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`; hasta 150 caracteres; **cualquier dominio**; se guarda en minúsculas | `ana.lopez@gmail.com`, `Ana@Gmail.com` (→ `ana@gmail.com`) | `ana@`, `ana lopez@gmail.com` | "El correo no es válido." |
| CUI | Ver la sección siguiente | | | |
| Nombre de usuario (solo al crear la cuenta) | `^[a-z0-9._-]{4,50}$` | `ana.lopez`, `cs-1201` | `Ana López`, `ab` | "El nombre de usuario debe tener de 4 a 50 caracteres: minúsculas, números, punto, guion o guion bajo." |

Un campo obligatorio vacío responde con su propio mensaje: "Los nombres son obligatorios.", "Los apellidos son obligatorios.", "El correo es obligatorio.", "El CUI es obligatorio.".

### CUI

Al escribirlo se aceptan espacios y guiones (`2345 67899 1201`). La regla:

1. Sin espacios ni guiones deben quedar **13 dígitos**. Si no: "El CUI debe tener 13 dígitos.".
2. Estructura: 8 dígitos de correlativo, 1 dígito verificador, 2 de departamento y 2 de municipio.
3. **Dígito verificador:** se suma cada uno de los 8 primeros dígitos multiplicado por su posición + 1 (el 1.º por 2, el 2.º por 3… el 8.º por 9). El residuo de dividir la suma entre 11 debe ser igual al 9.º dígito. Si el residuo es 10, el CUI no es válido. Si no cumple: "El CUI no es válido; revise los dígitos.".
4. **Departamento** (dígitos 10 y 11) entre `01` y `22`. Si no: "El CUI no es válido; el departamento debe estar entre 01 y 22.". El municipio (dígitos 12 y 13) no se valida.

Ejemplo ficticio: con el correlativo `12345678`, la suma es 2+6+12+20+30+42+56+72 = 240 y 240 entre 11 deja residuo 9, así que `1234567890101` es válido y `1234567880101` no.

La regla devuelve los 13 dígitos limpios. La huella se calcula sobre ellos, así que `2345 67899 1201` y `2345678991201` dan la misma:

```js
crypto.createHmac('sha256', CUI_HMAC_CLAVE).update(cuiLimpio).digest('hex')
```

La huella no va en `validaciones/campos.js`, que es igual en los dos paquetes y no conoce la clave. Va en `backend/src/modulos/usuarios/cui.service.js`, que exporta `huellaCui(cuiLimpio, clave = entorno.cuiHmacClave)`. El parámetro `clave` existe para la prueba con otra clave.

### API

| Esquema | Cambio |
|---|---|
| `EmpleadoEntrada` (`POST /empleados`) | `cui` **obligatorio** y `correo` **obligatorio**. Ya no tiene `codigoEmpleado`; si llega, 400 `ENTRADA_INVALIDA` |
| `EmpleadoCambios` (`PATCH /empleados/{id}`) | `cui` opcional, para registrarlo o reemplazarlo. `cui: null` o vacío responde 400, porque una vez registrado no se borra. `correo: null` o vacío responde 400. `codigoEmpleado` responde 400 |
| `Empleado` (respuestas) | Quita `codigoEmpleado` y agrega `cuiRegistrado: boolean` (`cui_hmac IS NOT NULL`). **Nunca** devuelve el CUI ni la huella |
| `UsuarioEntrada.nombreUsuario` | El patrón nuevo |

- `POST /empleados` valida todos los campos. `PATCH /empleados/{id}` valida **solo los campos que llegan en el cuerpo**: un empleado con datos viejos que no cumplen la regla todavía se puede editar en otro campo.
- Un formato mal escrito responde 400 `ENTRADA_INVALIDA` con el mensaje de la regla, como hoy (`INSTRUCCIONES_BACKEND.md`: 400 son datos mal formados).
- Los `pattern` de las reglas van en `openapi.yaml` donde OpenAPI los pueda expresar. La descripción de cada campo explica las normalizaciones (teléfono, correo, CUI).

### Errores nuevos o que cambian

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 409 | `CUI_DUPLICADO` | Ya hay un empleado con esa huella | "Ya hay un empleado registrado con ese CUI." |
| 409 | `CORREO_DUPLICADO` | Sin cambios; ahora compara el correo ya en minúsculas | "Ya hay un empleado con ese correo." |

`CUI_DUPLICADO` se revisa antes del INSERT o del UPDATE en `verificarDuplicados`. También se traduce desde el `ER_DUP_ENTRY` del índice `uq_empleado_cui` en `DUPLICADOS`. `CODIGO_EMPLEADO_DUPLICADO` desaparece del código y del contrato.

### Bitácora

- `CLAVES_SENSIBLES` agrega `cui`, `cuiHmac` y `cui_hmac`. Es una segunda protección: el servicio no pasa ni el CUI ni la huella a la bitácora.
- Al crear (`CREAR`), `valoresNuevos` lleva `cuiRegistrado: true`.
- Al editar (`ACTUALIZAR`):
  - si se registra un CUI donde no había, `diferencias` da `cuiRegistrado: false → true`;
  - si se **reemplaza** uno que ya había y la huella nueva es distinta, se agrega `cuiReemplazado: true` a `valoresNuevos`, porque `diferencias` no ve el cambio (`cuiRegistrado` sigue en `true`);
  - si la huella es la misma, no hay cambio y no se registra nada, como cualquier campo sin cambios.

### Frontend

**`CamposEmpleado.jsx`.**

- "Código de empleado" se reemplaza por "CUI (DPI)": `inputMode="numeric"`, `maxLength` suficiente para 13 dígitos con espacios y guiones, y el texto de ayuda "Se usa solo para evitar registros repetidos; el sistema no lo muestra después.".
  - **Registro:** obligatorio (*).
  - **Edición con CUI registrado:** el campo no se muestra. En su lugar se ven un Badge "Registrado" y el botón "Reemplazar CUI", que muestra el campo vacío. Un botón "Cancelar" lo vuelve a ocultar y descarta lo escrito.
  - **Edición sin CUI** (empleados antiguos): el campo está vacío y es opcional.
- Correo obligatorio (*) en el registro. En la edición es obligatorio solo si el empleado ya tenía correo.
- Cada campo valida con `frontend/src/validaciones/campos.js` al salir de él (`onBlur`). El mensaje aparece debajo, con `aria-invalid` en el campo y `aria-describedby` hacia el mensaje. Al corregirlo, el mensaje se quita mientras se escribe.
- Los colores del mensaje salen del tema (`text-destructive`).

**`PaginaRegistrarPersonal.jsx`.** "Registrar" queda deshabilitado mientras haya un campo inválido o falte un obligatorio. El nombre de usuario se pasa a minúsculas mientras se escribe y se valida con la misma regla. Envía `cui` y ya no envía `codigoEmpleado`.

**`PaginaEditarUsuario.jsx`.** `TEXTOS_OPCIONALES` ya no incluye `codigoEmpleado`. `cui` se envía solo si se escribió. "Guardar cambios" queda deshabilitado mientras haya un campo inválido. Solo se validan los campos que cambiaron, igual que el backend.

Los 409 `CUI_DUPLICADO` y `CORREO_DUPLICADO` muestran el `mensaje` del backend, como los demás errores.

### Archivos que aparecen o cambian

```
backend/
├── .env.example                                   ← CUI_HMAC_CLAVE=
├── openapi.yaml                                   ← esquemas, patrones y CUI_DUPLICADO
├── db/
│   ├── 01_modelo_relacional_mysql.sql             ← cui_hmac y uq_empleado_cui (autorizado)
│   ├── 03_datos_prueba_mysql.sql                  ← cui_hmac en NULL (autorizado)
│   └── 07_cui_empleado_mysql.sql                  ← nuevo, idempotente (autorizado)
├── src/config/entorno.js                          ← CUI_HMAC_CLAVE obligatoria, ≥ 32 caracteres
├── src/validaciones/campos.js                     ← nuevo
├── src/modulos/auditoria/auditoria.service.js     ← CLAVES_SENSIBLES
├── src/modulos/usuarios/
│   ├── cui.service.js                             ← nuevo: huellaCui
│   └── usuarios.service.js                        ← leerEmpleado, cambios, verificarDuplicados, DUPLICADOS, respuestas
└── tests/
    ├── campos.test.js                             ← nuevo
    ├── cui.test.js                                ← nuevo: huella
    ├── auditoria.test.js                          ← claves del CUI filtradas
    └── usuarios.test.js                           ← reglas, CUI y correo obligatorio; casos de SPEC 07 y 08 ajustados
frontend/src/
├── validaciones/campos.js (+ campos.test.js)      ← nuevo
└── paginas/usuarios/
    ├── CamposEmpleado.jsx                         ← CUI, mensajes por campo
    ├── PaginaRegistrarPersonal.jsx (+ test)
    └── PaginaEditarUsuario.jsx (+ test)
docs/base-de-datos/
├── CONTEXTO BD.md                                 ← v0.9 (autorizado)
├── Diagrama Relacional.dbml                       ← cui_hmac (autorizado)
└── diseño_bd/01_modelo_relacional_mysql.sql       ← igual al 01 (autorizado)
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← notas en HU-04 y HU-05
AGENTS.md                                          ← validaciones/ en la estructura (sección 4)
CLAUDE.md                                          ← notas de contexto
```

No agrega dependencias: `crypto` viene con Node.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: `EmpleadoEntrada` con `cui` y `correo` obligatorios y sin `codigoEmpleado`; `EmpleadoCambios` con `cui` opcional no nulo y `correo` no nulo; `Empleado` con `cuiRegistrado` y sin `codigoEmpleado`; los patrones y las normalizaciones de cada campo; `UsuarioEntrada.nombreUsuario` con el patrón nuevo; el 409 `CUI_DUPLICADO`, y se quita `CODIGO_EMPLEADO_DUPLICADO`. Comprobación: `/api/docs` carga sin errores.
2. **Reglas del backend.** `backend/src/validaciones/campos.js` con las reglas de nombres, apellidos, cargo, teléfono, correo, CUI y nombre de usuario. `tests/campos.test.js` con los ejemplos válidos e inválidos de las tablas, y además: un CUI ficticio que cumple el algoritmo, el mismo con el verificador mal, uno con residuo 10, uno con el departamento `00` y otro con `23`, uno con 12 dígitos y uno con espacios y guiones. Sin base de datos. Comprobación: `npm test` del backend pasa.
3. **Reglas aplicadas en el backend (sin el CUI).** En `usuarios.service.js`, `leerEmpleado` y la lectura de los cambios usan `campos.js`: el correo es obligatorio en `POST` y no se puede borrar en `PATCH`, el teléfono se guarda como `NNNN-NNNN`, el correo en minúsculas, y `POST /usuarios` usa la regla del nombre de usuario. Las pruebas de los SPEC 07 y 08 que crean empleados sin correo o con datos que ya no cumplen se **ajustan**; no se quita ningún caso. Se agregan a `usuarios.test.js`:
   - `POST /empleados` con nombres `123` responde 400 y no crea nada;
   - sin correo responde 400;
   - el teléfono `+502 5551 1001` se guarda como `5551-1001`;
   - el correo con mayúsculas se guarda en minúsculas;
   - en `PATCH`, cambiar solo el cargo a un empleado con un teléfono viejo mal escrito (puesto por SQL) responde 200;
   - en `PATCH`, `correo: null` responde 400;
   - `POST /usuarios` con el nombre de usuario `Ana López` responde 400.
   Comprobación: `npm test` del backend pasa completo.
4. **Reglas del frontend (sin el CUI).** `frontend/src/validaciones/campos.js` y `campos.test.js` con **la misma lista de casos** que el paso 2. En `CamposEmpleado.jsx`, los mensajes por campo al salir de él y el correo obligatorio; en las dos páginas, el botón deshabilitado y el nombre de usuario en minúsculas. En las pruebas de `PaginaRegistrarPersonal` y `PaginaEditarUsuario`: escribir nombres `123` y salir del campo muestra el mensaje y deshabilita el botón; corregirlo lo habilita; sin correo, "Registrar" está deshabilitado; en la edición, un teléfono viejo mal escrito no deshabilita "Guardar cambios" si no se tocó. Comprobación: `npm test` del frontend pasa.
5. **Clave y huella.** `CUI_HMAC_CLAVE` en `.env.example` y en `entorno.js`, con el mínimo de 32 caracteres. `cui.service.js` con `huellaCui`. `tests/cui.test.js`: el mismo CUI escrito con espacios y sin ellos da la misma huella; con otra clave da otra; la huella tiene 64 caracteres hexadecimales. Comprobación: la API no arranca con una clave de 31 caracteres ni sin ella, y sí con la clave del equipo; `npm test` del backend pasa.
6. **Base de datos y CUI en el backend.** **Pedir confirmación** antes de editar `backend/db/` y antes de correr el 07. Escribir el 07; actualizar el 01, el 03, la copia del 01 en `docs/`, `Diagrama Relacional.dbml` y `CONTEXTO BD.md` (v0.9). Correr el 07 **dos veces** en la base de prueba; `SHOW CREATE TABLE empleado` muestra `cui_hmac CHAR(64)` y `uq_empleado_cui`. En el mismo paso, para que la API no quede rota con la columna nueva, `usuarios.service.js` pasa a `cui_hmac`: `cui` en la entrada y en los cambios, `cuiRegistrado` en las respuestas, `CUI_DUPLICADO` en `verificarDuplicados` y en `DUPLICADOS`, y `cuiRegistrado` / `cuiReemplazado` en la bitácora. `CLAVES_SENSIBLES` agrega las tres claves, con un caso en `auditoria.test.js` que comprueba que se filtran. En `usuarios.test.js`, las pruebas que usaban `codigoEmpleado` se **ajustan** para usar `cui` (ninguna se quita) y se agregan, con el prefijo `vitest-hucui-` y borrado en `afterAll`:
   - `POST /empleados` sin `cui` responde 400;
   - con un CUI válido responde 201 con `cuiRegistrado: true` y sin `cui` ni huella;
   - en la base, `cui_hmac` tiene 64 caracteres hexadecimales y no contiene los dígitos del CUI;
   - un segundo empleado con el mismo CUI escrito con espacios responde 409 `CUI_DUPLICADO`;
   - la fila `CREAR` de la bitácora no contiene el CUI ni la huella y tiene `cuiRegistrado: true`;
   - en `PATCH`, registrar un CUI a un empleado sin CUI deja `cuiRegistrado` de `false` a `true` en la bitácora;
   - reemplazar el CUI deja `cuiReemplazado: true`, y enviar el mismo CUI responde 200 sin fila nueva;
   - `cui: null` y `codigoEmpleado` en el cuerpo responden 400.
   Los CUI de las pruebas son ficticios, se arman con un correlativo al azar y su verificador calculado, para no chocar entre corridas. Comprobación: `npm test` del backend pasa completo.
7. **CUI en el frontend.** En `CamposEmpleado.jsx`, el campo "CUI (DPI)" con su texto de ayuda, el Badge "Registrado" y "Reemplazar CUI"; en `PaginaRegistrarPersonal.jsx`, `cui` obligatorio; en `PaginaEditarUsuario.jsx`, `TEXTOS_OPCIONALES` sin `codigoEmpleado` y `cui` solo si se escribió. En las pruebas: el registro envía `cui` y no `codigoEmpleado`; un CUI con el verificador mal muestra el mensaje y deshabilita "Registrar"; un empleado con `cuiRegistrado: true` muestra el Badge y no el campo; "Reemplazar CUI" muestra el campo vacío y "Cancelar" lo oculta; sin escribir un CUI, `editarEmpleado` no recibe `cui`; un 409 `CUI_DUPLICADO` muestra su `mensaje`. Comprobación: `npm test` del frontend pasa completo.
8. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright:
   - registrar a una persona con nombres de varias palabras y un apóstrofo, y un teléfono con `+502`, y ver en la edición el teléfono como `NNNN-NNNN`;
   - intentar registrar a otra con el mismo CUI y ver el 409;
   - escribir nombres `123` y ver el mensaje;
   - editar a un empleado antiguo, registrarle el CUI y ver el Badge "Registrado";
   - revisar en `bitacora` que no aparecen ni el CUI ni la huella.
   Agregar notas a HU-04 y HU-05 en `HISTORIAS_DE_USUARIO.md`, la carpeta `validaciones/` a la sección 4 de `AGENTS.md` y a "Notas de contexto" de `CLAUDE.md`: qué es `CUI_HMAC_CLAVE` y que debe ser la misma para todo el equipo; que después del 01 se corren el 05 y el 06 (y que el 07 solo sirve para bases que ya existían); que las reglas de formato están duplicadas en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js` y un cambio va en las dos.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `cui`, `cuiRegistrado`, el correo obligatorio, los patrones de los campos, el nombre de usuario nuevo y `CUI_DUPLICADO`, ya no menciona `codigoEmpleado` ni `CODIGO_EMPLEADO_DUPLICADO`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ninguna prueba, y no deja empleados de prueba en la base.
- [ ] Las pruebas de las reglas del backend y del frontend usan la misma lista de casos válidos e inválidos.
- [ ] Correr el 07 dos veces en la base de prueba no falla, y después `SHOW CREATE TABLE empleado` muestra `cui_hmac CHAR(64)` y `uq_empleado_cui`, sin `codigo_empleado`.
- [ ] El 01, su copia en `docs/` y `Diagrama Relacional.dbml` tienen `cui_hmac` y `uq_empleado_cui`, y `CONTEXTO BD.md` está en la v0.9 con la línea nueva sobre el DPI.
- [ ] La API no arranca sin `CUI_HMAC_CLAVE` ni con una de menos de 32 caracteres.
- [ ] `POST /empleados` sin `cui` o sin `correo` responde 400; con nombres `123`, un teléfono `9551-1001` o un correo `ana@` responde 400 con el mensaje de la regla, y no crea nada.
- [ ] `POST /empleados` acepta `María de los Ángeles`, `B'alam` y `Pérez-Gómez`, guarda `+502 5551 1001` como `5551-1001` y el correo en minúsculas.
- [ ] Un CUI con el verificador mal, con residuo 10, con el departamento `23` o con 12 dígitos responde 400; uno válido escrito con espacios se acepta.
- [ ] `POST /empleados` con un CUI válido responde 201 con `cuiRegistrado: true`, y ninguna respuesta de la API contiene el CUI ni la huella.
- [ ] En la base, `cui_hmac` tiene 64 caracteres hexadecimales y no contiene los dígitos del CUI.
- [ ] Un segundo empleado con el mismo CUI, escrito de otra forma, responde 409 `CUI_DUPLICADO`.
- [ ] `PATCH /empleados/{id}` valida solo los campos que llegan: cambiar el cargo de un empleado con un teléfono viejo mal escrito responde 200.
- [ ] `PATCH /empleados/{id}` con `cui: null`, `correo: null` o `codigoEmpleado` responde 400.
- [ ] `POST /usuarios` con un nombre de usuario fuera de `^[a-z0-9._-]{4,50}$` responde 400.
- [ ] Ninguna fila de la bitácora contiene el CUI ni la huella; al crear queda `cuiRegistrado: true`, al registrar un CUI queda `cuiRegistrado` de `false` a `true` y al reemplazarlo queda `cuiReemplazado: true`.
- [ ] Enviar el mismo CUI que ya estaba registrado responde 200 sin fila nueva en la bitácora.
- [ ] En "Registrar personal", el campo "CUI (DPI)" y el correo son obligatorios, y no hay campo "Código de empleado".
- [ ] En el frontend, un campo inválido muestra su mensaje debajo al salir de él, y "Registrar" o "Guardar cambios" queda deshabilitado hasta corregirlo.
- [ ] Al editar un empleado con CUI se ve el Badge "Registrado" y no el campo; "Reemplazar CUI" muestra el campo vacío; un empleado sin CUI muestra el campo vacío y opcional.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-04 y HU-05 tienen una nota sobre el ajuste, `AGENTS.md` incluye `validaciones/` en la estructura y `CLAUDE.md` tiene las notas de contexto.

## Decisiones

- **Sí:** un spec de ajustes, sin historia nueva, con `**Historia:** ninguna; ajustes a HU-04 y HU-05`. La asesoría pidió cambios a historias ya implementadas; los SPEC 07 y 08 no se reescriben.
- **Sí:** el archivo `11-fix-validacion-campos-empleado-y-cui.md` y la rama `spec-11-fix-validacion-campos-empleado-y-cui`. El prefijo `fix` indica que no es una historia nueva.
- **Sí:** el CUI identifica a la persona. **No:** `codigo_empleado`, porque hay personas con dos códigos, uno cambia seguido y el personal contratado usa códigos de otro tipo.
- **Sí:** guardar solo la huella HMAC-SHA256. **No:** el CUI en claro, porque `CONTEXTO BD.md` no permite guardar el DPI. **No:** SHA-256 sin clave, porque el CUI tiene pocas combinaciones y se podría revertir.
- **Sí:** reutilizar la columna `codigo_empleado`, renombrada a `cui_hmac` y con otro tipo. Cambia lo menos posible la base.
- **Sí:** el CUI es obligatorio al crear y opcional al editar. Los empleados que ya existen quedan sin CUI hasta que alguien lo registre.
- **No:** borrar un CUI registrado (`cui: null` responde 400). Se puede reemplazar, no quitar.
- **Sí:** dígito verificador (módulo 11, residuo 10 inválido) y departamento entre 01 y 22. Detectan cualquier dígito mal escrito del correlativo y el intercambio de dos dígitos vecinos. Decidido por el equipo al escribir el spec, con la condición de probarlo con CUI reales antes de aprobar.
- **No:** validar el municipio contra el número de municipios de cada departamento. Obligaría a mantener una tabla que cambia cuando se crean municipios nuevos, y no sale de una fuente oficial.
- **Sí:** la huella va en `modulos/usuarios/cui.service.js` y no en `validaciones/campos.js`, que es una copia exacta en los dos paquetes y no debe conocer la clave.
- **Sí:** `CUI_HMAC_CLAVE` obligatoria y de al menos 32 caracteres. Así nadie usa por error una clave de prueba corta.
- **Sí:** la clave la genera y la comparte Luis, y es la misma para todo el equipo. Con otra, los CUI guardados no coinciden.
- **Sí:** el correo es obligatorio al crear y no se puede borrar al editar. Decidido por el equipo al escribir el spec. Un empleado antiguo sin correo se puede seguir editando en otros campos sin agregarlo.
- **No:** limitar el correo a un dominio. El personal usa correos personales (Gmail y otros), porque no tiene un correo institucional individual.
- **Sí:** las reglas en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, duplicadas y con la misma lista de casos en sus pruebas. Los dos paquetes no comparten código, y la carpeta queda lista para los formularios de otros módulos.
- **Sí:** `PATCH` valida solo los campos que llegan. Un empleado con datos viejos que no cumplen la regla se puede editar en otro campo, y los datos viejos no se migran.
- **Sí:** un formato mal escrito responde 400 `ENTRADA_INVALIDA`, no 422. Es la convención de `INSTRUCCIONES_BACKEND.md` para datos mal formados.
- **Sí:** el teléfono se guarda como `NNNN-NNNN`, igual que los datos actuales del 03.
- **Sí:** la regla del nombre de usuario solo se aplica al crear la cuenta. Las cuentas que ya existen no se revisan.
- **Sí:** el `UPDATE` que vacía `codigo_empleado` en el 07 no pasa por la bitácora. Es una migración, no una acción de un usuario.
- **Sí:** el script 07 y el cambio de `usuarios.service.js` a `cui_hmac` van en el mismo paso del plan, para que la API no quede rota con la columna renombrada.
- **Sí:** correr el 07 en la base de prueba compartida sin coordinarlo con el equipo. El 2026-10-22, nadie usa la API desde `main`, que todavía depende de `codigo_empleado`.
- **Sí:** `cuiReemplazado: true` en la bitácora cuando cambia la huella. `diferencias` no ve el reemplazo, porque `cuiRegistrado` sigue en `true`.
- **Sí:** `cui`, `cuiHmac` y `cui_hmac` en `CLAVES_SENSIBLES`, además de no pasarlos a la bitácora. Dos protecciones contra el mismo error.
- **Sí:** al editar un empleado con CUI, el campo se oculta y se muestra el Badge "Registrado" con "Reemplazar CUI". El sistema no puede mostrar el CUI guardado.
- **Sí:** en `openapi.yaml`, el `pattern` solo va en `nombreUsuario`. Nombres, teléfono, correo y CUI llevan la regla en la descripción (esquemas `TextoNombres`, `TextoCui`, `TextoCargo`, `TextoCorreo` y `TextoTelefono`): la API acepta espacios dobles, `+502` y guiones, y un `pattern` sobre el valor crudo rechazaría entradas válidas. Decidido durante la implementación.
- **Sí:** el ejemplo del CUI de la propuesta (`2345 67890 1201`) no cumplía el dígito verificador; se corrigió a `2345 67899 1201` en este spec y en el contrato. Decidido durante la implementación.
- **Sí:** las reglas normalizan el texto a NFC antes de validar, para que una tilde escrita como carácter aparte no haga fallar un nombre. Un valor que no es texto recibe el mensaje de formato del campo, y un texto demasiado largo, "{Campo}: como máximo N caracteres.", el formato que ya usaba `usuarios.service.js`. Decidido durante la implementación.
- **Sí:** `codigoEmpleado` en `POST` o `PATCH /empleados` responde 400 con "El código de empleado ya no se usa; envíe el CUI.". Decidido durante la implementación.
- **Sí:** en el frontend, el mensaje de un campo aparece la primera vez que se sale de él; desde entonces se actualiza mientras se escribe y se quita al corregirlo. El estado `reemplazandoCui` lo guarda `PaginaEditarUsuario` para cerrarlo después de guardar. Decidido durante la implementación.
- **Sí:** la clave `CUI_HMAC_CLAVE` del equipo la generó el agente con `crypto.randomBytes(32)` directamente en el `backend/.env` de Luis, sin mostrarla; Luis la reparte desde ahí. Decidido durante la implementación.
- **Sí:** `AGENTS.md` también actualiza la versión del modelo a MySQL v0.9 en la sección 2, además de agregar `validaciones/`. Decidido durante la implementación.
- **Sí:** la verificación manual registró a "María de los Ángeles B'alam Pérez-Gómez" (`prueba.spec11@prueba.sircova.local`, sin cuenta), que queda en la base de prueba, y registró un CUI y un teléfono a la cuenta `prueba.hu05` del SPEC 08. Los dos CUI son ficticios. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El dígito verificador rechaza un CUI real | El equipo lo prueba en local con sus CUI antes de aprobar; si alguno falla, se quita el verificador y se anota en las decisiones. |
| Un integrante usa otra clave y los CUI no coinciden | La clave la reparte una sola persona y la nota de contexto lo advierte. Las pruebas crean y comparan con la misma clave, así que pasan igual. |
| Falta `CUI_HMAC_CLAVE` en el `.env` de un integrante | La API y las pruebas no arrancan y el error lo nombra. Se avisa al equipo al integrar el spec. |
| Los datos actuales no cumplen las reglas nuevas | `PATCH` valida solo los campos que llegan; los datos viejos no se migran. |
| Un correo viejo con mayúsculas y el mismo en minúsculas se registran como dos | La intercalación de MySQL compara sin distinguir mayúsculas, así que `uq_empleado_correo` responde `CORREO_DUPLICADO` igual. |
| Las reglas del frontend y del backend se separan con el tiempo | Las dos pruebas usan la misma lista de casos; la nota de contexto pide cambiar las dos. |
| Recrear la base sin el 07 deja la columna vieja | Desde este spec el 01 ya trae `cui_hmac`; el 07 solo sirve para bases que ya existen. |
| Un CUI real termina en el repositorio o en la bitácora | Las pruebas usan CUI ficticios generados; las claves del CUI están en `CLAVES_SENSIBLES` y una prueba revisa la fila `CREAR`. |
| Las pruebas de los SPEC 07 y 08 se rompen con el correo y el CUI obligatorios | Se ajustan para enviarlos; no se quita ningún caso. |

## Lo que **no** entra en este spec

- Validar los formularios de otros módulos.
- Validar el municipio del CUI.
- Consultar el CUI en el RENAP o en otro servicio externo.
- Mostrar, exportar o buscar por CUI.
- Pedir el CUI o el correo a los empleados que ya existen, o corregir sus datos viejos.
- Revisar los nombres de usuario que ya existen.
- Contraseñas, bloqueo y restablecimiento.

Cada uno, si se hace, va en su propio spec.
