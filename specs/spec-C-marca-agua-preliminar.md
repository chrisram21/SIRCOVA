# Spec C. Marca de agua «Preliminar» (punto 5)

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

> **Choque con otros specs:** el spec B reacomoda las gráficas que usan `TarjetaGrafica.jsx`.

- **Dónde:** `paginas/indicadores/TarjetaGrafica.jsx` (tarjeta común de todas las gráficas) y quien la usa. La corrida trae `parcial` (ya se muestra «Cálculo parcial» en `TarjetaCorrida` y la insignia «Parcial» en el Inicio, `paginas/inicio/ResumenIndicadores.jsx`).
- **Cambio:**
  - `TarjetaGrafica` recibe `preliminar`; con `true` pinta sobre el área de la gráfica el texto **PRELIMINAR** en diagonal, grande y semitransparente, que no tapa la lectura ni bloquea el tooltip (`pointer-events: none`).
  - Las gráficas de la corrida reciben `preliminar = corrida.parcial`. En «Comparar periodos», si algún periodo comparado es parcial.
  - Recomendado incluir el mapa territorial (`paginas/mapa/MapaMunicipios.jsx`) con la misma marca cuando su corrida es parcial, porque también se captura y comparte como imagen.
- **Fuera:** los informes PDF/Excel (HU-47, HU-48); dejar una nota en esas HU para que lleven la misma leyenda.
- **Criterios:**
  - Con una corrida parcial, todas las gráficas muestran la marca; con una completa, ninguna.
  - La marca sale en una captura de pantalla y no impide el tooltip.
  - Es legible en tema claro y oscuro.
