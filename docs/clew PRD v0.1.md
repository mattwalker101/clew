# **clew PRD v0.1**

## **Executive \+ Architectural Product Requirements Document**

---

# **1\. Overview**

## **Project Name**

clew

## **Tagline**

clew — the thread for agentic navigation

## **Summary**

clew is a portable operational knowledge system for coding agents.

It provides:

* reusable operational guidance (“skills”)  
* local-first registry intelligence  
* capability-aware activation  
* interoperability across agent ecosystems  
* explainable orchestration guidance

clew is designed as:

* a runtime-agnostic operational layer  
* an interoperability substrate  
* a local-first registry/runtime  
* a compositional skill system

clew is explicitly NOT:

* a workflow execution engine  
* an autonomous agent runtime  
* a prompt package manager  
* a vendor-specific framework  
* a replacement for `AGENTS.md`

---

# **2\. Problem Statement**

Modern coding-agent ecosystems are rapidly fragmenting.

Developers increasingly rely on:

* Claude skills  
* OpenCode agents  
* Codex workflows  
* Cursor rules  
* Pi extensions  
* MCP tooling  
* custom prompts and orchestration layers

These systems suffer from:

* vendor lock-in  
* duplicated operational knowledge  
* incompatible formats  
* weak portability  
* opaque orchestration  
* poor lifecycle management  
* operational sprawl

There is currently no portable, explainable, local-first operational knowledge layer that works across coding-agent ecosystems.

clew exists to solve this problem.

---

# **3\. Vision**

clew aims to become:

the operational substrate layer for agentic development environments

It provides:

* portable operational knowledge  
* explainable activation  
* layered operational overlays  
* ecosystem interoperability  
* local operational intelligence

clew enables durable operational practices across:

* projects  
* teams  
* agent runtimes  
* local/cloud models  
* future orchestration systems

---

# **4\. Design Principles**

## **4.1 Local-First**

Canonical skill bundles and runtime intelligence are stored locally.

No cloud dependency is required.

---

## **4.2 Interoperability-First**

clew prioritizes:

* import/export fidelity  
* graceful degradation  
* ecosystem compatibility

over vendor specialization.

---

## **4.3 Explainability**

All runtime behavior should be inspectable and explainable.

clew avoids:

* hidden activation  
* opaque routing  
* silent prompt injection

---

## **4.4 Declarative Skills**

Skills are declarative operational guidance.

Skills are NOT executable workflows.

---

## **4.5 Additive Composition**

Skills compose through additive overlays and inheritance.

clew avoids imperative execution semantics.

---

## **4.6 Capability Awareness**

Skills express abstract runtime capabilities rather than vendor-specific tooling assumptions.

---

## **4.7 Graceful Degradation**

Imports and exports should preserve operational meaning whenever possible and emit explicit compatibility/degradation warnings when fidelity is reduced.

---

# **5\. Non-Goals**

clew does NOT attempt to provide:

## **Workflow Execution**

No DAG/workflow engine.

---

## **Autonomous Agent Runtime**

No autonomous orchestration platform.

---

## **Hidden AI Routing**

No opaque runtime-controlled execution.

---

## **Cloud-Native Dependency Ecosystem**

No centralized marketplace or package dependency system in v0.1.

---

## **Vendor Lock-In**

clew intentionally avoids provider-specific abstractions.

---

# **6\. Core Concepts**

## **6.1 Skill**

A portable instruction bundle containing:

* operational guidance  
* policies  
* metadata  
* activation hints  
* capability requirements

Skills are stateless and declarative.

---

## **6.2 Registry**

A layered local-first operational knowledge registry.

The registry manages:

* skill indexing  
* telemetry  
* provenance  
* activation metadata  
* overlap/conflict analysis

---

## **6.3 Activation**

The process of recommending or enabling relevant skills based on:

* task context  
* repository heuristics  
* AGENTS.md  
* telemetry  
* runtime capabilities

Activation is advisory and explainable.

---

## **6.4 Composition**

Skills may extend other skills through additive inheritance.

Composition merges:

* policies  
* metadata  
* activation hints  
* capabilities

---

## **6.5 Provenance**

Imported skills preserve:

* source origin  
* importer information  
* transformation metadata

---

## **6.6 Overlays**

Operational layers applied at:

* global  
* organization  
* project  
* session

scopes.

---

# **7\. Architecture Overview**

Portable Skill Spec (PSS)  
        ↓  
Registry \+ Runtime Intelligence  
        ↓  
Activation Engine  
        ↓  
Interfaces  
  ├── CLI  
  ├── MCP bridge  
  └── Future integrations  
        ↓  
Agent Ecosystems  
  ├── Claude  
  ├── OpenCode  
  ├── Pi  
  ├── Codex  
  └── Others  
---

# **8\. Portable Skill Specification**

## **Canonical Skill Format**

skill-name/  
  clew.yaml  
  skill.md  
  examples/  
