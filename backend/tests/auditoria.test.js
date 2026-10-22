import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import pool, { enTransaccion } from '../src/config/mysql.js';
import {
  registrarBitacora,
  diferencias,
  contextoAuditoria,
} from '../src/modulos/auditoria/auditoria.service.js';

const ENTIDAD = 'prueba_auditoria';

async function filasDe(entidadId) {
  const [filas] = await pool.query(
    'SELECT * FROM bitacora WHERE entidad = ? AND entidad_id = ?',
    [ENTIDAD, entidadId],
  );
  return filas;
}

const datosBase = (entidadId) => ({
  modulo: 'SISTEMA',
  accion: 'CREAR',
  entidad: ENTIDAD,
  entidadId,
});

describe('registrarBitacora', () => {
  it('con un módulo desconocido lanza un error y no escribe la fila', async () => {
    const entidadId = randomUUID();

    await expect(registrarBitacora(pool, { ...datosBase(entidadId), modulo: 'INVENTADO' }))
      .rejects.toThrow('Módulo de bitácora desconocido');

    expect(await filasDe(entidadId)).toHaveLength(0);
  });

  it('con una acción desconocida lanza un error y no escribe la fila', async () => {
    const entidadId = randomUUID();

    await expect(registrarBitacora(pool, { ...datosBase(entidadId), accion: 'CERAR' }))
      .rejects.toThrow('Acción de bitácora desconocida');

    expect(await filasDe(entidadId)).toHaveLength(0);
  });

  it('quita los campos sensibles en cualquier nivel y conserva debeCambiarContrasena', async () => {
    const entidadId = randomUUID();

    await registrarBitacora(pool, {
      ...datosBase(entidadId),
      valoresAnteriores: { Hash_Contrasena: 'x', nombre: 'Ana' },
      valoresNuevos: {
        nombre: 'Ana',
        contrasena: 'secreta',
        debeCambiarContrasena: true,
        sesion: { token: 'abc', expira: '2026-10-20' },
        cuentas: [{ hash_contrasena: 'h1', usuario: 'ana' }, { contrasenaNueva: 'n', usuario: 'ana2' }],
      },
    });

    const [fila] = await filasDe(entidadId);
    expect(fila.valores_anteriores).toEqual({ nombre: 'Ana' });
    expect(fila.valores_nuevos).toEqual({
      nombre: 'Ana',
      debeCambiarContrasena: true,
      sesion: { expira: '2026-10-20' },
      cuentas: [{ usuario: 'ana' }, { usuario: 'ana2' }],
    });
  });

  it('quita la contraseña temporal generada (SPEC 10)', async () => {
    const entidadId = randomUUID();

    await registrarBitacora(pool, {
      ...datosBase(entidadId),
      valoresNuevos: { nombreUsuario: 'ana', contrasenaTemporal: 'Hk7pQ2xYz9AbCdEf', usuario: { contrasena_temporal: 'x' } },
    });

    const [fila] = await filasDe(entidadId);
    expect(fila.valores_nuevos).toEqual({ nombreUsuario: 'ana', usuario: {} });
  });
});

describe('diferencias', () => {
  it('devuelve solo las claves que cambiaron', () => {
    const antes = { nombre: 'Ana', activo: true, roles: ['DIGITADOR'], alta: new Date('2026-01-01') };
    const despues = { nombre: 'Ana María', activo: true, roles: ['DIGITADOR'], alta: new Date('2026-01-01') };

    expect(diferencias(antes, despues)).toEqual({
      anteriores: { nombre: 'Ana' },
      nuevos: { nombre: 'Ana María' },
    });
  });

  it('devuelve null si no cambió nada', () => {
    expect(diferencias({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBeNull();
  });

  it('detecta una clave nueva y una que pasó a null', () => {
    expect(diferencias({ a: 1, b: 'x' }, { a: 1, b: null, c: 5 })).toEqual({
      anteriores: { b: 'x', c: null },
      nuevos: { b: null, c: 5 },
    });
  });

  it('detecta una lista que cambió', () => {
    expect(diferencias({ roles: ['A'] }, { roles: ['A', 'B'] })).toEqual({
      anteriores: { roles: ['A'] },
      nuevos: { roles: ['A', 'B'] },
    });
  });
});

describe('contextoAuditoria', () => {
  const peticion = (extra) => ({
    ip: '10.0.0.7',
    get: (cabecera) => (cabecera === 'user-agent' ? 'vitest-sircova' : undefined),
    ...extra,
  });

  it('lee usuario, IP y agente de la petición', () => {
    expect(contextoAuditoria(peticion({ usuario: { id: 42 } }))).toEqual({
      usuarioId: 42,
      ipOrigen: '10.0.0.7',
      agenteUsuario: 'vitest-sircova',
    });
  });

  it('sin req.usuario ni agente deja usuarioId y agenteUsuario en null', () => {
    expect(contextoAuditoria(peticion({ get: () => undefined }))).toEqual({
      usuarioId: null,
      ipOrigen: '10.0.0.7',
      agenteUsuario: null,
    });
  });
});

describe('enTransaccion', () => {
  afterEach(() => vi.restoreAllMocks());

  // Envuelve getConnection para saber si la conexión que entregó se liberó.
  function espiarConexion() {
    const original = pool.getConnection.bind(pool);
    const espia = { release: null };
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const conexion = await original();
      espia.release = vi.spyOn(conexion, 'release');
      return conexion;
    });
    return espia;
  }

  it('confirma la fila escrita dentro de la transacción y devuelve el resultado de fn', async () => {
    const entidadId = randomUUID();
    const espia = espiarConexion();

    const resultado = await enTransaccion(async (conexion) => {
      await registrarBitacora(conexion, datosBase(entidadId));
      return 'listo';
    });

    expect(resultado).toBe('listo');
    expect(await filasDe(entidadId)).toHaveLength(1);
    expect(espia.release).toHaveBeenCalledTimes(1);
  });

  it('si fn lanza después de escribir, revierte la fila y el error llega a quien llamó', async () => {
    const entidadId = randomUUID();
    const espia = espiarConexion();

    await expect(enTransaccion(async (conexion) => {
      await registrarBitacora(conexion, datosBase(entidadId));
      throw new Error('falla después de escribir');
    })).rejects.toThrow('falla después de escribir');

    expect(await filasDe(entidadId)).toHaveLength(0);
    expect(espia.release).toHaveBeenCalledTimes(1);
  });
});
