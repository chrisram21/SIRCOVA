# SPEC 77 — Ajuste HU-08 Registrar municipios en Territorio

> **Estado:** Implementado
> **Historia:** HU-08
> **Origen:** ajuste
> **Depende de:** SPEC 13, SPEC 14 y SPEC 59
> **Fecha:** 2026-11-26
> **Objetivo:** Que el Administrador registre, renombre, desactive y reactive municipios desde la tarjeta «Municipios» de Territorio, eligiendo uno de los 22 departamentos del INE, para poder agregar un municipio nuevo de San Marcos o uno de otro departamento donde haya un establecimiento externo.

## Por qué existe este spec

El SPEC 13 (HU-08) dejó los municipios como **solo consulta**: «no hay forma de borrarlos, editarlos ni desactivarlos». La semilla carga los 30 municipios de San Marcos, el `9999` «Migrantes / fuera de San Marcos» y Coatepeque (`0920`), y cualquier otro se tendría que insertar por SQL. Al revisar el sistema, el equipo decidió (2026-11-26) que conviene poder agregarlos desde la app, para dos casos:

- un municipio nuevo de San Marcos, si el INE crea uno (el último fue La Blanca, `1230`);
- un municipio de otro departamento donde haya un **establecimiento externo** que reporta a la DDRISS, como Coatepeque.

Este spec cambia la decisión del SPEC 13. Un municipio de fuera **no** pasa a ser una procedencia por sí solo: la regla de `alcance=procedencia` (sede, `9999` y los municipios de los establecimientos de la DDRISS) no cambia, y aparece en la procedencia cuando se le registra un establecimiento. Para la gente de fuera sin establecimiento sigue el `9999`.

Hoy solo hay tres departamentos (`12` San Marcos, `99` «No especificado / otro» y `09` Quetzaltenango), así que se siembran los 22 del INE.

**Lo que se decidió en la conversación previa y en la fase de preguntas (2026-11-26):**

- Un municipio de fuera sirve para registrar ahí un establecimiento externo. No cambia la regla de procedencia del SPEC 24.
- Se siembran los 22 departamentos del INE con un script nuevo e idempotente, `14_departamentos_mysql.sql`, y también en la semilla del `01`. No se crean departamentos desde la app.
- Se puede crear, renombrar, desactivar y reactivar. El código INE y el departamento no cambian (regla 6).
- Al desactivar, 409 si el municipio tiene distritos o establecimientos activos, o si está en una red activa. El personal (`empleado.municipio_id`) no bloquea.
- El `9999` no se renombra ni se desactiva. Los demás, incluidos los 30 de la semilla y Coatepeque, sí.
- Solo el Administrador, con `MUNICIPIO_CREAR` y `MUNICIPIO_EDITAR`.
- El código INE tiene 4 dígitos, y los dos primeros son el código del departamento. Un código repetido responde 409. El departamento `99` no se ofrece ni se acepta.
- La lista de departamentos sale de un endpoint nuevo, `GET /departamentos`.
- En la pantalla, un botón «Registrar municipio» en la tarjeta «Municipios», con un diálogo como el de los distritos, y acciones por fila.
- El mapa no entra: un municipio nuevo del departamento no se dibuja, porque no tiene forma en el GeoJSON. Solo se anota como riesgo, sin aviso en la pantalla.

## Alcance

**Entra:**

