# CLAUDE.md · SIRCOVA

Las reglas completas del proyecto están en `AGENTS.md` y se aplican sin excepción:

@AGENTS.md

## Específico de Claude Code

- Al iniciar una tarea, lee los archivos de la sección 2 de `AGENTS.md` que correspondan y las notas del módulo que vas a tocar (ver «Notas de contexto»); no supongas el modelo de datos ni los endpoints de memoria.
- Antes de editar `backend/db/`, permisos, `transicion_estado` o `package.json`, detente y pide confirmación aunque tengas permiso para escribir archivos.
- No ejecutes los scripts de `backend/db/` ni comandos que borren datos sin autorización explícita: recrean la base desde cero.
- No hagas commits ni push salvo que se pida. Las ramas siguen la sección 7 de `AGENTS.md` (una por spec); el formato de commits está **pendiente**.
- Cada spec corresponde a una historia de usuario de `docs/SPECS/HISTORIAS_DE_USUARIO.md`: al crearlo con `/spec`, lee esa historia, toma sus criterios de aceptación como base y escribe `**Historia:** HU-XX` en el encabezado. Los specs se escriben en español (Borrador, Aprobado, Implementado). Si la historia contradice `AGENTS.md` o los mockups, mandan estos y se señala la diferencia.
- Al crear un spec con `/spec` pon la línea `> **Origen:**` en el encabezado (sección 7 de `AGENTS.md`), y cada vez que crees un spec o cambies su encabezado (también al pasarlo a Aprobado o Implementado con `/spec-impl`) corre `node scripts/mapa-obsidian.mjs` y deja el `mapa/` actualizado en la misma rama.
- Responde en español y, al terminar, resume qué cambiaste y cómo lo verificaste (sección 8 de `AGENTS.md`).
- Comentarios en el código solo donde no se explica solo (sección 7 de `AGENTS.md`); lo que haya que recordar para después va en una nota (ver «Notas de contexto»).

## Notas de contexto

Una nota por línea, corta y con la fecha (AAAA-MM-DD): decisiones, convenciones o trampas que conviene recordar al trabajar. Cada nota va en el archivo más cercano a lo que toca:

| Archivo | Qué notas lleva |
|---|---|
| `backend/src/modulos/{modulo}/CLAUDE.md` | Las de un módulo, con su backend, su pantalla y sus pruebas: `auth` (specs de `acceso-y-seguridad`), `usuarios`, `catalogos`, `configuracion`, `produccion`, `revision`, `indicadores` e `informes` |
| `backend/CLAUDE.md` | Las de todo el backend: conexiones, bitácora, permisos, scripts de `backend/db/`, reglas generales de las pruebas |
| `frontend/CLAUDE.md` | Las de todo el frontend: componentes comunes, menú y rutas, estilo, trampas de las pruebas (y las de `plataforma`) |
| Este archivo | Solo lo que afecta a todo el repositorio |

Claude Code carga el `CLAUDE.md` de una subcarpeta solo al leer un archivo dentro de ella. Las pruebas del backend (`backend/tests/`) y las pantallas (`frontend/src/paginas/`) no están en la carpeta del módulo: **antes de trabajar en un módulo, en su backend, su pantalla o sus pruebas, lee su `backend/src/modulos/{modulo}/CLAUDE.md`**. Una nota que toca dos módulos se parte en una nota por módulo, sin repetir el texto.

- 2026-10-22: las reglas de formato de los campos están duplicadas en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con la misma tabla `CASOS` en `backend/tests/campos.test.js` y `frontend/src/validaciones/campos.test.js`: un cambio va en los cuatro archivos. Cada regla devuelve `{ valor }` limpio o `{ error }`; en el backend se aplican con `segun(regla)` (400 `ENTRADA_INVALIDA`). `PATCH /empleados/{id}` y la pantalla de edición solo validan los campos que cambian.
- 2026-10-22: si `npm test` falla con "Cannot find package '@zxcvbn-ts/core'", el `node_modules` es anterior al SPEC 09: correr `npm ci` en `backend/` o `frontend/`.
- 2026-10-29: Node.js 24 LTS, 24.22.1 o posterior (SPEC 29): lo fijan `.nvmrc` (`24`) y `engines` en los dos `package.json`; con otra versión, `npm ci` avisa `EBADENGINE` pero instala. Después de un pull que cambie la versión de Node o el lock, `npm ci` y no `npm install`. npm 11 avisa `install-scripts … not yet covered by allowScripts` para `bcrypt` y `@scarf/scarf`: no impide nada, `bcrypt` usa sus binarios ya compilados.
- 2026-10-29: el primer `npm install` con npm 11 agrega al lock el `engines` y, en el del frontend, unas 60 líneas de `@tailwindcss/oxide-wasm32-wasi` (opcional, no se instala en Windows): es normal y no se revierte.
- 2026-10-30: en Vitest, un `beforeEach(() => mock.mockResolvedValue(…))` sin llaves devuelve el mock, y Vitest llama como limpieza a la función que devuelve un `beforeEach`: la prueba falla con el error de esa llamada, que no es de la pantalla. Escribirlo con llaves.
- 2026-11-07: ajuste menor pendiente: hay líneas de más de 120 caracteres en el código y las pruebas (las del SPEC 50 en `frontend/src/paginas/mapa/` y `paginas/creditos/`, `lib/fechas.js` y `RutaConPermiso.test.jsx`, y otras anteriores en `backend/src/modulos/` y `frontend/src/`). Se dejaron así a pedido del equipo: cortarlas todas en una rama propia, sin mezclarlo con un spec y sin cambiar el comportamiento (las pruebas deben seguir pasando igual).
- 2026-11-07: los specs van por módulo en `specs/{modulo}/NN-slug.md` con numeración global (regla en la sección 7 de `AGENTS.md`). Las skills `/spec` y `/spec-impl` son globales de cada integrante (`~/.claude/skills`): las de Chris ya listan `specs/` con `ls -R`; las que sigan con `ls specs/` ven solo las carpetas, y entonces manda la regla de `AGENTS.md`.
- 2026-11-12: mapa de Obsidian: la bóveda es la raíz del repo y `mapa/` lo genera `scripts/mapa-obsidian.mjs` (Node sin dependencias) desde la primera línea y los campos `Estado`, `Historia`, `Origen` y `Depende de` del encabezado de cada spec y los `#### HU-NN.` de `HISTORIAS_DE_USUARIO.md`: un spec cuyo encabezado no siga ese formato rompe el generador o queda mal enlazado. El generador borra y reescribe `mapa/specs`, `historias`, `modulos` y `origenes` y los archivos `Inicio.md`, `Specs.base` y `Historias.base`; `--revisar` compara sin escribir. De `.obsidian/` solo se suben `app.json` (exclusiones) y `graph.json` (filtro `path:mapa` y colores por módulo).
- 2026-11-12: `.gitattributes` fija `eol=lf` en `mapa/**` y `.obsidian/*.json`, porque Obsidian y el generador escriben con LF y el `core.autocrlf=true` de Git para Windows los dejaba en CRLF: salían como modificados sin cambio real. Si después de un pull siguen saliendo con `git diff` vacío, `git add mapa .obsidian/app.json` los limpia (solo actualiza la fecha guardada, no prepara nada).
