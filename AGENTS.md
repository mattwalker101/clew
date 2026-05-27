---
schema_version: "28.0"
agent_id: "codex"
status: "complete"
checksum_md5: "not_computed"
---

# clew Agent Router

Start every session by reading `CONTEXT.md`, then the relevant documents in `docs/`.

## Project Rules

- Preserve clew's non-goals: do not turn it into a workflow engine, autonomous runtime, prompt package manager, or vendor-specific framework.
- Prefer local-first, deterministic, explainable behavior.
- Treat filesystem skill bundles as canonical truth; runtime databases must be rebuildable.
- Keep provider-specific behavior in explicit extension namespaces.
- Emit compatibility and degradation warnings instead of silently dropping meaning.
- Build schema contracts before runtime behavior.

## Active Skills

- engineering-core
- safe-editing
- typescript-core
- debugging-core
- refactor-safely

## Agent skills

### Issue tracker

Local markdown is the assumed issue tracker until a Git remote or external tracker is configured. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.

## Build Order

1. `packages/clew-schema`
2. `packages/clew-core`
3. `packages/clew-cli`
4. `packages/clew-importers`
5. `packages/clew-exporters`
6. `packages/clew-mcp`

## Testing Expectations

- Schema validation tests must cover valid and invalid bundles.
- Composition tests must prove additive merge determinism.
- Import/export tests must verify provenance and compatibility warnings.
- Activation tests must explain every recommendation.

## Code Exploration Policy

Always use jCodemunch-MCP tools — never fall back to Read, Grep, Glob, or Bash for code exploration.
- Before reading a file: use get_file_outline or get_file_content
- Before searching: use search_symbols or search_text
- Before exploring structure: use get_file_tree or get_repo_outline
- Call resolve_repo with the current directory first; if not indexed, call index_folder.
