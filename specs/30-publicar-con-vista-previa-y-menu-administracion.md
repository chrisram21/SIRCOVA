# SPEC 30 — Publicar con vista previa y menú «Administración»

> **Estado:** Aprobado
> **Historia:** HU-17 y HU-18 (cambio 1) y HU-11 (cambio 2). Las tres ya están terminadas: este spec las modifica y lo anota en su «Avance».
> **Depende de:** SPEC 06, SPEC 07, SPEC 13 a SPEC 21
> **Fecha:** 2026-10-29
> **Objetivo:** Que publicar un esquema pase siempre por la vista previa antes de confirmar, y que los catálogos y los usuarios queden en un menú desplegable «Administración» del sidebar, con una pantalla y una ruta propias para cada uno.

## Por qué existe este spec

La base es `docs/SPECS/PROPUESTA_SPEC_30_PUBLICAR_Y_MENU.md`, con las decisiones del equipo del 2026-10-29. Junta dos cambios del frontend en un solo spec, como pidió el equipo. Son una excepción a la regla de una HU por spec de `CLAUDE.md`.

**Cambio 1.** Hoy se puede publicar un esquema sin haber visto su formulario. La vista previa (`VistaPreviaEsquema`, SPEC 21) es un botón aparte, y «Publicar» abre `DialogoPublicarEsquema`, que publica directamente.

**Cambio 2.** Hoy «Configuración» es una sola página con siete pestañas (`PESTANAS` en `PaginaConfiguracion.jsx`, la activa en `?pestana=`), y «Usuarios» es otra opción del menú. Al cambiar de pestaña se pierden los filtros de la anterior, y la URL dice «configuracion» aunque la pantalla también agrupa la administración.

En la fase de preguntas se cerraron los puntos que la propuesta dejaba abiertos:

- las rutas pasan a `/administracion/...` y las viejas redirigen;
- «Roles y permisos» es el último hijo de «Administración»;
- los hijos que son catálogos siguen pidiendo `CONFIGURACION_CONSULTAR`, además de sus propios permisos;
- las pestañas se renombran a `Pagina*.jsx`;
- el esquema y sus referencias se cargan al dar «Continuar»;
- cerrar el panel de la vista previa cancela la publicación;
- el padre empieza desplegado o plegado según la ruta.

**Diferencias con las historias:**

- HU-18 trata la vista previa como una ayuda opcional. Desde este spec es un paso obligatorio de publicar. El botón «Vista previa» suelto se conserva.
- HU-11 pide «un menú con solo las opciones de mi rol». Sigue cumpliéndose: además, un padre sin hijos visibles no aparece.
- El mockup del Inicio (`docs/mockups/descripcion_pantallas.md`, pantalla 1) pone «Configuración» como última opción del menú. Desde este spec es «Administración», un padre desplegable, por decisión del equipo (propuesta del 2026-10-29). Este spec actualiza la descripción y los HTML de los mockups para que digan lo mismo.
- La propuesta pide que, con el sidebar en solo íconos, el padre funcione con un menú flotante. El sidebar de SIRCOVA es `offcanvas` (al ocultarlo desaparece del todo) y en móvil es un `Sheet`, así que no existe el modo de solo íconos y no hace falta el menú flotante.

## Alcance

**Entra:**

- **Publicar en dos pasos** (`frontend/src/paginas/configuracion/`):
  - `DialogoPublicarEsquema.jsx`: el paso 1 (vigencia y motivo) termina en «Continuar», carga el esquema y sus referencias, y abre el paso 2;
  - `VistaPreviaEsquema.jsx`: una prop opcional `publicacion` agrega al pie «Volver a los datos», «Cancelar» y «Confirmar publicación»;
  - `PestanaEsquemas.jsx` (que pasa a `PaginaEsquemas.jsx`) y `PaginaEditarEsquema.jsx` usan el flujo nuevo;
  - las pruebas de esos cuatro archivos.
- **Menú «Administración»:**
  - `componentes/layout/opcionesMenu.js`: una opción con `hijos`, y las funciones `puedeVer` y `rutasDelMenu`;
  - `components/ui/collapsible.jsx`, agregado con la CLI de shadcn (`npx shadcn@latest add collapsible`);
  - `componentes/layout/MenuLateral.jsx`: el padre desplegable con `Collapsible` y `SidebarMenuSub`;
  - `componentes/layout/ubicarRuta.js` y `Encabezado.jsx`: las migas y el título con el padre;
  - `App.jsx` y `componentes/RutaConPermiso.jsx`: las rutas de los hijos, protegidas con varios permisos;
  - las redirecciones de las rutas viejas;
  - `paginas/inicio/AccesosRapidos.jsx`: muestra los hijos, no el padre;
  - los enlaces de `InicioAdministrador.jsx` e `InicioRevisor.jsx`.
