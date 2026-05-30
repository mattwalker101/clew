# SYSTEM ARCHITECTURE

This document describes the high-level architecture, key technical decisions, and security model of **clew**.

---

## 1. Executive Overview & Core Mandates

`clew` is a portable, local-first operational knowledge system for coding agents. In an era dominated by opaque, cloud-dependent AI middleware, `clew` serves as a secure, deterministic, and 100% offline layer that organizes, gates, and trace-explains skill execution.

The architecture is governed by three non-negotiable core mandates:

### 1.1 The Local-First Portability Guarantee
* **Derived State Databases:** All databases used by `clew` (the SQLite skill registry and the LanceDB audit ledger) are strictly *secondary* to flat files.
* **Rebuildable from Scratch:** If `~/.clew/` or `.clew-registry.db` is deleted, the entire system state can be reconstructed with absolute fidelity. The registry is rebuilt by scanning local filesystem skill bundles (`clew.yaml` + `skill.md`), and the vector ledger is re-indexed from the append-only `audit.jsonl` log.
* **Fail-Silent Resilience:** In sandboxed, read-only, or locked VM environments, write operations fail silently. Telemetry logging and vector syncs emit quiet warnings but *never* throw uncaught errors or crash active user commands.

### 1.2 The Multi-Pillar Security Shield
Security in `clew` is active, proactive, and layered:
1. **Constitutional Pre-Commit Gating:** Hard-vetoes commit attempts if repository configurations or core security policies in `AGENTS.md` are degraded.
2. **Static Manifest Checks:** Verifies skill metadata configurations (`skill.yaml`) using linear-time, ReDoS-safe regex patterns to enforce capability/permission alignment.
3. **Behavioral AST Analysis:** Traverses script ASTs with `acorn` (for JavaScript/TypeScript) and runs regex heuristics (for Python/Shell) to block unauthorized imports (`child_process`, `net`, `http`), forbidden global bindings (`fetch`, `eval`), and privilege bypass vectors (`sudo`, `curl`).
4. **Offline Semantic Red-Teaming:** Utilizes an opt-in local **Ollama** bridge (or commercial APIs) to vet natural language instructions for prompt injections and malicious workflows before registration.

### 1.3 No-Magic Determinism & Traceability
* **Trace Evidence Trails:** There are no opaque black boxes. Every skill recommendation or query match outputs an explicit trace listing the exact similarity score, repository signals (e.g., TS project directories), and trigger matches that drove the decision.
* **Additive Composition:** When parent and child skills inherit instructions, they are merged deterministically using strict schema-validated composition contracts.

---

## 2. High-Level System Architecture

`clew` is designed as a modular monorepo consisting of layered, decoupled packages. It enforces clear interfaces and strict boundaries, guaranteeing that no high-level user interface can bypass core security validation or database constraints.

### 2.1 Component & Package Topography

```mermaid
graph TD
    User([User / AI Coding Agent]) --> CLI[clew-cli / CLI Commands]
    User --> MCP[clew-mcp / MCP STDIO Server]
    
    subgraph Interfaces ["Public Interfaces"]
        CLI
        MCP
    end

    CLI --> Core[clew-core / Core Engine]
    MCP --> Core
    
    subgraph CoreEngine ["@clew-ops/core Runtime Brain"]
        Core --> Registry[Skill Registry & Resolver]
        Core --> Activation[Activation & Triggers Engine]
        Core --> Composition[Additive Composition Engine]
        Core --> ScannerGateway[Scanner Safety Gateway]
        Core --> AuditLogger[Audit Logger & Sync Engine]
    end

    subgraph Security ["Security & Telemetry Gateways"]
        ScannerGateway --> StaticScan[Static YAML Manifest Checker]
        ScannerGateway --> ScriptScan[Behavioral AST acorn/regex Scanner]
        ScannerGateway --> SemanticScan[Semantic LLM-as-a-Judge]
        
        AuditLogger --> JSONL[audit.jsonl Append-Only Log]
        AuditLogger --> LanceSync[LanceDB Incremental Sync]
    end

    Registry --> FS[Local Filesystem skill.yaml/skill.md]
    Registry --> SQLite[(SQLite Index & vec_skills)]
    
    LanceSync --> LanceDB[(LanceDB Vector Table)]

    subgraph Interop ["Ecosystem Interoperability"]
        Core --> Importers[clew-importers]
        Core --> Exporters[clew-exporters]
    end
    
    Importers --> Claude[Claude Desktop json]
    Importers --> OpenCode[OpenCode Profiles]

    subgraph SchemaLayer ["Foundations & Type Safety"]
        Schema[@clew-ops/schema Zod Contracts]
    end

    CoreEngine -.-> SchemaLayer
    Security -.-> SchemaLayer
    Interop -.-> SchemaLayer
```

### 2.2 Package Mandates

