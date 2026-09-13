// Thin fetch wrappers. No SDKs. Every call returns { text, ms, usage } and is logged by the caller.

export async function gemini({ model, system, user, json = true, apiKey = process.env.GEMINI_API_KEY }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  return { text, ms, usage: data.usageMetadata ?? null, model };
}

export async function openai({ model, system, user, apiKey = process.env.OPENAI_API_KEY }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`openai ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', ms, usage: data.usage ?? null, model };
}

export function parseJson(text, label) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(cleaned); } catch (e) { throw new Error(`${label}: model returned non-JSON: ${cleaned.slice(0, 200)}`); }
}
