# SPEC 64 — HU-47 Exportar informes a Excel

> **Estado:** Implementado
> **Historia:** HU-47
> **Origen:** historia
> **Depende de:** SPEC 05, SPEC 62 y SPEC 63
> **Fecha:** 2026-11-12
> **Objetivo:** Que un informe generado en «Informes» se descargue como un archivo .xlsx, armado en el backend con ExcelJS, con los mismos filtros, la misma agrupación y las mismas cantidades que se ven en pantalla, un encabezado con el título, los filtros, los avisos y la fecha de generación, y la exportación registrada en la bitácora.

## Por qué existe este spec

Los SPEC 62 y 63 dejaron la pantalla «Informes» con los tres informes de la estadígrafa (población propia, total y residencia), sus niveles y la agrupación por dimensión. Todos sus filtros están en la URL. Pero la estadígrafa sigue trabajando en Excel: tiene que copiar la tabla a mano para compartirla o hacer sus cuentas. Este spec agrega el botón «Exportar Excel», que descarga el mismo informe como archivo.

El archivo se arma en el backend (sección 3 de `AGENTS.md`). Así respeta los permisos y la DDRISS del usuario, sale de las mismas funciones que la pantalla y deja la exportación en la bitácora.

**Lo que se decidió en la fase de preguntas (2026-11-12):**

- Se agrega `exceljs` a `backend/package.json`. Está en la lista de dependencias permitidas de `AGENTS.md`, y se autorizó agregarlo en este spec (zona protegida).
- Una ruta aparte, `GET /informes/produccion/excel`, con los mismos parámetros que `GET /informes/produccion` (incluida `agrupacion`) y el mismo permiso, `INFORME_CONSULTAR`. No hay permiso nuevo y el `05` no cambia.
- Solo se exporta «Informes». Exportar Indicadores a Excel (la nota del SPEC 49 en la HU-47) pasa a una historia nueva, **HU-64**, que se agrega a `HISTORIAS_DE_USUARIO.md` en este spec.
- La exportación queda en la bitácora: `EXPORTAR` del módulo `REPORTES`, con los parámetros del informe y el formato, sin cantidades.
- Una sola hoja, como la tabla de la pantalla: encabezado de tres filas con celdas combinadas, primera columna fija y fila «Total».
- Arriba de la tabla van el título, la DDRISS, los filtros, quién lo generó y cuándo, la leyenda «PRELIMINAR» cuando corresponde y los mismos avisos de la pantalla.

## Alcance

**Entra:**

- **Dependencia:** `exceljs` en `backend/package.json` (`npm install exceljs` en `backend/`).
- **Contrato** en `backend/openapi.yaml`: `GET /informes/produccion/excel`, con los parámetros de `GET /informes/produccion`, `x-permiso: INFORME_CONSULTAR`, la respuesta 200 en `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con su `Content-Disposition`, y los mismos 400, 401, 403 y 404.
- **Backend** (`backend/src/modulos/informes/`):
  - la ruta en `informes.routes.js`, antes de cualquier ruta con parámetro, y su controlador;
  - archivo nuevo `informeExcel.service.js`, que arma el libro con ExcelJS a partir de la respuesta del informe;
  - la fila `EXPORTAR` de la bitácora;
  - `Content-Disposition` en `exposedHeaders` de `cors` (`app.js`), para que el frontend lea el nombre del archivo.
- **Frontend:**
  - `descargar` en `frontend/src/api/cliente.js`: hace la misma petición autenticada que `solicitar` (con renovación ante `SESION_VENCIDA`) y devuelve `{ blob, nombre }`, o lanza un `ErrorApi` si la respuesta es un error JSON;
  - `descargarInformeExcel` en `frontend/src/api/informes.js`, con los mismos parámetros que `obtenerInforme`;
  - el botón «Exportar Excel» en `PaginaInformes.jsx`.
- **Pruebas:** casos nuevos en `backend/tests/informes.test.js` (con un archivo nuevo `backend/tests/informeExcel.test.js` si el anterior crece demasiado) y en `PaginaInformes.test.jsx`.
- **Documentación:**
  - una nota en `backend/src/modulos/informes/CLAUDE.md`;
  - el avance de HU-47 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`;
  - la historia nueva **HU-64. Exportar Indicadores a Excel** en «Historias agregadas después de la planificación», con la nota del SPEC 49 movida desde la HU-47, y en la HU-47 una línea que la remite;
  - `node scripts/mapa-obsidian.mjs` después de agregar la HU-64.

