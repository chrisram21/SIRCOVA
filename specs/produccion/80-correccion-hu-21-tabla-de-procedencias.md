# SPEC 80 — Corrección HU-21 Tabla de municipios en la tarjeta B de la captura

> **Estado:** Implementado
> **Historia:** HU-21
> **Origen:** correccion
> **Depende de:** SPEC 24, SPEC 33, SPEC 36 y SPEC 40
> **Fecha:** 2026-11-27
> **Objetivo:** Que la tarjeta B de la captura («Dosis aplicadas a personas de otros municipios») muestre de entrada una tabla con una fila por municipio de procedencia y las dosis de la vacuna en columnas, agrupadas por sección como en el informe de residencia, para que el Personal de establecimiento escriba las cantidades directamente, sin agregar cada combinación de municipio, dosis y grupo de edad con un diálogo.

## Error que se corrige

La DDRISS San Marcos reportó (2026-11-27) que registrar la producción atribuida es muy tedioso.

**Cómo se ve:** en la tarjeta B (SPEC 24), cada combinación de municipio × dosis × sección se agrega con «+ Agregar municipio de procedencia», que abre un diálogo con tres selectores (municipio, dosis y grupo de edad). Para registrar las dosis de 5 municipios en la 1ra, 2da y 3ra de Hexavalente hay que abrir el diálogo 15 veces, y repetirlo vacuna por vacuna. El reporte mensual ya es largo, y este paso lo alarga mucho más.

**Causa:** la tarjeta se diseñó como una lista de filas que se agregan una por una (el mockup de la captura la muestra así). Cada fila es una combinación de municipio, dosis y sección, y las columnas son las otras dimensiones (por ejemplo, Hombres y Mujeres). Si se mostraran todas las filas posibles sin el diálogo, serían 30 municipios × cada dosis y sección: en Polio, unas 300 filas.

## Lo que se decidió en la conversación previa (2026-11-27)

- **Forma de la tabla:** una fila por municipio y, en las columnas, las secciones de la vacuna, en cada una sus dosis y, si la vacuna registra otras dimensiones (sexo, embarazo…), cada dosis abierta en sus valores, como en la tarjeta A. Es la forma del informe de residencia. Al final, una columna «Total» por municipio y una fila «Total» por columna.
- **Siempre las mismas filas**, sin diálogo ni botón para agregar o quitar:

  | Modo de procedencia del esquema | Filas |
  |---|---|
  | `MUNICIPIO_DETALLADO` con `permiteNoEspecificado` | Los municipios activos del departamento (sin el propio), en su orden, y **Migrantes** al final |
  | `MUNICIPIO_DETALLADO` sin `permiteNoEspecificado` | Solo los municipios del departamento |
  | `PROPIO_Y_OTROS` (réplica del 5C) | Una sola fila, «Otros municipios», que se guarda como `9999` |

  Son las `procedenciasPermitidas` que ya calcula el backend (en San Marcos, 29 + Migrantes = 30 filas).
- **Vacío ≠ 0:** una casilla vacía significa «no hubo dosis atribuidas» y no se guarda; nadie tiene que llenar ceros en los municipios sin dosis. Un 0 escrito se guarda como 0, como en la tarjeta A.
- **Validación:** se conserva la regla de hoy. Con «Exigir 0 en las celdas sin dosis» (`CAMPOS_COMPLETOS` con `cero_explicito`), la tarjeta A pide todas sus casillas. En la B solo se piden las del **grupo de una dosis y una sección** que ya tiene algún valor: si en Catarina se escribe Hombres = 2 en la 1ra de < 1 año, se pide Mujeres de esa dosis y sección (un 0 si no hubo). El resto de la fila de Catarina puede quedar vacío. El validador del backend ya trabaja así (arma los grupos con las casillas guardadas), así que no cambia.
- **El progreso no cuenta la tarjeta B:** el contador de casillas llenas y la ✓ de la pestaña siguen contando solo la tarjeta A (`resumenDeCasillas`), para que 30 filas vacías no hagan ver incompleta la captura.
- **Procedencias heredadas** (una casilla guardada con un municipio que hoy no se ofrece: un municipio desactivado, el `9999` en un esquema que ya no lo permite o un municipio con nombre en un reporte `PROPIO_Y_OTROS`): su fila aparece **al final**, después de las normales, con la marca «Ya no disponible» y un Tooltip que explica por qué. Sus casillas se corrigen o se vacían; una vez vacía y guardada, la fila desaparece y no se puede volver a llenar, como las dosis inactivas. El backend ya lo controla.
- **Pantallas pequeñas:** la tabla se desliza a los lados, con la columna del municipio fija a la izquierda y el encabezado fijo arriba al bajar. Enter y las flechas pasan de casilla en casilla, como hoy.
- **Solo lectura:** en «Revisar reporte» la tabla tiene la misma forma, pero solo muestra los municipios con datos y la fila «Total». Si no hay ninguno, el texto «Sin dosis atribuidas a otros municipios». En la captura y en la nueva rectificación, todas las filas.

## Diferencias con la historia y el mockup

