import { describe, it, expect } from 'vitest';
import { filtroAlcance, verificarAlcance } from '../src/modulos/auth/alcance.service.js';
import { ErrorApi } from '../src/middlewares/errores.js';

const columnas = { establecimiento: 'r.establecimiento_id', ddriss: 'r.ddriss_id' };

const usuario = (rol, ddrissId, establecimientoId = null) => ({ id: 7, rol, ddrissId, establecimientoId });

const establecimiento = usuario('ESTABLECIMIENTO', 1, 12);
const autoridadPais = usuario('AUTORIDAD', null);

const esNoEncontrado = (fn) => {
  try {
    fn();
  } catch (err) {
    return err instanceof ErrorApi && err.status === 404 && err.codigo === 'NO_ENCONTRADO';
  }
  return false;
};

describe('filtroAlcance', () => {
  it('ESTABLECIMIENTO: filtra por su establecimiento', () => {
    expect(filtroAlcance(establecimiento, columnas)).toEqual({
      condicion: 'r.establecimiento_id = ?',
      parametros: [12],
    });
  });

  it.each(['REVISOR', 'EPIDEMIOLOGIA', 'ADMINISTRADOR', 'AUTORIDAD'])('%s con DDRISS: filtra por su DDRISS', (rol) => {
    expect(filtroAlcance(usuario(rol, 1), columnas)).toEqual({ condicion: 'r.ddriss_id = ?', parametros: [1] });
  });

  it('AUTORIDAD sin DDRISS: no filtra (todo el país)', () => {
    expect(filtroAlcance(autoridadPais, columnas)).toEqual({ condicion: '1 = 1', parametros: [] });
  });

  it.each([
    ['REVISOR sin DDRISS', usuario('REVISOR', null)],
    ['ESTABLECIMIENTO sin establecimiento', usuario('ESTABLECIMIENTO', 1, null)],
    ['rol desconocido', usuario('OTRO', 1)],
    ['sin usuario', undefined],
  ])('%s: no ve nada', (_, datos) => {
    expect(filtroAlcance(datos, columnas)).toEqual({ condicion: '1 = 0', parametros: [] });
  });
});

describe('verificarAlcance', () => {
  it('ESTABLECIMIENTO: deja pasar un recurso de su establecimiento', () => {
    expect(() => verificarAlcance(establecimiento, { establecimientoId: 12, ddrissId: 1 })).not.toThrow();
  });

  it('ESTABLECIMIENTO: otro establecimiento de su misma DDRISS responde 404', () => {
    expect(esNoEncontrado(() => verificarAlcance(establecimiento, { establecimientoId: 13, ddrissId: 1 }))).toBe(true);
  });

  it.each(['REVISOR', 'EPIDEMIOLOGIA', 'ADMINISTRADOR', 'AUTORIDAD'])('%s con DDRISS: solo su DDRISS', (rol) => {
    const datos = usuario(rol, 1);

    expect(() => verificarAlcance(datos, { establecimientoId: 12, ddrissId: 1 })).not.toThrow();
    expect(esNoEncontrado(() => verificarAlcance(datos, { establecimientoId: 40, ddrissId: 2 }))).toBe(true);
  });

  it('AUTORIDAD sin DDRISS: ve un recurso de cualquier DDRISS', () => {
    expect(() => verificarAlcance(autoridadPais, { establecimientoId: 40, ddrissId: 2 })).not.toThrow();
  });

  it('un rol distinto de AUTORIDAD sin DDRISS: responde 404', () => {
    expect(esNoEncontrado(() => verificarAlcance(usuario('REVISOR', null), { establecimientoId: 12, ddrissId: 1 }))).toBe(
      true,
    );
  });

  it('el 404 usa el mensaje común', () => {
    expect(() => verificarAlcance(establecimiento, { establecimientoId: 13, ddrissId: 1 })).toThrow(
      'El recurso solicitado no existe.',
    );
  });
});
