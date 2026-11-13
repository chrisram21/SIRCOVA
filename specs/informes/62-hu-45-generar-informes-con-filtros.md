# SPEC 62 — HU-45 Generar informes con filtros

> **Estado:** Implementado
> **Historia:** HU-45
> **Origen:** historia
> **Depende de:** SPEC 04, SPEC 06, SPEC 20, SPEC 39, SPEC 58, SPEC 59, SPEC 60 y SPEC 61
> **Fecha:** 2026-11-12
> **Objetivo:** Que la pantalla «Informes» genere los tres informes de producción que hoy arma la estadígrafa a mano (población propia, producción total y dosis por municipio de residencia), como una tabla con columnas por vacuna, grupo de edad y dosis, por departamento, municipio, distrito o establecimiento, para un rango de meses y uno o varios municipios o una red.

## Por qué existe este spec

La estadígrafa consolida cada mes tres Excel a partir de los 31 formularios 5C (sección 14.5 de `docs/contexto/CONTEXTO PROYECTO SIRCOVA.md`):

- **Excel 1**, producción a la **población propia** de cada municipio;
- **Excel 2**, **producción total**, sin importar de dónde sea la persona (incluye Migrantes);
- **Excel 3**, dosis **atribuidas al municipio de residencia**, solo de los municipios del departamento (base de la cobertura).

Los tres tienen una fila por municipio y una columna por vacuna y dosis bajo los encabezados de grupo de edad del 5C («< 1 año», «De 1 a < 6 años»…). El SPEC 61 ya muestra algo parecido al Excel 1 y 2 en Indicadores · Producción, pero solo para un mes o lo acumulado del año, sin grupos de edad, sin los niveles departamento y distrito y sin el Excel 3. Este spec crea la pantalla «Informes» que el menú ya tiene (`/informes`, hoy «En construcción») y el módulo `informes` del backend, donde irán también HU-46 a HU-49.

No hay mockup de la pantalla. Sigue el estilo de Indicadores · Producción (filtros arriba, tabla debajo).

**Lo que se decidió en la fase de preguntas (2026-11-12):**

- Pantalla nueva `/informes`. Indicadores · Producción no cambia.
- Permiso nuevo `INFORME_CONSULTAR` para el Revisor, Epidemiología y la Autoridad, en `05_permisos_mysql.sql`, que se vuelve a correr en la base de prueba. Autorizado por Luis (zona protegida).
- Por defecto cuentan solo los reportes cerrados (`CERRADO` y `RECTIFICACION`) en los tres informes. La casilla «Incluir aprobados sin cerrar» suma los `APROBADO` y marca el informe como preliminar.
- Tabla ancha, como el Excel: filas por unidad del nivel y columnas por vacuna, grupo de edad y dosis. El filtro Vacuna tiene «Todas las vacunas» (por defecto) o una.
- Las columnas separan el grupo de edad como el 5C, con las secciones del esquema de captura que cubre el último mes del rango, más las combinaciones con datos que ya no están en él. Se muestran todas, aunque den 0.
- El nivel Distrito agrupa los datos del municipio del distrito, en los tres informes. El Excel 3 no tiene nivel Establecimiento.
- El rango de meses puede cruzar años, sin límite de meses.
- El Hospital de San Marcos (`solo_cobertura`) se trata en el Excel 1 y el 2 como en el SPEC 61. En el Excel 3 sí suma.
- Filtros: rango, nivel, vacuna, municipios y red. No hay filtro de distrito.
- Botón «Generar»: los filtros pasan a la URL al pulsarlo, y recargar repite el informe.
- Módulo nuevo `informes` en el backend y en `specs/`.

## Alcance

**Entra:**

- **Permiso:** `INFORME_CONSULTAR` (módulo `REPORTES`) y su asignación al Revisor, Epidemiología y la Autoridad, en `backend/db/05_permisos_mysql.sql`. Correr el `05` en la base de prueba.
- **Backend** (módulo nuevo `backend/src/modulos/informes/`):
  - `informes.routes.js`, `informes.controller.js` e `informes.service.js`, montados con los demás módulos bajo `/api/v1`;
  - `GET /informes/opciones` y `GET /informes/produccion`, con `INFORME_CONSULTAR`;
  - primero en `backend/openapi.yaml` (esquemas `OpcionesInformes` e `InformeProduccion`);
  - la lectura de las secciones del esquema de captura que cubre un mes, en `modulos/configuracion/esquemas.service.js` (hoy `esquemasDelPeriodo` no trae `secciones`).
