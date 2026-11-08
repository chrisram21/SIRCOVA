# SPEC 25 — Guardar el borrador y continuar después

> **Estado:** Implementado
> **Historia:** HU-22
> **Depende de:** SPEC 03, SPEC 06, SPEC 23, SPEC 24
> **Fecha:** 2026-10-26
> **Objetivo:** Que `/registro` avise antes de perder cambios sin guardar (al navegar dentro de la app, cambiar de mes, cerrar sesión o cerrar o recargar la pestaña) y muestre en todo momento si el borrador tiene cambios pendientes o cuándo se guardó.

## Por qué existe este spec

El SPEC 23 ya cumplió dos de los tres criterios de HU-22:

- **«Al volver a abrir el reporte veo los datos guardados».** «Guardar borrador» manda un `PUT /reportes/{id}/vacunas/{vacunaId}` por vacuna con cambios, y al recargar cada cantidad vuelve a su celda (SPEC 23 y SPEC 24).
- **«Solo puedo editar el reporte mientras está en Borrador».** El `PUT` responde 409 `REPORTE_NO_EDITABLE` o `PERIODO_CERRADO`, y un reporte que no se puede editar se ve en solo lectura.

Falta el tercero: **«El sistema avisa si salgo con cambios sin guardar»**. Hoy, cambiar de opción en el menú, cambiar de mes en el Select, cerrar sesión o cerrar la pestaña descartan lo escrito sin decir nada. `CapturaReporte.jsx` ya sabe qué vacunas cambiaron (`conCambios`, que compara la firma de lo escrito con la de lo cargado o guardado), así que el trabajo es detectar la salida y avisar.

**El router.** La app monta `<BrowserRouter>` en `main.jsx`, y `useBlocker` de React Router solo funciona con un *data router*. Este spec cambia `main.jsx` a `createBrowserRouter` con una sola ruta comodín que monta `<App />` igual que hoy. Las `<Routes>` de `App.jsx` no cambian.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- El «Cómo se hará» de HU-22 nombra el `PUT /reportes/{id}/vacunas/{vacuna}`. Ese endpoint ya lo hizo el SPEC 23 y lo amplió el SPEC 24: este spec no cambia el backend.
- La historia no dice qué es «salir». Aquí son: ir a otra pantalla de la app (menú, «Cambiar contraseña», el botón Atrás del navegador), cambiar de mes, cerrar sesión y cerrar o recargar la pestaña.

## Alcance

**Entra:**

- `main.jsx` pasa a `createBrowserRouter` + `RouterProvider`, con una ruta comodín (`path: '*'`) que monta `<ProveedorSesion><App /></ProveedorSesion>`.
- Un aviso de cambios sin guardar en `/registro`:
  - un AlertDialog «Hay cambios sin guardar» con «Seguir editando» y «Salir sin guardar», cuando se navega a otra ruta o a otra búsqueda (`?periodo=`) de la app, incluido el botón Atrás del navegador;
  - el diálogo nativo del navegador (`beforeunload`) al cerrar o recargar la pestaña;
  - un AlertDialog propio en «Cerrar sesión» del Encabezado.
- Un proveedor de «cambios pendientes» en el `Layout`, que la captura llena y el Encabezado consulta.
- En `/registro`, el estado del guardado:
  - una insignia junto a «Guardar borrador»: «Cambios sin guardar», «Guardado a las HH:MM» o «Último cambio: DD/MM/AAAA HH:MM»;
  - una marca en la pestaña de cada vacuna con cambios.
- Pruebas de frontend, con las de `CapturaReporte` y `PaginaRegistro` montadas con `createMemoryRouter`.
- Verificación manual con Playwright sobre el reporte 287 de `cs1201`.
- La documentación:
  - el avance y los criterios de HU-22;
  - una nota en HU-26;
  - una nota en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Cambios al backend o a `openapi.yaml`: los endpoints del SPEC 23 y del SPEC 24 no cambian.
