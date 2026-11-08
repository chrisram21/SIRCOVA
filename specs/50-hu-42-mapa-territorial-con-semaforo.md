# SPEC 50 — Mapa territorial con semáforo

> **Estado:** Implementado
> **Historia:** HU-42
> **Depende de:** SPEC 43, SPEC 44, SPEC 45, SPEC 46, SPEC 48 y SPEC 49
> **Fecha:** 2026-11-07
> **Objetivo:** Que «Mapa territorial» (`/mapa`) dibuje con Leaflet los municipios de la DDRISS, coloreados según el modo elegido (Cobertura, Brecha, Deserción o Estado del reporte), con un tooltip, un panel del municipio, una clasificación de municipios y el crédito de los límites, más una pantalla «Créditos» con la fuente completa.

## Por qué existe este spec

El menú ya tiene la opción «Mapa territorial» (`/mapa`), con el permiso provisional `MAPA_CONSULTAR` (que no existe en el 05) y sin `pagina`, y el GeoJSON de los 30 municipios está en `frontend/public/geo/` desde el 2026-10-20. Los resultados de indicadores (SPEC 44 a 47) ya traen, por municipio, `valor`, `color`, `numerador`, `denominador`, `brechaDosis` y `metaDosis`. A la pantalla le faltan tres datos de la API y el mapa mismo:

- `codigo_ine` del municipio en cada resultado, para unirlo con su polígono (Epidemiología no tiene `MUNICIPIO_CONSULTAR`, así que no puede pedir `/municipios`).
- `esIndicadorMapa` y los umbrales de cada indicador de la corrida, para elegir el indicador del mapa y armar la leyenda con los cortes reales.
- El estado de los reportes del mes por municipio, que hoy solo existe sumado para toda la DDRISS (`GET /revision/avance`, SPEC 48).

**Diferencias con la historia y con el mockup** (decididas por el equipo):

- **Modos:** el selector tiene los cuatro modos de `Mapa.html`. «Estado del reporte» no es un indicador: sale de `GET /revision/avance` con un desglose por municipio.
- **Permiso:** `MAPA_CONSULTAR` es nuevo y es para EPIDEMIOLOGIA, AUTORIDAD, REVISOR y ADMINISTRADOR (todos menos ESTABLECIMIENTO). La historia nombra solo a Epidemiología y la Autoridad.
- **Panel:** muestra los datos de los indicadores y el resumen de los reportes del mes. No tiene el desglose de atribución territorial («aplicadas en X − a residentes de otros + …»), y «Ver informe del municipio» pasa a ser «Ver en Indicadores», porque «Informes» (HU-45) no existe todavía.
- **Fuera del mockup:** el interruptor «Atribuir dosis por» (hoy solo existe la atribución por procedencia).
- **Créditos:** van en el control de atribución del mapa y en una pantalla «Créditos» propia (`/creditos`).

## Alcance

**Entra:**

- Contrato: `codigoIne` en `ResultadoIndicador.municipio`; `esIndicadorMapa`, `umbrales` y `umbralesProvisionales` en cada indicador de la corrida; `anio`, `mes` y `desglose` en `GET /revision/avance`.
- Permiso `MAPA_CONSULTAR` en `05_permisos_mysql.sql` para los cuatro roles (zona protegida: se confirma antes de editarlo).
- `leaflet` y `react-leaflet` en el `package.json` del frontend (autorizado en la fase de preguntas).
- Pantalla `/mapa` con:
  - selector segmentado de los cuatro modos;
  - filtros de año, mes, vacuna y DDRISS (esta, solo para la Autoridad nacional), más el modo y el municipio elegido, todos en la URL;
  - el mapa de Leaflet sin teselas, con su tooltip, la selección y la leyenda;
  - una columna con las pestañas «Municipio» (el panel) y «Clasificación» (la lista ordenada).
- Crédito de los límites en el control de atribución de Leaflet, con el enlace «Más información» a `/creditos`.
- Pantalla «Créditos» (`/creditos`), sin permiso propio, abierta desde el menú de la cuenta (`MenuUsuario.jsx`) y desde el mapa.
- Pruebas del backend (`avance.test.js`, y los ajustes de `corridas.test.js`, `proyeccion.test.js` y `serie.test.js` por el contrato) y del frontend (funciones puras del mapa, la pantalla y «Créditos»).
- Verificación manual con Playwright. Avance y criterios de HU-42, nota en HU-44 y nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- El desglose de atribución territorial del panel y el interruptor «Atribuir dosis por».
- «Ver informe del municipio» y la exportación (HU-45, HU-47 y HU-48).
- La marca de coberturas mayores al 100 % (HU-44): el mapa las pinta con su franja, como cualquier otro valor.
- Un mapa en el Inicio (el SPEC 48 dejó el Inicio solo con tarjetas, y su acceso rápido ya lleva a `/mapa`).
- El filtro de distrito y los de varios municipios de «Indicadores».
- Límites de otros departamentos: solo existe `san-marcos.geojson`.
- Teselas de fondo (OpenStreetMap, CARTO u otro servicio).
- Cambios en `backend/db/` fuera del 05, en `transicion_estado` o en el `package.json` del backend.