- `backend/openapi.yaml`: `GET /departamentos`, `POST /municipios`, `PATCH /municipios/{id}`, `POST /municipios/{id}/desactivar` y `POST /municipios/{id}/reactivar`. La descripción de `GET /municipios` deja de decir que los municipios no se crean desde la API.
- `backend/db/14_departamentos_mysql.sql` (nuevo): los 22 departamentos con `INSERT IGNORE`.
- `backend/db/01_modelo_relacional_mysql.sql`: los 22 departamentos en la semilla, sin cambiar los `id` 1 a 3.
- `backend/db/05_permisos_mysql.sql`: `MUNICIPIO_CREAR` y `MUNICIPIO_EDITAR`, asignados al Administrador.
- Backend: un servicio nuevo `backend/src/modulos/catalogos/municipios.service.js` (los cuatro endpoints de escritura y `GET /departamentos`), con sus rutas y su controlador en los archivos del módulo, y la bitácora.
- Validación del código INE y del nombre en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en `backend/tests/campos.test.js` y `frontend/src/validaciones/campos.test.js`.
- Frontend: `DialogoMunicipio.jsx` (nuevo), los cambios en `PaginaTerritorio.jsx` y las funciones nuevas de `frontend/src/api/catalogos.js`.
- Pruebas del backend (`backend/tests/municipios.test.js`, nuevo) y del frontend (`DialogoMunicipio.test.jsx`, nuevo, y `PaginaTerritorio.test.jsx`).
- Aplicar en Aiven el `14` y el `05` (con autorización).
- Notas en HU-08 de `HISTORIAS_DE_USUARIO.md`, en `backend/src/modulos/catalogos/CLAUDE.md` y en la tabla de `departamento` de `docs/base-de-datos/CONTEXTO BD.md`.

**No entra (para otros specs):**

- Crear, editar o desactivar departamentos o DDRISS.
- Cambiar la regla de procedencia (`alcance=procedencia`) o la del Excel 3 (`v_produccion_atribuida`).
- Cargar la forma de un municipio nuevo en el GeoJSON del mapa, o avisar en la pantalla que no se dibuja.
- Cambiar el código INE o el departamento de un municipio, o borrarlo.
- Crear distritos, redes o población de un municipio nuevo desde el mismo diálogo: se hacen después en sus pantallas.

## Modelo de datos

Este spec **no cambia el modelo**: no agrega tablas, columnas ni índices. Usa `departamento` y `municipio` del `01` y siembra datos.

### Departamentos (`14_departamentos_mysql.sql` y semilla del `01`)

| `codigo_ine` | `nombre` | | `codigo_ine` | `nombre` |
|---|---|---|---|---|
| `01` | Guatemala | | `12` | San Marcos (ya existe, `id` 1) |
| `02` | El Progreso | | `13` | Huehuetenango |
| `03` | Sacatepéquez | | `14` | Quiché |
| `04` | Chimaltenango | | `15` | Baja Verapaz |
| `05` | Escuintla | | `16` | Alta Verapaz |
| `06` | Santa Rosa | | `17` | Petén |
| `07` | Sololá | | `18` | Izabal |
| `08` | Totonicapán | | `19` | Zacapa |
| `09` | Quetzaltenango (ya existe, `id` 3) | | `20` | Chiquimula |
| `10` | Suchitepéquez | | `21` | Jalapa |
| `11` | Retalhuleu | | `22` | Jutiapa |

- `99` «No especificado / otro» (`id` 2) se queda, porque lo usa el `9999`, pero no se ofrece para crear municipios.
- En el `01`, los tres de hoy siguen primero y en el mismo orden (`12`, `99`, `09`), porque la semilla de `municipio` y `ddriss` usa los `id` 1 a 3. Los otros 20 van después.
- El `14` hace `INSERT IGNORE INTO departamento (codigo_ine, nombre) VALUES …` con los 22, y la llave única `uq_departamento_codigo` evita duplicados. No borra ni recrea nada, y se puede correr las veces que haga falta. Su encabezado sigue el formato de los scripts `07` a `12`.
- Los nombres y códigos son los oficiales del INE, y el equipo los revisa en este spec.

### Permisos (`05`)

```sql
('MUNICIPIO_CREAR',  'CONFIGURACION_CATALOGOS', 'Registrar municipios en el catálogo INE'),
('MUNICIPIO_EDITAR', 'CONFIGURACION_CATALOGOS', 'Renombrar, desactivar y reactivar municipios del catálogo INE')
```

