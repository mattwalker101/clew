import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as lancedb from "@lancedb/lancedb";
import { EmbeddingEngine } from "../index.js";
import { syncAuditLedger } from "./sync.js";

// Mock EmbeddingEngine to avoid downloading model and slow runs
vi.spyOn(EmbeddingEngine.prototype, "embed").mockImplementation(async (text) => {
  // Return dummy 384-dimension Float32Array
  const vector = new Float32Array(384);
  vector.fill(0.1);
  return vector;
});

describe("LanceDB Incremental Sync Telemetry Engine", () => {
  let tempDir: string;
  let dbPath: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `clew-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = join(tempDir, "lancedb");
    logPath = join(tempDir, "audit.jsonl");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should synchronize a fresh log indexing all entries correctly", async () => {
    // 1. Write fresh audit events
    const ev1 = {
      timestamp: "2026-05-30T10:00:00.000Z",
      eventId: "event-1",
      eventType: "cli",
      actor: "human",
      context: { cwd: "/test-cwd-1" },
      payload: { cmd: "clew recommend" },
      vectorText: "human ran CLI command: clew recommend"
    };
    const ev2 = {
      timestamp: "2026-05-30T10:01:00.000Z",
      eventId: "event-2",
      eventType: "mcp",
      actor: "agent",
      context: { cwd: "/test-cwd-2" },
      payload: { tool: "view_file" },
      vectorText: "agent ran tool view_file"
    };

    fs.writeFileSync(logPath, JSON.stringify(ev1) + "\n" + JSON.stringify(ev2) + "\n", "utf-8");

    // 2. Perform synchronization
    const result = await syncAuditLedger(dbPath, logPath);
    expect(result.synced).toBe(2);

    // 3. Connect to LanceDB and verify the table state
    const db = await lancedb.connect(dbPath);
    const table = await db.openTable("audit_events");
    const records = await table.query().toArray();

    expect(records.length).toBe(2);

    // Find and check the indexed record for event-1
    const rec1 = records.find(r => r.eventId === "event-1");
    expect(rec1).toBeDefined();
    expect(rec1.timestamp).toBe("2026-05-30T10:00:00.000Z");
    expect(rec1.eventType).toBe("cli");
    expect(rec1.actor).toBe("human");
    expect(rec1.cwd).toBe("/test-cwd-1");
    expect(JSON.parse(rec1.payloadJson)).toEqual({ cmd: "clew recommend" });
    expect(rec1.vectorText).toBe("human ran CLI command: clew recommend");
    expect(rec1.vector).toBeDefined();
    const vecArray = Array.from(rec1.vector as Iterable<number>);
    expect(vecArray.length).toBe(384);
    expect(vecArray[0]).toBeCloseTo(0.1);

    // Find and check the indexed record for event-2
    const rec2 = records.find(r => r.eventId === "event-2");
    expect(rec2).toBeDefined();
    expect(rec2.timestamp).toBe("2026-05-30T10:01:00.000Z");
    expect(rec2.eventType).toBe("mcp");
    expect(rec2.actor).toBe("agent");
    expect(rec2.cwd).toBe("/test-cwd-2");
    expect(JSON.parse(rec2.payloadJson)).toEqual({ tool: "view_file" });
    expect(rec2.vectorText).toBe("agent ran tool view_file");
  });

  it("should synchronize an existing table with no new entries indexing 0 events", async () => {
    // 1. Write event and sync
    const ev1 = {
      timestamp: "2026-05-30T10:00:00.000Z",
      eventId: "event-1",
      eventType: "cli",
      actor: "human",
      context: { cwd: "/test-cwd-1" },
      payload: { cmd: "clew recommend" },
      vectorText: "human ran CLI command: clew recommend"
    };
    fs.writeFileSync(logPath, JSON.stringify(ev1) + "\n", "utf-8");

    const result1 = await syncAuditLedger(dbPath, logPath);
    expect(result1.synced).toBe(1);

    // 2. Sync again with no new entries
    const result2 = await syncAuditLedger(dbPath, logPath);
    expect(result2.synced).toBe(0);

    const db = await lancedb.connect(dbPath);
    const table = await db.openTable("audit_events");
    const records = await table.query().toArray();
    expect(records.length).toBe(1);
  });

  it("should synchronize an existing table with mixed new and old entries delta-indexing only the new ones", async () => {
    // 1. Write initial event and sync
    const ev1 = {
      timestamp: "2026-05-30T10:00:00.000Z",
      eventId: "event-1",
      eventType: "cli",
      actor: "human",
      context: { cwd: "/test-cwd-1" },
      payload: { cmd: "clew recommend" },
      vectorText: "human ran CLI command: clew recommend"
    };
    fs.writeFileSync(logPath, JSON.stringify(ev1) + "\n", "utf-8");

    const result1 = await syncAuditLedger(dbPath, logPath);
    expect(result1.synced).toBe(1);

    // 2. Append an old event (smaller timestamp) and a new event (greater timestamp)
    const evOld = {
      timestamp: "2026-05-30T09:59:00.000Z", // before event-1
      eventId: "event-old",
      eventType: "system",
      actor: "system",
      context: { cwd: "/test-cwd-old" },
      payload: { system: "init" },
      vectorText: "system initialization"
    };
    const evNew = {
      timestamp: "2026-05-30T10:02:00.000Z", // after event-1
      eventId: "event-new",
      eventType: "mcp",
      actor: "agent",
      context: { cwd: "/test-cwd-new" },
      payload: { tool: "grep_search" },
      vectorText: "agent ran tool grep_search"
    };

    // Rewrite the file with all 3 events
    fs.writeFileSync(
      logPath,
      JSON.stringify(ev1) + "\n" + JSON.stringify(evOld) + "\n" + JSON.stringify(evNew) + "\n",
      "utf-8"
    );

    // 3. Sync again and check that only the new one is indexed
    const result2 = await syncAuditLedger(dbPath, logPath);
    expect(result2.synced).toBe(1);

    const db = await lancedb.connect(dbPath);
    const table = await db.openTable("audit_events");
    const records = await table.query().toArray();
    expect(records.length).toBe(2); // Only ev1 and evNew should be indexed

    const recNew = records.find(r => r.eventId === "event-new");
    expect(recNew).toBeDefined();

    const recOld = records.find(r => r.eventId === "event-old");
    expect(recOld).toBeUndefined();
  });
});