## Modelo de datos

Este spec no cambia tablas ni colecciones. Agrega un permiso en el 05, campos en dos respuestas y parámetros en un endpoint de solo lectura.

### Permiso

```sql
-- SPEC 50 (HU-42): el mapa territorial
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('MAPA_CONSULTAR', 'INDICADORES', 'Ver el mapa territorial de los municipios de su ámbito');

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('EPIDEMIOLOGIA', 'AUTORIDAD', 'REVISOR', 'ADMINISTRADOR')
   AND p.codigo = 'MAPA_CONSULTAR';
```

`MAPA_CONSULTAR` solo abre la pantalla y la opción del menú (no hay un endpoint `/mapa`). Los datos se piden con los permisos de siempre, que ya tienen los cuatro roles: `INDICADOR_CONSULTAR` para `/indicadores/resultados` y `REPORTE_AVANCE_CONSULTAR` para `/revision/avance`. «Ver en Indicadores» se muestra solo con `INDICADOR_CONSULTAR`.

### Cambios en las respuestas de indicadores

En `corridas.service.js`:

- `leerResultados` agrega `m.codigo_ine` a su consulta, y `municipio` pasa a ser `{ id, nombre, codigoIne }` (sigue siendo `null` en la fila departamental). Esto cambia `/indicadores/resultados`, `/indicadores/corridas/{id}` y `/indicadores/serie`.
- `aCorridas` agrega a cada elemento de `indicadores` los datos de su versión: `esIndicadorMapa` (`false` si falta), `umbrales` (el arreglo `{ color, desde, hasta }` de la versión, o `[]`) y `umbralesProvisionales` (`false` si falta).

```json
{
  "corrida": {
    "indicadores": [
      { "codigo": "AVANCE_HEXA3", "version": 1, "nombre": "Avance de Hexavalente 3.ª dosis contra la meta del mes",
        "tipoCalculo": "AVANCE_META_MES", "esIndicadorMapa": true, "umbralesProvisionales": false,
        "umbrales": [{ "color": "verde", "desde": 90, "hasta": null }, { "color": "amarillo", "desde": 80, "hasta": 90 },
                     { "color": "rojo", "desde": 0, "hasta": 80 }] }
    ]
  },
  "resultados": [
    { "indicadorCodigo": "AVANCE_HEXA3", "municipio": { "id": 3, "nombre": "Tacaná", "codigoIne": "1203" },
      "valor": 63.2, "color": "rojo", "numerador": 712, "metaDosis": 1127, "brechaDosis": 415 }
  ]
}
```

(Recortado: el resto de los campos no cambia.)

### `GET /revision/avance`, ampliado

**Parámetros nuevos:**

- `anio` (2000 a 2100) y `mes` (1 a 12): van juntos y eligen el mes del calendario. No se combinan con `periodoId` (400 `ENTRADA_INVALIDA`). Hacen falta porque la Autoridad no tiene `PERIODO_CONSULTAR` y el mapa elige el mes por año y número. Un mes sin `cierre_periodo` de la DDRISS responde 404, como `periodoId`.
- `desglose` (opcional, solo el valor `municipio`): agrega `municipios` a la respuesta. Otro valor responde 400.

Sin `desglose`, la respuesta es la de hoy (el Inicio no lo manda y no hace una consulta más).

**`municipios`:** una fila por municipio con al menos un establecimiento en la consulta base (`consultaBase` de `bandeja.service.js`, los mismos `GRUPOS`, con `GROUP BY m.id`), ordenados por nombre:

```json
{
  "periodo": { "id": 41, "anio": 2026, "mes": 9, "estado": "EN_CIERRE", "fechaLimiteEnvio": "2026-10-05" },
  "esperados": 58,
  "conteos": { "SIN_ENVIAR": 3, "ENVIADO": 1, "EN_REVISION": 2, "CORRECCION_SOLICITADA": 0, "APROBADO": 40, "CERRADO": 12 },
  "municipios": [
    { "municipio": { "id": 3, "nombre": "Tacaná", "codigoIne": "1203" }, "esperados": 4,
      "conteos": { "SIN_ENVIAR": 1, "ENVIADO": 0, "EN_REVISION": 0, "CORRECCION_SOLICITADA": 0, "APROBADO": 3, "CERRADO": 0 } }
  ]
}
```

- El municipio de un reporte es el del establecimiento (el lugar donde se reporta), no la procedencia de las dosis.
- Sin periodo (`periodo: null`), `municipios` es `[]`.
- No escribe nada ni deja bitácora.

### Filtros (frontend, en la URL)

| Parámetro | Qué es | Por defecto |
|---|---|---|
| `anio`, `mes` | Mes de corte, como en «Indicadores» (`mesPorDefecto`) | El mes anterior al actual |
| `ddriss` | Solo la Autoridad nacional | Ninguna (pide elegir, como «Indicadores») |
| `vacuna` | Código de una vacuna con resultados en la corrida | La del primer indicador con `esIndicadorMapa`; si no hay, la del primer `AVANCE_META_MES`; si no hay, la del primer indicador |
| `modo` | `cobertura`, `brecha`, `desercion` o `estado` | `cobertura` |
| `municipio` | Id del municipio elegido | Ninguno |

