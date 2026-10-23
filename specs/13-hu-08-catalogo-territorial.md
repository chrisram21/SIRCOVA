# SPEC 13 — Catálogo territorial: consulta de municipios y gestión de distritos de salud

> **Estado:** Implementado
> **Historia:** HU-08
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 07, SPEC 11
> **Fecha:** 2026-10-22
> **Objetivo:** Que el Administrador consulte en `/configuracion` la DDRISS, sus municipios (incluido el 9999) y sus distritos de salud, y pueda registrar, renombrar, desactivar y reactivar distritos ligados a un municipio.

## Por qué existe este spec

Las tablas `departamento`, `municipio`, `ddriss` y `distrito_salud` ya existen en el script 01. La semilla carga los 30 municipios de San Marcos (1201 a 1230), el 9999 «Migrantes / fuera de San Marcos» y Coatepeque (0920). Los códigos INE ya se verificaron (avance de HU-08). El SPEC 07 dejó `GET /municipios` y `GET /ddriss` en versión mínima. Falta la pantalla y la gestión de distritos, que hoy solo se cargan por SQL (`03_datos_prueba_mysql.sql`, un distrito por municipio).

**Diferencias con la historia** (mandan `AGENTS.md` y el modelo):

- La historia dice «No puedo eliminar un municipio que ya tiene producción registrada». Por la regla 6 de `AGENTS.md`, ningún catálogo se borra. Los municipios son el catálogo INE y quedan de **solo consulta**: no hay forma de borrarlos, editarlos ni desactivarlos. El criterio se cumple porque no existe la ruta.
- «Registrar y editar distritos»: editar es **solo cambiar el nombre**. El código no se renombra (regla 6) y el municipio no se cambia. Para otro municipio se desactiva el distrito y se crea otro.

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de Usuarios (tabla, Badge, AlertDialog).

## Alcance

**Entra:**

- `GET /municipios` con los parámetros `alcance` (`departamento` o `procedencia`) e `incluirInactivos`, y el campo nuevo `departamentoNombre`.
- `GET /ddriss` con el campo nuevo `departamentoNombre`.
- `GET /distritos`, `POST /distritos`, `PATCH /distritos/{id}` (nombre), `POST /distritos/{id}/desactivar` y `POST /distritos/{id}/reactivar`, con su contrato en `backend/openapi.yaml`.
- Código del distrito generado por el sistema: `DS-{código INE}-{NN}`.
- Regla de formato `validarNombreDistrito` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `CONFIGURACION_CONSULTAR`, `DISTRITO_CONSULTAR`, `DISTRITO_CREAR` y `DISTRITO_EDITAR` en `05_permisos_mysql.sql`, solo para el Administrador.
- Bitácora de cada escritura (módulo `CONFIGURACION`).
- Página `/configuracion` con Tabs; este spec crea la pestaña «Territorio» con la DDRISS, la tabla de municipios y la tabla de distritos.
- Dialog para registrar y renombrar distritos, y AlertDialog para desactivar y reactivar.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-08 en `HISTORIAS_DE_USUARIO.md` y nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Crear, editar, desactivar o borrar municipios, departamentos o DDRISS.
- Endpoint `GET /departamentos` y tabla de departamentos.
- Cambiar el municipio o el código de un distrito.
- Renombrar los códigos de la semilla de prueba (`DS-1201`…`DS-1230`) al formato `DS-1201-01`. Son datos de prueba; el formato nuevo se aplica a los que crea el sistema.
- Las demás pestañas de Configuración (establecimientos en HU-09, vacunas en HU-10, periodos en HU-12, población en HU-13…).
- Establecimientos: asignarlos a un distrito, moverlos o desactivarlos (HU-09).
- Paginación de municipios o distritos.
- Rechazar parámetros desconocidos en `GET /establecimientos` o en otros endpoints existentes.
- Cambios al modelo de datos.

## Modelo de datos

Este spec **no cambia el modelo**. Usa las tablas del script 01 tal como están:

- `departamento (id, codigo_ine, nombre)`
- `municipio (id, departamento_id, codigo_ine, nombre, activo)`
- `ddriss (id, codigo, nombre, departamento_id, activo)`
- `distrito_salud (id, ddriss_id, municipio_id, codigo UNIQUE, nombre, activo)`

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Rol |
|---|---|---|---|
| `CONFIGURACION_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Ver la pantalla de configuración | ADMINISTRADOR |
| `DISTRITO_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar los distritos de salud de su ámbito | ADMINISTRADOR |
| `DISTRITO_CREAR` | `CONFIGURACION_CATALOGOS` | Registrar distritos de salud en su DDRISS | ADMINISTRADOR |
| `DISTRITO_EDITAR` | `CONFIGURACION_CATALOGOS` | Renombrar, desactivar y reactivar distritos de salud de su DDRISS | ADMINISTRADOR |

