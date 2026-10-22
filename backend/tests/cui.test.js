import { describe, it, expect } from 'vitest';
import { validarCui } from '../src/validaciones/campos.js';
import { huellaCui } from '../src/modulos/usuarios/cui.service.js';

// CUI ficticio que cumple el dígito verificador.
const CUI = '1234567890101';

describe('huellaCui', () => {
  it('da 64 caracteres hexadecimales que no contienen el CUI', () => {
    const huella = huellaCui(CUI);
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella.includes(CUI)).toBe(false);
  });

  it('el mismo CUI escrito con espacios o sin ellos da la misma huella', () => {
    const conEspacios = validarCui('1234 56789 0101').valor;
    const conGuiones = validarCui('1234-56789-0101').valor;
    expect(huellaCui(conEspacios)).toBe(huellaCui(CUI));
    expect(huellaCui(conGuiones)).toBe(huellaCui(CUI));
  });

  it('otra clave u otro CUI dan otra huella', () => {
    expect(huellaCui(CUI, 'otra-clave-de-prueba-de-32-caracteres')).not.toBe(huellaCui(CUI));
    expect(huellaCui('2345678991201')).not.toBe(huellaCui(CUI));
  });
});
