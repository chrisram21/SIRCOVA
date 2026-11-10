# SPEC 54 — Indicadores por pestañas

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec B» de Chris, punto 8 de `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 44, SPEC 45, SPEC 46, SPEC 47, SPEC 49, SPEC 50, SPEC 51, SPEC 52 y SPEC 53
> **Fecha:** 2026-11-09
> **Objetivo:** Reemplazar el select «Indicador» de «Indicadores» por cinco pestañas por tipo (Avance, Brecha, Cobertura, Deserción y Proyección), cada una con solo su tabla y sus gráficas.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hoy «Indicadores» tiene un select «Indicador» que elige la tabla, y debajo se ven todas las gráficas a la vez (`PanelGraficas`), aunque no sean del indicador elegido. Chris lo dejó en `specs/spec-B-indicadores-por-pestanas.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Diferencias con el documento de Chris** (decididas en la fase de preguntas):

- **Lugar de las pestañas:** con el estilo de las del mapa (`TabsList` en dos filas en el teléfono), pero **debajo de los filtros y de la `TarjetaCorrida`**, justo antes del contenido. No van en las `acciones` del encabezado, como en el mapa.
- **Vista por defecto:** sin `vista` en la URL se abre la **primera pestaña con indicador** de la vacuna elegida, en el orden de las pestañas, no siempre Avance. Así BCG (que solo tiene `COB_BCG` en la semilla) abre en Cobertura.
- **Selector de varios del mismo tipo:** un `Select` con el **nombre** de cada indicador, no botones por dosis, porque dos indicadores pueden tener la misma dosis y otro filtro.
- **Enlace del mapa:** «Más información» del mapa abre «Indicadores» en la pestaña del indicador que colorea el mapa.

## Alcance

**Entra:**

- Quitar el select «Indicador» de `paginas/indicadores/BarraFiltrosIndicadores.jsx`. Se quedan Año, Mes de corte, Vacuna, Distrito, Municipios y, para la Autoridad nacional, DDRISS.
- Las cinco pestañas en `paginas/indicadores/PaginaIndicadores.jsx`, con el parámetro `vista` en la URL.
- Un `Select` «Indicador» dentro de la pestaña cuando la vacuna tiene más de un indicador de ese tipo.
- El aviso de una pestaña sin indicador para la vacuna.
- El título «{Tipo} de {vacuna}».
- `paginas/indicadores/PanelGraficas.jsx` dibuja solo las gráficas de la pestaña y pide la serie solo en Proyección (la línea) y en Cobertura («Comparar periodos»).
- Las gráficas de cada pestaña usan el indicador elegido en ella, no el primero de su tipo (`indicadoresDelPanel` de `panelIndicadores.js`).
- El botón «Calcular» pasa a «Calcular indicadores».
- Las URL viejas con `indicador=` y sin `vista` abren la pestaña del tipo de ese indicador.
- `enlaceAIndicadores` de `paginas/mapa/PaginaMapa.jsx` manda `vista` e `indicador`.
- **Agregado en la verificación (paso 7):** que «Indicadores» no se desborde a lo ancho en escritorio. Hoy la tabla y la línea de «Proyección» estiran la página (a 1280 y 1440 px queda 66 px más ancha que la ventana y se cortan). Ya pasaba antes de este spec, con la URL vieja.
- **Agregado en la verificación (paso 7):** las pestañas en azul del tema en lugar del gris de shadcn, con dos tokens nuevos en `index.css`.
- Las pruebas de `PaginaIndicadores.test.jsx`, `panelIndicadores.test.js` y la del enlace del mapa, la verificación manual con Playwright y la nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Cambiar las tablas o las gráficas por dentro (columnas, colores, textos). Solo cambia cuáles se muestran y con qué indicador.
- El enlace «Ver indicadores» del Inicio (`ResumenIndicadores.jsx`): sigue sin `vista` y abre la pestaña por defecto.
- La marca de agua preliminar en las gráficas (spec C de Chris, que también toca `TarjetaGrafica.jsx`).
- La pantalla de carga, el control de rectificaciones y el límite de los combobox (specs D a F de Chris).
- Cambios en el backend, en `openapi.yaml`, en `backend/db/`, en permisos o en los `package.json`.

