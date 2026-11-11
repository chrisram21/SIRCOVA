# SPEC 58 — Límite de opciones en los combobox que crecen

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec F» de Chris, punto 11 de `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 07, SPEC 08, SPEC 12 y SPEC 35
> **Fecha:** 2026-11-10
> **Objetivo:** Que el mes de la bandeja de revisión se elija con Año + Mes (nunca más de 12 meses), que los establecimientos de Personal y de Usuarios se elijan con un combobox con búsqueda, y que el acceso rápido del login tenga también Epidemiología y Revisor.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hay dos listas que crecen sin límite:

- el select «Mes» de la bandeja, que suma 12 opciones por año;
- el select de establecimientos, con unas 195 opciones y sin búsqueda.

El problema es de uso (listas largas de recorrer), no de rendimiento, así que no se cambia el backend. Chris lo dejó en `specs/spec-F-limite-combobox.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Decisión de Chris (2026-11-10), del documento F:** la bandeja usa Año + Mes, como Indicadores y Mapa. Las listas de establecimientos usan un combobox con búsqueda. Lo nuevo sigue la misma regla.

**Lo que se decidió en la fase de preguntas:**

- El combobox es el de shadcn (`Popover` + `Command`), agregado con su CLI. Trae la dependencia `cmdk`, que queda autorizada en este spec.
- Va en registrar y editar personal (`CamposEmpleado.jsx`) y en el filtro de establecimiento de Usuarios (`FiltrosUsuarios.jsx`).
- La bandeja sigue pidiendo `listarPeriodos()` una sola vez y reparte los meses por año en el frontend.
- Al cambiar de año queda elegido el mes por defecto de ese año, con la misma regla de `mesPorDefecto`.
- La búsqueda encuentra por nombre y por código, sin importar mayúsculas ni tildes.
- El componente es genérico, en `componentes/`, para reutilizarlo en catálogos futuros.
- La regla general para lo nuevo va en una nota de `CLAUDE.md`.
- Las opciones del select Mes muestran solo el nombre del mes y, si corresponde, «· cerrado».

**Agregado al revisar el borrador (Chris, 2026-11-10):** el acceso rápido del login (solo en `npm run dev`) tiene hoy botones para «Administrador» y «Personal del establecimiento», pero no para Epidemiología ni para el Revisor, y para probar sus pantallas hay que escribir las credenciales a mano. Es un tema distinto del combobox; va en este spec porque es chico y sigue el mismo patrón que ya existe. Se decidió:

- dos botones, «Epidemiología» y «Revisor», con las variables `VITE_ACCESO_RAPIDO_EPIDEMIOLOGIA_*` y `VITE_ACCESO_RAPIDO_REVISOR_*`;
- sin botón para la Autoridad;
- las credenciales las pone cada integrante en su `frontend/.env.local`; el spec solo agrega las variables comentadas y sin valores en `.env.example`.

## Alcance

**Entra:**

- Agregar `popover` y `command` de shadcn con su CLI (`components/ui/popover.jsx`, `components/ui/command.jsx`, y `cmdk` en `package.json` y en el lock), sin sobrescribir los componentes que ya existen.
- El componente propio `componentes/SelectorConBusqueda.jsx`, con la función pura `filtrarOpciones` (y su prueba).
- En `paginas/usuarios/CamposEmpleado.jsx`: `CampoSeleccion` acepta la prop `conBusqueda`, y el campo «Establecimiento» la usa.
- En `paginas/usuarios/FiltrosUsuarios.jsx`: el filtro «Filtrar por establecimiento» usa `SelectorConBusqueda`.
- En `paginas/revision/PaginaBandejaRevision.jsx`: un select «Año» y un select «Mes». La URL sigue con `periodo`, sin parámetro nuevo.
- Las pruebas de esas pantallas, ajustadas a la nueva forma de elegir sin cambiar lo que comprueban, más las nuevas.
- Si `cmdk` lo necesita en jsdom, el `scrollIntoView` falso en `src/preparar-pruebas.js`.
- En `paginas/login/PaginaLogin.jsx`: los botones «Epidemiología» y «Revisor» en `accesosRapidos()`. En `frontend/.env.example`: sus cuatro variables, comentadas y sin valores. En `PaginaLogin.test.jsx`: sus pruebas.
- La nota en «Notas de contexto» de `CLAUDE.md` (con la regla general), la actualización de la nota del acceso rápido (2026-10-28) y borrar `specs/spec-F-limite-combobox.md`.

