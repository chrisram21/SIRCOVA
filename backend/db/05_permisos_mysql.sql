-- =============================================================================
--  SIRCOVA: CATÁLOGO DE PERMISOS para MySQL (vacunacion_ddriss, modelo v0.8)
--  Fecha: 2026-10-20 (SPEC 04, HU-06)
--
--  Es el catálogo REAL de permisos del sistema, no datos de prueba: se corre en
--  la base de prueba y en producción.
--
--  NO BORRA NI RECREA LA BASE (a diferencia del 01 y del 03): no tiene DROP ni
--  TRUNCATE y no toca la bitácora, los usuarios ni los reportes. Solo agrega los
--  permisos y las asignaciones que falten y, en "Asignaciones retiradas", quita
--  asignaciones concretas de rol_permiso. Se puede volver a correr encima las
--  veces que haga falta.
--
--  Cómo usarlo:
--    1. Ejecutar antes 01_modelo_relacional_mysql.sql (crea las tablas).
--    2. Ejecutar este script completo después de cada cambio.
--  Los cambios aplican desde el siguiente inicio de sesión de cada usuario,
--  porque los permisos viajan en el token (a más tardar en 2 h).
--
--  Convención:
--    - Un permiso por función que expone un endpoint: ENTIDAD_ACCION, en
--      mayúsculas y singular (USUARIO_CREAR, REPORTE_APROBAR,
--      MUNICIPIO_CONSULTAR). Las lecturas también llevan permiso (_CONSULTAR).
--    - modulo: uno de los ocho módulos, en mayúsculas y snake_case. El código
--      de cada módulo lo fija el primer spec que crea un permiso en él:
--        CONFIGURACION_CATALOGOS  (POBLACION_REGISTRAR, modelo v0.6)
--        USUARIOS                 (SPEC 07, HU-04)
--        PRODUCCION               (SPEC 22, HU-19)
--    - Un código no se borra ni se renombra (regla 6 de AGENTS.md).
--    - Asignaciones y retiros siempre por códigos, nunca por ids.
--
--  Para agregar una función:  una fila en "Permisos" y sus filas en
--                             "Asignaciones" (una por rol).
--  Para quitarla a un rol:    borrar su INSERT de "Asignaciones" y agregar su
--                             DELETE en "Asignaciones retiradas".
-- =============================================================================

USE vacunacion_ddriss;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('POBLACION_REGISTRAR', 'CONFIGURACION_CATALOGOS', 'Registrar y actualizar la población anual por municipio y grupo de edad');

-- SPEC 07 (HU-04): registro de personal y cuentas, y lectura mínima de catálogos
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('USUARIO_CONSULTAR',         'USUARIOS',                'Ver la pantalla de usuarios'),
 ('EMPLEADO_CREAR',            'USUARIOS',                'Registrar empleados de su DDRISS'),
 ('USUARIO_CREAR',             'USUARIOS',                'Crear la cuenta de acceso de un empleado'),
 ('ROL_CONSULTAR',             'USUARIOS',                'Consultar los roles'),
 ('DDRISS_CONSULTAR',          'CONFIGURACION_CATALOGOS', 'Consultar las DDRISS de su ámbito'),
 ('MUNICIPIO_CONSULTAR',       'CONFIGURACION_CATALOGOS', 'Consultar los municipios de su ámbito'),
 ('ESTABLECIMIENTO_CONSULTAR', 'CONFIGURACION_CATALOGOS', 'Consultar los establecimientos de su ámbito');

-- SPEC 08 (HU-05): edición, desactivación y restauración de cuentas
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('USUARIO_EDITAR',            'USUARIOS',                'Cambiar el rol de una cuenta'),
 ('USUARIO_DESACTIVAR',        'USUARIOS',                'Desactivar y restaurar cuentas'),
 ('EMPLEADO_EDITAR',           'USUARIOS',                'Editar los datos de un empleado de su DDRISS');

-- SPEC 10 (HU-62, HU-63): desbloqueo de cuentas y restablecimiento de contraseñas
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('USUARIO_DESBLOQUEAR',            'USUARIOS',           'Quitar el bloqueo por intentos fallidos de una cuenta'),
 ('USUARIO_RESTABLECER_CONTRASENA', 'USUARIOS',           'Restablecer la contraseña de una cuenta con una temporal generada');

