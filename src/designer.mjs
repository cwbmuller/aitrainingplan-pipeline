// Step 2: ONE designer call. Returns strict JSON for a seven-day week.
import { gemini, parseJson } from './llm.mjs';
import { digest } from './principles.mjs';

export const DESIGNER_MODEL = process.env.DESIGNER_MODEL || 'gemini-3.6-flash';

const SCHEMA = `{
  "week_summary": string,
  "days": [ { "day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun",
              "type": "easy"|"long"|"tempo"|"intervals"|"strength"|"mobility"|"rest",
              "intensity": "rest"|"easy"|"moderate"|"hard",
              "minutes": number,
              "title": string,
              "purpose": string,
              "structure": string } ]  // exactly 7 entries, Mon..Sun in order
}`;

export function designerSystem() {
  return `You are an endurance and strength coach who writes one week of structured training at a time.
Follow these principles exactly:
${digest()}
Return ONLY JSON matching this shape:
${SCHEMA}
Rest days: type "rest", intensity "rest", minutes 0. Keep "structure" concrete (e.g. "10 min easy, 6 x 3 min at threshold with 2 min jog, 10 min easy").`;
}

export async function design(contract, { revisionOf = null, violations = [] } = {}) {
  const user = revisionOf
    ? `Revise this week so that EVERY violation below is fixed. Return the COMPLETE revised week, not a patch.\n\nCONTRACT:\n${JSON.stringify(contract, null, 2)}\n\nPREVIOUS WEEK:\n${JSON.stringify(revisionOf, null, 2)}\n\nVIOLATIONS:\n${violations.map((v) => `- [${v.severity}] ${v.rule}: ${v.detail}`).join('\n')}`
    : `CONTRACT:\n${JSON.stringify(contract, null, 2)}\n\nDesign next week.`;
  const r = await gemini({ model: DESIGNER_MODEL, system: designerSystem(), user });
  return { plan: parseJson(r.text, 'designer'), call: r };
}
