# CLAUDE.md · SIRCOVA

Las reglas completas del proyecto están en `AGENTS.md` y se aplican sin excepción:

@AGENTS.md

## Específico de Claude Code

- Al iniciar una tarea, lee los archivos de la sección 2 de `AGENTS.md` que correspondan; no supongas el modelo de datos ni los endpoints de memoria.
- Antes de editar `backend/db/`, permisos, `transicion_estado` o `package.json`, detente y pide confirmación aunque tengas permiso para escribir archivos.
- No ejecutes los scripts de `backend/db/` ni comandos que borren datos sin autorización explícita: recrean la base desde cero.
- No hagas commits ni push salvo que se pida. Las ramas siguen la sección 7 de `AGENTS.md` (una por spec); el formato de commits está **pendiente**.
- Cada spec corresponde a una historia de usuario de `docs/SPECS/HISTORIAS_DE_USUARIO.md`: al crearlo con `/spec`, lee esa historia, toma sus criterios de aceptación como base y escribe `**Historia:** HU-XX` en el encabezado. Los specs se escriben en español (Borrador, Aprobado, Implementado). Si la historia contradice `AGENTS.md` o los mockups, mandan estos y se señala la diferencia.
- Responde en español y, al terminar, resume qué cambiaste y cómo lo verificaste (sección 8 de `AGENTS.md`).
- Comentarios en el código solo donde no se explica solo (sección 7 de `AGENTS.md`); lo que haya que recordar para después va en "Notas de contexto", al final de este archivo.

## Notas de contexto

Una nota por línea, corta y con la fecha (AAAA-MM-DD): decisiones, convenciones o trampas que conviene recordar al trabajar.

- 2026-10-18: MongoDB se usa siempre con `obtenerDb()` de `src/config/mongodb.js`; si la conexión automática del driver falla, el cliente queda cerrado ("Topology is closed") y no reintenta.
- 2026-10-19: el frontend usa shadcn con el preset `radix-nova`; `cn` sale del paquete `cn` (no de `clsx` + `tailwind-merge`): `src/lib/utils.js` solo lo reexporta y los componentes de `components/ui/` lo importan de `"cn"` directamente.
- 2026-10-20: permisos granulares (SPEC 04): cada endpoint de negocio lleva `autenticar` + `requierePermiso('ENTIDAD_ACCION')` y `x-permiso` en el contrato; los permisos se crean y asignan en `backend/db/05_permisos_mysql.sql` (idempotente, no recrea la base) y aplican desde el siguiente login. El ámbito se filtra con `filtroAlcance`/`verificarAlcance` de `modulos/auth/alcance.service.js`.
- 2026-10-20: bitácora (SPEC 05): cada escritura va en `enTransaccion` (`config/mysql.js`) con `registrarBitacora(conexion, { ...contextoAuditoria(req), modulo: MODULOS.X, accion: ACCIONES.Y, ... })`; al actualizar, los valores salen de `diferencias(antes, despues)` (si da `null`, no se escribe ni se registra) y al crear va el objeto completo. Con MongoDB: primero la bitácora, luego MongoDB y al final se confirma MySQL. Una acción nueva se agrega a `ACCIONES`.
- 2026-10-20: el 06 (`06_bitacora_inmutable_mysql.sql`) pone los triggers que impiden UPDATE/DELETE sobre `bitacora`; recrear la base con el 01 los borra, así que después del 01 hay que volver a correr el 06 (si falta, falla `bitacora-inmutable.test.js`). No hay cliente `mysql` local: los scripts se corren con `mysql2` y `multipleStatements`.
- 2026-10-20: navegación (SPEC 06): el menú y las rutas salen de `frontend/src/componentes/layout/opcionesMenu.js`, con un permiso provisional por opción. Cada spec de pantalla confirma o cambia su código ahí, lo crea en `05_permisos_mysql.sql` y pone su componente en `pagina` (sin `pagina` se ve "En construcción"). Las pruebas que montan el layout necesitan el `matchMedia` falso de `src/preparar-pruebas.js`.
- 2026-10-21: usuarios (SPEC 07): una pantalla que no va en el menú es una `subruta` de su opción en `opcionesMenu.js` (`{ titulo, ruta, permiso, pagina }`); la opción queda activa en ella. `GET /roles`, `/ddriss`, `/municipios` y `/establecimientos` ya existen en versión mínima (solo lectura, por ámbito); HU-08 y HU-09 los amplían. Las pruebas que crean datos en la base usan un prefijo propio y lo borran en `afterAll`, sin iniciar sesión con las cuentas creadas (la bitácora tiene llave foránea a `usuario`). Las pruebas que montan un Select o un Checkbox de Radix necesitan el `ResizeObserver` falso de `src/preparar-pruebas.js`.
- 2026-10-18: el backend usa ES modules (`"type": "module"`): `import`/`export`, extensión `.js` obligatoria en las rutas relativas y `import.meta.dirname` en lugar de `__dirname`.