**Fuera de alcance (para otros specs):**

- Cambios en el backend, el contrato o la base: `GET /periodos` y `GET /establecimientos` siguen igual.
- Los selects de año de Mis reportes y Rectificaciones (crecen 1 por año), los de Indicadores y Mapa (ya limitados) y el mes de Registro (solo meses abiertos).
- Los filtros de municipio y distrito de «Establecimientos» (`PaginaEstablecimientos.jsx`), el municipio de la bandeja y cualquier otro catálogo.
- Paginación o carga bajo demanda de opciones.
- Cambiar qué establecimientos se ofrecen (activos, inactivos, de qué DDRISS): se ofrecen los mismos que hoy.
- Un botón de acceso rápido para la Autoridad, y escribir credenciales en cualquier archivo del repositorio o en el `.env.local` de alguien.

## Modelo de datos

Este spec no introduce datos nuevos ni cambia tablas, colecciones o endpoints. Solo cambia cómo se eligen en pantalla datos que ya se cargan.

### `SelectorConBusqueda`

```jsx
<SelectorConBusqueda
  id="establecimiento"            // id del botón: lo usan la etiqueta y enfocarPrimero
  valor="12"                       // valor elegido (texto), o undefined
  alCambiar={(valor) => {}}
  opciones={[
    { valor: 'ninguno', texto: 'Sin establecimiento (personal de la DDRISS)', fija: true },
    { valor: '12', texto: 'Centro de Salud Concepción Tutuapa', detalle: 'CS-1206' },
  ]}
  marcador="Elija un establecimiento"
  textoBuscar="Buscar por nombre o código…"
  textoVacio="Ningún establecimiento coincide."
  deshabilitado={false}
  invalido={false}                 // aria-invalid
  descritoPor="establecimiento-error" // aria-describedby
  etiqueta="Filtrar por establecimiento" // aria-label, cuando no hay <label>
/>
```

- El botón (`role="combobox"`, con `aria-expanded`) muestra el `texto` de la opción elegida o el `marcador`, y abre un `Popover` con un `Command`: un campo de búsqueda arriba y la lista abajo.
- Cada opción muestra su `texto` y, si tiene, su `detalle` en gris (el código).
- Las opciones con `fija: true` («Sin establecimiento», «Todos los establecimientos», «Sede de la DDRISS») van primero y se ven siempre, se busque lo que se busque.
- Al elegir una opción, se cierra y llama a `alCambiar(valor)`.

### `filtrarOpciones(opciones, busqueda)`

- Función pura, exportada desde el mismo archivo.
- Compara sin mayúsculas ni tildes (`normalize('NFD')` sin las marcas diacríticas) y busca el texto en `texto` y en `detalle`.
- Una búsqueda vacía devuelve todas las opciones. Las `fija` se conservan siempre, en su orden.
- El `Command` va con `shouldFilter={false}` y muestra lo que devuelve esta función, no el filtro difuso de `cmdk`.

### Bandeja: Año + Mes

- **Los meses:** `mesesDeLaDdriss(periodos)` sigue igual: los meses con `cierre_periodo` de la DDRISS, del más reciente al más antiguo.
- **Los años:** `aniosDeMeses(meses)` (nueva, exportada) da los años distintos de esos meses, del más reciente al más antiguo. Así el select «Año» lista solo años con algún mes abierto.
- **El mes elegido:** sale de `periodo` en la URL. Una URL vieja con `periodo` abre su año y su mes.
- **Sin `periodo`, o con uno que no está:** se elige con `mesPorDefecto(meses)`, como hoy.
- **Al cambiar de año:** queda `mesPorDefecto(meses del año)`, es decir, el abierto o en cierre más antiguo de ese año o, si no hay, el más reciente de ese año. La URL guarda solo ese `periodo` y se quita la página, como al cambiar de mes hoy.
- **Opciones del select «Mes»:** son los meses del año elegido (nunca más de 12), con «Marzo» o «Abril · cerrado». El antetítulo sigue con el mes y el año completos.
- **Nombres para las pruebas:** los dos selects van dentro del mismo `<form>`, con `name="anio"` y `name="periodo"`, así las pruebas los cambian con su `<select>` nativo.

