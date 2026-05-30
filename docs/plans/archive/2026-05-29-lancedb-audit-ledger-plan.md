# LanceDB Immutable Audit Ledger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a local, high-speed vector-queryable security audit system that logs CLI/MCP events and runs offline anomaly detection.

**Architecture:** Action logs are written in real-time to a secure JSONL ledger. These logs are incrementally vectorized via our local Transformers embedding model and synchronized to a local LanceDB instance for vector similarity queries and anomaly scoring.

**Tech Stack:** TypeScript, `@lancedb/lancedb`, `@huggingface/transformers`, Node.js `fs` APIs, `vitest`.

---

### Task 1: Real-time Append Logging (`packages/clew-core`)

**Files:**
- Create: `packages/clew-core/src/audit/logger.ts`
- Create: `packages/clew-core/src/audit/logger.test.ts`
- Modify: `packages/clew-core/src/index.ts` (export logger functions)

**Step 1: Write the failing test**

```typescript
// packages/clew-core/src/audit/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAuditEvent } from "./logger.js";

describe("Audit Logger", () => {
  const tempDir = join(tmpdir(), `clew-audit-test-${Date.now()}`);
  const logPath = join(tempDir, "audit.jsonl");

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should write valid audit events safely to JSONL file", () => {
    writeAuditEvent({
      eventType: "cli",
      actor: "human",
      context: { cwd: "/test", activeSkills: [] },
      payload: { commandLine: "clew recommend" },
      vectorText: "human ran CLI command: clew recommend"
    }, logPath);

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, "utf-8").trim();
    const event = JSON.parse(content);
    expect(event.eventType).toBe("cli");
    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/clew-core/src/audit/logger.test.ts`
Expected: FAIL (Cannot find module)

**Step 3: Write minimal implementation**

```typescript
// packages/clew-core/src/audit/logger.ts
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AuditEvent {
  timestamp: string;
  eventId: string;
  eventType: "cli" | "mcp" | "veto" | "system";
  actor: string;
  context: {
    cwd: string;
    gitBranch?: string;
    gitCommit?: string;
    activeSkills: string[];
  };
  payload: any;
  vectorText: string;
}

export function writeAuditEvent(
  event: Omit<AuditEvent, "timestamp" | "eventId">,
  logPath?: string
): void {
  const finalPath = logPath || join(homedir(), ".clew", "audit.jsonl");
  const fullEvent: AuditEvent = {
    ...event,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  try {
    const parentDir = join(finalPath, "..");
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.appendFileSync(finalPath, JSON.stringify(fullEvent) + "\n", "utf-8");
  } catch (err) {
    console.warn("Clew Audit Logging warning: Failed writing to audit log", err);
  }
}
```

Modify `packages/clew-core/src/index.ts` to export:
```typescript
export { writeAuditEvent, type AuditEvent } from "./audit/logger.js";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/clew-core/src/audit/logger.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/audit/logger.ts packages/clew-core/src/audit/logger.test.ts packages/clew-core/src/index.ts
git commit -m "feat: implement real-time JSONL audit logging core"
```

---

### Task 2: CLI Interception and Hooks (`packages/clew-cli`)

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Modify: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**

```typescript
// Add test in packages/clew-cli/src/index.test.ts to verify CLI logging output is triggered.
// Mock writeAuditEvent and assert it's called during CLI invocations.
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Modify `packages/clew-cli/src/index.ts` to invoke `writeAuditEvent` at the start of command resolution and when a constitutional veto occurs:
```typescript
import { writeAuditEvent } from "@clew-ops/core";