- Un valor que no existe en los datos cargados se ignora.
- Cambiar la DDRISS borra `vacuna` y `municipio`. Cambiar el modo, la vacuna o el mes conserva `municipio`.
- La vacuna no cambia el modo «Estado del reporte», pero sí los datos de indicadores del panel.

### Indicador de cada modo

`indicadorDelModo(indicadores, vacuna, modo)` (en `mapaTerritorial.js`) elige, entre los indicadores de la corrida de esa vacuna:

- `cobertura`: el primero con `esIndicadorMapa`; si no hay, el primer `AVANCE_META_MES`; si no hay, el primer `COBERTURA`;
- `brecha`: el primer `BRECHA`; si no hay, el de `cobertura` (su `brechaDosis` es la misma cuenta);
- `desercion`: el primer `DESERCION`;
- `estado`: ninguno.

Sin indicador para el modo, todos los polígonos quedan en «Sin datos» y un aviso dice «La corrida no tiene un indicador de {etiqueta del tipo} de {vacuna}.».

### Colores

Todos salen de variables del tema y nunca se escriben a mano en un componente:

- **Cobertura y Deserción:** el `color` del resultado (`verde`, `amarillo`, `rojo`, ya calculado por el backend con los umbrales de la versión, ascendente o descendente) con `--semaforo-verde`, `--semaforo-amarillo` y `--semaforo-rojo` (los de `COLOR_SEMAFORO` de `TarjetaGrafica.jsx`). La leyenda arma un rótulo por franja leyendo directamente los `umbrales` del indicador, sean dos o tres, en el sentido de su tipo: «90 % o más», «80 a 89.9 %», «Menos de 80 %» en el ascendente; «10 % o menos», «Más de 10 %» en el descendente (decidido en el paso 3: `aCortes` solo acepta tres franjas, y `DES_HEXA1_3` de la base tiene dos). Con `umbralesProvisionales`, la leyenda dice «Rangos provisionales».
- **Brecha:** escala secuencial con cinco variables nuevas en `index.css`, `--mapa-brecha-1` (la más clara) a `--mapa-brecha-5`, en tonos del azul de la marca. `clasesDeBrecha(valores)` da los cortes:
  - clase 1: `brechaDosis` 0 («Meta alcanzada»);
  - clases 2 a 5: los cuartiles de las brechas mayores que 0 de los municipios del mapa, redondeados a enteros;
  - con menos de cuatro valores distintos, hay menos clases.
  La leyenda dice el rango de dosis de cada clase («1 a 120», «121 a 260»…).
- **Estado del reporte:** `estadoMasAtrasado(conteos)` da el estado menos avanzado con al menos un reporte, en este orden: `SIN_ENVIAR`, `CORRECCION_SOLICITADA`, `ENVIADO`, `EN_REVISION`, `APROBADO`, `CERRADO`. Se pinta con las `--estado-*` de `InsigniaEstadoReporte`, salvo `SIN_ENVIAR`, que usa la variable nueva `--mapa-sin-enviar` (`var(--semaforo-rojo)`), porque `--estado-borrador` es casi blanco y en el mapa se leería como «Sin datos». Los nombres de la leyenda salen de `ESTADOS_REPORTE`.
- **Sin datos:** un municipio del GeoJSON sin fila, o con `calculable: false`, va con `--muted` y su tooltip dice el motivo: «Sin datos», «Sin población», «Sin primeras dosis» (Deserción) o «Sin reportes esperados» (Estado).

### Mapa (`MapaMunicipios.jsx`)

- `MapContainer` de `react-leaflet`, sin capa de teselas: los polígonos van sobre `--background`, con un `GeoJSON` de los municipios de `/geo/san-marcos.geojson`.
- `fitBounds` a los límites al cargar, `maxBounds` con un margen y `minZoom` igual al zoom inicial. Tiene los botones de zoom, el doble clic y la rueda. En pantallas táctiles, el arrastre con un dedo queda apagado (`dragging: !L.Browser.mobile`) para no atrapar el desplazamiento de la página.
- El estilo de cada polígono se lee de la fila unida por `codigo_ine`: `fillColor: 'var(--…)'`, borde con `--card` y, en el municipio elegido, un borde más grueso con `--foreground`. Al pasar el cursor, el borde usa `--ring`. El color cambia con `transition: fill`, salvo con `prefers-reduced-motion`.
- Tooltip (`Tooltip` de Leaflet, con estilos del tema en `index.css`):
  - Cobertura: nombre, valor y franja, dosis aplicadas (`numerador`), meta en dosis (`metaDosis`), meta en % y dosis por aplicar (`brechaDosis`).
  - Brecha: nombre, dosis por aplicar, dosis aplicadas y meta en dosis.
  - Deserción: nombre, valor, dosis iniciales (`denominador`) y finales (`dosisFinales` de `TablaDesercion.jsx`).
  - Estado: nombre, reportes esperados y cada estado con reportes.
