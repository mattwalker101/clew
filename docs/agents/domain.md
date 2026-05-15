---
schema_version: "28.0"
agent_id: "codex"
status: "complete"
checksum_md5: "not_computed"
---

# Domain Docs

clew uses a single-context documentation layout.

## Required Reading Order

1. `CONTEXT.md`
2. `docs/clew PRD v0.1.md`
3. `docs/clew Technical Specification Addendum v0.1.md`
4. `docs/clew Implementation Roadmap v0.1.md`
5. `docs/clew_Build_handoff.md`

## ADRs

Architectural decisions should be recorded in `docs/adr/`.

## Consumer Rules

- Use the PRD for product boundaries and non-goals.
- Use the technical specification for schema and runtime contracts.
- Use the roadmap for implementation order.
- Do not infer orchestration semantics that are explicitly deferred from v0.1.