1. **`@clew-ops/schema`:**
   - **Mandate:** The single source of truth for types and structural contracts.
   - **Behavior:** Houses Zod schemas governing skill manifests, compatibility warnings, telemetry metrics, and composition results. Zero dependencies other than `zod`.
2. **`@clew-ops/core`:**
   - **Mandate:** The core engine encapsulating the Registry, Activation, Security Scanning, and Logging.
   - **Registry & Activation:** Resolves hierarchical skill layers (System, Project, User), scans signals (directory structure, git metadata), and recomposes instruction text.
   - **Safety Scanners (`src/scanner/`):** Contains the manifest, AST behavioral, and semantic red-teaming validators.
   - **Audit Sync (`src/audit/`):** Coordinates real-time non-blocking event log appends and incremental LanceDB delta syncs.
3. **`@clew-ops/cli`:**
   - **Mandate:** The primary interface for humans and local CLI scripts. Coordinates command routes, triggers pre-commit installer setups, launches the dashboard server, and exposes `clew audit` analytics.
4. **`@clew-mcp`:**
   - **Mandate:** Bridging standard agents to the Model Context Protocol. Exposes `clew`'s semantic search and recommendations as standard STDIO tools.
5. **`@clew-importers` / `@clew-exporters`:**
   - **Mandate:** Data translation. Converts external configuration layouts (Claude JSON/OpenCode) into `clew`'s canonical format, reporting safety warnings during translations.
6. **`@clew-ops/dashboard`:**
   - **Mandate:** Operational visualization (the *clew Cockpit*). Serves a glassmorphic dashboard visualizing active skills, conflict tracks, and environment statistics.

---

## 3. Evolution & Chronological Milestones (v0.1 to v0.6)

`clew` has evolved from a basic declarative directory parser into a highly secure, context-aware vector telemetry and safety firewall. Every release has added security and local portability primitives while strictly adhering to our zero-cloud mandate.

### 3.1 Milestone History

| Version | Focus | Core Primitives Added | Key Architectural Decisions |
| :--- | :--- | :--- | :--- |
| **v0.1.0** | Declarative Foundation | SQLite Indexing, Claude/OpenCode bridges, simple keyword mapping | - Rebuildable SQLite registry schema.<br>- FS-first canonical truth (database can be deleted anytime). |
| **v0.2.0** | Semantic Discovery | Local Transformers.js ONNX embeddings, SQLite-vec virtual indexes | - Selection of `Xenova/all-MiniLM-L6-v2` (384-dimensions) running completely offline.<br>- Hybrid search ranking (Keywords + Semantic Similarity). |
| **v0.3.0** | Relationship Intelligence | Redundancy suppression, parent-child inheritance, `AGENTS.md` preferences | - Local scope exclusions (force-exclusion of rules based on directory or team settings).<br>- Recommender traces explaining suppression. |
| **v0.4.0** | Constitutional Hard-Veto | Pre-commit security installer, regex ReDoS fix, prototype pollution guard | - Shift to active blocking: CLI vetoes commits via `check-security` pre-commit hooks.<br>- Safe parsing rules for markdown parameters. |
| **v0.5.0** | Antivirus Skill Scanner | acorn AST JS/TS traversals, python/bash heuristics, Ollama semantic judge | - JS-native linear-time regex manifests.<br>- Scope-stack whitelisting in AST walks to avoid shadowing false-positives.<br>- Offline semantic judging via local Ollama `/api/generate` REST APIs. |
| **v0.6.0** | LanceDB Audit Ledger | Fail-silent JSONL logs, CLI/MCP intercepts, LanceDB syncs, KNN anomalies | - Real-time logger decoupled from DB writes (fail-silent asynchronous log appends).<br>- Incremental syncing via sorted timestamp delta checks.<br>- Anomaly alerts calculated via vector KNN distance checks (> 0.75 score). |

### 3.2 Database Schema Evolutions

#### SQLite Skill Index (`.clew-registry.db`)
In **v0.2.0**, we introduced SQLite-vec extensions to index semantic instruction texts:
```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,
  root TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  disabled INTEGER NOT NULL,
  favorite INTEGER NOT NULL,
  manifest_json TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS vec_skills USING vec0(
  skill_id TEXT PRIMARY KEY,
  vector FLOAT[384]
);
```

#### LanceDB Telemetry Database (`~/.clew/lancedb/audit_events`)
In **v0.6.0**, we introduced local LanceDB integration to index operational behaviors asynchronously:
```typescript
const schema = {
  vector: new Float32Array(384),
  timestamp: "string",
  eventId: "string",
  eventType: "string", // "cli" | "mcp" | "veto" | "system"
  actor: "string",     // "human" | "agent:<name>"
  cwd: "string",
  payloadJson: "string", // Serialized parameter data
  vectorText: "string"  // Raw text sequence processed by the embedding engine
};
```

---

## 4. Agentic AI Resume Runbook & Recommended Next Steps

