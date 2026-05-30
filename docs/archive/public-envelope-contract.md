# Public Envelope Contract

CLI and MCP read surfaces expose compatibility envelopes by default. These envelopes keep payload fields named and predictable while preserving top-level warning arrays.

Default read surfaces remain compatibility-shaped:

- CLI `clew-cli list` returns `{ skills, warnings }`.
- CLI `clew-cli search <query>` and MCP `search()` return `{ query, skills, warnings }`.
- CLI `clew-cli recommend <query>` and MCP `recommend()` return `{ query, recommendations, warnings }`.
- CLI `clew-cli lookup <skill-id>` and MCP `lookup()` return `{ skillId, bundle, warnings }`.
- CLI `clew-cli explain <skill-id> [query]` and MCP `explain()` return `{ skillId, query, recommendation, warnings }`.
- CLI `clew-cli overlaps` returns `{ overlaps, warnings }`.
- CLI `clew-cli conflicts` returns `{ conflicts, warnings }`.
- CLI `clew-cli doctor` returns `{ skills, dbPath, repoSignals, overlaps, conflicts, registryWarnings, agentsDiagnostics, agentsPreferences, warnings }`.
- CLI `clew-cli telemetry` returns `{ dbPath, skills, warnings, telemetry }`.

Opt-in analysis surfaces expose analysis explicitly without changing default envelopes:

- CLI `clew-cli search --explain <query>` and MCP `analyzeSearch()` return `{ query, analysis, warnings }`.
- CLI `clew-cli recommend --explain <query>` and MCP `analyzeRecommendations()` return `{ query, analysis, warnings }`.
- CLI `clew-cli telemetry --explain` returns `{ dbPath, skills, warnings, analysis }`.
- MCP `analyzeTelemetry()` returns `{ analysis, warnings }`.
- MCP `analyzeIndex()` returns `{ analysis, warnings }`.

Warning placement follows the warning contract. Registry rebuild warnings stay in top-level `warnings`. Request-time unavailable-skill warnings are appended to the same envelope and return a `null` payload where appropriate. Activation warnings remain attached to affected recommendation objects.

Disabled telemetry and orphan telemetry remain excluded from public read and recommendation payloads. Disabled known skills may appear in explicit analysis with excluded status, and disabled or orphan telemetry may appear in explicit telemetry analysis, but they must not leak into default `list`, `search`, `lookup`, `recommend`, or `explain` payloads.

The executable fixture at `tests/fixtures/contracts/public-envelope-contract.json` pins representative CLI and MCP envelope keys, opt-in analysis placement, disabled read exclusions, telemetry analysis visibility, top-level registry warning placement, request warning placement, and recommendation-scoped activation warning placement.

Envelope shape is independent from telemetry mutation, which is pinned separately in `docs/telemetry-mutation-boundary-contract.md`. Default and opt-in read envelopes may include warnings and analysis, but only plain `clew-cli recommend <query>` records included recommendation usage; request-time warnings remain envelope-local.
