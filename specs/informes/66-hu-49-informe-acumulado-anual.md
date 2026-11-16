# SPEC 66 — HU-49 Informe acumulado anual

> **Estado:** Aprobado
> **Historia:** HU-49
> **Origen:** historia
> **Depende de:** SPEC 17, SPEC 43, SPEC 45, SPEC 62, SPEC 63, SPEC 64 y SPEC 65
> **Fecha:** 2026-11-15
> **Objetivo:** Que la pantalla «Informes» genere el acumulado anual por vacuna y municipio, con las dosis atribuidas por residencia de enero a diciembre, la población anual, la cobertura y la brecha contra la meta, avise los meses del año sin cerrar y se exporte a Excel y PDF.

## Por qué existe este spec

Al cierre del año, Epidemiología presenta las dosis acumuladas de cada municipio contra su población. Hoy la pantalla «Informes» (SPEC 62) suma dosis en un rango de meses, pero no trae población, cobertura ni brecha. El motor de indicadores (SPEC 44 y 45) sí las calcula, pero solo para los indicadores configurados y mes a mes.

Este spec agrega un cuarto informe, «Acumulado anual», a la misma pantalla. Las dosis salen del informe por residencia, la población de `poblacion_objetivo` y la meta de los indicadores configurados.

**Lo que se decidió en la fase de preguntas (2026-11-15):**

- Cuarta opción del selector Informe de `/informes`. El rango Desde/Hasta se cambia por un selector Año.
- Mismas columnas que el informe por residencia (vacuna × grupo de edad × dosis).
- Cada unidad ocupa cuatro filas: Dosis, Población, Cobertura % y Brecha.
- Dosis atribuidas al municipio de residencia, con `CERRADO` y `RECTIFICACION`. La casilla «Incluir aprobados sin cerrar» suma los `APROBADO` como preliminar.
- El aviso lista los meses del año sin cerrar, también los que no tienen `cierre_periodo`.
- Brecha: dosis que faltan para la meta, ⌈meta × población − dosis⌉, mínimo 0.
- Meta de cada columna: la del indicador `COBERTURA` que aplica a esa vacuna, dosis y grupo de población; si no hay, la del `BRECHA`; sin indicador, 95 %. Se edita como hoy, publicando una versión del indicador (SPEC 43). No toca la base de datos.
- Niveles: departamento, municipio y distrito. El distrito usa la población de su municipio. Si a un municipio le falta la población, su cobertura y su brecha salen «—», y también las del total.
- Se exporta a Excel y PDF con los botones de los SPEC 64 y 65.

## Alcance

**Entra:**

- **Contrato** en `backend/openapi.yaml`:
  - `GET /informes/acumulado-anual`, `GET /informes/acumulado-anual/excel` y `GET /informes/acumulado-anual/pdf`, con `x-permiso: INFORME_CONSULTAR`;
  - esquema `InformeAcumuladoAnual` y parámetro `anio`; los demás parámetros y errores salen de `components` (SPEC 64).
- **Backend** (`backend/src/modulos/informes/`):
  - archivo nuevo `acumuladoAnual.service.js` con el informe: dosis, población, metas y cálculos;
  - reutiliza de `informes.service.js` las columnas, las filas por nivel, los recortes y la consulta de dosis por residencia (se exportan o se separan en funciones, sin cambiar lo que devuelven los SPEC 62 y 63);
  - reutiliza `dosisQueFaltan` de `indicadores/calculadores.js` (se exporta) e `indicadoresQueAplican` de `configuracion/indicadores.service.js`;
  - `exportarInforme` acepta el acumulado anual; el armado del Excel (`informeExcel.service.js`) y del PDF (`informePdf.service.js`) agrega las cuatro filas por unidad;
  - los textos nuevos en `textosInforme.js`;
  - las rutas y los controladores.
