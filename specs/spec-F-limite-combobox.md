# Spec F. Límite de opciones en los combobox que crecen (punto 11)

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

> Aprobado por Chris (2026-11-10): se aplica la recomendación.

### Dónde crece hoy

| Pantalla | Combobox | Cómo crece |
|---|---|---|
| Bandeja de revisión (`PaginaBandejaRevision.jsx`) | Mes | Todos los meses abiertos alguna vez por la DDRISS (`listarPeriodos()` sin filtro): +12 por año |
| Registrar / editar personal (`CamposEmpleado.jsx`) | Establecimiento | ~195 opciones en una lista sin búsqueda |
| Mis reportes, Rectificaciones | Año | +1 por año (no es problema) |
| Indicadores, Mapa | Año | Ya limitado a 6 años hacia atrás (`ANIOS_HACIA_ATRAS`) |
| Registro de producción | Mes | Solo meses abiertos (ya acotado) |

**Nota honesta:** 12 filas por año no pesan en red ni en memoria; el problema es de uso (listas largas de recorrer), no de rendimiento. Por eso no se cambia el backend.

### Opciones

1. **Año + Mes** (dos selects, como Indicadores y Mapa): el mes nunca pasa de 12 opciones; los periodos se piden por año (`listarPeriodos({ anio })`, que ya existe).
2. **Últimos 12 meses + «Meses anteriores…»**: la lista muestra solo el último año y una opción abre un selector de año.
3. **Combobox con búsqueda** (shadcn `Command`): escribir para filtrar. Útil para listas grandes de nombres, no tanto para meses.
4. **Paginación o carga bajo demanda** en la lista: más compleja y sin beneficio con estos volúmenes.

### Decisión

- **Bandeja de revisión:** opción 1, Año + Mes. Es el mismo patrón que Indicadores y Mapa, queda acotado para siempre y el mes por defecto sigue siendo el abierto más antiguo. La URL sigue con `periodo`.
- **Establecimiento en personal (y donde aparezca una lista de establecimientos):** opción 3, combobox con búsqueda.
- **Regla general para lo nuevo** (p. ej. filtros de informes de HU-45): fechas como Año + Mes; catálogos de más de ~20 nombres, con búsqueda.

**Criterios:**

- En la bandeja el mes nunca muestra más de 12 opciones y el año lista solo años con meses abiertos.
- Una URL vieja con `periodo` abre el año y mes correctos.
- El establecimiento se encuentra escribiendo parte del nombre.
