# Render Workflows — design note (not wired into the live demo)

**Status: design-only.** Nothing in `tee/`, `tistu/js/app.js`, `contracts/`, or `render.yaml`
has been changed by this note. HELIX's demo-critical path (`POST /compile` → Risk Guardian
flags → `predict::mint` via wallet signature) still runs exactly as documented in
[`DEPLOYMENT.md`](DEPLOYMENT.md) and `CLAUDE.md` §4 — a single Render web service
(`helix-compiler`) answering synchronous HTTP requests. That stays untouched; this document
only records how Render Workflows *could* extend HELIX after the hackathon, and answers the
submission-form questions about it honestly.

## What Render Workflows is

[Render Workflows](https://render.com/blog/durability-as-code-introducing-render-workflows)
(public beta) is a managed runtime for durable, multi-step background processes — the kind of
thing you'd otherwise reach for Temporal/Inngest for. You define **tasks** with the Render SDK;
each task gets its own retry count, timeout, and compute plan, and tasks chain sequentially or
run in parallel. Render owns the queue, the retry/backoff logic, state persistence across
restarts, and a unified log/trace dashboard. You deploy the task definitions as a *Workflow
service* and trigger runs from your app, the Render API, or the dashboard.

```typescript
// illustrative SDK shape, per Render's docs — not present in this repo
const compileTask = new Workflow().task("compile", async (input) => { ... }, {
  retries: 3, timeout: 30, compute: "starter",
});
await workflowClient.trigger("compile", { conviction: "..." });
```

## Did HELIX use it?

**No.** HELIX's `/compile` call is a single synchronous HTTP request (conviction in →
structure/DNA/payoff/Greeks out, typically sub-second) handled inline by the `helix-compiler`
Render web service. There was no multi-step, retry-needing, long-running process on the
demo's critical path that durable orchestration would improve — adding a Workflow there would
be infrastructure for its own sake, which is exactly what `CLAUDE.md` §0 and §5 tell us to avoid
under hackathon time pressure ("everything else is upside that must never delay it").

## Where it would actually earn its keep (future work, not built)

If HELIX grows past the hackathon demo, the parts of the pipeline that are naturally multi-step
and retriable — and therefore a legitimate fit for Render Workflows — are:

1. **`compile` → `risk-guardian-check` → `walrus-archive`** — compiling a structure, running the
   ≥2 risk-class checks (SVI staleness, PLP utilization, expiry proximity), then archiving the
   backtest/attestation bundle to Walrus (`tee/src/shared/mockWalrus.ts` → real Walrus per
   `CLAUDE.md` §7). Today this is two synchronous calls plus a fire-and-forget upload; as a
   Workflow each step would retry independently instead of forcing the user to re-submit on a
   transient Walrus 5xx.
2. **Performance-fee accrual sweeps** (`marketplace::route_performance_fee`) — a periodic
   multi-strategy batch job is exactly the "billing flow" shape Render Workflows targets,
   instead of a hand-rolled cron + manual retry loop.
3. **Regime reclassification + hedger rebalancing** (`tee/src/regime`, `tee/src/hedger`) — a
   longer-running, chained background process that would benefit from per-step timeouts and
   Render's parallel execution across containers if HELIX ever supports many concurrent
   strategies.

None of these exist yet. They're recorded here as the honest answer to "how would you use it,"
not as a built feature.

## Render Workflows Fit: HELIX Pipeline Boundary

HELIX is currently deployed on Render as a live web service. The demo-critical path stays
intentionally simple and reliable:

`user conviction → /compile → Risk Guardian flags → wallet-signed mint`

That path is the exact orchestration boundary that maps naturally onto Render Workflows.

A Render Workflow version of HELIX would split the same pipeline into durable, observable
steps:

1. **compile-conviction**
   Parse the user's market conviction and produce the structured HELIX output: structure, DNA,
   payoff, Greeks, and execution intent.

2. **guardian-check**
   Run Risk Guardian checks such as volatility/staleness flags, expiry proximity, utilization
   warnings, and unsafe payoff conditions.

3. **mint-preparation**
   Prepare the final user-facing mint payload for Sui / DeepBook Predict. The user still signs
   the transaction — the workflow only prepares and verifies the execution intent.

4. **attestation/archive**
   Store or emit an attestation bundle containing the input hash, compiled structure, guardian
   result, timestamp, and package metadata.

Why this fits Render Workflows:

* each stage is independently retryable;
* a failed guardian or archive step shouldn't force the user to recompute the whole conviction;
* per-task logs and traces make the agent pipeline easier for a judge to follow and debug;
* future long-running jobs — strategy monitoring, risk refresh, performance-fee sweeps — can
  reuse the same workflow pattern instead of bespoke cron/retry glue.

For the hackathon build, HELIX keeps the synchronous `/compile` path for demo reliability. This
document identifies the concrete Render Workflow boundary without changing core contract logic
or the live mint flow.

## Submission-form answers

**"If you have used Render Workflows to build your project, explain how you used it in
detail"** — We did not use Render Workflows in the build. HELIX deploys via a standard Render
Blueprint (`render.yaml`) running the TEE compiler as one synchronous web service; the demo's
critical path has no multi-step/retriable process that would benefit from durable
orchestration. See "Where it would actually earn its keep" above for where we'd adopt it next.

**"Link to social posts for Render Workflows projects"** — Not applicable; per the above, we're
not claiming the Render Workflows track for this submission.