- Guardado automático o periódico.
- Guardar una copia local (`localStorage`) de lo escrito para recuperarla después.
- «Guardar y salir» dentro del diálogo.
- Avisar en «Recargar reporte» después de un 409: lo escrito ya no se puede guardar.
- Avisar cuando la sesión se cierra sola (un 401 o el 403 `CAMBIO_CONTRASENA_REQUERIDO` del cliente de la API).
- El aviso en otras pantallas con formularios (usuarios, catálogos, esquemas). El mecanismo queda listo para reutilizarlo, pero no se aplica aquí.
- Avisos con Sonner: la dependencia no está instalada.
- Cambios al modelo (`01`, `02`), a las semillas (`03`, `04`), a los permisos (`05`) o a `transicion_estado`.

## Modelo de datos

Este spec **no introduce datos nuevos** ni cambia el modelo, los permisos o la API. Reutiliza `GET /reportes/{id}` (su `actualizadoEn`), `GET /reportes/{id}/formulario` y `PUT /reportes/{id}/vacunas/{vacunaId}` tal como quedaron en el SPEC 24.

### Qué cuenta como «cambios sin guardar»

- Una vacuna tiene cambios cuando su firma (`firmaDe`, SPEC 23 y SPEC 24) es distinta de la que quedó al cargar o al guardar. Es la misma regla que habilita «Guardar borrador»: agregar una fila vacía de la tarjeta B no es un cambio, y una celda inválida sí lo es.
- El reporte tiene cambios sin guardar si alguna vacuna los tiene, **también mientras se guarda** y después de un guardado que falló a la mitad (las vacunas que no se guardaron siguen con cambios).
- Un reporte en solo lectura (`editable: false`) nunca tiene cambios.

### Estado compartido

```js
// componentes/ProveedorCambiosPendientes.jsx
// El Layout lo provee; la captura lo llena y el Encabezado lo consulta.
const valor = {
  hayCambios: false,          // true si la pantalla actual tiene cambios sin guardar
  anotarCambios: (bool) => {} // la pantalla lo llama cuando cambia; al desmontarse, deja false
}
```

Sin el proveedor (por ejemplo, en las pruebas que no montan el `Layout`), `useCambiosPendientes()` devuelve `hayCambios: false` y un `anotarCambios` que no hace nada.

### El aviso

`componentes/AvisoCambiosSinGuardar.jsx` exporta el hook `useAvisoCambiosSinGuardar(hayCambios)` y el componente del diálogo:

- **`useBlocker`** bloquea cuando `hayCambios` es `true` y la ruta siguiente tiene otro `pathname` u otro `search` que la actual. Así cambiar de mes (`?periodo=`, con `replace`) también se bloquea.
- Con el bloqueo activo (`blocker.state === 'blocked'`) se abre el AlertDialog:
  - **título:** «Hay cambios sin guardar»;
  - **texto:** «Si sale ahora, se pierden los cambios de {vacunas}. Para conservarlos, quédese y use «Guardar borrador».», con los nombres de las vacunas con cambios separados por comas;
  - **«Seguir editando»** llama a `blocker.reset()`;
  - **«Salir sin guardar»** llama a `blocker.proceed()`.
- **`beforeunload`**: mientras `hayCambios` es `true`, un listener llama a `event.preventDefault()` (el navegador muestra su propio texto). Se quita al no haber cambios y al desmontarse.
- El hook también llama a `anotarCambios(hayCambios)` del proveedor, y a `anotarCambios(false)` al desmontarse.

### Cerrar sesión

En `Encabezado.jsx`, «Cerrar sesión» con `hayCambios: true` abre un AlertDialog antes de llamar a `cerrar()`:

- **título:** «Hay cambios sin guardar»;
- **texto:** «Si cierra sesión ahora, se pierden los cambios sin guardar del reporte.»;
- **«Seguir editando»** cierra el diálogo;
- **«Cerrar sesión sin guardar»** cierra la sesión como hoy.

Sin cambios, «Cerrar sesión» se comporta como hoy, sin diálogo. «Cambiar contraseña» navega con `navegar(...)`, así que lo cubre `useBlocker`.

