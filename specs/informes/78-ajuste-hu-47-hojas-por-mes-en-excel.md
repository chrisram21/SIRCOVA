# SPEC 78 — Ajuste HU-47 Hojas por mes en el Excel de informes

> **Estado:** Implementado
> **Historia:** HU-47
> **Origen:** ajuste
> **Depende de:** SPEC 62, SPEC 63, SPEC 64 y SPEC 73
> **Fecha:** 2026-11-26
> **Objetivo:** Que el Excel de los informes de población propia, total y residencia traiga, además de la hoja acumulada del rango, una hoja por cada mes del rango con las mismas columnas y filas, que el botón de exportar muestre un indicador de carga mientras se genera el archivo y que los informes muestren las dosis D1, D2, D3… como 1ra, 2da, 3ra…, y que los PDF y Excel lleven el logo del MSPAS en la esquina superior derecha.

## Por qué existe este spec

La DDRISS trabaja hoy con tres Excel, uno por informe: «PRIMERO 5C Inmunizaciones» (población propia), «SEGUNDO … OTROS MUNICIPIOS» (producción total) y «TERCERO … COBERTURA» (residencia). Cada uno tiene una hoja por mes (`enero` a `diciembre`) y una hoja `consolidado` al final, que suma los meses con fórmulas. Las hojas mensuales tienen las mismas filas (los 30 municipios, Migrantes y Total). Las columnas se corren de un mes a otro: las hojas tienen entre 86 y 93 columnas, y el consolidado compensa con fórmulas como `enero!I14 + febrero!J14`.

El Excel de SIRCOVA (SPEC 64, con el diseño de la corrección del 2026-11-24) trae «Información» y una sola hoja con el acumulado de `desde` a `hasta`. Al revisar el sistema, el equipo decidió (2026-11-26) que se conserve esa hoja y que se agregue una hoja por mes, como en los archivos de la DDRISS. Se revisaron los tres archivos de referencia por su estructura, no por su formato: el formato es el de `plantillaExcel.js`.

Generar el Excel ya tarda unos segundos, y con las hojas mensuales tardará más en rangos largos. Hoy el botón solo cambia su texto a «Exportando…», así que se le agrega un indicador de carga.

**Lo que se decidió en la conversación previa (2026-11-26):**

- Entran los tres informes de rango (población propia, total y residencia), cada uno en su libro, como hoy.
- El acumulado anual (SPEC 66) y el PDF (SPEC 65) no cambian.
- Las hojas van en este orden: «Información», una hoja por mes del rango («Enero 2026», «Febrero 2026»…) y al final la hoja acumulada de hoy, como el `consolidado` de la DDRISS. Los meses llevan el año porque el rango puede cruzar años.
- Las hojas mensuales salen siempre, aunque el rango sea de un solo mes.
- Cada hoja mensual tiene las mismas columnas y filas que la hoja acumulada, así que la suma de las hojas mensuales es el acumulado.
- Un mes sin datos, sin cerrar o sin `cierre_periodo` también tiene su hoja, con ceros y un aviso.
- Las hojas mensuales llevan solo dosis, como la acumulada: sin población ni «Porcentaje del Mes».
- La agrupación, las vacunas, el nivel, los municipios o la red y «Incluir aprobados sin cerrar» se aplican igual en cada hoja.
- El botón que exporta muestra un círculo de carga girando. Como los dos botones salen del mismo código, aplica también al del PDF.

**Agregado durante la implementación (2026-11-26):** la DDRISS pidió que los informes muestren las dosis como «1ra», «2da», «3ra» en lugar de D1, D2, D3. Se agrega a este spec como excepción, para no abrir otro por un cambio de etiquetas. Se decidió con el equipo:

- Solo cambian los códigos `D{n}`, con el ordinal en femenino («dosis»): 1ra, 2da, 3ra, 4ta, 5ta, 6ta, 7ma, 8va, 9na y 10ma. Los refuerzos (R1, R2, R3), UNICA y cualquier otro código se muestran como hoy.
- Aplica a los cuatro informes (población propia, total, residencia y acumulado anual), en la pantalla, el Excel y el PDF. Los códigos de la base y de la API no cambian: es solo cómo se muestran.

