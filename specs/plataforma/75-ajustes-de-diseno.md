# SPEC 75 — Ajustes de diseño: marcas de dimensiones, tabla de Usuarios, filtros sin aplicar y formularios centrados

> **Estado:** Implementado
> **Historia:** ninguna (revisión del proyecto con el equipo, 2026-11-24 y 25)
> **Origen:** correccion
> **Depende de:** SPEC 12, SPEC 18, SPEC 62 y SPEC 70
> **Fecha:** 2026-11-25
> **Objetivo:** Corregir cuatro detalles de la interfaz: un Tooltip que explica cada marca de estado de las dimensiones, el fondo blanco de la tabla de Usuarios, un botón «Generar» (Informes) y «Aplicar» (Auditoría) que se pone ámbar con el texto «Filtros sin aplicar» cuando hay filtros cambiados sin aplicar, y los formularios centrados con un componente común.

## Por qué existe este spec

Al revisar el proyecto (2026-11-24 y 25), el equipo anotó cuatro detalles de la interfaz. Son solo del frontend y no dependen uno de otro, así que van juntos:

1. **Marcas de las dimensiones.** Al editar `grupo_edad`, el valor «10 a 14 años» muestra «Activo», «En uso» y «Sin población» a la vez, y parece una contradicción. No es un error: son tres datos distintos (se puede usar, lo usa el esquema vigente de Td, y no tiene población objetivo en `clasificacion_poblacion`), pero nada lo explica.
2. **Tabla de Usuarios.** El contenedor de la tabla ([PaginaUsuarios.jsx:261](../../frontend/src/paginas/usuarios/PaginaUsuarios.jsx#L261)) tiene borde pero no fondo, y no está dentro de una Card. Se ve el fondo de la página y el texto parece flotar. Es la única tabla de la app así: las demás tablas sueltas llevan `bg-card`, como Alertas o Auditoría.
3. **Filtros sin aplicar.** En Informes, cambiar un filtro no hace nada hasta pulsar «Generar». Si alguien cambia los filtros y exporta sin generar, el Excel y el PDF salen con el informe **anterior**, porque se arman con la URL. Auditoría tiene el mismo esquema con «Aplicar». El botón debe avisar que hay cambios sin aplicar.
4. **Formularios a la izquierda.** 14 pantallas de registrar, editar y ver tienen un ancho máximo sin `mx-auto` y quedan pegadas a la izquierda, con mucho espacio a la derecha. Mi perfil y Créditos ya están centradas. Se centran con un componente común. El grupo todavía no confirmó que quiere el centrado: si al final no le gusta, se quita `mx-auto` del componente y todas vuelven a la izquierda en un solo cambio.

**Lo que se decidió en la fase de preguntas (2026-11-25):**

- Antes del primer informe, «Generar» está azul. Pasa a ámbar solo cuando los filtros son distintos de los aplicados, también antes de generar por primera vez.
- Junto al botón ámbar va el texto «Filtros sin aplicar», para no depender solo del color.
- «Aplicar» de Auditoría se comporta igual, con un componente común `BotonAplicarFiltros`.
- Los Tooltip de las marcas van al editar una dimensión (valores) y en la lista de dimensiones, con los textos de la tabla de abajo.
- Créditos y Mi perfil no usan `ContenedorFormulario`: ya están centradas y se quedan como están.

## Alcance

**Entra:**

- `componentes/ContenedorFormulario.jsx` (nuevo) y su uso en las 16 `<section>` de los 14 archivos de la tabla de abajo.
- `componentes/BotonAplicarFiltros.jsx` (nuevo), y su uso en `BarraFiltrosInformes.jsx` (con el dato de `PaginaInformes.jsx`) y en `BarraFiltrosAuditoria.jsx`.
- `paginas/configuracion/MarcaDimension.jsx` (nuevo): la marca con su Tooltip y los textos, y su uso en `PaginaEditarDimension.jsx` y `PaginaDimensiones.jsx`.
- `bg-card` en el contenedor de la tabla de `PaginaUsuarios.jsx`.
- Pruebas de los componentes nuevos y de las pantallas que cambian de comportamiento.
- Una nota en `frontend/CLAUDE.md`.

**No entra (para otros specs):**

- Centrar otras pantallas (listas, tablas, Registro, Revisión, Indicadores…), que usan todo el ancho, o cambiar Créditos y Mi perfil.
- El texto «Activa · En uso» del recuadro «Datos de la dimensión», al editar una dimensión.
- Avisar de los filtros sin aplicar en otras pantallas, o bloquear la exportación de Informes mientras haya filtros sin aplicar.
- Cambios en el backend, en el contrato, en los permisos o en los colores del tema.

## Modelo de datos

Este spec **no cambia el modelo, ni los permisos, ni los estados**, y no toca el backend. Los colores salen de las variables que ya tiene `index.css`.

### `ContenedorFormulario` (`frontend/src/componentes/`)

```jsx
// El contenedor de una pantalla de formulario: centrado, con su ancho máximo (SPEC 75).
const ANCHOS = { xl: 'max-w-xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl', '6xl': 'max-w-6xl' }

export default function ContenedorFormulario({ ancho, className, children, ...resto }) {
  return (
    <section className={cn('mx-auto flex w-full flex-col gap-6 p-6', ANCHOS[ancho], className)} {...resto}>
      {children}
    </section>
  )
}
```

- Las clases van completas en `ANCHOS`, no armadas con texto, porque Tailwind solo genera las clases que encuentra escritas.
- `...resto` pasa los atributos que ya tenga la `<section>` (`aria-label`, `aria-busy`…).
- Para volver a la izquierda basta quitar `mx-auto` de este archivo.

| Archivo | `<section>` | `ancho` |
|---|---|---|
| `paginas/configuracion/FormularioEstablecimiento.jsx` | 1 | `3xl` |
| `paginas/configuracion/FormularioRed.jsx` | 1 | `4xl` |
| `paginas/configuracion/FormularioVacuna.jsx` | 1 | `3xl` |
| `paginas/configuracion/PaginaCompararEsquemas.jsx` | 1 | `6xl` |
| `paginas/configuracion/PaginaEditarDimension.jsx` | 1 | `5xl` |
| `paginas/configuracion/PaginaEditarEsquema.jsx` | 1 | `5xl` |
| `paginas/configuracion/PaginaEditarVacuna.jsx` | 1 | `4xl` |
| `paginas/configuracion/PaginaHistorialEsquemas.jsx` | 1 | `6xl` |
| `paginas/configuracion/PaginaRegistrarDimension.jsx` | 1 | `3xl` |
| `paginas/configuracion/PaginaRegistrarEsquema.jsx` | 1 | `5xl` |
| `paginas/configuracion/PaginaVerEsquema.jsx` | 1 | `5xl` |
| `paginas/cuenta/PaginaCambiarContrasena.jsx` | 1 | `xl` |
| `paginas/usuarios/PaginaEditarUsuario.jsx` | 2 | `3xl` |
| `paginas/usuarios/PaginaRegistrarPersonal.jsx` | 2 | `3xl` |

Al implementar se vio que son 16 y no 17: la otra `<section>` de `PaginaCompararEsquemas.jsx` es la de cada grupo de la comparación, sin ancho máximo ni relleno, y no lleva el contenedor.

Cada pantalla conserva su ancho de hoy. Si al implementar aparece otra `<section>` con `max-w-*` y sin `mx-auto` en estos archivos, también se cambia.

### `BotonAplicarFiltros` (`frontend/src/componentes/`)

```jsx
<BotonAplicarFiltros pendiente={hayFiltrosSinAplicar} className="sm:ml-auto">Generar</BotonAplicarFiltros>
```

- Es un `Button` de shadcn con `type="submit"`, que envía el `<form>` de la barra de filtros como hoy.
- **Sin cambios pendientes:** el botón de siempre (`primary`, azul).
- **Con cambios pendientes:**
  - el botón pasa a `bg-cambio-pendiente text-foreground hover:bg-cambio-pendiente/85`. Es el mismo ámbar del punto de cambios sin guardar de Registro, y el texto va oscuro, porque el blanco casi no se lee sobre ese fondo;
  - a su lado aparece «Filtros sin aplicar» (`text-sm text-muted-foreground`), y el botón lo lleva en `aria-describedby`. El nombre del botón sigue siendo «Generar» o «Aplicar».
- El cambio de color usa `transition-colors`. Con `prefers-reduced-motion`, la regla general de `index.css` lo deja inmediato.

**Cuándo hay cambios pendientes:**

| Pantalla | Regla |
|---|---|
| Informes | Los parámetros que «Generar» escribiría con el borrador (`parametrosDeInforme(valores)`) son distintos de los que salen de la URL (`parametrosDeInforme(deUrl)`). Se comparan los textos, así que cambiar un filtro y volver a dejarlo igual vuelve a azul. La agrupación no cuenta, porque se aplica sola. |
| Auditoría | El borrador (`borradorDe` del borrador actual) es distinto de lo aplicado (`clave`, que la barra ya calcula), comparando el `JSON.stringify` de los dos. |

Al pulsar el botón, la URL cambia, el borrador vuelve a ser lo aplicado (ya lo hacen las dos pantallas), y el botón vuelve a azul.

### `MarcaDimension` (`frontend/src/paginas/configuracion/`)

```jsx
<MarcaDimension marca="sinPoblacion" de="valor" />   // un Badge con su Tooltip
```

- Es el mismo `Badge` de hoy (`secondary` para Activo y Activa, `outline` para las demás), como `TooltipTrigger` y con `tabIndex={0}`, para que el Tooltip también se abra con el teclado.
- `PaginaDimensiones.jsx` agrega un `TooltipProvider`. `PaginaEditarDimension.jsx` ya tiene uno en la tabla de valores.

| `de` | `marca` | Texto de la marca | Tooltip |
|---|---|---|---|
| `valor` | `activo` | Activo | Se puede usar en esquemas nuevos. |
| `valor` | `inactivo` | Inactivo | No se ofrece en esquemas nuevos. Lo guardado con él no cambia. |
| `valor` | `enUso` | En uso | Lo usa un esquema vigente o en borrador, por eso no se puede desactivar. |
| `valor` | `sinPoblacion` | Sin población | No tiene población objetivo: se registran sus dosis, pero no se calcula su cobertura. |
| `dimension` | `activo` | Activa | Se puede usar en esquemas nuevos. |
| `dimension` | `inactivo` | Inactiva | No se ofrece en esquemas nuevos. Lo guardado con ella no cambia. |
| `dimension` | `enUso` | En uso | La usa un esquema vigente o en borrador, por eso no se puede desactivar. |

### Tabla de Usuarios

En [PaginaUsuarios.jsx:261](../../frontend/src/paginas/usuarios/PaginaUsuarios.jsx#L261), el contenedor pasa de `overflow-x-auto rounded-lg border` a `overflow-x-auto rounded-lg border bg-card`, como en [PaginaAlertas.jsx:233](../../frontend/src/paginas/alertas/PaginaAlertas.jsx#L233).

## Plan de implementación

1. **Tabla de Usuarios.** El `bg-card`. No necesita prueba nueva, porque jsdom no pinta. Comprobación: `PaginaUsuarios.test.jsx` pasa.
2. **`MarcaDimension`.** El componente, con los textos, y su uso en las dos pantallas. Pruebas:
   - en `PaginaEditarDimension.test.jsx`, al enfocar la marca «Sin población» se ve su Tooltip con el texto de la tabla;
   - en `PaginaDimensiones.test.jsx`, lo mismo con «En uso» de una dimensión;
   - las pruebas de hoy que buscan el texto de las marcas siguen pasando.

   Comprobación: las dos pruebas pasan.
3. **`BotonAplicarFiltros`.** El componente, con su prueba `BotonAplicarFiltros.test.jsx`: sin `pendiente`, ni el texto ni la clase ámbar; con `pendiente`, el texto «Filtros sin aplicar», la clase `bg-cambio-pendiente` y el `aria-describedby`. Comprobación: la prueba pasa.
4. **Informes y Auditoría.** `PaginaInformes.jsx` calcula los cambios pendientes y se los pasa a `BarraFiltrosInformes.jsx`. `BarraFiltrosAuditoria.jsx` usa su borrador. Las dos usan `BotonAplicarFiltros`. Pruebas:
   - en `PaginaInformes.test.jsx`: al entrar no se ve «Filtros sin aplicar»; al cambiar un filtro, sí; al pulsar «Generar», ya no; al cambiar un filtro y volver a dejarlo igual, tampoco;
   - en `PaginaAuditoria.test.jsx`: lo mismo con «Aplicar»;
   - las pruebas de hoy que buscan los botones por su nombre («Generar», «Aplicar») siguen pasando.

   Comprobación: las pruebas de las dos pantallas pasan.
5. **`ContenedorFormulario`.** El componente, con su prueba `ContenedorFormulario.test.jsx` (las clases de cada `ancho` y que pasa `aria-label`), y el cambio de las 16 `<section>` de la tabla. Comprobación: `npm test` del frontend pasa completo.
6. **Verificación manual y notas.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano):
   - **como Administrador:** la tabla de Usuarios con fondo blanco; los Tooltip de las marcas al editar `grupo_edad` («10 a 14 años») y en la lista de dimensiones; Auditoría, con «Aplicar» en ámbar al cambiar un filtro y en azul al aplicar; los formularios centrados (registrar y editar usuario, establecimiento, vacuna, red, dimensión y esquema, comparar e historial de esquemas, y cambiar contraseña), en una ventana ancha y en una angosta;
   - **como Revisor (estadígrafa):** en Informes, «Generar» en azul al entrar, en ámbar con «Filtros sin aplicar» al cambiar un filtro, y en azul después de generar.

   Después, la nota en `frontend/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] La tabla de Usuarios tiene fondo blanco (`bg-card`), como las demás tablas.
- [x] Al editar una dimensión, cada marca de estado de sus valores (Activo, Inactivo, En uso, Sin población) muestra su Tooltip con el texto de la tabla, con el ratón o con el teclado.
- [x] En la lista de dimensiones, las marcas Activa, Inactiva y En uso muestran su Tooltip.
- [x] En Informes, «Generar» está azul al entrar y después de generar, y pasa a ámbar con «Filtros sin aplicar» al lado cuando los filtros son distintos de los aplicados.
- [x] Cambiar un filtro y volver a dejarlo como estaba vuelve el botón a azul.
- [x] «Aplicar» de Auditoría se comporta igual.
- [x] Los dos botones conservan su nombre accesible («Generar» y «Aplicar»), y en ámbar tienen el texto «Filtros sin aplicar» en `aria-describedby`.
- [x] Las 16 `<section>` de la tabla usan `ContenedorFormulario` con su ancho de hoy, y se ven centradas.
- [x] Créditos y Mi perfil no cambian.
- [x] `npm test` del frontend pasa completo.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** un solo spec con los cuatro ajustes, de origen `correccion` y en `plataforma` (decidido con el equipo). Son detalles del frontend, chicos e independientes, que salieron de la misma revisión, como el SPEC 53. **No:** un spec por ajuste.
- **Sí:** centrar los formularios con un componente común, aunque el grupo todavía no lo confirmó (decidido con el equipo). Volver a la izquierda es quitar `mx-auto` de un archivo. **No:** cambiar las clases pantalla por pantalla.
- **Sí:** el componente recibe el ancho, y cada pantalla conserva el suyo (decidido al escribir el spec). **No:** un solo ancho para todas, que cambiaría formularios que hoy se ven bien.
- **Sí:** Créditos y Mi perfil se quedan como están (decidido en la fase de preguntas). **No:** pasarlas al componente, que cambiaría su relleno en pantallas chicas.
- **Sí:** «Generar» azul al entrar, y ámbar solo con cambios sin aplicar (decidido en la fase de preguntas). El ámbar siempre quiere decir «cambiaste algo». **No:** empezar en ámbar.
- **Sí:** el ámbar de `--cambio-pendiente`, con texto oscuro (decidido al proponer el ajuste). Es el color que ya marca los cambios sin guardar en Registro. **No:** un naranja nuevo en el tema.
- **Sí:** el texto «Filtros sin aplicar» junto al botón (decidido en la fase de preguntas). **No:** solo el color, que no ve quien distingue mal el ámbar.
- **Sí:** Auditoría igual que Informes, con un componente común (decidido en la fase de preguntas). **No:** solo Informes.
- **Sí:** comparar los valores y no solo marcar que hubo un cambio (decidido al proponer el ajuste). Volver a dejar un filtro como estaba no deja el botón en ámbar.
- **Sí:** los Tooltip en la pantalla de editar y en la lista de dimensiones, con los textos en un solo componente (decidido en la fase de preguntas). **No:** solo al editar. **No:** mover las marcas a otra columna, que se descartó en la revisión.
- **Sí:** la marca lleva `tabIndex={0}` (decidido al escribir el spec). Un `Badge` no recibe el foco, y sin eso el Tooltip no se abre con el teclado.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Al grupo no le gusta el centrado | Se quita `mx-auto` de `ContenedorFormulario` en una corrección de una línea, sin tocar las pantallas. |
| Una pantalla con un ancho máximo construido con texto (`max-w-${…}`) pierde su ancho | `ANCHOS` lista las clases completas. Se revisa cada pantalla en la verificación manual. |
| El ámbar con texto oscuro no tiene buen contraste | `--foreground` (`#1f3247`) sobre `#f2c14e` tiene un contraste de 7.8:1, por encima de AA (4.5:1). |
| Una prueba depende de la clase `max-w-*` de una `<section>` | El paso 5 corre la suite completa. Si una prueba la revisa, se cambia para que use el componente, sin cambiar lo que comprueba. |
| `tabIndex` en las marcas agrega paradas del tabulador en tablas largas | Son pocas marcas por fila. Es lo que pide un Tooltip accesible con el teclado. |

## Lo que **no** entra en este spec

- Centrar otras pantallas, o cambiar Créditos y Mi perfil.
- El texto «Activa · En uso» del recuadro «Datos de la dimensión».
- El aviso de los filtros sin aplicar en otras pantallas, o bloquear la exportación de Informes.
- Cambios en el backend, el contrato, los permisos o el tema.
