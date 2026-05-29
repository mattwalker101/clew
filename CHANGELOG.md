# Changelog

## v0.3.0 (2026-05-29)

### Added
- **Guided Runbooks State Machine**: Complete SQLite-based local execution engine inside `@clew-ops/core` utilizing `.clew-session.db` and state checking for verification gates (`command`, `file`, `grep`).
- **CLI Runbook Verification Commands**: Subcommands `clew run start`, `clew run status`, and `clew run verify` to enable interactive runbook progress stepper inside developer environments.
- **Cockpit Runbook Stepper**: Beautiful, real-time dashboard UI panel visualizing active step descriptions, progress meters, and verification gate results.
- **Interactive Telemetry Controls**: Writable favorite/disable control endpoints (`POST /api/telemetry/favorite`, `POST /api/telemetry/disable`) and dashboard UI toggle buttons allowing custom operational custom overrides.
- **Shell Command Safety Prompting**: Secure verification gates that prompt the developer in the CLI before running untrusted or arbitrary shell commands, with `--yes` or `--force` opt-in bypasses.
- **Three Canonical Operational Skills**: Implemented high-quality self-documenting skills inside the workspace (`clew-tdd` enforcing red-green-refactor cycles, `clew-diagnose` for defect loops, and `clew-grill-me` for design alignment).

## v0.2.0 (2026-05-27)

### Added
- **Interactive Concentric Knowledge Map**: Added a responsive, high-performance SVG visual skill relationship network to the cockpit, distributing skills by layered inheritance (System, Project, User) and coloring links for suppression and conflicts.
- **Glassmorphic Registry Health Gauge**: Integrated an Apple Watch-style circular progress hero gauge with dynamic warning deductions (-15% conflict, -5% overlap, -3% warning) and dynamic glowing states.
- **Explainable Activation & Debug Trace**: A fully-fledged Activation Trace Debugger with comprehensive trigger breakdown mapping, redundant candidate pools, and relative endpoint routing.
- **Local Semantic Indexing**: Local-first semantic indexing using `@huggingface/transformers` and `sqlite-vec` in SQLite (Phase 8).
- **Smart Redundancy Suppression**: Automated overlay resolution that prioritizes and keeps the most relevant skill while cleanly explaining why others were suppressed.
- **Workspace Diagnostics Endpoint**: Added a new `/api/doctor` endpoint returning diagnostic metrics identical to the `doctor` command.

### Changed
- **Relative Endpoint Routing**: Upgraded all frontend dashboard requests to relative paths (`/api/doctor`, `/api/registry`, `/api/explain`), ensuring full compatibility with custom server ports.
- **Defensive UI Hardening**: Integrated comprehensive defensive rendering guards (optional chaining, fallback arrays, custom default values) across all cockpit visual components.

## v0.1.0 (2026-05-20)

### Added
- **MCP Bridge**: Full Stdio server transport for `clew-mcp`, allowing other agents to query the registry.
- **CLI Automation**: Added `clew-cli mcp install` for automated Claude Desktop configuration on macOS.
- **Import Persistence**: Added `--save` flag to `clew-cli import` to persist external skills to the project registry.
- **Project Intelligence**: Section-aware `AGENTS.md` parsing and `project_preference` activation signal for project-specific overlays.
- **High-Fidelity Skills**: Expanded 5 core reference skills (`engineering-core`, `safe-editing`, `typescript-core`, `debugging-core`, `refactor-safely`) with detailed instructions and examples.
- **Lookup Command**: Added `clew-cli lookup <skill-id>` for scriptable registry lookup.

### Changed
- **Contract Hardening**: CLI read commands now return stable JSON envelopes instead of raw arrays.
- **Registry Rebuildability**: Registry-backed reads now tolerate partially matching queries or invalid filesystem bundles by loading valid ones and emitting warnings.
- **Intelligent Diagnostics**: `clew-cli doctor` now includes `registryWarnings` and `agentsDiagnostics`.

### Fixed
- **Dependency Resolution**: Fixed module resolution for `@clew-ops/schema` in the CLI package.
- **Security**: Mitigated ReDoS vulnerability in `AGENTS.md` header parsing.
- **YAML Generation**: Improved YAML stringifier to omit empty metadata fields, ensuring schema-valid generated manifests.