**Agregado después de cerrar el spec (2026-11-26):** la DDRISS autorizó poner el logo del MSPAS (`LogoMSPAS.png`, 589 × 215 px con fondo blanco; en el proyecto se guarda sin el margen blanco, 463 × 166 px, para que llegue al borde derecho) en los archivos. El logo ya trae escrito «Ministerio de Salud Pública y Asistencia Social», «Dirección Departamental de Redes Integradas de Servicios de Salud» y «San Marcos». Se decidió con el equipo:

- El logo va en la esquina superior derecha y **reemplaza** el renglón del Ministerio, que el logo trae en grande. A su izquierda, alineados a la derecha y con el formato de antes, quedan dos renglones: «Dirección Departamental de Redes Integradas de Servicios de Salud» (que en el logo se lee mal por pequeño) y el nombre de la DDRISS (sin «DDRISS »), tomado de la base. El logo mide lo mismo que esos renglones, así que el encabezado no crece. (Primero se probó el logo con el nombre de la DDRISS más grande debajo: el nombre no quedaba alineado con el logo y el encabezado más alto corría las tablas.)
- Va en todos los PDF (informes y acumulado anual) y en la hoja «Información» de todos los Excel (informes, acumulado anual, «Indicadores» y bitácora), que comparten `plantillaExcel.js`.
- Como el logo dice «San Marcos», se guarda como el de la DDRISS `DDRISS_SM` (`backend/src/modulos/informes/logos/DDRISS_SM.png`) y se elige por el código de la DDRISS: una DDRISS sin logo, o un archivo sin DDRISS (la Autoridad nacional), conserva los tres renglones de hoy. Así no se fija San Marcos en el código (`AGENTS.md`, sección 1).

## Alcance

**Entra:**

- `backend/openapi.yaml`: la descripción de `GET /informes/produccion/excel` dice qué hojas trae el libro. Los parámetros y las respuestas no cambian.
- `informes.service.js`: `leerProduccion` con la opción `porMes`, e `informePorFila` con la opción `porMes`, que agrega `meses` a su respuesta. Solo la usa `exportarInforme` para el Excel.
- `informeExcel.service.js`: las hojas mensuales, con la tabla de la hoja acumulada.
- `plantillaExcel.js`: un enlace por hoja de datos en «Información».
- `textosInforme.js`: el nombre de la hoja de un mes y los avisos de cada hoja mensual.
- `frontend/src/paginas/informes/PaginaInformes.jsx`: el indicador de carga en los botones de exportar.
- Etiquetas de las dosis: `etiquetaDeDosis` en `textosInforme.js` y su copia en `frontend/src/paginas/informes/informes.js`, usada en el encabezado de la tabla de `informeExcel.service.js`, `informePdf.service.js` y `TablaInforme.jsx` (los cuatro informes).
- Pruebas: `backend/tests/informeExcel.test.js`, `backend/tests/informes.test.js`, `backend/tests/informePdf.test.js`, `frontend/src/paginas/informes/PaginaInformes.test.jsx` y `frontend/src/paginas/informes/informes.test.js`.
- Notas en HU-47 de `HISTORIAS_DE_USUARIO.md` y en `backend/src/modulos/informes/CLAUDE.md`.
- Logo del MSPAS: `backend/src/modulos/informes/logos/DDRISS_SM.png`, `logoDeLaDdriss(codigo)` en `informes/logos.js`, el encabezado de `informePdf.service.js` y `hojaDeInformacion` de `plantillaExcel.js`; el código de la DDRISS (`ddrissCodigo`) en los datos del encabezado de `informes.service.js` (`datosDelEncabezado`), `indicadores/exportacion.service.js` y `auditoria/bitacora.service.js`, y en sus pruebas (`informeExcel.test.js`, `informePdf.test.js`, `indicadoresExcel.test.js`, `bitacoraConsulta.test.js`).

**No entra (para otros specs):**

- Hojas por mes en el acumulado anual, o en el Excel de «Indicadores» (SPEC 72).
- Hojas o secciones por mes en el PDF.
- Población, cobertura o «Porcentaje del Mes» en las hojas mensuales o en la acumulada.
- Fórmulas de Excel que sumen las hojas mensuales: la hoja acumulada sigue con valores.
- Una casilla para elegir si se incluyen las hojas mensuales.
- Cambios en `GET /informes/produccion`, en la pantalla «Informes» (salvo el botón y las etiquetas de las dosis) o en la fila `EXPORTAR` de la bitácora.
- Las etiquetas de las dosis en «Indicadores» (pantalla y Excel), en Registro o en Revisión, y los códigos de la base.

