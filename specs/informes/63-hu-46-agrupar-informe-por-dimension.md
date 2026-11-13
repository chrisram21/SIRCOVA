# SPEC 63 — HU-46 Agrupar el informe por una dimensión

> **Estado:** Implementado
> **Historia:** HU-46
> **Origen:** historia
> **Depende de:** SPEC 18, SPEC 19 y SPEC 62
> **Fecha:** 2026-11-12
> **Objetivo:** Que un informe ya generado en «Informes» se pueda agrupar por sexo u otra dimensión del catálogo con un selector sobre la tabla, sumando todas las edades de cada valor, sin volver a pulsar «Generar» y sin tocar el detalle guardado.

## Por qué existe este spec

El SPEC 62 dejó los tres informes con columnas por vacuna, sección del 5C (grupo de edad) y dosis. Pero la estadígrafa también necesita otros totales, como cuántas niñas y cuántos niños recibieron VPH, que hoy saca sumando a mano las edades de cada sexo. Las cantidades ya se guardan con todas sus dimensiones en `detalle_dimension`, así que el informe solo tiene que sumarlas de otra forma.

En la base de prueba, las dimensiones que no son grupo de edad tienen datos en septiembre y octubre de 2026, todos todavía sin cerrar: `sexo` en VPH, `estado_embarazo` en Td y `presentacion` en Polio. La prueba manual usa «Incluir aprobados sin cerrar».

**Lo que se decidió en la fase de preguntas (2026-11-12):**

- Agrupar reemplaza la sección de grupo de edad por los valores de la dimensión. Las columnas pasan a ser vacuna × valor × dosis, y cada valor suma todas las edades: 5 + 6 + 3 niñas = 14.
- Solo salen las vacunas que registran la dimensión. Con «Todas las vacunas», un aviso dice cuáles se muestran. Si ninguna la registra, sale un aviso en lugar de la tabla.
- La agrupación se elige con un selector «Agrupar por» encima del informe ya generado. Al cambiarlo, el valor pasa a la URL y el informe se pide de nuevo con los mismos filtros, sin pulsar «Generar».
- La opción por defecto es «Sección del 5C», que muestra la tabla del SPEC 62. Las demás opciones son las dimensiones activas de `catalogo_dimensiones`, sin `grupo_edad`.
- Las columnas salen del esquema que cubre `hasta`, más las combinaciones con datos en el rango que no están en él, como en el SPEC 62.
- `agrupacion` es un parámetro más de la URL, para que la exportación (HU-47 y HU-48) lo reutilice.

## Alcance

**Entra:**

- **Contrato** en `backend/openapi.yaml`:
  - el parámetro `agrupacion` de `GET /informes/produccion`, con sus 400 y 404;
  - `valor` en la columna y `agrupacion` en `InformeProduccion`;
  - `dimensiones` en `OpcionesInformes`.
- **Backend** (`backend/src/modulos/informes/informes.service.js`):
  - las dimensiones de `opcionesDeInformes`;
  - las columnas agrupadas;
  - la lectura de la producción agrupada desde `v_produccion_dimension`.
- **Frontend** (`frontend/src/paginas/informes/` y `frontend/src/api/informes.js`):
  - el selector «Agrupar por» en `PaginaInformes.jsx`, con `agrupacion` en la URL;
  - la segunda fila del encabezado con los valores en `TablaInforme.jsx` y en `encabezadosDeTabla` de `informes.js`;
  - los avisos de vacunas mostradas y de ninguna vacuna.
