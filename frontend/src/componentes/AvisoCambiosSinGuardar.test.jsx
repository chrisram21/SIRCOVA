import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from './AvisoCambiosSinGuardar.jsx'
import { ProveedorCambiosPendientes, useCambiosPendientes } from './ProveedorCambiosPendientes.jsx'

function Formulario() {
  const [hayCambios, setHayCambios] = useState(false)
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios)
  const { search } = useLocation()
  return (
    <>
      <p>Formulario{search}</p>
      <button onClick={() => setHayCambios(true)}>Escribir</button>
      <button onClick={() => setHayCambios(false)}>Guardar</button>
      <Link to="/otra">Ir a otra</Link>
      <Link to="/?periodo=2" replace>
        Otro mes
      </Link>
      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Se pierden los cambios de BCG." />
    </>
  )
}

function EstadoProveedor() {
  const { hayCambios } = useCambiosPendientes()
  return <p>{hayCambios ? 'Proveedor con cambios' : 'Proveedor sin cambios'}</p>
}

function abrir() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorCambiosPendientes>
            <Outlet />
            <EstadoProveedor />
          </ProveedorCambiosPendientes>
        ),
        children: [
          { path: '/', element: <Formulario /> },
          { path: '/otra', element: <p>Otra pantalla</p> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const dialogo = () => screen.queryByRole('alertdialog')
const escribir = () => fireEvent.click(screen.getByRole('button', { name: 'Escribir' }))

test('sin cambios, un enlace a otra ruta navega sin diálogo', async () => {
  abrir()
  fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
  expect(await screen.findByText('Otra pantalla')).toBeTruthy()
  expect(dialogo()).toBeNull()
})

test('con cambios, el enlace abre el diálogo con su descripción y la ruta no cambia', async () => {
  const router = abrir()
  escribir()
  fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
  const abierto = await screen.findByRole('alertdialog')
  expect(abierto.textContent).toContain('Hay cambios sin guardar')
  expect(abierto.textContent).toContain('Se pierden los cambios de BCG.')
  expect(router.state.location.pathname).toBe('/')
})

test('«Seguir editando» cierra el diálogo y se queda', async () => {
  const router = abrir()
  escribir()
  fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir editando' }))
  await vi.waitFor(() => expect(dialogo()).toBeNull())
  expect(router.state.location.pathname).toBe('/')
  expect(screen.getByText('Formulario')).toBeTruthy()
})

test('«Salir sin guardar» navega', async () => {
  abrir()
  escribir()
  fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
  expect(await screen.findByText('Otra pantalla')).toBeTruthy()
  expect(dialogo()).toBeNull()
})

test('con cambios, cambiar solo la búsqueda también abre el diálogo', async () => {
  const router = abrir()
  escribir()
  fireEvent.click(screen.getByRole('link', { name: 'Otro mes' }))
  expect(await screen.findByRole('alertdialog')).toBeTruthy()
  expect(router.state.location.search).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
  expect(await screen.findByText('Formulario?periodo=2')).toBeTruthy()
})

test('con cambios, beforeunload queda prevenido; sin cambios, no', () => {
  abrir()
  const cerrarPestana = () => {
    const evento = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evento)
    return evento.defaultPrevented
  }
  expect(cerrarPestana()).toBe(false)
  escribir()
  expect(cerrarPestana()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(cerrarPestana()).toBe(false)
})

test('anota los cambios en el proveedor y los quita al desmontarse', async () => {
  const router = abrir()
  expect(screen.getByText('Proveedor sin cambios')).toBeTruthy()
  escribir()
  expect(screen.getByText('Proveedor con cambios')).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
  await screen.findByText('Otra pantalla')
  expect(router.state.location.pathname).toBe('/otra')
  expect(screen.getByText('Proveedor sin cambios')).toBeTruthy()
})