## Modelo de datos

Este spec **no cambia el modelo, ni los permisos, ni los estados**. Lee las mismas tablas que los SPEC 62 a 64 y escribe la misma fila `EXPORTAR`.

### `leerProduccion({ …, porMes = false })`

Con `porMes: true`, la consulta agrega `vp.anio` y `vp.mes` al `SELECT` y al `GROUP BY`, y cada elemento trae `anio` y `mes`. Sigue siendo **una sola consulta** para todo el rango: no se hace una por mes, porque en Aiven cada viaje cuesta cerca de 130 ms (nota del backend del 2026-11-15). Sin `porMes`, la consulta y su resultado no cambian.

### `informePorFila(usuario, query, { porMes = false } = {})`

Sin `porMes`, la respuesta es la de hoy: `GET /informes/produccion` y el PDF no cambian. Con `porMes`, se agrega `meses`:

```js
{
  // … los campos de hoy (columnas, filas, total, dosisFueraDelConsolidado, mesesSinCerrar, preliminar…)
  meses: [
    {
      anio: 2026, mes: 1,
      estado: 'CERRADO',            // el de cierre_periodo de la DDRISS; null si el mes no tiene cierre_periodo
      filas: [/* las mismas filas de `filas`, en el mismo orden, con las cantidades de ese mes */],
      total: { cantidades: [/* … */] },
      dosisFueraDelConsolidado: 0,
    },
    // … un elemento por cada mes de desde a hasta, en orden, aunque no tenga datos
  ],
}
```

- `columnas`, el universo de filas (`filasDelNivel`) y el recorte se calculan **una vez**, con la producción de todo el rango, como hoy. Cada mes reparte solo su producción en copias de esas filas, con las cantidades en cero.
- El reparto de la producción en filas y en el total (el bucle de hoy, con `destinos`, `enRecorte` y `fueraDelConsolidado`) pasa a una función que se llama una vez para el rango y una vez por mes. Así, la suma de las cantidades de los meses es igual, celda por celda, a las del acumulado.
- Los meses del rango salen de `desde` a `hasta` en el código, no de `mesesDelRango`, para que un mes sin `cierre_periodo` también tenga su elemento, con `estado: null`. Como `leerProduccion` solo lee meses con `cierre_periodo`, ese mes queda en ceros.

### Libro (`libroDelInforme`)

| Orden | Hoja | Contenido |
|---|---|---|
| 1 | «Información» | Como hoy, con un enlace por hoja de datos (abajo) |
| 2 … N+1 | «Enero 2026», «Febrero 2026»… | La tabla de ese mes |
| N+2 | La de hoy (`HOJAS[informe]`: «Población propia», «Producción total» o «Residencia») | La tabla del acumulado, sin cambios |

- **Nombre de la hoja de un mes:** `nombreDeHojaDelMes({ anio, mes })` en `textosInforme.js`, con el mes con mayúscula inicial y el año («Septiembre 2026»; el más largo tiene 15 caracteres, menos que el límite de 31 de Excel).
- **Tabla de cada hoja mensual:** la misma de la acumulada, con el encabezado de vacuna, sección y dosis, la columna de nombres (y «Municipio» por establecimiento o distrito), las mismas filas, la fila «Total», `pintarTabla` y `prepararHojaDeDatos`. La parte que escribe la tabla en una hoja se separa en una función que usan las dos. El título de impresión de una hoja mensual es `tituloDelInforme(informe)` más « · Enero 2026».
- **Notas debajo de la tabla de un mes** (con `escribirNota`, como la de las dosis fuera del consolidado):

  | Caso | Nota |
  |---|---|
  | `estado: null` | «Enero de 2026 no está habilitado en la DDRISS: no tiene datos.» |
  | Sin cerrar y sin «Incluir aprobados» | «Enero de 2026 todavía no está cerrado y no suma en esta hoja.» |
  | Sin cerrar y con «Incluir aprobados» | «Datos preliminares: enero de 2026 todavía no está cerrado.» |
  | `dosisFueraDelConsolidado > 0` | `textoFueraDelConsolidado(n)` de ese mes, como hoy |

  Un mes `CERRADO` sin dosis fuera del consolidado no lleva nota. La hoja acumulada conserva sus notas y los avisos de «Información» no cambian.
