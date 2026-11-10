# SPEC 55 — Marca de agua «Preliminar»

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec C» de Chris, punto 5 de `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 44, SPEC 47, SPEC 49, SPEC 50, SPEC 51 y SPEC 54
> **Fecha:** 2026-11-09
> **Objetivo:** Pintar la marca de agua **PRELIMINAR** sobre las gráficas de «Indicadores» y sobre el mapa territorial cuando sus datos salen de un cálculo parcial.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hoy una corrida parcial (con meses sin cerrar) solo se avisa con el texto «Cálculo parcial» de `TarjetaCorrida` y la insignia «Parcial» del Inicio. Una gráfica o el mapa se capturan y se comparten como imagen, y en la imagen no queda rastro de que los datos todavía pueden cambiar. Chris lo dejó en `specs/spec-C-marca-agua-preliminar.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Diferencias con el documento de Chris** (decididas en la fase de preguntas):

- **Qué cubre:** solo el área dibujada (lo que va dentro de `TarjetaGrafica` debajo del resumen), no el título, el subtítulo ni el resumen.
- **«Comparar periodos»:** la marca va solo sobre la gráfica, no sobre su tabla (que ya dice «(parcial)» en cada celda), y aparece si **algún valor** comparado es parcial.
- **Proyección:** la línea lleva la marca si la corrida elegida es parcial, como las demás; los meses anteriores parciales ya se ven como puntos huecos.
- **Mapa:** entra, pero solo en los modos de indicador (Cobertura, Brecha y Deserción); «Estado del reporte» no sale de una corrida.
- **Tema oscuro:** la app no tiene tema oscuro (ningún código pone la clase `.dark`). El criterio «legible en claro y oscuro» se cambia por «legible sobre la tarjeta y sobre las barras del semáforo»; el color sale de un token, así que un tema oscuro futuro solo lo redefine.
- **Accesibilidad:** la marca es decorativa (`aria-hidden`) y va acompañada de un texto solo para lectores de pantalla.

## Alcance

**Entra:**

- Componente nuevo `paginas/indicadores/MarcaPreliminar.jsx`.
- Prop `preliminar` en `paginas/indicadores/TarjetaGrafica.jsx`.
- `paginas/indicadores/PanelGraficas.jsx` pasa `preliminar={corrida.parcial}` a `GraficaPorMunicipio`, `GraficaPorVacuna`, `GraficaBrecha`, `GraficaDesercion` y `GraficaAvanceProyeccion`, y cada una lo pasa a su `TarjetaGrafica` solo cuando dibuja una gráfica.
- `paginas/indicadores/TarjetaComparacion.jsx`: la marca sobre `GraficaComparacionAnios` o `GraficaComparacionMeses` si algún valor es parcial, con la función pura `hayParcial` en `comparacionPeriodos.js`.
- `paginas/mapa/PaginaMapa.jsx`: la marca sobre `MapaMunicipios` en los modos de indicador con corrida parcial.
- Token `--marca-preliminar` en `index.css`.
- Una nota en HU-47 y HU-48 de `docs/SPECS/HISTORIAS_DE_USUARIO.md` para que los informes lleven la misma leyenda.
- Las pruebas, la verificación manual con Playwright, la nota en `CLAUDE.md` y borrar `specs/spec-C-marca-agua-preliminar.md`.

**Fuera de alcance (para otros specs):**

- Los informes en PDF y Excel (HU-47 y HU-48): solo se deja la nota.
- Las tarjetas del Inicio (`paginas/inicio/ResumenIndicadores.jsx`): no tienen gráficas y ya muestran la insignia «Parcial».
- Las tablas de «Indicadores» (`TablaResultados`, `TablaBrecha`, `TablaDesercion`, `TablaProyeccion`, `TablaComparacion`).
- El modo «Estado del reporte» del mapa y el panel del municipio (`PanelMunicipio.jsx`).
- Un tema oscuro.
- Cambios en el backend, en `openapi.yaml`, en `backend/db/`, en permisos o en los `package.json`. `Corrida.parcial` y `SerieIndicador.puntos[].parcial` ya existen.

## Modelo de datos

Este spec no cambia tablas, colecciones, endpoints ni permisos. Agrega un token del tema, un componente y una función pura.

### Token de `index.css`

```css
--marca-preliminar: #1d4a72; /* el azul de --accent-foreground; se pinta con opacidad baja */
```