---

## **`clew.yaml`**

Contains:

* identity  
* capabilities  
* compatibility  
* composition  
* provenance  
* activation metadata

---

## **`skill.md`**

Contains:

* operational instructions  
* guidance  
* policies  
* examples

Markdown-first and human-readable.

---

# **9\. Registry Architecture**

## **Canonical Storage**

Filesystem-based skill bundles.

Example:

\~/.clew/global/  
project/.clew/  
---

## **Runtime Intelligence Layer**

SQLite-backed registry metadata.

Stores:

* telemetry  
* indexes  
* provenance mappings  
* activation metadata  
* overlap/conflict references

---

## **Registry Rebuildability**

The SQLite registry should be rebuildable from canonical skill bundles.

Filesystem remains the source of truth.

---

# **10\. Layered Registry Model**

## **Registry Hierarchy**

global  
  ↓  
organization  
  ↓  
project  
  ↓  
session overrides  
---

## **Precedence**

session  
  overrides project  
  overrides org  
  overrides global  
---

# **11\. Activation Engine**

## **Philosophy**

Activation is:

* advisory  
* explainable  
* capability-aware

NOT autonomous.

---

## **v0.1 Activation Sources**

* keyword matching  
* tags  
* AGENTS.md references  
* lightweight repository heuristics

---

## **Future Activation Layers**

* embeddings  
* semantic similarity  
* telemetry weighting  
* model-assisted routing

---

# **12\. Import/Export Philosophy**

## **Imports**

Preserve-first normalization.

Shared concepts normalize into canonical clew structures.

Source-specific semantics remain in extension namespaces.

---

## **Exports**

Best-effort interoperability with:

* compatibility reporting  
* degradation warnings  
* explainable fidelity

---

## **Extension Namespaces**

extensions:  
  claude:  
  opencode:  
  pi:  
---

# **13\. Runtime Architecture**

## **Core Runtime**

clew-core

Provides:

* registry  
* activation  
* telemetry  
* composition  
* import/export orchestration

---

## **Interfaces**

### **CLI**

Primary UX surface.

### **MCP Bridge**

Optional interoperability layer.

### **Future Interfaces**

* TUI  
* IDE integrations  
* orchestration bridges

---

# **14\. CLI UX Philosophy**

clew is:

* explainable  
* inspectable  
* searchable  
* operationally transparent

---

## **Example Commands**

### **Discovery**

clew search  
clew recommend  
clew explain

### **Management**

clew import  
clew export  
clew enable  
clew disable

### **Registry Intelligence**

clew overlaps  
clew conflicts  
clew telemetry  
---

# **15\. AGENTS.md Integration**

`AGENTS.md` may:

* reference skills  
* activate overlays  
* express runtime preferences

`AGENTS.md` does NOT replace the skill system.

---

# **16\. Technical Stack**

## **Runtime**

* TypeScript  
* Node.js

## **Workspace**

* pnpm workspaces

## **Schema Validation**

* Zod

## **Registry DB**

* SQLite (`better-sqlite3` recommended)

---

# **17\. Monorepo Structure**

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

# **18\. MVP Scope (v0.1)**

## **Included**

### **Core**

* canonical skill schema  
* YAML \+ Markdown bundles  
* additive composition  
* provenance  
* layered registries

---

### **Registry**

* filesystem bundles  
* SQLite index  
* local telemetry

---

### **CLI**

* import  
* export  
* list  
* search  
* explain  
* recommend

---

### **Activation**

* tags  
* keywords  
* AGENTS.md references  
* lightweight heuristics

---

### **Importers/Exporters**

* Claude  
* OpenCode

---

# **19\. Explicitly Deferred**

## **NOT v0.1**

* orchestration engine  
* executable workflows  
* semantic embeddings  
* daemon runtime  
* IDE plugins  
* adaptive routing  
* cloud registries  
* remote sync  
* autonomous execution

---

# **20\. Architectural Invariants**

## **Skills are declarative.**

## **Runtime behavior is explainable.**

## **Canonical skills live on the filesystem.**

## **Registry intelligence is local-first.**

## **Imports/exports degrade gracefully.**

## **clew is interoperability-first.**

## **No hidden activation or prompt injection.**

---

# **21\. Future Directions**

Potential future areas include:

* semantic indexing  
* operational observability  
* TUI  
* IDE integrations  
* orchestration overlays  
* advanced telemetry intelligence  
* capability negotiation  
* organization registries

These are intentionally deferred until the core interoperability and operational abstraction layers are validated.

---

# **22\. Success Criteria**

clew succeeds if it enables developers to:

* reuse operational knowledge across ecosystems  
* manage skill sprawl coherently  
* maintain explainable operational overlays  
* preserve portability across coding agents  
* establish durable operational project memory

without requiring:

* vendor lock-in  
* opaque orchestration  
* centralized infrastructure  
* workflow-engine complexity

