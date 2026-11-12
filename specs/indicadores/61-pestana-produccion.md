# SPEC 61 — Pestaña «Producción» en Indicadores

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec I» de Chris, retroalimentación del sprint review con la DDRISS del 2026-11-10)
> **Depende de:** SPEC 49, SPEC 54, SPEC 55, SPEC 58, SPEC 59 y SPEC 60
> **Fecha:** 2026-11-11
> **Objetivo:** Que «Indicadores» tenga una pestaña «Producción» que muestre, sin depender de la corrida, las dosis aplicadas por municipio de aplicación o por establecimiento (población propia, otros municipios y total), con tabla, gráfica, filtros en la URL y la marca «Preliminar» si el rango tiene meses sin cerrar.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hoy todos los indicadores son por **municipio de residencia** (de dónde es la persona, `v_produccion_atribuida`). La DDRISS también quiere ver la **producción**: las dosis que aplicó cada municipio o establecimiento, sin importar de dónde sea la persona (incluye Migrantes). El dato ya existe en `v_produccion` y, consolidado, en `v_consolidado_establecimiento`.

Chris lo dejó en `specs/spec-I-pestana-produccion.md`; este spec lo reemplaza y ese archivo se borra al implementarlo. Reutiliza el filtro «Red» del SPEC 60.

**Decisiones de Chris (2026-11-10), del documento I:**

- Solo **dosis** (cantidades), sin porcentajes ni semáforo.
- Pestaña nueva **Producción** dentro de «Indicadores».
- Agrupar **por municipio de aplicación** o **por establecimiento**; filtros de municipio, establecimiento y red.
- Cuenta reportes **aprobados y cerrados** (`APROBADO`, `CERRADO`, `RECTIFICACION`, la regla de `v_consolidado_establecimiento`); si el rango incluye meses sin cerrar, lleva la marca «Preliminar».
- **Hospitales:** se ven, incluidos los `solo_cobertura` (Hospital de San Marcos), señalados como «No suma en el consolidado». El campo `solo_cobertura` no cambia y las vistas no se cambian. En la pantalla no se menciona ningún Excel.
- El permiso es `INDICADOR_CONSULTAR`.

**Lo que se decidió en la fase de preguntas (2026-11-11):**

- Las opciones de los filtros salen de un endpoint propio, `GET /indicadores/produccion/opciones` (como `GET /redes/opciones` del SPEC 59), porque Epidemiología y la Autoridad no tienen `VACUNA_CONSULTAR`, `MUNICIPIO_CONSULTAR` ni `ESTABLECIMIENTO_CONSULTAR`, y la pestaña no depende de la corrida. No se tocan permisos.
- El filtro Vacuna tiene la opción **«Todas las vacunas»**, que es la de por defecto en esta pestaña.
- La tabla muestra **todas** las filas del universo, también las que tienen 0 dosis.
- El universo son los municipios y establecimientos activos **más** los que tengan producción en el rango.
- La gráfica muestra todas las filas y su alto crece con la cantidad.
- El filtro **Distrito** sale del endpoint de opciones, así que también lo ve el Revisor.
- Las columnas de dosis son las activas de la vacuna más las inactivas con producción en el rango.

## Alcance

**Entra:**

- **Backend** (`backend/src/modulos/indicadores/`):
  - servicio nuevo `produccion.service.js` con `opcionesDeProduccion` y `produccionPorFila`;
  - `GET /indicadores/produccion/opciones` y `GET /indicadores/produccion` en `indicadores.routes.js` y `indicadores.controller.js`, con `INDICADOR_CONSULTAR`;
  - primero en `backend/openapi.yaml` (esquemas `OpcionesProduccion` y `ProduccionAplicada`).
