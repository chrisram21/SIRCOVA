# SPEC 72 — HU-64 Exportar Indicadores a Excel

> **Estado:** Implementado
> **Historia:** HU-64
> **Origen:** historia
> **Depende de:** SPEC 49, SPEC 54, SPEC 55, SPEC 60, SPEC 61 y SPEC 64
> **Fecha:** 2026-11-17
> **Objetivo:** Que cada pestaña de «Indicadores» tenga un botón «Exportar Excel» que descargue, armado en el backend con ExcelJS, un .xlsx con la tabla que se ve en pantalla, con sus mismos filtros, un encabezado con el título, el mes de corte, la fecha de generación y la leyenda «PRELIMINAR» cuando la corrida es parcial, y la exportación registrada en la bitácora.

## Por qué existe este spec

El SPEC 64 (HU-47) dejó la exportación a Excel de «Informes» y pasó la de «Indicadores» a la HU-64. Epidemiología quiere llevarse la cobertura, la brecha, la deserción, la proyección, las redes y la producción a Excel para trabajarlas y compartirlas sin copiar la tabla a mano.

El archivo se arma en el backend (sección 3 de `AGENTS.md`) para que respete los permisos y la DDRISS y deje la exportación en la bitácora. A diferencia de «Informes», en «Indicadores» la pantalla recorta hoy las filas en el frontend (vacuna, distrito, municipios y red, nota del SPEC 49) y arma algunas columnas al dibujar (las dosis finales de la deserción, las columnas de la red). El backend tiene que repetir ese recorte y esas columnas para que el archivo sea la tabla que se ve.

**Lo que se decidió en la fase de preguntas (2026-11-17):**

- Entran las **siete pestañas**: Avance, Brecha, Cobertura, Deserción, Proyección, Redes y Producción.
- **Dos rutas**, cada una al lado de su endpoint de datos: `GET /indicadores/resultados/excel` (las cinco pestañas de indicadores y Redes) y `GET /indicadores/produccion/excel` (Producción).
- **El backend recorta** las filas con los mismos filtros que la pantalla, en una función propia probada contra el resultado de la pantalla. `GET /indicadores/resultados` y la pantalla no cambian su recorte.
- El archivo lleva **la tabla del indicador que se ve** (el del select «Indicador» cuando la pestaña tiene más de uno), en una hoja, sin gráficas.
- Mismo permiso, `INDICADOR_CONSULTAR`, sin tocar el `05`. La fila de la bitácora es `EXPORTAR` del módulo `INDICADORES`.
- **Números y color:** los porcentajes van como fracción con el formato de porcentaje de Excel; el excedente va en su columna; «Cumple» como «Sí»/«No»; la celda del indicador lleva el relleno del semáforo, y la marca de más del 100 % va en una columna aparte.
- El botón va **junto al título de la pestaña**, solo cuando la tabla cargó con filas.
- **PDF fuera.** El mockup `Indicadores.html` muestra «Exportar PDF», pero la HU-64 pide Excel; este spec solo hace Excel y no crea historia para el PDF.

## Alcance

**Entra:**

- **Contrato** en `backend/openapi.yaml`:
  - `GET /indicadores/resultados/excel` y `GET /indicadores/produccion/excel`, con `x-permiso: INDICADOR_CONSULTAR`, la respuesta 200 en `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con su `Content-Disposition`, y los errores 400, 401, 403 y 404 de sus endpoints de datos.
- **Backend** (`backend/src/modulos/indicadores/`):
  - las dos rutas en `indicadores.routes.js` y sus controladores;
  - archivo nuevo `tablaIndicadores.js`, con funciones puras que repiten el recorte y las columnas de la pantalla (`filasVisibles`, `nombreDeFila`, `columnasDeLaRed`, `filasDeLaRed`, las dosis finales de la deserción);
  - archivo nuevo `indicadoresExcel.service.js`, que arma el libro con ExcelJS a partir de la respuesta de `GET /indicadores/resultados` o de `GET /indicadores/produccion`;
  - archivo nuevo `textosIndicadores.js`, con los títulos, encabezados de columna, avisos y colores del semáforo, con el mismo texto que la pantalla;
  - la fila `EXPORTAR` de la bitácora.
- **Frontend:**
  - `descargarIndicadoresExcel` y `descargarProduccionExcel` en `frontend/src/api/indicadores.js`, sobre `descargar` de `api/cliente.js` (SPEC 64);
  - el botón «Exportar Excel» en `PaginaIndicadores.jsx` (cinco pestañas y Redes) y en `PestanaProduccion.jsx`.
- **Pruebas:** archivo nuevo `backend/tests/indicadoresExcel.test.js` (libro, recorte y endpoints) y casos nuevos en `PaginaIndicadores.test.jsx` y en las pruebas de `PestanaProduccion`.
- **Documentación:**
  - una nota en `backend/src/modulos/indicadores/CLAUDE.md`;
  - el avance de HU-64 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`, con la diferencia del mockup (PDF);
  - `node scripts/mapa-obsidian.mjs` al crear el spec y al cambiar su estado.