### Pantalla `/registro`

Referencia: la insignia «Guardado hace 1 min» de `docs/mockups/pantallas/Registro.html`.

- **Insignia**, al pie junto a «Guardar borrador», solo si el reporte es editable. Usa el componente `Badge`:
  - con cambios: «Cambios sin guardar», con los colores `--advertencia` / `--advertencia-foreground` de `index.css`;
  - sin cambios, después de un guardado en esta visita: «Guardado a las HH:MM», con la hora del navegador al terminar el último `PUT` exitoso;
  - sin cambios, sin guardados en esta visita: «Último cambio: DD/MM/AAAA HH:MM», con `actualizadoEn` del reporte (`GET /reportes/{id}`) en la hora local del navegador.
- **Marca en las pestañas.** El `TabsTrigger` de cada vacuna con cambios lleva un punto con el color `--advertencia` y el texto oculto (`sr-only`) «(cambios sin guardar)». Desaparece al guardar esa vacuna.
- El mensaje «Borrador guardado.» del SPEC 23 no cambia.
- **Solo lectura:** sin insignia, sin marcas y sin aviso.

### Archivos que aparecen o cambian

```
frontend/src/
├── main.jsx                                       ← createBrowserRouter + RouterProvider con una ruta comodín
├── componentes/
│   ├── ProveedorCambiosPendientes.jsx             ← nuevo: proveedor y useCambiosPendientes
│   ├── AvisoCambiosSinGuardar.jsx                 ← nuevo: useAvisoCambiosSinGuardar (useBlocker + beforeunload) y el AlertDialog
│   ├── AvisoCambiosSinGuardar.test.jsx            ← nuevo
│   └── layout/
│       ├── Layout.jsx                             ← monta ProveedorCambiosPendientes
│       ├── Encabezado.jsx                         ← confirma «Cerrar sesión» con cambios
│       └── Layout.test.jsx                        ← casos de cerrar sesión con y sin cambios
└── paginas/registro/
    ├── CapturaReporte.jsx                         ← usa el aviso, la insignia y las marcas de las pestañas
    ├── CapturaReporte.test.jsx                    ← se monta con createMemoryRouter; casos nuevos
    └── PaginaRegistro.test.jsx                    ← se monta con createMemoryRouter; caso del cambio de mes
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance y criterios de HU-22; nota en HU-26
CLAUDE.md                                          ← nota del aviso y del data router
```

No cambian `App.jsx`, `MenuLateral.jsx`, `PaginaRegistro.jsx`, el backend ni ningún `package.json`.

## Plan de implementación

1. **Data router.** En `main.jsx`, `createBrowserRouter([{ path: '*', element: <ProveedorSesion><App /></ProveedorSesion> }])` y `<RouterProvider router={…} />` dentro de `StrictMode`.

   Comprobación: `npm test` del frontend pasa sin cambios; con `npm run dev`, el inicio de sesión, el menú, `/registro?periodo=…`, «Cambiar contraseña», «Cerrar sesión» y el botón Atrás funcionan como antes.

2. **Proveedor y aviso.** `ProveedorCambiosPendientes.jsx` y `AvisoCambiosSinGuardar.jsx`. El proveedor se monta en `Layout.jsx`. Pruebas en `AvisoCambiosSinGuardar.test.jsx`, con un componente de prueba dentro de `createMemoryRouter`:
   - sin cambios, un `<Link>` a otra ruta navega sin diálogo;
   - con cambios, el `<Link>` abre el diálogo y la ruta no cambia;
   - «Seguir editando» cierra el diálogo y se queda;
   - «Salir sin guardar» navega;
   - con cambios, cambiar solo el `search` también abre el diálogo;
   - con cambios, un evento `beforeunload` queda con `defaultPrevented`; sin cambios, no;
   - al desmontarse, el proveedor queda en `hayCambios: false`.

   Comprobación: `AvisoCambiosSinGuardar.test.jsx` pasa.