- Clic (o toque) en un polígono: lo elige (`municipio` en la URL) y abre la pestaña «Municipio».
- Leyenda: control propio en la esquina inferior izquierda (`LeyendaMapa.jsx`), con el título del modo («Avance contra la meta del mes», «Dosis por aplicar para la meta», «Deserción», «Estado de los reportes de {mes}»), sus franjas y «Sin datos».
- Atribución (`attributionControl`), con el prefijo de Leaflet y el crédito de `FUENTES.md`: «Límites: CONRED / OCHA (HDX) · CC BY 3.0 IGO · adaptado · Más información». Los enlaces van a la fuente y a la licencia. «Más información» va a `/creditos` y navega con el router (un clic interceptado en el contenedor), sin recargar la página.
- El archivo de límites se elige por los dos primeros dígitos del `codigoIne` de los municipios de los datos (`ARCHIVO_DE_LIMITES = { '12': '/geo/san-marcos.geojson' }`). Si ninguno tiene archivo, en lugar del mapa queda «No hay límites cargados para los municipios de esta DDRISS.», y la clasificación y el panel siguen funcionando.
- El GeoJSON se pide con `cargarLimites(ruta)` de `api/geo.js` (nuevo, la única pieza fuera de `cliente.js` que usa `fetch`, porque es un archivo estático y no la API) y se guarda en memoria del módulo.

### Columna derecha (pestañas `Tabs`)

**«Municipio»** (`PanelMunicipio.jsx`). Sin municipio elegido: «Elija un municipio en el mapa o en la clasificación.» y, debajo, el total de la DDRISS (fila departamental). Con uno elegido:

- su nombre y la cifra grande del modo (valor %, dosis por aplicar o estado más atrasado), con `InsigniaValor` o `InsigniaEstadoReporte`;
- en Cobertura, una barra de avance con la marca de la meta (`meta`, o 100 % en `AVANCE_META_MES`);
- filas de datos de la vacuna, de los indicadores que tenga la corrida: dosis aplicadas, meta en dosis y dosis por aplicar, las tres del indicador de cobertura (así cuadran); «Brecha a la meta anual» (la `brechaDosis` del indicador `BRECHA`, con su nombre en el `title`), y deserción (el valor del indicador `desercion`). No lleva «Población de referencia», que repetía la meta en dosis (decidido en el paso 10);
- «Reportes de {mes}»: cuántos están cerrados o aprobados de los esperados, y el estado más atrasado (de `municipios` del avance);
- «Ver en Indicadores» (`/indicadores?anio&mes&vacuna&municipios={id}`, y `ddriss` para la Autoridad nacional), solo con `INDICADOR_CONSULTAR`.

**«Clasificación»** (`ClasificacionMunicipios.jsx`): los municipios del mapa en una lista con su color, su nombre y su cifra, del más rezagado al menos:

- Cobertura, de menor a mayor `valor`;
- Brecha, de mayor a menor `brechaDosis`;
- Deserción, de mayor a menor `valor`;
- Estado, por el orden del estado más atrasado y luego por la cantidad de reportes sin enviar;
- los empates van por nombre, y los municipios sin datos van al final.

Cada fila es un botón: elige el municipio y pasa a «Municipio». Se recorre con el teclado y es la forma accesible de elegir un municipio, porque los polígonos no reciben el foco.

### Encabezado y estados de la pantalla

- `EncabezadoPagina` con el antetítulo «Mapa territorial · {nombre del indicador del modo, o «Estado de los reportes»} · Ene a {mes} {año}» y un h1 por modo:
  - «¿Dónde está el rezago de cobertura?»;
  - «¿Dónde faltan más dosis para la meta?»;
  - «¿Dónde se pierde más población entre dosis?»;
  - «¿Dónde faltan reportes del mes?».
- Selector segmentado con `Tabs` (ya instalado; no se agrega `ToggleGroup`).
- Carga: `listarResultados` (sin `indicador`, como «Indicadores») y `obtenerAvance({ anio, mes, ddrissId, desglose: 'municipio' })` en paralelo, y `cargarLimites` cuando llegan los primeros datos con `codigoIne`. Mientras cargan, `Skeleton` en el mapa y en la columna.
- Cada fuente que falle muestra su `AvisoError` con «Reintentar» sin ocultar lo demás. Sin resultados, los modos de indicadores quedan sin datos y «Estado del reporte» sigue funcionando. Sin avance, pasa lo contrario.
- Sin corrida vigente en el mes: «No hay un cálculo vigente de {mes} de {año}.», con el enlace «Ir a Indicadores» (ahí está «Calcular»).
- Escritorio: mapa a la izquierda (alto mínimo de unos 560 px) y la columna de unos 340 px a la derecha. Teléfono: todo apilado, el mapa con unos 420 px de alto y sin desplazamiento horizontal.

### Pantalla «Créditos» (`/creditos`)

