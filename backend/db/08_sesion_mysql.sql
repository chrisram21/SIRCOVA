-- =============================================================================
--  SIRCOVA: SESIONES DEL PERSONAL para MySQL (vacunacion_ddriss, modelo v0.10)
--  Fecha: 2026-10-28 (SPEC 27, ajuste a HU-02)
--
--  Crea la tabla sesion: el servidor guarda cada sesión para poder cerrarla
--  (cerrar sesión, reemplazo por otro inicio de sesión, acciones del
--  administrador), con una sola sesión abierta por usuario. El JWT lleva el id
--  de la sesión (sid) y el refresh token de la cookie se guarda como SHA-256.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03). Se puede volver
--  a correr encima: CREATE TABLE IF NOT EXISTS no hace nada si ya existe.
--
--  Cómo usarlo:
--    Solo en bases creadas con un 01 anterior a la v0.10. Desde la v0.10, el
--    01 ya crea la tabla; correr este script encima no hace daño.
-- =============================================================================

USE vacunacion_ddriss;

CREATE TABLE IF NOT EXISTS sesion (
  id                     BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario_id             INT UNSIGNED     NOT NULL,
  hash_refresh           CHAR(64)         NOT NULL COMMENT 'SHA-256 del refresh token; nunca el token en claro',
  hash_refresh_anterior  CHAR(64)         NULL     COMMENT 'El anterior, aceptado 30 s después de rotar (varias pestañas)',
  rotado_en              DATETIME         NULL,
  creada_en              DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso             DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Inactividad del lado del servidor',
  expira_en              DATETIME         NOT NULL COMMENT 'Fin de la jornada: creada_en + 8 h',
  cerrada_en             DATETIME         NULL,
  motivo_cierre          ENUM('MANUAL','INACTIVIDAD','REEMPLAZADA','CONTRASENA_RESTABLECIDA',
                              'CUENTA_DESACTIVADA','DATOS_CAMBIADOS') NULL,
  ip_origen              VARCHAR(45)      NULL,
  agente_usuario         VARCHAR(255)     NULL,
  usuario_abierta        INT UNSIGNED     AS (IF(cerrada_en IS NULL, usuario_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sesion_refresh (hash_refresh),
  UNIQUE KEY uq_sesion_una_abierta (usuario_abierta) COMMENT 'Una sesión abierta por usuario',
  KEY ix_sesion_usuario (usuario_id, creada_en),
  KEY ix_sesion_refresh_anterior (hash_refresh_anterior),
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
  CONSTRAINT ck_sesion_cierre CHECK ((cerrada_en IS NULL) = (motivo_cierre IS NULL))
) ENGINE=InnoDB COMMENT='Sesiones del personal; una abierta por usuario';