## Modelo de datos

Este spec no cambia tablas, colecciones, endpoints ni permisos. Solo agrega el parámetro `vista` a la URL de «Indicadores» y una tabla de vistas en el frontend.

### Las vistas (`panelIndicadores.js`)

```js
// En el orden de las pestañas.
export const VISTAS = {
  avance:     { tipo: 'AVANCE_META_MES', etiqueta: 'Avance',     nombreDelTipo: 'avance' },
  brecha:     { tipo: 'BRECHA',          etiqueta: 'Brecha',     nombreDelTipo: 'brecha de dosis' },
  cobertura:  { tipo: 'COBERTURA',       etiqueta: 'Cobertura',  nombreDelTipo: 'cobertura' },
  desercion:  { tipo: 'DESERCION',       etiqueta: 'Deserción',  nombreDelTipo: 'deserción entre dosis' },
  proyeccion: { tipo: 'PROYECCION',      etiqueta: 'Proyección', nombreDelTipo: 'proyección' },
}
```

Funciones puras nuevas en `panelIndicadores.js`, con prueba:

- `vistaDeTipo(tipoCalculo)`: la vista de un tipo, o `null`.
- `vistaPorDefecto(deLaVacuna)`: la primera de `VISTAS` con al menos un indicador de la vacuna; si no hay ninguno, `avance`.
- `vistaElegida(deLaVacuna, { vista, indicador })`: la de la URL si es válida; si no, la del tipo del indicador de la URL si la vacuna lo tiene (URL vieja); si no, `vistaPorDefecto`.
- `indicadoresDeLaVista(deLaVacuna, vista)`: los indicadores de la vacuna de ese tipo, en el orden de la corrida.

`indicadorElegido` (`PaginaIndicadores.jsx`) pasa a elegir entre los de la vista: el de la URL si es de la vista; si no, el primero; si la vista no tiene ninguno, `null`.

### La URL

| Parámetro | Valores | Cuándo va |
|---|---|---|
| `vista` | `avance`, `brecha`, `cobertura`, `desercion`, `proyeccion` | Al pulsar una pestaña, salvo que sea la misma que `vistaPorDefecto` de la vacuna (entonces se omite). Un valor inválido se ignora. |
| `indicador` | código del indicador | Solo al elegir en el `Select` de la pestaña. Se borra al cambiar de pestaña y, como hoy, al cambiar de vacuna o de DDRISS. Si no es de la vista, se ignora. |

Al cambiar de vacuna, `vista` se conserva: si la vacuna nueva no tiene indicador de ese tipo, la pestaña muestra el aviso.

### Textos

- Título: `{VISTAS[vista].etiqueta} de {nombre de la vacuna}`, por ejemplo «Avance de Hexavalente». Sin corrida o sin vacuna, «Indicadores».
- Aviso de una pestaña sin indicador: «La corrida no tiene un indicador de {nombreDelTipo} de {nombre de la vacuna}.», en el estilo de los avisos del mapa.
- Botón del encabezado: «Calcular indicadores».

### Qué muestra cada pestaña

| Pestaña | Tabla | Gráficas |
|---|---|---|
| Avance | `TablaResultados` (`AVANCE_META_MES`) | `GraficaPorMunicipio` y `GraficaPorVacuna` (tipo avance) |
| Brecha | `TablaBrecha` | `GraficaBrecha` |
| Cobertura | `TablaResultados` (`COBERTURA`) | `GraficaPorMunicipio`, `GraficaPorVacuna` (tipo cobertura) y `TarjetaComparacion` («Comparar periodos») |
| Deserción | `TablaDesercion` | `GraficaDesercion` |
| Proyección | `TablaProyeccion` | `GraficaAvanceProyeccion` (línea real y proyección) |

En «Proyección», la línea usa la serie del `indicador_base` de la proyección elegida, como hoy. En «Cobertura», «Comparar periodos» usa la misma base que hoy (`panel.base`).

### Orden de la pantalla

