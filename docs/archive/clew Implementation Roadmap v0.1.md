# **clew Implementation Roadmap v0.1**

## **Phased Build Plan and Execution Strategy**

---

# **1\. Purpose**

This document defines the phased implementation strategy for:

* clew v0.1  
* repository sequencing  
* package implementation order  
* testing priorities  
* milestone validation

The roadmap intentionally prioritizes:

* architectural validation  
* interoperability correctness  
* explainability  
* operational trust

over:

* advanced orchestration  
* autonomous behavior  
* UI complexity

---

# **2\. Core Development Philosophy**

## **Validate the abstraction layer first**

clew’s primary innovation is:

portable operational knowledge interoperability

NOT:

* orchestration  
* workflow execution  
* autonomous agents

The roadmap reflects this priority.

---

# **3\. Initial Repository Bootstrap**

## **Goal**

Create:

* monorepo structure  
* package boundaries  
* schema foundation  
* CI/testing baseline

---

# **4\. Repository Initialization**

## **Create repository**

mkdir clew  
cd clew  
---

## **Initialize workspace**

pnpm init  
---

## **Configure workspace**

pnpm-workspace.yaml  
---

# **5\. Initial Monorepo Structure**

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

# **6\. Recommended Initial Tooling**

## **Core**

TypeScript  
Node.js  
pnpm  
---

## **Validation**

Zod  
---

## **Testing**

Vitest  
---

## **Formatting**

Prettier  
ESLint  
---

## **SQLite**

better-sqlite3  
---

# **7\. Phase 1 — clew-schema**

## **Goal**

Establish canonical operational contracts.

This is the highest-priority foundational package.

---

# **8\. clew-schema Responsibilities**

Defines:

* Zod schemas  
* TS interfaces  
* validation contracts  
* extension namespace rules

---

# **9\. Phase 1 Deliverables**

## **Required**

### **Skill schema**

### **Capability schema**

### **Composition schema**

### **Provenance schema**

### **Extension namespace schema**

### **Recommendation schema**

---

# **10\. Phase 1 Tests**

## **Required**

### **Schema validation tests**

### **Invalid bundle tests**

### **Extension namespace tests**

### **Composition merge tests**

---

# **11\. Phase 1 Success Criteria**

A canonical skill bundle can be validated deterministically.  
---

# **12\. Phase 2 — clew-core**

## **Goal**

Build the runtime intelligence layer.

---

# **13\. clew-core Responsibilities**

Provides:

* registry loading  
* layered overlays  
* composition  
* telemetry  
* activation engine  
* provenance tracking

---

# **14\. Phase 2 Deliverables**

## **Registry**

### **Filesystem bundle discovery**

### **Layered registry resolution**

### **Registry precedence handling**

---

## **Composition**

### **Additive merge engine**

### **Conflict detection foundations**

---

## **Activation**

### **Keyword activation**

### **Tag activation**

### **AGENTS.md references**

### **Lightweight heuristics**

---

## **Telemetry**

### **Local runtime telemetry**

### **Usage counters**

### **Disable/archive state**

---

# **15\. Phase 2 SQLite Deliverables**

## **Implement tables**

### **skills**

### **telemetry**

### **overlaps**

### **conflicts**

---

# **16\. Phase 2 Tests**

## **Required**

### **Registry rebuildability**

### **Overlay precedence correctness**

### **Composition determinism**

### **Activation explainability**

### **SQLite consistency**

---

# **17\. Phase 2 Success Criteria**

A layered registry can deterministically resolve and recommend skills with explainable reasoning.  
---

# **18\. Phase 3 — clew-cli**

## **Goal**

Create the primary human interaction surface.

---

# **19\. v0.1 Required Commands**

## **Discovery**

clew-cli search  
clew-cli recommend  
clew-cli explain  
clew-cli list  
---

## **Management**

clew-cli import  
clew-cli export  
clew enable  
clew disable  
---

## **Diagnostics**

clew overlaps  
clew conflicts  
clew telemetry  
clew-cli doctor  
---

# **20\. CLI UX Requirements**

CLI output MUST be:

* explainable  
* inspectable  
* scriptable  
* deterministic

---

# **21\. CLI Success Criteria**

Users can understand WHY recommendations occur.

This is critical.

---