- Ruta `RUTA_CREDITOS = '/creditos'` en `RutaProtegida.jsx`, registrada en `App.jsx` como `RUTA_PERFIL` (sin permiso propio, dentro del `Layout`), con su título en `ubicarRuta.js` y la opción «Créditos» en `MenuUsuario.jsx`.
- `paginas/creditos/PaginaCreditos.jsx`, con `EncabezadoPagina` («Acerca de» / «Créditos») y una tarjeta «Límites municipales» con:
  - la fuente (título, autor, publicado por, enlace, archivo original, válido desde, última revisión y descarga);
  - la licencia (CC BY 3.0 IGO, con el enlace a la licencia y al texto legal);
  - los cambios hechos;
  - la nota «Son límites de referencia: no constituyen límites legales oficiales.»;
  - la aclaración de que CONRED, OCHA, HDX y las Naciones Unidas no respaldan el sistema.
  Y una segunda tarjeta «Mapa», con el crédito de Leaflet (licencia BSD-2-Clause).
- Sin logos de CONRED, OCHA, HDX ni de las Naciones Unidas.
- Los textos salen de `paginas/creditos/fuentesGeograficas.js` (nuevo), con los datos de `FUENTES.md`. El crédito corto del mapa sale del mismo archivo, así que un cambio de la fuente va en `FUENTES.md`, en el `metadatos` del GeoJSON y en `fuentesGeograficas.js`.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                  ← codigoIne, esIndicadorMapa/umbrales/umbralesProvisionales,
│                                                    anio/mes/desglose y municipios en /revision/avance
├── db/05_permisos_mysql.sql                      ← MAPA_CONSULTAR (zona protegida)
├── src/modulos/indicadores/corridas.service.js   ← codigo_ine en leerResultados; datos de la versión en aCorridas
├── src/modulos/revision/avance.service.js        ← anio/mes, desglose=municipio
└── tests/avance.test.js                          ← casos nuevos (año 2002)
    tests/corridas.test.js, proyeccion.test.js, serie.test.js ← codigoIne y los campos nuevos en lo que comparan
frontend/
├── package.json, package-lock.json               ← leaflet, react-leaflet
└── src/
    ├── index.css                                 ← --mapa-brecha-1…5, --mapa-sin-enviar, estilos de Leaflet con el tema
    ├── App.jsx, componentes/RutaProtegida.jsx    ← RUTA_CREDITOS
    ├── componentes/layout/opcionesMenu.js        ← /mapa con MAPA_CONSULTAR y su pagina
    ├── componentes/layout/ubicarRuta.js, MenuUsuario.jsx ← «Créditos»
    ├── componentes/EncabezadoPagina.jsx          ← al implementar: acciones a todo el ancho en el teléfono
    ├── componentes/RutaConPermiso.test.jsx       ← al implementar: «En construcción» pasa a /informes; /mapa ya tiene página
    ├── lib/fechas.js                             ← al implementar: mesAnterior (PaginaIndicadores lo reexporta)
    ├── paginas/indicadores/BarraFiltrosIndicadores.jsx ← al implementar: exporta Selector
    ├── api/geo.js                                ← nuevo: cargarLimites
    ├── api/revision.js                           ← obtenerAvance con anio, mes y desglose
    ├── paginas/creditos/
    │   ├── PaginaCreditos.jsx (+ .test)           ← nuevo
    │   └── fuentesGeograficas.js                 ← nuevo: textos de la fuente y crédito corto
    └── paginas/mapa/
        ├── PaginaMapa.jsx (+ .test)               ← nuevo: filtros, carga, disposición
        ├── BarraFiltrosMapa.jsx                  ← nuevo
        ├── MapaMunicipios.jsx                    ← nuevo: Leaflet, tooltip, selección, atribución
        ├── LeyendaMapa.jsx                       ← nuevo
        ├── PanelMunicipio.jsx                    ← nuevo
        ├── ClasificacionMunicipios.jsx           ← nuevo
        └── mapaTerritorial.js (+ .test)           ← nuevo: funciones puras
