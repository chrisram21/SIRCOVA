-- =============================================================================
--  SIRCOVA: DEPARTAMENTOS DEL INE para MySQL (vacunacion_ddriss, modelo v0.12)
--  Fecha: 2026-11-26 (SPEC 77, HU-08)
--
--  Siembra los 22 departamentos de Guatemala con su código INE, para poder
--  registrar desde la app un municipio de cualquier departamento (un municipio
--  nuevo de San Marcos o el de un establecimiento externo). No cambia el
--  modelo: no agrega tablas, columnas ni índices.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03). Los que ya
--  existen (12 San Marcos, 09 Quetzaltenango) se quedan con su id, porque la
--  llave única uq_departamento_codigo hace que INSERT IGNORE los salte. El 99
--  «No especificado / otro» no se toca. Se puede volver a correr encima las
--  veces que haga falta.
--
--  Cómo usarlo:
--    Solo en bases creadas con un 01 anterior al SPEC 77. Desde el SPEC 77, el
--    01 ya trae los 22 departamentos; correr este script encima no hace daño.
-- =============================================================================

USE vacunacion_ddriss;

INSERT IGNORE INTO departamento (codigo_ine, nombre) VALUES
 ('01', 'Guatemala'), ('02', 'El Progreso'), ('03', 'Sacatepéquez'),
 ('04', 'Chimaltenango'), ('05', 'Escuintla'), ('06', 'Santa Rosa'),
 ('07', 'Sololá'), ('08', 'Totonicapán'), ('09', 'Quetzaltenango'),
 ('10', 'Suchitepéquez'), ('11', 'Retalhuleu'), ('12', 'San Marcos'),
 ('13', 'Huehuetenango'), ('14', 'Quiché'), ('15', 'Baja Verapaz'),
 ('16', 'Alta Verapaz'), ('17', 'Petén'), ('18', 'Izabal'),
 ('19', 'Zacapa'), ('20', 'Chiquimula'), ('21', 'Jalapa'),
 ('22', 'Jutiapa');
