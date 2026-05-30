# Registry Resolution Contract

`rebuildRegistry()` and `rebuildRegistryIndex()` are the v0.2 layered registry resolution contract. They discover canonical filesystem skill bundles, apply local telemetry state, and return a deterministic public `RegistrySnapshot`.

Registry layer precedence is:

- `session`
- `project`
- `org`
- `global`

When multiple valid bundles declare the same skill id, registry resolution selects the highest-precedence entry. Duplicate valid skill ids are normal overlay input, not registry degradation. They must not create registry rebuild warnings, request-time warnings, or public resolution diagnostics.

Disabled telemetry is applied after bundle discovery and duplicate resolution. A disabled resolved skill remains visible in explicit telemetry analysis, but it is not eligible for public read or activation surfaces including `list`, `lookup`, `search`, `analyzeIndex`, `analyzeSearch`, `recommend`, and `explain`.

Registry warnings remain reserved for degraded rebuild state, such as invalid filesystem bundles. Warning placement follows the warning contract: rebuild warnings stay in top-level `warnings` arrays and persisted rebuildable SQLite warning rows. Duplicate resolution and disabled telemetry do not write warnings.

Filesystem skill bundles remain canonical truth. SQLite registry tables, telemetry rows, and persisted registry warnings are derived local state. Deleting the database and rebuilding from the filesystem must preserve bundle resolution semantics, with telemetry-derived eligibility restored only from surviving telemetry state.

The executable fixture at `tests/fixtures/contracts/registry-resolution-contract.json` pins representative layer precedence, duplicate resolution, disabled public eligibility, warning placement, and the absence of public resolution diagnostics.