3. **Cerrar sesión.** `Encabezado.jsx` consulta `useCambiosPendientes()`. Casos nuevos en `Layout.test.jsx` (que monta el `Layout` con su proveedor):
   - sin cambios, «Cerrar sesión» cierra como hoy;
   - con cambios anotados, abre el diálogo; «Seguir editando» no llama a `cerrarSesion`, y «Cerrar sesión sin guardar» sí.

   Comprobación: `Layout.test.jsx` pasa, también sus casos anteriores.

4. **La captura.** `CapturaReporte.jsx` llama a `useAvisoCambiosSinGuardar` con `conCambios.length > 0` (y `false` en solo lectura), dibuja el diálogo, la insignia y las marcas de las pestañas. `CapturaReporte.test.jsx` y `PaginaRegistro.test.jsx` pasan a montarse con `createMemoryRouter` + `RouterProvider`, sin cambiar lo que comprueban sus casos. Casos nuevos:
   - **`CapturaReporte.test.jsx`:**
     - al cargar se ve «Último cambio: …» con la fecha del reporte, sin marcas en las pestañas;
     - al escribir, se ve «Cambios sin guardar» y la pestaña de esa vacuna tiene la marca;
     - al guardar, se ve «Guardado a las …» y la marca desaparece;
     - si falla la segunda vacuna, la primera pierde la marca y la segunda la conserva, y la insignia sigue en «Cambios sin guardar»;
     - con cambios, navegar a otra ruta abre el diálogo, que nombra la vacuna con cambios;
     - en solo lectura, no hay insignia.
   - **`PaginaRegistro.test.jsx`:** con cambios en el reporte de un mes, elegir otro mes en el Select abre el diálogo; «Seguir editando» conserva el mes y lo escrito, y «Salir sin guardar» cambia de mes.

   Comprobación: `npm test` del frontend pasa completo.

5. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas, `npm run dev` y Playwright (la persona inicia sesión a mano), con `cs1201` en el reporte 287 (octubre de 2026):
   - al abrir, la insignia dice «Último cambio: …»;
   - escribir una cantidad en Hexavalente: aparece «Cambios sin guardar» y la marca en su pestaña;
   - ir a «Inicio» en el menú: aparece el diálogo; «Seguir editando» conserva lo escrito;
   - el botón Atrás del navegador también abre el diálogo;
   - «Cerrar sesión»: aparece su diálogo; «Seguir editando»;
   - recargar la pestaña: aparece el diálogo nativo (`browser_handle_dialog`), y se cancela;
   - si `cs1201` tiene otro mes abierto, cambiar de mes abre el diálogo; si no, lo cubre la prueba del paso 4;
   - «Guardar borrador»: la insignia dice «Guardado a las …», la marca desaparece, y el menú navega sin diálogo;
   - volver a `/registro`: las cantidades guardadas siguen (criterio «al volver a abrir»);
   - septiembre (`APROBADO`) se ve en solo lectura, sin insignia ni aviso.

   Las cantidades del reporte 287 quedan para HU-25.

   Documentación:
   - en HU-22, marcar los tres criterios y escribir su «Avance»: los dos primeros los cumplió el SPEC 23, y el aviso, este spec;
   - en HU-26, la nota: «Enviar a revisión» no debe enviar con cambios sin guardar (`conCambios` de `CapturaReporte.jsx`), porque la validación y el envío leen lo guardado;
   - en «Notas de contexto» de `CLAUDE.md`, una nota con lo esencial:
     - la app usa un data router (`createBrowserRouter` con una ruta comodín en `main.jsx`) para que funcione `useBlocker`;
     - una pantalla con un formulario usa `useAvisoCambiosSinGuardar(hayCambios)`;
     - «Cerrar sesión» lo consulta con `useCambiosPendientes`;
     - las pruebas que montan una pantalla con el aviso usan `createMemoryRouter` + `RouterProvider`, no `MemoryRouter`.

## Criterios de aceptación

