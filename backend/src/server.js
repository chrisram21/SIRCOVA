
const app = require('./app');

const PUERTO = Number(process.env.PORT) || 3000;

const servidor = app.listen(PUERTO, () => {
  console.log('================================');
  console.log('       SIRCOVA - BACKEND       ');
  console.log('================================');
  console.log(`Servidor activo en puerto ${PUERTO}`);
  console.log(
    `API: http://localhost:${PUERTO}/api/v1`
  );
  console.log(
    `Health: http://localhost:${PUERTO}/api/v1/health`
  );
});

servidor.on('error', (error) => {
  console.error('Error al iniciar servidor:', error.message);
  process.exitCode = 1;
});
