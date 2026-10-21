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

-- -----------------------------------------------------------------------------
-- Asignaciones (rol → permiso)
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo = 'ADMINISTRADOR' AND p.codigo = 'POBLACION_REGISTRAR';

-- -----------------------------------------------------------------------------
-- Asignaciones retiradas
-- -----------------------------------------------------------------------------

-- Ejemplo (no se ejecuta):
-- DELETE rp FROM rol_permiso rp
--   JOIN rol r     ON r.id = rp.rol_id
--   JOIN permiso p ON p.id = rp.permiso_id
--  WHERE r.codigo = 'REVISOR' AND p.codigo = 'POBLACION_REGISTRAR';