- **Frontend:**
  - `frontend/src/api/informes.js` con `obtenerOpcionesInformes` y `obtenerInforme`;
  - carpeta nueva `frontend/src/paginas/informes/` con `PaginaInformes.jsx`, `BarraFiltrosInformes.jsx`, `TablaInforme.jsx` y las funciones puras de `informes.js`;
  - `pagina: PaginaInformes` en la opción «Informes» de `componentes/layout/opcionesMenu.js`.
- Pruebas del backend (archivo nuevo `backend/tests/informes.test.js`) y del frontend (`informes.test.js`, `TablaInforme.test.jsx` y `PaginaInformes.test.jsx`).
- **Documentación del módulo nuevo:**
  - `backend/src/modulos/informes/CLAUDE.md` con sus notas;
  - la fila de `informes` en la tabla de «Notas de contexto» del `CLAUDE.md` de la raíz;
  - el avance de HU-45 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`.
- Hecho al crear este spec: la carpeta `informes` en la sección 7 de `AGENTS.md`, en `MODULOS` de `scripts/mapa-obsidian.mjs` y con su color en `.obsidian/graph.json`.

**Fuera de alcance (para otros specs):**

- Agrupar el informe por sexo u otra dimensión (HU-46). Este spec solo separa el grupo de edad, porque así lo hace el 5C.
- Exportar a Excel (HU-47) o a PDF (HU-48).
- El informe acumulado anual con población, cobertura y brecha (HU-49).
- Porcentajes, metas, semáforo o gráficas en los informes.
- Filtro de distrito, columna de total por fila (sumar vacunas distintas no tiene sentido) o tomar las columnas de varias versiones del esquema.
- Cambiar Indicadores · Producción, las vistas, el campo `solo_cobertura` o el modelo de datos.
- Cambiar la descripción de la opción «Informes» en el menú, que ya habla de Excel y PDF (llegan con HU-47 y HU-48).
- Registrar en la bitácora la consulta de un informe: solo se registran las escrituras, y la exportación (HU-47 y HU-48) sí quedará registrada.

## Modelo de datos

No hay tablas, colecciones ni vistas nuevas. Solo un permiso y dos endpoints de lectura.

### Permiso

```sql
-- 05_permisos_mysql.sql
('INFORME_CONSULTAR', 'REPORTES', 'Generar los informes de producción de su DDRISS')
-- Asignación: REVISOR, EPIDEMIOLOGIA y AUTORIDAD
```

- `REPORTES` es el módulo de informes de la bitácora (`bitacora.modulo`). Se agrega a la lista de códigos de módulo del encabezado del `05` como «REPORTES (SPEC 62, HU-45)».
- Aplica desde el siguiente inicio de sesión, porque los permisos viajan en el token.

### Los tres informes

Todos salen de `v_produccion`, filtrada por la DDRISS de la consulta. Se usa `v_produccion` y no las vistas del Excel porque las vistas no traen el grupo de edad ni cuentan los mismos estados. El grupo de edad sale de `detalle_dimension` con `dimension_codigo = 'grupo_edad'` (unión externa: una vacuna sin edad no tiene esa fila).

| `informe` | Nombre en pantalla | Qué suma | Por territorio |
|---|---|---|---|
| `poblacion-propia` | Producción a la población propia | `cantidad` con `es_poblacion_propia` | municipio de aplicación |
| `total` | Producción total (incluye Migrantes) | toda la `cantidad` | municipio de aplicación |
| `residencia` | Dosis por municipio de residencia | `cantidad` cuya procedencia es un municipio del departamento de la DDRISS | municipio de procedencia |

- **Estados:** por defecto, `CERRADO` y `RECTIFICACION` (un reporte en rectificación sigue con sus datos cerrados hasta que se resuelve, SPEC 41). Con `incluirAprobados=true`, también `APROBADO`. `BORRADOR`, `ENVIADO`, `EN_REVISION` y `CORRECCION_SOLICITADA` nunca cuentan.
- **`solo_cobertura`:** en `poblacion-propia` y `total` se trata como en el SPEC 61:
  - por establecimiento, es una fila con `fueraDelConsolidado: true` que no entra en el total;
  - en los demás niveles, no se suma;
  - lo que aplicó, con los mismos filtros, va aparte en `dosisFueraDelConsolidado`.
  En `residencia` suma como cualquier establecimiento, igual que `v_produccion_atribuida`.
- **Coincidencia con las vistas** (para las pruebas):
  - con `incluirAprobados=true`, el total por dosis de `poblacion-propia` y `total` coincide con `dosis_poblacion_propia` y `dosis_total` de `v_consolidado_establecimiento`;
  - sin rectificaciones abiertas y sin `incluirAprobados`, el total por dosis de `residencia` coincide con `v_produccion_atribuida`.

### Rango de meses

- `desde` y `hasta` en formato `AAAA-MM`, con `desde ≤ hasta`. Pueden ser de años distintos.
- Solo cuentan los meses del rango con fila en `cierre_periodo` de la DDRISS. `desde` o `hasta` sin esa fila da 404.
- `mesesSinCerrar`: los meses del rango con `cierre_periodo` que no están `CERRADO`.
- `preliminar` es `true` si `incluirAprobados` es `true` y hay `mesesSinCerrar`.

### Niveles

| `nivel` | Filas | Total |
|---|---|---|
| `departamento` | una: el departamento sede de la DDRISS | la fila |
| `municipio` | el universo de municipios dentro del recorte | suma de las filas |
| `distrito` | los distritos activos de la DDRISS cuyo municipio está en el recorte, cada uno con los datos de su municipio (`distrito_salud.municipio_id`); los municipios del recorte sin distrito activo van juntos en la fila «Sin distrito» | el del recorte, sin contar dos veces un municipio |
| `establecimiento` | el universo de establecimientos dentro del recorte (no en `residencia`) | suma de las filas que no son `fueraDelConsolidado` |

- **Universo de municipios** (como el SPEC 61):
  - en `poblacion-propia` y `total`, los activos del departamento sede sin el `9999`, más cualquier otro que sea municipio de aplicación de un establecimiento de la DDRISS con producción en el rango;
  - en `residencia`, los del departamento sede sin el `9999`: activos, más los inactivos con dosis atribuidas en el rango.
- **Universo de establecimientos:** los activos de la DDRISS con `reporta_5c` o `solo_cobertura`, más los inactivos o externos con producción en el rango.
- Todas las filas del universo salen, también las que están en cero, ordenadas por nombre (por establecimiento: por municipio y luego por nombre). «Sin distrito» va al final.

### Columnas

Una columna es una combinación de vacuna, sección (grupo de edad) y dosis.

- **Vacunas:** sin `vacuna`, las activas por `orden_informe` y nombre, más las inactivas con producción en el rango; con `vacuna`, solo esa.
- **Secciones:** las del esquema de captura que cubre el **último mes del rango** (día 1 de `hasta`), el de la DDRISS o, si no hay, el nacional (misma regla que `esquemasDelPeriodo`). Por cada sección, en su `orden`, una columna por cada dosis que lista, en el `orden` de la dosis. Una sección con `grupo_edad: null` toma las cantidades sin grupo de edad.
- **Combinaciones con datos fuera del esquema:** una combinación de grupo de edad y dosis con producción en el rango que no está en ese esquema (de una versión anterior) va al final de su vacuna. Su título es la `descripcion` de `clasificacion_poblacion` para ese código, o el código si no está en el catálogo, o ninguno si no tiene grupo de edad.
- **Vacuna sin esquema para ese mes:** una columna por dosis activa, sin sección, más las combinaciones con datos.
- Se muestran todas las columnas, aunque den 0 en todo el informe.

### `GET /informes/opciones`

Parámetro: `ddrissId` (solo la Autoridad nacional, que sin él recibe 400 `ENTRADA_INVALIDA`; los demás usan la suya).

```js
{
  meses: [{ anio: 2026, mes: 8, estado: 'CERRADO' }],   // los de cierre_periodo de la DDRISS
  vacunas: [{ codigo: 'HEXA', nombre: 'Hexavalente', activa: true }], // activas por orden_informe, más las inactivas con producción en la DDRISS
  municipios: [{ id: 4, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' }], // del departamento sede sin 9999, más los de aplicación externos con producción
}
```

Las redes no van aquí: se leen de `GET /redes` con `RED_CONSULTAR`, como en el SPEC 60.

### `GET /informes/produccion`

Parámetros (se revisan con `revisarParametros`; uno inválido, desconocido o repetido da 400 `ENTRADA_INVALIDA`):

| Parámetro | Valor | Por defecto |
|---|---|---|
| `informe` | `poblacion-propia` \| `total` \| `residencia` | obligatorio |
| `desde` | `AAAA-MM` | obligatorio |
| `hasta` | `AAAA-MM` | obligatorio |
| `nivel` | `departamento` \| `municipio` \| `distrito` \| `establecimiento` | `municipio` |
| `vacuna` | código; sin él, todas | — |
| `redId` | id; recorta a los municipios actuales de la red | — |
| `municipioIds` | lista `1,4`; con `redId`, se cruza con la red | — |
| `incluirAprobados` | `true` \| `false` | `false` |
| `ddrissId` | solo la Autoridad nacional | — |

- 400: `desde > hasta`; `nivel=establecimiento` con `informe=residencia`; la Autoridad nacional sin `ddrissId`.
- 404 `NO_ENCONTRADO`: una red inexistente, inactiva o de otra DDRISS; una vacuna inexistente; `desde` o `hasta` sin `cierre_periodo` de la DDRISS; un `ddrissId` inexistente.
- Los recortes (`redId`, `municipioIds`) se aplican al municipio de aplicación en `poblacion-propia` y `total`, y al de residencia en `residencia`.

Respuesta:

```js
{
  informe: 'poblacion-propia', nivel: 'establecimiento',
  desde: { anio: 2026, mes: 1 }, hasta: { anio: 2026, mes: 8 },
  incluirAprobados: false,
  columnas: [{
    vacuna: { codigo: 'HEXA', nombre: 'Hexavalente' },
    seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' },   // null sin sección
    dosis: { id: 7, codigo: 'D1' },
  }],
  filas: [{
    id: 31, codigo: 'HOSP-SM', nombre: 'Hospital de San Marcos',  // id null en «Sin distrito»
    municipio: { id: 1, nombre: 'San Marcos' },                    // solo por establecimiento y por distrito
    fueraDelConsolidado: true,                                     // false salvo solo_cobertura por establecimiento
    cantidades: [120, 0, 35],                                      // en el orden de columnas
  }],
  total: { cantidades: [940, 12, 310] },
  dosisFueraDelConsolidado: 155,   // 0 en residencia
  mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }],
  preliminar: false,
}
```

### Pantalla «Informes»

- **Ruta:** `/informes`, con `INFORME_CONSULTAR`. Título «Informes».
- **Filtros** (`BarraFiltrosInformes.jsx`):
  - **Informe:** los tres nombres de la tabla de arriba, con una línea de ayuda debajo según el elegido:
    - «Dosis que cada municipio o establecimiento aplicó a personas de su propio municipio.»
    - «Todas las dosis que aplicó, sin importar de dónde sea la persona. Incluye Migrantes.»
    - «Dosis atribuidas al municipio donde vive la persona, solo municipios del departamento. Es la base de la cobertura.»
  - **Desde** y **Hasta:** un select Año + un select Mes cada uno (SPEC 58), con los meses de `opciones.meses`.
  - **Nivel:** Departamento, Municipio, Distrito y Establecimiento. Con el informe por residencia, Establecimiento está deshabilitado; si estaba elegido, pasa a Municipio.
  - **Vacuna:** `SelectorConBusqueda` con «Todas las vacunas».
  - **Red:** con `RED_CONSULTAR` y redes activas, como el SPEC 60. Elegir una red borra los municipios elegidos, y elegir municipios borra la red.
  - **Municipios:** el `MenuMunicipios` de `paginas/indicadores/BarraFiltrosIndicadores.jsx`, recortado a la red si hay una.
  - Casilla **«Incluir aprobados sin cerrar»**.
  - **DDRISS:** solo la Autoridad nacional, como en Indicadores.
  - Botón **«Generar»**.
- **Valores por defecto:** el informe `poblacion-propia`, nivel Municipio y todas las vacunas. «Hasta» es el último mes `CERRADO` de `opciones.meses`, o el último mes si no hay cerrados. «Desde» es enero de ese año, o el primer mes habilitado de ese año.
- **URL:** al pulsar «Generar», los filtros se escriben en la URL:
  - `informe`, `desde=2026-01`, `hasta=2026-08` y `nivel`;
  - `vacuna` (sin ella, todas), `red`, `municipios=1,4`, `aprobados=si` y `ddriss`;
  - se omiten los valores por defecto, salvo `informe`, `desde` y `hasta`.
  La página genera el informe cuando la URL trae `informe`, `desde` y `hasta`. Cambiar un filtro no cambia la URL ni el informe hasta pulsar «Generar».
- **Encabezado del informe:** «{Nombre del informe} · {nivel}» y «De enero de 2026 a agosto de 2026» (con `nombreDelMes` de `lib/fechas.js`), más la insignia «Preliminar» si `preliminar`.
- **Avisos encima de la tabla:**
  - con `preliminar`: «Datos preliminares: {meses} todavía no están cerrados.»;
  - con `mesesSinCerrar` y sin la casilla: «{meses} todavía no están cerrados y no suman en el informe. Marca «Incluir aprobados sin cerrar» para verlos como preliminares.»
- **Tabla** (`TablaInforme.jsx`, con el `Table` de shadcn):
  - encabezado en tres filas: vacuna (abarca sus columnas), sección (abarca sus dosis; vacía sin sección) y dosis (su código: D1, R1, UNICA…);
  - primera columna fija con el nombre de la fila (y su municipio como detalle por establecimiento); desplazamiento horizontal para las demás;
  - las filas `fueraDelConsolidado` llevan la insignia «No suma en el consolidado»;
  - fila final «Total» y, si `dosisFueraDelConsolidado > 0`, debajo: «Además, {n} dosis de establecimientos que no suman en el consolidado.»;
  - cantidades enteras con separador de miles; sin porcentajes.
- **Estados:**
  - antes de generar: «Elige el informe y los filtros y pulsa «Generar».»;
  - carga: esqueletos (la primera, con `PantallaCargaSesion`, como Indicadores);
  - error: `AvisoError` con `onReintentar`;
  - sin meses en `cierre_periodo`: «La DDRISS no tiene meses habilitados.»
- La pantalla no menciona los Excel.

### Funciones puras (`paginas/informes/informes.js`)

- `filtrosDeInforme(parametros, opciones)`: los filtros de la URL, con los valores por defecto.
- `parametrosDeInforme(valores)`: los parámetros de la URL que escribe «Generar», sin los valores por defecto.
- `encabezadosDeTabla(columnas)`: las tres filas del encabezado, con cuántas columnas abarca cada vacuna y cada sección.
- `textoRango(desde, hasta)` y `textoMesesSinCerrar(meses)`.

## Plan de implementación

1. **Permiso.** `INFORME_CONSULTAR` y su asignación en `05_permisos_mysql.sql`. Correr el `05` en la base de prueba y comprobar con una consulta que el Revisor, Epidemiología y la Autoridad lo tienen y los otros dos roles no.
2. **Contrato.** `GET /informes/opciones` y `GET /informes/produccion` en `backend/openapi.yaml`, con sus esquemas, parámetros, 400, 403 y 404.
3. **Módulo y opciones.** Crear `backend/src/modulos/informes/` (rutas, controlador y servicio), montarlo con los demás y escribir `opcionesDeInformes`. Pruebas en `informes.test.js`: el universo de vacunas y municipios; la Autoridad nacional con y sin `ddrissId`; 403 para el Personal del establecimiento y el Administrador.
4. **Columnas.** La lectura de secciones en `esquemas.service.js` y `columnasDelInforme` en `informes.service.js`. Pruebas con una vacuna ficticia y su esquema de prueba en MongoDB, que se borra al terminar:
   - secciones y dosis en orden;
   - una combinación con datos fuera del esquema va al final de su vacuna;
   - una vacuna sin esquema sale con sus dosis activas.
5. **Informes por municipio y departamento.** `informePorFila` con los tres informes, el rango, los estados, `incluirAprobados`, los recortes, `mesesSinCerrar` y `preliminar`. Pruebas con el año 2086, el departamento ficticio `Z8`, la DDRISS `ZVT_INF62`, los municipios `Z801` a `Z803`, los establecimientos `vitest-spec62-` (uno `solo_cobertura`) y la vacuna `ZVT_SPEC62`, todo por SQL y borrado al inicio y al final:
   - los totales coinciden con las vistas, en los casos de «Coincidencia con las vistas»;
   - el grupo de edad se reparte en sus columnas;
   - un reporte `APROBADO` solo cuenta con la casilla;
   - un rango que cruza años;
   - 400 con `desde > hasta`, y 404 con un mes sin `cierre_periodo` y con una red de otra DDRISS.
6. **Niveles distrito y establecimiento.** Las filas por distrito (con «Sin distrito»), por establecimiento (con `fueraDelConsolidado` y `dosisFueraDelConsolidado`) y el 400 de `residencia` con `establecimiento`. Pruebas en el mismo archivo.
7. **API del frontend y funciones puras.** `api/informes.js` y `paginas/informes/informes.js` con `informes.test.js`.
8. **Tabla.** `TablaInforme.jsx` con `TablaInforme.test.jsx`:
   - el encabezado de tres filas con sus `colSpan`;
   - la insignia y la línea de lo que no suma;
   - la fila «Total» y el separador de miles.
9. **Pantalla.** `PaginaInformes.jsx` y `BarraFiltrosInformes.jsx`, y `pagina: PaginaInformes` en `opcionesMenu.js`. Pruebas en `PaginaInformes.test.jsx`:
   - valores por defecto;
   - «Generar» escribe la URL y recargar con la URL genera el informe;
   - Establecimiento se deshabilita con el informe por residencia;
   - la red borra los municipios;
   - los avisos de meses sin cerrar y de preliminar.
10. **Cierre.**
    - `backend/src/modulos/informes/CLAUDE.md`, la fila de `informes` en la tabla de «Notas de contexto» del `CLAUDE.md` de la raíz y el avance de HU-45 en `HISTORIAS_DE_USUARIO.md`.
    - Prueba manual con el Revisor, Epidemiología y la Autoridad: los tres informes de enero a agosto de 2026, en los cuatro niveles, con la Red No. 1 y con dos municipios.
    - Comparar un total contra la pestaña Producción de Indicadores (mismo mes, `total`, con aprobados).

## Criterios de aceptación

- [ ] «Informes» aparece en el menú del Revisor, Epidemiología y la Autoridad, y no en el del Personal del establecimiento ni en el del Administrador; los endpoints responden 403 a estos dos.
- [ ] Se generan los tres informes: «Producción a la población propia», «Producción total (incluye Migrantes)» y «Dosis por municipio de residencia».
- [ ] Se eligen el mes inicial y el final (también de años distintos) y uno o varios municipios, o una red.
- [ ] Se elige el nivel: departamento, municipio, distrito o establecimiento; con el informe por residencia, Establecimiento no se puede elegir.
- [ ] Las columnas siguen el esquema de captura: vacuna, sección de grupo de edad y dosis, en el orden del 5C, también las que dan 0.
- [ ] Sin la casilla, solo cuentan los reportes `CERRADO` y `RECTIFICACION`, y los totales coinciden con la suma de los reportes cerrados del rango.
- [ ] Con «Incluir aprobados sin cerrar», cuentan también los `APROBADO`, y si el rango tiene meses sin cerrar se ven la insignia y el aviso «Preliminar».
- [ ] Con la casilla, el total del informe de población propia y el de producción total coinciden con `v_consolidado_establecimiento` para el mismo rango y filtros.
- [ ] Sin la casilla y sin rectificaciones abiertas, el total del informe por residencia coincide con `v_produccion_atribuida`.
- [ ] Por establecimiento, el Hospital de San Marcos sale con «No suma en el consolidado» y fuera del total; en los demás niveles no suma, y la línea de debajo da sus dosis. En el informe por residencia sí suma.
- [ ] Por distrito, cada distrito muestra los datos de su municipio y el total no cuenta dos veces un municipio.
- [ ] «Generar» deja los filtros en la URL; recargar repite el mismo informe, y cambiar un filtro sin pulsar «Generar» no lo cambia.
- [ ] Los parámetros inválidos responden 400 y la red, la vacuna o el mes que no corresponden, 404.
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** pantalla nueva `/informes`, que el menú ya tenía. **No:** ampliar Indicadores · Producción, que mezclaría informes con indicadores y dejaría vacía la opción «Informes».
- **Sí:** módulo nuevo `informes`, en el backend y en `specs/`, donde caen HU-46 a HU-49. **No:** meterlo en `indicadores`, que ya tiene el motor, el Inicio, las gráficas y el mapa.
- **Sí:** `INFORME_CONSULTAR` en el `05`, que se puede volver a correr, como `RED_CONSULTAR` en el SPEC 59. **No:** un script `14` solo para un permiso. **No:** reutilizar `INDICADOR_CONSULTAR`, porque el menú ya pedía un permiso propio y los informes se exportarán con su propia bitácora.
- **Sí:** el Revisor (la estadígrafa), Epidemiología y la Autoridad (su rol dice «consulta de resultados e informes»). **No:** el Administrador, que gestiona catálogos y no consolida producción.
- **Sí:** por defecto, solo reportes cerrados, como dice la historia, en los tres informes; la casilla suma los aprobados y marca el informe como preliminar. **No:** lo que cuenta cada vista (aprobados en el Excel 1 y 2, solo cerrados en el 3), porque los tres informes del mismo rango no cuadrarían entre sí.
- **Sí:** `RECTIFICACION` cuenta como cerrado: sus datos son los cerrados hasta que se resuelve. **No:** sacarlo como hace `v_produccion_atribuida`, que haría bajar el informe mientras dura una rectificación.
- **Sí:** consultar `v_produccion` con `detalle_dimension` y repetir las reglas de las vistas. **No:** consultar las vistas, que no tienen el grupo de edad. **No:** cambiar las vistas, que usa el motor de indicadores.
- **Sí:** tabla ancha como el Excel, con «Todas las vacunas» por defecto. **No:** formato largo (una fila por unidad, vacuna y dosis), que no se parece a lo que usa la estadígrafa. **No:** selección de varias vacunas.
- **Sí:** columnas por sección de grupo de edad, como el 5C. Agrupar por sexo u otra dimensión sigue siendo HU-46.
- **Sí:** las secciones del esquema que cubre el último mes del rango, más las combinaciones con datos que no están en él. **No:** unir todas las versiones usadas en el rango, que lee varias versiones de MongoDB y puede dar órdenes que chocan.
- **Sí:** el esquema que cubre el día 1 de `hasta`, con la regla de `esquemasDelPeriodo` (DDRISS sobre nacional). **No:** el `VIGENTE` sin fecha, que puede empezar en un mes futuro (SPEC 20).
- **Sí:** todas las columnas y todas las filas, también en cero, para que no cambien de un mes a otro. **No:** ocultar columnas en cero.
- **Sí:** el distrito agrupa los datos de su municipio, como el filtro de Indicadores (SPEC 49 y 61). **No:** agrupar por `establecimiento.distrito_salud_id`, que haría que el Excel 1 y 2 agruparan distinto que el 3.
- **Sí:** «Sin distrito» para los municipios del recorte sin distrito activo, para que las filas cuadren con el total.
- **Sí:** el rango puede cruzar años y no tiene límite. **No:** limitarlo a un año; el acumulado anual con cobertura es otra historia (HU-49).
- **Sí:** el Hospital de San Marcos como en el SPEC 61 en el Excel 1 y 2, y sumando en el 3. **No:** quitarlo del todo, porque no se vería lo que aplicó.
- **Sí:** filtro de red, como preset de municipios (SPEC 60). **No:** filtro de distrito, porque el nivel Distrito ya lo cubre.
- **Sí:** botón «Generar» y filtros en la URL al pulsarlo, como pide HU-46 («cambiar la agrupación sin volver a generar el filtro») y para que HU-47 y HU-48 exporten el informe de la URL. **No:** generar en vivo con cada cambio, que con rangos largos pide muchas consultas pesadas.
- **Sí:** un endpoint de opciones propio con `INFORME_CONSULTAR`. **No:** `GET /indicadores/produccion/opciones`, que pide `INDICADOR_CONSULTAR`.
- **Sí:** sin columna de total por fila: sumar dosis de vacunas distintas no tiene sentido. La fila «Total» sí va.
- **Sí:** reutilizar `MenuMunicipios` y `SelectorConBusqueda`. **No:** un selector múltiple nuevo.
- **Sí (agregado en la implementación, paso 2):** `GET /informes/opciones` no tiene 404: un `ddrissId` inexistente da listas vacías, como `GET /indicadores/produccion/opciones`. El 404 por DDRISS inexistente queda solo en `GET /informes/produccion`.
- **Sí (agregado en la implementación, paso 3):** `opcionesDeInformes` reutiliza `municipiosDelUniverso` y `PRODUCCION_DE_LA_DDRISS` de `indicadores/produccion.service.js` (solo se exportaron). **No:** copiarlos.
- **Sí (agregado en la implementación, paso 5):** el universo de filas cuenta los municipios y establecimientos con datos **en el rango**, como dice este spec; el contrato decía «el de las opciones» y se corrigió. Las opciones siguen con producción en cualquier mes.
- **Sí (agregado en la implementación, prueba manual, decidido con Luis):** un esquema sin secciones (anterior a la v0.4) las deduce como la captura, con `seccionesDeducidas` de `produccion/celdas.service.js` (exportada), y el título sale de `clasificacion_poblacion`. Hexavalente v1 cubre de enero a septiembre de 2026: tratarlo como «sin esquema» (lo hecho en el paso 4) dejaba cuatro columnas sin sección siempre en 0 y los datos al final. **No:** dejarlo así.
- **Sí (agregado en la implementación, paso 7):** además de las funciones puras del spec, `informes.js` tiene `rangoPorDefecto`, `nivelPermitido`, `aTextoDeMes` y `avisoDeMeses` (los dos avisos de meses sin cerrar, en singular o plural). `conConsulta` de `api/indicadores.js` se exportó para `api/informes.js`.
- **Sí (agregado en la implementación, paso 9):** `RutaConPermiso.test.jsx` usaba `/informes` como pantalla «En construcción»; ahora usa `/alertas`, y una prueba nueva comprueba que `/informes` abre su pantalla.
- **Sí (prueba manual):** con datos reales, el informe por residencia de enero a agosto de 2026 da 36, 34 y 33 dosis de Hexavalente más que `v_produccion_atribuida`: son las del reporte 228 (agosto, en `RECTIFICACION`), que este informe cuenta como cerrado. Es el riesgo previsto.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Con «Todas las vacunas», la tabla tiene cerca de cien columnas. | Primera columna fija y desplazamiento horizontal; el filtro Vacuna la acota. Es el mismo ancho que el Excel. |
| Un rango de varios años es lento en Aiven. | Una sola consulta agrupada por establecimiento, procedencia, vacuna, dosis y grupo de edad; las opciones y el esquema se leen en paralelo. |
| El esquema cambió dentro del rango y una columna vieja queda al final de su vacuna, fuera del orden del 5C. | Es lo acordado: no se pierde ninguna dosis. Queda en la nota del módulo. |
| Dos distritos activos en un mismo municipio repiten los mismos datos en dos filas. | El total sale del recorte, no de las filas. En los datos de prueba hay un distrito por municipio. |
| El informe por residencia y los indicadores no cuadran mientras dura una rectificación (el motor usa `v_produccion_atribuida`, que solo cuenta `CERRADO`). | Queda en las decisiones y en la nota del módulo; al resolverse la rectificación vuelven a cuadrar. |
| Un usuario con sesión abierta no ve «Informes» después de correr el `05`. | Los permisos viajan en el token: aparece al volver a iniciar sesión (a más tardar en 2 h). |
| Las pruebas chocan con los datos reales o con otras pruebas en paralelo. | Año 2086, departamento `Z8`, DDRISS, municipios, vacuna y esquema ficticios propios, borrados al inicio y al final. |

## Lo que **no** entra en este spec

- Agrupar por sexo u otra dimensión (HU-46).
- Exportar a Excel o PDF (HU-47 y HU-48).
- El acumulado anual con población, cobertura y brecha (HU-49).
- Porcentajes, metas, semáforo o gráficas.
- Filtro de distrito, columna de total por fila y columnas de varias versiones del esquema.
- Cambios a Indicadores · Producción, a las vistas, a `solo_cobertura` o al modelo de datos.

Cada uno, si llega, va en su propio spec.