- **Pruebas:** casos nuevos en `backend/tests/informes.test.js`, `informes.test.js`, `TablaInforme.test.jsx` y `PaginaInformes.test.jsx`.
- **Documentación:**
  - una nota en `backend/src/modulos/informes/CLAUDE.md`;
  - el avance de HU-46 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`.

**Fuera de alcance (para otros specs):**

- Agrupar por dos dimensiones a la vez (por ejemplo, sexo × grupo de edad).
- Elegir «Grupo de edad» como dimensión: las secciones del 5C ya lo cubren.
- Mostrar las vacunas que no registran la dimensión en una columna «Sin dato».
- Exportar a Excel o PDF (HU-47 y HU-48). Este spec solo deja `agrupacion` en la URL.
- El acumulado anual con población, cobertura y brecha (HU-49).
- Cambiar los filtros, los niveles, las filas, los estados que cuentan o el trato del Hospital de San Marcos del SPEC 62.
- Permisos nuevos, tablas, vistas, colecciones o cambios al modelo de datos.

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. Se usa la vista `v_produccion_dimension`, que ya existe (`v_produccion` más una fila por dimensión). Los endpoints siguen siendo de lectura, con `INFORME_CONSULTAR`.

### `GET /informes/opciones`

Agrega la lista de dimensiones que se pueden elegir:

```js
{
  meses: [...], vacunas: [...], municipios: [...],          // como en el SPEC 62
  dimensiones: [{ codigo: 'sexo', nombre: 'Sexo' }],        // activas de catalogo_dimensiones, sin grupo_edad, por nombre
}
```

### `GET /informes/produccion`

Parámetro nuevo:

| Parámetro | Valor | Por defecto |
|---|---|---|
| `agrupacion` | código de una dimensión activa de `catalogo_dimensiones`, distinta de `grupo_edad` | sin él, las secciones del 5C (SPEC 62) |

- 400 `ENTRADA_INVALIDA`: `agrupacion=grupo_edad`, o un valor vacío o repetido (`revisarParametros`).
- 404 `NO_ENCONTRADO`: una dimensión inexistente o inactiva.
- Sin `agrupacion`, la respuesta es la del SPEC 62, con `agrupacion: null`.

### Qué suma la agrupación

- La producción se lee de `v_produccion_dimension` con `dimension_codigo = ?` y se agrupa por `valor_codigo` en lugar del grupo de edad. Una cantidad sin esa dimensión no entra.
- Todo lo demás es igual que en el SPEC 62: informes, estados, `incluirAprobados`, rango, recortes, niveles, universos de filas, `mesesSinCerrar` y `preliminar`.
- Las filas y el total solo suman las cantidades con la dimensión. `dosisFueraDelConsolidado` también.
- Para cada vacuna y dosis que registran la dimensión, la suma de sus valores es igual al total de esa vacuna y dosis sin agrupar.

### Columnas agrupadas

Una columna es una combinación de vacuna, valor de la dimensión y dosis.

- **Vacunas que registran la dimensión:** las del informe (todas o la del filtro `vacuna`, en el orden del SPEC 62) en las que se cumple al menos una de estas dos cosas:
  - alguna dosis del esquema que cubre el día 1 de `hasta` pide la dimensión en su desagregación efectiva (la de la dosis o, si no tiene, la del esquema);
  - hay cantidades con la dimensión en el rango.
- **Dentro de cada vacuna:**
  - una columna por cada valor que el esquema pide para alguna dosis, en el orden de `catalogo_dimensiones`;
  - dentro del valor, una por cada dosis que lo pide, en el orden de `dimensiones.dosis` del esquema.
- **Combinaciones con datos fuera del esquema:** un valor y una dosis con cantidades en el rango que el esquema no pide van al final de su vacuna. Su etiqueta es la del catálogo, también si el valor está inactivo, o el código si no está en el catálogo.
- **Vacuna sin esquema para ese mes:** solo las combinaciones con datos.
- Se muestran todas las columnas, aunque den 0 en todo el informe.
- Si ninguna vacuna registra la dimensión, `columnas` es `[]`, y las filas salen con `cantidades: []`.

Ejemplo: Td con `estado_embarazo` tiene D1 y D2 en «Embarazada» y en «No embarazada», pero no R1, porque su desagregación solo es por grupo de edad.

### Respuesta

```js
{
  // ...lo mismo que en el SPEC 62
  agrupacion: { codigo: 'sexo', nombre: 'Sexo' },          // null sin agrupación
  columnas: [{
    vacuna: { codigo: 'VPH', nombre: 'Virus del papiloma humano (VPH)' },
    seccion: null,                                           // siempre null al agrupar
    valor: { codigo: 'F', etiqueta: 'Femenino' },            // null sin agrupación
    dosis: { id: 31, codigo: 'D1' },
  }],
}
```

`llaveDeColumna` toma el valor en lugar del grupo de edad cuando hay agrupación.

### Pantalla «Informes»

- **Selector «Agrupar por»** (`Select` de shadcn):
  - va encima de la tabla, junto al encabezado del informe, y solo aparece cuando hay un informe generado;
  - opciones: «Sección del 5C» (por defecto) y las `opciones.dimensiones` por su nombre.
- **Cambiar la agrupación:**
  - escribe `agrupacion=sexo` en la URL (o lo quita con «Sección del 5C») y deja igual los demás parámetros;
  - el informe se pide de nuevo con los filtros de la URL, sin pulsar «Generar»;
  - el borrador de la barra de filtros no cambia.
- **«Generar»:** conserva la `agrupacion` que ya está en la URL.
- **URL:** una `agrupacion` que no está en `opciones.dimensiones` se ignora, como la opción por defecto.
- **Encabezado del informe:** «{Nombre del informe} · {nivel} · por {nombre de la dimensión}» cuando hay agrupación.
- **Tabla:** la segunda fila del encabezado muestra la etiqueta del valor (abarca sus dosis) en lugar de la sección. Las filas, el total y la línea de lo que no suma son los del SPEC 62.
- **Avisos:**
  - con agrupación, columnas y «Todas las vacunas»: «Solo se muestran las vacunas que registran {Sexo}: {VPH}.», con los nombres de las vacunas de `columnas`;
  - con agrupación y `columnas` vacío, en lugar de la tabla: «Ninguna vacuna de este informe registra {Sexo}.» El selector sigue visible.

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`:
   - `agrupacion` en `GET /informes/produccion`, con su 400 y su 404;
   - `valor` en la columna y `agrupacion` en `InformeProduccion`;
   - `dimensiones` en `OpcionesInformes`.
