import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('GET /api/v1/salud', () => {
  it('responde 200 con MySQL y MongoDB en ok', async () => {
    const res = await request(app).get('/api/v1/salud');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', mysql: 'ok', mongo: 'ok' });
  });
});
