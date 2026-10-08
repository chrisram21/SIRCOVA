-- =============================================================================
--  Plataforma web de producción de vacunación — DDRISS San Marcos (MSPAS)
--  Modelo relacional preliminar (MySQL 8.0, InnoDB, utf8mb4)
--  Versión: 0.4 (propuesta para revisión)   Fecha: 2026-10-08
--  Cambios v0.4: normalización de usuario en dos tablas, usuario (datos de
--  acceso) y empleado (datos del personal); dirección y contacto en
--  establecimiento.
--  Cambios v0.3 (alineación con la propuesta v2): "Corrección solicitada"
--  regresa a Borrador; revisor asignado al pasar a En revisión; tipos de
--  establecimiento CAIMI, centro comunitario y casa materna; establecimientos
--  externos a la jurisdicción (caso Coatepeque).
--  Cambios v0.2: dimensiones de desagregación dinámicas. Sexo y grupo de edad
--  dejan de ser columnas fijas; cada vacuna declara en MongoDB sus dimensiones
--  y los valores se guardan en la tabla genérica detalle_dimension.
--
--  Alcance de este motor (según sección 5.2 del documento de contexto):
--    usuarios, roles, establecimientos, municipios, vacunas, poblaciones
--    objetivo, periodos, producción de vacunación, resultados de indicadores,
--    alertas, bitácoras y estados de los reportes.
--
--  Restricción de diseño: el sistema maneja SOLO DATOS AGREGADOS. Ninguna
--  tabla almacena datos personales ni clínicos de pacientes; la unidad mínima
--  es una cantidad de dosis por establecimiento, periodo, vacuna, dosis,
--  municipio de procedencia y la combinación de dimensiones que defina el
--  esquema de la vacuna (sexo, grupo de edad, embarazo u otras).
--
--  Referencias a MongoDB: las columnas con sufijo *_mongo_id (CHAR(24)) guardan
--  el ObjectId de un documento de MongoDB; las columnas *_codigo + *_version
--  identifican una versión concreta de una regla o configuración. No existen
--  llaves foráneas entre motores: la integridad la garantiza el backend
--  (ver documento de diseño, sección 5).
-- =============================================================================

DROP DATABASE IF EXISTS vacunacion_ddriss;
CREATE DATABASE vacunacion_ddriss
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE vacunacion_ddriss;

-- -----------------------------------------------------------------------------
-- MÓDULO 1. GESTIÓN DE USUARIOS
-- -----------------------------------------------------------------------------

CREATE TABLE rol (
  id              TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(30)       NOT NULL,
  nombre          VARCHAR(80)       NOT NULL,
  descripcion     VARCHAR(255)      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rol_codigo (codigo)
) ENGINE=InnoDB COMMENT='Roles del sistema (sección 5.3)';