- **Pantallas de los hijos:**
  - `git mv` de las siete `Pestana*.jsx` (y sus pruebas) a `Pagina*.jsx`, cada una con su `EncabezadoPagina`;
  - se borra `PaginaConfiguracion.jsx`;
  - las subrutas, los «Volver» y `state.volverA` de `paginas/configuracion/` y `paginas/usuarios/` usan las rutas nuevas;
  - el antetítulo «Administración» en todas esas pantallas.
- Las pruebas que montan rutas de `/configuracion` o `/usuarios` pasan a las nuevas, y se agregan las de la sección «Pruebas».
- La documentación: el «Avance» de HU-11, HU-17 y HU-18 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`, y las «Notas de contexto» de `CLAUDE.md`.
- **Los mockups:**
  - `docs/mockups/descripcion_pantallas.md`, pantalla 1 (línea del «Menú:»): «Configuración» pasa a «Administración (desplegable: Usuarios, Territorio, Establecimientos, Vacunas, Dimensiones, Esquemas, Periodos, Población, Roles y permisos)»;
  - la opción «Configuración» del menú lateral de `Auditoria.html`, `Indicadores.html`, `Main.html`, `Mapa.html`, `Registro-Td.html`, `Registro.html` y `Revision.html` (en `docs/mockups/pantallas/`) pasa a «Administración», plegada y con un chevron a la derecha. Solo cambian el texto y el chevron, no el resto del HTML;
  - **no cambian** la línea de la bitácora de la descripción («· Configuración · Esquema de captura Td…») ni la acción «Configuración» de la tabla de `Auditoria.html`, porque son el nombre del módulo de la bitácora, no el menú.

**Fuera de alcance (para otros specs):**

- El backend, `backend/openapi.yaml`, `backend/db/` y los permisos: no cambia nada. `CONFIGURACION_CONSULTAR` se sigue usando.
- La pantalla de «Roles y permisos»: sigue en «En construcción».
- Otros menús desplegables (por ejemplo, agrupar «Indicadores», «Mapa» e «Informes»).
- Guardar entre sesiones si el padre está desplegado.
- Un modo de solo íconos para el sidebar.
- Cambiar lo que muestra la vista previa o las reglas de coherencia.
- Mover las carpetas: las pantallas siguen en `paginas/configuracion/` y `paginas/usuarios/`.

## Modelo de datos

Este spec no cambia la base ni el contrato. Solo cambian estructuras del frontend.

### Opción con hijos (`opcionesMenu.js`)

```js
{
  titulo: 'Administración',
  ruta: '/administracion', // prefijo de los hijos; no tiene pantalla propia
  icono: Settings,
  hijos: [
    {
      titulo: 'Vacunas',
      descripcion: 'Las vacunas y sus dosis.',
      ruta: '/administracion/vacunas',
      permisos: ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR'], // todos
      icono: Syringe,
      pagina: PaginaVacunas,
      subrutas: [/* { titulo, ruta, permiso, pagina }, como hoy */],
    },
    // ...
  ],
}
```

- Las opciones de primer nivel conservan `permiso` (uno o `null`). Los hijos usan `permisos`, un arreglo en el que se exigen **todos**.
- Las subrutas conservan `permiso` (uno), como hoy.
- `puedeVer(opcion, tienePermiso)`: revisa `permiso` o `permisos`. Una opción con `hijos` se ve si se ve alguno de ellos.
- `rutasDelMenu()`: la lista plana de opciones, hijos y subrutas que `App.jsx` convierte en `<Route>`.
- `descripcion` del padre desaparece: el Inicio muestra los hijos.

### Hijos de «Administración», en este orden

| Hijo | Ruta | `permisos` | Ícono |
|---|---|---|---|
| Usuarios | `/administracion/usuarios` | `USUARIO_CONSULTAR` | `Users` |
| Territorio | `/administracion/territorio` | `CONFIGURACION_CONSULTAR`, `DDRISS_CONSULTAR`, `MUNICIPIO_CONSULTAR`, `DISTRITO_CONSULTAR` | `LandPlot` |
| Establecimientos | `/administracion/establecimientos` | `CONFIGURACION_CONSULTAR`, `ESTABLECIMIENTO_CONSULTAR` | `Building2` |
| Vacunas | `/administracion/vacunas` | `CONFIGURACION_CONSULTAR`, `VACUNA_CONSULTAR` | `Syringe` |
| Dimensiones | `/administracion/dimensiones` | `CONFIGURACION_CONSULTAR`, `DIMENSION_CONSULTAR` | `Layers` |
| Esquemas | `/administracion/esquemas` | `CONFIGURACION_CONSULTAR`, `ESQUEMA_CONSULTAR`, `VACUNA_CONSULTAR`, `DIMENSION_CONSULTAR` | `FileCog` |
| Periodos | `/administracion/periodos` | `CONFIGURACION_CONSULTAR`, `PERIODO_CONSULTAR` | `CalendarDays` |
| Población | `/administracion/poblacion` | `CONFIGURACION_CONSULTAR`, `POBLACION_CONSULTAR`, `PERIODO_CONSULTAR` | `UsersRound` |
| Roles y permisos | `/administracion/permisos` | `PERMISO_CONSULTAR` | `ShieldCheck` |

- Los permisos de los catálogos son los de `PESTANAS` más `CONFIGURACION_CONSULTAR`, que hoy pide la opción «Configuración». Así cada rol ve lo mismo que hoy.
- Las descripciones salen de lo que hoy dice cada pestaña. Las escribe el paso 4 y se revisan en la prueba manual.
- Los íconos son de `lucide-react`, que ya está instalado. Si alguno no existe en la versión instalada, se usa uno parecido y se anota.

### Subrutas

Las subrutas conservan su `titulo`, su `permiso` y su orden (los segmentos fijos antes que `:id`). Solo cambia el prefijo:

| Hoy | Desde este spec |
|---|---|
| `/usuarios/nuevo`, `/usuarios/:id/editar` | `/administracion/usuarios/nuevo`, `/administracion/usuarios/:id/editar` |
| `/configuracion/establecimientos/…` | `/administracion/establecimientos/…` |
| `/configuracion/vacunas/…` | `/administracion/vacunas/…` |
| `/configuracion/dimensiones/…` | `/administracion/dimensiones/…` |
| `/configuracion/esquemas/…` (nuevo, `:id/editar`, `historial/:vacunaId`, `:id`) | `/administracion/esquemas/…` |

Cada subruta va en los `subrutas` de su hijo, no en los del padre.

### `state.volverA`

- Hoy guarda la búsqueda de la pestaña con `pestana` (`?pestana=establecimientos&municipio=…`), y la subruta arma `/configuracion${volverA}`.
- Desde este spec guarda solo la búsqueda de la lista (`?municipio=…`, o `''`), y la subruta arma `${ruta del hijo}${volverA ?? ''}`.
- `PESTANA_ESQUEMAS` (`EditorEsquema.jsx`) se reemplaza por `RUTA_ESQUEMAS = '/administracion/esquemas'`.

### Estado del flujo de publicar (`DialogoPublicarEsquema.jsx`)

```js
paso: 'datos' | 'vista'   // paso 1: vigencia y motivo; paso 2: vista previa
previa: null | { esquema, vacuna, dimensiones, contenido, problemas } // lo que carga «Continuar»
cargandoPrevia, errorPrevia // la carga del paso 1 al 2
publicando, errorApi        // la confirmación del paso 2
```

`desde` y `motivo` viven en el mismo componente durante los dos pasos, así que volver al paso 1 no los pierde.

## Diseño

### Publicar en dos pasos

**Paso 1 · Datos de la publicación** (el `Dialog` de hoy):

- Pide la vigencia y el motivo con las mismas reglas, mensajes y foco de hoy.
- El botón principal dice **«Continuar»** y ya no llama a `publicarEsquema`.
- Al dar «Continuar» con datos válidos:
  - el botón dice «Cargando vista previa…» y queda deshabilitado;
  - se pide `obtenerEsquema(borrador.id)` y luego `cargarReferencias(vacunaId)` (`EditorEsquema.jsx`);
  - se calculan `contenido = contenidoDe(esquema)` y `problemas = problemasDeCoherencia(contenido, referencias)`;
  - si todo sale bien, se pasa al paso 2;
  - si algo falla, el diálogo muestra `AvisoError` con «Reintentar», encima de los botones, y conserva la vigencia y el motivo.
- «Cancelar», Esc y la X cierran todo, como hoy.

**Paso 2 · Vista previa** (`VistaPreviaEsquema`, con la prop `publicacion`):

- El `Dialog` se desmonta y se abre el `Sheet` de la vista previa con `previa`.
- Debajo del título, una línea resume lo elegido: «Vigente desde {Mes AAAA}. Motivo: {motivo}.».
- El pie (`SheetFooter`) tiene tres botones:
  - **«Volver a los datos»**: vuelve al paso 1 con la vigencia y el motivo;
  - **«Cancelar»**: cierra todo;
  - **«Confirmar publicación»**: llama a `publicarEsquema(borrador.id, { vigenciaDesde, motivoCambio })`.
- Si hay problemas de coherencia, el aviso ámbar de hoy se ve y «Confirmar publicación» queda **deshabilitado**, con el texto «Corrija los problemas del borrador antes de publicarlo.» junto al botón.
- Esc, la X y el clic fuera del panel equivalen a «Cancelar».
- Mientras se publica:
  - el botón dice «Publicando…»;
  - los tres botones quedan deshabilitados;
  - el panel no se cierra.
- **Si la API responde un error:** `AvisoError` con `mensajeDeError(err)` encima de los botones, y el panel sigue abierto con lo elegido. Desde ahí se puede confirmar de nuevo o volver al paso 1, por ejemplo si el mes ya no es válido.
- **Si publica:** se llama a `alPublicar(publicado)`, como hoy. Quien abrió el flujo muestra `toast.success(avisoDePublicacion(publicado))`.

**Sin la prop `publicacion`**, `VistaPreviaEsquema` se ve y se comporta como hoy. Es lo que usan los botones «Vista previa» del editor y de `/administracion/esquemas/:id`.

**Desde la fila** (`PaginaEsquemas.jsx`): «Publicar» abre el paso 1 con `{ vacuna, borrador, vigente }`, como hoy.

**Desde el editor** (`PaginaEditarEsquema.jsx`):

- «Guardar y publicar» guarda primero, como hoy. Si falla, el editor muestra el error y no se abre nada.
- Si el usuario cancela después de guardar, el borrador queda guardado, el editor ya no tiene cambios pendientes y la pantalla sigue abierta.
- La vista previa del paso 2 muestra lo guardado, que es lo que se publica.

### Menú lateral

- Una opción sin `hijos` se dibuja como hoy.
- La opción con `hijos` se dibuja así:
  - un `Collapsible` dentro de su `SidebarMenuItem`;
  - el `CollapsibleTrigger` es un `SidebarMenuButton` (no un enlace) con su ícono, «Administración» y un `ChevronRight` que gira 90° al desplegarse (sin girar con `prefers-reduced-motion`);
  - el `CollapsibleContent` tiene un `SidebarMenuSub` con un `SidebarMenuSubItem` y un `SidebarMenuSubButton asChild` + `NavLink` por cada hijo visible.
- Solo se dibujan los hijos que pasan `puedeVer`. Si no pasa ninguno, el padre no aparece.
- **Desplegado:**
  - al montar, está desplegado si la ruta empieza con `/administracion/`; si no, plegado;
  - cada vez que la ruta entra en `/administracion/`, se despliega;
  - el usuario lo pliega y lo despliega a mano, y eso no se guarda entre sesiones;
  - Radix pone `aria-expanded` en el disparador.
- **Activo:**
  - un hijo está activo (`isActive`) si la ruta es la suya o empieza con `${ruta}/`, así que sus subrutas también lo activan;
  - el padre no se marca activo: lo indica el hijo.
- En móvil, elegir un hijo cierra el `Sheet` (`setOpenMobile(false)`), como las demás opciones. Desplegar el padre no lo cierra.

### Migas y título

- `ubicarRuta(pathname)` devuelve `{ opcion, hijo, subruta }`, con `hijo` y `subruta` en `null` cuando no aplican.
- **Migas** (`Encabezado.jsx`):
  - en un hijo: «Administración › Vacunas»;
  - en una subruta: «Administración › Vacunas › Registrar vacuna»;
  - «Administración» es texto, sin enlace, porque no tiene pantalla;
  - el hijo enlaza a su ruta con `state.volverA`, como hoy la opción.
- **Título de la pestaña del navegador:**
  - en un hijo: «Administración › Vacunas · SIRCOVA»;
  - en una subruta: el título de la subruta, como hoy («Registrar vacuna · SIRCOVA»).

### Rutas y redirecciones

`App.jsx` crea una `<Route>` por cada elemento de `rutasDelMenu()`. Las de los hijos van en `RutaConPermiso`, que recibe `permisos` (arreglo, todos) en lugar de `permiso`. Sin alguno de ellos, redirige a `/inicio`, como hoy.

Las rutas viejas redirigen con `replace` (`componentes/layout/RedireccionRutaVieja.jsx`):

| Ruta pedida | Destino |
|---|---|
| `/configuracion?pestana=X&resto` | `/administracion/X?resto` (sin `pestana`) |
| `/configuracion`, sin `pestana` o con una desconocida | `/administracion` |
| `/configuracion/resto` | `/administracion/resto`, con la misma búsqueda |
| `/usuarios` y `/usuarios/resto` | `/administracion/usuarios` y `/administracion/usuarios/resto` |
| `/permisos` | `/administracion/permisos` |
| `/administracion` | el primer hijo visible, o `/inicio` si no hay ninguno |

El destino aplica sus propios permisos: si el usuario no los tiene, termina en `/inicio`.

### Pantallas de los hijos

- Cada `Pagina*.jsx` renombrada pone su `EncabezadoPagina` con el antetítulo «Administración» y el h1 con el nombre del hijo («Vacunas»).
- Las acciones que hoy tiene cada pestaña (por ejemplo, «Registrar vacuna») se quedan donde están, dentro de la pantalla.
- Cada pantalla conserva sus filtros en la URL con `useSearchParams`, sin `pestana`.
- Se quita la regla de `PaginaConfiguracion.jsx` que dejaba solo `pestana` al cambiar de pestaña: cada hijo es una ruta y conserva sus parámetros.
- Las pantallas de usuarios (`PaginaUsuarios`, `PaginaRegistrarPersonal`, `PaginaEditarUsuario`) y las subrutas de los catálogos usan también el antetítulo «Administración».

### Accesos rápidos del Inicio

- `AccesosRapidos.jsx` recorre las opciones de primer nivel con `permiso` y los hijos de cada opción con `hijos`, y filtra con `puedeVer`.
- No hay un acceso a «Administración».
- Los hijos van en el lugar del padre y en su orden.
- Los enlaces de las tarjetas pasan a `/administracion/esquemas` (`InicioAdministrador.jsx`) y `/administracion/periodos` (`InicioRevisor.jsx`).

### Línea gráfica

Este spec no rediseña nada: todo lo nuevo sigue la línea del rediseño del frontend (PR #32) y de las notas del 2026-10-28 de `CLAUDE.md`.

**Reglas generales:**

- Los colores, la fuente (IBM Plex Sans), las sombras (`shadow-tarjeta`, `shadow-elevada`), los radios y la curva `ease-salida` salen de `index.css`. No se escriben colores a mano ni se agregan variables, fuentes, paletas o librerías.
- Solo se usan las utilidades que ya existen (`escalonado`, `foco-luz` + `seguirPuntero`, `brillo-hover`, `animate-aparecer`…). Ninguna animación nueva. Todo movimiento respeta `prefers-reduced-motion` (`motion-reduce:`).
- Se usan los componentes comunes que ya existen:
  - `EncabezadoPagina` para el encabezado;
  - `AvisoError` (con `onReintentar` si es una carga) y `AvisoExito` para los avisos;
  - `toast.success` de `sonner` para los avisos de guardado;
  - `Skeleton` dentro de una `Card` mientras carga.
- La skill `ui-ux-pro-max` solo orienta: manda `AGENTS.md`.
- Las variantes `data-active`, `data-open`… de shadcn tienen especificidad 0 (`:where()`): para ganarle a un `hover:` se usa `aria-selected:` o `hover:not-aria-selected:`, como dice la nota del 2026-10-28.

**Menú lateral:**

- El disparador «Administración» lleva las mismas clases que las demás opciones: alto `h-9`, `text-[0.9rem]`, el ícono que crece al pasar el puntero y los colores del sidebar (`--sidebar-*`). Esas clases se sacan a una constante de `MenuLateral.jsx` que comparten las opciones y el disparador, para que no se separen.
- El `ChevronRight` va a la derecha (`ml-auto`), gira con `transition-transform duration-200 ease-salida` y no gira con `motion-reduce:transition-none`.
- Los hijos (`SidebarMenuSubButton`) llevan su ícono en `size-4` y la línea de color `ring` de la opción activa (el `before:` de hoy), adaptada a la sangría del submenú. El hijo activo va con fondo `--sidebar-accent` y `font-semibold`, como una opción activa de hoy.
- El `CollapsibleContent` se abre sin animación de altura: no hay keyframes para eso en `index.css` y no se agregan.

**Pantallas de los hijos:**

- Cada pantalla es `<section className="flex flex-col gap-6 p-6">` con su `EncabezadoPagina`, como `PaginaUsuarios` y `PaginaMisReportes`.
- El contenido de cada pestaña se muda tal cual: su `Card`, sus filtros y su tabla no cambian de aspecto. Solo desaparecen la barra de pestañas y el h1 «Catálogos del sistema».

**Accesos rápidos:** cada hijo usa la misma tarjeta de hoy (`foco-luz`, `escalonado`, el ícono en un cuadro `bg-accent` que pasa a `bg-primary` al pasar el puntero, y la flecha `ArrowUpRight`). La cuadrícula (`sm:grid-cols-2 xl:grid-cols-4`) no cambia, aunque haya más tarjetas.

**Publicar en dos pasos:**

- El paso 1 conserva el aspecto del diálogo de hoy. Solo cambia el texto del botón.
- El resumen del paso 2 va en `text-sm text-muted-foreground`, debajo de la descripción del `SheetHeader`.
- Los botones del pie del paso 2:
  - «Confirmar publicación»: variante por defecto (`primary`);
  - «Cancelar»: `outline`, como el «Cerrar» de hoy;
  - «Volver a los datos»: `ghost`, con `ArrowLeft`, a la izquierda.
- El texto de por qué «Confirmar publicación» está deshabilitado va en `text-sm text-advertencia-foreground`, el mismo color del aviso ámbar.

**Medidas:** las pantallas se ven bien desde 360 px hasta escritorio. No se copian las medidas fijas de 1440 px de los mockups.

### Archivos que aparecen o cambian

| Archivo | Cambio |
|---|---|
| `src/components/ui/collapsible.jsx` | Nuevo, generado por la CLI de shadcn |
| `src/componentes/layout/opcionesMenu.js` | Opción con `hijos`, `puedeVer`, `rutasDelMenu` |
| `src/componentes/layout/MenuLateral.jsx` | Padre desplegable |
| `src/componentes/layout/ubicarRuta.js`, `Encabezado.jsx` | Migas y título con el padre |
| `src/componentes/layout/RedireccionRutaVieja.jsx` | Nuevo |
| `src/componentes/layout/Layout.test.jsx` | Pruebas del menú, las migas y el título |
| `src/App.jsx`, `src/componentes/RutaConPermiso.jsx` | Rutas desde `rutasDelMenu`, `permisos` |
| `src/paginas/configuracion/Pestana*.jsx` y sus pruebas | `git mv` a `Pagina*.jsx`, con su encabezado |
| `src/paginas/configuracion/PaginaConfiguracion.jsx` | Se borra |
| `src/paginas/configuracion/DialogoPublicarEsquema.jsx`, `VistaPreviaEsquema.jsx`, `PaginaEditarEsquema.jsx` y sus pruebas | Publicar en dos pasos |
| `src/paginas/configuracion/` (subrutas, `EditorEsquema.jsx`, formularios) y `src/paginas/usuarios/` | Rutas nuevas, `volverA`, antetítulo |
| `src/paginas/inicio/AccesosRapidos.jsx`, `roles/InicioAdministrador.jsx`, `roles/InicioRevisor.jsx` y `PaginaInicio.test.jsx` | Hijos en los accesos y enlaces nuevos |
| `CLAUDE.md`, `docs/SPECS/HISTORIAS_DE_USUARIO.md` | Notas y «Avance» |
| `docs/mockups/descripcion_pantallas.md` y 7 HTML de `docs/mockups/pantallas/` | «Configuración» → «Administración» en el menú |

## Plan de implementación

En cada paso se corren solo las pruebas que toca; las dos suites completas, al final.

1. **Vista previa con publicación.** `VistaPreviaEsquema` recibe la prop opcional `publicacion = { vigencia, motivo, publicando, errorApi, alVolver, alConfirmar }` y dibuja el resumen, el `AvisoError` y el pie con los tres botones. Confirmar queda deshabilitado si hay problemas. Sin la prop, no cambia nada. Pruebas en `VistaPreviaEsquema.test.jsx`.
2. **Diálogo en dos pasos.** `DialogoPublicarEsquema` con `paso`, «Continuar», la carga de `previa` con su error y su «Reintentar», y la publicación desde el paso 2. Pruebas en `DialogoPublicarEsquema.test.jsx`. `PestanaEsquemas` y `PaginaEditarEsquema` ya lo usan sin cambiar sus props; se ajustan sus pruebas para pasar por los dos pasos.
3. **Collapsible.** `npx shadcn@latest add collapsible` desde `frontend/`. Se comprueba con `git diff` que `package.json` y el lock no cambiaron. Si cambiaron, se detiene y se pregunta.
4. **Opciones con hijos y pantallas.**
   - `git mv` de las siete `Pestana*` a `Pagina*`, con su encabezado.
   - Las subrutas de configuración y de usuarios se mueven a los `subrutas` de su hijo con el prefijo `/administracion`.
   - `opcionesMenu.js` con «Administración», sus nueve hijos, `puedeVer` y `rutasDelMenu`.
   - `App.jsx` y `RutaConPermiso` con `permisos`.
   - `MenuLateral.jsx` con el padre desplegable.
   - Se borra `PaginaConfiguracion.jsx`.
   - Pruebas del menú en `Layout.test.jsx`, y se ajustan las pruebas de las pantallas renombradas.
5. **Enlaces internos.** `RUTA_ESQUEMAS`, `state.volverA` sin `pestana`, los «Volver» y los enlaces de las subrutas de `paginas/configuracion/` y `paginas/usuarios/`. Las pruebas que montan rutas viejas pasan a las nuevas.
6. **Migas y título.** `ubicarRuta` con `hijo`, `migasDe` en `Encabezado.jsx` y `tituloDeRuta`. Pruebas en `Layout.test.jsx`.
7. **Redirecciones.** `RedireccionRutaVieja.jsx` y sus rutas en `App.jsx`, antes de la ruta comodín. Pruebas de la tabla de redirecciones.
8. **Inicio.** `AccesosRapidos.jsx` con los hijos, y los enlaces de `InicioAdministrador.jsx` e `InicioRevisor.jsx`. Pruebas en `PaginaInicio.test.jsx`.
9. **Documentación.**
   - «Avance» de HU-11, HU-17 y HU-18 en `HISTORIAS_DE_USUARIO.md`.
   - En `CLAUDE.md`, se reemplazan las notas que hablan de `/configuracion`, de las pestañas, de `?pestana=` y de `PESTANAS` (SPEC 13, 16, 17, 19, 20, 21 y la del SPEC 07 sobre subrutas). Se agrega una nota del menú con `hijos` y del flujo de publicar.
   - Los mockups: la línea del menú de `descripcion_pantallas.md` y la opción del menú lateral de los 7 HTML. Se comprueba abriendo uno en el navegador y con `grep -n "Configuración"`: solo deben quedar las dos menciones de la bitácora.

## Pruebas

- **`VistaPreviaEsquema.test.jsx`:**
  - sin `publicacion`, no hay pie de publicación;
  - con `publicacion`, se ven el resumen y los tres botones;
  - con problemas, «Confirmar publicación» está deshabilitado y se ve el texto de por qué;
  - con `errorApi`, se ve el `AvisoError`.
- **`DialogoPublicarEsquema.test.jsx`:**
  - «Continuar» con los datos vacíos muestra los errores y no pide nada;
  - «Continuar» con datos válidos pide `obtenerEsquema` y las referencias, abre la vista previa y **no** llama a `publicarEsquema`;
  - si la carga falla, el diálogo muestra el error con «Reintentar» y conserva la vigencia y el motivo;
  - «Volver a los datos» vuelve al paso 1 con la vigencia y el motivo elegidos;
  - «Cancelar» y Esc en el paso 2 cierran todo sin publicar (`alCerrar`);
  - con un borrador con problemas, «Confirmar publicación» está deshabilitado;
  - «Confirmar publicación» llama a `publicarEsquema` con `{ vigenciaDesde, motivoCambio }` y luego a `alPublicar`;
  - si la API responde un error, se ve el mensaje y la vista previa sigue abierta.
- **`PaginaEsquemas.test.jsx` y `PaginaEditarEsquema.test.jsx`:** publicar desde la fila y con «Guardar y publicar» pasa por los dos pasos y termina con el `toast.success` de hoy. En el editor, cancelar después de guardar deja el borrador guardado y la pantalla abierta.
- **`Layout.test.jsx`:**
  - el Administrador ve «Administración» con sus hijos;
  - con solo `VACUNA_CONSULTAR` y sin `CONFIGURACION_CONSULTAR`, no aparece «Vacunas»;
  - un usuario sin hijos visibles no ve «Administración»;
  - el Revisor (sin los permisos de territorio ni de usuarios) ve solo sus hijos;
  - en `/inicio` el padre está plegado (`aria-expanded="false"`), y un clic lo despliega;
  - en `/administracion/vacunas/nueva` el padre está desplegado y «Vacunas» está activo;
  - las migas y el título de un hijo y de una subruta.
- **Redirecciones:** cada fila de la tabla, incluida `/administracion` sin hijos visibles (va a `/inicio`).
- **`PaginaInicio.test.jsx`:** los accesos muestran los hijos según los permisos y no muestran «Administración».

## Criterios de aceptación

- [x] Desde la fila y desde el editor, ninguna acción llama a `POST /esquemas-captura/{id}/publicar` antes de «Confirmar publicación» en la vista previa.
- [x] «Volver a los datos» conserva la vigencia y el motivo.
- [x] Con problemas de coherencia, «Confirmar publicación» está deshabilitado.
- [x] Un error de la API al confirmar se muestra encima de los botones y la vista previa sigue abierta.
- [x] Al publicar se ve el mismo aviso de hoy («Versión N de … publicada; vigente desde …»).
- [x] Los botones «Vista previa» del editor y de la versión de un esquema siguen funcionando sin publicar.
- [x] El sidebar muestra «Administración» como padre desplegable con los hijos que permite el rol, y no la muestra si no hay ninguno.
- [x] En un hijo o en su subruta, el padre está desplegado y el hijo, activo.
- [x] La página `/configuracion` con pestañas ya no existe: cada hijo tiene su ruta bajo `/administracion`.
- [x] Las rutas viejas (`/configuracion?pestana=…`, `/configuracion/…`, `/usuarios/…`, `/permisos`) llevan a las nuevas.
- [x] Las migas y el título de un hijo dicen «Administración › {hijo}».
- [x] Los accesos rápidos del Inicio muestran los hijos según los permisos y no muestran «Administración».
- [x] Al volver de una subruta, la lista conserva sus filtros.
- [x] Los archivos que cambia este spec no tienen colores escritos a mano (`#…`, `rgb(…)`), y `index.css` no cambió.
- [x] A mano, con Playwright: el padre, los hijos, una pantalla de catálogo, los accesos del Inicio y los dos pasos de publicar se ven con la misma línea que el resto de la app, en escritorio y a 360 px. Con movimiento reducido, nada se anima.
- [x] `backend/`, `openapi.yaml`, `backend/db/` y los `package.json` no cambiaron.
- [x] Las dos suites pasan (`npm test` en `backend/` y en `frontend/`) y `vite build` termina sin errores.
- [x] **A mano, contra la API real:**
  - con una vacuna de prueba manual registrada para esto (nunca una real), se publica un borrador desde la fila y otro desde el editor, los dos pasando por la vista previa;
  - se prueba «Volver a los datos» y «Cancelar»;
  - al terminar, la vacuna de prueba se desactiva;
  - se navega como Administrador, Revisor y Personal del establecimiento, y cada uno ve solo sus hijos, o no ve el padre.