Los dos se asignan solo a `ADMINISTRADOR`, con `INSERT IGNORE`, en un bloque «SPEC 77 (HU-08)». `MUNICIPIO_CONSULTAR` no cambia.

El catálogo de municipios es nacional, como el de vacunas: no tiene `ddriss_id`, y un Administrador puede registrar un municipio de cualquier departamento.

### API

**`GET /departamentos`** (permiso `MUNICIPIO_CONSULTAR`, sin parámetros; uno desconocido responde 400): los departamentos sin el `99`, por `codigo_ine`.

```json
[{ "id": 4, "codigoIne": "01", "nombre": "Guatemala" }, …]
```

**Municipio** (la respuesta de las cuatro escrituras tiene la forma de cada elemento de `GET /municipios`):

```json
{ "id": 33, "departamentoId": 3, "departamentoNombre": "Quetzaltenango",
  "codigoIne": "0915", "nombre": "Flores Costa Cuca", "activo": true }
```

| Endpoint | Permiso | Cuerpo | Respuesta |
|---|---|---|---|
| `POST /municipios` | `MUNICIPIO_CREAR` | `{ departamentoId, codigoIne, nombre }` | 201 y el municipio, activo |
| `PATCH /municipios/{id}` | `MUNICIPIO_EDITAR` | `{ nombre }` | 200 y el municipio |
| `POST /municipios/{id}/desactivar` | `MUNICIPIO_EDITAR` | sin cuerpo | 200 y el municipio |
| `POST /municipios/{id}/reactivar` | `MUNICIPIO_EDITAR` | sin cuerpo | 200 y el municipio |

**Validación y errores:**

| Código HTTP | `codigo` | Cuándo | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Un campo de más | «Campo no permitido: {nombre}.» |
| 400 | `ENTRADA_INVALIDA` | `codigoIne` o `departamentoId` en el `PATCH` | «{campo} no se puede cambiar.» |
| 400 | `ENTRADA_INVALIDA` | `departamentoId` no es un entero positivo | «departamentoId debe ser un número entero positivo.» |
| 400 | `ENTRADA_INVALIDA` | `codigoIne` no tiene 4 dígitos | «El código INE debe tener 4 dígitos.» |
| 400 | `ENTRADA_INVALIDA` | `nombre` vacío, con otros signos, o de menos de 3 o más de 80 caracteres | Los de `validarNombreMunicipio` (abajo) |
| 404 | `NO_ENCONTRADO` | El municipio del `{id}` no existe | «El municipio no existe.» |
| 409 | `MUNICIPIO_DUPLICADO` | Ya hay un municipio con ese `codigoIne`, activo o inactivo | «Ya hay un municipio con el código INE {codigo}.» |
| 409 | `MUNICIPIO_NOMBRE_DUPLICADO` | Ya hay un municipio del mismo departamento con ese nombre, activo o inactivo (sin mayúsculas ni tildes, por la intercalación) | «Ya hay un municipio con ese nombre en el departamento.» |
| 409 | `MUNICIPIO_ESPECIAL` | Renombrar o desactivar el `9999` | «El municipio Migrantes / fuera de San Marcos no se puede cambiar.» |
| 409 | `MUNICIPIO_EN_USO` | Desactivar con distritos o establecimientos activos, o en una red activa | «El municipio tiene {lista}; desactívelos o quítelo de la red primero.», con la lista armada con lo que tenga, por ejemplo «2 distritos activos y 1 establecimiento activo» o «la red activa Red No. 1» |
| 422 | `DEPARTAMENTO_INVALIDO` | `departamentoId` no existe o es el `99` | «El departamento no existe o no admite municipios.» |
| 422 | `CODIGO_INE_DEPARTAMENTO` | Los dos primeros dígitos de `codigoIne` no son el `codigo_ine` del departamento | «El código INE debe empezar con {codigo del departamento}, el código del departamento.» |