### Acceso rápido del login

`accesosRapidos()` pasa de dos a cuatro entradas, en este orden. Cada una lleva su icono de `lucide-react`:

| Botón | Variables | Icono |
|---|---|---|
| Administrador | `VITE_ACCESO_RAPIDO_ADMIN_*` | `UserCog` (como hoy) |
| Personal del establecimiento | `VITE_ACCESO_RAPIDO_ESTABLECIMIENTO_*` | `Building2` (como hoy) |
| Epidemiología | `VITE_ACCESO_RAPIDO_EPIDEMIOLOGIA_USUARIO` / `_CONTRASENA` | `Activity` |
| Revisor | `VITE_ACCESO_RAPIDO_REVISOR_USUARIO` / `_CONTRASENA` | `ClipboardCheck` |

- Todo lo demás sigue igual:
  - solo con `import.meta.env.DEV`;
  - un botón sin usuario o sin contraseña queda deshabilitado, con el aviso de `.env.local`;
  - entra con el login normal.
- La cuadrícula de dos columnas queda en 2 × 2, y en una columna en pantallas angostas.

## Plan de implementación

1. **Componentes de shadcn.**
   - Correr `npx shadcn@latest add popover command` en `frontend/`. Si la CLI pregunta por sobrescribir un archivo existente (por ejemplo `dialog.jsx`), contestar que no.
   - Revisar el diff: solo deben aparecer `popover.jsx`, `command.jsx` y `cmdk` en `package.json` y en el lock.
   - Comprobar que `npm run dev` arranca y que pasan las pruebas de las pantallas que usan `Dialog`.
2. **`SelectorConBusqueda`.**
   - Crear `componentes/SelectorConBusqueda.jsx` con `filtrarOpciones`.
   - Pruebas en `componentes/SelectorConBusqueda.test.jsx`:
     - `filtrarOpciones` encuentra «tutuapa» en «Concepción Tutuapa» y «cs-1206» en el código, y conserva las fijas;
     - al abrir, escribir y elegir, llama a `alCambiar` con el valor;
     - sin coincidencias muestra `textoVacio`;
     - `deshabilitado` no abre.
   - Si `cmdk` falla en jsdom por `scrollIntoView`, agregar el falso en `preparar-pruebas.js`.
3. **Personal.**
   - `CampoSeleccion` acepta `conBusqueda` (con `textoBuscar` y `textoVacio`) y, con ella, dibuja `SelectorConBusqueda` con el mismo `id`, `aria-invalid` y `aria-describedby`. Sin ella sigue siendo el `Select` de siempre.
   - «Establecimiento» la usa, con el código como `detalle` y «Sin establecimiento» como fija.
   - Ajustar `PaginaRegistrarPersonal.test.jsx` y `PaginaEditarUsuario.test.jsx` y agregar una prueba: escribir parte del nombre y elegir el establecimiento actualiza el municipio.
4. **Filtro de Usuarios.**
   - El filtro de establecimiento usa `SelectorConBusqueda`, con «Todos los establecimientos» y «Sede de la DDRISS» como fijas, «(inactivo)» en el texto como hoy, el código como `detalle` y `etiqueta="Filtrar por establecimiento"`.
   - La URL sigue con `establecimientoId`.
   - Ajustar `PaginaUsuarios.test.jsx` y agregar una prueba de buscar y filtrar.
5. **Bandeja.**
   - Agregar `aniosDeMeses` y los selects «Año» y «Mes» en `PaginaBandejaRevision.jsx`.
   - Pruebas en `PaginaBandejaRevision.test.jsx`:
     - el mes nunca muestra más de 12 opciones, con datos de dos años;
     - el año lista solo años con meses abiertos;
     - cambiar de año elige el mes por defecto de ese año y lo pone en `periodo`;
     - una URL con `periodo` de otro año abre ese año y ese mes;
     - las opciones dicen «Marzo» o «Abril · cerrado».