`MUNICIPIO_CONSULTAR` y `DDRISS_CONSULTAR` ya existen y no cambian.

### `GET /municipios` (`MUNICIPIO_CONSULTAR`)

**Parámetros** (opcionales):

| Parámetro | Valores | Efecto |
|---|---|---|
| `alcance` | `departamento` (por defecto) o `procedencia` | Ver la tabla siguiente |
| `incluirInactivos` | `true` o `false` (por defecto `false`) | Con `true` también devuelve los municipios con `activo = FALSE` |

| `alcance` | Municipios |
|---|---|
| `departamento` | Los del departamento sede de la DDRISS del usuario, como hoy |
| `procedencia` | Los de `departamento`, más el `9999` y los municipios fuera del departamento donde la DDRISS tiene un establecimiento (`establecimiento.ddriss_id`), como Coatepeque |

- La autoridad nacional (sin DDRISS) recibe todos los municipios con cualquiera de los dos valores.
- Sin parámetros, la respuesta es la misma de hoy más `departamentoNombre`, así que el formulario de HU-04 no cambia.
- Orden: `departamento` por nombre, como hoy. `procedencia` por nombre, con el `9999` al final.
- Un valor inválido, un parámetro desconocido o uno repetido responde 400 `ENTRADA_INVALIDA`, con los mensajes del SPEC 12 ("Parámetro no permitido: {nombre}.", "{nombre} no se puede repetir.") y "alcance debe ser departamento o procedencia." o "incluirInactivos debe ser true o false.".

**Respuesta 200:** arreglo de `{ id, departamentoId, departamentoNombre, codigoIne, nombre, activo }`.

### `GET /ddriss` (`DDRISS_CONSULTAR`)

Igual que hoy, con el campo nuevo `departamentoNombre`.

### Distrito de salud (esquema `DistritoSalud`)

```json
{
  "id": 31,
  "codigo": "DS-1207-02",
  "nombre": "Distrito de Salud Tacaná Norte",
  "ddrissId": 1,
  "municipioId": 7,
  "municipioCodigoIne": "1207",
  "municipioNombre": "Tacaná",
  "establecimientosActivos": 0,
  "activo": true
}
```

`establecimientosActivos` es el número de establecimientos con `activo = TRUE` y `distrito_salud_id` igual al distrito. La pantalla lo usa para avisar antes de desactivar.

### `GET /distritos` (`DISTRITO_CONSULTAR`)