**Fuera de alcance (para otros specs):**

- Exportar Indicadores a Excel (HU-64) y cualquier otra pantalla.
- Exportar a PDF (HU-48). El servicio del libro no se comparte con el PDF.
- El informe acumulado anual (HU-49).
- Una hoja «Datos» en formato largo para tablas dinámicas, fórmulas en las celdas o gráficas dentro del archivo.
- Guardar los archivos generados en el servidor o mandarlos por correo.
- Un permiso propio para exportar, cambios al `05` o al modelo de datos.
- Cambiar los filtros, las filas, las columnas o las cantidades de los SPEC 62 y 63.

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. El archivo se arma en memoria y no se guarda. La única escritura es la fila de la bitácora.

### `GET /informes/produccion/excel`

- **Parámetros:** los mismos de `GET /informes/produccion`: `informe`, `desde`, `hasta`, `nivel`, `vacuna`, `redId`, `municipioIds`, `incluirAprobados`, `agrupacion` y `ddrissId`. Se revisan con la misma función, así que un parámetro inválido, desconocido o repetido da el mismo 400, y un recurso inexistente, el mismo 404.
- **Permiso:** `INFORME_CONSULTAR`, con el mismo ámbito por DDRISS.
- **Respuesta 200:**
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  - `Content-Disposition: attachment; filename="informe-poblacion-propia-2026-01-a-2026-08.xlsx"`;
  - el nombre es `informe-{informe}-{desde}-a-{hasta}`, más `-por-{agrupacion}` si hay agrupación;
  - el cuerpo es el libro.
- **Errores:** JSON con el formato común, como en `GET /informes/produccion`. Un error no escribe en la bitácora, salvo el 403, que ya registra `ACCESO_DENEGADO`.
- **Mismos datos que la pantalla:** el controlador obtiene el informe con la misma función del servicio que `GET /informes/produccion` y se lo pasa a `informeExcel.service.js`. El libro no consulta nada por su cuenta.
- **Lo que se lee además del informe:** el nombre de la DDRISS, el nombre del empleado que exporta y los nombres de la red, de los municipios y de la vacuna del filtro.

### Bitácora

Una fila por cada descarga correcta, escrita después de armar el libro y antes de responder:

```js
registrarBitacora(conexion, {
  ...contextoAuditoria(req),
  modulo: MODULOS.REPORTES,
  accion: ACCIONES.EXPORTAR,
  entidad: 'informe',
  entidadId: 'poblacion-propia',             // el código del informe
  valoresNuevos: {
    formato: 'xlsx',
    desde: '2026-01', hasta: '2026-08', nivel: 'municipio',
    vacuna: 'HEXA', redId: null, municipioIds: [1, 4],
    agrupacion: 'sexo', incluirAprobados: true, ddrissId: 1,
  },
});
```

- Los valores que no vienen en la petición se guardan como `null` (`municipioIds`, como `[]`), y `nivel` con su valor por defecto.
- No se guardan cantidades, filas ni columnas.
- Si la bitácora falla, la API responde 500 y no se entrega el archivo.

### Hoja del libro

Una hoja llamada con el nombre corto del informe: «Población propia», «Producción total» o «Residencia».

**Encabezado** (una línea por dato, columna A con la etiqueta y B con el valor):

