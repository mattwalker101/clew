# **clew Build Handoff**

## **Project**

clew — the thread for agentic navigation

clew is a portable operational knowledge system for coding agents.

The system provides:

* portable skills  
* additive operational overlays  
* explainable activation  
* local-first registry intelligence  
* interoperability across agent ecosystems

This project is intentionally:

* interoperability-first  
* declarative  
* explainable  
* local-first  
* capability-aware

This project is intentionally NOT:

* a workflow engine  
* an autonomous orchestration runtime  
* a daemon platform  
* a prompt package manager  
* a cloud registry system

---

# **Core Architectural Thesis**

Operational knowledge should be portable infrastructure.

Skills are:

* reusable operational guidance  
* declarative instruction bundles  
* composable overlays

NOT executable workflows.

The primary innovation is:

portable operational knowledge interoperability

NOT orchestration.

---

# **Foundational Invariants**

These are non-negotiable architectural constraints.

## **Skills are declarative**

Do not implement workflow execution semantics.

---

## **Runtime behavior is explainable**

Every recommendation or activation must expose WHY it occurred.

Avoid opaque routing.

---

## **Canonical skills live on the filesystem**

Filesystem skill bundles are canonical truth.

SQLite is derived runtime intelligence only.

---

## **Registry intelligence is local-first**

No cloud dependency.

---

## **Composition is additive**

Composition merges:

* metadata  
* policies  
* capabilities  
* activation hints

Composition does NOT:

* execute parent skills  
* enforce ordering  
* create dependency graphs

---

## **Interoperability-first design**

Import/export fidelity matters more than advanced features.

---

## **Graceful degradation**

Imports and exports must preserve operational meaning whenever possible and emit warnings when fidelity is reduced.

---

# **Explicitly Avoid**

DO NOT BUILD:

## **Workflow execution**

No DAGs.  
 No orchestration graphs.  
 No step runners.

---

## **Autonomous activation**

No hidden activation.  
 No silent prompt injection.  
 No opaque runtime behavior.

---

## **Daemon runtime**

No always-on service architecture.

---

## **Semantic infrastructure**

No embeddings initially.  
 No vector DBs initially.

---

## **IDE integrations**

Not yet.

---

## **Cloud sync / registries**

Local-first only.

---

## **Stateful skills**

Skills are stateless declarative bundles.

---

# **Repository Structure**

clew/  
├── packages/  
│   ├── clew-schema  
│   ├── clew-core  
│   ├── clew-cli  
│   ├── clew-importers  
│   ├── clew-exporters  
│   └── clew-mcp  
│  
├── skills/  
├── examples/  
├── docs/  
└── tests/  
---

# **Recommended Stack**

## **Core**

* TypeScript  
* Node.js  
* pnpm workspaces

## **Validation**

* Zod

## **Database**

* SQLite  
* better-sqlite3

## **Testing**

* Vitest

---

# **Package Responsibilities**

## **clew-schema**

Canonical schema contracts.  
 Zod validation.  
 Core TS interfaces.

This package should remain dependency-light and stable.

---

## **clew-core**

The runtime platform.

Responsibilities:

* registry  
* activation  
* composition  
* telemetry  
* provenance  
* layered overlays

No CLI logic.

---

## **clew-cli**

Primary UX surface.

Must remain:

* explainable  
* inspectable  
* scriptable

---

## **clew-importers**

Import normalization and provenance preservation.

v0.1:

* Claude importer  
* OpenCode importer only

---

## **clew-exporters**

Best-effort interoperability exporters.

v0.1:

* Claude exporter  
* OpenCode exporter only

---

## **clew-mcp**

Optional MCP bridge.

Minimal functionality initially:

* search  
* recommend  
* explain

No orchestration.

---

# **Canonical Skill Bundle**

skill-name/  
├── clew.yaml  
└── skill.md

Optional:

examples/  
templates/  
assets/  
tests/  
---

# **First Implementation Steps**

## **Step 1 — Bootstrap Monorepo**

Create:

* pnpm workspace  
* TypeScript configs  
* package boundaries  
* linting/testing baseline

Goal:  
 Repository compiles cleanly.

---

## **Step 2 — Implement clew-schema**

Create:

* canonical skill schema  
* Zod validators  
* TS interfaces  
* capability taxonomy  
* provenance schema  
* extension namespace schema

Goal:  
 Skill bundles validate deterministically.

---

## **Step 3 — Implement clew-core Registry**

Create:

* filesystem discovery  
* layered registry loading  
* additive composition  
* SQLite indexing  
* registry rebuildability

Goal:  
 Registry resolves skills deterministically.

---

## **Step 4 — Implement Activation Engine**

Initial activation only:

* tags  
* keyword matching  
* AGENTS.md references  
* lightweight heuristics

NO embeddings.

Goal:  
 Explainable recommendations.

---

## **Step 5 — Implement CLI**

Initial commands:

clew list  
clew search  
clew recommend  
clew explain  
clew import  
clew export

Goal:  
 Operational transparency.

---

# **Explainability Requirements**

Every recommendation MUST include:

* why a skill activated  
* what signals contributed  
* overlap/conflict warnings

Example:

Recommended:  
\- safe-refactor

Reasons:  
\- task contains "refactor"  
\- TypeScript repo detected  
\- commonly paired with engineering-core

Explainability is mandatory.

---

# **Registry Rules**

Filesystem bundles are canonical truth.

SQLite stores:

* telemetry  
* indexes  
* overlap references  
* provenance references

The SQLite registry MUST be rebuildable from filesystem bundles.

Never silently mutate canonical skill bundles.

---

# **Initial Capability Taxonomy**

filesystem  
terminal  
internet  
git  
mcp  
multimodal  
vector\_memory  
persistent\_memory  
subagents

Keep capability taxonomy intentionally small initially.

---

# **Initial Reference Skills**

Create these early:

* engineering-core  
* safe-editing  
* typescript-core  
* debugging-core  
* refactor-safely

These are:

* examples  
* fixtures  
* compatibility tests  
* activation tests

---

# **Priority Testing Areas**

Highest priority:

## **Schema validation**

## **Import/export fidelity**

## **Composition determinism**

## **Registry rebuildability**

## **Explainability correctness**

## **Graceful degradation**

---

# **Success Criteria for v0.1-alpha**

The following must work:

## **Canonical skill bundles validate correctly**

## **Layered registries resolve deterministically**

## **Skills compose additively**

## **Recommendations are explainable**

## **Imports preserve provenance**

## **Exports emit compatibility warnings**

## **AGENTS.md references activate overlays**

---

# **Success Criteria for v0.1**

Developers can:

* import operational knowledge from multiple ecosystems  
* manage reusable skill overlays  
* understand WHY recommendations occur  
* preserve operational portability across coding agents

without:

* vendor lock-in  
* opaque orchestration  
* workflow-engine complexity

---

# **Final Guidance**

When uncertain:  
 optimize for:

* portability  
* explainability  
* composability  
* local-first operation  
* deterministic behavior

Do NOT optimize for:

* autonomy  
* orchestration sophistication  
* magical AI behavior  
* hidden runtime behavior

The system succeeds if operational knowledge becomes:

portable infrastructure

rather than:

* isolated prompts  
* ecosystem-specific hacks  
* opaque orchestration layers

