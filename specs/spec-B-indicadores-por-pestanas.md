# Spec B. Indicadores por pestañas (punto 8)

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

> **Choque con otros specs:** las tablas de indicadores también cambian en el spec A (A2, A3) y `TarjetaGrafica.jsx` en el spec C; no trabajarlos en la misma rama a la vez.

**Dónde:** `paginas/indicadores/PaginaIndicadores.jsx`, `BarraFiltrosIndicadores.jsx`, `PanelGraficas.jsx`, `panelIndicadores.js`. Patrón a copiar: las pestañas de modo de `paginas/mapa/PaginaMapa.jsx` (`Tabs` de shadcn en las `acciones` de `EncabezadoPagina`, parámetro `modo` en la URL, dos filas en el teléfono).

**Hoy:** un select «Indicador» elige la tabla y debajo se ven todas las gráficas a la vez (`PanelGraficas`), más «Comparar periodos» y el historial.

**Cambio:**

- Se quita el select «Indicador» de `BarraFiltrosIndicadores`. Se quedan Año, Mes de corte, Vacuna, Distrito y Municipios (y DDRISS para la autoridad nacional).
- Pestañas por tipo, en la URL como `vista` (`avance` por defecto, que se omite en la URL): **Avance · Brecha · Cobertura · Deserción · Proyección**. El título de la página dice «{Tipo} de {vacuna}», p. ej. «Avance de Hexavalente». Las etiquetas de la pestaña van cortas para que quepan como en el mapa.
- Cada pestaña muestra su tabla y sus gráficas:

| Pestaña | Tabla | Gráficas |
|---|---|---|
| Avance | `TablaResultados` (AVANCE_META_MES) | `GraficaPorMunicipio` (avance), `GraficaPorVacuna` (avance) |
| Brecha | `TablaBrecha` | `GraficaBrecha` |
| Cobertura | `TablaResultados` (COBERTURA) | `GraficaPorMunicipio` (cobertura), `GraficaPorVacuna` (cobertura), `TarjetaComparacion` («Comparar periodos») |
| Deserción | `TablaDesercion` | `GraficaDesercion` |
| Proyección | `TablaProyeccion` | `GraficaAvanceProyeccion` (línea real + proyección) |

- `TarjetaCorrida` (fecha, motivo, aviso de cálculo parcial) queda arriba de las pestañas; el **Historial de corridas del año** queda debajo, plegable, en todas.
- Si la vacuna tiene **más de un indicador del mismo tipo** (p. ej. COB_HEXA1 y COB_HEXA3), la pestaña muestra un selector chico de dosis dentro de ella; se sigue usando el parámetro `indicador`. Con uno solo, no aparece.
- Una pestaña sin indicador calculado para la vacuna se muestra con un aviso («La corrida no tiene un indicador de brecha de {vacuna}»), como el mapa.
- `PanelGraficas` se divide (o recibe la vista) para pintar solo lo de la pestaña; la serie de la línea se pide solo en Proyección y Cobertura (comparar).
- El botón «Calcular» pasa a **«Calcular indicadores»**.
- Las URL viejas con `indicador=` siguen funcionando: la vista se deduce del tipo de ese indicador.

**Criterios:**

- No existe el select «Indicador»; las cinco pestañas cambian tabla y gráficas sin recargar la corrida.
- Cada pestaña muestra exactamente lo de la tabla de arriba.
- `vista` (y `indicador` cuando aplica) quedan en la URL; recargar mantiene la pestaña.
- El historial de corridas aparece plegado en las cinco.
- Funciona en 390 px de ancho (pestañas en dos filas).
- El botón dice «Calcular indicadores».
- Se actualizan `PaginaIndicadores.test.jsx` y `panelIndicadores.test.js`.
