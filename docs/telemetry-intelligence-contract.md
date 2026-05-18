# Telemetry Intelligence Contract

`SkillRegistry.analyzeTelemetry(records?)` is the v0.2 explicit telemetry intelligence surface. It reports local registry telemetry as deterministic analysis data without changing canonical filesystem bundle semantics, running skills, or creating hidden activation.

The analysis result contains:

- `records`: known registry skills first, then orphan telemetry rows, each ordered by `skillId`.
- `known`: whether the row maps to a current registry skill.
- `enabled`: whether the row can participate in read and recommendation surfaces.
- `disabled`, `favorite`, `usageCount`, and optional `lastUsed`.
- `evidence`: explicit telemetry evidence rows for orphan state, disabled state, favorite state, usage count, and last-used timestamp.

Disabled known skills and orphan telemetry rows are visible in telemetry analysis. They remain excluded from `list`, `lookup`, `search`, `analyzeSearch`, `recommend`, and `explain` public read surfaces.

Recommendation telemetry is conservative and additive. Favorite and usage evidence may add small deterministic boosts only after normal activation evidence has already produced an enabled recommendation candidate. Telemetry alone must not recommend a skill. Disabled skill telemetry and orphan telemetry remain telemetry-analysis evidence only; they must not create activation boost components, registry entries, or public recommendation/read-surface results. Telemetry recommendation signals use `telemetry_favorite` and `telemetry_usage`, with matching human-readable reasons.

`clew telemetry` remains the compatibility surface for raw persisted telemetry rows and top-level registry rebuild warnings. `clew telemetry --explain` and MCP `analyzeTelemetry()` expose the analysis result explicitly. Registry rebuild warnings stay in top-level `warnings`; recommendation warnings stay on affected recommendation objects.

The executable fixture at `tests/fixtures/contracts/telemetry-analysis-contract.json` pins the public result shape and representative evidence ordering. The executable fixture at `tests/fixtures/contracts/activation-telemetry-boundary-contract.json` pins telemetry's boundary with activation and public read surfaces.
