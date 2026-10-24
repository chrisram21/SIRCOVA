# SPEC 17 — Registro de la población objetivo

> **Estado:** Aprobado
> **Historia:** HU-13
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 11, SPEC 12, SPEC 13, SPEC 16
> **Fecha:** 2026-10-23
> **Objetivo:** Que el Administrador y el Revisor consulten y registren en `/configuracion` la población anual de cada municipio del departamento de su DDRISS por grupo de edad, para los años que existen en el calendario de periodos.

## Por qué existe este spec

Las tablas `clasificacion_poblacion` (7 grupos, los encabezados del 5C) y `poblacion_objetivo` (municipio, año, grupo, cantidad) ya existen en el script 01. La semilla de prueba trae la población ficticia de 2026. El permiso `POBLACION_REGISTRAR` ya existe y está asignado al Administrador. En `backend/openapi.yaml` hay un borrador de `GET` y `POST /poblaciones-objetivo` sin `x-permiso` ni errores, y su cuerpo todavía pide `vacunaId`, que se quitó en la v0.6. Hoy la población solo se carga por SQL.

La población es el denominador de la cobertura y de la meta del mes. La consumen los indicadores (HU-35 y siguientes) a través de `configuracion_indicadores.aplica_a.clasificacion_poblacion`.

**Diferencias con la historia** (mandan `AGENTS.md` y lo que decidió el equipo):

- La historia pide `POST /poblaciones-objetivo`. El equipo decidió usar `PUT /poblaciones-objetivo/{municipioId}/{anio}`, que crea o corrige en una sola transacción los grupos de un municipio y un año. Se borra el borrador del `POST`.
- «No se permite registrar dos veces el mismo municipio, año y grupo»: lo garantizan `UNIQUE (municipio_id, anio, clasificacion_poblacion_id)` y el `PUT`, que corrige la fila existente en vez de duplicarla. No hay un 409 por duplicado.
- La historia es para el Administrador. Por decisión del equipo, el **Revisor** (estadígrafa) tiene los mismos permisos, como en vacunas y periodos.
- Solo se registra la población de los años que tienen al menos un mes en el calendario común (`periodo`, SPEC 16).

No hay mockup de Configuración. La pantalla sigue el estilo general de `descripcion_pantallas.md` y los patrones de las pestañas «Periodos» y «Vacunas» (selector en la URL, tabla, Dialog).

## Alcance

**Entra:**