> [!IMPORTANT]
> **To the Resuming Agent:**
> 1. You must maintain `clew`'s core mandates: **100% offline local execution**, **FS-first canonical truth**, and **fail-silent telemetry logging**.
> 2. You must follow strict **Test-Driven Development (TDD)**: write a failing test first, verify failure, implement minimal code, and ensure all tests are green.
> 3. Verify changes using the constitutional review hooks (`pnpm build && pnpm test`) before committing.

### 4.1 Quick Bootstrapping & Diagnostics
Run the following commands in order to verify workspace sanity:
```bash
# 1. Install dependencies and perform initial production builds
corepack pnpm install
corepack pnpm build

# 2. Run the complete test suite (assert 288/288 tests pass)
corepack pnpm test

# 3. Check code compliance and database integrity
node packages/clew-cli/dist/index.js doctor
node packages/clew-cli/dist/index.js check-security
```

### 4.2 Actionable Backlog & Next Steps

When resuming development, implement the following three tasks in chronological order:

#### **Task A: Streaming JSONL Sync Reader (`packages/clew-core`)**
*   **Goal:** Replace `fs.readFileSync` inside `syncAuditLedger` to read `audit.jsonl` line-by-line, maintaining a stable $O(1)$ memory consumption for large logs.
*   **Files:**
    - Modify: `packages/clew-core/src/audit/sync.ts` (Refactor parser to use `node:readline` streams)
    - Test: `packages/clew-core/src/audit/sync.test.ts` (Add tests with mock log streams containing > 10,000 mock events)
*   **Implementation Steps:**
    1. Create a readable stream from `finalLogPath` using `fs.createReadStream`.
    2. Interface it with `readline.createInterface({ input: stream, crlfDelay: Infinity })`.
    3. Loop through lines, check the `timestamp` boundary, and push to an array once the threshold is crossed.
    4. Batch-embed the accumulated delta events and append to LanceDB.

#### **Task B: Visual Telemetry Dashboard Feed (`packages/clew-cli` & `@clew-ops/dashboard`)**
*   **Goal:** Expose the LanceDB vector ledger inside the **clew Cockpit** dashboard to visualize active security alerts and anomaly timeline lists.
*   **Files:**
    - Modify: `packages/clew-cli/src/server.ts` (Register `GET /api/audit` API route query)
    - Modify: `@clew-ops/dashboard` components (Add glowing timeline list visualizer)
*   **Implementation Steps:**
    1. In `server.ts`, open a connection to the LanceDB database at `~/.clew/lancedb`.
    2. Implement a `GET /api/audit` route executing table queries with descending timestamps and limit limits. Expose custom threshold searches.
    3. In the React dashboard frontend, create a glassmorphic visual timeline component. Under anomaly events, render red veto alerts highlighting CWD and distance indices.

#### **Task C: Dynamic Kanban Project Board Integration (`packages/clew-core`)**
*   **Goal:** Map external software project checklists (from markdown lists or board JSON profiles) to active weights inside the Activation Engine.
*   **Files:**
    - Create: `packages/clew-core/src/kanban/connector.ts`
    - Modify: `packages/clew-core/src/index.ts` (Inject kanban indicators into `buildActivationContext`)
    - Create: `packages/clew-core/src/kanban/connector.test.ts`
*   **Implementation Steps:**
    1. Implement parser walking the workspace directory for `.kanban` files or markdown files matching issue card templates.
    2. Map checkbox statuses (e.g. `[ ] Task X`) to triggers inside active registry packages.
    3. Elevate recommendation scores for skills matching unresolved kanban tickets.

---

## 5. Architectural Decision Records (ADR)

### ADR-001: Offline-First AI Telemetry via LanceDB & Transformers
*   **Context:** AI systems often rely on external telemetry layers (like LangSmith or cloud loggers) which pose private credential leaking hazards and high network latencies.
*   **Decision:** We chose native local LanceDB and HuggingFace's Node-native `@huggingface/transformers` to generate and index vectors on-disk (`~/.clew/lancedb/audit_events`).
*   **Consequences:** Telemetry remains 100% private, runs entirely offline, incurs zero network billing, and executes similarity and anomaly queries under **~30ms** locally.

### ADR-002: Real-time Append Logging with Decoupled Syncing
*   **Context:** Vectorizing text sequences can introduce ~50ms of overhead, which would dramatically slow down interactive CLI command execution.
*   **Decision:** Intercepted CLI/MCP commands perform a fast, synchronous `appendFileSync` to a local JSONL log file (`audit.jsonl`), failing silently if directories are write-locked. The actual vector indexing pass (syncing JSONL delta lines to LanceDB) is entirely decoupled, running either on-demand or asynchronously during low-priority CLI queries.
*   **Consequences:** CLI command execution maintains sub-15ms overhead, while indexing is batched and executed highly efficiently.