6. **Acceso rápido.**
   - Agregar «Epidemiología» y «Revisor» en `accesosRapidos()` y sus cuatro variables, comentadas y sin valores, en `frontend/.env.example`.
   - En `PaginaLogin.test.jsx`, el `beforeEach` también vacía las variables de `EPIDEMIOLOGIA` y `REVISOR`.
   - Pruebas:
     - sin variables, los cuatro botones están deshabilitados;
     - «Revisor» inicia sesión con sus credenciales configuradas.
   - Antes del paso 7, Chris pone en su `frontend/.env.local` los usuarios y la contraseña de las dos cuentas.
7. **Verificación manual** con la API real y Playwright:
   - con el acceso rápido del Administrador, en «Registrar personal» y en el filtro de Usuarios, buscar «tutuapa» y «cs-12» y elegir;
   - en «Editar», que el establecimiento guardado se vea elegido;
   - con el acceso rápido del Revisor, en la bandeja, cambiar de año y de mes y abrir una URL vieja con `periodo`;
   - con el acceso rápido de Epidemiología, que entra a su Inicio;
   - a 390 px, la lista del combobox, los dos selects y los cuatro botones del login no desbordan.
8. **Notas en «Notas de contexto» de `CLAUDE.md`:**
   - una nueva con la regla general para lo nuevo: fechas como Año + Mes, catálogos de más de unos 20 nombres con `SelectorConBusqueda`, y cómo se prueba el combobox;
   - en la nota del acceso rápido (2026-10-28), los cuatro roles y sus variables.

   Después, borrar `specs/spec-F-limite-combobox.md`.

## Criterios de aceptación

- [ ] `popover.jsx`, `command.jsx` y `cmdk` se agregaron con la CLI de shadcn, sin cambios en los otros componentes de `components/ui/`.
- [ ] En la bandeja, el select «Mes» nunca muestra más de 12 opciones y el select «Año» lista solo años con meses abiertos por la DDRISS.
- [ ] Al cambiar de año en la bandeja queda el mes por defecto de ese año, y la URL lleva su `periodo`.
- [ ] Una URL vieja con `periodo` abre el año y el mes correctos.
- [ ] Sin `periodo` en la URL, la bandeja abre el mismo mes que hoy (`mesPorDefecto`).
- [ ] En registrar y editar personal, el establecimiento se encuentra escribiendo parte del nombre o del código, sin importar mayúsculas ni tildes.
- [ ] «Sin establecimiento» se puede elegir siempre, y al elegir un establecimiento el municipio se actualiza como hoy.
- [ ] Al enviar con errores, el foco sigue yendo al primer campo con error, también si es el establecimiento.
- [ ] En el filtro de Usuarios, el establecimiento se encuentra igual, «Todos» y «Sede de la DDRISS» se ven siempre, y la URL sigue con `establecimientoId`.
- [ ] Sin coincidencias, el combobox dice «Ningún establecimiento coincide.».
- [ ] En `npm run dev`, el acceso rápido del login tiene «Epidemiología» y «Revisor», que entran con las cuentas de `VITE_ACCESO_RAPIDO_EPIDEMIOLOGIA_*` y `VITE_ACCESO_RAPIDO_REVISOR_*`, y quedan deshabilitados si les falta el usuario o la contraseña.
- [ ] `frontend/.env.example` lista las cuatro variables nuevas, comentadas y sin valores, y ningún archivo del repositorio tiene credenciales.
- [ ] El build sigue sin el recuadro ni las credenciales del acceso rápido.
- [ ] A 390 px no hay desborde horizontal.
- [ ] Pasan `SelectorConBusqueda.test.jsx`, `PaginaBandejaRevision.test.jsx`, `PaginaRegistrarPersonal.test.jsx`, `PaginaEditarUsuario.test.jsx`, `PaginaUsuarios.test.jsx`, `PaginaLogin.test.jsx` y la suite del frontend.

