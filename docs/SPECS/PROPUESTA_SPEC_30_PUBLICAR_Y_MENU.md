# Propuesta para el spec 30 · Publicar con vista previa y menú «Administración»

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo el 2026-10-29. No es el spec: el spec se escribe en `specs/30-…md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** HU-17 (publicar esquemas) y HU-18 (vista previa) para el cambio 1; HU-11 (navegación) para el cambio 2. Las tres ya están terminadas: el spec las **modifica** y lo anota en su «Avance» de `HISTORIAS_DE_USUARIO.md`.
> **Depende de:** los SPEC 06, 20 y 21, ya en `main`.
> **Rama sugerida:** `spec-30-publicar-con-vista-previa-y-menu`, desde `main`.
> **Alcance:** solo frontend. No cambia `openapi.yaml`, ni el backend, ni `backend/db/`, ni los permisos.

## 1. Cambio 1 · La vista previa es un paso obligatorio de «Publicar»

### Hoy

- «Publicar» (en la fila del borrador de la pestaña «Esquemas» y «Guardar y publicar» en el editor) abre `DialogoPublicarEsquema`: se elige la vigencia y el motivo, y se publica.
- La vista previa (`VistaPreviaEsquema`, SPEC 21) es un botón aparte: se puede publicar sin haberla visto.

### Lo que se quiere

Publicar pasa a tener dos pasos, en este orden:

1. **Datos de la publicación:** el diálogo actual pide la vigencia (`vigenciaDesde`) y el motivo, con las mismas reglas de hoy. Su botón ya no publica: dice «Continuar» (o «Ver vista previa»).
2. **Vista previa:** se abre `VistaPreviaEsquema` con el contenido que se va a publicar y, dentro de ella, el botón **«Confirmar publicación»**. Solo ese botón llama a `POST /esquemas-captura/{id}/publicar`.

Reglas:

- No hay forma de publicar sin pasar por la vista previa.
- Desde la vista previa se puede volver al paso 1 sin perder la vigencia ni el motivo, o cancelar todo.
- Si la vista previa muestra problemas de coherencia (aviso ámbar), «Confirmar publicación» queda deshabilitado (el backend lo rechazaría con 422 de todos modos).
- Si la API responde un error al confirmar, se muestra con `AvisoError` encima de los botones y la vista previa sigue abierta con lo elegido.
- Al publicar: el mismo `toast.success` de hoy (`avisoDePublicacion`).
- Desde la fila de la pestaña, el contenido sale de `GET /esquemas-captura/{id}`; desde el editor con «Guardar y publicar», primero se guarda y luego se sigue con los dos pasos.
- El botón «Vista previa» suelto del editor y de `/configuracion/esquemas/:id` se queda: sirve para revisar sin publicar.

### Archivos que se tocan (revisado el 2026-10-29)

`DialogoPublicarEsquema.jsx`, `VistaPreviaEsquema.jsx`, `PestanaEsquemas.jsx`, `PaginaEditarEsquema.jsx` y sus pruebas, en `frontend/src/paginas/configuracion/`.

## 2. Cambio 2 · Menú en cascada «Administración»

### Hoy

- «Configuración» es una opción del menú que abre `/configuracion`, una página con pestañas (`PESTANAS` en `PaginaConfiguracion.jsx`, la activa en `?pestana=`): Territorio, Establecimientos, Vacunas, Dimensiones, Esquemas, Periodos y Población.
- «Usuarios» es una opción aparte del menú.

### Lo que se quiere

- La opción se llama **«Administración»** (no «Configuración»).
- Es un **menú padre desplegable** en el sidebar (el submenú de `Sidebar` de shadcn: `SidebarMenuSub`, con `Collapsible`). Al darle clic se despliegan sus hijos.
- Hijos: **Usuarios**, Territorio, Establecimientos, Vacunas, Dimensiones, Esquemas, Periodos y Población.
- **Se quitan las pestañas** de la página: la navegación queda solo en el sidebar y en los accesos rápidos del Inicio. Cada hijo es su propia pantalla, con su ruta.
- Cada hijo aparece solo con sus permisos (los mismos de hoy en `PESTANAS`: p. ej. Esquemas pide `ESQUEMA_CONSULTAR`, `VACUNA_CONSULTAR` y `DIMENSION_CONSULTAR`). Si el usuario no ve ningún hijo, el padre no aparece.
- Al entrar en un hijo o en una de sus subrutas (registrar, editar, historial…), el padre queda desplegado y el hijo marcado como activo.
- Los accesos rápidos del Inicio muestran los hijos (no un acceso a «Administración»), filtrados por permiso.
- El título de la pestaña del navegador y las migas (`ubicarRuta.js`) dicen «Administración › Vacunas», etc.
- Con el sidebar colapsado (solo íconos) y en móvil, el padre sigue funcionando (el spec define cómo, por ejemplo un menú flotante al pasar sobre el ícono).

### Archivos que se tocan (revisado el 2026-10-29)

`componentes/layout/opcionesMenu.js` (una opción con `hijos`), `MenuLateral.jsx`, `ubicarRuta.js`, `Layout.test.jsx`, `paginas/configuracion/PaginaConfiguracion.jsx` (se reemplaza o se elimina), las tarjetas de accesos del Inicio, y las pantallas que hoy vuelven a `/configuracion?pestana=…` (`state.volverA`, botones «Volver»).

## 3. Por decidir al escribir el spec

1. **Rutas.** Recomendación: cada hijo con su ruta bajo `/administracion` (`/administracion/vacunas`, `/administracion/vacunas/nueva`…) y Usuarios en `/administracion/usuarios`. Las rutas viejas (`/configuracion`, `/configuracion?pestana=…`, `/usuarios`) redirigen a las nuevas. La alternativa es dejar `/configuracion/...` y `/usuarios` y cambiar solo el menú.
2. **«Roles y permisos»** (`/permisos`, todavía sin pantalla): ¿va dentro de «Administración»? Recomendación: sí.
3. **Encabezado de cada pantalla:** antetítulo «Administración» y el h1 con el nombre del hijo.
4. Los parámetros de cada pestaña (año, filtros) ya no se pierden al cambiar de sección, porque cada una es una ruta: se quita la regla de `PaginaConfiguracion.jsx` que dejaba solo `pestana`.

## 4. Cómo se verifica

- Pruebas: los dos pasos de publicar (no se llama a la API hasta «Confirmar publicación»; volver conserva vigencia y motivo; confirmar deshabilitado con problemas); el menú muestra el padre y los hijos según permisos, se despliega en una subruta y oculta el padre sin hijos.
- A mano contra la API real, con un borrador de una vacuna de prueba (nunca una real; ver la nota del SPEC 20 en `CLAUDE.md`): publicar desde la fila y desde el editor pasando por la vista previa. Navegar como Administrador, Revisor y Personal de establecimiento.
- Al terminar: notas de contexto en `CLAUDE.md` (reemplazar las que hablan de las pestañas de `/configuracion` y de `?pestana=`) y el «Avance» de HU-11, HU-17 y HU-18.
