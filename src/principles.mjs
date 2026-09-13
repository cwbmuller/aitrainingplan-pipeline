// The written rules. The designer reads them as intent; the certifier enforces them as code.
// Same document, two consumers, so the prompt and the checks can't drift apart.

export const PRINCIPLES = [
  { id: 'progression', text: 'Weekly volume grows gradually. Never exceed the contract max_weekly_minutes; it already encodes a ~10% progression cap, taper, and available hours.' },
  { id: 'hard-days', text: 'At most max_hard_sessions hard sessions per week (intensity "hard"). Never schedule hard sessions on consecutive days.' },
  { id: 'rest', text: 'At least one full rest day. Rest is structural, not leftover.' },
  { id: 'long-session', text: 'The longest session is at most 35% of the weekly total and at most 15% longer than longest_recent_session_minutes.' },
  { id: 'one-job', text: 'Each session has exactly one physiological job (easy aerobic, long, tempo, intervals, strength, mobility, rest). Name it in "purpose".' },
  { id: 'sport-match', text: 'Sessions match the athlete sport. Cross-training is allowed only as "easy" and only on one day.' },
  { id: 'injuries', text: 'Respect every listed injury note literally.' },
  { id: 'days', text: 'Only schedule on days_available. Every other day is rest.' },
];

export const digest = () => PRINCIPLES.map((p) => `- ${p.id}: ${p.text}`).join('\n');
