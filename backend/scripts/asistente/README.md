# Asistente SIRCOVA (práctica de agentes con Ollama)

Práctica extracurricular: un agente de consola con RAG sobre la documentación del proyecto. No forma parte del sistema, no tiene interfaz y **no escribe en ninguna base de datos**.

## Requisitos

- Ollama abierto en `http://localhost:11434` con los modelos `llama3.2:3b` (chat) y `bge-m3` (embeddings):
  `ollama pull llama3.2:3b` y `ollama pull bge-m3`.
- Se pueden cambiar con `OLLAMA_URL`, `OLLAMA_MODELO` y `OLLAMA_MODELO_EMBEDDINGS`.

## Uso (desde `backend/`)

```bash
node scripts/asistente/indexar.js                       # crea indice-rag.json (una vez)
node scripts/asistente/preguntar.js "¿Qué roles tiene el sistema?"
node scripts/asistente/preguntar.js                     # modo interactivo
```

## Cómo funciona

1. `indexar.js` parte en fragmentos el contexto del proyecto, las historias de usuario y la descripción de las pantallas, calcula sus embeddings con `bge-m3` y los guarda en `indice-rag.json` (ignorado por git).
2. `rag.js` calcula el embedding de la pregunta y devuelve los 4 fragmentos más parecidos (similitud coseno).
3. `preguntar.js` arma el system prompt con esos fragmentos y llama a `/api/chat` de Ollama.

## Herramienta con datos reales

`herramientas.js` define `consultar_reportes_por_estado(anio, mes)`, que cuenta los reportes de la DDRISS (`ASISTENTE_DDRISS`, por defecto `DDRISS_SM`) por estado en un mes. Lee MySQL con las credenciales de `backend/.env`, en una transacción `READ ONLY`: no escribe nada. Por eso se corre con `--env-file`:

```bash
node --env-file=.env scripts/asistente/preguntar.js "¿Cuántos reportes hay en cada estado en septiembre de 2026?"
```

La consola muestra `[herramienta] …` con los argumentos que eligió el modelo y el resultado de la consulta.

## Streaming

Una primera llamada sin streaming decide si hace falta la herramienta; la respuesta final se pide con `stream: true` (`conversarEnStreaming` en `ollama.js`) y cada trozo se escribe en la consola en cuanto llega. Con `--ver-trozos` cada trozo sale en su propia línea con los milisegundos transcurridos:

```bash
node --env-file=.env scripts/asistente/preguntar.js --ver-trozos "¿Qué hace la estadígrafa en el sistema?"
```