**Fuera de alcance (para otros specs):**

- Exportar «Indicadores» a PDF (el botón del mockup).
- Las gráficas, la serie mensual de `GET /indicadores/serie` y la tarjeta «Comparar periodos» en el archivo.
- Una hoja por cada indicador del tipo o todas las pestañas en un mismo libro.
- Exportar el mapa o el Inicio.
- Mover el recorte de vacuna, distrito y municipios al backend en `GET /indicadores/resultados`.
- Un permiso propio para exportar, cambios al `05` o al modelo de datos.
- El color en el Excel de los informes de producción (pendiente del SPEC 64).

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. El archivo se arma en memoria y no se guarda. La única escritura es la fila de la bitácora.

### `GET /indicadores/resultados/excel`

- **Parámetros:**
  - `anio`, `mes` y `ddrissId`: los de `GET /indicadores/resultados`;
  - `vista` (obligatorio): `avance`, `brecha`, `cobertura`, `desercion`, `proyeccion` o `redes`;
  - `indicador`: el código del indicador que se ve; obligatorio salvo en `redes`, y su tipo tiene que ser el de la `vista` (si no, 400);
  - `redId`: en `redes`, la red de la pestaña (obligatoria); en las demás, la red del filtro;
  - `distritoId` y `municipioIds` (`1,4`): el distrito y los municipios del filtro. Con `redId` se ignoran, como en la pantalla («la red manda sobre el distrito»).
- **El frontend manda lo que ya resolvió**, no la URL tal cual: el indicador elegido por `indicadoresDelPanel`, la red de la pestaña con `redElegida` y solo los municipios y el distrito que la pantalla aceptó. Así el backend no repite la elección por defecto de la pestaña ni del indicador.
- **Permiso:** `INDICADOR_CONSULTAR`, con el mismo ámbito por DDRISS.
- **Mismos datos que la pantalla:** el controlador obtiene la corrida vigente y sus resultados con la misma función del servicio que `GET /indicadores/resultados` (con `redId`, para la fila «Total de la red») y después recorta con `tablaIndicadores.js`. El libro no consulta nada por su cuenta, salvo el nombre de la DDRISS, el del empleado que exporta y la red (sus municipios y trazadoras), con la misma función del servicio de redes que usa la pantalla.
- **Errores:** los de `GET /indicadores/resultados` (sin corrida vigente, 404), más 400 por `vista` desconocida, `indicador` que falta, que no es de la `vista` o que no está en la corrida, y `redId` que falta en `redes`. Un error no escribe en la bitácora, salvo el 403, que ya registra `ACCESO_DENEGADO`.
- **Nombre del archivo:** `indicadores-{vista}-{indicador}-{anio}-{mes}.xlsx` (mes con dos dígitos); en `redes`, `indicadores-redes-red-{redId}-{anio}-{mes}.xlsx`.

### `GET /indicadores/produccion/excel`

- **Parámetros, permiso y errores:** los mismos de `GET /indicadores/produccion` (`anio`, `mes`, `acumulado`, `agrupar`, `vacuna`, `distritoId`, `redId`, `municipioIds`, `establecimientoIds`, `ddrissId`), revisados con la misma función. Ese endpoint ya filtra en el backend, así que no hace falta recorte aparte.
- **Mismos datos que la pantalla:** sale de la misma función del servicio que `GET /indicadores/produccion`.
- **Nombre del archivo:** `indicadores-produccion-{anio}-{mes}[-acumulado].xlsx`.

### Bitácora

Una fila por cada descarga correcta, escrita después de armar el libro y antes de responder, como en el SPEC 64:

```js
registrarBitacora(conexion, {
  ...contextoAuditoria(req),
  modulo: MODULOS.INDICADORES,
  accion: ACCIONES.EXPORTAR,
  entidad: 'indicador',
  entidadId: 'COB_HEXA3',            // el indicador; en redes, 'red-{redId}'; en producción, 'produccion'
  valoresNuevos: {
    formato: 'xlsx',
    vista: 'cobertura', anio: 2026, mes: 8, corridaId: 181, ddrissId: 1,
    redId: null, distritoId: null, municipioIds: [1, 4],
  },
});
```

