// Step 3: deterministic certification. Pure code. The model never grades itself here.
import { DAY_ORDER } from './contract.mjs';

const HARD = 'hard', SOFT = 'soft';
const v = (severity, rule, detail) => ({ severity, rule, detail });

export function certify(plan, contract) {
  const out = [];
  const days = Array.isArray(plan?.days) ? plan.days : null;
  if (!days || days.length !== 7) return [v(HARD, 'shape', `expected 7 days, got ${days ? days.length : 'none'}`)];
  days.forEach((d, i) => {
    if (!d || typeof d !== 'object') { out.push(v(HARD, 'shape', `day ${i} is not an object`)); return; }
    if (d.day !== DAY_ORDER[i]) out.push(v(HARD, 'shape', `day ${i} should be ${DAY_ORDER[i]}, got ${d.day}`));
    if (typeof d.minutes !== 'number' || d.minutes < 0) out.push(v(HARD, 'shape', `${d.day}: minutes must be a non-negative number`));
    if (d.type === 'rest' && d.minutes > 0) out.push(v(HARD, 'shape', `${d.day}: rest day with ${d.minutes} minutes`));
    if (d.type !== 'rest' && d.minutes === 0) out.push(v(HARD, 'shape', `${d.day}: ${d.type} session with 0 minutes`));
    if (!d.purpose) out.push(v(SOFT, 'one-job', `${d.day}: missing purpose`));
  });
  if (out.some((x) => x.rule === 'shape')) return out;

  const total = days.reduce((a, d) => a + d.minutes, 0);
  const active = days.filter((d) => d.type !== 'rest' && d.minutes > 0);
  const rest = days.filter((d) => d.type === 'rest' || d.minutes === 0);
  const hard = days.filter((d) => d.intensity === 'hard');

  if (total > contract.max_weekly_minutes) out.push(v(HARD, 'progression', `week totals ${total} min, cap is ${contract.max_weekly_minutes}`));
  if (total < Math.round(contract.max_weekly_minutes * 0.6) && contract.recent_avg_minutes > 0 && !contract.taper)
    out.push(v(SOFT, 'progression', `week totals ${total} min, well under the ${contract.max_weekly_minutes} available; under-training`));
  if (rest.length < 1) out.push(v(HARD, 'rest', 'no rest day'));
  if (hard.length > contract.max_hard_sessions) out.push(v(HARD, 'hard-days', `${hard.length} hard sessions, max ${contract.max_hard_sessions}`));
  for (let i = 1; i < 7; i++) if (days[i].intensity === 'hard' && days[i - 1].intensity === 'hard')
    out.push(v(HARD, 'hard-days', `${days[i - 1].day} and ${days[i].day} are both hard`));
  const longest = Math.max(...days.map((d) => d.minutes));
  if (total > 0 && longest > total * 0.35 + 1) out.push(v(HARD, 'long-session', `longest session ${longest} min is ${Math.round((longest / total) * 100)}% of the week (max 35%)`));
  if (contract.longest_recent_session_minutes > 0 && longest > Math.round(contract.longest_recent_session_minutes * 1.15))
    out.push(v(HARD, 'long-session', `longest session ${longest} min exceeds ${Math.round(contract.longest_recent_session_minutes * 1.15)} (recent longest + 15%)`));
  for (const d of active) if (!contract.days_available.includes(d.day)) out.push(v(HARD, 'days', `${d.day} is not an available day`));
  const cross = active.filter((d) => /swim|bike|cycl|run|row|hike|yoga/i.test(d.title + ' ' + d.structure) && !matchesSport(d, contract.sport));
  if (cross.length > 1) out.push(v(HARD, 'sport-match', `${cross.length} cross-training days (${cross.map((d) => d.day).join(', ')}); max one`));
  for (const d of cross) if (d.intensity !== 'easy') out.push(v(HARD, 'sport-match', `${d.day}: cross-training must be easy`));
  if (contract.taper && hard.length > 1) out.push(v(HARD, 'progression', `taper week with ${hard.length} hard sessions`));
  if (contract.taper) {
    const cap = taperLongCap(contract);
    if (longest > cap)
      out.push(v(HARD, 'taper', `taper: longest session ${longest} min exceeds cap ${cap} (min of 90 and 50% of recent longest ${contract.longest_recent_session_minutes})`));
    if (contract.days_out !== null && contract.days_out <= 7 && longest > 90)
      out.push(v(SOFT, 'taper', `taper: event is ${contract.days_out} days out; longest session ${longest} min should not exceed 90 in the final 7 days`));
  }
  return out;
}

function matchesSport(d, sport) {
  const s = (d.title + ' ' + d.structure + ' ' + d.type).toLowerCase();
  if (sport === 'running') return /run|jog|tempo|interval|strides|easy|long|rest|mobility|strength/.test(s) && !/bike|cycl|swim|row/.test(s);
  if (sport === 'cycling') return /ride|bike|cycl|trainer|spin|interval|tempo|easy|long|rest|mobility|strength/.test(s) && !/\brun\b|jog|swim|row/.test(s);
  if (sport === 'gym') return /strength|lift|dumbbell|press|squat|row|hinge|mobility|rest|circuit|core/.test(s) && !/\brun\b|bike|cycl|swim/.test(s);
  return true;
}

export const hardViolations = (list) => list.filter((x) => x.severity === HARD);

// Taper long-session cap: half of the recent longest, never above 90. Shared with the fallback so the template can't trip it.
export const taperLongCap = (contract) =>
  contract.longest_recent_session_minutes > 0 ? Math.min(90, Math.round(contract.longest_recent_session_minutes * 0.5)) : 90;
