// NEAR AI Cloud calls for the web API (Ask Blu, ELI5).
import './env.mjs';

const API = process.env.NEAR_AI_BASE || 'https://cloud-api.near.ai/v1';
// fast, non-reasoning model in a NEAR AI enclave (chat should feel instant)
export const CHAT_MODEL = process.env.ASKBLU_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

export async function chat(messages, { model = CHAT_MODEL, temperature = 0.3, maxTokens = 4000 } = {}) {
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) throw new Error('NEAR_AI_API_KEY is not set');
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-no-aliasing': 'true' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(55_000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`NEAR AI ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const text = String(j.choices?.[0]?.message?.content || '').replace(/^[\s\S]*<\/think>/, '').trim();
  return { text, id: j.id, model };
}

/** First JSON object in a model reply. */
export function firstJson(text) {
  const start = text.indexOf('{');
  for (let end = text.length; start >= 0 && end > start; end--) {
    try { return JSON.parse(text.slice(start, end)); } catch { /* shrink */ }
  }
  return null;
}