## Decisiones

- **Sí:** Año + Mes en la bandeja. Es el patrón de Indicadores y Mapa y queda acotado para siempre.
- **No:** «Últimos 12 meses + Meses anteriores…». Es un patrón distinto del resto de la app.
- **Sí:** una sola carga de `listarPeriodos()` repartida por año. Cambiar de año no hace otra petición, y `mesPorDefecto` sigue viendo todos los meses.
- **No:** `listarPeriodos({ anio })` por año, como sugería el documento F. Los años del select necesitarían otra consulta, y el mes por defecto puede estar en otro año.
- **Sí:** la URL sigue solo con `periodo`. El año se deduce de él, y las URL viejas y los enlaces de otras pantallas siguen sirviendo.
- **Sí:** al cambiar de año, el mes por defecto de ese año, con la misma regla de `mesPorDefecto`.
- **Sí:** el combobox de shadcn (`Popover` + `Command`). La regla del proyecto es usar primero shadcn, y `AGENTS.md` permite las dependencias que instala su CLI.
- **No:** un combobox propio sin dependencias. Habría que rehacer a mano el teclado y la accesibilidad que ya resuelve `cmdk`.
- **Sí:** un componente genérico (`SelectorConBusqueda`) en `componentes/`. Sirve para la regla general de catálogos grandes.
- **No:** un componente solo para establecimientos.
- **Sí:** filtrar con `filtrarOpciones` (nombre y código, sin mayúsculas ni tildes) y `shouldFilter={false}`. El filtro difuso de `cmdk` no ignora tildes ni busca en el código.
- **Sí:** las opciones especiales (Sin establecimiento, Todos, Sede) se ven siempre. No son establecimientos y no tiene sentido que una búsqueda las esconda.
- **Sí:** `CampoSeleccion` con la prop `conBusqueda`, en lugar de un campo nuevo. Así se reutiliza su etiqueta, su error y su `id` para el foco.
- **No:** cambiar el backend. El problema es de uso, no de rendimiento.
- **Sí:** la regla general en `CLAUDE.md`. Es una convención de trabajo, como las demás notas de interfaz.
- **Sí:** el acceso rápido de Epidemiología y Revisor en este spec, aunque es otro tema. Lo pidió Chris al revisar el borrador: es chico y repite el patrón de los dos botones que ya existen.
- **Sí:** los nombres «Epidemiología» y «Revisor», con variables por código de rol (`EPIDEMIOLOGIA`, `REVISOR`).
- **No:** un botón para la Autoridad. Nadie lo pidió.
- **No:** escribir credenciales en el `.env.local` de nadie ni en `.env.example`. Cada integrante las pone en su `.env.local` (nota del 2026-10-28).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La CLI de shadcn quiere sobrescribir componentes ya ajustados (`dialog.jsx`, `button.jsx`) | Contestar que no a cada sobrescritura y revisar el diff del paso 1 antes de seguir. |
| `cmdk` usa `scrollIntoView` o `ResizeObserver`, que jsdom no tiene | El paso 2 agrega el falso en `preparar-pruebas.js` si hace falta (el de `ResizeObserver` ya existe). |
| Las pruebas que eligen el establecimiento con el `<select>` nativo dejan de servir | Los pasos 3 y 4 las cambian para abrir el combobox, escribir y elegir, sin cambiar lo que comprueban. |
| El `Popover` dentro de un formulario o un diálogo queda debajo de otra capa | Se comprueba en la verificación manual; el `Popover` de shadcn va en un portal. |
| La bandeja con un `periodo` de un mes sin `cierre_periodo` | Se comporta como hoy: se ignora y se elige `mesPorDefecto`. |
| Vitest carga el `.env.local` de quien corre las pruebas, y sus credenciales reales cambian lo que ven las pruebas del login | El `beforeEach` de `PaginaLogin.test.jsx` vacía con `vi.stubEnv` las variables de los cuatro roles, no solo las de dos. |
| Las pruebas que buscan «Administrador» o «Personal del establecimiento» por nombre encuentran otro botón | Los nombres nuevos no contienen los anteriores; se comprueba en el paso 6. |
