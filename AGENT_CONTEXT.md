# AGENT_CONTEXT.md — clew

## Project Identity

**Purpose:** Portable operational knowledge system for coding agents — a local-first, runtime-agnostic layer for reusable skills, registry intelligence, capability-aware activation, and explainable orchestration guidance.

**Language:** TypeScript (Node.js), pnpm monorepo

**Repository:** https://github.com/mattwalker101/clew

**Git:** `main` branch (incorporates fully merged `v0.4.0` Constitutional hooks, `v0.5.0` Antivirus Skill-Scanner, and `v0.6.0` LanceDB Immutable Audit Ledger). Working tree is completely clean and up-to-date.

---

## Project Structure

```
packages/
  clew-schema/      Zod schemas, TypeScript types, validation contracts, extension namespace rules
  clew-core/        Registry loading, overlays, composition, telemetry, activation engine
  clew-cli/         Primary CLI — recommend, explain, search, doctor, verify, status, audit
  clew-importers/   Ecosystem importers (armory skill imports)
  clew-exporters/   Ecosystem exporters
  clew-mcp/         MCP server — search, recommend, explain, registry lookup
  clew-dashboard/   Web dashboard (clew Cockpit)
skills/             5 active skills: debugging-core, engineering-core, refactor-safely, safe-editing, typescript-core
docs/
  adr/              Architecture decision records
  agents/           Agent-specific docs (issue-tracker, triage-labels, domain layout)
  archive/          Archived historical specifications and contract files
  plans/archive/    Archived completed feature implementation plans (v0.1 through v0.6.0)
  ARCHITECTURE.md   Overhauled system architecture, packages, ADRs, and resume runbook
AGENTS.md           Agent router for codex (schema v28.0)
CONTEXT.md          Project context (schema v28.0)
AGENT_SECURITY.md   Agent security rules
CHANGELOG.md        Version history
clew.egg/           Build output
.clew-registry.db   SQLite registry DB
```

### Package Dependencies

Build order: `clew-schema` → `clew-core` → `clew-cli` → `clew-importers` → `clew-exporters` → `clew-mcp`

Native deps: `better-sqlite3`, `@lancedb/lancedb`, `esbuild`, `onnxruntime-node` (requires build).

---

## Development

### Build & Test

```bash
corepack pnpm install              # install deps (requires pnpm@10.0.0)
corepack pnpm build               # build all packages
corepack pnpm test                # vitest run
```

### CLI Commands

```bash
clew recommend "<query>" --explain   # Get skill recommendations with rationale
clew search [--semantic] <query>     # Search registry
clew explain <skill>                 # Explain why a skill was/wasn't recommended
clew doctor                         # Registry health check
clew verify <runbook>               # Verify a runbook
clew run status                     # Runbook session status
clew mcp install                    # Install MCP server for Claude Desktop
clew dashboard --port=7708          # Launch clew Cockpit web UI
clew audit sync                     # Incremental synchronization of logs to LanceDB
clew audit query "<query>"          # Semantic vector query across telemetry logs
clew audit analyze                  # Analyze last 15 commands for vector anomalies
```

### MCP Server

```bash
clew-cli mcp install   # Register clew tools with Claude Desktop MCP
# Tools: search, recommend, explain, registry lookup
```

---

## Current Work Stream

### v0.2 → v0.6: The Explainable Registry (All Phases Complete & Paused)

**Phases 1–8 (complete):** Semantic foundations — local embeddings via transformers.js (`all-MiniLM-L6-v2`), vector search in SQLite-vec virtual tables, composition engine.

**Phase 9 (complete):** Relationship overlays — redundancy suppression in activation engine, preference-based exclusion, relationship-based explain logic.

**Phase 10 (complete):** The clew Cockpit — observability dashboard completely bootstrapped and operational (`clew-dashboard/`).

**v0.4.0 (complete):** Constitutional Gating — pre-commit git security hook validator.

**v0.5.0 (complete):** Antivirus Skill Scanner — linear regex check, acorn JS/TS AST block, local variable scope stack whitelists, and local Ollama semantic judge.

**v0.6.0 (complete):** LanceDB Immutable Audit Ledger — real-time fail-silent JSONL logger (`audit.jsonl`), CLI/MCP query intercepts, local LanceDB vector synchronization, and KNN similarity-based anomaly alerts.

**Project Status:** Active development paused. The repository is in a 100% clean, verified, and well-documented state, ready to resume whenever needed.

**Schema v28.0**

Current schema version. All agent-facing docs (AGENTS.md, CONTEXT.md, skill frontmatter) use schema v28.0. Migration plan exists if schema bumps.

---

## Code Exploration

Per `AGENTS.md`, **always use jCodemunch-MCP tools** for code exploration:
- `resolve_repo` → `get_file_outline` or `get_file_content`
- `search_symbols` or `search_text` before reading
- `get_file_tree` or `get_repo_outline` for structure

Never fall back to Read, Grep, Glob, or Bash for code navigation.

---

## Security Notes

See `AGENT_SECURITY.md`. clew must not be turned into a workflow engine, autonomous runtime, prompt package manager, or vendor-specific framework. Prefer local-first, deterministic, explainable behavior. Emit compatibility/degradation warnings instead of silently dropping meaning.

---

## Code Stats

- 7 packages in monorepo
- ~12K lines TypeScript across core packages
- 5 bundled skills in `skills/`
- SQLite registry DB at `.clew-registry.db` (regenerated from skill bundles)
- 288 passing tests covering schemas, composition, validation scan, imports/exports, and audit logging.

## Last verified

- Date: 2026-05-30 (today)
- Verified by: Antigravity agent
- Status: Audit completed — v0.6.0 LanceDB audit ledger fully implemented, tested, and documented. Workspace clean, all 288/288 tests passing cleanly, and active development paused.
