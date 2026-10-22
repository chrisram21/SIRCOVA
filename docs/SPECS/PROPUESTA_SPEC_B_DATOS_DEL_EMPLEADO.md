# Propuesta para el spec B · Datos del empleado: validación de campos y CUI

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo acordado por el equipo después de la asesoría del 2026-10-21. No es el spec: el spec se escribe en `specs/NN-slug.md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historias:** ajustes a HU-04 (registrar personal) y HU-05 (editar empleado). No hay historia nueva.
> **Depende de:** los SPEC 05, 07 y 08. Se recomienda hacerlo **después del spec A**, porque los dos tocan `usuarios.service.js`, `PaginaRegistrarPersonal.jsx` y sus pruebas. No depende de HU-03.
> **Rama sugerida:** `spec-NN-hu-04-validacion-y-cui-del-empleado`, desde `main`.
> **Toca una zona protegida:** cambia una columna de `empleado`. Necesita autorización expresa antes de editar y antes de correr cualquier script de `backend/db/`.

## 1. Por qué existe

En la asesoría se pidieron dos cosas:

1. No permitir empleados repetidos.
2. Validar que los campos del personal estén bien escritos.

El equipo decidió:

- **Lo que identifica a una persona es el CUI del DPI**, guardado solo como **huella HMAC-SHA256**, nunca en claro. `codigo_empleado` no sirve para esto: según la DDRISS, algunas personas tienen dos códigos, uno de ellos cambia seguido y el personal contratado tiene códigos de otro tipo. No se puede reunir esa información.
- **Se reutiliza la columna `codigo_empleado`**, renombrada y con otro tipo, para cambiar lo menos posible la base de datos.
- **El CUI es obligatorio para los empleados nuevos.** Los que ya existen quedan sin CUI (`NULL`) hasta que alguien lo registre al editarlos.
- **El correo y el CUI no se pueden repetir.** El correo **no se limita a un dominio**: el personal de la DDRISS y de los establecimientos usa correos personales (Gmail y otros), porque no tiene un correo institucional individual.
- **La clave del HMAC** (`CUI_HMAC_CLAVE`) la genera y la guarda Luis. Se comparte con el equipo por un medio seguro, cada integrante la pone en su `backend/.env` y nunca se sube al repositorio. Todos deben usar la **misma** clave, porque con otra los CUI guardados ya no coinciden.
- **Validación de formato** de los campos de texto del personal, con reglas que se puedan reutilizar en los formularios que vengan después.

## 2. Por qué una huella y no el CUI

- `CONTEXTO BD.md` dice: "No guarda DPI ni otros datos personales innecesarios". La huella permite comprobar que el CUI no se repite sin guardar el número. La documentación cambia esa línea a "No guarda el DPI; solo una huella HMAC del CUI para evitar empleados repetidos".
- Se usa HMAC (con clave secreta) y no un SHA-256 simple porque el CUI tiene pocas combinaciones posibles. Sin clave, cualquiera con acceso a la base podría calcular las huellas de todos los CUI y descubrir los números.
- No rompe la regla 1 de `AGENTS.md`: el CUI es del personal, no de pacientes.
- **Consecuencia:** el sistema nunca puede mostrar el CUI de alguien. Solo indica si está registrado (`cuiRegistrado`) y permite reemplazarlo.

## 3. Lo que ya existe y hay que tener en cuenta

| Dónde | Qué hay hoy |
|---|---|
| `backend/db/01_modelo_relacional_mysql.sql` | `codigo_empleado VARCHAR(20) NULL` con `UNIQUE KEY uq_empleado_codigo`. `correo VARCHAR(150) NULL` con `uq_empleado_correo` |
| `backend/db/03_datos_prueba_mysql.sql` | Los empleados de prueba tienen códigos `EMP-0001`… y teléfonos con el formato `5551-1001`. Hay apellidos de varias palabras (`Chávez de León`) |
| `docs/base-de-datos/diseño_bd/01_modelo_relacional_mysql.sql` | Copia del script 01 en la documentación. Hay que mantenerla igual o dejar anotado que no se actualiza |
| `usuarios.service.js` | `leerEmpleado` valida solo que el campo exista y su largo; el correo solo con `includes('@')`. `NOMBRE_USUARIO = /^\S{3,50}$/`. `verificarDuplicados` revisa el correo y `codigo_empleado`. `traducirDuplicado` convierte el `ER_DUP_ENTRY` por nombre de índice |
| Errores | Un formato mal escrito responde 400 `ENTRADA_INVALIDA` con un mensaje que nombra el campo (`INSTRUCCIONES_BACKEND.md`: 400 = datos mal formados, 422 = regla del negocio). Se mantiene esa convención. Duplicados: 409 `CORREO_DUPLICADO` y `CODIGO_EMPLEADO_DUPLICADO` |
| `backend/src/config/entorno.js` | Lista `obligatorias` de variables de entorno; si falta una, la API no arranca |
| Frontend | `CamposEmpleado.jsx` (compartido por el registro y la edición), `PaginaRegistrarPersonal.jsx`, `PaginaEditarUsuario.jsx` (`TEXTOS_OPCIONALES` incluye `codigoEmpleado`) y sus pruebas |
| Otros documentos con `codigo_empleado` | `backend/openapi.yaml`, `CONTEXTO BD.md`, `specs/07-…` y `specs/08-…`. Los specs ya implementados **no se reescriben**; el spec nuevo dice qué reemplaza |

## 4. Bloques

### B1. Validación de formato de los campos (no cambia la base de datos)

**Dónde viven las reglas.** Hay un módulo de reglas en el backend y uno equivalente en el frontend, cada uno con sus pruebas, porque son dos paquetes distintos y no comparten código. Cada regla es una función pura que limpia el valor y devuelve el valor limpio o un error. El spec define las carpetas, porque ninguna de las dos existe en la estructura de `AGENTS.md`. Propuesta: `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`. Si el equipo prefiere otra ubicación, se cambia aquí y en `AGENTS.md`.

**Reglas.** Todas quitan los espacios de los extremos y reducen los espacios dobles a uno.

| Campo | Regla | Ejemplos válidos | Ejemplos inválidos |
|---|---|---|---|
| Nombres, apellidos | `^\p{L}+(?:[ '’-]\p{L}+)*$` con la bandera `u`; 1 a 100 caracteres. Letras con tildes, ñ y ü; varias palabras separadas por espacio, apóstrofo o guion. No se exige un número fijo de palabras | `María de los Ángeles`, `Chávez de León`, `B'alam`, `Pérez-Gómez` | `123`, `.-.{p´p.`, `Juan2`, `' Ana` |
| Cargo | Opcional. Empieza con letra; letras, espacios y `. , ( ) / -`; al menos 2 letras; hasta 100 caracteres | `Enf. auxiliar (TSR)`, `Estadígrafa` | `123`, `---` |
| Teléfono | Opcional. Al escribirlo acepta `+502`, espacios y guiones; sin ellos deben quedar **8 dígitos** que empiecen con 2 a 7. Se guarda como `NNNN-NNNN`, igual que los datos actuales | `5551-1001`, `+502 5551 1001`, `55511001` | `1234`, `9551-1001`, `5551-10012` |
| Correo | Opcional. `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`; se guarda en minúsculas; hasta 150. **Cualquier dominio** | `ana.lopez@gmail.com` | `ana@`, `ana lopez@gmail.com` |
| CUI | Ver B2 | | |
| Nombre de usuario (solo al crear la cuenta) | `^[a-z0-9._-]{4,50}$`. El frontend lo pasa a minúsculas mientras se escribe. Las cuentas que ya existen no se revisan | `ana.lopez`, `cs-1201` | `Ana López`, `ab` |

**Dónde se aplican**
- `POST /empleados`: todos los campos.
- `PATCH /empleados/{id}`: **solo los campos que llegan en el cuerpo**. Así un empleado con datos viejos que no cumplen la regla todavía se puede editar en otro campo.
- `POST /usuarios`: el nombre de usuario.

En el frontend se aplican las mismas reglas: el mensaje aparece debajo del campo al salir de él, y "Guardar" o "Registrar" queda deshabilitado mientras haya un campo inválido. El backend sigue siendo el que decide.

**Mensajes.** Son en español y nombran el campo. Por ejemplo: "Los nombres solo pueden tener letras, espacios, apóstrofos y guiones." o "El teléfono debe tener 8 dígitos."

**Verificación**
- Pruebas unitarias de cada regla, en el backend y en el frontend, con los ejemplos de la tabla. Las dos listas de casos deben ser **las mismas**, para que el frontend no acepte lo que el backend rechaza.
- `usuarios.test.js`:
  - `POST /empleados` con nombres `123` responde 400 y no crea nada;
  - el teléfono `+502 5551 1001` se guarda como `5551-1001`;
  - el correo con mayúsculas se guarda en minúsculas;
  - en `PATCH`, cambiar solo el cargo a un empleado con un teléfono viejo mal escrito responde 200.
- Pruebas de `CamposEmpleado`, `PaginaRegistrarPersonal` y `PaginaEditarUsuario`: el mensaje aparece y el botón queda deshabilitado.

### B2. CUI guardado como HMAC (cambia la base de datos)

**Modelo de datos** (zona protegida)
- Un script nuevo, `backend/db/07_cui_empleado_mysql.sql`, **idempotente** como el 05. MySQL no tiene `IF EXISTS` para renombrar columnas, así que el script revisa `information_schema` antes de cada cambio.
  1. `UPDATE empleado SET codigo_empleado = NULL`: los valores actuales son códigos, no huellas, y no sirven. Este UPDATE no pasa por la bitácora, porque es una migración y no una acción de un usuario; el spec debe dejarlo escrito.
  2. Renombrar `codigo_empleado` → `cui_hmac` y cambiarla a `CHAR(64) NULL` con el comentario "HMAC-SHA256 en hexadecimal del CUI (13 dígitos); nunca el CUI".
  3. Renombrar el índice `uq_empleado_codigo` → `uq_empleado_cui`.
- Actualizar el script 01 (para que una base recreada ya nazca con `cui_hmac`), el 03 (los empleados de prueba quedan con `cui_hmac` en `NULL`, porque SQL no puede calcular el HMAC sin la clave) y su copia en `docs/base-de-datos/diseño_bd/`.
- La columna es `NULL` en la base y la API la exige al crear. Esa regla la valida el backend, igual que "solo AUTORIDAD puede no tener DDRISS".
- `CONTEXTO BD.md` pasa a la v0.9: la columna nueva, la línea sobre el DPI y el porqué.
- Después de recrear la base con el 01 hay que volver a correr el 05, el 06 y el 07; queda anotado en "Notas de contexto" de `CLAUDE.md`.

**Clave**
- Variable nueva `CUI_HMAC_CLAVE` en `backend/.env.example` (sin valor) y en la lista `obligatorias` de `entorno.js`. La API no arranca sin ella; se recomienda exigir al menos 32 caracteres.
- Se genera una vez, por ejemplo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, y la comparte Luis. El despliegue (HU-56 y HU-57) también la necesita.
- **Si la clave se pierde o se cambia, las huellas guardadas ya no se pueden comparar.** Habría que borrarlas y volver a registrar los CUI. Por eso no se cambia, salvo que se haya filtrado.

**Validar el CUI** (en `campos.js`, backend y frontend)
- Al escribirlo se aceptan espacios y guiones (`2345 67890 1201`); sin ellos deben quedar **13 dígitos**.
- Estructura: 8 dígitos de correlativo, 1 dígito verificador, 2 de departamento y 2 de municipio.
- Dígito verificador: se suma cada uno de los 8 primeros dígitos multiplicado por su posición + 1 (el primero por 2, el segundo por 3…). El residuo de dividir esa suma entre 11 debe ser igual al 9.º dígito.
- Departamento entre `01` y `22`, y municipio entre `01` y el número de municipios de ese departamento.
- **Ojo:** este algoritmo y la tabla de municipios por departamento salen de implementaciones conocidas, no de una publicación oficial del RENAP. Hay municipios creados en años recientes. Antes de aprobar el spec, el equipo debe probar la regla con varios CUI reales, **en local y sin subirlos**. Si alguno válido no pasa, se deja solo la validación de 13 dígitos y del departamento, y se anota en las decisiones del spec.
- La huella se calcula sobre los 13 dígitos limpios: `crypto.createHmac('sha256', CUI_HMAC_CLAVE).update(cui).digest('hex')`. Así `2345 67890 1201` y `2345678901201` dan la misma.

**API**
- `EmpleadoEntrada` (`POST /empleados`): `cui` **obligatorio**; ya no tiene `codigoEmpleado`.
- `EmpleadoCambios` (`PATCH /empleados/{id}`): `cui` opcional, para registrarlo o reemplazarlo. `cui: null` responde 400, porque una vez registrado no se borra. `codigoEmpleado` ya no se acepta (400).
- `Empleado` (respuestas): quita `codigoEmpleado` y agrega `cuiRegistrado: boolean`. **Nunca** devuelve el CUI ni la huella.
- Si el CUI ya existe: 409 `CUI_DUPLICADO`, "Ya hay un empleado registrado con ese CUI.". Se revisa antes del INSERT o UPDATE y también se traduce desde el `ER_DUP_ENTRY` del índice `uq_empleado_cui`. `CODIGO_EMPLEADO_DUPLICADO` desaparece del contrato.
- El correo sigue único (409 `CORREO_DUPLICADO`) y opcional. Si el equipo quiere que sea obligatorio, se decide al escribir el spec.

**Bitácora**
- `cui`, `cuiHmac` y `cui_hmac` se agregan a `CLAVES_SENSIBLES`. Es una segunda protección: la bitácora no debe recibir ni el CUI ni su huella.
- Al crear, `valoresNuevos` lleva `cuiRegistrado: true`.
- Al editar:
  - si se registra un CUI donde no había, `diferencias` da `cuiRegistrado: false → true`;
  - si se **reemplaza** uno que ya había, `cuiRegistrado` sigue en `true` y `diferencias` no vería el cambio. Por eso, cuando la huella nueva es distinta de la guardada, se agrega `cuiReemplazado: true` a `valoresNuevos`. Si la huella es la misma, no hay cambio y no se registra nada.

**Frontend**
- En `CamposEmpleado.jsx`, el campo "Código de empleado" se reemplaza por "CUI (DPI)": `inputMode="numeric"`, 13 dígitos (acepta espacios) y el texto de ayuda "Se usa solo para evitar registros repetidos; el sistema no lo muestra después.".
  - **Registro:** obligatorio (*).
  - **Edición con CUI registrado:** muestra un Badge "Registrado" y el botón "Reemplazar CUI", que habilita el campo vacío.
  - **Edición sin CUI** (empleados antiguos): el campo está vacío y es opcional.
- En `PaginaEditarUsuario.jsx`, `TEXTOS_OPCIONALES` ya no incluye `codigoEmpleado`, y `cui` se envía solo si se escribió.
- Con el 409 `CUI_DUPLICADO` se muestra el `mensaje` del backend, como los demás errores.

**Verificación**
- Pruebas unitarias del validador del CUI: CUI ficticios armados para cumplir el algoritmo, uno con el verificador mal, uno con el departamento `23`, uno con 12 dígitos y uno con espacios.
- Prueba de la huella: el mismo CUI escrito de dos formas da la misma huella, y con otra clave da otra.
- `usuarios.test.js` (prefijo `vitest-hucui-`, borrado en `afterAll`):
  - `POST /empleados` sin `cui` responde 400;
  - con un CUI válido responde 201 con `cuiRegistrado: true` y sin `cui`;
  - en la base `cui_hmac` tiene 64 caracteres hexadecimales y no contiene los dígitos del CUI;
  - un segundo empleado con el mismo CUI escrito con espacios responde 409 `CUI_DUPLICADO`;
  - la fila `CREAR` de la bitácora no tiene ni el CUI ni la huella;
  - en `PATCH`, reemplazar el CUI deja `cuiReemplazado: true` en la bitácora, y enviar el mismo CUI responde 200 sin fila nueva;
  - `codigoEmpleado` en el cuerpo responde 400.
- El script 07 se corre **dos veces** en la base de prueba, sin errores; después, `SHOW CREATE TABLE empleado` muestra `cui_hmac CHAR(64)` y `uq_empleado_cui`.
- Las pruebas de los SPEC 07 y 08 que usaban `codigoEmpleado` se **ajustan** para usar `cui`; no se quita ningún caso.

## 5. Contrato (`backend/openapi.yaml`, antes de programar)

- `Empleado`, `EmpleadoEntrada` y `EmpleadoCambios` según B2. Los `pattern` de B1 van en los esquemas cuando OpenAPI los pueda expresar, y la descripción explica las normalizaciones (teléfono, correo, CUI).
- `UsuarioEntrada.nombreUsuario` con el patrón nuevo.
- Errores: 409 `CUI_DUPLICADO`; desaparece `CODIGO_EMPLEADO_DUPLICADO`.

**Comprobación:** `/api/docs` carga sin errores.

## 6. Zonas protegidas (piden autorización expresa en el spec)

| Qué | Por qué |
|---|---|
| `backend/db/01`, `03`, el `07` nuevo y la copia en `docs/base-de-datos/diseño_bd/` | Cambio del modelo (columna e índice). **Pedir confirmación antes de editar y antes de correr el 07** |
| `CONTEXTO BD.md` | Nueva versión del modelo (v0.9) |
| `CLAVES_SENSIBLES` | Cambia lo que se guarda en la bitácora |
| `backend/.env.example` y `entorno.js` | Variable obligatoria nueva. Sin ella en el `.env` de cada integrante, la API y las pruebas no arrancan |

No agrega dependencias: `crypto` viene con Node.

## 7. Archivos que se tocan (aproximado)

```
backend/
├── .env.example                              ← CUI_HMAC_CLAVE=
├── openapi.yaml
├── db/01_modelo_relacional_mysql.sql, 03_datos_prueba_mysql.sql, 07_cui_empleado_mysql.sql (nuevo)
├── src/config/entorno.js
├── src/validaciones/campos.js (nuevo; ubicación por confirmar)
├── src/modulos/auditoria/auditoria.service.js ← CLAVES_SENSIBLES
├── src/modulos/usuarios/usuarios.service.js  ← leerEmpleado, verificarDuplicados, DUPLICADOS, respuestas
└── tests/ usuarios.test.js, auditoria.test.js, prueba de campos.js
frontend/src/
├── validaciones/campos.js (nuevo; ubicación por confirmar) (+ test)
└── paginas/usuarios/CamposEmpleado.jsx, PaginaRegistrarPersonal.jsx, PaginaEditarUsuario.jsx (+ tests)
docs/base-de-datos/CONTEXTO BD.md, docs/base-de-datos/diseño_bd/01_modelo_relacional_mysql.sql
docs/SPECS/HISTORIAS_DE_USUARIO.md            ← avance de HU-04 y HU-05
AGENTS.md                                     ← solo si se agrega la carpeta validaciones/ a la estructura
CLAUDE.md                                     ← notas de contexto
```

## 8. Verificación final (sección 8 de `AGENTS.md`)

1. Con autorización, correr el 07 dos veces en la base de prueba de Aiven.
2. `npm test` pasa en `backend/` y `frontend/` sin desactivar pruebas, y no deja empleados de prueba en la base.
3. Con Playwright, contra Aiven:
   - registrar a una persona con nombres de varias palabras y un apóstrofo, y un teléfono con `+502`;
   - intentar registrar otra con el mismo CUI y ver el 409;
   - intentar nombres `123` y ver el mensaje;
   - editar a un empleado antiguo y registrarle el CUI;
   - revisar en `bitacora` que no aparecen el CUI ni la huella.
4. Actualizar HU-04 y HU-05 en `HISTORIAS_DE_USUARIO.md`. Agregar a "Notas de contexto" de `CLAUDE.md`:
   - qué es `CUI_HMAC_CLAVE` y que debe ser la misma para todo el equipo;
   - que después del 01 se corren el 05, el 06 y el 07;
   - dónde están las reglas de `campos.js`.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un integrante usa otra clave y los CUI no coinciden | La clave la reparte una sola persona; la nota de contexto lo advierte. Las pruebas crean y comparan con la misma clave, así que pasan igual |
| La regla del dígito verificador rechaza un CUI real | Se prueba con CUI reales antes de aprobar (sección B2); si falla, se relaja la regla |
| Los datos actuales no cumplen las reglas nuevas | `PATCH` valida solo los campos que llegan; los datos viejos no se migran |
| Las reglas del frontend y del backend se separan con el tiempo | Las dos pruebas usan la misma lista de casos; si cambia una regla, se cambian las dos |
| Recrear la base sin el 07 deja la columna vieja | Desde este spec el 01 ya trae `cui_hmac`; el 07 solo sirve para bases que ya existen |
| Al reemplazar el CUI, la bitácora no lo registra | `cuiReemplazado: true` cuando cambia la huella; una prueba lo revisa |

## 10. Fuera de alcance

- Validar los formularios de otros módulos (establecimientos, población, etc.). Esos specs usan `campos.js` cuando lleguen.
- Consultar el CUI en el RENAP o en otro servicio externo.
- Mostrar, exportar o buscar por CUI.
- Volver a pedir el CUI a los empleados que ya existen.
- Contraseñas, bloqueo y restablecimiento (HU-03 y spec A).
