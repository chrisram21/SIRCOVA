-- =============================================================================
--  SIRCOVA: BITÁCORA INMUTABLE para MySQL (vacunacion_ddriss, modelo v0.8)
--  Fecha: 2026-10-20 (SPEC 05, HU-53)
--
--  Agrega dos triggers que impiden UPDATE y DELETE sobre bitacora (regla 7 de
--  AGENTS.md). Protegen también contra sentencias escritas a mano.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03) y no toca datos:
--  solo quita y vuelve a crear sus dos triggers. Se puede volver a correr encima
--  las veces que haga falta. DROP DATABASE, que usa el 01, sigue funcionando.
--
--  Cómo usarlo:
--    1. Ejecutar antes 01_modelo_relacional_mysql.sql (crea la tabla).
--    2. Ejecutar este script después del 01, cada vez que se recree la base.
--  Cada trigger es de una sola sentencia, así que no hace falta DELIMITER.
-- =============================================================================

USE vacunacion_ddriss;

DROP TRIGGER IF EXISTS trg_bitacora_sin_update;
CREATE TRIGGER trg_bitacora_sin_update
  BEFORE UPDATE ON bitacora
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora no se puede modificar ni borrar.';

DROP TRIGGER IF EXISTS trg_bitacora_sin_delete;
CREATE TRIGGER trg_bitacora_sin_delete
  BEFORE DELETE ON bitacora
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora no se puede modificar ni borrar.';
