# aitrainingplan-pipeline

A multi-step agentic workflow for [aitrainingplan.app](https://aitrainingplan.app). An athlete's goal, availability and last four weeks of training go in, and a certified week of structured workouts comes out as JSON, Markdown and an `.ics` file you can drop straight into a calendar. Zero dependencies, Node 22, plain ESM. It follows the same shape as the coach generator in my own fitness app, cut down to what I could build in the timed window for the We The Flywheel assessment.

Browse the outputs at [cwbmuller.github.io/aitrainingplan-pipeline](https://cwbmuller.github.io/aitrainingplan-pipeline/) (a static viewer in `index.html` that reads the `out/` files). Sample output: [cyclist-taper plan](out/cyclist-taper/plan.md), its [run log](out/cyclist-taper/run-log.json), and the [rule proof](out/cyclist-taper/recertify-first-pass.json) from the taper fix below. The Sunday cron regenerates these demo fixtures, so Marco stays 9 days out every week.

## The seven steps

Every model call is logged with latency and token usage, and the whole trail ends up in `out/<athlete>/run-log.json`.

1. **Contract** (`src/contract.mjs`, deterministic, no model). Takes the athlete JSON and returns a typed contract. The arithmetic lives here because models are bad at it: `max_weekly_minutes` is the minimum of a 10% progression cap over the 4-week average, 70% of peak if the athlete is tapering (14 days or fewer to the event), and the hours they actually have. Beginners under 90 min/week get a flat +60 minutes instead of 10%.
2. **Designer** (`src/designer.mjs`, one Gemini call, `gemini-3.6-flash`, JSON mode). Reads the written principles plus the contract and returns a full seven-day week. The same function handles the revision pass later.
3. **Certifier** (`src/certify.mjs`, deterministic). Pure code checks on the week: shape, the progression cap, at least one rest day, max hard sessions, no back-to-back hard days, longest session at most 35% of the week and at most 115% of the athlete's recent longest, only the days they said they have, sport-match heuristics (one easy cross-training day at most), the taper hard-session cap, and now a taper long-session cap (see the gap section below). Each violation is hard or soft. Hard blocks publishing, soft gets logged next to the plan.
4. **Revision** (same designer, one pass). If certify #1 has hard violations, the designer gets the contract, the previous week and the violation list, and regenerates the complete week.
5. **Fallback** (`src/fallback.mjs`, deterministic). If the revised week still has hard violations, a conservative template week is built from the contract and certified again. It's deliberately boring because its only job is to pass certification.
6. **Judge** (`src/judge.mjs`, cross-vendor, OpenAI `gpt-5-mini`). Advisory only. Returns ship/tweak/reject, a 1 to 5 score and a coach's-eye paragraph. If OpenAI fails it falls back to `gemini-3.1-flash-lite` and the log records that the judge ran on the same vendor as the designer.
7. **Publish** (`src/publish.mjs`). Writes `out/<athlete>/plan.json`, `plan.md`, `plan.ics` and `run-log.json`. `run.mjs` throws rather than publish a week with a hard violation, even after the fallback.

The recurring piece is `.github/workflows/weekly.yml`, a Sunday cron that regenerates every athlete with `--all` and commits the outputs. The job is skipped entirely if the repo has no API secrets, so it never half-runs.

## Running it

You need `GEMINI_API_KEY` and `OPENAI_API_KEY` in the environment. There's no dotenv loading (zero deps), so either export them or keep them in a `.env` (already gitignored) and source it first.

```bash
node src/run.mjs --all
node src/run.mjs athletes/cyclist-taper.json
node src/run.mjs --certify-only athletes/cyclist-taper.json   # re-certify the existing out/ plan, no model calls
```

Three hand-written fixtures live in `athletes/`: `marathon-10wk` (Thandi, ten weeks out with an achilles niggle), `cyclist-taper` (Marco, a gran fondo 9 days out) and `gym-beginner` (Priya, dumbbells only).

## Design decisions

- **The principles are one document with two consumers.** `src/principles.mjs` is nine written rules. The designer gets them in its system prompt as intent, and the certifier enforces the ones that can be expressed as code (injury notes stay advisory). Keeping them in one file makes drift between prompt and checks easy to spot.
- **One designer call.** I've run the two-engines-and-merge version of this before. It doubled cost and latency and the plans weren't any better, so this runs one.
- **Deterministic gates, advisory judge.** Only the certifier decides whether a week ships. LLM-as-judge is non-deterministic, and you can't test a gate you can't reproduce, so the judge's verdict is logged beside the plan and never blocks it.
- **Repair regenerates the whole week.** Patching one day breaks the constraints on its neighbours (move a hard session and you've probably created a back-to-back), so the revision asks for a complete week with the violation list as input.
- **A deterministic fallback.** A template week built from the contract when the model misses twice. It isn't a guarantee: an athlete with only two available days can't satisfy the 35% longest-session rule, and in that case the run refuses to publish.
- **Refuse rather than publish dirty.** If the fallback somehow fails certification too, `run.mjs` throws. Nothing with a hard violation lands in `out/`.

## Where it broke

First real run was 13 Sep 2026. All three athletes certified clean on the first designer pass, 11 to 18 s per designer call and 10 to 16 s per judge call, and the judge said "tweak, 4/5" on all three.

On `cyclist-taper` the judge caught something the certifier missed. Marco is 9 days out. The designer gave him a 120-minute outdoor long ride on Saturday, 3 to 4 days before the event. The certifier passed it because the taper rule only capped total weekly volume (70% of peak) and hard sessions (one). It said nothing about the longest session, and against a recent longest of 240 min a 120 min ride clears every general check. The judge flagged residual fatigue risk and said to trim it to 60 to 90 minutes.

The fix went in three places. A hard certifier rule: when tapering, the longest session must be at most min(90 min, 50% of the recent longest session). A soft rule that nothing inside the final 7 days runs past 90 minutes. And one sentence in the principles so the designer reads the same intent the certifier now enforces. The fallback template needed the same cap too, because for Marco it would have built a 138 min long ride and failed its own certifier.

What actually happened on the re-run surprised me a little. I expected designer, certify #1 hard violation, revision, certify #2 clean. Instead the designer read the new principle and came back compliant on the first pass: Saturday dropped to 90 min, the week total to 285 min against a 420 cap, certify #1 clean, judge still "tweak, 4/5". So the revision path never fired. To prove the rule does what it says, `out/cyclist-taper/recertify-first-pass.json` runs the new certifier over the original 13 Sep plan and over the re-run plan with no model calls: the old plan fails hard with `taper: longest session 120 min exceeds cap 90 (min of 90 and 50% of recent longest 240)`, the new one passes. The live trace is in `out/cyclist-taper/run-log.json`.

The re-run also shook out a judge bug. gpt-5-mini took "prose first" in the judge prompt literally and wrapped its answer as `{ prose, JSON: {...} }`, so plan.md shipped with `undefined (undefined/5)`. The prompt now asks for one top-level object and `judge.mjs` unwraps a nested verdict if one shows up anyway.

One break that had nothing to do with the pipeline: the very first run failed on every athlete with `API_KEY_INVALID`. The key was being read from an env file with `head -1` and came back as a 5-character fragment. `tail -1` plus stripping the quotes fixed it. That one was plumbing on my side, the agent chain never got a chance to run.

## What I didn't build

- Strava or Garmin import. The three fixtures are hand-written.
- An adherence loop, where completed vs planned feeds next week's contract. That loop is what would make it adapt.
- A coach-rated golden set to score the judge against.
- A per-run cost cap.
- Multi-week periodisation. This is one week at a time.
- A UI.