- **Frontend:**
  - `obtenerOpcionesProduccion` y `obtenerProduccion` en `api/indicadores.js` (sin caché);
  - la vista `produccion` en `VISTAS` (`panelIndicadores.js`);
  - funciones puras nuevas en `paginas/indicadores/produccion.js` (con `produccion.test.js`);
  - componentes nuevos `TablaProduccion.jsx` (con `TablaProduccion.test.jsx`) y `GraficaProduccion.jsx` en `paginas/indicadores/`;
  - los filtros de la pestaña en `BarraFiltrosIndicadores.jsx` y su lectura de la URL en `PaginaIndicadores.jsx`.
- Pruebas del backend (archivo nuevo `backend/tests/produccionAplicada.test.js`) y del frontend (`produccion.test.js`, `TablaProduccion.test.jsx`, `panelIndicadores.test.js` y `PaginaIndicadores.test.jsx`).
- La nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-I-pestana-produccion.md`.
- **Paso extra (agregado en la implementación, autorizado por Luis el 2026-11-11):** arreglar las cuatro pruebas del backend que fallaban en la suite completa por depender del estado de la base, ajenas a este spec (ver el paso 8).

**Fuera de alcance (para otros specs):**

- Porcentajes, metas o semáforo sobre la producción.
- Exportar la producción a Excel o PDF.
- La producción en el Mapa o en el Inicio.
- Desagregar por dimensiones (sexo, edad…) o por municipio de procedencia detallado.
- Cambiar las vistas, el campo `solo_cobertura`, el modelo de datos o los permisos.
- Guardar la producción consolidada: se calcula al leer.

## Modelo de datos

No hay tablas, colecciones, vistas ni permisos nuevos. Solo dos endpoints de lectura.

### Regla de lo que se cuenta

- Fuente: `v_produccion`, filtrada por la DDRISS de la consulta (`ddriss_id`) y por `estado IN ('APROBADO','CERRADO','RECTIFICACION')`, como `v_consolidado_establecimiento` pero **sin** excluir `solo_cobertura`.
- `dosisPoblacionPropia` = `cantidad` con `es_poblacion_propia`; `dosisOtrosMunicipios` = el resto (incluye Migrantes `9999` y otros departamentos); `dosisTotal` = la suma.
- **Rango:** con `acumulado=true` (por defecto), de enero al `mes` del `anio`; con `acumulado=false`, solo el `mes`. Solo cuentan los meses del rango con fila en `cierre_periodo` de la DDRISS.
- **`solo_cobertura`:**
  - por establecimiento, son filas con `fueraDelConsolidado: true` y no entran en el total;
  - por municipio de aplicación, no se suman en la fila de su municipio;
  - en los dos casos, lo que aplicaron (con los mismos filtros) va aparte en `dosisFueraDelConsolidado`.
- **Preliminar:** `preliminar: true` si algún mes del rango con `cierre_periodo` no está `CERRADO`; `mesesSinCerrar` los lista.

### `GET /indicadores/produccion/opciones`

Parámetro: `ddrissId` (solo la Autoridad nacional; los demás usan la suya, como en las otras pestañas).

```js
{
  meses: [{ anio: 2026, mes: 8, estado: 'CERRADO' }],           // los de cierre_periodo de la DDRISS
  vacunas: [{ codigo: 'HEXA', nombre: 'Hexavalente', activa: true,
              dosis: [{ id: 7, codigo: 'D1', activa: true }] }], // activas por orden_informe, más las inactivas con producción en la DDRISS
  distritos: [{ id: 3, nombre: 'Distrito San Pedro', municipioId: 4 }], // activos de la DDRISS
  municipios: [{ id: 4, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' }], // del universo (ver abajo)
  establecimientos: [{ id: 31, codigo: 'HOSP-SM', nombre: 'Hospital de San Marcos',
                       municipioId: 1, fueraDelConsolidado: true, activo: true }],
}
```

- **Universo de municipios:** los activos del departamento sede de la DDRISS sin el `9999`, más cualquier otro que sea municipio de aplicación de un establecimiento de la DDRISS con producción (por ejemplo, un externo).
- **Universo de establecimientos:** los activos de la DDRISS con `reporta_5c` o `solo_cobertura`, más los inactivos o externos con producción en la DDRISS.
- La Autoridad nacional sin `ddrissId` responde 400 `ENTRADA_INVALIDA`, como las otras pestañas que piden DDRISS.

### `GET /indicadores/produccion`

Parámetros (se revisan con `revisarParametros`; uno inválido, desconocido o repetido da 400 `ENTRADA_INVALIDA`):

| Parámetro | Valor | Por defecto |
|---|---|---|
| `anio` | 2000 a 2100 | obligatorio |
| `mes` | 1 a 12 (mes de corte) | obligatorio |
| `acumulado` | `true` \| `false` | `true` |
| `agrupar` | `municipio` \| `establecimiento` | `municipio` |
| `vacuna` | código; sin él, todas las vacunas | — |
| `distritoId` | id; recorta al municipio del distrito | — |
| `redId` | id; recorta a los municipios actuales de la red | — |
| `municipioIds` | lista `1,4` dentro del recorte | — |
| `establecimientoIds` | lista dentro del recorte | — |
| `ddrissId` | solo la Autoridad nacional | — |

- `distritoId` con `redId` da 400. Un distrito o una red inexistente, inactiva o de otra DDRISS da 404 `NO_ENCONTRADO`; una vacuna inexistente, 404; un mes de corte sin `cierre_periodo` de la DDRISS, 404.
- Los recortes se aplican al municipio de aplicación (`municipio_aplicacion_id`) y, con `establecimientoIds`, al establecimiento, en las dos agrupaciones.

Respuesta:

```js
{
  anio: 2026, mes: 8, acumulado: true, agrupar: 'establecimiento',
  vacuna: { codigo: 'HEXA', nombre: 'Hexavalente',
            dosis: [{ id: 7, codigo: 'D1', activa: true }] },   // null con todas las vacunas
  filas: [{
    municipio: { id: 1, codigoIne: '1201', nombre: 'San Marcos' },
    establecimiento: { id: 31, codigo: 'HOSP-SM', nombre: 'Hospital de San Marcos' }, // null por municipio
    fueraDelConsolidado: true,                                   // false por municipio
    porDosis: [{ dosisId: 7, dosisTotal: 120 }],                 // [] con todas las vacunas
    dosisPoblacionPropia: 90, dosisOtrosMunicipios: 30, dosisTotal: 120,
  }],
  total: { porDosis: [...], dosisPoblacionPropia, dosisOtrosMunicipios, dosisTotal }, // sin los fueraDelConsolidado
  dosisFueraDelConsolidado: 120,
  preliminar: true,
  mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }],
}
```

- Las filas son **todo el universo** dentro de los recortes, con ceros donde no hubo producción, ordenadas por nombre (por establecimiento: por municipio y luego por nombre). La gráfica las reordena.
- Las columnas de `vacuna.dosis` son las activas por `orden` más las inactivas con producción en el rango.
- El total es la suma de las filas devueltas que no son `fueraDelConsolidado`: coincide con `v_consolidado_establecimiento` para los mismos filtros.

### URL de «Indicadores»

- `vista=produccion` abre la pestaña.
- Reutiliza `anio`, `mes`, `ddriss`, `red`, `distrito` y `municipios` de las demás pestañas (con la misma exclusión entre red y distrito/municipios del SPEC 60).
- Agrega `agrupar=establecimiento` (se omite el de por defecto, `municipio`), `periodo=mes` (solo el mes; se omite el acumulado) y `establecimientos=31,40`.
- **Vacuna:** sin `vacuna` en la URL, la pestaña usa «Todas las vacunas»; si la URL trae una (venida de otra pestaña), usa esa. Elegir «Todas» escribe `vacuna=todas`. Al pasar a otra pestaña con `vacuna=todas`, esa pestaña lo trata como sin `vacuna` (su vacuna por defecto).
- Las demás pestañas ignoran `agrupar`, `periodo` y `establecimientos`, sin borrarlos.

### Pestaña «Producción»

- **Filtros:** Año, Mes de corte, Vacuna (con «Todas las vacunas»), «Acumulado / Solo el mes», «Agrupar por» (Municipio de aplicación / Establecimiento), Red (con `RED_CONSULTAR` y redes activas, como el SPEC 60), Distrito, Municipios y Establecimientos (con `SelectorConBusqueda`, regla del SPEC 58). Las opciones de Municipios y Establecimientos se recortan a la red o al distrito elegido. Año y Mes salen de `meses` de las opciones, con un select «Año» + un select «Mes» (SPEC 58); el mes por defecto es `mesAnterior`, o el último de `meses` si ese no está.
- **No depende de la corrida:** se ve aunque el mes no tenga indicadores calculados; no muestra el historial de corridas.
- **Título:** «Producción de {vacuna}» o «Producción de todas las vacunas». Debajo, el texto de ayuda: «Dosis aplicadas por el municipio o establecimiento, sin importar la residencia de la persona. Incluye Migrantes».
- **Aviso preliminar:** con `preliminar`, encima de la tabla: «Datos preliminares: {meses} todavía no están cerrados.» (nombres de mes de `lib/fechas.js`).
- **Tabla** (`TablaProduccion.jsx`):
  - una fila por municipio o por establecimiento (con su municipio como detalle);
  - con una vacuna, una columna por dosis (encabezado con el código: D1, D2, R1…) con el total de esa dosis; con todas las vacunas, sin columnas de dosis;
  - después, «Población propia», «Otros municipios» y «Total»;
  - las filas `fueraDelConsolidado` llevan la insignia «No suma en el consolidado»;
  - fila final «Total», y debajo, si `dosisFueraDelConsolidado > 0`: «Además, {n} dosis de establecimientos que no suman en el consolidado.»
  - cantidades enteras con separador de miles; sin porcentajes.
- **Gráfica** (`GraficaProduccion.jsx`): barras horizontales del total por fila, apiladas en «Población propia» y «Otros municipios», de mayor a menor, todas las filas (el alto crece con la cantidad). Las filas `fueraDelConsolidado` van en gris. Sin meta ni semáforo. Con `preliminar` lleva `MarcaPreliminar` (no con carga, error ni «sin datos»). Colores del tema, con el componente Chart de shadcn.
- **Estados:** carga con esqueletos (la primera carga con `PantallaCargaSesion`, como las demás pestañas), error con `AvisoError` y `onReintentar`, y sin meses en `cierre_periodo`: «La DDRISS no tiene meses habilitados.»

### Funciones puras nuevas (`produccion.js`)

- `filtrosDeProduccion(parametros, opciones)`: lee `agrupar`, `periodo`, `vacuna` (con `todas`) y `establecimientos` de la URL.
- `establecimientosVisibles(establecimientos, { municipios })`: las opciones de establecimientos recortadas a los municipios visibles.
- `barrasDeProduccion(filas)`: las filas de la gráfica, de mayor a menor, con `propia`, `otros` y `fueraDelConsolidado`.
- `nombreDeFilaProduccion(fila, agrupar)`.

## Plan de implementación

1. **Contrato.** `GET /indicadores/produccion/opciones` y `GET /indicadores/produccion` en `backend/openapi.yaml`, con sus esquemas, parámetros, 400 y 404.
2. **Opciones (backend).** `opcionesDeProduccion` en `produccion.service.js`, la ruta (antes de cualquier `/:id` del módulo) y el controlador. Pruebas en `produccionAplicada.test.js`: universos (activos más los que produjeron), Autoridad nacional con y sin `ddrissId`, 403 sin `INDICADOR_CONSULTAR`.
3. **Producción (backend).** `produccionPorFila`: rango, estados, las dos agrupaciones, filas en cero, recortes, columnas de dosis, total, `dosisFueraDelConsolidado`, `preliminar` y `mesesSinCerrar`. Pruebas en `produccionAplicada.test.js` con el año 2087, un departamento ficticio `Z7`, la DDRISS ficticia `ZVT_PROD61`, municipios `Z701` a `Z703`, establecimientos `vitest-spec61-` (uno `solo_cobertura`, uno inactivo con producción) y la vacuna `ZVT_SPEC61`, todo por SQL y borrado al inicio y al final: el total coincide con una consulta directa a `v_consolidado_establecimiento`; el `solo_cobertura` sale como fila por establecimiento y no suma por municipio; un reporte `BORRADOR` o `ENVIADO` no cuenta; acumulado contra solo el mes; preliminar con un mes `EN_CIERRE`; 400 con `distritoId` y `redId`; 404 con red de otra DDRISS y con mes sin `cierre_periodo`.
4. **API del frontend y funciones puras.** `obtenerOpcionesProduccion` y `obtenerProduccion` en `api/indicadores.js`; `produccion.js` con `produccion.test.js`.
5. **Tabla.** `TablaProduccion.jsx` con `TablaProduccion.test.jsx`: columnas por dosis, sin dosis con todas las vacunas, insignia, fila de total y línea de lo que no suma.
6. **Gráfica.** `GraficaProduccion.jsx` (barras apiladas, gris para `fueraDelConsolidado`, `MarcaPreliminar`).
7. **Pestaña y filtros.** La vista `produccion` en `VISTAS`, los filtros en `BarraFiltrosIndicadores.jsx` y la pestaña en `PaginaIndicadores.jsx` sin depender de la corrida. Pruebas en `panelIndicadores.test.js` y `PaginaIndicadores.test.jsx`: se ve sin corrida, filtros en la URL, `vacuna=todas`, la red recorta, aviso preliminar.
8. **Paso extra: pruebas desactualizadas del backend** (agregado en la implementación). La suite completa del backend (1 697 pruebas) dio 4 fallos ajenos a este spec, todos por esperar un estado viejo de la base:
   - `periodos.test.js`, dos pruebas que esperaban septiembre y octubre de 2026 `ABIERTO` (la tarea del cierre del SPEC 39 los pasó a `EN_CIERRE`): ahora comparan con `cierre_periodo` de la base (`estadosDe2026`), y el filtro `estado=` se prueba con los tres estados;
   - `periodos.test.js`, «una cuenta de Epidemiología recibe 403» en `GET /periodos`, que respondía 200 porque Epidemiología tiene `PERIODO_CONSULTAR` desde el SPEC 44: el 403 lo pide ahora una cuenta de un rol sin ese permiso (`tokenDeLaPrimeraCuenta`); los 403 de crear, abrir y cambiar meses siguen con Epidemiología;
   - `configIndicadores.test.js`, «ordena por vacuna y luego por tipo», que no contaba `COB_ANUAL_HEXA3` (sembrada por el script `13` del SPEC 60): compara el orden (tipo y código) y el orden relativo de los cinco de la semilla, no la lista exacta.
   Prueba: `npx vitest run tests/periodos.test.js tests/configIndicadores.test.js`.
9. **Cierre.** Nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-I-pestana-produccion.md`. Prueba manual con Epidemiología, el Revisor y la Autoridad: agosto y septiembre de 2026, por municipio y por establecimiento, con el Hospital de San Marcos y la Red No. 1.

