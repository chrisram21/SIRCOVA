# SPEC 65 — HU-48 Exportar informes a PDF

> **Estado:** Aprobado
> **Historia:** HU-48
> **Origen:** historia
> **Depende de:** SPEC 62, SPEC 63 y SPEC 64
> **Fecha:** 2026-11-13
> **Objetivo:** Que un informe generado en «Informes» se descargue como un PDF en carta horizontal, armado en el backend con pdfmake y la fuente IBM Plex Sans, con el mismo encabezado, las mismas cantidades y los mismos avisos que el Excel del SPEC 64, la tabla repartida en tramos de vacunas que caben en la hoja, la marca «PRELIMINAR» cuando corresponde y la exportación registrada en la bitácora.

## Por qué existe este spec

El SPEC 64 dejó «Exportar Excel» para trabajar los datos. Pero Epidemiología y la Autoridad también necesitan presentar o archivar el informe en un formato que no se edita. Este spec agrega «Exportar PDF» junto al botón del Excel, con el mismo informe de la URL.

Lo difícil del PDF es el ancho de la tabla. Con «Todas las vacunas», un informe tiene de 59 a 73 columnas, y eso no cabe en ninguna hoja. En cambio, ninguna vacuna pasa de 10 columnas: en la base de prueba, Polio tiene 10 y Hexavalente, Neumococo, Tdap y Td tienen 6. Por eso la tabla se reparte en **tramos**: cada tramo junta vacunas seguidas mientras quepan, sin partir ninguna, y lleva todas las filas con su «Total».

**Lo que se decidió en la fase de preguntas (2026-11-13):**

- Se agrega `pdfmake` a `backend/package.json`. Está en la lista permitida de `AGENTS.md`, y se autorizó agregarlo en este spec (zona protegida).
- IBM Plex Sans va como archivos `.ttf` en el repositorio, con su licencia OFL, en `backend/src/modulos/informes/fuentes/`. No se agrega ningún paquete de fuentes.
- La tabla va en tramos de hasta unas 12 columnas, en carta horizontal, sin partir ninguna vacuna.
- Un informe preliminar lleva «PRELIMINAR» como marca de agua diagonal y tenue en cada página, y además la línea «PRELIMINAR» en el encabezado, como el Excel.
- Los textos y el armado del encabezado salen del Excel a un módulo común que usan el Excel y el PDF. El Excel no cambia: sus pruebas lo cuidan.
- La ruta, el permiso y la bitácora siguen el modelo del Excel: `GET /informes/produccion/pdf`, `INFORME_CONSULTAR` y `EXPORTAR` de `REPORTES` con `formato: 'pdf'`. El botón «Exportar PDF» va junto a «Exportar Excel».

## Alcance

**Entra:**

- **Dependencia:** `pdfmake` en `backend/package.json` (`npm install pdfmake` en `backend/`).
- **Fuente:** `backend/src/modulos/informes/fuentes/` con `IBMPlexSans-Regular.ttf`, `IBMPlexSans-SemiBold.ttf` (la negrita del PDF) y `LICENSE.txt` (SIL Open Font License 1.1), tomados del repositorio oficial de IBM Plex.
- **Contrato** en `backend/openapi.yaml`: `GET /informes/produccion/pdf`, con los parámetros y errores compartidos del SPEC 64 (`InformeTipo`… e `InformeEntradaInvalida`/`InformeNoEncontrado`), `x-permiso: INFORME_CONSULTAR` y la respuesta 200 en `application/pdf` con su `Content-Disposition`.
- **Backend** (`backend/src/modulos/informes/`):
  - archivo nuevo `textosInforme.js`, con los textos y funciones que hoy están en `informeExcel.service.js` y que el PDF también usa;
  - `informeExcel.service.js` los importa de ahí, sin cambiar el archivo que genera;
  - archivo nuevo `informePdf.service.js`, con la definición del documento de pdfmake armada a partir de la respuesta del informe, y la función que la convierte en bytes;
  - `exportarInformeExcel` de `informes.service.js` pasa a una función común para los dos formatos, sin cambiar lo que hace con el Excel;
  - la ruta y el controlador del PDF.
