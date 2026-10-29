import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { Toaster } from './components/ui/sonner.jsx'
import { ProveedorSesion } from './componentes/ProveedorSesion.jsx'

// Un data router, para que funcione useBlocker; la ruta comodín deja las <Routes> de App como estaban.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    ),
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-right" closeButton />
  </StrictMode>,
)