Se expone en `@theme inline` como `--color-marca-preliminar`, para usar `text-marca-preliminar/15`. La opacidad de partida es 15 %; se ajusta entre 10 % y 20 % en la verificación (paso 6), mirando capturas sobre las barras verde, amarilla y roja del semáforo.

### `MarcaPreliminar.jsx`

```jsx
<MarcaPreliminar activa={booleano} className?>{lo que cubre}</MarcaPreliminar>
```

- Con `activa` en `false`, devuelve los `children` sin envolver (el DOM no cambia respecto de hoy).
- Con `activa` en `true`:
  - Un contenedor `relative isolate` con los `children`. `isolate` encierra el `z-[450]` de la capa: sin él, la marca se pintaría sobre el encabezado o los menús al desplazar la página.
  - Encima, una capa `absolute inset-0` con `pointer-events-none`, `select-none`, `overflow-hidden` y `aria-hidden="true"`, que centra el texto **PRELIMINAR** en negrita, con `tracking-widest`, rotado −30° y con un tamaño relativo al ancho y al alto de la capa (`container-type: size` y `min(13cqw, 20cqh, 4.5rem)`), en `text-marca-preliminar/15`. Lleva `data-marca="preliminar"` para las pruebas.
  - En una capa alta, una sola copia deja datos sin cubrir (agregado en la verificación): la capa pone el texto cinco veces en columna (`flex-col justify-evenly`) y las copias 2 a 5 (`.marca-copia` con `data-copia`) están ocultas. `index.css` muestra cada una con una consulta de contenedor por proporción: la 2 con `max-aspect-ratio: 4/5`, la 3 con `1/2`, la 4 con `3/8` y la 5 con `3/10`. El texto rotado ocupa de alto unas 0.6 veces el ancho de la capa, así que cada copia aparece cuando cabe sin chocar con la anterior.
  - Un texto `sr-only`: «Datos preliminares: el cálculo incluye meses sin cerrar.»
- La capa lleva siempre `z-[450]`, que en las gráficas no estorba y en el mapa la pone sobre los paneles de Leaflet. `className` se aplica al contenedor.

### `TarjetaGrafica.jsx`

Agrega la prop `preliminar` (por defecto `false`). El resumen sigue fuera; los `children` van dentro de `<MarcaPreliminar activa={preliminar}>`. Cada gráfica pasa `preliminar` solo en el `return` que dibuja la gráfica, no en los que muestran `SinDatos` (sin indicador, sin datos, cargando o con error).

### `hayParcial` (`comparacionPeriodos.js`)

- Modo año: `true` si algún `valores[].parcial` de las líneas válidas (`puntosPorAnio`) es `true`.
- Modo mes: `true` si alguna fila con datos de `filasPorMes` tiene `parcial` en `true`.

### Mapa

En `PaginaMapa.jsx`, dentro del `div` `relative isolate` del mapa, `MapaMunicipios` queda envuelto en `<MarcaPreliminar activa={modo !== 'estado' && corrida?.parcial === true}>` (`'estado'` es «Estado del reporte» en `MODOS` de `mapaTerritorial.js`). La capa va por encima de los polígonos de Leaflet (`z-[450]`, sobre el `overlayPane` de 400) y por debajo de la leyenda (`z-[1000]`) y de los tooltips (650) y popups (700) de Leaflet. Con `pointer-events-none`, el clic, el arrastre y el zoom siguen llegando al mapa.

### Notas de HU-47 y HU-48

En cada una, después de «Cómo se hará» (y de la nota del spec 49 en HU-47):

> **Nota (2026-11-09, spec 55):** si los datos del informe salen de una corrida parcial (`Corrida.parcial`), el archivo lleva la leyenda «PRELIMINAR», como la marca de agua de las gráficas y del mapa.

## Plan de implementación