2. **Opciones.** `dimensiones` en `opcionesDeInformes`, leídas de `catalogo_dimensiones`. Prueba en `informes.test.js`: trae `sexo` y no `grupo_edad`.
3. **Columnas agrupadas.** Una función de columnas por dimensión en `informes.service.js`, con las dosis y la desagregación de `seccionesDelPeriodo`. Pruebas con la vacuna `ZVT_SPEC63` y su esquema de prueba en MongoDB (dosis con `sexo` y una dosis sin él), creados y borrados por la prueba:
   - valores en el orden del catálogo y dosis en el del esquema;
   - la dosis sin la dimensión no sale;
   - una combinación con datos fuera del esquema va al final de su vacuna;
   - una vacuna que no registra la dimensión no sale.
4. **Producción agrupada.** El parámetro `agrupacion` en `leerConsulta`, la lectura desde `v_produccion_dimension` en `leerProduccion` y `llaveDeColumna` con el valor. Pruebas con los datos ficticios del SPEC 62 (DDRISS `ZVT_INF62`, diciembre de 2086):
   - 5 + 6 + 3 niñas en tres grupos de edad dan 14 en la columna «Femenino»;
   - la suma de los valores de una dosis es igual a su total sin agrupar;
   - funciona en los niveles departamento, municipio, distrito y establecimiento, con el total y `dosisFueraDelConsolidado`;
   - `columnas: []` cuando la vacuna del filtro no registra la dimensión;
   - 400 con `grupo_edad` y 404 con una dimensión inexistente;
   - sin `agrupacion`, la respuesta del SPEC 62 no cambia.
5. **API del frontend y funciones puras.**
   - `obtenerInforme` pasa `agrupacion`.
   - `encabezadosDeTabla` agrupa por valor cuando la columna lo trae.
   - Una función que escribe o quita `agrupacion` en los parámetros de la URL.
   - Pruebas en `informes.test.js`.
