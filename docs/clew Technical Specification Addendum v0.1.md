# **clew Technical Specification Addendum v0.1**

## **Core Schemas, Contracts, and Runtime Interfaces**

---

# **1\. Purpose**

This document defines the initial technical specification for:

* canonical skill schemas  
* registry contracts  
* runtime interfaces  
* activation pipelines  
* importer/exporter contracts  
* registry storage structure

This specification complements:

clew PRD v0.1  
---

# **2\. Canonical Skill Bundle Structure**

## **Required Layout**

skill-name/  
├── clew.yaml  
└── skill.md  
---

## **Optional Layout**

skill-name/  
├── clew.yaml  
├── skill.md  
├── examples/  
├── templates/  
├── assets/  
└── tests/  
---

# **3\. Canonical Skill Schema**

## **Example**

id: safe-refactor

version: 1.0.0

kind: instruction\_skill

name: Safe Refactor

description: Safely refactor existing codebases incrementally.

instructions:  
  file: skill.md

tags:  
  \- refactoring  
  \- engineering  
  \- safety

capabilities:  
  required:  
    \- filesystem  
    \- terminal

  optional:  
    \- git

compatibility:  
  providers:  
    \- claude  
    \- codex  
    \- opencode

preferences:  
  reasoning:  
    preferred\_models:  
      \- claude-opus  
      \- gemini-2.5-pro

activation:  
  triggers:  
    \- refactor  
    \- cleanup  
    \- technical debt

extends:  
  \- engineering-core  
  \- safe-editing

policies:  
  \- preserve public interfaces  
  \- prefer incremental diffs  
  \- run tests before modification

provenance:  
  source:  
    type: github  
    location: mattpocock/skills  
    original\_id: safe-refactor

  imported\_via:  
    importer: claude

extensions:  
  claude:  
    slash\_command: /safe-refactor

  opencode:  
    agent\_mode: safe  
---

# **4\. Required Schema Fields**

## **Required**

id:  
version:  
kind:  
name:  
instructions:  
---

## **Optional**

description:  
tags:  
capabilities:  
compatibility:  
preferences:  
activation:  
extends:  
policies:  
provenance:  
extensions:  
---

# **5\. Skill Kinds**

## **v0.1 Supported**

instruction\_skill  
---

## **Reserved Future Types**

workflow\_skill  
persona\_skill  
tool\_extension

These are NOT implemented in v0.1.

---

# **6\. Capability Taxonomy**

## **v0.1 Core Capabilities**

filesystem  
terminal  
internet  
git  
mcp  
multimodal  
vector\_memory  
persistent\_memory  
subagents  
---

# **7\. Composition Rules**

## **Additive Composition**

Composition merges:

* tags  
* policies  
* capabilities  
* activation triggers  
* compatibility metadata

---

## **Override Rules**

Local/project skills may override:

* preferences  
* activation weighting  
* optional metadata

---

## **Explicit Non-Goals**

Composition does NOT:

* execute parent skills  
* imply workflow ordering  
* create dependency graphs

---

# **8\. Extension Namespace Rules**

## **Canonical Structure**

extensions:  
  provider-name:  
---

## **v0.1 Reserved Namespaces**

claude  
opencode  
pi  
codex  
local  
---

## **Extension Rules**

Extensions:

* MUST NOT mutate core schema semantics  
* MAY preserve provider-specific metadata  
* SHOULD degrade gracefully

---

# **9\. Registry Layout**

## **Global Registry**

\~/.clew/global/  
---

## **Organization Registry**

\~/.clew/orgs/\<org\>/  
---

## **Project Registry**

project/.clew/  
---

## **Runtime Registry DB**

\~/.clew/registry.db  
---

# **10\. SQLite Runtime Registry**

## **Core Responsibilities**

Stores:

* telemetry  
* provenance indexes  
* activation metadata  
* overlap references  
* registry indexes

Filesystem remains canonical truth.

---

# **11\. Suggested SQLite Tables**

## **skills**

skills (  
  id,  
  version,  
  path,  
  checksum,  
  source\_type,  
  imported\_at  
)  
---

## **telemetry**

telemetry (  
  skill\_id,  
  activation\_count,  
  last\_used,  
  disabled,  
  favorite  
)  
---

## **overlaps**

overlaps (  
  skill\_a,  
  skill\_b,  
  similarity\_score  
)  
---

## **conflicts**

conflicts (  
  skill\_a,  
  skill\_b,  
  reason  
)  
---

## **registry\_warnings**

registry\_warnings (
  id,
  position,
  code,
  severity,
  field,
  message,
  provider,
  warning\_json
)

`registry_warnings` stores compatibility warnings produced while rebuilding the registry index from filesystem bundles. These rows are derived, rebuildable SQLite state; filesystem skill bundles remain canonical truth.
---