1. **Token y componente.** Agregar `--marca-preliminar` en `index.css` y `MarcaPreliminar.jsx`, con su prueba `MarcaPreliminar.test.jsx`: con `activa` en `false` no hay `[data-marca="preliminar"]` ni texto para lectores; con `true` hay una capa con `aria-hidden="true"`, el texto «PRELIMINAR» y el texto `sr-only`. La pantalla no cambia.
2. **`TarjetaGrafica` y las gráficas de la corrida.** Agregar `preliminar` a `TarjetaGrafica`, pasarlo desde `PanelGraficas` (`corrida.parcial`) a las cinco gráficas y de cada una a su `TarjetaGrafica` cuando dibuja. Pruebas en `PaginaIndicadores.test.jsx`: con una corrida parcial, cada pestaña (Avance, Brecha, Cobertura, Deserción, Proyección) tiene la marca en cada tarjeta de gráfica; con una completa, ninguna; y una tarjeta con «sin datos» no la tiene.
3. **«Comparar periodos».** Agregar `hayParcial` a `comparacionPeriodos.js` con sus casos en `comparacionPeriodos.test.js` (modo año y modo mes, con y sin valores parciales) y envolver la gráfica de `Comparacion` en `MarcaPreliminar`, dejando la tabla fuera. Prueba en `PaginaIndicadores.test.jsx` (`vista=cobertura`): una serie con un punto parcial muestra la marca en la gráfica de comparación y no sobre la tabla.
4. **Mapa.** Envolver `MapaMunicipios` en `PaginaMapa.jsx` como dice «Mapa». Pruebas en `PaginaMapa.test.jsx` (con `MapaMunicipios` simulado, como hoy): corrida parcial en modo Cobertura muestra la marca; corrida completa no; modo «Estado del reporte» con corrida parcial no.
5. **Notas de las historias.** Agregar la nota en HU-47 y HU-48 de `HISTORIAS_DE_USUARIO.md`.
6. **Verificación manual** con Playwright contra la API real, a 1440 px y a 390 px, con la corrida parcial de septiembre de 2026 y una completa (agosto de 2026): la marca en las cinco pestañas y en el mapa, el tooltip de Recharts sobre una barra marcada, el clic en un municipio marcado, y capturas de pantalla sobre barras de los tres colores del semáforo para fijar la opacidad del token.
7. Borrar `specs/spec-C-marca-agua-preliminar.md` y agregar la nota en «Notas de contexto» de `CLAUDE.md`.

## Criterios de aceptación

- [ ] Con una corrida parcial, todas las gráficas de las cinco pestañas de «Indicadores» muestran la marca **PRELIMINAR** sobre el área dibujada; con una corrida completa, ninguna.
- [ ] El título, el subtítulo y el resumen de cada tarjeta quedan fuera de la marca.
- [ ] Una tarjeta que muestra un mensaje de «sin datos», de carga o de error no lleva la marca.
- [ ] En «Comparar periodos», la gráfica lleva la marca si algún periodo comparado tiene un valor parcial, aunque la corrida elegida esté completa; su tabla nunca la lleva.
- [ ] En el mapa, con una corrida parcial, los modos Cobertura, Brecha y Deserción muestran la marca y «Estado del reporte» no; con una corrida completa, ningún modo.
- [ ] Al pasar el puntero sobre una barra o un punto marcado, el tooltip de Recharts aparece igual que sin la marca.
- [ ] Con la marca, un clic en un municipio del mapa lo elige y el mapa se puede arrastrar y acercar.
- [ ] La marca sale en una captura de pantalla de la tarjeta y del mapa.
- [ ] Sobre barras verdes, amarillas y rojas del semáforo, los nombres y valores de la gráfica se siguen leyendo con la marca encima.
- [ ] La leyenda del mapa queda por encima de la marca.
- [ ] La capa de la marca tiene `aria-hidden="true"` y la tarjeta (o el mapa) tiene el texto para lectores «Datos preliminares: el cálculo incluye meses sin cerrar.».
- [ ] El color de la marca sale de `--marca-preliminar`, no de un color escrito en el componente.
- [ ] A 390 px de ancho, el texto de la marca cabe dentro de cada gráfica sin desbordarla.
- [ ] Una capa más alta que ancha repite la marca: «Avance por municipio» y «Cobertura por municipio» llevan 2 copias a 1440 px y 4 a 390 px, y el mapa 2 a 390 px; las gráficas anchas o cuadradas llevan 1.
- [ ] HU-47 y HU-48 tienen la nota del spec 55.
- [ ] Pasan `MarcaPreliminar.test.jsx`, `comparacionPeriodos.test.js`, `PaginaIndicadores.test.jsx`, `PaginaMapa.test.jsx` y la suite del frontend.

## Decisiones