- En producción, `valoresNuevos` lleva sus parámetros (`acumulado`, `agrupar`, `vacuna`, `establecimientoIds`…) en lugar de `corridaId` e `indicador`.
- Lo que no viene se guarda como `null` (las listas, como `[]`). No se guardan cantidades ni filas.
- Si la bitácora falla, la API responde 500 y no se entrega el archivo.

### Hoja del libro

Una hoja con el nombre de la pestaña («Cobertura», «Redes», «Producción»…).

**Encabezado** (columna A con la etiqueta y B con el valor):

| Fila | Contenido |
|---|---|
| 1 | El título de la pantalla («Cobertura de Hexavalente», «Cobertura de la {red}», «Producción de {vacuna}»), en negrita |
| 2 | «PRELIMINAR», en negrita, solo si `corrida.parcial` (en Producción, si algún mes del rango no está cerrado, con la regla de su pestaña) |
| — | DDRISS: su nombre |
| — | Corrida: «Mes de corte: agosto de 2026» (`corrida.mesHasta`) y, si es parcial, los meses sin cerrar, como el aviso de la pantalla |
| — | Indicador: su nombre y código (no en Redes ni Producción) |
| — | Territorio: el nombre de la red o del distrito tal cual («Red No. 1», «Distrito de Salud Ayutla»: ya traen la palabra, decidido en la prueba manual), los municipios elegidos separados por comas, o «Todos los municipios» |
| — | Generado: fecha y hora de Guatemala (`DD/MM/AAAA HH:mm`) y el nombre del empleado |
| — | Avisos: los mismos de la pantalla, con el mismo texto (más del 100 %, «Sin indicador de cobertura anual para: …», lo esperado al mes en Redes, las notas al pie de las tablas) |

Después, una fila vacía y la tabla.

**Tabla:** las mismas columnas que la tabla de la pantalla, en el mismo orden (nota del SPEC 53: Meta antes del indicador y este antes de Cumple), con estos cambios:

- Las cantidades son **números** de Excel con formato `#,##0`; los decimales (ritmo mensual) con `#,##0.0`.
- Los porcentajes (meta, cobertura, avance, deserción, cobertura proyectada y las celdas de Redes) van como **fracción** con formato `0.0%`: 85,3 % se guarda como `0.853`.
- Lo que la pantalla muestra como «—» queda como celda vacía.
- «Dosis que faltan» es solo el número; donde la pantalla escribe «0 (+N de excedente)», el excedente va en una columna «Excedente» después de «Dosis que faltan» (Brecha ya la tiene).
- «Cumple» y «¿Llega a la meta?» van como «Sí» o «No».
- La celda del indicador lleva el relleno del semáforo de su `color` (verde, amarillo, rojo), con los hex de `textosIndicadores.js`, que repiten los colores de las insignias de la tabla (`CLASES_COLOR` de `InsigniaValor.jsx`: `--exito`, `--advertencia` y `--destructive` al 10 % de `index.css`), no los `--semaforo-*` de las gráficas y el mapa (decidido al implementar, 2026-11-17).
- Donde la pantalla muestra la marca de más del 100 % (Cobertura, Avance, Brecha y Redes), una columna «Más del 100 %» con «Sí» en esas filas, o una nota de celda en Redes, donde cada celda es un indicador distinto.
- La fila de total («Total de la DDRISS» o «Total de la red») va en negrita, donde la pantalla la pone.
- **Redes:** dos filas de encabezado, el grupo de población combinado sobre sus trazadoras y la etiqueta de cada trazadora (`etiquetaTrazadora`); municipios de la red por nombre y la fila «Total de la red» al final.
- **Producción:** las columnas de `TablaProduccion.jsx` (municipio o establecimiento, una por dosis, población propia, otros municipios y total), la fila «Total» y la marca de lo que no suma en el consolidado, como en el SPEC 64.
- Las filas del encabezado de la tabla y su primera columna quedan fijas (`views` con `state: 'frozen'`).

### Pantalla «Indicadores»

- **Botón «Exportar Excel»** (`Button` de shadcn, `variant="outline"`, el mismo ícono de `lucide-react` que en «Informes»):
  - a la derecha del título de la pestaña;
  - solo cuando la corrida cargó y la tabla tiene filas (en Producción, cuando su tabla cargó);
  - en una pestaña con aviso en lugar de tabla (sin indicador de la vacuna, sin corrida), no aparece;
  - pide el archivo con los valores que la pantalla ya resolvió (ver arriba);
  - mientras descarga, deshabilitado con «Exportando…»;
  - si falla, un `AvisoError` con `mensajeDeError(err)` encima de la tabla, sin `onReintentar`.