- [ ] `npm test` pasa en `frontend/`, sin desactivar ni quitar pruebas. Los casos anteriores de `CapturaReporte.test.jsx` y `PaginaRegistro.test.jsx` solo cambian cómo se montan.
- [ ] El backend, `openapi.yaml`, `backend/db/`, `transicion_estado` y los dos `package.json` no cambian.
- [ ] Al volver a abrir un reporte en Borrador se ven las cantidades guardadas (SPEC 23), y un reporte que no está en Borrador se ve en solo lectura.
- [ ] Con cambios sin guardar, ir a otra pantalla desde el menú, desde «Cambiar contraseña» o con el botón Atrás abre el diálogo «Hay cambios sin guardar», que nombra las vacunas con cambios.
- [ ] Con cambios sin guardar, elegir otro mes en el Select de `/registro` abre el mismo diálogo.
- [ ] «Seguir editando» deja la pantalla, el mes y lo escrito como estaban. «Salir sin guardar» completa la navegación.
- [ ] Con cambios sin guardar, «Cerrar sesión» pide confirmación, y «Seguir editando» no cierra la sesión.
- [ ] Con cambios sin guardar, cerrar o recargar la pestaña muestra el diálogo nativo del navegador.
- [ ] Sin cambios (al cargar, después de guardar, o con solo una fila vacía agregada en la tarjeta B), ninguna de esas salidas muestra un diálogo.
- [ ] La insignia dice «Cambios sin guardar» con cambios, «Guardado a las HH:MM» después de guardar, y «Último cambio: DD/MM/AAAA HH:MM» al cargar sin cambios.
- [ ] La pestaña de cada vacuna con cambios tiene la marca, y la pierde al guardar esa vacuna.
- [ ] Un reporte en solo lectura no muestra insignia, marcas ni avisos.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-22 tiene su avance y sus criterios marcados, HU-26 tiene su nota, y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** cambiar a un data router (`createBrowserRouter`) y usar `useBlocker` (decidido en la fase de preguntas). Cubre el menú, «Cambiar contraseña», cualquier enlace futuro y el botón Atrás del navegador. La ruta comodín deja `App.jsx` igual. **No:** un contexto que consultan el menú y el Select, que no cubre el botón Atrás ni enlaces nuevos. **No:** solo `beforeunload`, que no avisa dentro de la app.
- **Sí:** el diálogo tiene «Seguir editando» y «Salir sin guardar» (decidido en la fase de preguntas). Para guardar, la persona se queda y usa «Guardar borrador», donde ya se ven los errores por vacuna. **No:** «Guardar y salir», que debe cancelar la salida si un `PUT` falla.
- **Sí:** avisan ir a otra pantalla, cambiar de mes, cerrar sesión y cerrar o recargar la pestaña (decidido en la fase de preguntas). **No:** «Recargar reporte» después de un 409, porque lo escrito ya no se puede guardar.
- **Sí:** el cambio de mes se bloquea con el mismo `useBlocker`, porque va por la URL (`?periodo=`). `PaginaRegistro.jsx` no cambia (decidido al escribir el spec).
- **Sí:** «Cerrar sesión» se confirma con un proveedor de «cambios pendientes» en el `Layout` (decidido al escribir el spec). El Encabezado borra la sesión antes de navegar, así que `useBlocker` no lo detecta. **No:** cambiar el orden en `cerrarSesion` para navegar primero, que choca con la redirección de `/login` con sesión a `/inicio`.
- **Sí:** «cambios sin guardar» es la misma regla que habilita «Guardar borrador» (`conCambios`), y sigue en `true` mientras se guarda (decidido al escribir el spec). **No:** una regla aparte, que podría avisar cuando el botón está deshabilitado o al revés.
- **Sí:** una insignia junto a «Guardar borrador» y una marca en las pestañas con cambios (decidido en la fase de preguntas). **No:** solo la insignia; **no:** nada extra.
- **Sí:** la hora sale de `actualizadoEn` de `GET /reportes/{id}` al cargar, y de la hora del navegador al guardar (decidido en la fase de preguntas). **No:** que el `PUT` devuelva `actualizadoEn`, que cambia el contrato y el backend en una historia que es solo de frontend.
- **Sí:** la insignia va al pie, junto a «Guardar borrador», aunque el mockup la pone arriba (decidido al escribir el spec). El estado vive en `CapturaReporte`, y así no hay que subirlo a `PaginaRegistro`.
- **Sí:** el aviso es un hook genérico en `componentes/`, listo para otras pantallas, pero solo se usa en `/registro` (decidido al escribir el spec). **No:** aplicarlo ahora a otros formularios.
- **Sí:** las pruebas que montan la captura usan `createMemoryRouter` + `RouterProvider`, porque `useBlocker` falla fuera de un data router. Lo que comprueban los casos anteriores no cambia.