- La HU-21 dice «Puedo agregar filas para otros municipios de San Marcos o para Migrantes». Con este spec las filas ya están; el criterio se cumple escribiendo en la fila del municipio. Los otros dos criterios no cambian.
- El mockup de la captura (`docs/mockups/descripcion_pantallas.md`, tarjeta B) muestra una lista con «Municipio de procedencia», «Dosis» y «Grupo de edad» y el botón «+ Agregar municipio de procedencia». Este spec lo reemplaza por la tabla de municipios a pedido de la DDRISS. El mockup no se modifica: este spec deja constancia del cambio.

## Alcance

**Entra (solo frontend):**

- `frontend/src/componentes/formulario/TarjetaProcedencias.jsx`: la tabla nueva, sin el diálogo ni el botón de quitar.
- Las tres pantallas que la usan: la captura (`paginas/registro/CapturaReporte.jsx`), la nueva rectificación (`paginas/rectificaciones/PaginaNuevaRectificacion.jsx`) y «Revisar reporte» (`paginas/revision/PaginaRevisarReporte.jsx`).
- Sus pruebas (`TarjetaProcedencias.test.jsx` y las de las tres pantallas que tocan la tarjeta B).
- Notas de `backend/src/modulos/produccion/CLAUDE.md`.

**No cambian:** el backend, `backend/openapi.yaml`, el modelo de datos, las reglas de validación ni la vista previa del esquema (SPEC 21, que no dibuja la tarjeta B).

## Modelo de datos

No cambia. La tarjeta escribe las mismas celdas que hoy (`detalle_produccion` + `detalle_dimension`, con su `municipio_procedencia_id`) mediante el mismo `PUT /reportes/{id}/vacunas/{vacunaId}`.

## Diseño

### Columnas

Salen de las tablas que arma `armarFormulario` (las mismas de la tarjeta A):

- Una tabla de la tarjeta B por cada tabla de la tarjeta A que tenga casillas, como hoy (una dosis con desagregación propia va en otra tabla, con su título).
- En cada tabla, por cada sección (en su orden): las dosis que tienen casillas en esa sección (en el orden de las filas de la A) y, en cada dosis, sus casillas (las combinaciones de las otras dimensiones, en el orden de la A).
- El encabezado tiene un nivel por sección (si la tabla tiene más de una sección o la única tiene `grupoEdad`), uno por dosis (con su etiqueta) y los de las otras dimensiones, con `colSpan`. Al final, «Total».
- Cada casilla usa la misma llave de hoy, `llaveProcedencia(dosis, municipioId, claveCombinacion)`, así que las cantidades, las marcas de la validación (`marcas`, `data-celda`), lo que se guarda (`celdasParaGuardar`) y la comparación de la rectificación no cambian.

### Filas

- `filasDeProcedencia({ formulario, permitidas, municipios, celdas, municipioPropioId, modo, soloLectura })` (nueva, pura, en `TarjetaProcedencias.jsx`) da las filas en este orden: las `permitidas` (que ya vienen en el orden de `municipios`, con el `9999` al final) y después las heredadas (municipios con alguna casilla guardada que no están en `permitidas`, en el orden de `municipios`), cada una con `heredada: true` y el `motivo` que muestra su Tooltip.
- Las heredadas y la solo lectura se calculan con las celdas **guardadas**, no con las cantidades que se están escribiendo: una fila heredada no desaparece al vaciarla, sino al guardar. `formulario` sirve para no contar una celda que la tabla no puede dibujar (su dosis o su clave no están en el formulario), que daría una fila vacía, y `modo` para el nombre de la fila del `9999` (decidido al implementar el paso 1).
- En `PROPIO_Y_OTROS`, la fila del `9999` se llama «Otros municipios».
- En solo lectura, solo las filas con alguna cantidad escrita.
- La fila «Total» suma cada columna; la columna «Total», cada fila.

### Lo que desaparece

- `DialogoProcedencia`, el botón «+ Agregar municipio de procedencia» y el botón para quitar una fila.
- `filasDeCeldas`, `llavesDeFila` y el estado `filas` de las pantallas (en la captura, `otras` pasa a ser solo `cantidades`; en la rectificación, igual). Las filas ya no son estado: se calculan.
- El aviso de `PROPIO_Y_OTROS` («Este esquema registra juntas las dosis de otros municipios, como en el 5C») se conserva.

### Desplazamiento

El contenedor de cada tabla desplaza en los dos sentidos (`overflow-auto` con alto máximo), con el `thead` `sticky top-0` y la primera columna `sticky left-0` con fondo, como `TablaInforme` (nota del SPEC 66 en `informes/CLAUDE.md`: anular el `overflow-x-auto` del contenedor de shadcn e `isolate` para no tapar el encabezado de la página). Las casillas conservan `data-fila`, `data-col`, `moverEntreCasillas` y `seleccionarAlEntrar`.

## Plan de implementación

