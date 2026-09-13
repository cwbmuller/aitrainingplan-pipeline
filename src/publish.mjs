// Step 7: publish. JSON for machines, Markdown for humans, ICS because the product promises a calendar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAY_ORDER } from './contract.mjs';

export function publish({ contract, plan, log, outDir }) {
  const dir = join(outDir, contract.athlete_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ contract, plan }, null, 2));
  writeFileSync(join(dir, 'plan.md'), toMarkdown(contract, plan, log));
  writeFileSync(join(dir, 'plan.ics'), toIcs(contract, plan));
  writeFileSync(join(dir, 'run-log.json'), JSON.stringify(log, null, 2));
  return dir;
}

function toMarkdown(c, p, log) {
  const total = p.days.reduce((a, d) => a + d.minutes, 0);
  const rows = p.days.map((d) => `| ${d.day} | ${d.type} | ${d.intensity} | ${d.minutes} | ${d.title} | ${d.purpose} | ${d.structure} |`).join('\n');
  const judge = log.judge && log.judge.verdict ? `\n## Coach's eye (advisory, ${log.judge.vendor})\n\n**${log.judge.verdict.verdict}** (${log.judge.verdict.overall}/5). ${log.judge.verdict.assessment}\n\nTop fix: ${log.judge.verdict.top_fix}\n` : '';
  return `# ${c.name}: next week (${c.sport})\n\nGoal: ${c.goal}${c.days_out !== null ? ` · ${c.days_out} days out${c.taper ? ' · TAPER' : ''}` : ''}\n\n${p.week_summary}\n\nTotal ${total} min (cap ${c.max_weekly_minutes}). Source: **${log.source}**.\n\n| Day | Type | Intensity | Min | Session | Purpose | Structure |\n|---|---|---|---|---|---|---|\n${rows}\n${judge}\n## Certification trail\n\n${log.stages.map((s) => `- ${s.stage}: ${s.result}`).join('\n')}\n`;
}

function toIcs(c, p) {
  const monday = nextMonday();
  const ev = p.days.map((d, i) => {
    if (d.type === 'rest' || d.minutes === 0) return '';
    const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + i);
    const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${c.athlete_id}-${ymd}@aitrainingplan`, `DTSTAMP:${ymd}T000000Z`, `DTSTART;VALUE=DATE:${ymd}`, `SUMMARY:${esc(d.title)} (${d.minutes} min)`, `DESCRIPTION:${esc(d.purpose)}\\n${esc(d.structure)}`, 'END:VEVENT'].join('\r\n');
  }).filter(Boolean).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//aitrainingplan-pipeline//EN', ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
const esc = (s) => String(s).replace(/[\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
function nextMonday() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); const add = ((8 - d.getUTCDay()) % 7) || 7; d.setUTCDate(d.getUTCDate() + add); return d; }
export { DAY_ORDER };