- **Sin columnas** (por ejemplo, una agrupación que ninguna vacuna registra): el libro solo trae «Información», como hoy, sin hojas mensuales.
- La fila `EXPORTAR` y el nombre del archivo no cambian.

### «Información» (`hojaDeInformacion`)

El parámetro `hojaDeDatos` (un nombre) pasa a ser `hojasDeDatos` (una lista). Debajo del recuadro de filtros sale «Hojas de datos:» y un enlace por hoja, en el orden del libro: «Enero 2026», …, y la acumulada como «Población propia (acumulado del rango)». Los libros del acumulado anual (`libroDelAcumulado`), de «Indicadores» y de la bitácora, que también usan `hojaDeInformacion`, pasan su hoja en una lista de un elemento y conservan el texto de hoy, «Ver los datos en la hoja «…»».

### Botón de exportar (`PaginaInformes.jsx`)

Mientras `exportando === formato`, el botón muestra `LoaderCircle` (de `lucide-react`, como el inicio de sesión en `PaginaLogin.jsx`) con `animate-spin motion-reduce:animate-none` en lugar de su ícono, y el texto «Exportando…». Los dos botones siguen deshabilitados mientras uno exporta, como hoy.

### Etiquetas de las dosis (`etiquetaDeDosis`)

`etiquetaDeDosis(codigo)` da el texto de la fila de dosis del encabezado de la tabla. Es una función pura, igual en `textosInforme.js` y en `frontend/src/paginas/informes/informes.js` (un cambio va en los dos lados):

| Código | Etiqueta |
|---|---|
| `D1` … `D10` | 1ra, 2da, 3ra, 4ta, 5ta, 6ta, 7ma, 8va, 9na, 10ma |
| `D11` o más, `R1`, `R2`, `UNICA` y cualquier otro | El código, sin cambios |

La usan la tercera fila del encabezado del Excel (las hojas mensuales y la acumulada, y el acumulado anual), la fila de dosis del PDF (informe y acumulado anual) y la de `TablaInforme.jsx`. Lo que identifica la columna (`llaveDeColumna`, `clave`) sigue con el id y el código.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, la descripción de `GET /informes/produccion/excel` explica las hojas: «Información», una por mes del rango y la acumulada al final. Comprobación: `/api/docs` carga sin errores.
2. **Backend: datos por mes.** `leerProduccion` con `porMes`, la función de reparto e `informePorFila` con `porMes`, en `informes.service.js`. Casos nuevos en `backend/tests/informes.test.js`, con los datos de prueba de `ZVT_INF62`:
   - con `porMes`, `meses` tiene un elemento por mes del rango, en orden, con las mismas filas que `filas`;
   - las cantidades de cada mes son las mismas que las de `GET /informes/produccion` con `desde` y `hasta` en ese mes;
   - la suma de los meses es igual al acumulado, celda por celda y en el total;
   - un mes sin `cierre_periodo` sale con `estado: null` y en ceros;
   - con agrupación, con varias vacunas y por establecimiento, `meses` usa las mismas columnas y filas;
   - sin `porMes`, la respuesta es igual a la de hoy (las pruebas que ya existen pasan sin cambios).

   Comprobación: `informes.test.js` pasa.
3. **Backend: libro.** `nombreDeHojaDelMes` y los textos de las notas en `textosInforme.js`; la tabla en su propia función, las hojas mensuales y su orden en `informeExcel.service.js`; `hojasDeDatos` en `plantillaExcel.js` y en sus llamadas desde `libroDelAcumulado`, `indicadoresExcel.service.js` y `bitacoraExcel.service.js`; `exportarInforme` con `porMes` para el Excel. Casos:
   - en `informeExcel.test.js` (puras): el orden y los nombres de las hojas; un rango de un mes trae «Información», el mes y la acumulada; un rango que cruza años nombra cada mes con su año; las notas de cada caso; sin columnas, solo «Información»; los enlaces de «Información»;
   - en `informes.test.js`: el Excel de un rango de dos meses trae cuatro hojas; cada celda de una hoja mensual es igual a la de su mes en el JSON; la fila `EXPORTAR` y el nombre del archivo no cambian; el PDF no cambia;
   - las pruebas de los Excel de «Indicadores» y de la bitácora siguen pasando.

   Comprobación: `informeExcel.test.js`, `informes.test.js`, `informePdf.test.js` y los archivos de prueba de los otros dos Excel pasan.
