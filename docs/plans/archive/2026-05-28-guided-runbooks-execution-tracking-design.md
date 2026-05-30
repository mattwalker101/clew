# Design Document: clew v0.3 — Guided Runbooks & Execution Tracking
**Date:** 2026-05-28  
**Status:** Approved  
**Version:** v0.3.0-spec

---

## 🏗 Executive Summary

As coding agents transition from simple tool executors to complex multi-step reasoning systems, they require clear execution guidance. Currently, `clew` provides passive, declarative recommendations about *what* skills to use. 

**clew v0.3** introduces **Guided Runbooks & Execution Tracking (Pillar A)**. This feature transforms `clew` into an active, schema-driven guidance system that leads coding agents step-by-step through complex tasks, validates progress using deterministic verification gates, and streams execution states in real-time to the **clew Cockpit** dashboard.

---

## 🧩 Architectural Overview

The Guided Runbook feature maps across all layers of the `clew` ecosystem:

```mermaid
graph TD
    Agent([AI Agent / Claude Code]) -->|mcp tools| MCP[@clew-mcp]
    Dev([Developer]) -->|cli commands| CLI[@clew-cli]
    Dev -->|web dashboard| Dashboard[@clew-dashboard]
    
    MCP -->|execute| Core[@clew-ops/core]
    CLI -->|execute| Core
    Dashboard -->|http api| REST[REST Server]
    REST -->|execute| Core
    
    subgraph "Core Registry & Execution"
        Core --> Schema[@clew-ops/schema]
        Core --> DB[(session.db SQLite)]
        Core --> Runner[Gating Runner]
    end
```

---

## 1. Data Model & Schema Updates (`@clew-ops/schema`)

The canonical `clew.yaml` schema will be updated to support an optional `steps` array.

### Zod Schema Additions
In `packages/clew-schema/src/manifest.ts`:
```typescript
import { z } from 'zod';

export const VerificationGateSchema = z.union([
  z.object({
    type: z.literal("file"),
    path: z.string(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal("grep"),
    path: z.string(),
    pattern: z.string(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal("command"),
    command: z.string(),
    timeoutMs: z.number().default(15000).optional(),
    description: z.string().optional()
  })
]);

export const RunbookStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  instruction: z.string(),
  gates: z.array(VerificationGateSchema).default([])
});

// Added to main ManifestSchema
export const ManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  // ... existing fields ...
  steps: z.array(RunbookStepSchema).optional()
});
```

---

## 2. Session Database Schema (SQLite)

Runbook execution is tracked in a dedicated SQLite database (`session.db`) placed in the local registry directory. This keeps the registry index rebuildable from the filesystem without losing session history.

### Database Tables
```sql
CREATE TABLE IF NOT EXISTS session_runs (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed')),
    current_step_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_step_states (
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed', 'failed')),
    attempts INTEGER DEFAULT 0,
    last_verified_at TEXT,
    error_log TEXT,
    PRIMARY KEY (session_id, step_id),
    FOREIGN KEY (session_id) REFERENCES session_runs(id) ON DELETE CASCADE
);
```

---

## 3. Core Execution Engine (`@clew-ops/core`)

The `@clew-ops/core` package exposes the `SessionManager` class to orchestrate runbooks transactionally.

```typescript
export interface VerificationResult {
  success: boolean;
  gates: {
    type: "file" | "grep" | "command";
    success: boolean;
    message?: string;
    error?: string;
  }[];
}

export class SessionManager {
  constructor(private dbPath: string) {}

  async createSession(skillId: string): Promise<SessionRun>;
  async getCurrentStep(sessionId: string): Promise<RunbookStep | null>;
  async verifyCurrentStep(sessionId: string): Promise<VerificationResult>;
  async resetSession(sessionId: string): Promise<void>;
  async overrideStep(sessionId: string, stepId: string): Promise<void>;
}
```

### Verification Gate Execution Logic
1. **File Gate**: Resolves relative file path against current workspace directory. Verifies the file is readable and present.
2. **Grep Gate**: Reads the file contents and executes a regular expression check.
3. **Command Gate**:
   - Executes the validation command inside the workspace directory.
   - Monitors process exit codes. An exit code of `0` denotes success.
   - Restricts execution using a **15-second timeout** boundary to avoid hang-ups.
   - Safely captures stdout and stderr outputs to store in `error_log` upon failure.

---

## 4. Interface Integrations

### Model Context Protocol (`@clew-mcp`)
Agents interact with runbooks using three new tools:
- `start_runbook(skill_id: string)`: Initializes a session and returns the active step instructions.
- `get_runbook_status(session_id: string)`: Returns progress metrics and the status of each step.
- `verify_runbook_step(session_id: string)`: Evaluates the active step. If successful, advances and automatically returns the instructions for the next step. If unsuccessful, provides detailed error logs to guide corrections.

### Command Line Interface (`@clew-ops/cli`)
Adds the `runbook` subcommand category:
- `clew-cli runbook start <skill-id>`
- `clew-cli runbook status [--json]`
- `clew-cli runbook verify`

### Cockpit Dashboard (`@clew-ops/dashboard`)
Visualizes and updates runbook state in real-time:
- **Interactive Visual Timeline**: Glowing indicators, elapsed timers, and animated transitions for active, completed, and failed steps.
- **Log Streamer**: Terminal viewport capturing the output of active command verification runs.
- **Bypass Button**: Security-restricted override to skip steps manually when visual/subjective check is appropriate.

---

## 5. Security & Verification Plan

### Security Safeguards
- **Sandboxed Execution**: Commands are run strictly inside the local workspace path directory.
- **Strict Gating Timeouts**: Verification processes are forcibly terminated after 15 seconds to prevent memory/resource leaks.
- **Explicit Override Tracing**: Manual overrides are recorded inside the database logs for trace audits.

### Automated Testing
- **Unit Tests**: Full test suite inside `@clew-ops/core` using vitest to mock file structures, grep matches, and verify SQLite transaction outcomes.
- **Integration Tests**: Execute simulated agent sessions through the MCP server using a mock client and verify expected runbook progress.
