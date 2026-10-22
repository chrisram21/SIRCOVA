-- =============================================================================
--  SIRCOVA: CUI DEL EMPLEADO para MySQL (vacunacion_ddriss, modelo v0.9)
--  Fecha: 2026-10-22 (SPEC 11, ajustes a HU-04 y HU-05)
--
--  Cambia empleado.codigo_empleado por empleado.cui_hmac: la huella
--  HMAC-SHA256 del CUI del DPI, que impide registrar dos veces a la misma
--  persona sin guardar el número. El backend calcula la huella con la clave
--  CUI_HMAC_CLAVE; SQL no puede calcularla.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03). Sí BORRA los
--  códigos de empleado que haya: no son huellas y no sirven. Ese UPDATE no pasa
--  por la bitácora porque es una migración, no una acción de un usuario.
--  Se puede volver a correr encima: cada paso revisa information_schema y no
--  hace nada si ya está aplicado.
--
--  Cómo usarlo:
--    Solo en bases creadas con un 01 anterior a la v0.9. Desde la v0.9, el 01
--    ya crea cui_hmac y uq_empleado_cui; correr este script encima no hace daño.
-- =============================================================================

USE vacunacion_ddriss;

SET @tiene_codigo = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'empleado' AND column_name = 'codigo_empleado'
);

-- 1. Vaciar los códigos actuales.
SET @sentencia = IF(@tiene_codigo > 0, 'UPDATE empleado SET codigo_empleado = NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 2. Renombrar la columna y cambiar su tipo.
SET @sentencia = IF(
  @tiene_codigo > 0,
  'ALTER TABLE empleado CHANGE COLUMN codigo_empleado cui_hmac CHAR(64) NULL COMMENT ''HMAC-SHA256 en hexadecimal del CUI (13 dígitos); nunca el CUI''',
  'DO 0'
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 3. Renombrar el índice único.
SET @tiene_indice = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'empleado' AND index_name = 'uq_empleado_codigo'
);
SET @sentencia = IF(@tiene_indice > 0, 'ALTER TABLE empleado RENAME INDEX uq_empleado_codigo TO uq_empleado_cui', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