1. Encabezado: antetítulo «Indicadores», título de la vista, descripción y «Calcular indicadores» en las `acciones`.
2. Avisos de error de DDRISS y distritos.
3. Barra de filtros.
4. `TarjetaCorrida`.
5. Pestañas (solo si hay corrida con resultados).
6. Contenido de la pestaña: el `Select` «Indicador» (si hay más de uno) y la línea «código · vacuna · dosis · versión»; las gráficas y luego la tabla, como hoy; o el aviso si la pestaña no tiene indicador.
7. «Historial de corridas del año», plegado, en todas las pestañas.

Las pestañas son `Tabs` + `TabsList` + `TabsTrigger` de shadcn con `aria-label="Tipo de indicador"`, sin `TabsContent` (como en el mapa: el contenido lo decide `vista`). En el teléfono, `grid grid-cols-3` a todo el ancho (tres arriba y dos abajo); desde `sm`, `inline-flex` con su ancho.

### Color de las pestañas (agregado en la verificación)

```css
--pestana-activa: #0f7bbf;            /* el tono del celeste de --ring (#5aa0d0), más saturado */
--pestana-activa-foreground: #ffffff; /* 4.56:1 sobre --pestana-activa */
```

Se exponen en `@theme inline` como `--color-pestana-activa*`. La barra usa `bg-accent` (`#dbeaf6`) con las inactivas en `text-accent-foreground` (`#1d4a72`, 7.5:1), y la activa `bg-pestana-activa text-pestana-activa-foreground`. Como las variantes `data-active` de shadcn tienen especificidad 0, la activa se escribe con `aria-selected:`. Solo cambian las pestañas de «Indicadores»; las del mapa y `components/ui/tabs.jsx` no se tocan.

### Ancho de la página (agregado en la verificación)

La `section` de `PaginaIndicadores.jsx` lleva `contain-inline-size`: su contenido ya no fija el ancho mínimo del `main`, así que la página toma el ancho de la ventana y cada tabla se desplaza dentro de su recuadro (`overflow-x-auto`).

## Plan de implementación

1. **Funciones puras.** Agregar `VISTAS`, `vistaDeTipo`, `vistaPorDefecto`, `vistaElegida` e `indicadoresDeLaVista` en `panelIndicadores.js`, con sus casos en `panelIndicadores.test.js`: vista de la URL, vista inválida, URL vieja con `indicador`, vacuna sin avance (BCG → cobertura), vacuna sin indicadores, y dos indicadores del mismo tipo. No cambia la pantalla todavía.
2. **Indicador elegido de cada gráfica.** Cambiar `indicadoresDelPanel` para que la gráfica de la vista use el indicador elegido y no el primero de su tipo. Ajustar sus casos en `panelIndicadores.test.js`. La pantalla sigue igual, salvo que las gráficas siguen al indicador del select.
3. **`vista` en la URL.** Agregar `vista` a `filtrosDeUrl` y a `consultaDe` de `PaginaIndicadores.jsx` (omitida cuando es la de `vistaPorDefecto`) y elegir el indicador con `vistaElegida` + `indicadoresDeLaVista`. Prueba: una URL con `vista=brecha` muestra `TablaBrecha`; una con `indicador=` de una brecha y sin `vista` también.
4. **Pestañas.** Quitar el select «Indicador» de `BarraFiltrosIndicadores.jsx` (y sus props `indicadores` e `indicador`). Poner las pestañas entre la `TarjetaCorrida` y el contenido; pulsar una escribe `vista` y borra `indicador`. Agregar el `Select` «Indicador» dentro de la pestaña cuando hay más de uno, el aviso de pestaña sin indicador, el título nuevo y «Calcular indicadores». Actualizar `PaginaIndicadores.test.jsx`.
5. **Gráficas por pestaña.** `PanelGraficas` recibe `vista` y el indicador elegido y dibuja solo las de la tabla de arriba. El efecto de la serie de la línea corre solo en «Proyección»; `TarjetaComparacion` se monta solo en «Cobertura». `PanelGraficas` no se vuelve a montar al cambiar de pestaña (sin `key` por vista), para que la caché de `pedirSerie` siga entre pestañas. Pruebas: en cada pestaña aparecen solo los títulos de sus gráficas, y `obtenerSerie` no se llama en Avance, Brecha ni Deserción.
6. **Enlace del mapa.** `enlaceAIndicadores` de `PaginaMapa.jsx` agrega `vista` (`vistaDeTipo` del tipo del indicador que colorea el mapa) e `indicador` (su código) en los modos cobertura, brecha y deserción; en «Estado del reporte» no los agrega. Prueba del enlace en la prueba del mapa.
7. **Verificación manual** con Playwright contra la API real, a 1440 px y a 390 px: las cinco pestañas con Hexavalente, BCG (abre en Cobertura y las demás muestran el aviso), un enlace viejo con `indicador=`, el enlace del mapa y recargar en cada pestaña.
8. **Ajustes de la verificación.** Agregar `contain-inline-size` a la `section` de «Indicadores» y los tokens `--pestana-activa*` con sus clases en las pestañas. Comprobar con Playwright a 1280 px, 1440 px y 390 px que la página no se desborda en ninguna pestaña, y medir el contraste de las pestañas.
9. Borrar `specs/spec-B-indicadores-por-pestanas.md` y agregar la nota en «Notas de contexto» de `CLAUDE.md`.