- Ámbito: `filtroAlcance` sobre `distrito_salud.ddriss_id`. La autoridad nacional recibe todos.
- Parámetros opcionales: `municipioId` (entero positivo) y `activo` (`true` o `false`). Sin `activo`, devuelve activos e inactivos.
- Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA`.
- Orden: nombre del municipio y después código.
- **Respuesta 200:** arreglo de `DistritoSalud`, sin paginar.

### `POST /distritos` (`DISTRITO_CREAR`)

**Cuerpo:** `{ "municipioId": 7, "nombre": "Distrito de Salud Tacaná Norte" }`. Cualquier otro campo (`codigo`, `ddrissId`, `activo`…) responde 400 `ENTRADA_INVALIDA` ("Campo no permitido: {nombre}.").

- `ddriss_id` sale del token, nunca del cuerpo.
- `nombre` pasa por `validarNombreDistrito`.
- El municipio debe existir, estar activo y ser del departamento sede de la DDRISS del usuario. El `9999` y Coatepeque se rechazan.
- No puede haber otro distrito de la misma DDRISS y el mismo municipio con el mismo nombre, activo o inactivo. La intercalación `utf8mb4_0900_ai_ci` compara sin mayúsculas ni tildes.

**Código generado:** `DS-{codigo_ine del municipio}-{NN}`.

- `NN` es el mayor consecutivo de los códigos de ese municipio más uno, contando activos e inactivos, con al menos dos dígitos (`02`, `10`, `100`).
- Un código sin consecutivo de la semilla de prueba (`DS-1201`) cuenta como `01`. El primer distrito nuevo de San Marcos queda `DS-1201-02`.
- Un municipio sin distritos empieza en `01`.
- El cálculo y el INSERT van en la misma transacción, después de `SELECT id FROM municipio WHERE id = ? FOR UPDATE`. Así, dos altas a la vez en el mismo municipio no generan el mismo código.

**Respuesta 201:** el `DistritoSalud` creado. Bitácora: `CONFIGURACION` / `CREAR`, entidad `distrito_salud`, con el objeto completo en `valoresNuevos`.

### `PATCH /distritos/{id}` (`DISTRITO_EDITAR`)

**Cuerpo:** `{ "nombre": "..." }`. `municipioId` y `codigo` responden 400 ("{campo} no se puede cambiar."). Cualquier otro campo responde 400 ("Campo no permitido: {nombre}."). Un cuerpo sin `nombre` responde 400.

- Mismas reglas de nombre y de duplicado que al crear, sin contar el propio distrito.
- Funciona también con un distrito inactivo.
- Si el nombre no cambia (`diferencias` da `null`), responde 200 sin escribir ni registrar en la bitácora.
- **Respuesta 200:** el `DistritoSalud` actualizado. Bitácora: `CONFIGURACION` / `ACTUALIZAR`, con `diferencias(antes, despues)`.

### `POST /distritos/{id}/desactivar` y `POST /distritos/{id}/reactivar` (`DISTRITO_EDITAR`)

Sin cuerpo.

- Desactivar con `establecimientosActivos > 0` responde 409 y no cambia nada.
- Reactivar exige que el municipio siga activo.
- Desactivar uno inactivo, o reactivar uno activo, responde 200 sin escribir en la bitácora.
- **Respuesta 200:** el `DistritoSalud`. Bitácora: `CONFIGURACION` / `DESACTIVAR` o `REACTIVAR`, con `diferencias`.

### Errores de los distritos

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Nombre inválido, campo no permitido o que no se puede cambiar, parámetro inválido | El de la regla o los de arriba |
| 404 | `NO_ENCONTRADO` | El distrito no existe o es de otra DDRISS | "El distrito de salud no existe." |
| 409 | `DISTRITO_DUPLICADO` | Ya hay un distrito con ese nombre en el municipio | "Ya hay un distrito con ese nombre en el municipio." |
| 409 | `DISTRITO_CON_ESTABLECIMIENTOS` | Desactivar con establecimientos activos | "El distrito tiene {n} establecimientos activos; muévalos o desactívelos primero." |
| 422 | `MUNICIPIO_INVALIDO` | Municipio inexistente, inactivo o fuera del departamento sede (al crear o al reactivar) | "El municipio no existe, está inactivo o no es del departamento de su DDRISS." (el mismo de `usuarios.service.js`) |

Los 401 y 403 no cambian.

### Regla `validarNombreDistrito`

En `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS`:

- Se quitan los espacios de los extremos y se reducen los dobles.
- De 3 a 120 caracteres (`LARGOS.nombreDistrito = 120`, el largo de la columna).
- Letras (con tildes, `ñ` y `ü`), dígitos, espacios y `.`, `-`, `(`, `)`.
- Devuelve `{ valor }` limpio o `{ error }`, como las demás reglas.

### Frontend

**`src/api/catalogos.js`.**

- `listarMunicipios({ alcance, incluirInactivos } = {})`: sin argumentos, igual que hoy.
- `listarDistritos({ municipioId, activo } = {})`.
- `crearDistrito({ municipioId, nombre })`, `renombrarDistrito(id, nombre)`, `desactivarDistrito(id)` y `reactivarDistrito(id)`.

**Menú.** En `opcionesMenu.js`, la opción «Configuración» confirma `CONFIGURACION_CONSULTAR` y recibe `pagina: PaginaConfiguracion`.

**`/configuracion` (`PaginaConfiguracion.jsx`).**

- Encabezado "CONFIGURACIÓN" y el título "Catálogos del sistema".
- Tabs de shadcn. La pestaña activa va en la URL (`?pestana=territorio`) con `useSearchParams`. Sin parámetro, o con uno desconocido, se abre la primera pestaña visible.
- Este spec solo agrega la pestaña «Territorio». Se ve con `DDRISS_CONSULTAR`, `MUNICIPIO_CONSULTAR` y `DISTRITO_CONSULTAR`.
- Sin ninguna pestaña visible: "No tiene acceso a ningún catálogo."

**Pestaña «Territorio» (`PestanaTerritorio.jsx`).** Pide en paralelo `listarDdriss()`, `listarMunicipios({ alcance: 'procedencia', incluirInactivos: true })` y `listarDistritos()`.

1. **DDRISS.** Card con el nombre y el código de la DDRISS y "Departamento sede: {departamentoNombre}".
2. **Municipios.** Card "Municipios" con una tabla:

   | Código INE | Municipio | Departamento | Distritos activos | Estado |
   |---|---|---|---|---|

   - "Distritos activos" se cuenta en el cliente con la lista de distritos.
   - El `9999` lleva el Badge `secondary` "Procedencia especial". Un municipio fuera del departamento sede lleva "Fuera del departamento".
   - Estado: Badge "Activo" o "Inactivo".
   - No tiene acciones.
3. **Distritos de salud.** Card "Distritos de salud" con el botón "Registrar distrito" (solo con `DISTRITO_CREAR`) y dos Select de filtro que se aplican en el cliente: "Todos los municipios" o uno de los de la sede, y "Todos los estados", "Activos" o "Inactivos". La tabla:

   | Código | Nombre | Municipio | Establecimientos activos | Estado | Acciones |
   |---|---|---|---|---|---|

   - Acciones (solo con `DISTRITO_EDITAR`), en un DropdownMenu: "Renombrar", y "Desactivar" o "Reactivar".
   - "Desactivar" con `establecimientosActivos > 0` queda deshabilitado, con el texto "Tiene establecimientos activos".

**`DialogoDistrito.jsx`.** Un Dialog de shadcn para registrar y renombrar.

- Registrar: Select "Municipio" (solo los activos del departamento sede) e Input "Nombre". Debajo, "El código se genera al guardar."
- Renombrar: el código y el municipio como texto, y el Input "Nombre".
- El nombre se valida con `validarNombreDistrito` antes de enviar. Los errores de la API (400, 409, 422) se muestran dentro del Dialog y no lo cierran.
- Al guardar, el Dialog se cierra, la fila se agrega o se reemplaza en la tabla y aparece un Alert: "Distrito {código} registrado." o "Distrito {código} actualizado.".

**Desactivar y reactivar.** AlertDialog de confirmación: "¿Desactivar el distrito {código} · {nombre}? No se podrán asignarle establecimientos." o "¿Reactivar el distrito {código} · {nombre}?". Un 409 o un 422 se muestra en un Alert y la fila no cambia. El DropdownMenu va con `modal={false}` (nota del 2026-10-22 en `CLAUDE.md`).

**Estados de la pestaña.**

- Carga: Skeleton en las tres Card.
- Si falla alguna de las tres peticiones: Alert "No se pudo cargar el catálogo territorial: {mensaje}" y el botón "Reintentar".
- Sin distritos: "No hay distritos de salud registrados." Sin resultados con filtros: "No hay distritos que coincidan con los filtros."

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /municipios, /ddriss, /distritos y DistritoSalud
├── db/05_permisos_mysql.sql                   ← 4 permisos y su asignación al Administrador
├── src/validaciones/campos.js                 ← validarNombreDistrito
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← rutas de distritos
│   ├── catalogos.controller.js                ← controladores de distritos
│   ├── catalogos.service.js                   ← alcance e incluirInactivos en municipios, departamentoNombre
│   └── distritos.service.js                   ← nuevo: listar, crear, renombrar, desactivar, reactivar
└── tests/
    ├── campos.test.js                         ← casos de validarNombreDistrito
    ├── catalogos.test.js                      ← casos nuevos de /municipios y /ddriss
    └── distritos.test.js                      ← nuevo
frontend/src/
├── components/ui/tabs.jsx, dialog.jsx         ← shadcn
├── validaciones/campos.js, campos.test.js     ← validarNombreDistrito y sus casos
├── api/catalogos.js                           ← funciones de municipios y distritos
├── componentes/layout/opcionesMenu.js         ← Configuración con su página y permiso confirmado
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← nuevo: Tabs
    ├── PestanaTerritorio.jsx                  ← nuevo
    ├── DialogoDistrito.jsx                    ← nuevo
    └── PestanaTerritorio.test.jsx             ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-08
CLAUDE.md                                      ← nota del código de distrito y de /configuracion
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: los parámetros `alcance` e `incluirInactivos` de `GET /municipios` y su 400; `departamentoNombre` en `/municipios` y `/ddriss`; quitar "Versión mínima de HU-04; HU-08 la amplía"; el esquema `DistritoSalud`; las cinco operaciones de distritos con su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra todo.
2. **Permisos.** Agregar los cuatro permisos y su asignación al Administrador en `05_permisos_mysql.sql`, en un bloque "SPEC 13 (HU-08)". **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token del Administrador trae los cuatro códigos.
3. **Regla de formato.** `validarNombreDistrito` y `LARGOS.nombreDistrito` en los dos `campos.js`, con los mismos casos en `backend/tests/campos.test.js` y `frontend/src/validaciones/campos.test.js`: válido, espacios dobles, menos de 3, más de 120, carácter no permitido (`@`, `_`), con tildes y paréntesis. Comprobación: las dos pruebas de `campos` pasan.
4. **Backend: municipios y DDRISS.** En `catalogos.service.js`, leer `alcance` e `incluirInactivos` (400 con los mensajes del modelo), armar la condición de `procedencia` y agregar `departamentoNombre` con un JOIN a `departamento` en las dos consultas. El controlador pasa `req.query`. En `catalogos.test.js`, sin cambiar los casos existentes:
   - sin parámetros devuelve los 30 municipios con códigos `1201` a `1230`, todos del departamento sede, y ninguno es `9999`;
   - con `alcance=procedencia` aparecen además el `9999` (al final) y Coatepeque;
   - con `incluirInactivos=true` aparece un municipio desactivado por SQL en la prueba, que se reactiva en `afterAll`;
   - `alcance=otro`, `incluirInactivos=si`, un parámetro desconocido y uno repetido responden 400;
   - la autoridad nacional recibe todos con los dos valores;
   - `GET /ddriss` trae `departamentoNombre`.

   Comprobación: `npm test` del backend pasa completo.
5. **Backend: consultar y crear distritos.** `distritos.service.js` con `listarDistritos` y `crearDistrito` (validación, municipio, duplicado, bloqueo `FOR UPDATE`, código generado, bitácora en `enTransaccion`), y sus rutas y controladores. En `tests/distritos.test.js`, con nombres que empiezan con `vitest-hu08-` y borrado en `afterAll` (`DELETE FROM distrito_salud WHERE nombre LIKE 'vitest-hu08-%'`):
   - `GET /distritos` solo trae distritos de la DDRISS, con `municipioId` y `activo` filtra, y un filtro mal formado responde 400;
   - crear en un municipio devuelve 201 con un código `DS-{INE}-{NN}`, y un segundo distrito en el mismo municipio recibe el consecutivo siguiente;
   - dos `POST` en paralelo al mismo municipio reciben códigos distintos;
   - en un municipio cuyo único código es `DS-{INE}` (semilla), el siguiente es `DS-{INE}-02`;
   - el `9999`, Coatepeque, un municipio inexistente y uno inactivo responden 422 `MUNICIPIO_INVALIDO`;
   - un nombre repetido en el mismo municipio (con otras mayúsculas o sin tildes) responde 409 `DISTRITO_DUPLICADO`;
   - un cuerpo con `codigo` o `ddrissId` responde 400;
   - la bitácora tiene una fila `CONFIGURACION` / `CREAR` con el distrito.

   Comprobación: `npm test` del backend pasa y no deja distritos del prefijo.
6. **Backend: renombrar, desactivar y reactivar.** `renombrarDistrito`, `desactivarDistrito` y `reactivarDistrito`, con sus rutas. Pruebas en `distritos.test.js`:
   - renombrar devuelve 200, cambia el nombre y deja una fila `ACTUALIZAR` con los valores anterior y nuevo; con el mismo nombre no deja fila;
   - `municipioId` o `codigo` en el cuerpo responden 400;
   - desactivar un distrito con un establecimiento activo, creado por SQL en la prueba y borrado en `afterAll`, responde 409 `DISTRITO_CON_ESTABLECIMIENTOS` y no lo cambia;
   - desactivar uno sin establecimientos y reactivarlo dejan las filas `DESACTIVAR` y `REACTIVAR`;
   - reactivar con el municipio inactivo responde 422;
   - un id de otra DDRISS o inexistente responde 404;
   - sin `DISTRITO_EDITAR` o `DISTRITO_CREAR` responde 403, con una cuenta que las pruebas no borran (nota del 2026-10-21);
   - `DELETE /municipios/1` responde 404, porque la ruta no existe.

   Comprobación: `npm test` del backend pasa completo.
7. **Frontend: página y pestaña de solo lectura.** `npx shadcn@latest add tabs dialog` y revisar que `package.json` no cambie fuera de la lista de `AGENTS.md`. Las funciones de `src/api/catalogos.js`. `PaginaConfiguracion.jsx` con Tabs y la pestaña en la URL; `PestanaTerritorio.jsx` con la DDRISS, los municipios y los distritos (sin acciones), los filtros y los estados de carga, error y vacío. `opcionesMenu.js` con la página. En `PestanaTerritorio.test.jsx`, con `vi.mock` sobre `@/api/catalogos.js`:
   - se piden municipios con `{ alcance: 'procedencia', incluirInactivos: true }`;
   - la tabla muestra los municipios, el Badge "Procedencia especial" en el `9999` y el conteo de distritos activos;
   - los filtros de municipio y estado reducen la tabla de distritos sin pedir de nuevo;
   - si falla una petición, se ve el Alert y "Reintentar" vuelve a pedir;
   - sin `DISTRITO_CONSULTAR` no aparece la pestaña y se ve "No tiene acceso a ningún catálogo.".

   Comprobación: `npm test` del frontend pasa.
8. **Frontend: registrar y renombrar.** `DialogoDistrito.jsx` y el botón "Registrar distrito". Pruebas:
   - registrar envía `{ municipioId, nombre }`, agrega la fila con el código de la respuesta y muestra "Distrito {código} registrado.";
   - el Select de municipio no ofrece el `9999` ni Coatepeque;
   - un nombre de 2 caracteres muestra el error de la regla y no llama a la API;
   - un 409 de la API se muestra dentro del Dialog, que sigue abierto;
   - renombrar muestra el código y el municipio como texto, envía solo el nombre y reemplaza la fila;
   - sin `DISTRITO_CREAR` no aparece el botón.

   Comprobación: `npm test` del frontend pasa.
9. **Frontend: desactivar y reactivar.** El DropdownMenu de acciones y el AlertDialog. Pruebas:
   - confirmar "Desactivar" llama a `desactivarDistrito` y la fila muestra "Inactivo" y la acción "Reactivar";
   - con establecimientos activos, "Desactivar" está deshabilitado;
   - un 409 se muestra en un Alert y la fila no cambia;
   - sin `DISTRITO_EDITAR` no hay columna de acciones.

   Comprobación: `npm test` del frontend pasa completo.
10. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright, como Administrador (la persona inicia sesión a mano): abrir Configuración desde el menú; ver los 30 municipios, el 9999 y Coatepeque; registrar un distrito en Tacaná y ver su código `DS-1207-02` (o el consecutivo que toque); renombrarlo; desactivarlo y reactivarlo; intentar desactivar `DS-1201` y ver que está deshabilitado porque tiene establecimientos; revisar en Auditoría o por SQL las filas de la bitácora; desactivar el distrito de prueba al terminar. Marcar los criterios de HU-08 y escribir su "Avance" con las dos diferencias de este spec. Nota en "Notas de contexto" de `CLAUDE.md`: el código `DS-{INE}-{NN}` lo genera el backend (los de la semilla de prueba no llevan consecutivo y cuentan como `01`), el municipio y el código de un distrito no cambian, y `/configuracion` es una página con Tabs en la que cada spec de catálogo agrega su pestaña.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los parámetros nuevos de `GET /municipios`, `departamentoNombre`, el esquema `DistritoSalud` y las cinco operaciones de distritos con su `x-permiso`, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan distritos, establecimientos ni municipios desactivados en la base.
- [ ] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md`.
- [ ] `GET /municipios` sin parámetros devuelve los 30 municipios de San Marcos (1201 a 1230) y la misma información de antes, más `departamentoNombre`.
- [ ] Con `alcance=procedencia` aparecen además el `9999` «Migrantes / fuera de San Marcos» y Coatepeque.
- [ ] No existe ninguna ruta para borrar, crear ni editar municipios.
- [ ] El Administrador puede registrar un distrito ligado a un municipio activo del departamento sede, y el código sale con el formato `DS-{INE}-{NN}` y el consecutivo siguiente.
- [ ] El `9999`, Coatepeque o un municipio inactivo responden 422 al registrar un distrito.
- [ ] El Administrador puede cambiar el nombre de un distrito, pero no su código ni su municipio.
- [ ] Un nombre repetido en el mismo municipio responde 409.
- [ ] Un distrito con establecimientos activos no se puede desactivar (409).
- [ ] Un distrito desactivado se puede reactivar si su municipio sigue activo.
- [ ] Cada alta, cambio de nombre, desactivación y reactivación deja una fila en la bitácora con el módulo `CONFIGURACION`, y una operación que no cambia nada no deja fila.
- [ ] Ningún distrito de otra DDRISS aparece en `GET /distritos` ni se puede modificar (404).
- [ ] Sin los permisos `DISTRITO_*`, los endpoints responden 403 y la pantalla oculta los botones correspondientes.
- [ ] En el menú, «Configuración» abre `/configuracion` con la pestaña «Territorio», que muestra la DDRISS, los municipios y los distritos con datos reales de la API.
- [ ] El Dialog registra y renombra distritos, valida el nombre antes de enviar y muestra los errores de la API sin cerrarse.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-08 tiene su avance y sus criterios marcados, y `CLAUDE.md` tiene la nota del código de distrito y de `/configuracion`.