CREATE TABLE permiso (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(60)       NOT NULL COMMENT 'Ej.: PRODUCCION_REGISTRAR, REPORTE_APROBAR',
  modulo          VARCHAR(40)       NOT NULL COMMENT 'Uno de los ocho módulos',
  descripcion     VARCHAR(255)      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permiso_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE rol_permiso (
  rol_id          TINYINT UNSIGNED  NOT NULL,
  permiso_id      SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rolperm_rol     FOREIGN KEY (rol_id)     REFERENCES rol (id),
  CONSTRAINT fk_rolperm_permiso FOREIGN KEY (permiso_id) REFERENCES permiso (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- MÓDULO 2. CONFIGURACIÓN Y CATÁLOGOS (territorio)
-- -----------------------------------------------------------------------------

CREATE TABLE departamento (
  id              TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codigo_ine      CHAR(2)           NOT NULL COMMENT 'Código INE; 12 = San Marcos; 99 = no especificado',
  nombre          VARCHAR(60)       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departamento_codigo (codigo_ine)
) ENGINE=InnoDB;

CREATE TABLE municipio (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  departamento_id TINYINT UNSIGNED  NOT NULL,
  codigo_ine      CHAR(4)           NOT NULL COMMENT 'Código INE de 4 dígitos; también es la llave del GeoJSON',
  nombre          VARCHAR(80)       NOT NULL,
  es_jurisdiccion BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'TRUE para los 30 municipios de la DDRISS San Marcos',
  activo          BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_municipio_codigo (codigo_ine),
  KEY ix_municipio_depto (departamento_id),
  CONSTRAINT fk_municipio_depto FOREIGN KEY (departamento_id) REFERENCES departamento (id)
) ENGINE=InnoDB COMMENT='Incluye municipios fuera de la jurisdicción para registrar la procedencia';

CREATE TABLE distrito_salud (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  municipio_id    SMALLINT UNSIGNED NOT NULL,
  codigo          VARCHAR(20)       NOT NULL,
  nombre          VARCHAR(120)      NOT NULL,
  activo          BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_distrito_codigo (codigo),
  CONSTRAINT fk_distrito_municipio FOREIGN KEY (municipio_id) REFERENCES municipio (id)
) ENGINE=InnoDB;

CREATE TABLE tipo_establecimiento (
  id              TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(20)       NOT NULL,
  nombre          VARCHAR(80)       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tipoest_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE establecimiento (
  id                     INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  codigo                 VARCHAR(20)       NOT NULL COMMENT 'Código institucional (p. ej. el usado en SIGSA)',
  nombre                 VARCHAR(150)      NOT NULL,
  tipo_establecimiento_id TINYINT UNSIGNED NOT NULL,
  distrito_salud_id      SMALLINT UNSIGNED NULL COMMENT 'NULL solo para establecimientos externos a la DDRISS',
  municipio_id           SMALLINT UNSIGNED NOT NULL COMMENT 'Municipio de aplicación de sus dosis',
  reporta_produccion     BOOLEAN           NOT NULL DEFAULT TRUE COMMENT 'FALSE si su producción la consolida otro establecimiento',
  es_externo             BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'TRUE: establecimiento o institución fuera del departamento que atiende población de San Marcos (p. ej. Coatepeque)',
  direccion              VARCHAR(255)      NULL COMMENT 'Dirección física (aldea, cantón, zona, calle); el municipio va en municipio_id',
  telefono               VARCHAR(20)       NULL,
  correo                 VARCHAR(150)      NULL COMMENT 'Correo institucional del establecimiento',
  nombre_contacto        VARCHAR(150)      NULL COMMENT 'Persona de contacto o encargado del establecimiento',
  activo                 BOOLEAN           NOT NULL DEFAULT TRUE,
  creado_en              DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_establecimiento_codigo (codigo),
  KEY ix_establecimiento_municipio (municipio_id),
  CONSTRAINT fk_est_tipo      FOREIGN KEY (tipo_establecimiento_id) REFERENCES tipo_establecimiento (id),
  CONSTRAINT fk_est_distrito  FOREIGN KEY (distrito_salud_id)       REFERENCES distrito_salud (id),
  CONSTRAINT fk_est_municipio FOREIGN KEY (municipio_id)            REFERENCES municipio (id)
) ENGINE=InnoDB;

-- Empleado: información del personal (quién es y dónde trabaja). Se define
-- después de establecimiento porque queda asociado a uno. Un empleado puede
-- existir sin cuenta de acceso (p. ej. personal que solo figura como contacto).
CREATE TABLE empleado (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  codigo_empleado     VARCHAR(20)       NULL COMMENT 'Código o número de personal del MSPAS, si se usa',
  nombres             VARCHAR(100)      NOT NULL,
  apellidos           VARCHAR(100)      NOT NULL,
  cargo               VARCHAR(100)      NULL COMMENT 'Ej.: enfermera auxiliar, estadígrafa, epidemióloga',
  correo              VARCHAR(150)      NULL COMMENT 'Correo de contacto; se usa para notificaciones y recuperación de contraseña',
  telefono            VARCHAR(20)       NULL,
  establecimiento_id  INT UNSIGNED      NULL COMMENT 'Lugar de trabajo; obligatorio para personal de establecimiento',
  municipio_id        SMALLINT UNSIGNED NULL COMMENT 'Alcance territorial opcional (p. ej. coordinador municipal)',
  activo              BOOLEAN           NOT NULL DEFAULT TRUE,
  creado_en           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empleado_codigo (codigo_empleado),
  UNIQUE KEY uq_empleado_correo (correo),
  KEY ix_empleado_est (establecimiento_id),
  CONSTRAINT fk_empleado_est       FOREIGN KEY (establecimiento_id) REFERENCES establecimiento (id),
  CONSTRAINT fk_empleado_municipio FOREIGN KEY (municipio_id)       REFERENCES municipio (id)
) ENGINE=InnoDB COMMENT='Personal de la DDRISS y de los establecimientos; no son pacientes';

-- Usuario: solo datos de acceso al sistema (credenciales, rol y estado de la
-- cuenta). Cada usuario corresponde a exactamente un empleado (1:1).
CREATE TABLE usuario (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  empleado_id         INT UNSIGNED      NOT NULL,
  nombre_usuario      VARCHAR(50)       NOT NULL,
  hash_contrasena     VARCHAR(255)      NOT NULL COMMENT 'bcrypt/argon2; nunca la contraseña en claro',
  rol_id              TINYINT UNSIGNED  NOT NULL,
  activo              BOOLEAN           NOT NULL DEFAULT TRUE COMMENT 'Desactivación lógica de la cuenta (módulo 1)',
  intentos_fallidos   TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  bloqueado_hasta     DATETIME          NULL,
  debe_cambiar_contrasena BOOLEAN       NOT NULL DEFAULT TRUE,
  ultimo_acceso       DATETIME          NULL,
  creado_por          INT UNSIGNED      NULL,
  creado_en           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  desactivado_en      DATETIME          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_empleado (empleado_id) COMMENT 'Un empleado tiene a lo sumo una cuenta',
  UNIQUE KEY uq_usuario_usuario  (nombre_usuario),
  KEY ix_usuario_rol (rol_id),
  CONSTRAINT fk_usuario_empleado  FOREIGN KEY (empleado_id) REFERENCES empleado (id),
  CONSTRAINT fk_usuario_rol       FOREIGN KEY (rol_id)      REFERENCES rol (id),
  CONSTRAINT fk_usuario_creador   FOREIGN KEY (creado_por)  REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Cuentas de acceso del personal';

-- -----------------------------------------------------------------------------
-- MÓDULO 2. CONFIGURACIÓN Y CATÁLOGOS (vacunación)
--  Nota: la IDENTIDAD de vacunas y dosis vive en MySQL porque la producción,
--  la población objetivo y la deserción entre dosis las necesitan como llaves
--  foráneas. Las DIMENSIONES de desagregación (sexo, grupo de edad, embarazo y
--  cualquier otra futura), sus valores y qué vacuna usa cuáles se definen en
--  MongoDB (catalogo_dimensiones y esquemas_captura).
-- -----------------------------------------------------------------------------

CREATE TABLE vacuna (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(20)       NOT NULL COMMENT 'Llave estable compartida con MongoDB (p. ej. PENTA)',
  nombre          VARCHAR(120)      NOT NULL,
  descripcion     VARCHAR(255)      NULL,
  orden_informe   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activa          BOOLEAN           NOT NULL DEFAULT TRUE,
  creado_en       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vacuna_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE dosis (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vacuna_id       SMALLINT UNSIGNED NOT NULL,
  codigo          VARCHAR(20)       NOT NULL COMMENT 'Ej.: D1, D2, D3, R1, R2, UNICA',
  nombre          VARCHAR(60)       NOT NULL,
  orden           TINYINT UNSIGNED  NOT NULL COMMENT 'Secuencia en el esquema; base de la deserción entre dosis',
  activa          BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dosis_vacuna_codigo (vacuna_id, codigo),
  CONSTRAINT fk_dosis_vacuna FOREIGN KEY (vacuna_id) REFERENCES vacuna (id)
) ENGINE=InnoDB;

CREATE TABLE clasificacion_poblacion (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(30)       NOT NULL COMMENT 'Ej.: MENOR_1, UN_ANIO, EMBARAZADAS, NINAS_10',
  descripcion     VARCHAR(120)      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clasif_pob_codigo (codigo)
) ENGINE=InnoDB COMMENT='Clasificación del denominador de cobertura';

CREATE TABLE poblacion_objetivo (
  id                         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  municipio_id               SMALLINT UNSIGNED NOT NULL,
  anio                       SMALLINT UNSIGNED NOT NULL,
  vacuna_id                  SMALLINT UNSIGNED NOT NULL,
  clasificacion_poblacion_id SMALLINT UNSIGNED NOT NULL,
  cantidad                   INT UNSIGNED      NOT NULL,
  fuente                     VARCHAR(150)      NULL COMMENT 'Ej.: proyección INE / Unidad de Vacunación',
  registrado_por             INT UNSIGNED      NOT NULL,
  creado_en                  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en             DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pobobj (municipio_id, anio, vacuna_id, clasificacion_poblacion_id),
  CONSTRAINT fk_pobobj_municipio FOREIGN KEY (municipio_id)               REFERENCES municipio (id),
  CONSTRAINT fk_pobobj_vacuna    FOREIGN KEY (vacuna_id)                  REFERENCES vacuna (id),
  CONSTRAINT fk_pobobj_clasif    FOREIGN KEY (clasificacion_poblacion_id) REFERENCES clasificacion_poblacion (id),
  CONSTRAINT fk_pobobj_usuario   FOREIGN KEY (registrado_por)             REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Denominadores de cobertura por municipio, año, vacuna y clasificación';

-- -----------------------------------------------------------------------------
-- MÓDULO 3/4. PERIODOS, REPORTES Y FLUJO DE REVISIÓN
-- -----------------------------------------------------------------------------

CREATE TABLE periodo (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  anio                SMALLINT UNSIGNED NOT NULL,
  mes                 TINYINT UNSIGNED  NOT NULL,
  fecha_inicio        DATE              NOT NULL,
  fecha_fin           DATE              NOT NULL,
  fecha_limite_envio  DATE              NOT NULL COMMENT 'Base de las alertas de reportes pendientes',
  estado              ENUM('ABIERTO','EN_CIERRE','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  cerrado_por         INT UNSIGNED      NULL,
  cerrado_en          DATETIME          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_periodo (anio, mes),
  CONSTRAINT ck_periodo_mes CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT fk_periodo_cerrado_por FOREIGN KEY (cerrado_por) REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Periodo mensual de reporte';

-- Catálogo de estados del reporte (sección 5.4)
CREATE TABLE estado_reporte (
  codigo          VARCHAR(25)       NOT NULL,
  nombre          VARCHAR(40)       NOT NULL,
  permite_edicion BOOLEAN           NOT NULL COMMENT 'TRUE solo en BORRADOR y RECTIFICACION (esta última vía solicitud autorizada)',
  orden           TINYINT UNSIGNED  NOT NULL,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB;

-- Transiciones permitidas por rol: el backend consulta esta tabla antes de
-- cambiar el estado, de modo que el flujo es configurable y auditable.
CREATE TABLE transicion_estado (
  estado_origen   VARCHAR(25)       NOT NULL,
  estado_destino  VARCHAR(25)       NOT NULL,
  rol_id          TINYINT UNSIGNED  NOT NULL,
  requiere_comentario BOOLEAN       NOT NULL DEFAULT FALSE,
  PRIMARY KEY (estado_origen, estado_destino, rol_id),
  CONSTRAINT fk_trans_origen  FOREIGN KEY (estado_origen)  REFERENCES estado_reporte (codigo),
  CONSTRAINT fk_trans_destino FOREIGN KEY (estado_destino) REFERENCES estado_reporte (codigo),
  CONSTRAINT fk_trans_rol     FOREIGN KEY (rol_id)         REFERENCES rol (id)
) ENGINE=InnoDB;

-- Reporte mensual de un establecimiento (equivale a un formulario 5C digital)
CREATE TABLE reporte_produccion (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  establecimiento_id  INT UNSIGNED      NOT NULL,
  periodo_id          SMALLINT UNSIGNED NOT NULL,
  estado              VARCHAR(25)       NOT NULL DEFAULT 'BORRADOR',
  numero_rectificacion TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Se incrementa con cada rectificación aplicada',
  observaciones       VARCHAR(500)      NULL,
  creado_por          INT UNSIGNED      NOT NULL,
  creado_en           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  enviado_en          DATETIME          NULL,
  revisor_id          INT UNSIGNED      NULL COMMENT 'Revisor asignado en la transición Enviado -> En revisión',
  asignado_en         DATETIME          NULL,
  aprobado_por        INT UNSIGNED      NULL,
  aprobado_en         DATETIME          NULL,
  cerrado_en          DATETIME          NULL,
  version_fila        INT UNSIGNED      NOT NULL DEFAULT 1 COMMENT 'Control de concurrencia optimista',
  PRIMARY KEY (id),
  UNIQUE KEY uq_reporte_est_periodo (establecimiento_id, periodo_id) COMMENT 'Evita reportes duplicados',
  KEY ix_reporte_periodo_estado (periodo_id, estado),
  CONSTRAINT fk_reporte_est       FOREIGN KEY (establecimiento_id) REFERENCES establecimiento (id),
  CONSTRAINT fk_reporte_periodo   FOREIGN KEY (periodo_id)         REFERENCES periodo (id),
  CONSTRAINT fk_reporte_estado    FOREIGN KEY (estado)             REFERENCES estado_reporte (codigo),
  CONSTRAINT fk_reporte_creador   FOREIGN KEY (creado_por)         REFERENCES usuario (id),
  CONSTRAINT fk_reporte_revisor   FOREIGN KEY (revisor_id)         REFERENCES usuario (id),
  CONSTRAINT fk_reporte_aprobador FOREIGN KEY (aprobado_por)       REFERENCES usuario (id)
) ENGINE=InnoDB;

-- Sección de un reporte correspondiente a UNA vacuna, capturada con UNA versión
-- concreta del esquema de captura (vínculo con MongoDB).
CREATE TABLE reporte_vacuna (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  reporte_id          INT UNSIGNED      NOT NULL,
  vacuna_id           SMALLINT UNSIGNED NOT NULL,
  esquema_mongo_id    CHAR(24)          NOT NULL COMMENT 'ObjectId del documento en esquemas_captura',
  esquema_version     SMALLINT UNSIGNED NOT NULL COMMENT 'Copia de la versión para consultas sin ir a MongoDB',
  datos_adicionales   JSON              NULL COMMENT 'Valores de campos no dimensionales definidos por el esquema (siempre agregados)',
  total_declarado     INT UNSIGNED      NULL COMMENT 'Total de dosis declarado por el establecimiento; se contrasta con la suma del detalle',
  PRIMARY KEY (id),
  UNIQUE KEY uq_repvac (reporte_id, vacuna_id),
  KEY ix_repvac_esquema (esquema_mongo_id),
  CONSTRAINT fk_repvac_reporte FOREIGN KEY (reporte_id) REFERENCES reporte_produccion (id) ON DELETE CASCADE,
  CONSTRAINT fk_repvac_vacuna  FOREIGN KEY (vacuna_id)  REFERENCES vacuna (id)
) ENGINE=InnoDB;

-- Hecho central: cantidad de dosis aplicadas (dato agregado).
-- Columnas fijas = lo que TODA vacuna tiene y lo que los indicadores necesitan:
-- vacuna (vía reporte_vacuna), dosis, municipio de procedencia y cantidad.
-- El municipio de APLICACIÓN se obtiene del establecimiento del reporte.
-- Las demás dimensiones (variables por vacuna) van en detalle_dimension.
CREATE TABLE detalle_produccion (
  id                       BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  reporte_vacuna_id        INT UNSIGNED      NOT NULL,
  dosis_id                 SMALLINT UNSIGNED NOT NULL,
  municipio_procedencia_id SMALLINT UNSIGNED NOT NULL COMMENT 'Usar el registro 9999 si la procedencia no se conoce',
  clave_combinacion        VARCHAR(255)      NOT NULL DEFAULT '' COMMENT 'Forma canónica de las dimensiones, ordenadas por código: grupo_edad=MENOR_1|sexo=F. Vacía si la vacuna no desagrega',
  cantidad                 INT UNSIGNED      NOT NULL DEFAULT 0,
  actualizado_por          INT UNSIGNED      NOT NULL,
  actualizado_en           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_detalle (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion),
  KEY ix_detalle_procedencia (municipio_procedencia_id, dosis_id),
  CONSTRAINT fk_det_repvac      FOREIGN KEY (reporte_vacuna_id)        REFERENCES reporte_vacuna (id) ON DELETE CASCADE,
  CONSTRAINT fk_det_dosis       FOREIGN KEY (dosis_id)                 REFERENCES dosis (id),
  CONSTRAINT fk_det_procedencia FOREIGN KEY (municipio_procedencia_id) REFERENCES municipio (id),
  CONSTRAINT fk_det_usuario     FOREIGN KEY (actualizado_por)          REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Producción agregada; sin datos de pacientes';

-- Valores de las dimensiones dinámicas de cada fila de detalle (una fila por
-- dimensión). Los códigos provienen de catalogo_dimensiones en MongoDB y el
-- backend los valida contra la versión del esquema guardada en reporte_vacuna.
-- Ejemplo: detalle 15 -> (sexo, F), (grupo_edad, MENOR_1)
--          detalle 16 -> (estado_embarazo, EMBARAZADA), (grupo_edad, 15_49)
CREATE TABLE detalle_dimension (
  detalle_id               BIGINT UNSIGNED   NOT NULL,
  dimension_codigo         VARCHAR(30)       NOT NULL COMMENT 'catalogo_dimensiones.codigo',
  valor_codigo             VARCHAR(30)       NOT NULL COMMENT 'catalogo_dimensiones.valores.codigo',
  PRIMARY KEY (detalle_id, dimension_codigo),
  KEY ix_dimension_valor (dimension_codigo, valor_codigo, detalle_id),
  CONSTRAINT fk_detdim_detalle FOREIGN KEY (detalle_id) REFERENCES detalle_produccion (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Desagregación dinámica por vacuna (modelo entidad-atributo-valor acotado)';

-- Historial del flujo de revisión (cada transición de estado)
CREATE TABLE historial_estado_reporte (
  id              BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  reporte_id      INT UNSIGNED      NOT NULL,
  estado_anterior VARCHAR(25)       NULL,
  estado_nuevo    VARCHAR(25)       NOT NULL,
  usuario_id      INT UNSIGNED      NOT NULL,
  comentario      VARCHAR(1000)     NULL,
  fecha           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_hist_reporte (reporte_id, fecha),
  CONSTRAINT fk_hist_reporte  FOREIGN KEY (reporte_id)      REFERENCES reporte_produccion (id),
  CONSTRAINT fk_hist_anterior FOREIGN KEY (estado_anterior) REFERENCES estado_reporte (codigo),
  CONSTRAINT fk_hist_nuevo    FOREIGN KEY (estado_nuevo)    REFERENCES estado_reporte (codigo),
  CONSTRAINT fk_hist_usuario  FOREIGN KEY (usuario_id)      REFERENCES usuario (id)
) ENGINE=InnoDB;

-- Observaciones de la estadígrafa al solicitar correcciones
CREATE TABLE observacion_revision (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  reporte_id          INT UNSIGNED      NOT NULL,
  reporte_vacuna_id   INT UNSIGNED      NULL COMMENT 'NULL = observación general del reporte',
  detalle_id          BIGINT UNSIGNED   NULL COMMENT 'Celda puntual observada, si aplica',
  usuario_id          INT UNSIGNED      NOT NULL,
  texto               VARCHAR(1000)     NOT NULL,
  atendida            BOOLEAN           NOT NULL DEFAULT FALSE,
  atendida_en         DATETIME          NULL,
  creado_en           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_obs_reporte (reporte_id),
  CONSTRAINT fk_obs_reporte FOREIGN KEY (reporte_id)        REFERENCES reporte_produccion (id),
  CONSTRAINT fk_obs_repvac  FOREIGN KEY (reporte_vacuna_id) REFERENCES reporte_vacuna (id) ON DELETE SET NULL,
  CONSTRAINT fk_obs_detalle FOREIGN KEY (detalle_id)        REFERENCES detalle_produccion (id) ON DELETE SET NULL,
  CONSTRAINT fk_obs_usuario FOREIGN KEY (usuario_id)        REFERENCES usuario (id)
) ENGINE=InnoDB;

-- Resultado de ejecutar las reglas de validación (definidas en MongoDB)
CREATE TABLE resultado_validacion (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  reporte_id          INT UNSIGNED      NOT NULL,
  reporte_vacuna_id   INT UNSIGNED      NULL,
  detalle_id          BIGINT UNSIGNED   NULL,
  regla_codigo        VARCHAR(40)       NOT NULL COMMENT 'Código de la regla en reglas_validacion',
  regla_version       SMALLINT UNSIGNED NOT NULL,
  severidad           ENUM('ERROR','ADVERTENCIA') NOT NULL COMMENT 'ERROR bloquea el envío',
  mensaje             VARCHAR(500)      NOT NULL,
  estado              ENUM('ABIERTO','CORREGIDO','JUSTIFICADO') NOT NULL DEFAULT 'ABIERTO',
  justificacion       VARCHAR(500)      NULL COMMENT 'Solo para advertencias',
  ejecutado_en        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_val_reporte (reporte_id, severidad, estado),
  CONSTRAINT fk_val_reporte FOREIGN KEY (reporte_id)        REFERENCES reporte_produccion (id),
  CONSTRAINT fk_val_repvac  FOREIGN KEY (reporte_vacuna_id) REFERENCES reporte_vacuna (id) ON DELETE CASCADE,
  CONSTRAINT fk_val_detalle FOREIGN KEY (detalle_id)        REFERENCES detalle_produccion (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Rectificación: cambio justificado después del cierre
CREATE TABLE solicitud_rectificacion (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  reporte_id          INT UNSIGNED      NOT NULL,
  solicitado_por      INT UNSIGNED      NOT NULL,
  motivo              VARCHAR(1000)     NOT NULL,
  evidencia_ruta      VARCHAR(255)      NULL COMMENT 'Documento de respaldo (oficio, acta); nunca datos de pacientes',
  estado              ENUM('PENDIENTE','AUTORIZADA','RECHAZADA','APLICADA') NOT NULL DEFAULT 'PENDIENTE',
  resuelto_por        INT UNSIGNED      NULL,
  comentario_resolucion VARCHAR(500)    NULL,
  solicitado_en       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_en         DATETIME          NULL,
  aplicado_en         DATETIME          NULL,
  PRIMARY KEY (id),
  KEY ix_rect_reporte (reporte_id, estado),
  CONSTRAINT fk_rect_reporte   FOREIGN KEY (reporte_id)     REFERENCES reporte_produccion (id),
  CONSTRAINT fk_rect_solicita  FOREIGN KEY (solicitado_por) REFERENCES usuario (id),
  CONSTRAINT fk_rect_resuelve  FOREIGN KEY (resuelto_por)   REFERENCES usuario (id)
) ENGINE=InnoDB;

-- Evidencia del dato anterior y del nuevo en cada celda rectificada
CREATE TABLE rectificacion_detalle (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  solicitud_id        INT UNSIGNED      NOT NULL,
  detalle_id          BIGINT UNSIGNED   NULL COMMENT 'NULL si la rectificación agrega una combinación nueva',
  reporte_vacuna_id   INT UNSIGNED      NOT NULL,
  dosis_id            SMALLINT UNSIGNED NOT NULL,
  municipio_procedencia_id SMALLINT UNSIGNED NOT NULL,
  clave_combinacion   VARCHAR(255)      NOT NULL DEFAULT '' COMMENT 'Identifica la celda aunque detalle_id se haya creado en la rectificación',
  cantidad_anterior   INT UNSIGNED      NOT NULL,
  cantidad_nueva      INT UNSIGNED      NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_rectdet_solicitud FOREIGN KEY (solicitud_id)      REFERENCES solicitud_rectificacion (id),
  CONSTRAINT fk_rectdet_detalle   FOREIGN KEY (detalle_id)        REFERENCES detalle_produccion (id) ON DELETE SET NULL,
  CONSTRAINT fk_rectdet_repvac    FOREIGN KEY (reporte_vacuna_id) REFERENCES reporte_vacuna (id),
  CONSTRAINT fk_rectdet_dosis     FOREIGN KEY (dosis_id)          REFERENCES dosis (id),
  CONSTRAINT fk_rectdet_proc      FOREIGN KEY (municipio_procedencia_id) REFERENCES municipio (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- MÓDULO 5. INDICADORES (resultados; la configuración vive en MongoDB)
-- -----------------------------------------------------------------------------

CREATE TABLE corrida_calculo (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  anio                SMALLINT UNSIGNED NOT NULL,
  mes_hasta           TINYINT UNSIGNED  NOT NULL COMMENT 'Mes de corte del cálculo acumulado',
  disparada_por       INT UNSIGNED      NULL COMMENT 'NULL = proceso automático (p. ej. al cerrar periodo)',
  motivo              ENUM('CIERRE_PERIODO','RECTIFICACION','MANUAL','PROGRAMADA') NOT NULL,
  estado              ENUM('EN_PROCESO','COMPLETADA','FALLIDA') NOT NULL DEFAULT 'EN_PROCESO',
  iniciada_en         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizada_en       DATETIME          NULL,
  vigente             BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'Solo una corrida vigente por (anio, mes_hasta)',
  PRIMARY KEY (id),
  KEY ix_corrida_vigente (anio, mes_hasta, vigente),
  CONSTRAINT fk_corrida_usuario FOREIGN KEY (disparada_por) REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Cada ejecución del motor de indicadores';

CREATE TABLE resultado_indicador (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  corrida_id          INT UNSIGNED      NOT NULL,
  indicador_codigo    VARCHAR(40)       NOT NULL COMMENT 'Código en configuracion_indicadores',
  indicador_version   SMALLINT UNSIGNED NOT NULL,
  municipio_id        SMALLINT UNSIGNED NULL COMMENT 'NULL = nivel departamental',
  vacuna_id           SMALLINT UNSIGNED NOT NULL,
  dosis_id            SMALLINT UNSIGNED NULL COMMENT 'Dosis evaluada (o dosis final en deserción)',
  filtro_dimensiones  VARCHAR(255)      NOT NULL DEFAULT '' COMMENT 'Filtro aplicado, en la misma forma canónica (grupo_edad=MENOR_1)',
  anio                SMALLINT UNSIGNED NOT NULL,
  mes                 TINYINT UNSIGNED  NOT NULL COMMENT 'Mes de corte',
  es_proyeccion       BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'TRUE = estimación; se muestra diferenciada del dato real',
  numerador           DECIMAL(14,2)     NULL,
  denominador         DECIMAL(14,2)     NULL,
  valor               DECIMAL(9,4)      NULL COMMENT 'Porcentaje o tasa según el indicador',
  meta                DECIMAL(9,4)      NULL,
  brecha_dosis        INT               NULL COMMENT 'Dosis aproximadas faltantes para la meta',
  cumple_meta         BOOLEAN           NULL,
  calculado_en        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resultado (corrida_id, indicador_codigo, municipio_id, vacuna_id, dosis_id, filtro_dimensiones, anio, mes, es_proyeccion),
  KEY ix_resultado_consulta (indicador_codigo, anio, mes, vacuna_id, municipio_id),
  CONSTRAINT fk_resind_corrida   FOREIGN KEY (corrida_id)   REFERENCES corrida_calculo (id),
  CONSTRAINT fk_resind_municipio FOREIGN KEY (municipio_id) REFERENCES municipio (id),
  CONSTRAINT fk_resind_vacuna    FOREIGN KEY (vacuna_id)    REFERENCES vacuna (id),
  CONSTRAINT fk_resind_dosis     FOREIGN KEY (dosis_id)     REFERENCES dosis (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- MÓDULO 7. ALERTAS
-- -----------------------------------------------------------------------------

CREATE TABLE alerta (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  tipo                ENUM('REPORTE_PENDIENTE','CALIDAD','COBERTURA_BAJO_META','PROCESO') NOT NULL,
  severidad           ENUM('INFO','ADVERTENCIA','CRITICA') NOT NULL DEFAULT 'ADVERTENCIA',
  titulo              VARCHAR(150)      NOT NULL,
  mensaje             VARCHAR(1000)     NOT NULL,
  periodo_id          SMALLINT UNSIGNED NULL,
  municipio_id        SMALLINT UNSIGNED NULL,
  establecimiento_id  INT UNSIGNED      NULL,
  reporte_id          INT UNSIGNED      NULL,
  resultado_indicador_id BIGINT UNSIGNED NULL,
  rol_destino_id      TINYINT UNSIGNED  NULL COMMENT 'Rol que debe ver la alerta',
  estado              ENUM('ACTIVA','ATENDIDA','DESCARTADA') NOT NULL DEFAULT 'ACTIVA',
  atendida_por        INT UNSIGNED      NULL,
  atendida_en         DATETIME          NULL,
  generada_en         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_alerta_estado (estado, tipo, generada_en),
  CONSTRAINT fk_alerta_periodo   FOREIGN KEY (periodo_id)             REFERENCES periodo (id),
  CONSTRAINT fk_alerta_municipio FOREIGN KEY (municipio_id)           REFERENCES municipio (id),
  CONSTRAINT fk_alerta_est       FOREIGN KEY (establecimiento_id)     REFERENCES establecimiento (id),
  CONSTRAINT fk_alerta_reporte   FOREIGN KEY (reporte_id)             REFERENCES reporte_produccion (id),
  CONSTRAINT fk_alerta_resind    FOREIGN KEY (resultado_indicador_id) REFERENCES resultado_indicador (id),
  CONSTRAINT fk_alerta_rol       FOREIGN KEY (rol_destino_id)         REFERENCES rol (id),
  CONSTRAINT fk_alerta_usuario   FOREIGN KEY (atendida_por)           REFERENCES usuario (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- MÓDULO 8. AUDITORÍA Y TRAZABILIDAD
--  Una sola bitácora de solo inserción, clasificada por módulo y acción; cubre
--  las bitácoras de usuarios, producción, flujo de revisión, rectificaciones y
--  configuraciones (incluidos los cambios hechos en MongoDB).
-- -----------------------------------------------------------------------------

CREATE TABLE bitacora (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  fecha               DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario_id          INT UNSIGNED      NULL COMMENT 'NULL en intentos de acceso fallidos o procesos automáticos',
  nombre_usuario_intento VARCHAR(50)    NULL COMMENT 'Usuario tecleado en un inicio de sesión fallido',
  modulo              ENUM('USUARIOS','CONFIGURACION','PRODUCCION','REVISION','RECTIFICACION','INDICADORES','REPORTES','SISTEMA') NOT NULL,
  accion              VARCHAR(40)       NOT NULL COMMENT 'Ej.: LOGIN_OK, LOGIN_FALLIDO, CREAR, ACTUALIZAR, DESACTIVAR, CAMBIO_ESTADO, PUBLICAR_ESQUEMA',
  entidad             VARCHAR(60)       NOT NULL COMMENT 'Tabla MySQL o colección MongoDB afectada',
  entidad_id          VARCHAR(40)       NULL COMMENT 'Id numérico de MySQL u ObjectId de MongoDB',
  valores_anteriores  JSON              NULL,
  valores_nuevos      JSON              NULL,
  ip_origen           VARCHAR(45)       NULL,
  agente_usuario      VARCHAR(255)      NULL,
  PRIMARY KEY (id),
  KEY ix_bitacora_fecha   (fecha),
  KEY ix_bitacora_usuario (usuario_id, fecha),
  KEY ix_bitacora_entidad (entidad, entidad_id),
  KEY ix_bitacora_modulo  (modulo, accion, fecha),
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE=InnoDB COMMENT='Solo INSERT; el usuario de la aplicación no tiene UPDATE/DELETE sobre esta tabla';

-- =============================================================================
-- VISTAS DE APOYO (equivalentes digitales de los tres Excel actuales)
-- =============================================================================

-- Producción con municipio de aplicación y de procedencia resueltos
CREATE VIEW v_produccion AS
SELECT  p.anio, p.mes, p.id AS periodo_id,
        r.id AS reporte_id, r.estado,
        e.id AS establecimiento_id, e.nombre AS establecimiento,
        ma.id AS municipio_aplicacion_id, ma.nombre AS municipio_aplicacion,
        mp.id AS municipio_procedencia_id, mp.nombre AS municipio_procedencia,
        v.id AS vacuna_id, v.codigo AS vacuna_codigo,
        d.id AS dosis_id, d.codigo AS dosis_codigo, d.orden AS dosis_orden,
        dp.id AS detalle_id, dp.clave_combinacion,
        rv.esquema_version,
        dp.cantidad,
        (dp.municipio_procedencia_id = e.municipio_id) AS es_poblacion_propia
FROM detalle_produccion dp
JOIN reporte_vacuna     rv ON rv.id = dp.reporte_vacuna_id
JOIN reporte_produccion r  ON r.id  = rv.reporte_id
JOIN periodo            p  ON p.id  = r.periodo_id
JOIN establecimiento    e  ON e.id  = r.establecimiento_id
JOIN municipio          ma ON ma.id = e.municipio_id
JOIN municipio          mp ON mp.id = dp.municipio_procedencia_id
JOIN vacuna             v  ON v.id  = rv.vacuna_id
JOIN dosis              d  ON d.id  = dp.dosis_id;

-- Producción en formato largo con sus dimensiones: base de los filtros del
-- módulo 6 (p. ej. WHERE dimension_codigo = 'sexo' AND valor_codigo = 'F').
CREATE VIEW v_produccion_dimension AS
SELECT  vp.*, dd.dimension_codigo, dd.valor_codigo
FROM v_produccion vp
JOIN detalle_dimension dd ON dd.detalle_id = vp.detalle_id;

-- Excel 1 (población propia) + Excel 2 (otros municipios) + Excel 3 (total)
CREATE VIEW v_consolidado_establecimiento AS
SELECT  periodo_id, anio, mes, establecimiento_id, establecimiento,
        municipio_aplicacion_id, vacuna_id, dosis_id,
        SUM(CASE WHEN es_poblacion_propia     THEN cantidad ELSE 0 END) AS dosis_poblacion_propia,
        SUM(CASE WHEN NOT es_poblacion_propia THEN cantidad ELSE 0 END) AS dosis_otros_municipios,
        SUM(cantidad)                                                   AS dosis_total
FROM v_produccion
WHERE estado IN ('APROBADO','CERRADO','RECTIFICACION')
GROUP BY periodo_id, anio, mes, establecimiento_id, establecimiento,
         municipio_aplicacion_id, vacuna_id, dosis_id;

-- Numerador de cobertura con atribución por procedencia (solo datos cerrados)
CREATE VIEW v_produccion_atribuida AS
SELECT  anio, mes, municipio_procedencia_id AS municipio_id,
        vacuna_id, dosis_id, SUM(cantidad) AS dosis_atribuidas
FROM v_produccion
WHERE estado = 'CERRADO'
GROUP BY anio, mes, municipio_procedencia_id, vacuna_id, dosis_id;

-- =============================================================================
-- DATOS SEMILLA MÍNIMOS (catálogos que el diseño necesita para funcionar)
-- =============================================================================

INSERT INTO rol (codigo, nombre, descripcion) VALUES
 ('ESTABLECIMIENTO', 'Personal del establecimiento', 'Registra y corrige la producción mensual'),
 ('REVISOR',         'Estadígrafa / revisor DDRISS', 'Revisa, solicita correcciones, aprueba y cierra periodos'),
 ('EPIDEMIOLOGIA',   'Departamento de Epidemiología', 'Consulta indicadores, mapas, alertas, brechas, proyecciones e informes'),
 ('ADMINISTRADOR',   'Administrador',                'Gestiona usuarios, catálogos y configuraciones'),
 ('AUTORIDAD',       'Autoridades (solo consulta)',  'Accede a resultados e informes');

INSERT INTO estado_reporte (codigo, nombre, permite_edicion, orden) VALUES
 ('BORRADOR',              'Borrador',              TRUE,  1),
 ('ENVIADO',               'Enviado',               FALSE, 2),
 ('EN_REVISION',           'En revisión',           FALSE, 3),
 ('CORRECCION_SOLICITADA', 'Corrección solicitada', FALSE, 4),
 ('APROBADO',              'Aprobado',              FALSE, 5),
 ('CERRADO',               'Cerrado',               FALSE, 6),
 ('RECTIFICACION',         'Rectificación',         TRUE,  7);

-- Transiciones del diagrama de estados de la propuesta v2 (rol_id según el
-- orden de inserción de rol). "Corrección solicitada" vuelve a Borrador,
-- donde el establecimiento corrige y envía de nuevo.
INSERT INTO transicion_estado (estado_origen, estado_destino, rol_id, requiere_comentario) VALUES
 ('BORRADOR',              'ENVIADO',               1, FALSE),
 ('ENVIADO',               'EN_REVISION',           2, FALSE),
 ('EN_REVISION',           'CORRECCION_SOLICITADA', 2, TRUE),
 ('EN_REVISION',           'APROBADO',              2, FALSE),
 ('CORRECCION_SOLICITADA', 'BORRADOR',              1, FALSE),
 ('APROBADO',              'CERRADO',               2, FALSE),
 ('CERRADO',               'RECTIFICACION',         2, TRUE),
 ('RECTIFICACION',         'CERRADO',               2, TRUE);

INSERT INTO tipo_establecimiento (codigo, nombre) VALUES
 ('HOSP', 'Hospital'), ('CAP', 'Centro de Atención Permanente'),
 ('CS', 'Centro de Salud'), ('PS', 'Puesto de Salud'),
 ('CAIMI', 'Centro de Atención Integral Materno Infantil'),
 ('CC', 'Centro Comunitario'), ('CM', 'Casa Materna'),
 ('UM', 'Unidad Mínima'), ('INST', 'Otra institución');

INSERT INTO departamento (codigo_ine, nombre) VALUES
 ('12', 'San Marcos'),
 ('99', 'No especificado / otro'),
 ('09', 'Quetzaltenango');

-- 30 municipios de San Marcos (verificar códigos contra el catálogo INE y el GeoJSON)
INSERT INTO municipio (departamento_id, codigo_ine, nombre, es_jurisdiccion) VALUES
 (1,'1201','San Marcos',TRUE), (1,'1202','San Pedro Sacatepéquez',TRUE),
 (1,'1203','San Antonio Sacatepéquez',TRUE), (1,'1204','Comitancillo',TRUE),
 (1,'1205','San Miguel Ixtahuacán',TRUE), (1,'1206','Concepción Tutuapa',TRUE),
 (1,'1207','Tacaná',TRUE), (1,'1208','Sibinal',TRUE),
 (1,'1209','Tajumulco',TRUE), (1,'1210','Tejutla',TRUE),
 (1,'1211','San Rafael Pie de la Cuesta',TRUE), (1,'1212','Nuevo Progreso',TRUE),
 (1,'1213','El Tumbador',TRUE), (1,'1214','El Rodeo',TRUE),
 (1,'1215','Malacatán',TRUE), (1,'1216','Catarina',TRUE),
 (1,'1217','Ayutla',TRUE), (1,'1218','Ocós',TRUE),
 (1,'1219','San Pablo',TRUE), (1,'1220','El Quetzal',TRUE),
 (1,'1221','La Reforma',TRUE), (1,'1222','Pajapita',TRUE),
 (1,'1223','Ixchiguán',TRUE), (1,'1224','San José Ojetenam',TRUE),
 (1,'1225','San Cristóbal Cucho',TRUE), (1,'1226','Sipacapa',TRUE),
 (1,'1227','Esquipulas Palo Gordo',TRUE), (1,'1228','Río Blanco',TRUE),
 (1,'1229','San Lorenzo',TRUE), (1,'1230','La Blanca',TRUE),
 (2,'9999','Procedencia no especificada / fuera del departamento',FALSE),
 (3,'0920','Coatepeque',FALSE);  -- establecimiento externo que atiende población de San Marcos; verificar código INE

-- Ejemplos de vacunas y dosis (a confirmar contra el 5C vigente).
-- Los valores de sexo, grupo de edad, embarazo, etc. ya no se siembran aquí:
-- viven en la colección catalogo_dimensiones de MongoDB.
INSERT INTO vacuna (codigo, nombre, orden_informe) VALUES
 ('BCG',   'BCG', 1),
 ('PENTA', 'Pentavalente (DPT-HepB-Hib)', 2),
 ('SPR',   'Sarampión, Paperas y Rubéola', 3),
 ('TD',    'Toxoide tetánico y diftérico (Td)', 4);

INSERT INTO dosis (vacuna_id, codigo, nombre, orden) VALUES
 (1, 'UNICA', 'Dosis única', 1),
 (2, 'D1', 'Primera dosis', 1), (2, 'D2', 'Segunda dosis', 2), (2, 'D3', 'Tercera dosis', 3),
 (3, 'D1', 'Primera dosis', 1), (3, 'D2', 'Segunda dosis', 2),
 (4, 'D1', 'Primera dosis', 1), (4, 'D2', 'Segunda dosis', 2), (4, 'R1', 'Primer refuerzo', 3);

INSERT INTO clasificacion_poblacion (codigo, descripcion) VALUES
 ('MENOR_1', 'Población menor de 1 año'),
 ('UN_ANIO', 'Población de 1 año'),
 ('EMBARAZADAS', 'Mujeres embarazadas esperadas'),
 ('MEF', 'Mujeres en edad fértil (15 a 49 años)');
