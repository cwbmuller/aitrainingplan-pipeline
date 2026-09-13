// Step 1: intake -> typed contract. Deterministic. No model.
// If the contract can't be built we stop here with a clear reason rather than guess.

const SPORTS = new Set(['running', 'cycling', 'gym']);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildContract(athlete) {
  const problems = [];
  if (!SPORTS.has(athlete.sport)) problems.push(`sport must be one of ${[...SPORTS].join(', ')}`);
  if (!athlete.goal) problems.push('goal is required');
  if (!Array.isArray(athlete.last_4_weeks_minutes) || athlete.last_4_weeks_minutes.length !== 4)
    problems.push('last_4_weeks_minutes must have exactly four entries');
  if (!(athlete.weekly_hours_available > 0)) problems.push('weekly_hours_available must be > 0');
  const days = (athlete.days_available ?? []).filter((d) => DAYS.includes(d));
  if (days.length < 2) problems.push('need at least two available days');
  if (problems.length) throw new Error(`contract: ${problems.join('; ')}`);

  const history = athlete.last_4_weeks_minutes;
  const recentAvg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
  const peak = Math.max(...history);
  const daysOut = athlete.event_date_days_out ?? null;
  const taper = daysOut !== null && daysOut <= 14;

  // Progression budget: the arithmetic the model is bad at lives here, not in the prompt.
  // Beginners (avg < 90 min/wk) get an absolute allowance instead of a percentage.
  const progressionCap = recentAvg < 90 ? recentAvg + 60 : Math.round(recentAvg * 1.1);
  const taperCap = taper ? Math.round(peak * 0.7) : null;
  const availableCap = athlete.weekly_hours_available * 60;
  const maxWeeklyMinutes = Math.min(...[progressionCap, taperCap, availableCap].filter((n) => n !== null));

  return {
    athlete_id: athlete.id,
    name: athlete.name,
    sport: athlete.sport,
    goal: athlete.goal,
    days_out: daysOut,
    taper,
    days_available: days,
    history_minutes: history,
    recent_avg_minutes: recentAvg,
    peak_minutes: peak,
    longest_recent_session_minutes: athlete.longest_recent_session_minutes ?? 0,
    max_weekly_minutes: maxWeeklyMinutes,
    max_hard_sessions: taper ? 1 : 2,
    injuries: athlete.injuries ?? [],
    notes: athlete.notes ?? '',
  };
}

export const DAY_ORDER = DAYS;
