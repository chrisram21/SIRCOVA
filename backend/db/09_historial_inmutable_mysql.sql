-- =============================================================================
--  SIRCOVA: HISTORIAL DE ESTADOS INMUTABLE para MySQL (vacunacion_ddriss, modelo v0.10)
--  Fecha: 2026-11-01 (SPEC 42, HU-34)
--
--  Agrega un trigger que impide UPDATE sobre historial_estado_reporte: cada
--  cambio de estado del reporte queda como se escribió. Protege también contra
--  sentencias escritas a mano.
--
--  No impide DELETE: las pruebas borran el historial de sus reportes al limpiar
--  (la llave foránea a reporte_produccion lo exige). La API no borra filas.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03) y no toca datos:
--  solo quita y vuelve a crear su trigger. Se puede volver a correr encima las
--  veces que haga falta.
--
--  Cómo usarlo:
--    1. Ejecutar antes 01_modelo_relacional_mysql.sql (crea la tabla).
--    2. Ejecutar este script después del 01, cada vez que se recree la base.
--  El trigger es de una sola sentencia, así que no hace falta DELIMITER.
-- =============================================================================

USE vacunacion_ddriss;

DROP TRIGGER IF EXISTS trg_historial_sin_update;
CREATE TRIGGER trg_historial_sin_update
  BEFORE UPDATE ON historial_estado_reporte
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El historial de estados no se puede modificar.';
