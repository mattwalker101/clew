# Design Specification: clew v0.6.0 LanceDB Immutable Audit Ledger

**Status:** Approved
**Date:** 2026-05-29
**Target Version:** v0.6.0

---

## 1. Executive Summary

To complete the security and telemetry goals of `clew`, the **v0.6.0 LanceDB Immutable Audit Ledger** layer introduces a local, high-speed, vector-queryable security audit system. Building upon the v0.5.0 skill validation layers, this audit system logs every CLI command, MCP tool call, and security event, providing AI-augmented anomaly detection to spot subagent compromises or atypical script execution profiles.

---

## 2. Architecture & Data Contracts

### 2.1 Ledger Schema
All operational actions are initially captured as single JSON lines inside a local `audit.jsonl` file.

```typescript
export interface AuditEvent {
  timestamp: string;      // ISO 8601 format
  eventId: string;        // Unique UUIDv4
  eventType: "cli" | "mcp" | "veto" | "system";
  actor: string;          // e.g. "human", "agent:codex", "system"
  context: {
    cwd: string;
    gitBranch?: string;
    gitCommit?: string;
    activeSkills: string[];
  };
  payload: {
    commandLine?: string; // For CLI commands
    toolName?: string;    // For MCP tools
    arguments?: any;      // For MCP tool arguments / CLI arguments
    exitCode?: number;    // Result status of execution
    ruleId?: string;      // For vetoes
    message?: string;     // Short description
  };
  vectorText: string;     // Normalized description text used to generate embeddings
}
```

### 2.2 LanceDB Database Schema
To enable local vector indexing, the JSONL logs are incrementally synchronized to a local LanceDB table:
* `vector`: `Float32[]` (384-dimension vector matching the `Xenova/all-MiniLM-L6-v2` model format)
* `timestamp`: `String`
* `eventId`: `String`
* `eventType`: `String`
* `actor`: `String`
* `cwd`: `String`
* `payloadJson`: `String` (Stringified JSON payload)
* `vectorText`: `String`

---

## 3. Real-Time Logging Pipeline

* **Zero-Overhead & Crash Resilience:** File appending operations wrap in silent `try-catch` structures. If permissions are restricted or paths are write-locked, a compatibility warning logs, but active execution is never blocked.
* **CLI Interception:** Pre-command and post-command hooks intercept command line entries, git status context, active capabilities, and execution exit codes.
* **MCP Integration:** Tool routing interceptors capture tool names, workspace directory state, and argument footprints.

---

## 4. Incremental Indexing & Local Embeddings

* **Local Embeddings:** Employs the existing `EmbeddingEngine` utilising HuggingFace's `Xenova/all-MiniLM-L6-v2` to vectorize descriptive logs in **~20-50ms** offline.
* **Checkpoint Tracker:** Queries LanceDB for the most recent `timestamp` before running sync, then delta-syncs only newer entries from `audit.jsonl` to conserve local compute resources.
* **Token Batching:** Groups multiple new events to tokenize in parallel, speeding up back-index tasks.

---

## 5. Anomaly Detection & CLI Operations

* **Cosine Distance Gateway:** Normalizes action descriptions into vectors and matches them against historical actions via a K-Nearest Neighbors (KNN) search. Distances exceeding `0.75` trigger anomaly flags.
* **Subcommands:**
  * `clew audit sync`: Incrementally processes raw logs into the vector store.
  * `clew audit query "<text>"`: Conducts semantic vector query searches.
  * `clew audit analyze`: Reviews the latest active run sequences for anomaly scores and prints beautiful warning summary blocks.
