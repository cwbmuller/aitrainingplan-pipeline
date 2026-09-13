// Step 5b: deterministic fallback. Builds a conservative, certifiable week from templates.
// Deliberately boring. Its job is to never fail certification, not to be inspired.
import { DAY_ORDER } from './contract.mjs';
import { taperLongCap } from './certify.mjs';

const T = {
  running: { easy: ['Easy run', 'Conversational pace, nose-breathing effort'], long: ['Long run', 'Steady easy, last 10 min relaxed'], hard: ['Tempo run', '10 min easy, 20 min at comfortably-hard, 10 min easy'], strength: ['Runner strength', '3 rounds: split squat, single-leg RDL, calf raise, plank'] },
  cycling: { easy: ['Easy spin', 'Zone 2, high cadence'], long: ['Long ride', 'Zone 2 with 3 x 10 min steady climbs'], hard: ['Threshold ride', '15 min easy, 3 x 8 min at threshold with 4 min easy, 10 min easy'], strength: ['Cyclist strength', '3 rounds: goblet squat, hip hinge, step-up, side plank'] },
  gym: { easy: ['Mobility and core', '20 min mobility flow plus 3 x 10 dead bugs'], long: ['Full-body strength A', 'Dumbbell squat, bench press, row, RDL: 3 x 8-10, 90 s rest'], hard: ['Full-body strength B', 'Split squat, overhead press, bent-over row, hip thrust: 3 x 8-10'], strength: ['Full-body strength A', 'Dumbbell squat, bench press, row, RDL: 3 x 8-10, 90 s rest'] },
};

export function fallbackWeek(contract) {
  const t = T[contract.sport];
  const avail = DAY_ORDER.filter((d) => contract.days_available.includes(d));
  const budget = contract.max_weekly_minutes;
  const longCap = Math.min(Math.round(contract.longest_recent_session_minutes * 1.1) || 40, Math.floor(budget * 0.33), contract.taper ? taperLongCap(contract) : Infinity);
  // Order of fill: long on the last available day, one hard session mid-week (unless taper), rest easy.
  const longDay = avail[avail.length - 1];
  const hardDay = contract.max_hard_sessions > 0 ? avail[Math.max(0, Math.floor(avail.length / 2) - 1)] : null;
  const sessions = {};
  let remaining = budget;
  if (contract.sport !== 'gym') { sessions[longDay] = { ...mk(t.long, 'long', 'easy', longCap), }; remaining -= longCap; }
  if (hardDay && hardDay !== longDay) { const m = Math.min(40, Math.floor(remaining * 0.3)); sessions[hardDay] = mk(t.hard, contract.sport === 'gym' ? 'strength' : 'tempo', 'hard', m); remaining -= m; }
  const easyDays = avail.filter((d) => !sessions[d]);
  // Leave at least one rest day even if every weekday is available.
  const useEasy = easyDays.slice(0, Math.max(0, Math.min(easyDays.length, 7 - 1 - Object.keys(sessions).length)));
  const per = useEasy.length ? Math.max(20, Math.floor(remaining / useEasy.length)) : 0;
  for (const d of useEasy) { const m = Math.min(per, remaining); if (m < 20) break; sessions[d] = mk(contract.sport === 'gym' ? t.strength : t.easy, contract.sport === 'gym' ? 'strength' : 'easy', contract.sport === 'gym' ? 'moderate' : 'easy', m); remaining -= m; }
  return {
    week_summary: `Conservative template week (deterministic fallback): ${Object.keys(sessions).length} sessions, ${budget - remaining} min.`,
    days: DAY_ORDER.map((day) => sessions[day] ? { day, ...sessions[day] } : { day, type: 'rest', intensity: 'rest', minutes: 0, title: 'Rest', purpose: 'recovery', structure: 'Full rest' }),
  };
}
const mk = ([title, structure], type, intensity, minutes) => ({ type, intensity, minutes, title, purpose: type === 'long' ? 'aerobic endurance' : type === 'tempo' ? 'threshold' : type === 'strength' ? 'strength' : 'easy aerobic', structure });
