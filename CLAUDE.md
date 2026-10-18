# CLAUDE.md · SIRCOVA

Las reglas completas del proyecto están en `AGENTS.md` y se aplican sin excepción:

@AGENTS.md

## Específico de Claude Code

- Al iniciar una tarea, lee los archivos de la sección 2 de `AGENTS.md` que correspondan; no supongas el modelo de datos ni los endpoints de memoria.
- Antes de editar `backend/db/`, permisos, `transicion_estado` o `package.json`, detente y pide confirmación aunque tengas permiso para escribir archivos.
- No ejecutes los scripts de `backend/db/` ni comandos que borren datos sin autorización explícita: recrean la base desde cero.
- No hagas commits ni push salvo que se pida. La estrategia de ramas y el formato de commits están **pendientes**.
- Responde en español y, al terminar, resume qué cambiaste y cómo lo verificaste (sección 8 de `AGENTS.md`).
- Comentarios en el código solo donde no se explica solo (sección 7 de `AGENTS.md`); lo que haya que recordar para después va en "Notas de contexto", al final de este archivo.

## Notas de contexto

Una nota por línea, corta y con la fecha (AAAA-MM-DD): decisiones, convenciones o trampas que conviene recordar al trabajar.

- 2026-10-18: MongoDB se usa siempre con `obtenerDb()` de `src/config/mongodb.js`; si la conexión automática del driver falla, el cliente queda cerrado ("Topology is closed") y no reintenta.
- 2026-10-18: el backend usa ES modules (`"type": "module"`): `import`/`export`, extensión `.js` obligatoria en las rutas relativas y `import.meta.dirname` en lugar de `__dirname`.
