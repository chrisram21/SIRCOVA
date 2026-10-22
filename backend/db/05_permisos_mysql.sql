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

-- -----------------------------------------------------------------------------
-- Asignaciones retiradas
-- -----------------------------------------------------------------------------

-- Ejemplo (no se ejecuta):
-- DELETE rp FROM rol_permiso rp
--   JOIN rol r     ON r.id = rp.rol_id
--   JOIN permiso p ON p.id = rp.permiso_id
--  WHERE r.codigo = 'REVISOR' AND p.codigo = 'POBLACION_REGISTRAR';