- El `nombre` se limpia de espacios, como en los distritos. Un `PATCH` con el mismo nombre responde 200 sin fila en la bitácora.
- Desactivar uno inactivo, o reactivar uno activo, responde 200 sin cambios ni bitácora, como en los distritos.
- El alta y la revisión de nombre van en una transacción, con `SELECT id FROM departamento WHERE id = ? FOR UPDATE`, para que dos altas a la vez con el mismo nombre no pasen las dos. Un `ER_DUP_ENTRY` de `uq_municipio_codigo` se responde como `MUNICIPIO_DUPLICADO`.

**Bitácora:** módulo `CONFIGURACION`, `entidad` `municipio`, `entidadId` el `id`. `CREAR` con `valoresNuevos`, `ACTUALIZAR` con `diferencias` del nombre, y `DESACTIVAR` o `REACTIVAR`, igual que `distritos.service.js`.

### Validación compartida (`campos.js`, backend y frontend)

- `validarCodigoIne(valor)`: quita los espacios y acepta `^\d{4}$`. Si no, «El código INE debe tener 4 dígitos.». Vacío: «El código INE es obligatorio.».
- `validarNombreMunicipio(valor)`: los mismos caracteres que el nombre del distrito (`NOMBRE_DISTRITO`: letras, números, espacios y `. - ( )`), de 3 a 80 caracteres (`LARGOS.nombreMunicipio: 80`, el largo de la columna). Mensajes: «El nombre del municipio es obligatorio.», «El nombre del municipio solo puede tener letras, números, espacios y los signos . - ( ).» y «El nombre del municipio debe tener entre 3 y 80 caracteres.».
- Los casos nuevos van en la tabla `CASOS` de las dos pruebas (nota de la raíz del 2026-10-22).
- Que el prefijo coincida con el departamento lo revisa solo el backend (422), porque necesita el código del departamento. El diálogo muestra el prefijo como ayuda (abajo).

### Pantalla «Territorio» (`PaginaTerritorio.jsx`)

- **Carga:** `listarMunicipios({ alcance: 'todos', incluirInactivos: true })` en lugar de `alcance: 'procedencia'`, para que un municipio de fuera recién creado, sin establecimiento, salga en la tabla. El orden es el de `alcance=todos` (departamento y nombre, con el `9999` al final). El filtro de municipios de la tarjeta «Distritos de salud» sigue con los del departamento sede (`municipiosSede`).
- **Tarjeta «Municipios»:**
  - La descripción pasa de «Catálogo INE; solo consulta.» a «Catálogo INE. Un municipio no se borra: se desactiva.».
  - Con `MUNICIPIO_CREAR`, el botón «Registrar municipio» (`CardAction`, con el icono `Plus`), como «Registrar distrito».
  - Con `MUNICIPIO_EDITAR`, una columna «Acciones» con el mismo menú de los distritos: «Cambiar nombre» y «Desactivar» o «Reactivar». La fila del `9999` no tiene acciones.
  - Desactivar y reactivar piden confirmación con el mismo `AlertDialog` de los distritos. Un 409 se muestra con el mensaje de la API, como en los distritos.
  - La fila se agrega o se reemplaza con la respuesta, sin volver a pedir la lista, y sale un aviso: «Municipio {código INE} registrado», «actualizado», «desactivado» o «reactivado».
- **`DialogoMunicipio.jsx`** (como `DialogoDistrito.jsx`):
  - Para registrar: «Departamento» (`Select` con `GET /departamentos`, que se pide al abrir el diálogo), «Código INE» y «Nombre». Con un departamento elegido, debajo del código sale la ayuda «Empieza con {código del departamento}.».
  - Para cambiar el nombre: el departamento y el código se muestran como texto, y solo se edita el nombre.
  - Valida con `validarCodigoIne` y `validarNombreMunicipio` antes de enviar, y muestra el error de la API (400, 409 o 422) dentro del diálogo.

