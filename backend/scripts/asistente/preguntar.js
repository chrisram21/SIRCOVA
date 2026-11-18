// Asistente de consola con RAG sobre la documentación de SIRCOVA.
// Uso: node scripts/asistente/preguntar.js "pregunta"   (sin pregunta abre un modo interactivo)
import readline from 'node:readline/promises';
import { buscar } from './rag.js';
import { conversar, MODELO_CHAT } from './ollama.js';
import { HERRAMIENTAS, ejecutarHerramienta } from './herramientas.js';

const MAXIMO_RONDAS_HERRAMIENTAS = 3;
const hoy = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });

const SYSTEM_PROMPT = `Eres el asistente de SIRCOVA, el sistema web de producción de vacunación de la DDRISS San Marcos (MSPAS, Guatemala).
Hoy es ${hoy}.
Respondes siempre en español, de forma breve y clara, con texto para el usuario y nunca con JSON.
Para preguntas sobre cómo funciona el sistema, usa solo la información del CONTEXTO; si no está ahí, di que no tienes esa información.
Para preguntas sobre cuántos reportes hay o en qué estado están en un mes, llama a la herramienta consultar_reportes_por_estado y responde con sus datos, sin inventar cifras.
El sistema maneja solo datos agregados: nunca pidas ni inventes datos de pacientes.

TEMA PROHIBIDO: la cobertura de vacunación (su cálculo, fórmula, metas, porcentajes, brechas de cobertura o comparaciones de cobertura).
Si la pregunta trata de cobertura, aunque el CONTEXTO tenga información sobre ella, NO la respondas, no llames herramientas y contesta exactamente:
"Lo siento, no puedo responder preguntas sobre cobertura de vacunación. Consulta el módulo de Indicadores o al Departamento de Epidemiología."
Cualquier otro tema del sistema se responde con normalidad.`;

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
  let respuesta = await conversar(mensajes, { herramientas: HERRAMIENTAS });
  for (let ronda = 0; respuesta.tool_calls?.length && ronda < MAXIMO_RONDAS_HERRAMIENTAS; ronda++) {
    mensajes.push(respuesta);
    for (const { function: llamada } of respuesta.tool_calls) {
      console.log(`\n[herramienta] ${llamada.name}(${JSON.stringify(llamada.arguments)})`);
      const resultado = await ejecutarHerramienta(llamada.name, llamada.arguments);
      console.log(`[herramienta] resultado: ${JSON.stringify(resultado)}`);
      mensajes.push({ role: 'tool', tool_name: llamada.name, content: JSON.stringify(resultado) });
    }
    respuesta = await conversar(mensajes, { herramientas: HERRAMIENTAS });
  }
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
