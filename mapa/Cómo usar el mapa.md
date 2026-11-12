# Cómo usar el mapa

Esta nota sí se escribe a mano. Todo lo demás de `mapa/` lo genera `scripts/mapa-obsidian.mjs`: no lo edites, porque se reescribe.

## Abrir la bóveda

1. En Obsidian: *Open folder as vault* y elegir la carpeta raíz del repo (`SIRCOVA`).
2. Si pregunta por los plugins de la comunidad, no hacen falta: todo usa lo que trae Obsidian.
3. Abrir [[Inicio]].

## Qué hay en el mapa

| Carpeta | Una nota por… | Enlaza a |
|---|---|---|
| `mapa/specs/` | spec (`SPEC 39`) | el spec completo, su módulo, su HU, sus dependencias y quién lo usa |
| `mapa/historias/` | historia (`HU-31`) | sus criterios en `HISTORIAS_DE_USUARIO` y los specs que la implementan |
| `mapa/modulos/` | carpeta de `specs/` | sus specs |
| `mapa/origenes/` | origen que no es una HU | los specs de correcciones, retroalimentación, ajustes y hotfix |

El **origen** de cada spec sale de su encabezado: el campo `**Origen:**` si existe y, si no, el texto de `**Historia:**` (`ninguna…` = corrección; con «retroalimentación» = retroalimentación; con «hotfix» = hotfix; «ajuste del sprint» o «ya está terminada» = ajuste de una HU).

## El grafo

- Abrirlo: botón del grafo en la barra izquierda, o `Ctrl+G`.
- **Colores:** uno por módulo; las historias en gris. Los grupos se ven y se cambian en *Filters → Groups* (el engranaje arriba a la derecha del grafo).
- **Filtro:** por defecto muestra solo `path:mapa`. Para ver un módulo, escribir en el filtro `path:mapa tag:#modulo/revision`; para ver lo que no nació de una HU, `path:mapa tag:#origen/correccion OR tag:#origen/retroalimentacion OR tag:#origen/ajuste OR tag:#origen/hotfix`. Para ver todo el repo, borrar el filtro.
- **Grafo local** (lo más útil en el día a día): con una nota abierta, `Ctrl+P` → «Open local graph». Muestra solo lo conectado a esa nota; en sus ajustes, *Depth* = 2 enseña también las dependencias de las dependencias.
- Las flechas van del spec hacia aquello de lo que depende.
- **No uses ↺ «Restore default settings»** en los ajustes del grafo: borra los grupos de color. Si pasa, con Obsidian cerrado: `git checkout .obsidian/graph.json`.

### Ajustar tu grafo sin subirlo

`.obsidian/graph.json` está en git para que todos tengan los mismos colores. Para mover el grafo a tu gusto sin que tus cambios salgan en `git status` ni se suban, corre una vez en tu copia del repo:

```
git update-index --skip-worktree .obsidian/graph.json
```

No lo saques de git ni lo pongas en `.gitignore`: el `.gitignore` no afecta a un archivo que git ya sigue, y con `git rm --cached` el pull les borraría el archivo a los demás.

Si alguien sube a propósito una versión nueva y tu `git pull` falla con «would be overwritten», con Obsidian cerrado:

```
git update-index --no-skip-worktree .obsidian/graph.json
git checkout .obsidian/graph.json
git pull
git update-index --skip-worktree .obsidian/graph.json
```

## Las tablas (Bases)

- [[Specs.base]]: pestañas «Todos», «Sin historia de usuario» y «Pendientes».
- [[Historias.base]]: «Todas» y «Sin spec» (lo que falta por hacer).
- Se puede ordenar con un clic en la columna y agregar vistas propias; si cambias el archivo `.base`, el generador lo vuelve a dejar como estaba.

## Moverse

- `Ctrl+O`: abrir cualquier nota por nombre (`SPEC 39`, `HU-31`, `AGENTS`).
- `Ctrl+clic` en un enlace: lo abre en otra pestaña.
- Panel derecho → *Backlinks*: qué notas apuntan a la que tienes abierta.
- `Alt+←` / `Alt+→`: atrás y adelante.

## Actualizar el mapa

Desde la raíz del repo:

```
node scripts/mapa-obsidian.mjs            # vuelve a generar mapa/
node scripts/mapa-obsidian.mjs --revisar  # solo revisa; falla si mapa/ no está al día
```

Se corre cada vez que se crea un spec o cambia su encabezado (estado, historia, origen o dependencias). La regla está en la sección 7 de `AGENTS.md`.

Si `git status` muestra archivos de `mapa/` o `.obsidian/app.json` como modificados pero `git diff` no muestra nada, son solo finales de línea (CRLF de Windows contra LF de Obsidian). Se limpian con `git add mapa .obsidian/app.json`: no prepara ningún cambio, solo actualiza lo que git tiene guardado. El `.gitattributes` evita que vuelva a pasar.

## Notas propias

Las notas personales van en `mapa/notas/` (el generador no la toca). Si no quieres subirlas, no las agregues a git.