- **Frontend:**
  - `descargarInformePdf` en `frontend/src/api/informes.js`, con `descargar` y `rutaDelInforme` del SPEC 64;
  - el botón «Exportar PDF» en `PaginaInformes.jsx`.
- **Pruebas:** casos nuevos en `backend/tests/informes.test.js`, en `backend/tests/informeExcel.test.js` (que debe seguir pasando igual tras mover los textos), un archivo nuevo `backend/tests/informePdf.test.js`, y casos en `frontend/src/api/cliente.test.js` y `PaginaInformes.test.jsx`.
- **Documentación:**
  - una nota en `backend/src/modulos/informes/CLAUDE.md`;
  - el avance de HU-48 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`.

**Fuera de alcance (para otros specs):**

- Exportar «Indicadores» a PDF o a Excel (HU-64) o cualquier otra pantalla.
- Mejorar el formato del Excel del SPEC 64 (colores, anchos, estilos). Ya está anotado como pendiente aparte.
- El informe acumulado anual (HU-49).
- Gráficas, logotipos, firmas o sellos en el PDF.
- Guardar los PDF en el servidor, mandarlos por correo o firmarlos digitalmente.
- Otro tamaño de hoja, o elegirlo desde la pantalla.
- Un permiso propio para el PDF, cambios al `05` o al modelo de datos.
- Cambiar los filtros, las filas, las columnas o las cantidades de los SPEC 62 y 63.

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. El PDF se arma en memoria y no se guarda. La única escritura es la fila de la bitácora, igual que en el SPEC 64.

### `GET /informes/produccion/pdf`

- **Parámetros, permiso, ámbito y errores:** los mismos de `GET /informes/produccion/excel`.
- **Respuesta 200:**
  - `Content-Type: application/pdf`;
  - `Content-Disposition: attachment; filename="informe-total-2026-01-a-2026-08.pdf"`;
  - el nombre es `informe-{informe}-{desde}-a-{hasta}`, más `-por-{agrupacion}` si hay agrupación, con `.pdf`;
  - el cuerpo es el PDF.
- **Mismos datos que la pantalla:** el PDF sale de la misma respuesta de `informePorFila` y de los mismos datos del encabezado que el Excel (`datosDelEncabezado`).

### Bitácora

Igual que el SPEC 64, con `formato: 'pdf'`:

```js
{ modulo: 'REPORTES', accion: 'EXPORTAR', entidad: 'informe', entidadId: 'total',
  valoresNuevos: { formato: 'pdf', desde: '2026-01', hasta: '2026-08', nivel: 'municipio', vacuna: null,
    redId: null, municipioIds: [], agrupacion: null, incluirAprobados: false, ddrissId: 1 } }