## Decisiones

- **Sí:** municipios de solo consulta. Son el catálogo INE ya verificado. La regla 6 impide borrarlos, y editarlos o desactivarlos no lo pide la historia.
- **No:** desactivar municipios con un 409 si tienen producción. Agrega un caso que nadie necesita hoy; si hace falta, va en otro spec.
- **Sí:** el criterio «no puedo eliminar un municipio con producción» se cumple porque no hay ruta para borrar. La diferencia se anota en el avance de HU-08.
- **Sí:** editar un distrito es solo cambiar el nombre. El código no se renombra (regla 6) y, si cambiara el municipio, el INE del código ya no coincidiría. Para otro municipio se desactiva y se crea otro.
- **No:** cambiar el municipio de un distrito sin establecimientos. Se propuso y el equipo lo descartó por la razón anterior.
- **Sí:** código generado `DS-{INE}-{NN}` con consecutivo de dos dígitos, también en el primero (`-01`). Lo pidió el equipo, para que todos los códigos tengan el mismo formato.
- **Sí:** los códigos de la semilla de prueba (`DS-1201`) no se renombran y cuentan como `01`. Son datos de prueba, y renombrarlos tocaría `backend/db/`. Al cargar los distritos reales de la DDRISS se usa el formato completo.
- **No:** código escrito por el administrador. Puede equivocarse y el código ya no se puede corregir.
- **Sí:** `SELECT … FOR UPDATE` sobre el municipio dentro de la transacción para calcular el consecutivo. Dos altas a la vez en el mismo municipio esperan su turno. **No:** reintentar al chocar con el índice único; es más código para el mismo resultado.
- **Sí:** consecutivo calculado sobre activos e inactivos. Un código no se reutiliza.
- **Sí:** desactivar un distrito con establecimientos activos responde 409. Evita establecimientos activos ligados a un distrito inactivo; primero se mueven o desactivan (HU-09).
- **Sí:** el municipio del distrito debe ser activo y del departamento sede de la DDRISS. El 9999 y Coatepeque no son territorio de la DDRISS: Coatepeque es un establecimiento externo con `distrito_salud_id` NULL.
- **Sí:** `ddriss_id` del distrito sale del token. Solo el Administrador tiene `DISTRITO_CREAR`, y siempre tiene DDRISS (regla 10).
- **Sí:** nombre único por DDRISS y municipio, sin distinguir mayúsculas ni tildes. Dos distritos con el mismo nombre en el mismo municipio no se distinguirían en los informes. Decidido al escribir el spec; se puede revisar al aprobarlo.
- **Sí:** regla `validarNombreDistrito` en los cuatro archivos de `campos.js` y `CASOS`, como las demás reglas de formato (nota del 2026-10-22). Los caracteres permitidos y el mínimo de 3 se decidieron al escribir el spec; se pueden revisar al aprobarlo.
- **Sí:** permisos `DISTRITO_CONSULTAR`, `DISTRITO_CREAR` y `DISTRITO_EDITAR` (que incluye desactivar y reactivar), más `CONFIGURACION_CONSULTAR` para el menú, solo para el Administrador. Autorizado al definir el spec. **No:** un `DISTRITO_DESACTIVAR` aparte; **no:** un solo permiso de gestión, que rompe la convención de un permiso por función.
- **Sí:** desactivar y reactivar como `POST /distritos/{id}/desactivar` y `/reactivar`, como `POST /usuarios/{id}/desactivar` y `/restaurar`. Cada acción tiene su propia fila en la bitácora. **No:** un `activo` en el `PATCH`.
- **Sí:** `GET /municipios?alcance=procedencia` para incluir el 9999 y los municipios de establecimientos externos. Sin parámetro, la respuesta no cambia y el formulario de HU-04 sigue igual. El registro de producción podrá usarlo para el municipio de procedencia.
- **No:** incluir siempre el 9999, porque cambiaría el formulario de HU-04. **No:** `?todos=true` con el catálogo completo, que mezcla municipios que la DDRISS no usa.
- **Sí:** `incluirInactivos=true` y no `activo=true|false` en `GET /municipios`. Con `activo` no hay forma de pedir los dos estados a la vez, que es lo que necesita la pantalla.
- **Sí:** los parámetros nuevos de `/municipios` y `/distritos` rechazan valores inválidos, desconocidos o repetidos con 400, como el SPEC 12.
- **Sí:** `GET /distritos` devuelve un arreglo sin paginar, como `/municipios` y `/establecimientos`. Son unos 30 distritos, y la tabla filtra en el cliente.
- **No:** endpoint ni tabla de departamentos. El nombre del departamento viaja en `departamentoNombre`.
- **Sí:** `establecimientosActivos` en cada distrito, para deshabilitar "Desactivar" antes de que el backend responda 409.
- **Sí:** la pestaña muestra la DDRISS, los municipios (incluidos el 9999, Coatepeque y los inactivos, con Badge) y los distritos.
- **Sí:** `/configuracion` es una página con Tabs y la pestaña activa en la URL. HU-09, HU-10, HU-12 y las siguientes agregan su pestaña sin crear opciones nuevas en el menú. **No:** una subruta por catálogo, ni una opción propia en el menú.
- **Sí:** Dialog para registrar y renombrar, porque son dos campos. **No:** subrutas de formulario como las de Usuarios.
- **Sí:** después de cada acción, la fila se agrega o se reemplaza con la respuesta, sin volver a pedir la lista, como en Usuarios.
- **Sí:** la pestaña «Territorio» se ve con `DDRISS_CONSULTAR`, `MUNICIPIO_CONSULTAR` y `DISTRITO_CONSULTAR`, no solo con los dos últimos. La pestaña también pide `GET /ddriss`, y sin ese permiso se abriría con un error de carga. Decidido durante la implementación.
- **Sí:** un solo mensaje para el nombre demasiado corto o demasiado largo: "El nombre del distrito debe tener entre 3 y 120 caracteres.". Los ejemplos de 400 del contrato usan los mensajes reales de la regla. Decidido durante la implementación.
- **Sí:** con `alcance=procedencia`, el 9999 solo se suma si el usuario tiene una DDRISS en su ámbito. Así un rol sin ámbito de DDRISS, como el personal de establecimiento, no lo recibe, igual que no recibe ningún otro municipio. Decidido durante la implementación.
- **Sí:** el 409 `DISTRITO_CON_ESTABLECIMIENTOS` usa el singular con un solo establecimiento ("1 establecimiento activo"). Decidido durante la implementación.
- **Sí:** la prueba existente de `GET /ddriss` que compara las claves exactas se ajustó para incluir `departamentoNombre`; no se quitó ningún caso. Decidido durante la implementación.
- **Sí:** las pruebas del municipio inactivo insertan uno propio en el departamento sede, con un código que empieza con `Z` (no es un INE), en lugar de desactivar un municipio real de la base compartida. La prueba de `incluirInactivos` de `catalogos.test.js` desactiva Coatepeque un momento, porque no tiene distritos y ninguna otra prueba depende de él. Las de distritos limpian en `beforeAll` y en `afterAll`. Decidido durante la implementación.
- **Sí:** el caso "de otra DDRISS" se prueba con un token del mismo usuario de prueba con otra `ddrissId`, porque en la base hay una sola DDRISS y `autenticar` no compara la DDRISS. Decidido durante la implementación.
- **Sí:** el menú de acciones con "Renombrar" entró en el paso 8, porque el Dialog de renombrar necesita abrirse desde ahí; el paso 9 le agregó "Desactivar" y "Reactivar". El AlertDialog de reactivar lleva la descripción "Se le podrán volver a asignar establecimientos.". Decidido durante la implementación.
- **Sí:** la verificación manual se hizo con Playwright contra Aiven; la persona inició sesión a mano en la pestaña. El Select de Radix no se abría con el clic de Playwright, así que el municipio se eligió con su `<select>` nativo. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Dos altas a la vez en el mismo municipio generan el mismo código | `FOR UPDATE` sobre el municipio en la misma transacción; hay una prueba con dos `POST` en paralelo. El índice único de `codigo` es la última barrera. |
| Las pruebas dejan distritos o establecimientos en la base compartida | Nombres con el prefijo `vitest-hu08-` y borrado en `afterAll`. La bitácora no tiene llave foránea a `distrito_salud`, así que se pueden borrar. |
| Otra corrida o integrante ya creó distritos en el mismo municipio y el consecutivo no es el esperado | Las pruebas comparan contra el código que acaban de recibir (siguiente = anterior + 1), no contra un número fijo. |
| La prueba que desactiva un municipio lo deja inactivo si falla a la mitad | Se reactiva en `afterAll`, y se usa un municipio sin distritos de prueba. |
| El cambio en `GET /municipios` rompe el formulario de HU-04 | Sin parámetros, la respuesta es la misma más un campo nuevo; las pruebas existentes de `catalogos.test.js` y de Usuarios siguen igual. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2, y se vuelve a iniciar sesión antes de probar. |
| La regla de nombre queda distinta en el backend y en el frontend | La misma tabla `CASOS` en las dos pruebas de `campos`. |

## Lo que **no** entra en este spec

- Crear, editar, desactivar o borrar municipios, departamentos o DDRISS.
- `GET /departamentos`.
- Cambiar el municipio o el código de un distrito.
- Renombrar los códigos de la semilla de prueba.
- Las demás pestañas de Configuración.
- Asignar o mover establecimientos entre distritos (HU-09).
- Paginar municipios o distritos.
- Cambios al modelo de datos.

Cada uno, si se hace, va en su propio spec.
