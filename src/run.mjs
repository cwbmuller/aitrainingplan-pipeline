// Orchestrator. contract -> design -> certify -> (revise -> certify) -> (fallback -> certify) -> judge -> publish.
// A plan NEVER publishes with a hard violation. Every stage is logged with latency and token usage.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContract } from './contract.mjs';
import { design, DESIGNER_MODEL } from './designer.mjs';
import { certify, hardViolations } from './certify.mjs';
import { fallbackWeek } from './fallback.mjs';
import { judge } from './judge.mjs';
import { publish } from './publish.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const certifyOnly = args.includes('--certify-only');
const outDir = resolve('out');
const files = all ? readdirSync('athletes').filter((f) => f.endsWith('.json')).map((f) => join('athletes', f)) : [args.find((a) => a.endsWith('.json')) ?? 'athletes/marathon-10wk.json'];

for (const file of files) {
  const athlete = JSON.parse(readFileSync(file, 'utf8'));
  const log = { athlete: athlete.id, designer_model: DESIGNER_MODEL, stages: [], calls: [], source: null, judge: null };
  const t0 = Date.now();
  try {
    const contract = buildContract(athlete);
    log.stages.push({ stage: 'contract', result: `ok · cap ${contract.max_weekly_minutes} min · max hard ${contract.max_hard_sessions}${contract.taper ? ' · taper' : ''}` });

    if (certifyOnly) { const plan = JSON.parse(readFileSync(join(outDir, athlete.id, 'plan.json'), 'utf8')).plan; console.log(athlete.id, certify(plan, contract)); continue; }

    // Model failures (API error, malformed JSON) must not skip recovery. They fall through to the deterministic fallback.
    let plan = null, violations = [];
    try {
      const d = await design(contract);
      plan = d.plan;
      log.calls.push(slim(d.call, 'designer'));
      violations = certify(plan, contract);
      log.stages.push({ stage: 'certify#1', result: fmt(violations) });
      log.source = 'designer, first pass';
    } catch (e) {
      log.stages.push({ stage: 'designer', result: `failed: ${e.message}` });
      violations = [{ severity: 'hard', rule: 'designer', detail: e.message }];
    }

    if (plan && hardViolations(violations).length) {
      try {
        const d = await design(contract, { revisionOf: plan, violations });
        plan = d.plan;
        log.calls.push(slim(d.call, 'revision'));
        violations = certify(plan, contract);
        log.stages.push({ stage: 'certify#2 (after revision)', result: fmt(violations) });
        log.source = 'designer + one revision';
      } catch (e) {
        log.stages.push({ stage: 'revision', result: `failed: ${e.message}` });
      }
    }

    if (hardViolations(violations).length) {
      plan = fallbackWeek(contract);
      violations = certify(plan, contract);
      log.stages.push({ stage: 'certify#3 (deterministic fallback)', result: fmt(violations) });
      log.source = 'deterministic fallback';
    }
    if (hardViolations(violations).length) throw new Error(`refusing to publish: fallback still has hard violations: ${fmt(violations)}`);

    // The judge is advisory, so if both vendors fail we record it and still publish the certified plan.
    try {
      const j = await judge(plan, contract);
      log.calls.push(slim(j.call, 'judge'));
      log.judge = { vendor: j.vendor, verdict: j.verdict, ...(j.error ? { error: j.error } : {}) };
      log.stages.push({ stage: 'judge (advisory)', result: `${j.verdict.verdict} ${j.verdict.overall}/5 via ${j.vendor}` });
    } catch (e) {
      log.judge = { vendor: 'none', verdict: null, error: e.message };
      log.stages.push({ stage: 'judge (advisory)', result: `failed, publishing without a verdict: ${e.message}` });
    }

    log.soft_violations = violations;
    log.total_ms = Date.now() - t0;
    const dir = publish({ contract, plan, log, outDir });
    log.stages.push({ stage: 'publish', result: dir });
    console.log(`\n${athlete.id}: ${log.source} · ${log.total_ms} ms`);
    for (const s of log.stages) console.log(`  ${s.stage}: ${s.result}`);
  } catch (e) {
    console.error(`\n${athlete.id}: FAILED · ${e.message}`);
    for (const s of log.stages) console.error(`  ${s.stage}: ${s.result}`);
    process.exitCode = 1;
  }
}

function fmt(v) { return v.length ? v.map((x) => `[${x.severity}] ${x.rule}: ${x.detail}`).join(' | ') : 'clean'; }
function slim(call, stage) { return { stage, model: call.model, ms: call.ms, usage: call.usage }; }
