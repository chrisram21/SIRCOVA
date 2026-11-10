# Spec D. Pantalla de carga en las transiciones (punto 10)

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

- **Dónde:** `componentes/PantallaCargaSesion.jsx` (logo animado + barra, a pantalla completa, solo al recuperar la sesión en `App.jsx`); `componentes/layout/Layout.jsx` (`CargandoPantalla`, el fallback de `Suspense` con esqueletos); los esqueletos de carga de `PaginaMapa.jsx` y `PaginaIndicadores.jsx`.
- **Cambio:**
  - Sacar de `PantallaCargaSesion` un componente reutilizable (p. ej. `PantallaCarga`) con dos variantes: completa (la de la sesión) y **contenida** (ocupa el área de contenido; el menú lateral y el encabezado se quedan).
  - La variante contenida reemplaza a `CargandoPantalla` en `Layout.jsx` (descarga del código de cada pantalla).
  - Se usa también en la **primera** carga de datos de Mapa e Indicadores (y de otra pantalla que tarde, p. ej. Inicio o Revisar reporte). Al cambiar un filtro después, se quedan los esqueletos actuales, para no tapar la pantalla en cada cambio.
  - Aparece solo si la carga pasa de ~300 ms, para que no parpadee en las rápidas.
  - Respeta `prefers-reduced-motion` y conserva `role="status"` con su etiqueta.
- **Criterios:**
  - Entrar a Mapa o Indicadores con datos lentos muestra logo y barra, nunca la pantalla vacía.
  - Una pantalla que carga en menos de ~300 ms no muestra nada.
  - El menú lateral sigue visible durante la carga.
