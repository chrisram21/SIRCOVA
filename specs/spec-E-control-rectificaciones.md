# Spec E. Control de rectificaciones por establecimiento (punto 6)

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

> Decisiones de Chris (2026-11-10): se cuenta por establecimiento, umbral de 5 al mes, la alerta la recibe el Administrador y es solo aviso, sin bloqueo.

- **Dónde:** `backend/src/modulos/revision/rectificaciones.service.js` (`solicitarRectificacion`, `obtenerRectificacion`), `paginas/rectificaciones/PaginaNuevaRectificacion.jsx` y `PaginaDetalleRectificacion.jsx`. Tablas `solicitud_rectificacion` (`reporte_id`, `solicitado_en`), `reporte_produccion` (establecimiento) y `alerta`.
- **Cambio:**
  - Contar las solicitudes de rectificación de los reportes de un establecimiento en el mes calendario de `solicitado_en`, en cualquier estado (también las rechazadas). Sin cambios de tabla: un `COUNT` uniendo `solicitud_rectificacion` con `reporte_produccion`.
  - Umbral fijo en el backend: **5** solicitudes al mes (constante, como el «N días» de HU-50).
  - **Solo aviso, nunca bloquea:** quien solicita ve «El establecimiento lleva 4 solicitudes de rectificación en noviembre; esta será la 5.ª». Quien resuelve ve el conteo en el detalle.
  - Al llegar a 5 se crea una fila en `alerta`: tipo `PROCESO` (ya existe en el ENUM), `establecimiento_id`, `ddriss_id`, `periodo_id` del mes, `rol_destino_id` = **ADMINISTRADOR**. Una sola por establecimiento y mes (las solicitudes 6, 7… no crean otra).
  - El Administrador la verá cuando exista HU-52 (Consultar y atender alertas, Sprint 5); hasta entonces quedan los avisos en pantalla. Dejar nota en HU-50/HU-52.
- **Criterios:**
  - La 5.ª solicitud del mes de un establecimiento muestra el aviso y se guarda igual.
  - Se crea una sola alerta por establecimiento y mes, dirigida al Administrador.
  - Las solicitudes de otro mes o de otro establecimiento no cuentan.
  - Pruebas del backend para el conteo, el umbral y que no se duplique la alerta.
