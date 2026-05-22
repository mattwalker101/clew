# ARCHITECTURE

This document describes the high-level architecture of **clew**.

## 🏗 System Overview

`clew` is designed as a series of layered, decoupled packages that prioritize deterministic operational logic over runtime "magic".

```mermaid
graph TD
    User([User / AI Agent]) --> CLI[clew-cli]
    User --> MCP[clew-mcp]
    
    subgraph "Public Interfaces"
        CLI
        MCP
    end
    
    CLI --> Core[clew-core]
    MCP --> Core
    
    subgraph "Runtime Engine"
        Core --> Registry[(Skill Registry)]
        Core --> Activation[Activation Engine]
        Core --> Composition[Composition Engine]
    end
    
    Registry --> FS[Local Filesystem Bundles]
    Registry --> SQLite[(SQLite Index)]
    
    subgraph "Interoperability"
        Core --> Importers[clew-importers]
        Core --> Exporters[clew-exporters]
    end
    
    Importers --> Claude[Claude Skills]
    Importers --> OpenCode[OpenCode Agents]
    
    subgraph "Foundations"
        Schema[@clew-ops/schema]
    end
    
    Core -.-> Schema
    CLI -.-> Schema
    MCP -.-> Schema
    Importers -.-> Schema
    Exporters -.-> Schema
```

## 📦 Package Responsibilities

### 1. `@clew-ops/schema`
The source of truth for all data structures. Every object that moves through the system is validated against these Zod schemas.

### 2. `@clew-ops/core`
The "brain" of the system.
*   **Registry**: Discovers skills in the filesystem and builds the SQLite index.
*   **Activation Engine**: Processes queries and contexts to find the most relevant skills.
*   **Composition**: Merges parent/child skill instructions additively.

### 3. `@clew-ops/cli`
The primary human entry point. Built to be fast, explainable, and scriptable.

### 4. `@clew-mcp`
Bridges the system to the **Model Context Protocol**. Allows other agents to query the registry as if it were a local tool.

### 5. `@clew-importers` / `@clew-exporters`
Handles the lossy transformation between `clew`'s canonical format and third-party ecosystems like Claude and OpenCode.

## 🧵 The "Thread" Philosophy
Operational knowledge is treated as **immutable, local-first infrastructure**. 
*   **FS is Canonical**: If the SQLite DB is deleted, it can be perfectly rebuilt from the filesystem.
*   **Explainable Reasoning**: Every recommendation includes a list of "Signals" and "Reasons" explaining the match.