- [x] El «Avance» de HU-11, HU-17 y HU-18 y las «Notas de contexto» de `CLAUDE.md` están actualizados.
- [x] `descripcion_pantallas.md` y los 7 HTML de `docs/mockups/pantallas/` dicen «Administración» en el menú. En `docs/mockups/`, «Configuración» solo queda en las dos menciones de la bitácora.

## Decisiones

- **Sí:** los dos cambios en un solo spec (decisión del equipo). **No:** dos specs, porque los dos tocan `paginas/configuracion/` y chocarían en la misma rama.
- **Sí:** rutas `/administracion/...` con redirección desde las viejas (decidido en la fase de preguntas). **No:** dejar `/configuracion` y `/usuarios`, porque la URL no coincidiría con el menú.
- **Sí:** «Roles y permisos» como último hijo (decidido en la fase de preguntas). **No:** dejarlo suelto en el menú.
- **Sí:** los catálogos piden `CONFIGURACION_CONSULTAR` más sus permisos (decidido en la fase de preguntas). **No:** solo sus permisos, porque podría mostrar catálogos a roles que hoy no los ven (por ejemplo, un rol con `VACUNA_CONSULTAR` para capturar). Así no cambia ningún permiso.
- **Sí:** renombrar `Pestana*.jsx` a `Pagina*.jsx` con `git mv` (decidido en la fase de preguntas). **No:** envolverlas con un componente genérico, porque el nombre ya no diría lo que es.
- **Sí:** cargar el esquema y sus referencias al dar «Continuar» (decidido en la fase de preguntas). **No:** al abrir el diálogo, que pide datos aunque el usuario cancele.
- **Sí:** la vista previa del paso 2 siempre se arma con lo que devuelve `GET /esquemas-captura/{id}`, también desde el editor (decidido al escribir el spec). **No:** pasarle el contenido del editor, porque muestra exactamente lo que se va a publicar y hay un solo camino.
- **Sí:** Esc, la X y el clic fuera del panel cancelan todo (decidido en la fase de preguntas). **No:** que vuelvan al paso 1, porque es un paso más para salir.
- **Sí:** el padre empieza desplegado o plegado según la ruta, sin guardarlo (decidido en la fase de preguntas). **No:** siempre desplegado, porque ocupa el menú de quien no está administrando.
- **Sí:** el padre es un disparador y no un enlace (propuesta). **No:** una pantalla `/administracion` con tarjetas, porque repite los accesos del Inicio.
- **Sí:** `Collapsible` de shadcn, agregado con su CLI (propuesta). Usa `radix-ui`, que ya está instalado. **No:** un desplegable propio.
- **No:** el menú flotante con el sidebar en solo íconos que pedía la propuesta, porque el sidebar es `offcanvas` y ese modo no existe.
- **Sí:** mantener la línea gráfica del rediseño (PR #32) sin tocar `index.css` (pedido del equipo al revisar el spec). **No:** animar la altura del submenú, que exigiría keyframes nuevos. **No:** restilizar el contenido de las pestañas al mudarlo a pantallas.
- **Sí:** actualizar la descripción y los HTML de los mockups (decidido al revisar el spec), porque `AGENTS.md` dice que los mockups mandan y no deben contradecir la app. **No:** dibujar el submenú desplegado en los HTML: basta con el nombre y el chevron. **No:** cambiar el módulo «Configuración» de la bitácora, que es otra cosa.
- **Sí:** las subrutas siguen con un solo `permiso` (decidido al escribir el spec). **No:** sumarles `CONFIGURACION_CONSULTAR`, que cambiaría quién entra a ellas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Publicar no se deshace, y la prueba manual publica de verdad | Solo con una vacuna de prueba registrada para esto, que se desactiva al terminar (nota del SPEC 20 en `CLAUDE.md`). |
| La CLI de shadcn cambia `package.json` o el lock al agregar `collapsible` | El paso 3 lo revisa con `git diff`; si cambió, se detiene y se pregunta (`CLAUDE.md`). |
| Un enlace a `/configuracion` o `/usuarios` queda sin cambiar | Las redirecciones lo llevan a la ruta nueva, y al terminar se busca `/configuracion` y `pestana` en `frontend/src` (solo deben quedar las redirecciones y sus pruebas). |
| El `git mv` de las pruebas rompe los `vi.mock` o las importaciones relativas | Las pruebas de cada pantalla se corren en el paso 4, apenas se renombran. |
| La suite completa falla por tiempo en las pantallas con `lazy` | Ya conocido (nota del 2026-10-29): se repite con `--maxWorkers=2` o la prueba sola. |

## Lo que **no** entra en este spec

- Cambios en el backend, el contrato, la base o los permisos.
- La pantalla de «Roles y permisos».
- Otros menús desplegables.
- Guardar el estado desplegado entre sesiones, o un modo de solo íconos del sidebar.
- Cambiar lo que muestra la vista previa o las reglas de coherencia.
- Mover las carpetas de `paginas/`.

Cada uno de esos, si llega, va en su propio spec.