6. **Tabla.** La segunda fila del encabezado con la etiqueta del valor en `TablaInforme.jsx`. Prueba en `TablaInforme.test.jsx`: el valor abarca sus dosis con su `colSpan`.
7. **Pantalla.** El selector «Agrupar por», el encabezado con la dimensión y los dos avisos en `PaginaInformes.jsx`. Pruebas en `PaginaInformes.test.jsx`:
   - el selector no aparece antes de generar;
   - cambiar la agrupación escribe la URL y pide el informe con `agrupacion` sin pulsar «Generar», y el borrador de filtros no cambia;
   - «Generar» conserva la agrupación;
   - los avisos de vacunas mostradas y de ninguna vacuna.
8. **Cierre.**
   - La nota del módulo en `backend/src/modulos/informes/CLAUDE.md` y el avance de HU-46 en `HISTORIAS_DE_USUARIO.md`.
   - Prueba manual con el Revisor: de septiembre a octubre de 2026, con aprobados y «Todas las vacunas», agrupar por Sexo (VPH), Estado de embarazo (Td) y Presentación (Polio).
   - Comparar cada suma con la de «Sección del 5C».

## Criterios de aceptación

- [ ] Con un informe generado aparece «Agrupar por», con «Sección del 5C» por defecto y las dimensiones activas del catálogo, sin «Grupo de edad».
- [ ] Al agrupar por Sexo, cada sexo suma todas las edades de su vacuna y dosis (5 + 6 + 3 niñas = 14).
- [ ] Las columnas agrupadas son vacuna × valor × dosis, con los valores en el orden del catálogo y solo las dosis que registran la dimensión. Salen también las que dan 0.
- [ ] Para cada vacuna y dosis, la suma de sus valores es igual a su total con «Sección del 5C» para los mismos filtros.
- [ ] Solo salen las vacunas que registran la dimensión. Con «Todas las vacunas» se ve el aviso de las que se muestran, y si ninguna la registra, se ve «Ninguna vacuna de este informe registra {dimensión}.» en lugar de la tabla.
- [ ] Cambiar la agrupación pide de nuevo el informe con los filtros de la URL sin pulsar «Generar», y deja `agrupacion` en la URL. Recargar repite el informe agrupado.
- [ ] Volver a «Sección del 5C» muestra el mismo informe que antes de agrupar: el detalle guardado no cambia y el endpoint no escribe nada.
- [ ] Los niveles, los recortes, los estados, la casilla de aprobados y el Hospital de San Marcos se comportan como en el SPEC 62 también al agrupar.
- [ ] `agrupacion=grupo_edad` responde 400, y una dimensión inexistente o inactiva, 404.
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.

## Decisiones