### `frontend/src/api/catalogos.js`

`listarDepartamentos()`, `crearMunicipio({ departamentoId, codigoIne, nombre })`, `renombrarMunicipio(id, nombre)`, `desactivarMunicipio(id)` y `reactivarMunicipio(id)`, con el cliente común, como las de distritos.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, `GET /departamentos` y los cuatro endpoints de municipios, con sus cuerpos, respuestas y ejemplos de error, `x-permiso` y la descripción nueva de `GET /municipios`. Comprobación: `/api/docs` carga sin errores.
2. **Scripts de la base (con autorización para editar `backend/db/`).** `14_departamentos_mysql.sql`, los 22 departamentos en el `01` y los dos permisos con su asignación en el `05`. Comprobación: `git diff backend/db/` muestra solo eso.
3. **Aplicar en Aiven (con autorización para correr los scripts).** Correr el `14` y el `05`, y otra vez los dos. Comprobación:
   - las cuatro corridas terminan sin errores;
   - `SELECT COUNT(*) FROM departamento` da 23 (los 22 y el `99`) después de la primera y de la segunda corrida, y los `id` 1 a 3 siguen siendo `12`, `99` y `09`;
   - `rol_permiso` tiene una fila (`ADMINISTRADOR`, `MUNICIPIO_CREAR`) y una (`ADMINISTRADOR`, `MUNICIPIO_EDITAR`), y el total de filas no cambia en la segunda corrida.
4. **Validación compartida.** `validarCodigoIne` y `validarNombreMunicipio` en los dos `campos.js`, con sus casos en las dos pruebas. Comprobación: `backend/tests/campos.test.js` y `frontend/src/validaciones/campos.test.js` pasan.
5. **Backend: departamentos y alta.** `municipios.service.js` con `listarDepartamentos` y `crearMunicipio`, sus rutas y su controlador. Pruebas en `backend/tests/municipios.test.js`, con un departamento de prueba de código `98` (que el INE no usa) y municipios `98NN` con nombre `vitest-spec77 …`, insertados y borrados por la prueba:
   - `GET /departamentos` trae los 22, no el `99`, en orden;
   - el alta responde 201 y deja `CREAR` en la bitácora;
   - 400 por un campo de más, un código que no es de 4 dígitos o un nombre inválido;
   - 422 por el `99`, un departamento inexistente o un prefijo que no es el del departamento;
   - 409 por un código repetido y por un nombre repetido en el mismo departamento (con otras mayúsculas o tildes); el mismo nombre en otro departamento sí se acepta;
   - 403 para un rol sin `MUNICIPIO_CREAR` (por ejemplo, el Revisor).

   Comprobación: `municipios.test.js` pasa.
6. **Backend: renombrar, desactivar y reactivar.** `renombrarMunicipio`, `desactivarMunicipio` y `reactivarMunicipio`, con sus rutas. Casos nuevos en `municipios.test.js`:
   - renombrar responde 200 con `ACTUALIZAR`; con el mismo nombre, sin bitácora; `codigoIne` o `departamentoId` en el cuerpo, 400;
   - desactivar y reactivar responden 200 con su fila; repetirlos no deja bitácora;
   - 409 `MUNICIPIO_EN_USO` con un distrito activo, con un establecimiento activo y con una red activa (los tres creados por la prueba);
   - 409 `MUNICIPIO_ESPECIAL` al renombrar o desactivar el `9999`;
   - 404 para un `id` que no existe, y 403 sin `MUNICIPIO_EDITAR`.

   Comprobación: `municipios.test.js` y `catalogos.test.js` pasan.