// At command start:
writeAuditEvent({
  eventType: "cli",
  actor: "human",
  context: {
    cwd: process.cwd(),
    activeSkills: []
  },
  payload: {
    commandLine: process.argv.slice(2).join(" ")
  },
  vectorText: `CLI command invoked: clew ${process.argv.slice(2).join(" ")}`
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -am "feat: integrate audit logging hooks into CLI entry point"
```

---

### Task 3: LanceDB Synchronization Engine (`packages/clew-core`)

**Files:**
- Create: `packages/clew-core/src/audit/sync.ts`
- Create: `packages/clew-core/src/audit/sync.test.ts`
- Modify: `packages/clew-core/package.json` (add `@lancedb/lancedb` dependency)

**Step 1: Write the failing test**

```typescript
// packages/clew-core/src/audit/sync.test.ts
// Test syncAuditLedger initializes LanceDB table and incrementally indexes JSONL log entries.
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/clew-core/src/audit/sync.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/clew-core/src/audit/sync.ts
import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { EmbeddingEngine } from "../index.js";
import { type AuditEvent } from "./logger.js";

export async function syncAuditLedger(
  dbPath?: string,
  logPath?: string
): Promise<{ synced: number }> {
  const finalDbPath = dbPath || join(homedir(), ".clew", "lancedb");
  const finalLogPath = logPath || join(homedir(), ".clew", "audit.jsonl");

  if (!fs.existsSync(finalLogPath)) {
    return { synced: 0 };
  }

  const db = await lancedb.connect(finalDbPath);
  let table: lancedb.Table;

  const schema = {
    vector: new Float32Array(384),
    timestamp: "string",
    eventId: "string",
    eventType: "string",
    actor: "string",
    cwd: "string",
    payloadJson: "string",
    vectorText: "string"
  };

  try {
    table = await db.openTable("audit_events");
  } catch {
    table = await db.createTable("audit_events", [schema]);
  }

  // Get most recent timestamp
  const records = await table.query().select(["timestamp"]).sort("timestamp desc").limit(1).toArray();
  const lastTimestamp = records.length > 0 ? records[0].timestamp as string : "";

  // Parse JSONL delta
  const fileContent = fs.readFileSync(finalLogPath, "utf-8");
  const lines = fileContent.split("\n").filter(l => l.trim().length > 0);
  const newEvents: AuditEvent[] = [];

  for (const line of lines) {
    const ev: AuditEvent = JSON.parse(line);
    if (ev.timestamp > lastTimestamp) {
      newEvents.push(ev);
    }
  }

  if (newEvents.length === 0) {
    return { synced: 0 };
  }

  const embedder = new EmbeddingEngine();
  const indexData = [];

  for (const ev of newEvents) {
    const vector = await embedder.embed(ev.vectorText);
    indexData.push({
      vector: Array.from(vector),
      timestamp: ev.timestamp,
      eventId: ev.eventId,
      eventType: ev.eventType,
      actor: ev.actor,
      cwd: ev.context.cwd,
      payloadJson: JSON.stringify(ev.payload),
      vectorText: ev.vectorText
    });
  }

  await table.add(indexData);
  return { synced: newEvents.length };
}
```

Modify `packages/clew-core/src/index.ts` to export:
```typescript
export { syncAuditLedger } from "./audit/sync.js";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/clew-core/src/audit/sync.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -am "feat: implement LanceDB incremental sync telemetry engine"
```

---

### Task 4: Anomaly Detection Engine & CLI Commands (`packages/clew-cli`)

**Files:**
- Modify: `packages/clew-cli/src/index.ts` (add `clew audit` subcommands)
- Modify: `packages/clew-cli/src/index.test.ts` (verify anomaly alerts)

**Step 1: Write the failing test**

```typescript
// Verify that querying anomalies returns distance warnings if distance > 0.75.
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Modify CLI routing commands in `packages/clew-cli/src/index.ts`:
- Under `clew audit sync`, trigger `syncAuditLedger()`.
- Under `clew audit query "<query>"`, search LanceDB table for vector neighbors.
- Under `clew audit analyze`, compute cosine similarity of the last 10 entries and output red-block console warnings if anomaly score crosses `0.75`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -am "feat: add clew audit subcommands and vector KNN anomaly query engine"
```
