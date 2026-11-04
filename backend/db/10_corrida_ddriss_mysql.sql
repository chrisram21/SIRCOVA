-- =============================================================================
--  SIRCOVA: CORRIDAS DE INDICADORES POR DDRISS para MySQL (vacunacion_ddriss, modelo v0.11)
--  Fecha: 2026-11-03 (SPEC 44, HU-36)
--
--  Agrega corrida_calculo.ddriss_id: cada corrida del motor de indicadores es
--  de una DDRISS, y la corrida vigente es una por (DDRISS, año, mes_hasta).
--  Así la fila departamental de resultado_indicador (municipio_id NULL) se
--  distingue por la DDRISS de su corrida. Las corridas que ya existían pasan a
--  DDRISS_SM, la única que opera hoy.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03). Ese UPDATE no
--  pasa por la bitácora porque es una migración, no una acción de un usuario.
--  Se puede volver a correr encima: cada paso revisa information_schema y no
--  hace nada si ya está aplicado.
--
--  Cómo usarlo:
--    Solo en bases creadas con un 01 anterior a la v0.11. Desde la v0.11, el
--    01 ya crea la columna, el índice y la llave; correr este script encima no
--    hace daño.
-- =============================================================================

USE vacunacion_ddriss;

-- 1. Agregar la columna, todavía sin NOT NULL.
SET @tiene_columna = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo' AND column_name = 'ddriss_id'
);
SET @sentencia = IF(
  @tiene_columna = 0,
  'ALTER TABLE corrida_calculo ADD COLUMN ddriss_id TINYINT UNSIGNED NULL AFTER id',
  'DO 0'
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 2. Las corridas que ya existían son de DDRISS_SM.
UPDATE corrida_calculo
   SET ddriss_id = (SELECT id FROM ddriss WHERE codigo = 'DDRISS_SM')
 WHERE ddriss_id IS NULL;

-- 3. NOT NULL.
SET @admite_nulo = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo'
     AND column_name = 'ddriss_id' AND is_nullable = 'YES'
);
SET @sentencia = IF(
  @admite_nulo > 0,
  'ALTER TABLE corrida_calculo MODIFY ddriss_id TINYINT UNSIGNED NOT NULL COMMENT ''DDRISS calculada''',
  'DO 0'
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 4. El índice de la corrida vigente empieza por la DDRISS.
SET @indice_con_ddriss = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo'
     AND index_name = 'ix_corrida_vigente' AND seq_in_index = 1 AND column_name = 'ddriss_id'
);
SET @tiene_indice = (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo' AND index_name = 'ix_corrida_vigente'
);
SET @sentencia = IF(
  @indice_con_ddriss > 0,
  'DO 0',
  IF(
    @tiene_indice > 0,
    'ALTER TABLE corrida_calculo DROP INDEX ix_corrida_vigente, ADD KEY ix_corrida_vigente (ddriss_id, anio, mes_hasta, vigente)',
    'ALTER TABLE corrida_calculo ADD KEY ix_corrida_vigente (ddriss_id, anio, mes_hasta, vigente)'
  )
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 5. Llave foránea a ddriss.
SET @tiene_llave = (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo'
     AND constraint_name = 'fk_corrida_ddriss' AND constraint_type = 'FOREIGN KEY'
);
SET @sentencia = IF(
  @tiene_llave = 0,
  'ALTER TABLE corrida_calculo ADD CONSTRAINT fk_corrida_ddriss FOREIGN KEY (ddriss_id) REFERENCES ddriss (id)',
  'DO 0'
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- 6. Comentario de vigente.
SET @sentencia = IF(
  (SELECT column_comment FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'corrida_calculo' AND column_name = 'vigente')
    = 'Solo una corrida vigente por (ddriss, anio, mes_hasta)',
  'DO 0',
  'ALTER TABLE corrida_calculo MODIFY vigente BOOLEAN NOT NULL DEFAULT FALSE COMMENT ''Solo una corrida vigente por (ddriss, anio, mes_hasta)'''
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