-- SPEC 13 (HU-08): pantalla de configuración y distritos de salud
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('CONFIGURACION_CONSULTAR',   'CONFIGURACION_CATALOGOS', 'Ver la pantalla de configuración'),
 ('DISTRITO_CONSULTAR',        'CONFIGURACION_CATALOGOS', 'Consultar los distritos de salud de su ámbito'),
 ('DISTRITO_CREAR',            'CONFIGURACION_CATALOGOS', 'Registrar distritos de salud en su DDRISS'),
 ('DISTRITO_EDITAR',           'CONFIGURACION_CATALOGOS', 'Renombrar, desactivar y reactivar distritos de salud de su DDRISS');

-- SPEC 14 (HU-09): establecimientos de salud e instituciones
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('ESTABLECIMIENTO_CREAR',          'CONFIGURACION_CATALOGOS', 'Registrar establecimientos en su DDRISS'),
 ('ESTABLECIMIENTO_EDITAR',         'CONFIGURACION_CATALOGOS', 'Editar, desactivar y reactivar establecimientos de su DDRISS'),
 ('TIPO_ESTABLECIMIENTO_CONSULTAR', 'CONFIGURACION_CATALOGOS', 'Consultar los tipos de establecimiento');

-- SPEC 15 (HU-10): catálogo nacional de vacunas y dosis
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('VACUNA_CONSULTAR',          'CONFIGURACION_CATALOGOS', 'Consultar el catálogo de vacunas y dosis'),
 ('VACUNA_CREAR',              'CONFIGURACION_CATALOGOS', 'Registrar vacunas con sus dosis'),
 ('VACUNA_EDITAR',             'CONFIGURACION_CATALOGOS', 'Editar, desactivar y reactivar vacunas, y agregar, editar, desactivar y reactivar sus dosis');

-- SPEC 16 (HU-12): calendario común de periodos y su apertura por DDRISS
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('PERIODO_CONSULTAR',         'CONFIGURACION_CATALOGOS', 'Consultar los meses del calendario con su estado en su DDRISS'),
 ('PERIODO_CREAR',             'CONFIGURACION_CATALOGOS', 'Agregar al calendario común los meses de un año'),
 ('PERIODO_EDITAR',            'CONFIGURACION_CATALOGOS', 'Abrir meses en su DDRISS y cambiar su fecha límite de envío');

-- SPEC 17 (HU-13): población objetivo por municipio, año y grupo de edad
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('POBLACION_CONSULTAR',       'CONFIGURACION_CATALOGOS', 'Consultar la población anual por municipio y grupo de edad');

-- SPEC 18 (HU-15): catálogo nacional de dimensiones de desagregación (MongoDB)
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('DIMENSION_CONSULTAR',       'CONFIGURACION_CATALOGOS', 'Consultar el catálogo de dimensiones de desagregación'),
 ('DIMENSION_CREAR',           'CONFIGURACION_CATALOGOS', 'Registrar dimensiones de desagregación con sus valores'),
 ('DIMENSION_EDITAR',          'CONFIGURACION_CATALOGOS', 'Editar, desactivar y reactivar dimensiones, y agregar, editar, ordenar, desactivar y reactivar sus valores');

-- SPEC 19 (HU-16): borradores de los esquemas de captura de la DDRISS (MongoDB)
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('ESQUEMA_CONSULTAR',         'CONFIGURACION_CATALOGOS', 'Consultar los esquemas de captura de las vacunas'),
 ('ESQUEMA_CREAR',             'CONFIGURACION_CATALOGOS', 'Crear borradores de esquemas de captura para la DDRISS'),
 ('ESQUEMA_EDITAR',            'CONFIGURACION_CATALOGOS', 'Editar y descartar borradores de esquemas de captura de la DDRISS');

-- SPEC 20 (HU-17): publicación de los borradores de esquemas de la DDRISS (MongoDB)
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('ESQUEMA_PUBLICAR',          'CONFIGURACION_CATALOGOS', 'Publicar borradores de esquemas de captura de la DDRISS');