1. **Funciones puras** en `TarjetaProcedencias.jsx`: las columnas de una tabla de la B (secciones → dosis → casillas, con sus encabezados) y `filasDeProcedencia`, con pruebas en `TarjetaProcedencias.test.jsx`: con y sin secciones, con sexo, con una dosis de desagregación propia, los tres modos, una heredada y la solo lectura.
2. **La tabla** (`TablaProcedencias`): encabezado de varios niveles, filas por municipio, la marca «Ya no disponible» con Tooltip, «Total» por fila y por columna, y el desplazamiento con columna y encabezado fijos.
3. **`TarjetaProcedencias`** sin el diálogo ni los botones, y con el texto de solo lectura sin datos.
4. **Las tres pantallas:** quitar el estado `filas`, `alAgregar` y `alQuitar`; pasar `celdas` o lo que la tarjeta necesite para las heredadas.
5. **Pruebas de las pantallas:** escribir una cantidad en la fila de un municipio y guardarla (`PUT` con su `municipioProcedenciaId`), vaciarla y que se borre, la rectificación compara igual, y «Revisar reporte» muestra solo los municipios con datos.
6. **Prueba manual** con datos reales: un reporte en borrador de un mes abierto, registrar dosis en dos municipios y en Migrantes, guardar, recargar y comprobar que siguen; con un esquema con «Exigir 0», que un grupo a medias marque la casilla faltante; ver el reporte en «Revisar reporte»; probar la tabla en una ventana angosta.
7. **Notas** en `backend/src/modulos/produccion/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] La tarjeta B muestra una fila por municipio permitido (y Migrantes, si el esquema lo permite) y las dosis de la vacuna en columnas agrupadas por sección, con las otras dimensiones como en la tarjeta A, sin diálogo ni botones para agregar o quitar filas.
- [x] En un esquema `PROPIO_Y_OTROS`, la tabla tiene una sola fila, «Otros municipios», que se guarda como `9999`.
- [x] Una cantidad escrita se guarda con su municipio de procedencia, se ve al recargar, y una casilla vaciada se borra al guardar.
- [x] Las casillas vacías no se guardan ni cuentan en el progreso de la captura; un 0 escrito se guarda como 0.
- [x] Con «Exigir 0 en las celdas sin dosis», un grupo de dosis y sección con algún valor marca las casillas que faltan, y los municipios sin valores no se marcan.
- [x] Una procedencia heredada aparece al final con «Ya no disponible», se puede corregir o vaciar, y no reaparece una vez vaciada y guardada.
- [x] La tabla se desplaza a los lados y hacia abajo con la columna del municipio y el encabezado fijos, y Enter y las flechas mueven entre casillas.
- [x] «Revisar reporte» muestra solo los municipios con datos y su total, o «Sin dosis atribuidas a otros municipios».
- [x] La nueva rectificación usa la misma tabla y compara las cantidades como antes.
- [x] El backend y `backend/openapi.yaml` no cambian.
- [x] `npm test` del frontend pasa.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** una fila por municipio con las dosis en columnas por sección (decidido en la conversación previa), como el informe de residencia. **No:** la lista de hoy sin el diálogo, que serían cientos de filas.
- **Sí:** vacío = sin dosis, y la regla de completos por grupo de dosis y sección (decidido en la conversación previa). **No:** que la B nunca exija ceros, porque «Hombres = 2» con Mujeres sin dato no se distinguiría de un descuido.
- **Sí:** las heredadas al final con «Ya no disponible» (decidido en la conversación previa), con la misma regla de hoy.
- **Sí:** tabla deslizable con columna y encabezado fijos (decidido en la conversación previa). **No:** otra forma de la tabla para el celular.
- **Sí:** en solo lectura, solo los municipios con datos (decidido en la conversación previa para «Revisar reporte»). Se aplica a toda la solo lectura de la tarjeta, también a la captura de un reporte enviado (decidido al escribir el spec).
- **Sí:** ningún cambio en el backend (decidido al escribir el spec). El guardado ya arma las casillas desde las cantidades, no desde las filas, y el validador ya agrupa por dosis y sección.

## Riesgos

- **Tablas anchas:** una vacuna con varias secciones y sexo puede pasar de 20 columnas. El desplazamiento con columna fija lo cubre; revisarlo con Polio y Hexavalente v2.
- **Rendimiento:** 30 filas × 20 columnas son 600 casillas por vacuna. La captura solo dibuja la pestaña de la vacuna abierta; si al escribir se nota lento, se evalúa memorizar las filas.
- **Pruebas existentes:** las de la tarjeta B buscan el diálogo y los botones de quitar. Se reescriben para la tabla nueva sin bajar lo que comprueban (guardado, heredadas, marcas y comparación de la rectificación).

## Lo que **no** entra en este spec

- **Municipios de otros departamentos con nombre** (por ejemplo, migrantes de Coatepeque registrados como tales y no como Migrantes). Hoy van en el `9999` (SPEC 24). Si se pide, hay que decidir qué municipios se ofrecen y dónde se configura esa lista sin fijar San Marcos (`procedencias.service.js`), cómo cuentan en el informe de residencia y la cobertura (dentro de Migrantes o en una fila propia) y agregar sus filas antes de Migrantes.
- Cambiar el mockup de la captura.
- Cambiar la tarjeta A, las reglas de validación o la vista previa del esquema.
