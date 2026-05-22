# Telemetry Mutation Boundary Contract

Telemetry mutation is derived local state only. Filesystem skill bundles remain canonical truth, and SQLite registry/telemetry data must be rebuildable from filesystem bundles plus explicit local telemetry choices.

## Mutating Surfaces

- `clew-cli recommend <query>` records usage only for skills included in the returned recommendations.
- `clew-cli disable <skill-id>` records disabled state only in SQLite telemetry-derived state.
- `clew-cli enable <skill-id>` clears disabled state only in SQLite telemetry-derived state.

## Non-Mutating Surfaces

- `clew-cli recommend --explain <query>` does not record usage.
- `clew-cli explain <skill-id> [query]` does not record usage.
- `clew-cli search <query>` and `clew-cli search --explain <query>` do not record usage.
- `clew-cli lookup <skill-id>` does not record usage.
- `clew-cli telemetry` and `clew-cli telemetry --explain` do not record usage.
- MCP read and analysis surfaces do not record usage unless an explicit future mutation API is introduced.

## Filesystem Boundary

Enable/disable and recommendation usage never rewrite filesystem skill bundles. Disabled telemetry may exclude a known skill from public read and recommendation surfaces while the DB exists, but deleting the DB removes telemetry-derived local state and leaves the filesystem bundle as canonical truth.

## Warning Boundary

Request-time warnings such as unknown, disabled, and not-recommended skill warnings are returned on request envelopes only. They are not persisted as registry rebuild warnings or telemetry rows. Registry rebuild warnings remain top-level persisted rebuild diagnostics.

The executable fixture at `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json` pins representative command behavior.
