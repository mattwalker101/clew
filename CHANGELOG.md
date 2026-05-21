# Changelog

## v0.1.0 (2026-05-20)

### Added
- **MCP Bridge**: Full Stdio server transport for `clew-mcp`, allowing other agents to query the registry.
- **CLI Automation**: Added `clew mcp install` for automated Claude Desktop configuration on macOS.
- **Import Persistence**: Added `--save` flag to `clew import` to persist external skills to the project registry.
- **Project Intelligence**: Section-aware `AGENTS.md` parsing and `project_preference` activation signal for project-specific overlays.
- **High-Fidelity Skills**: Expanded 5 core reference skills (`engineering-core`, `safe-editing`, `typescript-core`, `debugging-core`, `refactor-safely`) with detailed instructions and examples.
- **Lookup Command**: Added `clew lookup <skill-id>` for scriptable registry lookup.

### Changed
- **Contract Hardening**: CLI read commands now return stable JSON envelopes instead of raw arrays.
- **Registry Rebuildability**: Registry-backed reads now tolerate partially matching queries or invalid filesystem bundles by loading valid ones and emitting warnings.
- **Intelligent Diagnostics**: `clew doctor` now includes `registryWarnings` and `agentsDiagnostics`.

### Fixed
- **Dependency Resolution**: Fixed module resolution for `@clew/schema` in the CLI package.
- **Security**: Mitigated ReDoS vulnerability in `AGENTS.md` header parsing.
- **YAML Generation**: Improved YAML stringifier to omit empty metadata fields, ensuring schema-valid generated manifests.