## Criterios de aceptación

- [ ] La barra de filtros de «Indicadores» no tiene el select «Indicador».
- [ ] Debajo de la `TarjetaCorrida` hay cinco pestañas: Avance, Brecha, Cobertura, Deserción y Proyección, en ese orden.
- [ ] Cada pestaña muestra exactamente la tabla y las gráficas de la tabla «Qué muestra cada pestaña».
- [ ] Cambiar de pestaña no vuelve a pedir `listarResultados` ni `listarCorridas`.
- [ ] `obtenerSerie` solo se pide en «Proyección» y en «Cobertura».
- [ ] Pulsar una pestaña escribe `vista` en la URL, salvo la pestaña por defecto de la vacuna, y recargar abre la misma pestaña.
- [ ] Sin `vista`, Hexavalente abre en Avance y BCG abre en Cobertura.
- [ ] Una URL con `indicador=` y sin `vista` abre la pestaña del tipo de ese indicador, con ese indicador elegido.
- [ ] Con dos indicadores del mismo tipo para la vacuna, la pestaña muestra un `Select` «Indicador» con sus nombres, y elegir uno escribe `indicador` en la URL y cambia la tabla y las gráficas. Con uno solo, el `Select` no aparece.
- [ ] Una pestaña sin indicador para la vacuna se puede pulsar y muestra «La corrida no tiene un indicador de {tipo} de {vacuna}.».
- [ ] El título dice «{Tipo} de {vacuna}», por ejemplo «Avance de Hexavalente».
- [ ] El «Historial de corridas del año» aparece plegado en las cinco pestañas.
- [ ] A 390 px de ancho las pestañas quedan en dos filas, sin desplazamiento horizontal de la página.
- [ ] A 1280 px y a 1440 px ninguna pestaña desborda la página a lo ancho; la tabla de «Proyección» se desplaza dentro de su recuadro si no cabe.
- [ ] La pestaña activa es celeste (`--pestana-activa`) con texto blanco, la barra es celeste claro (`--accent`) y el texto de todas las pestañas tiene un contraste de al menos 4.5:1.
- [ ] El botón del encabezado dice «Calcular indicadores».
- [ ] «Más información» del mapa en modo Brecha abre «Indicadores» en la pestaña Brecha.
- [ ] Pasan las pruebas de `PaginaIndicadores.test.jsx`, `panelIndicadores.test.js` y del mapa, y la suite del frontend.

## Decisiones