- `GET /poblaciones-objetivo?anio=` y `PUT /poblaciones-objetivo/{municipioId}/{anio}`.
- Solo los municipios activos del departamento sede de la DDRISS del usuario, sin el `9999` ni los municipios externos.
- Registro parcial: se pueden guardar solo algunos de los 7 grupos de un municipio.
- Corrección de una cantidad en cualquier momento, sin borrar grupos.
- Reglas de formato `validarCantidadPoblacion` y `validarFuentePoblacion` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permiso nuevo `POBLACION_CONSULTAR` para el Administrador y el Revisor, y `POBLACION_REGISTRAR` también para el Revisor, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`).
- Pestaña «Población» en `/configuracion`, con el selector de año, la tabla de municipios por grupo y el Dialog de un municipio.
- Pruebas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-13, una nota en HU-14 y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Importar la población desde Excel (HU-14).
- Copiar la población de un año a otro.
- Borrar una población registrada o dejar vacío un grupo ya registrado.
- Bloquear la corrección de un año con meses cerrados.
- Población de distritos o de municipios externos a la DDRISS (pendiente con la DDRISS).
- Gestionar el catálogo `clasificacion_poblacion` (crear, renombrar o desactivar grupos).
- Dar `POBLACION_CONSULTAR` a otros roles (lo hará el spec de indicadores que lo necesite).
- Calcular cobertura o meta del mes con la población (HU-35 y siguientes).
- Cambios al modelo de datos y a las semillas de `backend/db/01` y `03`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa las tablas del script 01 tal como están:

- `clasificacion_poblacion (id, codigo UNIQUE, descripcion)`, con las 7 semillas: `NACIDOS_VIVOS`, `MENOR_1`, `1_A_MENOR_2`, `4_ANIOS`, `1_A_5`, `MEF_15_49`, `EMBARAZADAS`. No tiene columna `activo`: se muestran todos los grupos, ordenados por `id`.
- `poblacion_objetivo (id, municipio_id, anio, clasificacion_poblacion_id, cantidad INT UNSIGNED, fuente VARCHAR(150) NULL, registrado_por, creado_en, actualizado_en)`, con `UNIQUE (municipio_id, anio, clasificacion_poblacion_id)`.

`registrado_por` guarda el último usuario que escribió la fila (el que la creó o el último que la corrigió). `actualizado_en` se lee con `UNIX_TIMESTAMP` y se devuelve en ISO, como `aFechaIso` (nota del 2026-10-21).

**Municipios de la DDRISS:** los activos del departamento sede de la DDRISS del usuario (`municipio.departamento_id = ddriss.departamento_id`), sin el `9999`. Son los mismos de `GET /municipios?alcance=departamento`.

**Años válidos:** los que tienen al menos un mes en `periodo`.

### `GET /poblaciones-objetivo` (`POBLACION_CONSULTAR`)

- Parámetro obligatorio: `anio` (entero). Si falta, es inválido, está repetido o viene otro parámetro, responde 400 `ENTRADA_INVALIDA` con `revisarParametros` (mensajes del SPEC 12 y "anio debe ser un número entero.").
- Un `anio` sin meses en el calendario responde 422 `ANIO_SIN_PERIODOS`.
- **Respuesta 200** (esquema `PoblacionAnio`):

```json
{
  "anio": 2026,
  "grupos": [
    { "codigo": "NACIDOS_VIVOS", "descripcion": "Nacidos vivos (columna N/V del 5C)" },
    { "codigo": "MENOR_1", "descripcion": "Menores de 1 año" }
  ],
  "municipios": [
    {
      "id": 1,
      "codigoIne": "1201",
      "nombre": "San Marcos",
      "poblacion": {
        "NACIDOS_VIVOS": { "cantidad": 1494, "fuente": "Archivo MSPAS 2026", "actualizadoEn": "2026-01-05T15:00:00.000Z" },
        "MENOR_1": { "cantidad": 1450, "fuente": "Archivo MSPAS 2026", "actualizadoEn": "2026-01-05T15:00:00.000Z" }
      }
    }
  ]
}
```

- `grupos` trae los 7 grupos y sirve para armar las columnas; no hay un endpoint aparte para ellos.
- `municipios` trae todos los municipios de la DDRISS, ordenados por nombre, aunque no tengan población. Un grupo sin registrar no aparece en `poblacion`.

### `PUT /poblaciones-objetivo/{municipioId}/{anio}` (`POBLACION_REGISTRAR`)

Crea o corrige la población de un municipio y un año, grupo por grupo.

- **Cuerpo:**

```json
{ "fuente": "Archivo MSPAS 2026", "grupos": { "MENOR_1": 1450, "4_ANIOS": 1378 } }
```

- `grupos` es obligatorio y trae al menos un grupo. Cada clave es un `codigo` de `clasificacion_poblacion` y cada valor, un entero de 0 a 9 999 999 (`validarCantidadPoblacion`). `null`, un decimal, un texto o un número fuera del rango responden 400.
- `fuente` es opcional (`validarFuentePoblacion`: se recortan los espacios, hasta 150 caracteres, y vacío pasa a `null`). Se aplica a los grupos que vienen en el cuerpo. Si no viene, una fila nueva queda con `fuente = NULL` y una existente conserva la suya.
- Los grupos que no vienen en el cuerpo no cambian. El `PUT` nunca borra filas.
- Un campo distinto de `fuente` y `grupos` responde 400.
- Validaciones, en este orden: `municipioId` o `anio` no enteros, 400; municipio inexistente, inactivo o fuera de la DDRISS del usuario, 404 `NO_ENCONTRADO` (como `verificarAlcance`); año sin meses en el calendario, 422 `ANIO_SIN_PERIODOS`; un grupo que no existe, 400 "El grupo {codigo} no existe.".
- La transacción empieza con `SELECT … FOR UPDATE` sobre las filas del municipio y el año (nota del 2026-10-23). Por cada grupo del cuerpo:
  - si no existe, se inserta con `registrado_por` del usuario y se registra `CREAR` con el objeto completo;
  - si existe, se calcula `diferencias(antes, despues)` sobre `cantidad` y `fuente`; si da `null`, no se escribe ni se registra; si no, se actualiza (también `registrado_por`) y se registra `ACTUALIZAR`.
- Si dos `PUT` del mismo grupo chocan con el `UNIQUE`, se deshace todo y responde 409 `POBLACION_EN_CONFLICTO` ("Otra persona guardó esta población al mismo tiempo. Vuelva a intentarlo.").
- Bitácora: `entidad = 'poblacion_objetivo'`, `entidad_id` el id de la fila, una fila por grupo creado o cambiado, módulo `CONFIGURACION`.
- **Respuesta 200:** el municipio con su población del año, con la misma forma que un elemento de `municipios` en el `GET`.

### Errores de la población

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Parámetro o campo no permitido, `anio` ausente o no entero, `grupos` vacío o ausente, cantidad inválida, fuente demasiado larga, grupo inexistente | "anio debe ser un número entero." / "Debe registrar al menos un grupo." / los de `campos.js` / "El grupo {codigo} no existe." / los del SPEC 12 |
| 404 | `NO_ENCONTRADO` | Municipio inexistente, inactivo o fuera de la DDRISS | "El recurso solicitado no existe." |
| 409 | `POBLACION_EN_CONFLICTO` | Dos guardados simultáneos del mismo grupo | "Otra persona guardó esta población al mismo tiempo. Vuelva a intentarlo." |
| 422 | `ANIO_SIN_PERIODOS` | El año no tiene meses en el calendario | "El año {anio} no está en el calendario de periodos." |

Los 401 y 403 no cambian.

### Reglas de formato (`campos.js`)

- `validarCantidadPoblacion(valor)`: acepta un número entero o un texto de solo dígitos (para el Input del frontend); devuelve `{ valor }` como número de 0 a 9 999 999, o `{ error: "La cantidad debe ser un número entero entre 0 y 9,999,999." }`. En el backend, un texto en el JSON responde 400, porque el servicio exige `Number.isInteger` antes de la regla.
- `validarFuentePoblacion(valor)`: recorta, vacío → `{ valor: null }`, más de 150 caracteres → `{ error: "La fuente admite hasta 150 caracteres." }`.

Van en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22).

### Frontend

**`src/api/catalogos.js`.** `consultarPoblacion(anio)` y `guardarPoblacion(municipioId, anio, { fuente, grupos })`.

**Pestaña «Población» (`PestanaPoblacion.jsx`).** Se agrega a `PESTANAS` de `PaginaConfiguracion.jsx` con el valor `poblacion`, después de «Periodos», con los permisos `POBLACION_CONSULTAR` y `PERIODO_CONSULTAR` (usa `listarPeriodos` para los años).

- Card "Población objetivo" con el texto "Población anual que envía el MSPAS por municipio y grupo de edad; es el denominador de la cobertura.".
- Select "Año" con los años que tienen meses en el calendario (de `listarPeriodos()`), guardado en la URL junto a `pestana` (`anio`). Sin `anio`, o con uno que no está, se elige el año actual si existe, y si no, el más reciente.
- Tabla del año elegido, con scroll horizontal si no cabe:

  | Municipio | una columna por grupo | Acciones |
  |---|---|---|

  - Encabezado de cada grupo: su `descripcion`.
  - Cantidades con separador de miles; un grupo sin registrar muestra "—".
  - Acciones (solo con `POBLACION_REGISTRAR`): botón "Editar" por municipio.
- **Dialog del municipio (`DialogoPoblacion.jsx`):**
  - Título "Población de {municipio} {anio}".
  - Un Input por grupo, con su `descripcion` como etiqueta y `inputMode="numeric"`, con la cantidad actual o vacío.
  - Input "Fuente" (opcional), con la fuente actual si todos los grupos registrados tienen la misma.
  - Valida en el cliente con las mismas reglas de `campos.js`. Un grupo ya registrado que se deja vacío muestra "Un grupo ya registrado no se puede dejar vacío.". Si no hay ningún grupo con número, "Debe registrar al menos un grupo.".
  - Solo manda los grupos con número. Al guardar, la fila de la tabla se reemplaza con el municipio de la respuesta y se ve el aviso "Población de {municipio} guardada.". Un 400, 409 o 422 se muestra en un Alert dentro del Dialog, que conserva lo escrito.
- Carga: Skeleton. Error: Alert "No se pudo cargar la población: {mensaje}" y "Reintentar". Calendario sin años: "No hay años en el calendario. Créelos en la pestaña Periodos.".

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← /poblaciones-objetivo (GET) y /poblaciones-objetivo/{municipioId}/{anio} (PUT); esquemas PoblacionAnio, PoblacionMunicipio, PoblacionGuardar
├── db/05_permisos_mysql.sql                   ← POBLACION_CONSULTAR y asignaciones al Administrador y al Revisor
├── src/validaciones/campos.js                 ← validarCantidadPoblacion, validarFuentePoblacion
├── src/modulos/catalogos/
│   ├── catalogos.routes.js                    ← rutas de población
│   ├── catalogos.controller.js                ← controladores nuevos
│   └── poblacion.service.js                   ← nuevo: consultar y guardar
└── tests/
    ├── campos.test.js                         ← casos nuevos
    └── poblacion.test.js                      ← nuevo
frontend/src/
├── api/catalogos.js                           ← funciones de población
├── validaciones/campos.js                     ← las mismas dos reglas
├── validaciones/campos.test.js                ← los mismos casos
└── paginas/configuracion/
    ├── PaginaConfiguracion.jsx                ← pestaña «Población»
    ├── PestanaPoblacion.jsx                   ← nuevo
    ├── PestanaPoblacion.test.jsx              ← nuevo
    └── DialogoPoblacion.jsx                   ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-13; nota en HU-14
CLAUDE.md                                      ← nota de población
```

