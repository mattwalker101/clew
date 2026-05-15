---
schema_version: "28.0"
agent_id: "codex"
status: "complete"
checksum_md5: "not_computed"
---

# clew Project Context

clew is a portable operational knowledge system for coding agents. It is a runtime-agnostic, local-first layer for reusable skills, registry intelligence, capability-aware activation, ecosystem interoperability, and explainable orchestration guidance.

clew is not a workflow execution engine, autonomous agent runtime, prompt package manager, vendor-specific framework, or replacement for `AGENTS.md`.

## Product Direction

The core product goal is portable operational knowledge interoperability across coding-agent ecosystems.

Primary principles:

- Local-first canonical storage.
- Interoperability before vendor specialization.
- Explainable activation and recommendations.
- Declarative, stateless skills.
- Additive composition through overlays and inheritance.
- Capability-aware behavior using abstract runtime capabilities.
- Graceful degradation with explicit warnings.

## Architecture

The intended architecture is:

1. Portable Skill Specification.
2. Registry and runtime intelligence.
3. Activation engine.
4. CLI, MCP bridge, and future integrations.
5. Agent ecosystem import/export compatibility.

The repository should validate the abstraction layer before adding orchestration complexity.

## Initial Package Boundaries

- `packages/clew-schema`: canonical Zod schemas, TypeScript types, validation contracts, extension namespace rules.
- `packages/clew-core`: registry loading, overlays, composition, telemetry, activation, provenance.
- `packages/clew-cli`: primary command-line UX.
- `packages/clew-importers`: importer contracts and ecosystem importers.
- `packages/clew-exporters`: exporter contracts and ecosystem exporters.
- `packages/clew-mcp`: minimal MCP interface for search, recommend, explain, and registry lookup.

## Source Documents

- `docs/clew PRD v0.1.md`
- `docs/clew Technical Specification Addendum v0.1.md`
- `docs/clew Implementation Roadmap v0.1.md`
- `docs/clew_Build_handoff.md`

## Current Priority

Phase 1 is `clew-schema`. It should establish deterministic validation for canonical skill bundles before core registry or CLI work expands.
