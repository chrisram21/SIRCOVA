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
- 2026-10-18: el backend usa ES modules (`"type": "module"`): `import`/`export`, extensión `.js` obligatoria en las rutas relativas y `import.meta.dirname` en lugar de `__dirname`.
