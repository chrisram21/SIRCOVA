// Asistente de consola con RAG sobre la documentación de SIRCOVA.
// Uso: node scripts/asistente/preguntar.js "pregunta"   (sin pregunta abre un modo interactivo)
import readline from 'node:readline/promises';
import { buscar } from './rag.js';
import { conversar, MODELO_CHAT } from './ollama.js';

const SYSTEM_PROMPT = `Eres el asistente de SIRCOVA, el sistema web de producción de vacunación de la DDRISS San Marcos (MSPAS, Guatemala).
Respondes siempre en español, de forma breve y clara.
Usa solo la información del CONTEXTO que se te entrega; si no está ahí, di que no tienes esa información.
El sistema maneja solo datos agregados: nunca pidas ni inventes datos de pacientes.`;

function armarContexto(fragmentos) {
  return fragmentos.map((f, i) => `[${i + 1}] (${f.fuente} · ${f.titulo})\n${f.cuerpo}`).join('\n\n---\n\n');
}

async function responder(pregunta) {
  const fragmentos = await buscar(pregunta);
  console.log('\n[RAG] fragmentos recuperados:');
  for (const f of fragmentos) console.log(`  ${f.puntaje.toFixed(3)}  ${f.fuente} · ${f.titulo}`);

  const mensajes = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `CONTEXTO:\n${armarContexto(fragmentos)}\n\nPREGUNTA: ${pregunta}` },
  ];
  const respuesta = await conversar(mensajes);
  console.log(`\n[${MODELO_CHAT}]\n${respuesta.content}\n`);
}

async function principal() {
  const pregunta = process.argv.slice(2).join(' ').trim();
  if (pregunta) return responder(pregunta);

  const consola = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Asistente SIRCOVA (escribe "salir" para terminar)');
  for (;;) {
    const linea = (await consola.question('> ')).trim();
    if (linea === 'salir') break;
    if (linea) await responder(linea).catch((err) => console.error(err.message));
  }
  consola.close();
}

principal().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