- **Sí:** pestañas debajo de los filtros y de la `TarjetaCorrida`, con el estilo del mapa. La corrida es común a las cinco y los filtros eligen qué se calcula; la pestaña solo elige qué se mira.
- **No:** pestañas en las `acciones` del encabezado, como en el mapa. Quedaban lejos del contenido que cambian.
- **Sí:** vista por defecto = la primera con indicador de la vacuna. Evita abrir una vacuna en una pestaña vacía.
- **No:** Avance siempre por defecto con aviso. Con BCG, la primera pantalla sería un aviso.
- **Sí:** `vista` se omite en la URL cuando es la de por defecto, para que las URL sigan cortas como en el mapa. Al pulsar una pestaña sin indicador se escribe, para que recargar no salte a otra.
- **Sí:** al cambiar de vacuna se conserva la pestaña. El usuario eligió qué tipo mirar; si la vacuna no lo tiene, el aviso lo dice.
- **Sí:** `Select` con el nombre del indicador cuando hay varios del mismo tipo. Sirve también si dos comparten dosis y cambia el filtro.
- **No:** botones por dosis. Quedan ambiguos con dos indicadores de la misma dosis.
- **Sí:** pestaña sin indicador activa y con aviso, como el mapa.
- **No:** pestaña deshabilitada. No explica por qué no hay datos.
- **Sí:** `PanelGraficas` recibe la vista en lugar de dividirse en cinco componentes. Así conserva un solo `pedirSerie` y su caché entre pestañas.
- **Sí:** las gráficas siguen al indicador elegido de la pestaña. Con las pestañas, el indicador de la tabla y el de las gráficas deben ser el mismo.
- **Sí:** el enlace del mapa manda `vista` e `indicador` según el indicador que colorea. En modo Cobertura, el mapa puede usar un indicador de avance; el tipo del indicador, no el nombre del modo, elige la pestaña.
- **Sí:** gráficas arriba y tabla abajo dentro de la pestaña, como hoy.
- **No:** `TabsContent` de shadcn. Con la vista en la URL, solo se monta el contenido de la pestaña elegida, como en el mapa.
- **Sí:** corregir en este spec el desbordamiento de «Proyección», aunque ya existía. Con las pestañas, la proyección queda en su propia pestaña y el corte se nota más (pedido en la verificación).
- **Sí:** `contain-inline-size` en la `section` de la página. Arregla las cinco pestañas y cualquier ancho de escritorio sin tocar el `Layout`.
- **No:** `min-w-0` en el `main` del `Layout`. Arreglaría todas las pantallas, pero es un cambio global fuera de este spec.
- **Sí:** celeste `#0f7bbf` con texto blanco para la pestaña activa (pedido en la verificación: que resalte, más celeste que azul y con letra blanca). Tiene el tono del celeste del tema (`--ring`, 204°), más saturado y algo más oscuro para llegar a 4.56:1 con blanco.
- **No:** `#5aa0d0` tal cual, la segunda prueba. Con texto blanco da 2.85:1 y con `--marca-profundo` se leía, pero se pidió letra blanca.
- **No:** el azul `#2f74b5` con texto blanco (4.9:1), que fue la primera prueba. Se veía más azul que celeste.
- **No:** `--chart-1` (`#4683bb`). Con texto blanco da 4.0:1, por debajo de AA, y es un color de gráficas.
- **No:** cambiar `components/ui/tabs.jsx`. Lo genera shadcn y lo usan otras pantallas; el color va en las clases de «Indicadores».

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El spec C de Chris también toca `TarjetaGrafica.jsx` y las gráficas. | No trabajarlos en la misma rama a la vez; este spec no cambia `TarjetaGrafica.jsx`. |
| Desmontar `PanelGraficas` al cambiar de pestaña vacía la caché de `pedirSerie` y repite peticiones. | `PanelGraficas` se queda montado (sin `key` por vista); la prueba del paso 5 cuenta las llamadas a `obtenerSerie`. |
| Cinco pestañas no caben en una fila a 390 px. | `grid-cols-3` en el teléfono, comprobado a 390 px en el paso 7. |
| Un enlace guardado con `indicador=` de un indicador que ya no está en la corrida. | `vistaElegida` lo ignora y abre la vista por defecto, como hoy `indicadorElegido`. |

## Lo que **no** entra en este spec

- Cambios dentro de las tablas o las gráficas.
- El enlace «Ver indicadores» del Inicio.
- Los specs C a F de Chris.
- Cambios en el backend, el contrato, la base, los permisos o los `package.json`.