`opcionesMenu.js` no cambia: la pestaña no tiene subrutas.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, reemplazar el borrador de `/poblaciones-objetivo` por `GET /poblaciones-objetivo` y `PUT /poblaciones-objetivo/{municipioId}/{anio}`, con los esquemas `PoblacionAnio`, `PoblacionMunicipio` y `PoblacionGuardar`, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra las dos operaciones.
2. **Permisos.** Agregar `POBLACION_CONSULTAR` (módulo `CONFIGURACION_CATALOGOS`) en `05_permisos_mysql.sql`, asignarlo al ADMINISTRADOR y al REVISOR, y asignar `POBLACION_REGISTRAR` al REVISOR, en un bloque "SPEC 17 (HU-13)". **Pedir autorización antes de correrlo** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, los tokens del Administrador y del Revisor traen los dos códigos.
3. **Reglas de formato.** `validarCantidadPoblacion` y `validarFuentePoblacion` en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS` (0, 9 999 999, 10 000 000, -1, 1.5, "123", "12a", vacío; fuente de 150 y de 151 caracteres, solo espacios). Comprobación: `campos.test.js` pasa en los dos proyectos.
4. **Backend: consulta.** `poblacion.service.js` con `consultarPoblacion`, su ruta y su controlador. Las pruebas de `tests/poblacion.test.js` crean por SQL los 12 meses de **2021** en `periodo` (sin `cierre_periodo`) y los borran, junto con las filas de `poblacion_objetivo` de 2021, al inicio y en `afterAll`:
   - `GET ?anio=2026` trae los 7 grupos en orden, los municipios del departamento de San Marcos ordenados por nombre, sin el `9999` ni Coatepeque, y la población de la semilla;
   - `GET ?anio=2021` trae los municipios con `poblacion` vacío;
   - `anio` ausente, `abc`, repetido o con un parámetro desconocido responde 400;
   - `anio=2019` (sin meses) responde 422 `ANIO_SIN_PERIODOS`;
   - una cuenta de Epidemiología de la semilla, con un token firmado con sus datos reales, recibe 403.

   Comprobación: la prueba pasa.
5. **Backend: guardar.** `guardarPoblacion`, con su ruta. Pruebas, sobre 2021 y un municipio de la semilla:
   - un `PUT` con 3 grupos y fuente crea 3 filas, deja 3 filas `CREAR` y responde el municipio con esos 3 grupos;
   - un segundo `PUT` con un grupo cambiado, uno igual y uno nuevo deja una fila `ACTUALIZAR` (solo `cantidad`) y una `CREAR`, y no toca los grupos que no vienen;
   - un `PUT` sin `fuente` conserva la fuente de las filas existentes;
   - un `PUT` sin cambios responde 200 y no deja filas en la bitácora;
   - después de los `PUT`, sigue habiendo una sola fila por municipio, año y grupo;
   - cantidad -1, 10 000 000, 1.5, `"12"` y `null` responden 400; `grupos` vacío, un grupo inexistente y un campo extra responden 400;
   - Coatepeque, el `9999` y un id inexistente responden 404; `anio=2019` responde 422;
   - dos `PUT` en paralelo del mismo grupo nuevo: uno 200 y otro 200 o 409 `POBLACION_EN_CONFLICTO`, y queda una sola fila;
   - con la cuenta del Revisor, el `PUT` responde 200.

   Comprobación: `npm test` del backend pasa completo.
6. **Frontend: pestaña de solo lectura.** Las funciones de `src/api/catalogos.js`. `PestanaPoblacion.jsx` con el selector de año, la tabla y los estados de carga, error y vacío, sin acciones; la pestaña en `PESTANAS`. En `PestanaPoblacion.test.jsx`:
   - la tabla muestra una columna por grupo, las cantidades con separador de miles y "—" en los grupos sin registrar;
   - cambiar el año en el Select pide la población de ese año y queda en la URL; sin `anio` se elige el año actual;
   - si falla la petición, se ve el Alert y "Reintentar" vuelve a pedir;
   - sin `POBLACION_CONSULTAR` no aparece la pestaña;
   - las pruebas de las otras pestañas siguen pasando.

   Comprobación: `npm test` del frontend pasa.
7. **Frontend: Dialog del municipio.** `DialogoPoblacion.jsx` y el botón "Editar". Pruebas:
   - el Dialog viene con las cantidades y la fuente actuales;
   - guardar llama a `guardarPoblacion` solo con los grupos con número, reemplaza la fila y muestra el aviso;
   - una cantidad inválida, un grupo registrado que se vacía o ningún grupo con número muestran su error y no llaman a la API;
   - un 409 de la API se muestra en el Alert del Dialog, que conserva lo escrito;
   - sin `POBLACION_REGISTRAR` no hay columna de acciones.

   Comprobación: `npm test` del frontend pasa completo.
8. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright (la persona inicia sesión a mano):
   - **Como Administrador:** abrir la pestaña «Población» y ver 2026 con la población de la semilla; editar un municipio, cambiar una cantidad y agregar la fuente; recargar y ver que el año sigue elegido y el cambio se mantiene; intentar dejar vacío un grupo registrado y ver el error.
   - **Como Revisor:** ver la pestaña «Población» y corregir una cantidad.
   - **Al terminar:** revisar por SQL las filas de la bitácora y devolver desde la pantalla las cantidades de 2026 a sus valores de la semilla. La fuente cambiada no se puede quitar desde la pantalla; con autorización, se devuelve por SQL a "Datos de prueba (ficticios)".

   Documentación:
   - en HU-13, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
   - en HU-14, agregar la nota: "La importación guarda con la misma lógica de `PUT /poblaciones-objetivo/{municipioId}/{anio}` (SPEC 17): solo años del calendario, municipios del departamento de la DDRISS, cantidades de `validarCantidadPoblacion`, y una fila de bitácora por grupo creado o cambiado.";
   - en "Notas de contexto" de `CLAUDE.md`, una nota: la población se guarda por municipio y año con `PUT`, que crea o corrige grupo por grupo y nunca borra; solo años con meses en `periodo` y municipios del departamento sede sin el `9999`; las pruebas usan el año 2021 (meses creados y borrados por SQL).

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta `GET /poblaciones-objetivo` y `PUT /poblaciones-objetivo/{municipioId}/{anio}` con su `x-permiso`, el borrador anterior (con `vacunaId`) ya no está, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan filas de 2021 en `periodo` ni en `poblacion_objetivo`.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Desde la pantalla se puede registrar la población de un municipio, un año y uno o varios grupos de edad.
- [ ] Después de cualquier número de guardados hay una sola fila por municipio, año y grupo.
- [ ] Una cantidad que no es un entero de 0 a 9 999 999 se rechaza en la pantalla y en la API (400).
- [ ] Un grupo ya registrado se puede corregir y no se puede vaciar ni borrar.
- [ ] Un año sin meses en el calendario responde 422 y no aparece en el selector.
- [ ] Un municipio fuera del departamento de la DDRISS, el `9999` o uno inactivo responde 404.
- [ ] Cada grupo creado deja una fila `CREAR` y cada grupo cambiado una fila `ACTUALIZAR` en la bitácora, con el módulo `CONFIGURACION`; un guardado sin cambios no deja filas.
- [ ] Sin `POBLACION_CONSULTAR` o `POBLACION_REGISTRAR`, sus endpoints responden 403 y la pantalla oculta la pestaña o el botón "Editar".
- [ ] El Administrador y el Revisor ven la pestaña «Población» y pueden guardar.
- [ ] El año elegido queda en la URL y se conserva al recargar.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-13 tiene su avance y sus criterios marcados, HU-14 tiene su nota y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** pestaña «Población» en `/configuracion` con una tabla de municipios por grupo y un Dialog por municipio. Sigue el patrón de las otras pestañas. **No:** una matriz editable en línea con un solo "Guardar", que tiene más estado en el cliente y más casos de error parcial; **no:** una subruta con un formulario de página completa.
- **Sí:** `PUT /poblaciones-objetivo/{municipioId}/{anio}`, que crea o corrige los grupos de un municipio en una sola transacción. Encaja con el Dialog. **No:** `POST` por grupo más `PATCH /{id}`, que obligaría al Dialog a hacer hasta 7 llamadas sin atomicidad; **no:** `POST` por municipio con 409 más un `PATCH` aparte.
- **Sí:** el "no registrar dos veces" lo garantizan el `UNIQUE` y el `PUT`, que corrige la fila existente. **No:** responder 409 al repetir un grupo, que con el `PUT` no tiene sentido.
- **Sí:** el Administrador y el Revisor tienen `POBLACION_CONSULTAR` y `POBLACION_REGISTRAR`. Lo decidió el equipo, como en vacunas y periodos; la historia y el 01 solo nombran al Administrador (decisión provisional del 10/10/2026). **No:** dar ya `POBLACION_CONSULTAR` a Epidemiología o a la Autoridad; se lo asigna el spec de indicadores.
- **Sí:** solo los municipios activos del departamento sede de la DDRISS, sin el `9999` ni los externos. Coinciden con la atribución del Excel 3 (`v_produccion_atribuida`). **No:** incluir Coatepeque u otros municipios externos con establecimiento.
- **Sí:** solo años con al menos un mes en el calendario (`periodo`). Lo decidió el equipo: así la población no se carga para años que el sistema no maneja. **No:** el rango fijo de 2020 al año siguiente, sin mirar el calendario; **no:** sin límite.
- **Sí:** la cantidad se corrige en cualquier momento, aunque el año tenga meses cerrados, y queda en la bitácora. El MSPAS a veces corrige su archivo. **No:** bloquear la corrección con meses cerrados; **no:** borrar grupos.
- **Sí:** registro parcial, con al menos un grupo. Sirve si el archivo del MSPAS no trae todos los grupos. **No:** exigir los 7 grupos la primera vez.
- **Sí:** cantidad entera de 0 a 9 999 999, para atajar errores de digitación. **No:** sin tope (hasta el límite de `INT UNSIGNED`).
- **Sí:** `fuente` opcional, aplicada a los grupos del guardado; si no viene, una fila existente conserva la suya. Decidido al escribir el spec; se puede revisar al aprobarlo. **No:** fuente obligatoria.
- **Sí:** los 7 grupos van dentro de la respuesta del `GET`. **No:** un endpoint `GET /clasificaciones-poblacion` aparte, que nadie más usa todavía.
- **Sí:** un municipio fuera de alcance responde 404, como `verificarAlcance`. Decidido al escribir el spec.
- **Sí:** el choque de dos guardados simultáneos del mismo grupo nuevo responde 409 `POBLACION_EN_CONFLICTO`, y la transacción empieza con `SELECT … FOR UPDATE` (nota del 2026-10-23). Decidido al escribir el spec.
- **Sí:** una fila de bitácora por grupo creado o cambiado (`CREAR` o `ACTUALIZAR`), sin una acción nueva en `ACCIONES`. **No:** una sola fila por guardado con todos los grupos.
- **Sí:** las pruebas usan el año 2021, con sus meses creados y borrados por SQL, porque 2020 es de las pruebas de periodos. Para probar a mano se usa otro año.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un error de digitación cambia la población y, después, la cobertura ya calculada | Tope de 9 999 999, la cantidad anterior en el Dialog y una fila `ACTUALIZAR` con el antes y el después en la bitácora. |
| La pestaña depende de `PERIODO_CONSULTAR`: un rol con la población pero sin periodos no la ve | Hoy el Administrador y el Revisor tienen los dos permisos; la pestaña declara ambos en `PESTANAS`. |
| Dos guardados a la vez del mismo municipio | `SELECT … FOR UPDATE` como primera consulta y el `UNIQUE`; el choque responde 409 y hay una prueba en paralelo. |
| Las pruebas de periodos borran 2020 y las de población crean 2021; si alguien usa 2021 a mano, las pruebas lo borran | La nota de `CLAUDE.md` avisa que 2021 es de las pruebas de población. |
| Los 7 grupos no caben en pantallas angostas | La tabla tiene scroll horizontal. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Importar la población desde Excel (HU-14).
- Copiar la población de un año a otro.
- Borrar una población o vaciar un grupo ya registrado.
- Bloquear la corrección de años con meses cerrados.
- Población de distritos o de municipios externos.
- Gestionar los grupos de `clasificacion_poblacion`.
- `POBLACION_CONSULTAR` para otros roles.
- Cálculo de cobertura o de la meta del mes.
- Cambios al modelo de datos o a las semillas.

Cada uno, si se hace, va en su propio spec.