| Fila | Contenido |
|---|---|
| 1 | Título: «{Nombre del informe} · {nivel}», más « · por {dimensión}» si hay agrupación (el mismo de la pantalla), en negrita |
| 2 | «PRELIMINAR», en negrita, solo si `preliminar` |
| — | DDRISS: su nombre |
| — | Periodo: «De enero de 2026 a agosto de 2026» |
| — | Vacuna: su nombre o «Todas las vacunas» |
| — | Territorio: «Red {nombre}», los nombres de los municipios elegidos separados por comas, o «Todos los municipios» |
| — | Agrupación: el nombre de la dimensión o «Sección del 5C» |
| — | Incluye aprobados sin cerrar: «Sí» o «No» |
| — | Generado: fecha y hora de Guatemala (`DD/MM/AAAA HH:mm`) y el nombre del empleado |
| — | Avisos: una línea por cada aviso que muestra la pantalla, con el mismo texto: los meses sin cerrar (con la casilla o sin ella), las vacunas mostradas al agrupar y «Ninguna vacuna de este informe registra {dimensión}.» |

Después del encabezado va una fila vacía y luego la tabla.

**Tabla:**

- Tres filas de encabezado, como `TablaInforme.jsx`: vacuna (combinada sobre sus columnas), sección o valor de la dimensión (combinada sobre sus dosis; vacía sin sección) y dosis (su código).
- Primera columna con el nombre de la fila. Por establecimiento y por distrito, una segunda columna «Municipio».
- Las filas `fueraDelConsolidado` llevan «(no suma en el consolidado)» después del nombre.
- Las cantidades son **números** de Excel, con el formato `#,##0`, nunca texto.
- Fila final «Total», en negrita. Si `dosisFueraDelConsolidado > 0`, debajo va la línea «Además, {n} dosis de establecimientos que no suman en el consolidado.»
- Las filas del encabezado de la tabla y su primera columna (o las dos, con «Municipio») quedan fijas al desplazarse (`views` con `state: 'frozen'`).
- Si `columnas` está vacío (agrupación que ninguna vacuna registra), el libro lleva solo el encabezado con su aviso, sin tabla.
- Los textos de los avisos y los nombres de los informes y niveles salen de constantes del backend, con el mismo texto que la pantalla.

### Pantalla «Informes»

- **Botón «Exportar Excel»** (`Button` de shadcn, `variant="outline"`, con un ícono de `lucide-react`):
  - va junto al selector «Agrupar por», en el encabezado del informe;
  - solo aparece cuando el informe ya cargó y tiene columnas;
  - pide el archivo con los parámetros de la URL, incluida `agrupacion`, no con el borrador de los filtros;
  - mientras descarga, queda deshabilitado con «Exportando…»;
  - al terminar, el navegador guarda el archivo con el nombre de `Content-Disposition`;
  - si falla, un `AvisoError` con `mensajeDeError(err)` encima de la tabla, sin `onReintentar` (se vuelve a pulsar el botón).

## Plan de implementación

1. **Dependencia.** `npm install exceljs` en `backend/`. Comprobar que la API arranca.
2. **Contrato.** `GET /informes/produccion/excel` en `backend/openapi.yaml`, reutilizando los parámetros de `GET /informes/produccion` y las respuestas de error.
3. **Libro.** `informeExcel.service.js` con una función pura que recibe el informe y los datos del encabezado y devuelve el libro de ExcelJS. Pruebas, leyendo el libro con ExcelJS:
   - el encabezado con el título, la DDRISS, el periodo, los filtros y la fecha;
   - «PRELIMINAR» solo con `preliminar`;
   - las celdas combinadas de vacuna y de sección o valor;
   - las cantidades son de tipo número y tienen el formato `#,##0`;
   - la fila «Total», la columna «Municipio» y la marca de lo que no suma;
   - el libro sin tabla cuando `columnas` está vacío.
