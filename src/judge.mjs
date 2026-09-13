// Step 6: cross-vendor judge. ADVISORY. It never gates; it is logged next to the plan so
// disagreements between the certifier and a coach's eye become visible over time.
import { openai, gemini, parseJson } from './llm.mjs';

export const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-5-mini';

const SYSTEM = `You are an experienced endurance and strength coach reviewing one week of training written for a specific athlete.
Give a coach's-eye verdict. Prose first; the number is only for sorting.
Return JSON: { "verdict": "ship"|"tweak"|"reject", "overall": 1-5, "assessment": string (3-5 sentences), "top_fix": string }`;

export async function judge(plan, contract) {
  const user = `ATHLETE CONTRACT:\n${JSON.stringify(contract, null, 2)}\n\nWEEK:\n${JSON.stringify(plan, null, 2)}`;
  try {
    const r = await openai({ model: JUDGE_MODEL, system: SYSTEM, user });
    return { verdict: parseJson(r.text, 'judge'), call: r, vendor: 'openai' };
  } catch (e) {
    // Fall back to a different Gemini model so a judge always runs, and record that it was same-vendor.
    const r = await gemini({ model: 'gemini-3.1-flash-lite', system: SYSTEM, user });
    return { verdict: parseJson(r.text, 'judge'), call: r, vendor: 'gemini (fallback, same vendor as designer)', error: String(e.message) };
  }
}