Decididas al implementar:

- **Sí:** «Salir sin guardar» llama a `evento.preventDefault()` antes de `bloqueo.proceed()`. Sin eso, Radix cierra el diálogo y su `onOpenChange` llama a `reset()` justo después de `proceed()` (paso 2).
- **Sí:** el hook libera el bloqueo si queda `blocked` cuando ya no hay cambios, como `usePrompt` de React Router (paso 2).
- **Sí:** las pruebas de «Cerrar sesión» montan el `Layout` real dentro de `RutaProtegida` con una pantalla que usa el aviso, y comprueban que `useBlocker` no frena la redirección a `/login` (el riesgo de la tabla) (paso 3).
- **Sí:** la marca de la pestaña es su **descripción accesible** (`aria-describedby` hacia un `<span hidden>` «(cambios sin guardar)»), no texto oculto dentro de su nombre. Así la pestaña se sigue llamando como la vacuna y las pruebas anteriores, que la buscan por su nombre, no cambian (paso 4).
- **Sí:** el punto de la pestaña usa `bg-advertencia-foreground`, porque `--advertencia` (`#fff5dd`) casi no se ve sobre la pestaña. Las insignias «Guardado a las …» y «Último cambio: …» usan `bg-accent` (paso 4).
- **Sí:** en `PaginaRegistro.test.jsx`, el caso de «Seguir editando» lee el mes del texto del Select y no del `<select>` nativo, que conserva el valor que le puso `fireEvent` (paso 4).
- **Sí:** un caso más en `CapturaReporte.test.jsx`: sin cambios, navegar no abre el diálogo (paso 4).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar `main.jsx` a un data router rompe la navegación actual (rutas, redirecciones, `useSearchParams`) | La ruta comodín monta `<App />` sin cambios, y sus `<Routes>` siguen igual. El paso 1 se comprueba solo, con la suite completa y a mano, antes de agregar el aviso. |
| `useBlocker` bloquea la redirección a `/login` al cerrar sesión, porque la captura sigue montada con cambios | Al cerrar sesión, `RutaProtegida` desmonta el `Layout` (y con él la captura y su bloqueo) en el mismo render en que redirige. La prueba de `Layout.test.jsx` y la verificación manual lo comprueban. |
| Una pantalla que no está en un data router usa el hook y falla | Todas las pantallas cuelgan del router de `main.jsx`. En las pruebas, la nota de `CLAUDE.md` pide `createMemoryRouter`. |
| La sesión se cierra sola (401) con cambios sin guardar y se pierden | Queda fuera de alcance. El cliente de la API cierra la sesión sin preguntar, como hoy. |
| El diálogo nativo de `beforeunload` no se puede personalizar y algunos navegadores lo omiten si la persona no interactuó con la página | Es el comportamiento estándar. La persona siempre interactuó, porque escribió algo para tener cambios. |
| Un guardado que falla a la mitad deja algunas vacunas guardadas y otras no | La marca de las pestañas y el diálogo nombran solo las vacunas que siguen con cambios. |

## Lo que **no** entra en este spec

- Cambios al backend o al contrato.
- Guardado automático o una copia local de lo escrito.
- «Guardar y salir» en el diálogo.
- Avisar en «Recargar reporte» o cuando la sesión se cierra sola.
- El aviso en otras pantallas.
- Cambios al modelo, a las semillas, a los permisos o a `transicion_estado`.

Cada uno, si se hace, va en su propio spec.