4. **Frontend: botón.** `LoaderCircle` en `PaginaInformes.jsx`. Caso en `PaginaInformes.test.jsx`: mientras la descarga no termina, el botón pulsado muestra «Exportando…» y el ícono de carga, y los dos botones están deshabilitados; al terminar, vuelven a su ícono y su texto. Comprobación: `npm test` del frontend pasa completo.
5. **Etiquetas de las dosis.** `etiquetaDeDosis` en `textosInforme.js` y en `frontend/src/paginas/informes/informes.js`, usada en `informeExcel.service.js`, `informePdf.service.js` y `TablaInforme.jsx`; la descripción del encabezado de los cuatro endpoints de archivo en `backend/openapi.yaml` lo menciona. Casos:
   - la función, en el backend y en el frontend, con la misma tabla: D1 a D10, D11, R1, UNICA y un código cualquiera;
   - el encabezado del Excel (informe, hoja mensual y acumulado anual), la definición del PDF (informe y acumulado anual) y la tabla de la pantalla muestran «1ra», «2da»… y conservan «R1» y «UNICA»;
   - las pruebas que hoy esperan `D1` en un encabezado se cambian a la etiqueta nueva.

   Comprobación: `informeExcel.test.js`, `informePdf.test.js` e `informes.test.js` pasan, y `npm test` del frontend pasa completo.
6. **Verificación manual.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano), como Revisor (estadígrafa):
   - **antes de cambiar el código** (con `main`), medir cuánto tarda en descargarse el Excel de población propia de enero a diciembre de 2026, con «Todas las vacunas» y nivel municipio;
   - con el cambio, exportar el mismo Excel, abrirlo y ver las 14 hojas en orden, que la tabla de un mes coincide con la del informe de ese mes en la pantalla y que la suma de dos meses cuadra con un rango de esos dos meses;
   - ver las notas de un mes sin cerrar y de uno sin `cierre_periodo`;
   - exportar los otros dos informes, uno agrupado por sexo y uno por establecimiento;
   - ver el círculo de carga mientras se descarga, en Excel y en PDF;
   - medir otra vez el tiempo del primer punto y anotar los dos tiempos en la nota de HU-47;
   - ver «1ra», «2da», «3ra», «R1» y «UNICA» en la tabla de la pantalla, el Excel y el PDF de un informe de rango y del acumulado anual.
