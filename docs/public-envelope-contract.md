# Public Envelope Contract

CLI and MCP read surfaces expose compatibility envelopes by default. These envelopes keep payload fields named and predictable while preserving top-level warning arrays.

Default read surfaces remain compatibility-shaped:

- CLI `clew search <query>` and MCP `search()` return `{ query, skills, warnings }`.
- CLI `clew recommend <query>` and MCP `recommend()` return `{ query, recommendations, warnings }`.
- CLI `clew lookup <skill-id>` and MCP `lookup()` return `{ skillId, bundle, warnings }`.
- CLI `clew explain <skill-id> [query]` and MCP `explain()` return `{ skillId, query, recommendation, warnings }`.
- CLI `clew telemetry` returns `{ dbPath, skills, warnings, telemetry }`.

Opt-in analysis surfaces expose analysis explicitly without changing default envelopes:

- CLI `clew search --explain <query>` and MCP `analyzeSearch()` return `{ query, analysis, warnings }`.
- CLI `clew recommend --explain <query>` and MCP `analyzeRecommendations()` return `{ query, analysis, warnings }`.
- CLI `clew telemetry --explain` returns `{ dbPath, skills, warnings, analysis }`.
- MCP `analyzeTelemetry()` returns `{ analysis, warnings }`.
- MCP `analyzeIndex()` returns `{ analysis, warnings }`.

Warning placement follows the warning contract. Registry rebuild warnings stay in top-level `warnings`. Request-time unavailable-skill warnings are appended to the same envelope and return a `null` payload where appropriate. Activation warnings remain attached to affected recommendation objects.

Disabled telemetry and orphan telemetry remain excluded from public read and recommendation payloads. Disabled known skills may appear in explicit analysis with excluded status, and disabled or orphan telemetry may appear in explicit telemetry analysis, but they must not leak into default `list`, `search`, `lookup`, `recommend`, or `explain` payloads.

The executable fixture at `tests/fixtures/contracts/public-envelope-contract.json` pins representative CLI and MCP envelope keys, opt-in analysis placement, disabled read exclusions, telemetry analysis visibility, top-level registry warning placement, request warning placement, and recommendation-scoped activation warning placement.