- No cambia nada más de la pantalla: ni el recorte, ni los filtros, ni las gráficas.

## Plan de implementación

1. **Contrato.** Las dos rutas en `backend/openapi.yaml`, reutilizando los parámetros y las respuestas de error de `GET /indicadores/resultados` y `GET /indicadores/produccion` (en `components` si hace falta, como en el SPEC 64).
2. **Recorte en el backend.** `tablaIndicadores.js` con las funciones puras. Pruebas con resultados de ejemplo, comparando con lo que dan las funciones del frontend para los mismos datos:
   - sin filtro, la fila «Total de la DDRISS» y todos los municipios;
   - con distrito, con municipios y con red (y red con distrito: manda la red);
   - las dosis finales de la deserción;
   - las columnas y filas de Redes, con una trazadora sin indicador.
3. **Textos y libro.** `textosIndicadores.js` e `indicadoresExcel.service.js`, con una función pura por tabla que recibe los datos y el encabezado y devuelve el libro. Pruebas leyendo el libro con ExcelJS:
   - el encabezado con el título, el mes de corte, la fecha y el territorio;
   - «PRELIMINAR» solo con `parcial`;
   - las columnas de cada vista en el orden de la pantalla;
   - cantidades de tipo número con `#,##0`, porcentajes como fracción con `0.0%`, celdas vacías donde la pantalla pone «—»;
   - la columna «Excedente», «Sí»/«No», el relleno del semáforo y la columna «Más del 100 %»;
   - el encabezado de dos filas de Redes y la fila de total en negrita.
4. **Endpoints.** Rutas, controladores, `Content-Disposition` y bitácora. Pruebas con una DDRISS y un año ficticios propios (al estilo de `corridas.test.js`, todo insertado y borrado por la prueba):
   - cada cantidad del archivo coincide con la de `GET /indicadores/resultados` (o `GET /indicadores/produccion`) recortada con los mismos parámetros, en las siete pestañas;
   - el nombre del archivo;
   - una fila `EXPORTAR` del módulo `INDICADORES` con los parámetros y sin cantidades;
   - los 400 nuevos y el 404 sin corrida, sin fila `EXPORTAR`;
   - 403 con una cuenta de un rol sin `INDICADOR_CONSULTAR`, buscada por SQL.
5. **Cliente del frontend.** `descargarIndicadoresExcel` y `descargarProduccionExcel` en `api/indicadores.js`.
6. **Pantalla.** El botón en `PaginaIndicadores.jsx` y en `PestanaProduccion.jsx`. Pruebas:
   - no aparece sin corrida, sin filas ni en una pestaña con aviso;
   - llama a la descarga con el indicador elegido, la red, el distrito y los municipios resueltos (y en Redes, con la red de la pestaña);
   - en Producción, con los parámetros de su pestaña;
   - «Exportando…» mientras descarga y el `AvisoError` si falla.
   - Los mocks de `@/api/indicadores.js` que montan la pantalla necesitan las dos funciones nuevas.
7. **Documentación.** La nota del módulo, el avance de HU-64 y `node scripts/mapa-obsidian.mjs`, luego `--revisar`.
8. **Prueba manual.** Con Epidemiología, contra la base de prueba:
   - exportar las siete pestañas de Hexavalente en agosto de 2026, una con distrito, una con dos municipios y una con red;
   - abrir cada archivo y comparar cada número con la pantalla;
   - comprobar que una suma y un promedio funcionan sobre cantidades y porcentajes;
   - exportar un mes con corrida parcial y ver «PRELIMINAR»;
   - comprobar el nombre del archivo en el navegador y la fila `EXPORTAR` en la bitácora.

## Criterios de aceptación