## Criterios de aceptación

- [ ] La pestaña «Producción» aparece en «Indicadores» para quien tiene `INDICADOR_CONSULTAR` y se ve aunque el mes no tenga corrida.
- [ ] Por municipio de aplicación, la tabla muestra todos los municipios del universo (también con 0) con Población propia, Otros municipios y Total, y la gráfica de barras apiladas de mayor a menor.
- [ ] Por establecimiento, aparece el Hospital de San Marcos con la insignia «No suma en el consolidado» y en gris en la gráfica; por municipio, sus dosis no se suman a San Marcos.
- [ ] El total de la tabla coincide con `v_consolidado_establecimiento` para los mismos filtros, y la línea de debajo da las dosis de los establecimientos que no suman.
- [ ] Con una vacuna, hay una columna por dosis (activas más inactivas con producción); con «Todas las vacunas», no hay columnas de dosis.
- [ ] Solo cuentan reportes `APROBADO`, `CERRADO` y `RECTIFICACION`.
- [ ] «Solo el mes» cuenta solo el mes de corte; «Acumulado», de enero al mes de corte.
- [ ] Con un mes del rango sin cerrar, se ven el aviso con esos meses y la marca «PRELIMINAR» en la gráfica.
- [ ] Los filtros quedan en la URL (`vista=produccion`, `agrupar`, `periodo`, `vacuna=todas`, `establecimientos`, `red`, `distrito`, `municipios`); recargar conserva la vista.
- [ ] La red y el distrito recortan filas y opciones a sus municipios; elegir una red borra `distrito` y `municipios`.
- [ ] El Revisor ve el filtro Distrito en esta pestaña; Epidemiología y la Autoridad ven vacunas, municipios y establecimientos sin permisos nuevos.
- [ ] No aparecen porcentajes, metas ni semáforo.
- [ ] Los parámetros inválidos responden 400 y la red, el distrito, la vacuna o el mes que no corresponden, 404.
- [ ] Las pruebas del backend que tocan los archivos cambiados y la suite del frontend pasan.
- [ ] `periodos.test.js` y `configIndicadores.test.js` pasan sin depender del estado de los meses de 2026 ni de los indicadores que se agreguen a la base (paso extra).