# **12\. Runtime Interfaces**

## **SkillRegistry**

interface SkillRegistry {  
  readonly warnings: CompatibilityWarning\[\]
  loadSkills(): Promise\<Skill\[\]\>  
  resolveSkill(id: string): Promise\<Skill\>  
  search(query: string): Promise\<Skill\[\]\>  
  getTelemetry(id: string): Promise\<Telemetry\>  
}  

The registry retains the warning snapshot produced by the most recent registry rebuild. Read surfaces expose those warnings alongside successful results so callers can detect degraded indexing without treating the read as a total failure.
---

## **ActivationEngine**

interface ActivationEngine {  
  recommend(context: ActivationContext): Promise\<Recommendation\[\]\>  
}  
---

## **Importer**

interface Importer {  
  canImport(source: unknown): boolean  
  import(source: unknown): Promise\<SkillBundle\>  
}  
---

## **Exporter**

interface Exporter {  
  export(skill: SkillBundle): Promise\<ExportResult\>  
}  
---

## **MCP Read Envelopes**

MCP `search`, `recommend`, `lookup`, and `explain` return named result fields plus top-level `warnings`. Successful reads include the registry warning snapshot retained by `SkillRegistry`. Request-time degradation, such as unknown, disabled, or unrecommended skills, appends a warning to the same envelope and returns a `null` payload where appropriate. Capability warnings remain attached to the affected recommendation object.

MCP warning objects use the shared compatibility warning shape:

* code
* message
* severity
* optional provider
* optional field
---

# **13\. Activation Context**

## **Example**

interface ActivationContext {  
  task?: string  
  repoPath?: string  
  activeFiles?: string\[\]  
  capabilities?: string\[\]  
  agentsMd?: string  
}  
---

# **14\. Recommendation Model**

## **Example**

interface Recommendation {  
  skillId: string  
  score: number

  reasons: string\[\]

  warnings?: string\[\]  
}  
---

# **15\. Explainability Requirements**

All activation recommendations MUST expose:

* why a skill activated  
* what signals contributed  
* capability constraints  
* overlap/conflict warnings

Explainability is mandatory.

---

# **16\. Import Contracts**

## **Importers MUST**

* preserve provenance  
* normalize shared semantics  
* preserve provider-specific extensions  
* emit transformation warnings

---

## **Importers MUST NOT**

* silently discard operational meaning  
* mutate canonical semantics invisibly

---

# **17\. Export Contracts**

## **Exporters MUST**

* emit compatibility reports  
* preserve intent  
* warn on degraded fidelity

---

## **Exporters MUST NOT**

* silently omit unsupported features  
* mutate operational meaning invisibly

---

# **18\. AGENTS.md Integration**

## **Example**

\# Active Skills

\- engineering-core  
\- safe-editing  
\- typescript-core  
---

## **Runtime Behavior**

The runtime:

* resolves referenced skills  
* applies overlays  
* activates compatible operational guidance

---

# **19\. CLI Contract Philosophy**

CLI output should be:

* explainable  
* inspectable  
* scriptable  
* human-readable

---

# **20\. Example CLI Flows**

## **Import**

clew import ./claude-skill  
---

## **Search**

clew search "safe database migration"  
---

## **Recommend**

clew recommend "refactor authentication service"  
---

## **Explain**

clew explain safe-refactor  
---

# **21\. Explainability Example**

Recommended:  
\- safe-refactor

Reasons:  
\- task contains "refactor"  
\- TypeScript repo detected  
\- commonly paired with engineering-core

Warnings:  
\- overlaps with incremental-refactor  
---

# **22\. Deferred Technical Features**

## **Deferred from v0.1**

* embeddings  
* semantic indexing  
* vector DBs  
* orchestration runtime  
* executable workflows  
* daemon runtime  
* adaptive routing  
* cloud sync

---

# **23\. Testing Philosophy**

## **Core Goals**

Validate:

* interoperability correctness  
* schema stability  
* explainability  
* graceful degradation  
* additive composition

---

## **Priority Areas**

### **Import/export fidelity**

### **Composition correctness**

### **Explainability guarantees**

### **Registry rebuildability**

### **Activation determinism**

---

# **24\. Security & Trust Model**

## **clew MUST avoid**

* hidden activation  
* opaque prompt injection  
* silent runtime mutation  
* non-inspectable orchestration

---

## **clew SHOULD prioritize**

* local-first operation  
* inspectability  
* deterministic transforms  
* explainable recommendations

---

# **25\. Future Extension Points**

Reserved future systems:

* semantic indexing  
* telemetry intelligence  
* orchestration overlays  
* capability negotiation  
* IDE integrations  
* TUI  
* remote registries

These MUST remain layered extensions rather than foundational runtime assumptions.
