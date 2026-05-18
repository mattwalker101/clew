# AGENTS.md Contract

`parseAgentsMd(content)` is the deterministic AGENTS.md extraction surface for clew runtime context. It reads local project guidance without executing skills, loading remote state, or treating AGENTS.md prose as workflow instructions.

The parsed result contains:

- `activeSkillIds`: unique skill ids listed under an `Active Skills` heading, in first-seen order.
- `preferences`: unique trimmed guidance lines containing preference keywords such as `prefer`, `avoid`, `must`, `should`, `local-first`, `deterministic`, or `explainable`, in first-seen order.

`getAgentsMdDiagnostics(content, registry)` compares active skill references with the current registry and returns `agents_diagnostic` warnings for unknown or disabled active skills. Diagnostics remain warnings only; they do not alter registry state or activation scoring.

`clew doctor` exposes AGENTS.md data as diagnostic context:

- `agentsDiagnostics` for AGENTS.md warning objects.
- `agentsPreferences` for extracted preference lines.
- combined `warnings` for backward-compatible consumers.

Registry rebuild warnings remain in `registryWarnings`. AGENTS.md diagnostics must not be persisted as registry rebuild warnings or added to telemetry output.

The executable fixture at `tests/fixtures/contracts/agents-md-contract.json` pins active-skill parsing, runtime preference extraction, deduplication, diagnostic warning shape, and diagnostic ordering.