docs/SPECS/HISTORIAS_DE_USUARIO.md, CLAUDE.md
```

`mapaTerritorial.js` reúne `indicadorDelModo`, `vacunaDelMapa`, `filasDelMapa` (une resultados, avance y polígonos por `codigoIne`, y trae el color de cada fila), `clasesDeBrecha`, `estadoMasAtrasado`, `rotulosDeLeyenda`, `ordenDeClasificacion` y `archivoDeLimites`. Al implementar se agregaron `lineasDelTooltip`, `cifraDelModo` y `filaDeLaDdriss`, y `indicadorDelModo` recibe también los resultados (de ellos sale la vacuna de cada indicador). Reutiliza `indicadoresDeLaVacuna` y `vacunaDe` de `panelIndicadores.js`.

## Plan de implementación

1. **Contrato.** En `openapi.yaml`: `codigoIne` en el municipio de `ResultadoIndicador`; `esIndicadorMapa`, `umbrales` y `umbralesProvisionales` en los indicadores de la corrida; `anio`, `mes` y `desglose` en `GET /revision/avance`, con `municipios` y el 400 por combinar `periodoId` con `anio`/`mes`. Comprobación: `/api/docs` carga.
2. **Permiso.** Confirmar con el equipo y agregar el bloque del modelo de datos al 05. Correr el 05 en la base de prueba con `mysql2`. Cambiar `opcionesMenu.js` solo si el código del permiso cambia (hoy ya dice `MAPA_CONSULTAR`). Comprobación: el 05 corre dos veces sin error y `rol_permiso` tiene `MAPA_CONSULTAR` para los cuatro roles y no para ESTABLECIMIENTO.
3. **Resultados con `codigoIne` y datos de la versión.** Cambios de `leerResultados` y `aCorridas`. Se ajustan las comparaciones de `corridas.test.js`, `proyeccion.test.js` y `serie.test.js` que revisan `municipio` o `indicadores` completos, y se agrega en `corridas.test.js` un caso que revisa `codigoIne`, `esIndicadorMapa` y `umbrales`. Comprobación: los tres archivos pasan.
4. **Avance por municipio.** `anio`/`mes` y `desglose=municipio` en `avance.service.js`. En `avance.test.js` (año 2002), los casos:
   - `anio` + `mes` da el mismo resultado que su `periodoId`, y con los dos responde 400;
   - con `desglose=municipio`, cada municipio trae sus conteos, y la suma de los municipios es igual a `conteos` y `esperados`;
   - un municipio sin establecimientos en la consulta base no aparece;
   - sin `desglose`, la respuesta no trae `municipios`, y otro valor de `desglose` responde 400;
   - la Autoridad nacional ve los municipios de la DDRISS que pide.
   Comprobación: `avance.test.js` pasa.
5. **Leaflet.** `npm install leaflet react-leaflet` en `frontend/`. Comprobación: `npm test` sigue pasando y `npm run build` compila.
6. **Créditos.** `fuentesGeograficas.js`, `PaginaCreditos.jsx`, `RUTA_CREDITOS`, la ruta en `App.jsx`, el título en `ubicarRuta.js` y la opción de `MenuUsuario.jsx`. La prueba revisa la fuente, los dos enlaces de la licencia, la nota de límites de referencia, que no hay imágenes y que el menú de la cuenta abre la pantalla. Comprobación: la prueba pasa.
7. **Datos del mapa.** `api/geo.js`, `obtenerAvance` con sus parámetros nuevos y `mapaTerritorial.js`, con pruebas puras en `mapaTerritorial.test.js`:
   - el indicador de cada modo (con y sin `esIndicadorMapa`, y la brecha sin `BRECHA`);
   - la unión por `codigoIne` con un municipio sin fila y uno no calculable;
   - los cortes de la brecha con 30 valores, con ceros y con menos de cuatro valores distintos;
   - el estado más atrasado;
   - los rótulos de la leyenda ascendente y descendente;
   - el orden de la clasificación en los cuatro modos;
   - el archivo de límites de `1203` y de un código sin archivo.
   Comprobación: la prueba pasa.
8. **Mapa.** `MapaMunicipios.jsx` y `LeyendaMapa.jsx`, y las variables y estilos de Leaflet en `index.css`. Comprobación: se monta en `npm run dev` con datos de la API (se revisa con Playwright en el paso 10).
9. **Pantalla.** `PaginaMapa.jsx`, `BarraFiltrosMapa.jsx`, `PanelMunicipio.jsx` y `ClasificacionMunicipios.jsx`, y la `pagina` de `/mapa` en `opcionesMenu.js`. Pruebas en `PaginaMapa.test.jsx` (con `vi.mock` de las API y de `MapaMunicipios.jsx`, porque Leaflet no dibuja en jsdom):
   - el modo por defecto es Cobertura con el indicador del mapa, y el antetítulo lo nombra;
   - cambiar el modo cambia la URL, el h1 y el orden de la clasificación;
   - elegir un municipio en la clasificación pone `municipio` en la URL y muestra su panel con dosis, meta, avance y brecha;
   - «Ver en Indicadores» lleva el municipio y la vacuna, y no aparece sin `INDICADOR_CONSULTAR`;
   - sin corrida vigente, el aviso aparece y «Estado del reporte» sigue mostrando sus datos;
   - un error en el avance muestra «Reintentar» sin ocultar los modos de indicadores;
   - sin límites para la DDRISS, el aviso reemplaza al mapa y la clasificación sigue.
   Comprobación: `npm test` del frontend pasa completo.
10. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas:
    - entrar con `epidemiologia` en agosto de 2026 y comparar el color, el tooltip y el panel de varios municipios con la tabla de `AVANCE_HEXA3` en «Indicadores»;
    - comparar la brecha y la deserción con sus tablas;
    - comparar «Estado del reporte» de septiembre de 2026 con la bandeja de revisión;
    - comprobar la leyenda, la atribución y que «Más información» abre «Créditos» sin recargar;
    - entrar con `autoridad.nacional` (selector de DDRISS) y con el Revisor;
    - revisar la pantalla a 390 px y la consola sin errores.
    Después, el avance y los criterios de HU-42, una nota en HU-44 (el mapa ya tiene dónde marcar las coberturas mayores al 100 %) y la nota en `CLAUDE.md`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los campos y parámetros nuevos, y `/api/docs` carga.
- [ ] Cada resultado municipal trae `municipio.codigoIne`, y cada indicador de la corrida trae `esIndicadorMapa`, `umbrales` y `umbralesProvisionales`.
- [ ] `GET /revision/avance` acepta `anio` + `mes` (y responde 400 si se combinan con `periodoId`), y con `desglose=municipio` da los conteos por municipio, que suman lo mismo que `conteos`.
- [ ] `MAPA_CONSULTAR` existe para EPIDEMIOLOGIA, AUTORIDAD, REVISOR y ADMINISTRADOR, el 05 sigue siendo idempotente, y el Personal del establecimiento no ve «Mapa territorial».
- [ ] Cada municipio se colorea según su avance para la vacuna y el mes elegidos, y los modos Brecha, Deserción y Estado del reporte lo colorean con su propia escala.
- [ ] Al pasar el cursor o hacer clic sobre un municipio veo dosis, meta, avance y brecha (en el tooltip y en el panel).
- [ ] Los umbrales del semáforo y los rótulos de la leyenda salen de la versión del indicador (HU-35), no están fijos en el código, y la leyenda avisa si son provisionales.
- [ ] El mapa muestra siempre, en su control de atribución, el crédito de los límites con el enlace a la fuente, el enlace a la licencia CC BY 3.0 IGO y la indicación «adaptado», además del crédito de Leaflet.
- [ ] La pantalla «Créditos» tiene la fuente completa de los límites, los cambios hechos y la nota de que son límites de referencia, no límites legales oficiales, sin logos de CONRED, OCHA, HDX ni de las Naciones Unidas, y se abre desde el menú de la cuenta y desde el mapa.
- [ ] El año, el mes, la vacuna, el modo, el municipio elegido y la DDRISS (Autoridad nacional) quedan en la URL, y un enlace abre el mismo mapa.
- [ ] La clasificación ordena los municipios del más rezagado al menos según el modo, se usa con el teclado y elegir uno lo selecciona en el mapa.
- [ ] Un municipio sin datos o sin población va con el color «Sin datos», y una DDRISS sin límites muestra el aviso sin perder la clasificación.
- [ ] Cada fuente que falla muestra su «Reintentar» sin ocultar lo demás, y sin corrida vigente el aviso lleva a «Indicadores».
- [ ] El mapa no usa teselas ni otro servicio externo, y ningún componente propio tiene colores escritos a mano ni llama a `fetch` (salvo `api/geo.js`).
- [ ] La pantalla no tiene desplazamiento horizontal a 390 px.
- [ ] `avance.test.js`, `corridas.test.js`, `proyeccion.test.js` y `serie.test.js` pasan en `backend/`, `npm test` pasa en `frontend/` sin desactivar pruebas, y no quedan datos de prueba del año 2002.
- [ ] HU-42 tiene su avance y sus criterios, HU-44 su nota, y `CLAUDE.md` está al día.

## Decisiones

- **Sí:** los cuatro modos del mockup, con «Estado del reporte» incluido (decidido en la fase de preguntas). **No:** dejar «Estado del reporte» para otro spec.
- **Sí:** «Estado del reporte» pinta el estado más atrasado de los establecimientos del municipio (decidido en la fase de preguntas). **No:** el porcentaje de reportes listos, que esconde un único reporte sin enviar.
- **Sí:** ampliar `GET /revision/avance` con `desglose=municipio` (decidido en la fase de preguntas), con `REPORTE_AVANCE_CONSULTAR`, que ya tienen los cuatro roles. **No:** un endpoint nuevo para lo mismo.
- **Sí:** `anio` + `mes` en `/revision/avance` (decidido al escribir el spec), porque la Autoridad no tiene `PERIODO_CONSULTAR` y no puede traducir el mes a `periodoId`. **No:** darle `PERIODO_CONSULTAR` a la Autoridad.
- **Sí:** `MAPA_CONSULTAR` nuevo para los cuatro roles que no son ESTABLECIMIENTO (decidido en la fase de preguntas). **No:** reutilizar `INDICADOR_CONSULTAR`. El permiso solo abre la pantalla: los datos siguen con los permisos de sus endpoints.
- **Sí:** el panel con los datos de indicadores y del avance, y «Ver en Indicadores» (decidido en la fase de preguntas). **No:** el desglose de atribución territorial, que necesita un endpoint nuevo sobre la producción atribuida.
- **Sí:** sin teselas (decidido en la fase de preguntas): no depende de un servicio externo, no deja que un tercero vea qué consulta el usuario y respeta los colores del tema. **No:** OpenStreetMap ni CARTO.
- **Sí:** brecha con una escala secuencial por cuartiles y variables nuevas `--mapa-brecha-*` (decidido en la fase de preguntas). **No:** el semáforo del indicador `BRECHA`, que se vería igual que el modo Cobertura.
- **Sí:** `SIN_ENVIAR` con `--mapa-sin-enviar` y no con `--estado-borrador` (decidido al escribir el spec), porque el estado más urgente quedaría casi blanco y parecería «Sin datos». Se puede ajustar al verlo en el paso 10.
- **Sí:** créditos en el control de atribución y en la pantalla `/creditos`, con los textos de `FUENTES.md` (decidido en la fase de preguntas). **No:** solo un diálogo dentro del mapa.
- **Sí:** `leaflet` y `react-leaflet` (autorizados en la fase de preguntas). **No:** solo `leaflet` con código propio.
- **Sí:** los filtros de «Indicadores» (año, mes, vacuna, DDRISS) más el modo y el municipio, en la URL (decidido en la fase de preguntas). **No:** el filtro de distrito, que el Revisor no podría usar.
- **Sí:** una clasificación de municipios como alternativa al mapa, en una pestaña junto al panel (decidido en la fase de preguntas). **No:** que los polígonos reciban el foco con Tab.
- **Sí:** sin rótulos permanentes; el nombre va en el tooltip (decidido en la fase de preguntas). **No:** el valor o el nombre sobre cada polígono, que se enciman en los municipios chicos.
- **Sí:** con una DDRISS sin límites, un aviso en lugar del mapa, y el archivo se elige por el departamento del `codigoIne` (decidido en la fase de preguntas). **No:** quitar esas DDRISS del selector.
- **Sí:** `codigoIne` en los resultados (decidido al escribir el spec). **No:** pedir `/municipios`, que Epidemiología no puede consultar.
- **Sí:** `esIndicadorMapa` y los umbrales en `corrida.indicadores` (decidido al escribir el spec). **No:** leer `/configuracion-indicadores`, que solo tiene Epidemiología.
- **Sí:** el selector segmentado con `Tabs`, que ya está instalado (decidido al escribir el spec). **No:** agregar `ToggleGroup` con la CLI.
- **Sí:** la leyenda lee los `umbrales` directamente, sean dos o tres franjas (decidido en el paso 3). **No:** `aCortes`, que solo acepta tres y deja sin rótulos a `DES_HEXA1_3`.
- **Sí:** en el panel, aplicadas, meta y dosis por aplicar del indicador que pinta el mapa, y la brecha de `BRECHA` aparte como «Brecha a la meta anual» (decidido en el paso 10). **No:** mezclar la meta del mes con la anual, que daba 13,680 + 9,643 ≠ 16,367.
- **Sí:** el contenedor del mapa con `isolate` (decidido en el paso 10): los z-index de Leaflet y de la leyenda tapaban el menú de la cuenta.
- **Sí:** en el teléfono, las pestañas de los modos en dos filas de dos a todo el ancho, con `max-sm:w-full` en las acciones de `EncabezadoPagina` (decidido en el paso 10). **No:** una sola fila, que no cabía en 390 px.
- **Sí:** el ajuste de la vista espera a que el contenedor tenga tamaño (decidido en el paso 8). Con 0 px, `fitBounds` da un zoom infinito y Leaflet falla con `NaN`.
- **Sí:** `mesAnterior` en `lib/fechas.js` y `Selector` exportado de la barra de «Indicadores» (decidido en el paso 9), para no llevarse Recharts al chunk del mapa.
- **No (para otros specs):** un mapa en el Inicio, la marca de coberturas mayores al 100 % (HU-44), «Ver informe del municipio», la exportación y el interruptor de atribución (decidido en la fase de preguntas).

## Riesgos

- **Leaflet en jsdom.** Leaflet necesita medidas reales y no dibuja en las pruebas. `PaginaMapa.test.jsx` simula `MapaMunicipios.jsx`, las cuentas se prueban en `mapaTerritorial.test.js` y el dibujo se revisa con Playwright.
- **`var()` en el SVG de Leaflet.** Leaflet escribe `fill` como atributo del `path`, y los navegadores actuales aceptan `var(--…)` ahí (Recharts ya lo usa en el SPEC 49). Si algún navegador no lo acepta, la medida es leer el valor con `getComputedStyle` de `document.documentElement`.
- **El enlace interno en la atribución.** El control de atribución es HTML en texto: un `<a href="/creditos">` normal recargaría la página y la sesión se recuperaría con el refresco (SPEC 28). Por eso el clic se intercepta en el contenedor y navega con el router.
- **Contrato de los resultados.** Agregar `codigoIne` cambia las filas que comparan `municipio` completo en las pruebas del backend y en los mocks del frontend. Se ajustan esas comparaciones sin desactivar ninguna prueba.
- **Cuartiles con pocos datos.** Con brechas muy parecidas, los cortes se repiten. `clasesDeBrecha` junta las clases repetidas, y la leyenda muestra solo las que quedan.
- **Aiven apagado.** Con MySQL apagado fallan los resultados y el avance. Cada uno muestra su «Reintentar», y el GeoJSON (archivo estático) no se pide hasta que llegan datos con `codigoIne`.
- **Varios indicadores con `esIndicadorMapa`.** Se toma el primero de la vacuna, en el orden de `corrida.indicadores` (por código). Si Epidemiología marca varios, el mapa no avisa.

## Lo que **no** entra en este spec

- El desglose de atribución territorial y el interruptor «Atribuir dosis por».
- «Ver informe del municipio» y la exportación a Excel o PDF.
- La marca de coberturas mayores al 100 % (HU-44).
- El mapa en el Inicio.
- Los filtros de distrito y de varios municipios.
- Límites de otros departamentos y teselas de fondo.

Cada uno, si llega, va en su propio spec.