4. **Endpoint.** La ruta, el controlador, el `Content-Disposition`, la bitácora y `exposedHeaders` en `app.js`. Pruebas con los datos ficticios del SPEC 62 (DDRISS `ZVT_INF62`, diciembre de 2085 y 2086):
   - cada cantidad del archivo coincide con la de `GET /informes/produccion` con los mismos parámetros, en los tres informes, con y sin agrupación;
   - el nombre del archivo con y sin `agrupacion`;
   - una fila `EXPORTAR` del módulo `REPORTES` con los parámetros y sin cantidades;
   - 400 y 404 como en `GET /informes/produccion`, sin fila `EXPORTAR`;
   - 403 con una cuenta de un rol sin `INFORME_CONSULTAR`, buscada por SQL.
5. **Cliente del frontend.** `descargar` en `api/cliente.js` y `descargarInformeExcel` en `api/informes.js`. Pruebas en `cliente.test.js` (o el archivo de pruebas del cliente que ya exista): devuelve el `blob` y el nombre, lanza `ErrorApi` con un error JSON y renueva una vez ante `SESION_VENCIDA`.
6. **Pantalla.** El botón «Exportar Excel» en `PaginaInformes.jsx`. Pruebas en `PaginaInformes.test.jsx`:
   - no aparece antes de generar ni con `columnas` vacío;
   - llama a `descargarInformeExcel` con los parámetros de la URL, incluida `agrupacion`, aunque el borrador tenga otros;
   - «Exportando…» mientras descarga;
   - el `AvisoError` si falla.
7. **Documentación.**
   - La nota del módulo en `backend/src/modulos/informes/CLAUDE.md`.
   - La HU-64 nueva y el avance de HU-47 en `HISTORIAS_DE_USUARIO.md`.
   - `node scripts/mapa-obsidian.mjs`, y luego `--revisar`.
8. **Prueba manual.** Con el Revisor y con Epidemiología:
   - exportar los tres informes de enero a agosto de 2026 por municipio, uno por establecimiento y uno agrupado por Sexo, de septiembre a octubre de 2026 con aprobados;
   - abrir cada archivo y comparar sus cantidades con la pantalla;
   - comprobar que una suma en Excel funciona sobre las cantidades;
   - comprobar que la fila `EXPORTAR` está en la bitácora.

## Criterios de aceptación