7. **Notas y mapa.** La nota en HU-47 (`HISTORIAS_DE_USUARIO.md`) con los tiempos medidos, la nota en `backend/src/modulos/informes/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.
8. **Logo del MSPAS.** El logo en `logos/DDRISS_SM.png`; `logoDeLaDdriss(codigo)` devuelve su ruta o `null`; `ddrissCodigo` en los datos de los tres encabezados; en el PDF, la esquina derecha del encabezado lleva la Dirección y la DDRISS a la izquierda del logo, que va incrustado en base64 (la política de archivos locales de pdfmake no cambia), sin que crezca el margen de arriba; en «Información», el logo en la columna E de las filas 1 y 2 y los dos renglones a su izquierda, en la columna D. Sin logo, los dos quedan como hoy. Casos:
   - `logoDeLaDdriss`: `DDRISS_SM` da la ruta; otro código, `null` o `undefined` dan `null`;
   - el PDF de un informe y del acumulado anual con `DDRISS_SM` lleva la imagen y el nombre, sin los renglones del Ministerio; con otra DDRISS, los tres renglones;
   - «Información» con `DDRISS_SM` tiene una imagen y no tiene los textos del Ministerio; sin logo, los textos de hoy y ninguna imagen (también en «Indicadores» y la bitácora).

   Comprobación: `informeExcel.test.js`, `informePdf.test.js`, `informes.test.js`, `indicadoresExcel.test.js` y `bitacoraConsulta.test.js` pasan; a mano, ver el logo en un PDF de informe, uno del acumulado y los Excel de un informe, de «Indicadores» y de la bitácora.
9. **Notas y mapa del logo.** Una línea más en la nota de HU-47 y en `backend/src/modulos/informes/CLAUDE.md`, y `node scripts/mapa-obsidian.mjs` (el estado vuelve a Implementado).

## Criterios de aceptación

- [x] `backend/openapi.yaml` describe las hojas del Excel de los informes, y `/api/docs` carga sin errores.
- [x] El Excel de población propia, total y residencia trae «Información», una hoja por cada mes del rango en orden, con nombres como «Enero 2026», y al final la hoja acumulada de hoy.
- [x] Un rango de un solo mes trae también la hoja de ese mes.
- [x] Cada hoja mensual tiene las mismas columnas y filas que la acumulada, y la suma de las hojas mensuales es igual a la acumulada, celda por celda.
- [x] Las cantidades de cada hoja mensual son las del informe de ese mes solo.
- [x] Un mes sin `cierre_periodo` tiene su hoja con ceros y su nota, y un mes sin cerrar lleva su nota, según «Incluir aprobados».
- [x] La agrupación, las vacunas, el nivel y los municipios o la red se aplican igual en las hojas mensuales.
- [x] «Información» tiene un enlace a cada hoja de datos, y los Excel del acumulado anual, de «Indicadores» y de la bitácora no cambian (salvo el logo del paso 8).
- [x] `GET /informes/produccion`, el PDF, el acumulado anual, la fila `EXPORTAR` y el nombre del archivo no cambian.
- [x] Mientras se exporta, el botón pulsado muestra el círculo de carga girando y «Exportando…», y los dos botones están deshabilitados.
- [x] En los cuatro informes (pantalla, Excel y PDF), las dosis D1, D2, D3… se muestran como 1ra, 2da, 3ra… hasta 10ma, y los refuerzos, UNICA y los demás códigos se muestran como antes.
- [x] Los tiempos de exportación de enero a diciembre, antes y después, están anotados en la nota de HU-47 (se midió de enero a noviembre de 2026: diciembre aún no tiene `cierre_periodo`).
- [x] Los PDF y la hoja «Información» de los Excel de la DDRISS San Marcos llevan el logo del MSPAS en la esquina superior derecha, con la Dirección y la DDRISS a su izquierda y sin el renglón del Ministerio, sin correr las tablas; una DDRISS sin logo o un archivo nacional conserva los tres renglones.
- [x] Las pruebas del backend de los archivos tocados y `npm test` del frontend pasan.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** los tres informes de rango, cada uno en su libro (decidido en la conversación previa), como los tres archivos de la DDRISS. **No:** un libro único con los tres informes.
- **Sí:** el acumulado anual y el PDF quedan igual (decidido en la conversación previa). **No:** una cobertura mensual en el acumulado, que pediría otra fórmula.
- **Sí:** los meses primero y el acumulado al final (decidido en la conversación previa), como el `consolidado` de la DDRISS. **Sí:** los meses con su año («Enero 2026»), porque el rango puede cruzar años. **No:** solo «enero», como en sus archivos, que son de un año cada uno.
- **Sí:** las hojas mensuales salen siempre, también con un solo mes (decidido en la conversación previa), aunque entonces repiten la tabla de la acumulada.
- **Sí:** las mismas columnas y filas en todas las hojas (decidido en la conversación previa). La suma cuadra y no se repite el desfase de columnas de los archivos de la DDRISS. **No:** las columnas del esquema de cada mes.
- **Sí:** un mes sin datos o sin `cierre_periodo` tiene su hoja con ceros y una nota (decidido en la conversación previa), como los meses vacíos de los archivos de la DDRISS.
- **Sí:** solo dosis (decidido en la conversación previa). **No:** población y «Porcentaje del Mes», porque nuestros tres informes no tienen población por nivel y eso cambiaría la pantalla y el PDF. Si se pide, va en otro spec.
- **Sí:** una sola consulta con `anio` y `mes` en el `GROUP BY` (decidido al escribir el spec). **No:** una consulta por mes, que en Aiven sumaría unos 130 ms por mes.
- **Sí:** las columnas y el universo de filas se calculan una vez con todo el rango, y los meses solo reparten su producción (decidido al escribir el spec). Es lo que garantiza que las hojas cuadren con la acumulada.
- **Sí:** `porMes` es una opción de `informePorFila` que solo usa el Excel (decidido al escribir el spec). `GET /informes/produccion` y el PDF no cargan datos que no muestran. **No:** cambiar la respuesta JSON de la pantalla.
- **Sí:** valores en la hoja acumulada, no fórmulas (decidido al escribir el spec). El libro sigue siendo un reporte del sistema, y una fórmula se rompe si alguien borra o renombra una hoja.
- **Sí:** un enlace por hoja en «Información» (decidido al escribir el spec), porque con un rango largo hay muchas pestañas. Los otros Excel conservan su texto de hoy.
- **Sí:** el indicador de carga en los dos botones (decidido en la conversación previa), con `LoaderCircle` como el inicio de sesión. **No:** solo en el de Excel, porque los dos salen de `EXPORTACIONES`.
- **Sí:** medir el tiempo antes y después de enero a diciembre (decidido en la conversación previa), para saber cuánto cuesta el cambio.
- **Sí:** origen `ajuste` sobre HU-47 (decidido en la fase de preguntas): la historia ya está terminada (SPEC 64), y este spec cambia las hojas de su Excel.
- **Sí:** las etiquetas «1ra», «2da»… en este spec (pedido de la DDRISS, agregado durante la implementación el 2026-11-26) como excepción, aunque tocan también la pantalla y el PDF. **No:** un spec aparte para un cambio de etiquetas.
- **Sí:** ordinal en femenino hasta 10ma, solo para `D{n}` (decidido con el equipo). **No:** cambiar los refuerzos ni UNICA, que la DDRISS no pidió. **No:** usar `dosis.nombre` de la base («Primera dosis»), que no cabe en la columna.
- **Sí:** los cuatro informes, con el acumulado anual (decidido con el equipo), porque comparten la fila de dosis. **No:** «Indicadores», Registro ni Revisión.
- **Sí:** el logo del MSPAS en este spec, autorizado por la DDRISS después de cerrarlo (2026-11-26), como otra excepción. **Sí:** reemplaza el renglón del Ministerio y deja a su izquierda la Dirección y la DDRISS, al alto de esos dos renglones (decidido con el equipo después de ver la primera versión). **No:** la DDRISS más grande debajo del logo, que no quedaba alineada y corría las tablas. **No:** el logo junto a los tres renglones, que repetiría el Ministerio.
- **Sí:** un logo por código de DDRISS, con los renglones de hoy cuando no hay (decidido al implementar), porque el logo dice «San Marcos» y `AGENTS.md` pide no fijar San Marcos. **No:** el mismo logo para todas las DDRISS.
- **Sí:** todos los PDF y Excel (decidido con el equipo), porque «Indicadores» y la bitácora comparten la hoja «Información». **No:** solo los informes.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un rango largo con «Todas las vacunas» tarda bastante más en generarse (13 tablas de unas 100 columnas para un año) | Una sola consulta, el indicador de carga en el botón y la medición del paso 5. Si el tiempo de enero a diciembre pasa de unos 15 s, se anota y se decide en este spec si se optimiza el armado o se limita el rango del Excel. |
| Separar el reparto en una función cambia el acumulado que ya funciona | Las pruebas de hoy de `informes.test.js` deben seguir pasando sin cambios, y la prueba nueva compara la suma de los meses con el acumulado. |
| Cambiar `hojaDeDatos` por `hojasDeDatos` rompe los Excel del acumulado anual, de «Indicadores» y de la bitácora | Los tres pasan su hoja en una lista y conservan el texto de hoy. Sus pruebas se corren en el paso 3. |
| La pantalla, el PDF y el Excel muestran el mismo informe, pero solo el Excel trae los meses | Es lo decidido: la pantalla y el PDF siguen con el acumulado. Queda en la nota de HU-47. |
| Con un solo mes, la hoja del mes y la acumulada repiten la misma tabla | Es lo decidido: así el libro tiene siempre la misma forma. |
| El logo (463 × 166 px sin el margen blanco) tiene letras pequeñas que se leen mal si se achica demasiado | El logo mide lo mismo que los renglones de texto, así que la Dirección y la DDRISS van también en texto, y se revisa en el paso 8. Si la DDRISS tiene una versión más grande, se cambia el archivo sin tocar el código. |

## Lo que **no** entra en este spec

- Hojas por mes en el acumulado anual o en el Excel de «Indicadores».
- Meses en el PDF.
- Población, cobertura o «Porcentaje del Mes» en las hojas.
- Fórmulas de Excel entre hojas.
- Una casilla para elegir las hojas mensuales.
- Cambios en la pantalla «Informes», salvo el indicador de carga del botón y las etiquetas de las dosis.
- Las etiquetas de las dosis fuera de los informes.
