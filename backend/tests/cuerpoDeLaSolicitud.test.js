import { describe, it, expect, vi, afterEach } from 'vitest';
import zlib from 'node:zlib';
import request from 'supertest';
import app from '../src/app.js';

// Sin contrasena: lo que pasa la lectura del cuerpo responde 400 antes de tocar la base y la bitácora.
const CUERPO = { nombreUsuario: 'vitest-cuerpo' };

const login = () => request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json');

const conRelleno = (bytes) => ({ ...CUERPO, relleno: 'a'.repeat(bytes) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/auth/login · cuerpo de la solicitud', () => {
  it.each([
    ['br', zlib.brotliCompressSync],
    ['gzip', zlib.gzipSync],
  ])('un cuerpo comprimido con %s responde 415 CODIFICACION_NO_ADMITIDA', async (codificacion, comprimir) => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Sin serialize, supertest convierte el Buffer a JSON con Content-Type JSON y no manda los bytes comprimidos.
    const res = await login()
      .set('Content-Encoding', codificacion)
      .serialize((bytes) => bytes)
      .send(comprimir(Buffer.from(JSON.stringify(CUERPO))));

    expect(res.status).toBe(415);
    expect(res.body.error.codigo).toBe('CODIFICACION_NO_ADMITIDA');
    expect(consola).not.toHaveBeenCalled();
  });

  it('un cuerpo de más de 1 MB responde 413 CUERPO_DEMASIADO_GRANDE', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await login().send(JSON.stringify(conRelleno(1024 * 1024 + 1)));

    expect(res.status).toBe(413);
    expect(res.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
    expect(consola).not.toHaveBeenCalled();
  });

  it('un cuerpo de unos 200 KB pasa la lectura y responde 400 ENTRADA_INVALIDA', async () => {
    const res = await login().send(JSON.stringify(conRelleno(200 * 1024)));

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('un cuerpo normal sin comprimir responde 400 ENTRADA_INVALIDA', async () => {
    const res = await login().send(JSON.stringify(CUERPO));

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });
});
