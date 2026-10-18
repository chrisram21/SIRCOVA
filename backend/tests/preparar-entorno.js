import path from 'node:path';
import { afterAll } from 'vitest';

process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'));

afterAll(async () => {
  const { default: pool } = await import('../src/config/mysql.js');
  const { cliente } = await import('../src/config/mongodb.js');
  await Promise.allSettled([pool.end(), cliente.close()]);
});
