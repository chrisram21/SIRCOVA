const URL_OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const MODELO_CHAT = process.env.OLLAMA_MODELO ?? 'llama3.2:3b';
export const MODELO_EMBEDDINGS = process.env.OLLAMA_MODELO_EMBEDDINGS ?? 'bge-m3';

async function pedir(ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(`${URL_OLLAMA}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error(`No se pudo conectar con Ollama en ${URL_OLLAMA}. ¿Está abierto?`);
  }
  if (!respuesta.ok) {
    throw new Error(`Ollama respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  return respuesta;
}

export async function embeber(textos) {
  const respuesta = await pedir('/api/embed', { model: MODELO_EMBEDDINGS, input: textos });
  const { embeddings } = await respuesta.json();
  return embeddings;
}

export async function conversar(mensajes, { herramientas } = {}) {
  const respuesta = await pedir('/api/chat', {
    model: MODELO_CHAT,
    messages: mensajes,
    tools: herramientas,
    stream: false,
    options: { temperature: 0.2, num_ctx: 8192 },
  });
  const { message } = await respuesta.json();
  return message;
}