-- SPEC 22 (HU-19): reporte mensual de producción del establecimiento
INSERT IGNORE INTO permiso (codigo, modulo, descripcion) VALUES
 ('REPORTE_CREAR',             'PRODUCCION',              'Crear el reporte mensual de su establecimiento'),
 ('REPORTE_CONSULTAR',         'PRODUCCION',              'Consultar los reportes mensuales de su ámbito');

-- -----------------------------------------------------------------------------
-- Asignaciones (rol → permiso)
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR' AND p.codigo = 'POBLACION_REGISTRAR';

-- SPEC 07 (HU-04): solo el Administrador registra personal y crea cuentas
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR'
   AND p.codigo IN ('USUARIO_CONSULTAR', 'EMPLEADO_CREAR', 'USUARIO_CREAR', 'ROL_CONSULTAR',
                    'DDRISS_CONSULTAR', 'MUNICIPIO_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR');

-- SPEC 08 (HU-05): solo el Administrador edita, desactiva y restaura cuentas
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR'
   AND p.codigo IN ('USUARIO_EDITAR', 'USUARIO_DESACTIVAR', 'EMPLEADO_EDITAR');

-- SPEC 10 (HU-62, HU-63): solo el Administrador desbloquea cuentas y restablece contraseñas
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR'
   AND p.codigo IN ('USUARIO_DESBLOQUEAR', 'USUARIO_RESTABLECER_CONTRASENA');

-- SPEC 13 (HU-08): solo el Administrador ve la configuración y gestiona los distritos de salud
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR'
   AND p.codigo IN ('CONFIGURACION_CONSULTAR', 'DISTRITO_CONSULTAR', 'DISTRITO_CREAR', 'DISTRITO_EDITAR');

-- SPEC 14 (HU-09): solo el Administrador gestiona los establecimientos
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR'
   AND p.codigo IN ('ESTABLECIMIENTO_CREAR', 'ESTABLECIMIENTO_EDITAR', 'TIPO_ESTABLECIMIENTO_CONSULTAR');

-- SPEC 15 (HU-10): el Administrador y el Revisor gestionan las vacunas; el Revisor ve la configuración
-- solo con la pestaña de vacunas, porque no tiene los permisos de territorio ni de establecimientos
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo IN ('VACUNA_CONSULTAR', 'VACUNA_CREAR', 'VACUNA_EDITAR');

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'REVISOR' AND p.codigo = 'CONFIGURACION_CONSULTAR';

-- SPEC 16 (HU-12): el Administrador y el Revisor gestionan los periodos
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo IN ('PERIODO_CONSULTAR', 'PERIODO_CREAR', 'PERIODO_EDITAR');

-- SPEC 17 (HU-13): el Administrador y el Revisor consultan y registran la población
-- (POBLACION_REGISTRAR ya era del Administrador desde el modelo v0.6)
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo IN ('POBLACION_CONSULTAR', 'POBLACION_REGISTRAR');

-- SPEC 18 (HU-15): el Administrador y el Revisor gestionan las dimensiones
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo IN ('DIMENSION_CONSULTAR', 'DIMENSION_CREAR', 'DIMENSION_EDITAR');

-- SPEC 19 (HU-16): el Administrador y el Revisor gestionan los borradores de esquemas
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo IN ('ESQUEMA_CONSULTAR', 'ESQUEMA_CREAR', 'ESQUEMA_EDITAR');

-- SPEC 20 (HU-17): el Administrador y el Revisor publican los borradores de esquemas
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('ADMINISTRADOR', 'REVISOR')
   AND p.codigo = 'ESQUEMA_PUBLICAR';

-- SPEC 22 (HU-19): el Personal de establecimiento crea y consulta sus reportes y ve los meses abiertos
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ESTABLECIMIENTO'
   AND p.codigo IN ('REPORTE_CREAR', 'REPORTE_CONSULTAR', 'PERIODO_CONSULTAR');

-- -----------------------------------------------------------------------------
-- Asignaciones retiradas
-- -----------------------------------------------------------------------------

-- Ejemplo (no se ejecuta):
-- DELETE rp FROM rol_permiso rp
--   JOIN rol r     ON r.id = rp.rol_id
--   JOIN permiso p ON p.id = rp.permiso_id
--  WHERE r.codigo = 'REVISOR' AND p.codigo = 'POBLACION_REGISTRAR';
