-- =============================================================================
--  SIRCOVA: REDES DE MUNICIPIOS para MySQL (vacunacion_ddriss, modelo v0.12)
--  Fecha: 2026-11-11 (SPEC 59)
--
--  Agrega las tablas red, red_municipio y red_trazadora y la Red No. 1 de
--  DDRISS_SM (Ixchiguán, Tajumulco, Sibinal, Tacaná y San José Ojetenam, por
--  su código INE), con las dosis activas es_trazadora como trazadoras.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03). Las filas de la
--  Red No. 1 no pasan por la bitácora porque es una migración, no una acción
--  de un usuario. Se puede volver a correr encima: las tablas se crean solo
--  si faltan y la red solo si DDRISS_SM no tiene una RED_01.
--
--  Cómo usarlo:
--    Solo en bases creadas con un 01 anterior a la v0.12. Desde la v0.12, el
--    01 ya crea las tablas y el 03 la Red No. 1; correr este script encima no
--    hace daño. Si falta alguno de los cinco municipios, el script se detiene
--    con un error antes de crear la red.
-- =============================================================================

USE vacunacion_ddriss;

CREATE TABLE IF NOT EXISTS red (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ddriss_id       TINYINT UNSIGNED  NOT NULL,
  codigo          VARCHAR(20)       NOT NULL COMMENT 'RED_{NN}, lo genera el backend por DDRISS',
  nombre          VARCHAR(120)      NOT NULL COMMENT 'P. ej. Red No. 1',
  activo          BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_red_ddriss_codigo (ddriss_id, codigo),
  UNIQUE KEY uq_red_ddriss_nombre (ddriss_id, nombre),
  CONSTRAINT fk_red_ddriss FOREIGN KEY (ddriss_id) REFERENCES ddriss (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS red_municipio (
  red_id          SMALLINT UNSIGNED NOT NULL,
  municipio_id    SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, municipio_id),
  UNIQUE KEY uq_red_municipio (municipio_id),
  CONSTRAINT fk_redmun_red       FOREIGN KEY (red_id)       REFERENCES red (id),
  CONSTRAINT fk_redmun_municipio FOREIGN KEY (municipio_id) REFERENCES municipio (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS red_trazadora (
  red_id          SMALLINT UNSIGNED NOT NULL,
  dosis_id        SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, dosis_id),
  CONSTRAINT fk_redtraz_red   FOREIGN KEY (red_id)   REFERENCES red (id),
  CONSTRAINT fk_redtraz_dosis FOREIGN KEY (dosis_id) REFERENCES dosis (id)
) ENGINE=InnoDB;

-- Red No. 1 de DDRISS_SM.
SET @ddriss = (SELECT id FROM ddriss WHERE codigo = 'DDRISS_SM');
SET @ya_existe = (SELECT COUNT(*) FROM red WHERE ddriss_id = @ddriss AND codigo = 'RED_01');
SET @municipios = (
  SELECT COUNT(*) FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
   WHERE d.id = @ddriss AND m.activo AND m.codigo_ine IN ('1223', '1209', '1208', '1207', '1224')
);

-- Detiene el script si falta un municipio: SIGNAL no se puede preparar, así que
-- se consulta una tabla que no existe y el error lleva el mensaje en su nombre.
SET @sentencia = IF(
  @ya_existe = 0 AND @municipios <> 5,
  'SELECT * FROM `ERROR: falta alguno de los cinco municipios de la Red No. 1`',
  'DO 0'
);
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

START TRANSACTION;

INSERT INTO red (ddriss_id, codigo, nombre)
SELECT @ddriss, 'RED_01', 'Red No. 1' FROM DUAL WHERE @ya_existe = 0;

SET @red = IF(@ya_existe = 0, LAST_INSERT_ID(), NULL);

INSERT INTO red_municipio (red_id, municipio_id)
SELECT @red, m.id FROM municipio m
 WHERE @red IS NOT NULL AND m.codigo_ine IN ('1223', '1209', '1208', '1207', '1224');

INSERT INTO red_trazadora (red_id, dosis_id)
SELECT @red, d.id FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id
 WHERE @red IS NOT NULL AND d.es_trazadora AND d.activa AND v.activa;

COMMIT;