- **Frontend:**
  - `obtenerAcumuladoAnual`, `descargarAcumuladoAnualExcel` y `descargarAcumuladoAnualPdf` en `frontend/src/api/informes.js`;
  - en `paginas/informes/`: la opción «Acumulado anual» y el selector Año en `BarraFiltrosInformes.jsx`; la tabla de cuatro filas por unidad en `TablaInforme.jsx` (con props nuevas, sin crear otra tabla); los avisos, el encabezado y la exportación en `PaginaInformes.jsx`; las funciones puras en `informes.js`.
- **Pruebas:** casos nuevos en `backend/tests/informes.test.js`, `informeExcel.test.js` e `informePdf.test.js`, y en `frontend/src/paginas/informes/` (`informes.test.js`, `TablaInforme.test.jsx` y `PaginaInformes.test.jsx`).
- **Documentación:** una nota en `backend/src/modulos/informes/CLAUDE.md` y el avance de HU-49 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`.

**Fuera de alcance (para otros specs):**

- Una meta general por DDRISS o por vacuna guardada en la base, o que el Administrador edite la meta (hoy solo Epidemiología edita los indicadores).
- Nivel establecimiento: los establecimientos no tienen población.
- «Agrupar por» (HU-46) en el acumulado anual: la población es por grupo de edad, no por sexo ni por otra dimensión.
- Prorrateo mensual de la población (el acumulado es contra la población anual completa).
- Semáforo, colores por umbral, gráficas o la marca de coberturas mayores al 100 % (HU-44) en el informe.
- Comparar con el año anterior o un rango de años.
- Guardar el informe o sus resultados en `resultado_indicador` u otra tabla.
- Cambiar los informes de los SPEC 62 a 65, el motor de indicadores, las vistas, los permisos o el modelo de datos.

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. Se leen `v_produccion`, `detalle_dimension`, `cierre_periodo`, `poblacion_objetivo`, `clasificacion_poblacion` y `configuracion_indicadores`.

### Dosis

- Las del informe `residencia` del SPEC 62: cantidad cuya procedencia es un municipio del departamento de la DDRISS, por municipio de procedencia.
- Meses: enero a diciembre de `anio` con fila en `cierre_periodo` de la DDRISS.
- Estados: `CERRADO` y `RECTIFICACION`; con `incluirAprobados=true`, también `APROBADO`.
- El Hospital de San Marcos (`solo_cobertura`) suma, como en el informe por residencia.

### Población

- `poblacion_objetivo.cantidad` del municipio, del año `anio` y de la `clasificacion_poblacion` cuyo `codigo` es el `grupo_edad` de la sección de la columna.
- Una columna sin grupo de edad, o con un grupo que no está en `clasificacion_poblacion`, no tiene población.
- La población de un distrito es la de su municipio; la de «Sin distrito», la suma de sus municipios.
- La del departamento y la del total es la suma de los municipios del recorte, si todos la tienen; si falta en uno, no hay población.

### Meta de cada columna

1. Se leen las versiones que aplican hoy a la DDRISS con `indicadoresQueAplican`.
2. Se descartan las que tienen `filtros_dimension` en `aplica_a[0]`: miden un subconjunto, no la columna entera.
3. Una versión corresponde a la columna si su `aplica_a[0]` tiene la misma vacuna, la misma dosis y la `clasificacion_poblacion` igual al grupo de edad de la columna.
4. Manda la de `tipo_calculo` `COBERTURA`; si no hay, la de `BRECHA`. Si hay varias del mismo tipo, la primera por `codigo`.
5. La meta es `meta.valor` de esa versión; sin versión, 95.

### Cálculos por celda

| Cifra | Valor |
|---|---|
| Dosis | suma de las dosis de la celda |
| Población | la de arriba, o `null` |
| Cobertura % | dosis ÷ población × 100, redondeada a 1 decimal; `null` sin población o con población 0 |
| Brecha | `dosisQueFaltan(meta, población, dosis)` = máx(0, ⌈meta ÷ 100 × población − dosis⌉); `null` sin población o con población 0 |

- La fila del total calcula cobertura y brecha con sus propias dosis y población, como la fila departamental del motor. No suma las brechas de las filas.
- Una cobertura mayor a 100 % se muestra tal cual.

### Columnas y filas

- **Columnas:** las de `columnasDelInforme` del SPEC 62, con el esquema que cubre el día 1 del **último mes del año con `cierre_periodo`**. Cada columna lleva además su `meta`.
- **Filas:** `filasDelNivel` con `informe = residencia`: departamento, municipio o distrito. `nivel=establecimiento` da 400.
- Recortes `redId` y `municipioIds` sobre el municipio de residencia, como el SPEC 62.

### Meses sin cerrar

- `mesesSinCerrar`: los doce meses de `anio` que no están `CERRADO` en `cierre_periodo`, en orden. Un mes sin fila sale con `estado: null`.
- `preliminar`: `incluirAprobados` y algún mes con `cierre_periodo` sin cerrar.

### `GET /informes/acumulado-anual`

Parámetros (con `revisarParametros`):

| Parámetro | Valor | Por defecto |
|---|---|---|
| `anio` | `AAAA` | obligatorio |
| `nivel` | `departamento` \| `municipio` \| `distrito` | `municipio` |
| `vacuna` | código; sin él, todas | — |
| `redId` | id | — |
| `municipioIds` | lista `1,4` | — |
| `incluirAprobados` | `true` \| `false` | `false` |
| `ddrissId` | solo la Autoridad nacional | — |

- 400 `ENTRADA_INVALIDA`: `anio` que falta o no es un año; `nivel=establecimiento`; un parámetro desconocido o repetido; la Autoridad nacional sin `ddrissId`.
- 404 `NO_ENCONTRADO`: el año sin ningún mes en `cierre_periodo` de la DDRISS; una red o una vacuna que no corresponde; un `ddrissId` inexistente.

Respuesta:

```js
{
  informe: 'acumulado-anual', nivel: 'municipio', anio: 2026,
  incluirAprobados: false,
  columnas: [{
    vacuna: { codigo: 'HEXA', nombre: 'Hexavalente' },
    seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' },   // null sin sección
    dosis: { id: 7, codigo: 'D3' },
    meta: { valor: 95, indicador: 'COB_HEXA3' },            // indicador null con el 95 por defecto
  }],
  filas: [{
    id: 1, codigo: '1201', nombre: 'San Marcos',
    municipio: null,                       // { id, nombre } solo por distrito
    dosis: [850], poblacion: [1000], cobertura: [85.0], brecha: [100],   // en el orden de columnas
  }],
  total: { dosis: [850], poblacion: [1000], cobertura: [85.0], brecha: [100] },
  mesesSinCerrar: [{ anio: 2026, mes: 11, estado: 'ABIERTO' }, { anio: 2026, mes: 12, estado: null }],
  preliminar: false,
}
```

`GET /informes/acumulado-anual/excel` y `/pdf` reciben los mismos parámetros, dan los mismos errores y dejan `EXPORTAR` del módulo `REPORTES` en la bitácora (`entidad` `informe`, `informe: 'acumulado-anual'`, los parámetros y el `formato`), igual que el SPEC 64.

### Pantalla

- **Selector Informe:** cuarta opción «Acumulado anual», con la ayuda «Dosis acumuladas de enero a diciembre por municipio de residencia, contra la población del año, con su cobertura y su brecha.»
- Con «Acumulado anual»:
  - Desde y Hasta se cambian por el selector **Año**, con los años de `opciones.meses`; por defecto, el último año con un mes `CERRADO`, o el último año;
  - Nivel ofrece Departamento, Municipio y Distrito; si estaba Establecimiento, pasa a Municipio;
  - «Agrupar por» no se muestra;
  - Vacuna, Red, Municipios, «Incluir aprobados sin cerrar» y DDRISS siguen igual.
- **URL** al pulsar «Generar»: `informe=acumulado-anual` y `anio=2026`, más los demás parámetros del SPEC 62. La página genera el acumulado cuando la URL trae `informe=acumulado-anual` y `anio`.
- **Encabezado:** «Acumulado anual · {nivel}» y «Enero a diciembre de 2026», más la insignia «Preliminar» si `preliminar`.
- **Avisos encima de la tabla:**
  - con `mesesSinCerrar` y sin la casilla: «{meses} de 2026 todavía no están cerrados y no suman en el acumulado. Marca «Incluir aprobados sin cerrar» para verlos como preliminares.»;
  - con `preliminar`: «Datos preliminares: {meses} de 2026 todavía no están cerrados.»;
  - si algún mes sin cerrar no tiene `cierre_periodo`, el texto lo dice igual: el aviso no distingue el estado.
- **Tabla** (`TablaInforme.jsx`):
  - el encabezado de tres filas del SPEC 62, más una cuarta con la meta de cada columna («Meta 95 %»);
  - una segunda columna fija «Cifra» con Dosis, Población, Cobertura % y Brecha, y el nombre de la unidad en la primera, abarcando sus cuatro filas;
  - «—» en población, cobertura y brecha cuando son `null`;
  - cobertura con un decimal y «%»; las demás cifras enteras con separador de miles;
  - las cuatro filas del «Total» al final.
- **Exportar Excel y PDF:** los botones del SPEC 65 llaman a los endpoints del acumulado con los parámetros de la URL. El archivo repite el encabezado, los avisos, la fila de metas y las cuatro filas por unidad.

### Funciones puras (`paginas/informes/informes.js`)

- `filtrosDeInforme` y `parametrosDeInforme` aceptan `anio` y lo usan en lugar de `desde`/`hasta` con el acumulado anual.
- `anioPorDefecto(meses)`.
- `textoAnio(anio)` y el aviso de meses sin cerrar del acumulado, con el año.
- `textoCobertura(valor)`: «85,0 %» o «—».

## Plan de implementación

1. **Contrato.** Los tres endpoints en `backend/openapi.yaml`, con `InformeAcumuladoAnual`, el parámetro `anio` y sus 400, 403 y 404.
2. **Separar lo reutilizable.** En `informes.service.js`, dejar como funciones exportadas las columnas, las filas por nivel, los recortes y la consulta de dosis por residencia, y exportar `dosisQueFaltan`. Correr `informes.test.js` y `corridas.test.js`: deben pasar igual.
3. **Dosis y población.** `acumuladoAnual.service.js` con las dosis del año por residencia, los meses sin cerrar, `preliminar` y la población por fila y columna. Pruebas en `informes.test.js` con un año ficticio, la DDRISS `ZVT_INF66` y su población por SQL, borrados al inicio y al final:
   - las dosis cuadran con el informe `residencia` de enero a diciembre;
   - un mes sin `cierre_periodo` y otro `ABIERTO` salen en `mesesSinCerrar`;
   - un `APROBADO` solo cuenta con la casilla;
   - un municipio sin población deja `null` su fila y el total;
   - 400 con `nivel=establecimiento` y sin `anio`; 404 con un año sin meses.
4. **Metas y cálculos.** La meta por columna y la cobertura y la brecha por celda. Pruebas con indicadores de prueba en MongoDB (`ZVT_SPEC66*`), borrados al terminar:
   - manda `COBERTURA` sobre `BRECHA`;
   - sin indicador, 95;
   - un indicador con `filtros_dimension` no cuenta;
   - la brecha del total sale de su población, no de la suma de las filas;
   - población 0 da `null`.
5. **Rutas y controlador** de `GET /informes/acumulado-anual`, con los 403 del Personal del establecimiento y del Administrador.
6. **Excel y PDF.** `exportarInforme`, `informeExcel.service.js`, `informePdf.service.js` y `textosInforme.js`, y las dos rutas. Pruebas: el Excel reabierto con `exceljs` coincide con el JSON; la definición del PDF tiene la fila de metas y las cuatro filas por unidad; la bitácora `EXPORTAR` guarda `informe: 'acumulado-anual'`.
7. **API del frontend y funciones puras.** `api/informes.js` e `informes.js`, con `informes.test.js`.
8. **Tabla.** Las props del acumulado en `TablaInforme.jsx`, con `TablaInforme.test.jsx`: la fila de metas, las cuatro filas por unidad, el «—» y el formato de la cobertura.
9. **Pantalla.** `BarraFiltrosInformes.jsx` y `PaginaInformes.jsx`. Pruebas en `PaginaInformes.test.jsx`:
   - el selector Año sustituye a Desde y Hasta;
   - Establecimiento no se puede elegir y «Agrupar por» no se ve;
   - «Generar» escribe `anio` en la URL y recargar genera el acumulado;
   - los avisos de meses sin cerrar y de preliminar;
   - los botones de exportar llaman a las descargas del acumulado.
10. **Cierre.**
    - La nota en `backend/src/modulos/informes/CLAUDE.md` y el avance de HU-49 en `HISTORIAS_DE_USUARIO.md`.
    - Prueba manual con Epidemiología, el Revisor y la Autoridad: acumulado de 2026 por municipio, distrito y departamento, con la Red No. 1 y con Hexavalente; exportar a Excel y PDF.
    - Comparar la cobertura de Hexavalente D3 < 1 año de un municipio con el resultado de `COB_ANUAL_HEXA3` o, si no existe, con la cuenta a mano (dosis ÷ población).

## Criterios de aceptación

- [ ] «Acumulado anual» aparece en el selector Informe de «Informes» para el Revisor, Epidemiología y la Autoridad; los endpoints responden 403 al Personal del establecimiento y al Administrador.
- [ ] Con «Acumulado anual», se elige un año en lugar del rango de meses, y Establecimiento y «Agrupar por» no están disponibles.
- [ ] Cada municipio (o distrito, o el departamento) muestra cuatro filas: Dosis, Población, Cobertura % y Brecha, para cada columna vacuna × grupo de edad × dosis.
- [ ] Las dosis de un municipio coinciden con las del informe «Dosis por municipio de residencia» de enero a diciembre del mismo año y con los mismos filtros.
- [ ] La población es la de `poblacion_objetivo` del año y del grupo de edad de la columna; sin ella, población, cobertura y brecha salen «—».
- [ ] La cobertura es dosis ÷ población × 100 con un decimal, y la brecha, ⌈meta × población − dosis⌉ con mínimo 0.
- [ ] La meta de cada columna es la del indicador `COBERTURA` que aplica, si no la del `BRECHA`, si no 95, y se ve en el encabezado.
- [ ] Publicar una versión nueva de ese indicador con otra meta cambia la meta y la brecha del acumulado al volver a generarlo.
- [ ] Si algún mes del año no está cerrado (o no tiene `cierre_periodo`), el informe lo advierte con los meses.
- [ ] Con «Incluir aprobados sin cerrar», cuentan también los `APROBADO` y el informe se marca «Preliminar».
- [ ] «Generar» deja `informe=acumulado-anual` y `anio` en la URL, y recargar repite el mismo informe.
- [ ] «Exportar Excel» y «Exportar PDF» descargan el acumulado con las mismas cifras de la pantalla, y cada exportación queda en la bitácora.
- [ ] Los informes de los SPEC 62 a 65 dan lo mismo que antes.
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** cuarto informe en `/informes`, con el mismo permiso, la URL, los niveles y los recortes. **No:** una pestaña aparte ni una pestaña en «Indicadores», que repetirían filtros.
- **Sí:** endpoints propios (`/informes/acumulado-anual`). **No:** un cuarto valor de `informe` en `GET /informes/produccion`, porque la respuesta tiene otra forma (cuatro cifras por celda y metas) y otro parámetro de tiempo.
- **Sí:** columnas del 5C (vacuna × grupo de edad × dosis), con la población del grupo de edad de la sección. **No:** una columna por indicador configurado, que dejaría fuera las vacunas sin indicador.
- **Sí:** cuatro filas por unidad. **No:** cuatro subcolumnas por dosis, que con todas las vacunas dan cerca de 400 columnas. **No:** obligar a elegir una vacuna.
- **Sí:** dosis atribuidas por residencia, como el Excel 3 del SPEC 62: es la base de la cobertura. **Sí:** la casilla de aprobados, como en los demás informes.
- **Sí:** meta del indicador `COBERTURA`, si no la del `BRECHA`, si no 95, decidido por el equipo. Se edita como hoy (SPEC 43), sin tocar la base. **No:** una meta nueva por DDRISS o por vacuna guardada en la base, que toca el modelo y los permisos (zona protegida). **No:** un campo de meta en los filtros.
- **Sí:** la versión que aplica hoy (`indicadoresQueAplican`). **No:** la que aplicaba en diciembre del año del informe, que pediría leer el historial de versiones; queda como riesgo.
- **Sí:** descartar las versiones con `filtros_dimension`: miden un subconjunto (por ejemplo, solo un sexo) y su meta no es la de la columna entera.
- **Sí:** población anual completa, sin prorrateo: el informe es para el cierre del año. Durante el año, la cobertura sale baja; el aviso de meses sin cerrar lo explica.
- **Sí:** la brecha del total con sus propias dosis y población, como la fila departamental del motor. **No:** sumar las brechas de las filas, que no cuadra con la cobertura del total.
- **Sí:** si a un municipio le falta la población, el total queda sin cobertura ni brecha, como el motor. **No:** sumar solo los que la tienen, que daría una cobertura engañosa.
- **Sí:** el esquema del último mes del año con `cierre_periodo`. **No:** el de diciembre sin más, que puede no existir todavía.
- **Sí:** el aviso incluye los meses sin `cierre_periodo`, porque la historia pide advertir «si algún periodo del año no está cerrado».
- **Sí:** reutilizar `TablaInforme.jsx` con props nuevas y las funciones de `informes.service.js`. **No:** una tabla o un servicio copiado.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La meta sale de la versión del indicador que aplica hoy: si Epidemiología la cambia en enero, el acumulado del año anterior se ve con la meta nueva. | La meta y su indicador se ven en el encabezado y en los archivos exportados. Queda en la nota del módulo. |
| Las secciones del esquema no coinciden con un código de `clasificacion_poblacion` (por ejemplo, una sección sin grupo de edad). | Esa columna sale con «—» en población, cobertura y brecha; las dosis se ven igual. |
| La base de prueba no tiene población de algún municipio o grupo, y el total queda en «—». | Las pruebas cargan su propia población. En la prueba manual se revisa la población cargada (SPEC 17) antes de comparar. |
| Con cuatro filas por unidad, el PDF de todas las vacunas es largo. | Los tramos de columnas del SPEC 65 siguen aplicando; el filtro Vacuna lo acota. |
| Separar funciones de `informes.service.js` cambia sin querer los informes de los SPEC 62 a 65. | El paso 2 corre las pruebas existentes antes de escribir el acumulado. |

## Lo que **no** entra en este spec

- Meta guardada por DDRISS o por vacuna, o editada por el Administrador.
- Nivel establecimiento y «Agrupar por» en el acumulado anual.
- Prorrateo mensual, semáforo, gráficas o marca de coberturas mayores al 100 %.
- Comparar años o guardar los resultados del informe.
- Cambios al motor de indicadores, las vistas, los permisos o el modelo de datos.

Cada uno de esos, si llega, va en su propio spec.