- **Sí:** un componente `MarcaPreliminar` que envuelve lo que cubre. Lo usan `TarjetaGrafica`, «Comparar periodos» y el mapa, que no comparten tarjeta.
- **No:** dibujar la marca dentro de cada gráfica de Recharts (por ejemplo, un `<text>` en el SVG). No serviría para `BarrasHorizontales` ni para el mapa, y habría que repetirlo en cada gráfica.
- **Sí:** la marca cubre solo el área dibujada. El título y el resumen se leen limpios y son los que dicen qué se mira.
- **No:** cubrir todo el `CardContent`. El resumen en texto quedaría debajo de la marca.
- **Sí:** `preliminar = corrida.parcial` en las gráficas de la corrida, también en la línea de proyección. Los meses anteriores parciales ya se distinguen con puntos huecos y «(parcial)» en el tooltip.
- **No:** marcar la línea si cualquier punto es parcial. Con la regla común, todas las gráficas de una pestaña coinciden con el aviso de `TarjetaCorrida`.
- **Sí:** en «Comparar periodos», la marca si algún valor es parcial, porque compara periodos de otras corridas que pueden ser parciales aunque la elegida no lo sea.
- **No:** la marca sobre la tabla de comparación. Ya dice «(parcial)» por celda y la marca estorbaría la lectura de los números.
- **Sí:** el mapa en los modos de indicador. Se captura y se comparte como imagen igual que una gráfica.
- **No:** la marca en «Estado del reporte». Muestra el estado de los reportes, que no es un cálculo.
- **Sí:** `aria-hidden` en la marca y un texto `sr-only`. Un lector de pantalla no leería «PRELIMINAR» suelto en medio de la gráfica, pero sí debe saber que los datos son preliminares.
- **No:** un texto visible además de la marca. La marca y «Cálculo parcial» de `TarjetaCorrida` ya lo dicen a la vista.
- **Sí:** token nuevo `--marca-preliminar` con el azul del tema y opacidad baja. Un gris no se distingue sobre las barras claras del semáforo y un rojo se confundiría con la franja roja.
- **No:** `--destructive`. Se lee como error o como la franja roja.
- **Sí:** tamaño relativo al ancho y al alto de la capa (`cqw` y `cqh`). La misma marca sirve en una tarjeta de media columna, en una de ancho completo y en el teléfono.
- **Sí:** varias copias en las capas altas, con consultas de contenedor por `aspect-ratio` (pedido en la verificación). «Avance por municipio» tiene 896 px de alto y una sola copia dejaba la mitad de las barras sin marca; en el teléfono, la tarjeta y el mapa son aún más altos que anchos.
- **No:** contar las copias con JavaScript (`ResizeObserver`). El CSS ya sabe el tamaño de la capa y no hace falta volver a dibujar al cambiar el ancho.
- **No:** tamaño solo por el ancho (`cqw`), que era lo planeado. En la verificación, el texto rotado se cortaba abajo en las gráficas anchas y bajas (la línea de «Proyección» y «Comparar periodos» a 1440 px).
- **Sí:** solo tema claro. La app no tiene tema oscuro; el token deja el cambio listo si algún día se agrega.
- **Sí:** las notas en HU-47 y HU-48 dentro de este spec, como la nota del spec 49 en HU-47.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La capa tapa el tooltip o los clics de las gráficas o del mapa. | `pointer-events-none` en la capa; criterios del tooltip y del clic en el mapa, comprobados en el paso 6. |
| Los z-index de Leaflet ponen la marca debajo de los polígonos o encima de la leyenda. | `z-[450]` dentro del `isolate` del mapa, entre el `overlayPane` (400) y la leyenda (1000); comprobado en el paso 6. |
| Con opacidad baja, la marca no se ve sobre las barras claras; con alta, tapa los números. | Opacidad de partida 15 %, ajustada entre 10 % y 20 % con capturas sobre los tres colores en el paso 6. |
| El texto rotado desborda la gráfica en el teléfono. | `overflow-hidden` en la capa y tamaño en `cqw` y `cqh`; comprobado a 1440 px y a 390 px. |
| El spec 54 movió las gráficas a pestañas y `PanelGraficas` cambió hace poco. | Este spec parte de `main` con el spec 54 ya integrado y solo agrega props. |

## Lo que **no** entra en este spec

- La leyenda «PRELIMINAR» en los informes PDF y Excel (HU-47 y HU-48).
- Las tarjetas del Inicio, las tablas de «Indicadores» y el panel del municipio del mapa.
- El modo «Estado del reporte» del mapa.
- Un tema oscuro.
- Cambios en el backend, el contrato, la base, los permisos o los `package.json`.