- **Sí:** la dimensión reemplaza a la sección de grupo de edad y suma todas las edades, como pide la historia. **No:** agregarla como cuarto nivel bajo la sección, que no da el total de niñas. **No:** sumar también las dosis, porque se pierde el detalle por dosis que tiene el 5C.
- **Sí:** solo las vacunas que registran la dimensión, con un aviso. **No:** una columna «Sin dato» por vacuna, que con sexo llenaría la tabla de columnas vacías. **No:** dejar las demás sin agrupar, porque la tabla mezclaría dos agrupaciones.
- **Sí:** un selector sobre el informe que vuelve a pedir el informe con los filtros de la URL. Así se cumple «cambiar la agrupación sin volver a generar el filtro» y la exportación puede usar la misma URL. **No:** reagrupar en el navegador, que obliga a mandar el detalle de todas las dimensiones. **No:** un filtro más en la barra, que pediría pulsar «Generar».
- **Sí:** las dimensiones activas del catálogo, así que una dimensión nueva aparece sola. **No:** solo sexo. **No:** solo las que tienen datos, que pide otra consulta en las opciones.
- **Sí:** «Sección del 5C» por defecto, sin `grupo_edad` como opción, porque las secciones ya lo cubren. **No:** «Grupo de edad» como una opción más, que daría una tabla distinta a la del 5C (por ejemplo, Td «Otros grupos de edad»).
- **Sí:** las columnas del esquema que cubre `hasta` más las combinaciones con datos, como en el SPEC 62, para que no cambien de un mes a otro. **No:** solo las combinaciones con datos.
- **Sí (decidido al escribir el spec):** los valores de cada vacuna son los que su esquema pide (por ejemplo, F y M en VPH), en el orden del catálogo, más los que tienen datos. **No:** todos los valores activos del catálogo, que podrían dar columnas que la vacuna nunca captura.
- **Sí:** leer `v_produccion_dimension`, como dice la historia. Las cantidades sin la dimensión quedan fuera solas. **No:** una segunda unión externa con `detalle_dimension`.
- **Sí:** una dimensión inexistente o inactiva da 404, como una vacuna inexistente en el SPEC 62. `grupo_edad` da 400 porque es un valor que la API no acepta, no algo que falte.
- **Sí:** el aviso lista las vacunas que se muestran. **No:** listar las que quedan fuera, que con «Todas las vacunas» son casi todas.
- **Sí:** «Generar» conserva la agrupación. **No:** volver a «Sección del 5C» con cada «Generar», que obligaría a elegirla otra vez tras cambiar un filtro.
- **Sí (agregado en la implementación, paso 3):** sin agrupación, cada columna también lleva `valor: null`, como pide el contrato. Las pruebas del SPEC 62 que comparan columnas se ajustaron a esa forma, y la carga de vacunas, dosis y esquemas pasó a `vacunasConSusEsquemas`, que comparten las dos funciones de columnas.
- **Sí (agregado en la implementación, paso 3):** las dimensiones se leen directo de `catalogo_dimensiones` (`dimensionesDeAgrupacion` y `dimensionDeAgrupacion`). **No:** `listarDimensiones` de configuración, que también calcula el uso en los esquemas.
- **Sí (agregado en la implementación, paso 5):** la agrupación de la URL va en dos funciones aparte, `agrupacionDeUrl` y `conAgrupacion`. **No:** meterla en `filtrosDeInforme` y `parametrosDeInforme`, que son el borrador de los filtros, mientras que la agrupación cambia sin pasar por él.
- **Sí (agregado en la implementación, paso 7):** el selector se ve también mientras carga el informe o si falla (por ejemplo, con una dimensión que se desactivó), para poder volver a «Sección del 5C». Los avisos salen de `avisoDeAgrupacion` en `informes.js`.
- **Sí (prueba manual):** en la base de prueba también está activa la dimensión «Pueblo de pertenencia», que ninguna vacuna registra: al elegirla se ve el aviso sin tabla. Tdap no registra sexo, así que por Sexo solo sale VPH.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| En la base de prueba no hay datos cerrados con sexo, embarazo ni presentación, así que el informe agrupado sale en 0 sin la casilla. | La prueba manual usa «Incluir aprobados sin cerrar». Las pruebas automáticas crean sus propios datos cerrados. |
| Un esquema cambió dentro del rango y pide la dimensión en otras dosis. | Las combinaciones con datos fuera del esquema van al final de su vacuna, como en el SPEC 62. No se pierde ninguna dosis. |
| Una cantidad tiene la dimensión con un valor que ya no está en el catálogo. | Sale al final de su vacuna con el código como etiqueta. |
| La consulta a `v_produccion_dimension` es más lenta que la del SPEC 62 en rangos largos. | Se filtra por `dimension_codigo` y por la DDRISS, y se agrupa en la misma consulta. |

## Lo que **no** entra en este spec

- Agrupar por dos dimensiones a la vez.
- «Grupo de edad» como opción de agrupación.
- Una columna «Sin dato» para las vacunas que no registran la dimensión.
- Exportar a Excel o PDF (HU-47 y HU-48) y el acumulado anual (HU-49).
- Cambios a los filtros, niveles, filas o estados del SPEC 62, permisos nuevos o cambios al modelo de datos.

Cada uno, si llega, va en su propio spec.