## Decisiones

- **Sí:** un endpoint de opciones con `INDICADOR_CONSULTAR`, como `GET /redes/opciones`. **No:** dar `VACUNA_CONSULTAR`, `MUNICIPIO_CONSULTAR` y `ESTABLECIMIENTO_CONSULTAR` a Epidemiología y la Autoridad, que toca permisos (zona protegida) y abre pantallas de catálogos.
- **Sí:** consultar `v_produccion` con la regla de estados de `v_consolidado_establecimiento`, sin excluir `solo_cobertura`. **No:** cambiar las vistas, que usa el motor.
- **Sí:** el `solo_cobertura` no suma por municipio ni en el total y va aparte en `dosisFueraDelConsolidado`. **No:** sumarlo, porque inflaría el municipio de San Marcos con el hospital.
- **Sí:** «Todas las vacunas», por defecto en esta pestaña, sin columnas de dosis. **No:** obligar a una vacuna (la recomendación inicial); la DDRISS quiere ver la producción total de un vistazo.
- **Sí:** `vacuna=todas` solo vale en esta pestaña; las demás lo tratan como sin vacuna. **No:** un parámetro aparte, que dejaría dos vacunas en la URL.
- **Sí:** todas las filas del universo, con ceros, para ver quién no produjo. **No:** solo las que tienen producción (la recomendación inicial).
- **Sí:** el universo son los activos más los que produjeron, para que el total cuadre con las filas. **No:** solo los activos, que dejaría dosis en el total sin fila que las muestre.
- **Sí:** la gráfica con todas las filas y alto variable. **No:** las 15 mayores, que esconde establecimientos.
- **Sí:** Distrito desde las opciones, también para el Revisor. **No:** depender de `DISTRITO_CONSULTAR`, que el Revisor no tiene.
- **Sí:** el distrito recorta al municipio del distrito, igual que en las demás pestañas. **No:** recortar por `establecimiento.distrito_salud_id`, que daría otro resultado que el resto de «Indicadores».
- **Sí:** columnas de dosis activas más las inactivas con producción, para que el total por dosis cuadre. **No:** solo las que tienen producción, que cambiaría las columnas de un mes a otro.
- **Sí:** los filtros se aplican en el backend y el total es el de las filas devueltas. **No:** recortar en el frontend como las demás pestañas, porque aquí el total depende de los filtros.
- **Sí:** solo cuentan los meses del rango con `cierre_periodo` de la DDRISS, y un mes de corte sin él da 404. **No:** contar meses sin habilitar como preliminares.
- **Sí:** la pestaña no muestra el historial de corridas, que no tiene que ver con la producción.
- **Sí (agregado en la implementación, paso 2):** las dosis de las opciones y de las columnas van por `orden`, con una inactiva con producción en su lugar de la secuencia (D1, D2, R1), no al final.
- **Sí (agregado en la implementación, paso 7, decidido con Luis):** el filtro Establecimiento elige **uno** con `SelectorConBusqueda` (con «Todos los establecimientos»), y la URL queda `establecimientos=31`; la API sigue aceptando una lista. **No:** un selector múltiple nuevo con búsqueda.
- **Sí (agregado en la implementación, paso 7, decidido con Luis):** las pestañas de «Indicadores» se ven siempre, también sin corrida, para llegar a Producción desde un mes sin cálculo. **No:** un enlace aparte bajo el aviso.
- **Sí (agregado en la implementación, paso 7):** la pestaña va en su propio archivo, `PestanaProduccion.jsx`, que `PaginaIndicadores.jsx` monta con `vista=produccion` (sin pedir resultados, corridas ni meses calculados); sus filtros van en `BarraFiltrosProduccion` de `BarraFiltrosIndicadores.jsx`. **No:** meterla en `PaginaIndicadores.jsx`, que ya pasaba de 600 líneas. También se agregaron `mesDeProduccion` y `textoPreliminar` a `produccion.js` y una prueba de la gráfica (`GraficaProduccion.test.jsx`).
- **Sí (prueba manual):** el gris de «No suma en el consolidado» en la leyenda (`--muted-foreground`) se parece al azul de «Población propia»; en las barras sí se distingue. Se deja así hasta que la DDRISS decida cambios a Producción.
- **Sí (agregado en la implementación):** arreglar en este spec las cuatro pruebas desactualizadas de `periodos.test.js` y `configIndicadores.test.js` (paso 8), a pedido de Luis. **No:** dejarlas para una rama aparte, como decía la nota del 2026-11-01. Las pruebas leen el estado de la base en lugar de fijarlo; no cambia el código de la API.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Con más de 100 establecimientos y la gráfica completa, la página queda muy alta. | Los filtros de red, distrito y municipios la acotan; si molesta, se revisa en otro spec. |
| `vacuna=todas` llega a otra pestaña que espera un código. | `filtrosDeUrl` lo trata como sin vacuna; queda probado en `panelIndicadores.test.js`. |
| La consulta por el rango acumulado sobre `v_produccion` es lenta en Aiven. | Una sola consulta agrupada por establecimiento, dosis y procedencia propia, más las de opciones en paralelo por el pool, como `leerDatos`. |
| Un `RECTIFICACION` en curso muestra cantidades que todavía pueden cambiar. | Es la misma regla de `v_consolidado_establecimiento`; la rectificación se aplica en una sola transacción (SPEC 41). |
| Las pruebas chocan con los datos reales o con otras pruebas en paralelo. | Año 2087, departamento `Z7`, DDRISS y municipios ficticios propios, borrados al inicio y al final. |

## Lo que **no** entra en este spec

- Porcentajes, metas o semáforo de la producción.
- Exportar a Excel o PDF.
- La producción en el Mapa o el Inicio.
- Desagregación por dimensiones o procedencia detallada.
- Cambios a las vistas, a `solo_cobertura`, al modelo de datos o a los permisos.

Cada uno, si llega, va en su propio spec.