7. **Frontend: API y diálogo.** Las funciones de `api/catalogos.js` y `DialogoMunicipio.jsx`, con `DialogoMunicipio.test.jsx`: registrar con departamento, código y nombre; la ayuda del prefijo; los errores de formato antes de enviar; el error de la API dentro del diálogo; cambiar el nombre sin poder cambiar el código ni el departamento. Comprobación: la prueba pasa.
8. **Frontend: Territorio.** En `PaginaTerritorio.jsx`, `alcance: 'todos'`, la descripción nueva, el botón, la columna de acciones y la confirmación. Casos en `PaginaTerritorio.test.jsx`:
   - con `MUNICIPIO_CREAR` sale el botón, y sin el permiso no;
   - un municipio registrado aparece en la tabla con su aviso;
   - el `9999` no tiene acciones;
   - desactivar pide confirmación, y un 409 muestra el mensaje de la API;
   - la carga pide `alcance: 'todos'`.

   Comprobación: `npm test` del frontend pasa completo.
9. **Verificación manual.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano), como Administrador:
   - registrar un municipio de prueba de otro departamento, verlo en la tabla y cambiarle el nombre;
   - intentar un código con otro prefijo y uno repetido, y ver los errores en el diálogo;
   - intentar desactivar Coatepeque (tiene un establecimiento activo) y ver el 409;
   - desactivar y reactivar el municipio de prueba;
   - registrar un establecimiento externo en el municipio de prueba y ver que aparece en la procedencia del Registro (`alcance=procedencia`);
   - revisar las filas de la bitácora;
   - como Revisor, ver que la tarjeta no tiene el botón ni las acciones.

   El municipio y el establecimiento de prueba quedan **inactivos** en Aiven al terminar, porque los catálogos no se borran (regla 6), salvo que el equipo pida borrarlos por SQL.