- [x] Cada una de las siete pestañas, con su tabla cargada, muestra «Exportar Excel» junto al título, que descarga un .xlsx con el nombre que define este spec.
- [x] El archivo trae la tabla de la pestaña elegida con los mismos filtros que la pantalla: cada número coincide con el que se ve, con distrito, con municipios, con red y sin filtro.
- [x] El encabezado trae el título, la DDRISS, el mes de corte de la corrida, el territorio, la fecha y hora de generación y quién lo generó.
- [x] Con una corrida parcial el archivo lleva «PRELIMINAR», y los avisos de la pantalla aparecen con el mismo texto.
- [x] Las cantidades y los porcentajes son números de Excel (una suma o un promedio funcionan sobre ellos), con separador de miles y formato de porcentaje.
- [x] La celda del indicador lleva el color del semáforo, «Cumple» dice «Sí» o «No», el excedente y la marca de más del 100 % tienen su columna, y los encabezados quedan fijos.
- [x] Cada descarga correcta deja una fila `EXPORTAR` del módulo `INDICADORES` con los parámetros, sin cantidades. Un 400 o un 404 no la deja.
- [x] Los dos endpoints piden `INDICADOR_CONSULTAR` y respetan la DDRISS del usuario, igual que sus endpoints de datos.
- [x] La pantalla no cambia fuera del botón: el recorte, los filtros y las gráficas siguen igual (sus pruebas pasan sin cambios).
- [x] El avance de HU-64 está en `HISTORIAS_DE_USUARIO.md` y el mapa está al día.
- [x] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** las siete pestañas. **No:** solo las cinco de indicadores, porque Producción ya filtra en el backend y Redes es la tabla que más se comparte.
- **Sí:** dos rutas junto a sus endpoints de datos. **No:** una sola ruta con parámetros distintos por vista (contrato difícil de leer) ni una ruta por pestaña (siete casi iguales).
- **Sí:** el backend recorta con una función propia probada contra la pantalla. **No:** mover el recorte a `GET /indicadores/resultados`, que cambia un endpoint en uso y las pruebas de la pantalla; queda como posible ajuste aparte.
- **Sí:** la tabla del indicador que se ve, en una hoja. **No:** una hoja por indicador del tipo ni los datos de las gráficas, que se pueden pedir después.
- **Sí:** `INDICADOR_CONSULTAR` y la bitácora en `INDICADORES`. **No:** un permiso nuevo, que toca el `05` sin un caso que lo pida, ni el módulo `REPORTES`, que es el de «Informes».
- **Sí:** porcentajes como fracción con formato de porcentaje, para que una fórmula de Excel los trate bien. **No:** guardar 85,3 con un « %» de formato.
- **Sí:** el color del semáforo en la celda y «Sí»/«No» en «Cumple», como se ve en pantalla. **No:** solo una columna de texto con el color.
- **Sí:** PDF fuera, señalando la diferencia con el mockup (`Indicadores.html` muestra «Exportar PDF»). **No:** hacerlo aquí ni crear ahora una historia para él.
- **Sí (decidido al escribir el spec):** el frontend manda el indicador, la red, el distrito y los municipios ya resueltos, no la URL tal cual (la nota del SPEC 49 en la HU-64 lo sugería), porque la pantalla elige por defecto la pestaña, el indicador y la red, y repetir esa elección en el backend sería otra regla duplicada.
- **Sí (decidido al escribir el spec):** archivos nuevos `tablaIndicadores.js` y `textosIndicadores.js`, como `textosInforme.js` del SPEC 65. **No:** importar las funciones del frontend desde el backend, que no comparten código.
- **Sí (decidido al escribir el spec):** sin tabla (pestaña con aviso), la pantalla no muestra el botón y el endpoint responde 400 si el indicador no está en la corrida. **No:** un libro vacío.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El recorte y las columnas del backend se desalinean de los del frontend con el tiempo. | Las pruebas comparan, con los mismos datos, lo que dan las dos versiones; una nota en el `CLAUDE.md` del módulo dice que un cambio va en los dos lados. |
| Los colores del semáforo del Excel no coinciden con el tema. | Los hex de `textosIndicadores.js` se copian de los colores de las insignias de la tabla (`--exito`, `--advertencia`, `--destructive` de `index.css`), con la misma nota de «un cambio va en los dos lados» que el SPEC 66. |
| El porcentaje como fracción confunde si alguien lee la celda sin formato. | El formato `0.0%` va en cada celda, y la prueba manual comprueba cómo se ve al abrir el archivo. |
| La fecha de generación sale corrida 6 h (nota de `mysql2` y Aiven). | Se calcula en Node con la zona `America/Guatemala`, como en el SPEC 64. |
| Un rol sin `INDICADOR_CONSULTAR` llega a la ruta. | El 403 y su `ACCESO_DENEGADO` son los de `requierePermiso`, y hay una prueba con una cuenta de ese rol. |
| Las pruebas de endpoints siembran población y crean alertas en todos los municipios (nota del SPEC 68). | Usar una DDRISS y un año ficticios propios y seguir la nota de limpieza del `CLAUDE.md` del backend. |

## Lo que **no** entra en este spec

- Exportar «Indicadores» a PDF.
- Gráficas, series o «Comparar periodos» en el archivo.
- Varias hojas o varias pestañas en un libro.
- Mover el recorte al backend en `GET /indicadores/resultados`.
- Un permiso propio para exportar o cambios al modelo de datos.

Cada uno, si llega, va en su propio spec.