- [x] Con un informe generado aparece «Exportar Excel», que descarga un .xlsx con el nombre `informe-{informe}-{desde}-a-{hasta}[-por-{agrupacion}].xlsx`.
- [x] El archivo respeta los filtros y la agrupación de la URL: cada cantidad coincide con la de la pantalla para los mismos parámetros, en los tres informes y en los cuatro niveles.
- [x] El encabezado del archivo trae el título, la DDRISS, el periodo, la vacuna, el territorio, la agrupación, si incluye aprobados, la fecha y hora de generación y quién lo generó.
- [x] Con `preliminar` el archivo lleva «PRELIMINAR», y los avisos de la pantalla aparecen con el mismo texto.
- [x] Las cantidades son números de Excel (una suma funciona sobre ellas), con separador de miles.
- [x] La tabla tiene las tres filas de encabezado combinadas, la fila «Total», la marca de lo que no suma en el consolidado y los encabezados fijos.
- [x] Cada descarga correcta deja una fila `EXPORTAR` del módulo `REPORTES` con los parámetros, sin cantidades. Un 400 o un 404 no la deja.
- [x] El endpoint pide `INFORME_CONSULTAR` y respeta la DDRISS del usuario, igual que `GET /informes/produccion`.
- [x] La HU-64 está en `HISTORIAS_DE_USUARIO.md` y el mapa está al día.
- [x] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** el libro se arma en el backend con ExcelJS, como dice `AGENTS.md`, para que respete los permisos y quede en la bitácora. **No:** armarlo en el navegador, que exige otra dependencia en el frontend y no deja registro.
- **Sí:** una ruta aparte con los mismos parámetros. **No:** un parámetro `formato` en `GET /informes/produccion`, que mezcla dos tipos de respuesta en un mismo endpoint y en su contrato.
- **Sí:** el mismo permiso `INFORME_CONSULTAR`, porque quien ve el informe ya puede copiarlo. **No:** un permiso `INFORME_EXPORTAR`, que obliga a tocar el `05` sin un caso que lo pida.
- **Sí:** el libro sale de la misma respuesta del servicio que la pantalla, así que no puede dar otras cantidades. **No:** una consulta propia para el archivo.
- **Sí:** solo «Informes». Exportar Indicadores va en la HU-64 nueva. **No:** meterlo aquí, porque sus tablas son otras (cobertura, brecha, deserción, proyección) y casi duplicaría el spec.
- **Sí:** una hoja como la tabla, porque así son los Excel de hoy de la estadígrafa. **No:** una hoja «Datos» en formato largo, que se puede pedir después si hace falta.
- **Sí:** el encabezado con los filtros y los avisos, para que el archivo se entienda sin la pantalla al compartirlo. **No:** solo el título, el periodo y la fecha que pide la historia.
- **Sí:** la bitácora guarda los parámetros y el formato. **No:** las cantidades o el número de filas, que se pueden volver a calcular con los parámetros.
- **Sí:** el botón pide el archivo con la URL, no con el borrador, para que el archivo sea el informe que se ve. **No:** exportar el borrador de los filtros.
- **Sí (decidido al escribir el spec):** `descargar` en `api/cliente.js`, para que la descarga use la misma sesión y renovación que las demás peticiones y ninguna pantalla use `fetch` (sección 4 de `AGENTS.md`).
- **Sí (decidido al escribir el spec):** el nombre del archivo lo pone el backend en `Content-Disposition`, y el frontend lo lee (por eso va en `exposedHeaders`). **No:** armarlo también en el frontend, que duplicaría la regla.
- **Sí (decidido al escribir el spec):** una columna «Municipio» por establecimiento y por distrito, y «(no suma en el consolidado)» en el nombre de la fila. **No:** el municipio en la misma celda que el nombre, que no se puede filtrar en Excel.
- **Sí (decidido al escribir el spec):** sin columnas, el archivo lleva solo el encabezado y el aviso, y la pantalla no muestra el botón. **No:** responder un error, porque el informe en sí es válido.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Sin `exposedHeaders`, el navegador no deja leer `Content-Disposition` y el archivo se guarda sin nombre. | Se agrega en `app.js` y se prueba a mano en el navegador, no solo con supertest. |
| Un informe por establecimiento con todas las vacunas y un rango largo da un libro grande y tarda. | El libro se arma en memoria a partir del informe que ya se calcula para la pantalla; la prueba manual mide el caso más grande (todo 2026 por establecimiento). |
| Los textos de los avisos del archivo y de la pantalla se desalinean con el tiempo. | Salen de constantes del backend, y las pruebas comparan el texto con el que espera la pantalla. Un cambio va en los dos lados. |
| La fecha de generación sale corrida 6 h (nota de `mysql2` y Aiven). | Se calcula en Node con la zona `America/Guatemala`, no se lee de MySQL. |
| Un rol sin `INFORME_CONSULTAR` llega a la ruta. | El 403 y su `ACCESO_DENEGADO` son los de `requierePermiso`, y hay una prueba con una cuenta de ese rol. |

## Lo que **no** entra en este spec

- Exportar Indicadores a Excel (HU-64).
- Exportar a PDF (HU-48) y el acumulado anual (HU-49).
- Una hoja «Datos», fórmulas o gráficas en el archivo.
- Guardar o enviar los archivos generados.
- Un permiso propio para exportar o cambios al modelo de datos.

Cada uno, si llega, va en su propio spec.