# **22\. Phase 4 — Importers**

## **Goal**

Validate interoperability abstraction correctness.

---

# **23\. v0.1 Importers**

## **Required**

### **Claude importer**

### **OpenCode importer**

ONLY.

---

# **24\. Importer Requirements**

Importers MUST:

* preserve provenance  
* preserve extensions  
* normalize canonical semantics  
* emit transformation warnings

---

# **25\. Importer Test Fixtures**

## **Required**

Create:

tests/fixtures/

Containing:

* real imported skills  
* edge cases  
* malformed bundles  
* degraded compatibility cases

---

# **26\. Importer Success Criteria**

Imported operational meaning is preserved explainably.  
---

# **27\. Phase 5 — Exporters**

## **Goal**

Validate interoperability round-trip behavior.

---

# **28\. v0.1 Exporters**

## **Required**

### **Claude exporter**

### **OpenCode exporter**

ONLY.

---

# **29\. Exporter Requirements**

Exporters MUST:

* preserve intent  
* emit compatibility reports  
* degrade gracefully

---

# **30\. Exporter Success Criteria**

clew skills can round-trip into supported ecosystems with understandable fidelity.  
---

# **31\. Phase 6 — AGENTS.md Integration**

## **Goal**

Validate project-scoped operational overlays.

---

# **32\. Required Features**

### **AGENTS.md parsing**

### **Skill activation references**

### **Overlay resolution**

### **Runtime preference extraction**

---

# **33\. AGENTS.md Success Criteria**

Durable project operational memory becomes portable and inspectable.  
---

# **34\. Phase 7 — clew-mcp**

## **Goal**

Expose clew operational knowledge through MCP.

---

# **35\. v0.1 MCP Scope**

## **Minimal only**

### **Search**

### **Recommend**

### **Explain**

### **Registry lookup**

---

# **36\. Explicitly Deferred from MCP**

NO:

* orchestration  
* execution  
* workflow control  
* autonomous activation

---

# **37\. Reference Skills**

## **v0.1 Required Skills**

Create canonical reference skills:

### **engineering-core**

### **safe-editing**

### **typescript-core**

### **debugging-core**

### **refactor-safely**

These serve as:

* examples  
* fixtures  
* regression tests  
* interoperability validation

---

# **38\. Testing Philosophy**

## **Highest Priority**

### **Interoperability correctness**

### **Explainability**

### **Deterministic composition**

### **Registry rebuildability**

### **Graceful degradation**

---

# **39\. Explicitly Lower Priority**

## **v0.1 deprioritizes**

* performance optimization  
* orchestration sophistication  
* embeddings  
* semantic routing  
* UI polish

Correct abstraction validation matters more.

---

# **40\. Suggested Release Milestones**

## **v0.1-alpha**

* schema  
* registry  
* composition  
* CLI skeleton

---

## **v0.1-beta**

* import/export  
* explainability  
* AGENTS.md integration

---

## **v0.1**

* interoperability validation  
* stable schema  
* stable registry  
* documented workflows

---

# **41\. Post-v0.1 Roadmap**

## **v0.2**

### **semantic indexing**

### **embeddings**

### **overlap intelligence**

---

## **v0.3**

### **richer MCP integrations**

### **capability negotiation**

### **telemetry intelligence**

---

## **v0.4**

### **TUI**

### **operational observability**

### **advanced discovery**

---

## **v1+**

Potential future areas:

* orchestration overlays  
* organization registries  
* workflow layers  
* advanced runtime routing

These remain intentionally layered extensions.

---

# **42\. Critical Architectural Constraints**

## **MUST preserve**

### **Explainability**

### **Deterministic transforms**

### **Local-first operation**

### **Declarative skills**

### **Additive composition**

### **Interoperability-first design**

---

# **43\. Failure Modes to Avoid**

## **Avoid**

### **Workflow-engine creep**

### **Hidden runtime orchestration**

### **Silent prompt injection**

### **Vendor lock-in**

### **Dependency graph/package-manager complexity**

### **Autonomous activation behavior**

---

# **44\. Final Success Metric**

clew succeeds if developers begin treating operational knowledge as:

portable infrastructure

rather than:

* isolated prompts  
* vendor-specific hacks  
* opaque orchestration layers

That is the core architectural thesis of the project.