```

### `textosInforme.js`

Se mueven ahí, sin cambiar su texto ni lo que devuelven:

- `NOMBRES_INFORME` y `NOMBRES_NIVEL`;
- `textoRango`, `avisosDelInforme`, `tituloDelInforme` y `fechaDeGeneracion`;
- el título de la columna de las filas («Municipio de aplicación», «Municipio de residencia», «Distrito»…);
- `tramosDelEncabezado`;
- una función nueva `lineasDelEncabezado(informe, datos)`, que devuelve las líneas `[etiqueta, valor]` del encabezado: DDRISS, Periodo, Vacuna, Territorio, Agrupación, «Incluye aprobados sin cerrar», Generado y los avisos. El Excel ya escribe exactamente esas líneas, y ahora las toma de aquí.

`HOJAS` y `FORMATO_CANTIDAD` se quedan en `informeExcel.service.js`, porque son solo del Excel.

### Documento PDF

`documentoDelInforme(informe, datos)` es una función pura que devuelve la definición de pdfmake.

- **Hoja:** carta (`LETTER`), horizontal, con márgenes de 30 pt.
- **Fuente:** IBM Plex Sans en todo el documento, con SemiBold como negrita.
- **Primera página:**
  - el título, «{informe} · {nivel}» más « · por {dimensión}», en negrita y más grande;
  - «PRELIMINAR», en negrita, si `preliminar`;
  - las líneas del encabezado, con la etiqueta en negrita, como en el Excel.
- **Marca de agua:** con `preliminar`, «PRELIMINAR» en diagonal, en gris y con opacidad baja, en todas las páginas (`watermark` de pdfmake).
- **Pie de cada página:** «{título} · Página {n} de {total}».
- **Tramos:**
  - un tramo junta vacunas seguidas, en el orden de `columnas`, mientras sus columnas no pasen de `COLUMNAS_POR_TRAMO`: 12 por departamento y municipio, 10 por establecimiento y distrito (que llevan la columna «Municipio»);
  - una vacuna nunca se parte entre tramos;
  - cada tramo es una tabla con las filas completas, en el orden del informe, y su fila «Total», y va debajo del anterior;
  - si no cabe en lo que queda de la página, pasa a la siguiente.
- **Tabla de cada tramo:**
  - tres filas de encabezado, como el Excel: vacuna (sobre sus columnas), sección o valor de la dimensión (sobre sus dosis) y dosis. Se repiten si la tabla sigue en la página siguiente (`headerRows: 3`);
  - la primera columna con el nombre de la fila y, por establecimiento y por distrito, la columna «Municipio»;
  - las filas `fueraDelConsolidado` llevan «(no suma en el consolidado)» después del nombre;
  - las cantidades van alineadas a la derecha, con separador de miles (`Intl.NumberFormat('es-GT')`, como la pantalla);
  - la fila «Total» va en negrita.
- **Después del último tramo:** si `dosisFueraDelConsolidado > 0`, la línea «Además, {n} dosis de establecimientos que no suman en el consolidado.»
- **Sin columnas** (una agrupación que ninguna vacuna registra): solo la primera página con su aviso, sin tablas.
- **Colores:** texto negro, encabezados de tabla con un fondo gris claro y líneas finas grises. No usa colores del tema del frontend.

`pdfDelInforme(informe, datos)` convierte la definición en bytes con `pdfmake.createPdf(…).getBuffer()` y la fuente de `fuentes/` (pdfmake 0.3; ver «Decisiones»).

### Pantalla «Informes»

- **Botón «Exportar PDF»** (`Button` de shadcn, `variant="outline"`, ícono `FileText` de `lucide-react`):
  - va junto a «Exportar Excel» y aparece en los mismos casos (informe cargado, sin error y con columnas);
  - pide el archivo con el mismo pedido de la URL;
  - mientras descarga, dice «Exportando…» y los dos botones quedan deshabilitados, para que no se pidan dos archivos a la vez;
  - si falla, sale el mismo `AvisoError` del Excel: «No se pudo exportar el informe: {mensaje}».

## Plan de implementación

1. **Dependencia y fuente.**
   - `npm install pdfmake` en `backend/`.
   - Los dos `.ttf` y la licencia en `backend/src/modulos/informes/fuentes/`.
   - Comprobar que la API arranca y que pdfmake genera un PDF de prueba con IBM Plex Sans.
2. **Contrato.** `GET /informes/produccion/pdf` en `backend/openapi.yaml`, con los `components` del SPEC 64.
3. **Textos comunes.** `textosInforme.js` con lo que se mueve de `informeExcel.service.js` y `lineasDelEncabezado`; el Excel los importa. Las 9 pruebas de `informeExcel.test.js` pasan sin cambiar lo que esperan, solo sus importaciones.
4. **Documento.** `informePdf.service.js` con `documentoDelInforme`, los tramos y `pdfDelInforme`. Pruebas en `informePdf.test.js` sobre la definición:
   - el encabezado y las líneas son las mismas que en el Excel;
   - la marca de agua y la línea «PRELIMINAR» solo con `preliminar`;
   - los tramos juntan vacunas hasta el límite sin partir ninguna, y 10 columnas con «Municipio»;
   - cada tramo tiene todas las filas y su «Total», con las cantidades del informe;
   - la marca de lo que no suma y la línea final;
   - sin columnas, sin tablas;
   - `pdfDelInforme` devuelve bytes que empiezan con `%PDF`.
5. **Endpoint.** La exportación común en `informes.service.js`, la ruta y el controlador. Pruebas en `informes.test.js` con los datos ficticios del SPEC 62:
   - las cantidades de los tramos de la definición coinciden con `GET /informes/produccion`, en los tres informes, con y sin agrupación;
   - el tipo `application/pdf`, el cuerpo que empieza con `%PDF` y el nombre con y sin `-por-sexo`;
   - una fila `EXPORTAR` con `formato: 'pdf'`;
   - los mismos 400 y 404 sin fila, y el 403;
   - el Excel sigue respondiendo y registrando `formato: 'xlsx'`.
6. **Frontend.** `descargarInformePdf` en `api/informes.js` y el botón en `PaginaInformes.jsx`. Pruebas:
   - `cliente.test.js`: la URL de `/informes/produccion/pdf` con los parámetros del informe;
   - `PaginaInformes.test.jsx`: el botón aparece junto al de Excel; pide el PDF con el pedido de la URL; los dos quedan deshabilitados mientras descarga; el error.
7. **Documentación.** La nota del módulo en `backend/src/modulos/informes/CLAUDE.md` y el avance de HU-48 en `HISTORIAS_DE_USUARIO.md`.
8. **Prueba manual.** Con Epidemiología y con el Revisor:
   - exportar a PDF de enero a agosto de 2026 por municipio, uno por establecimiento con todas las vacunas y uno de septiembre a octubre con aprobados, agrupado por Sexo;
   - abrir cada PDF y revisar la fuente, los tramos, los encabezados repetidos, el pie, la marca de agua del preliminar y que sus cantidades coinciden con la pantalla;
   - comprobar las filas `EXPORTAR` en la bitácora.

## Criterios de aceptación

- [ ] Con un informe generado aparece «Exportar PDF» junto a «Exportar Excel», que descarga `informe-{informe}-{desde}-a-{hasta}[-por-{agrupacion}].pdf`.
- [ ] El PDF es carta horizontal, en IBM Plex Sans, con el título, la DDRISS, el periodo, la vacuna, el territorio, la agrupación, si incluye aprobados, la fecha y hora de generación y quién lo generó.
- [ ] La tabla va en tramos de vacunas que no pasan de 12 columnas (10 con «Municipio»), sin partir ninguna vacuna, y cada tramo tiene todas las filas y su «Total».
- [ ] Cada cantidad del PDF coincide con la de la pantalla para los mismos parámetros, en los tres informes, con y sin agrupación.
- [ ] Con `preliminar`, cada página lleva la marca de agua «PRELIMINAR» y el encabezado su línea. Los avisos de la pantalla aparecen con el mismo texto.
- [ ] Cada página lleva el pie con el título y «Página n de total», y los encabezados de una tabla se repiten si sigue en otra página.
- [ ] Cada descarga correcta deja una fila `EXPORTAR` del módulo `REPORTES` con `formato: 'pdf'` y los parámetros, sin cantidades. Un 400 o un 404 no la deja.
- [ ] El endpoint pide `INFORME_CONSULTAR` y respeta la DDRISS del usuario.
- [ ] El Excel del SPEC 64 sale igual que antes: sus pruebas pasan sin cambiar lo que esperan.
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** el PDF se arma en el backend con pdfmake, como dice `AGENTS.md`, para que respete los permisos y quede en la bitácora. **No:** imprimir la pantalla desde el navegador, que no deja registro ni controla los cortes de página.
- **Sí:** IBM Plex Sans en `.ttf` dentro del repositorio, con su licencia OFL, para que el PDF se vea como la aplicación sin otra dependencia. **No:** un paquete npm de la fuente, que está fuera de la lista de `AGENTS.md`. **No:** Roboto, la fuente de pdfmake, que no cumple el «Cómo se hará» de la historia.
- **Sí:** tramos de vacunas de hasta 12 columnas sin partir ninguna, porque con 73 columnas la tabla no cabe en ninguna hoja y cada vacuna se lee completa, como en el 5C. **No:** una tabla por vacuna, que con todas las vacunas daría 21 tablas y unas 20 páginas. **No:** una sola tabla con letra muy chica, que con 73 columnas no se lee. **No:** exigir una vacuna para el PDF.
- **Sí:** carta horizontal, el tamaño de uso común en Guatemala. **No:** oficio o A4, ni elegir el tamaño en la pantalla.
- **Sí:** «PRELIMINAR» como marca de agua y como línea del encabezado, como piden la nota del SPEC 55 en la HU-48 y el Excel. **No:** solo la línea.
- **Sí:** un módulo común de textos para el Excel y el PDF, para no tener una tercera copia. Las pruebas del Excel cuidan que su archivo no cambie. **No:** copiar los textos en el PDF.
- **Sí:** la misma ruta hermana, el mismo permiso y la misma bitácora que el Excel, para que quien ve el informe pueda descargarlo en los dos formatos. **No:** un permiso propio, aunque la historia nombre solo a Epidemiología y la Autoridad.
- **Sí (decidido al escribir el spec):** 12 columnas por tramo, o 10 con la columna «Municipio», a partir de las medidas reales: la vacuna más ancha tiene 10 columnas y el nombre de fila más largo, 43 caracteres. Las dos cifras quedan en `COLUMNAS_POR_TRAMO` y se ajustan en la prueba manual si el texto no cabe.
- **Sí (decidido al escribir el spec):** SemiBold como negrita. **No:** subir los cuatro pesos que carga el frontend, cuando el PDF solo usa normal y negrita.
- **Sí (decidido al escribir el spec):** las pruebas comparan la definición del documento (los textos y las cantidades de las celdas) y comprueban que los bytes son un PDF. **No:** leer el texto del PDF, que necesitaría otra dependencia para pruebas.
- **Sí (decidido al escribir el spec):** mientras se exporta un formato, los dos botones quedan deshabilitados. **No:** dos descargas a la vez, que dejarían dos filas de bitácora por un solo clic doble.
- **Sí (agregado en la implementación, paso 1):** se instaló pdfmake 0.3.14, que ya no tiene `PdfPrinter`. El servicio usa el objeto único de pdfmake: `setFonts` con IBM Plex Sans, `setUrlAccessPolicy(() => false)` (no baja nada de internet) y `setLocalAccessPolicy` (solo lee `fuentes/`), y `createPdf(definición).getBuffer()`.
- **Sí (agregado en la implementación, paso 4):** «si no cabe en lo que queda de la página, pasa a la siguiente» se resuelve con `pageBreakBefore` de pdfmake (`saltarAntesDelTramo`): un tramo que empezaría pasado el primer 10 % de la página y ocupa más de una salta a la siguiente; uno que ya empieza arriba se deja partir y repite su encabezado. Por eso, con muchas filas, la primera página puede quedar solo con el encabezado.
- **Sí (agregado en la implementación, paso 3):** `textosInforme.js` también lleva `llevaMunicipio`, `nombreDeFila` y `textoFueraDelConsolidado`, que el Excel tenía escritos a mano y el PDF necesita igual.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La API de pdfmake para Node (`PdfPrinter`) cambió entre versiones. | El paso 1 genera un PDF de prueba con la versión instalada antes de escribir el servicio. Si cambió, se usa la API de esa versión y se anota en las decisiones del spec. |
| Un nombre de fila largo o la columna «Municipio» no dejan espacio para 12 o 10 columnas, y el texto se corta. | Los anchos salen de `COLUMNAS_POR_TRAMO` y de anchos de columna fijos. La prueba manual revisa el informe por establecimiento, el más ancho, y ajusta las cifras si hace falta. |
| Un informe por establecimiento con todas las vacunas da muchas páginas y tarda. | El PDF se arma de la misma respuesta que ya calcula la pantalla. La prueba manual mide el caso más grande, como en el SPEC 64. |
| Al mover los textos, el Excel cambia sin que nadie lo note. | Las pruebas de `informeExcel.test.js` y las del endpoint del Excel no cambian lo que esperan. |
| Los archivos de la fuente no se copian a la imagen de Docker (HU-56). | Van dentro de `backend/src/`, que la imagen ya copia completa. La nota del módulo lo recuerda. |

## Lo que **no** entra en este spec

- Exportar «Indicadores» (HU-64) y el acumulado anual (HU-49).
- Mejorar el formato del Excel del SPEC 64.
- Gráficas, logotipos, firmas o sellos en el PDF.
- Guardar, enviar o firmar los archivos generados.
- Otro tamaño de hoja, un permiso propio o cambios al modelo de datos.

Cada uno, si llega, va en su propio spec.