10. **Notas y mapa.** La nota en HU-08 (`HISTORIAS_DE_USUARIO.md`), la nota en `backend/src/modulos/catalogos/CLAUDE.md`, la tabla de `departamento` en `CONTEXTO BD.md` (los 22 departamentos y el script `14`) y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta `GET /departamentos` y los cuatro endpoints de municipios, y `/api/docs` carga sin errores.
- [x] Correr el `14` y el `05` dos veces seguidas en Aiven termina sin errores, deja 23 departamentos y no duplica filas.
- [x] `GET /departamentos` trae los 22 departamentos del INE, sin el `99`, por código.
- [x] El Administrador registra un municipio con un departamento, un código INE de 4 dígitos que empieza con el código del departamento y un nombre válido, y la bitácora guarda `CREAR`.
- [x] Un código repetido o un nombre repetido en el mismo departamento responden 409, un prefijo distinto o el departamento `99` responden 422, y un formato inválido responde 400.
- [x] El Administrador renombra un municipio, y el código INE y el departamento no se pueden cambiar.
- [x] Desactivar un municipio con distritos o establecimientos activos, o en una red activa, responde 409 con lo que lo bloquea.
- [x] El `9999` no se puede renombrar ni desactivar.
- [x] Un rol sin `MUNICIPIO_CREAR` o `MUNICIPIO_EDITAR` recibe 403, y en la pantalla no ve el botón ni las acciones.
- [x] En Territorio, un municipio de otro departamento recién registrado aparece en la tabla sin recargar.
- [x] Un municipio de fuera aparece en la procedencia del Registro solo cuando tiene un establecimiento de la DDRISS.
- [x] Las pruebas de los archivos del backend tocados y `npm test` del frontend pasan.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** un municipio de fuera sirve para registrar un establecimiento externo (decidido en la conversación previa). **No:** volverlo procedencia sin establecimiento, que cambia la regla del SPEC 24 y le quita uso al `9999`.
- **Sí:** sembrar los 22 departamentos con un script `14` idempotente y en el `01` (decidido en la conversación previa), como el SPEC 59 con el `12`. **No:** crear departamentos desde la app, que es otro catálogo y otra pantalla. **No:** dejar solo los tres de hoy.
- **Sí:** crear, renombrar, desactivar y reactivar (decidido en la conversación previa). El código y el departamento no cambian, por la regla 6 y porque el código es la llave del GeoJSON. **No:** solo crear.
- **Sí:** 409 al desactivar con distritos, establecimientos o una red activos (decidido en la fase de preguntas). **No:** bloquear por el personal, porque su municipio es un dato de la persona y no del territorio que reporta.
- **Sí:** todos se pueden cambiar menos el `9999` (decidido en la fase de preguntas). **No:** solo los creados desde la app, porque la tabla no distingue los de la semilla.
- **Sí:** solo el Administrador, con `MUNICIPIO_CREAR` y `MUNICIPIO_EDITAR` (decidido en la conversación previa), como `DISTRITO_*`. **No:** Epidemiología.
- **Sí:** el prefijo del código igual al del departamento (decidido en la conversación previa), que es como numera el INE. **Sí:** esa revisión es un 422 y no un 400 (decidido al escribir el spec), porque depende de otro dato de la base, como `MUNICIPIO_INVALIDO` en los distritos.
- **Sí:** `GET /departamentos` nuevo (decidido en la fase de preguntas). **No:** deducirlos de `GET /municipios`, porque un departamento sin municipios no saldría.
- **Sí:** nombre único dentro del departamento (decidido al escribir el spec), como el nombre del distrito dentro del municipio. **No:** único en el país, porque Guatemala tiene nombres repetidos en distintos departamentos (por ejemplo, San José o San Pedro).
- **Sí:** el nombre usa los caracteres del distrito, de 3 a 80 (decidido al escribir el spec). El `9999` es el único con `/`, y no se edita.
- **Sí:** Territorio pide `alcance=todos` (decidido al escribir el spec). Con `procedencia`, un municipio de fuera recién creado no aparecería hasta tener un establecimiento. **No:** un alcance nuevo solo para esta pantalla.
- **Sí:** el municipio de prueba de la verificación manual queda inactivo en Aiven (decidido al escribir el spec), por la regla 6.
- **Sí:** el mapa no entra, y solo se anota como riesgo (decidido en la conversación previa).
- **Sí:** origen `ajuste` sobre HU-08 (decidido en la fase de preguntas): la historia ya está terminada (SPEC 13), y este spec cambia su decisión de municipios de solo consulta.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un municipio nuevo de San Marcos no se dibuja en el mapa, porque no tiene forma en el GeoJSON | Se acepta: el INE casi nunca crea municipios. Queda anotado en la nota del módulo, y cargar su forma iría en otro spec. |
| Un municipio nuevo de San Marcos no tiene población, distrito ni red, y los indicadores lo muestran sin datos | Es lo esperado hasta que se carguen en «Población», «Distritos de salud» y «Redes». Se anota en la nota del módulo. |
| Desactivar un municipio de San Marcos con población o producción lo saca de las listas de activos (Población, redes, indicadores) | La desactivación se bloquea con distritos o establecimientos activos, que es lo que lo mantiene en uso. La producción ya registrada no se toca, y los informes siguen contando los inactivos con datos en el rango. |
| Al agregar departamentos en el `01`, cambian los `id` 1 a 3 y se rompe la semilla de `municipio` y `ddriss` | Los tres de hoy siguen primero y en el mismo orden. Se comprueba en el paso 3 en Aiven, y en el `01` con `git diff`. |
| Las pruebas dejan un departamento `98` o municipios `98NN` si fallan a medias | La prueba los borra al inicio y al final, como `distritos.test.js` con sus municipios `Z`. |
| `alcance=todos` muestra en Territorio municipios de otros departamentos | Es lo buscado: la tabla ya marca «Fuera del departamento», y hoy solo hay Coatepeque y los que se creen. |

## Lo que **no** entra en este spec

- Crear o editar departamentos y DDRISS.
- Cambiar la regla de procedencia o la del Excel 3.
- La forma de un municipio nuevo en el mapa, o un aviso en la pantalla.
- Cambiar el código INE o el departamento, o borrar municipios.
- Crear distritos, redes o población desde el diálogo del municipio.
