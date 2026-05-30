import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { EmbeddingEngine } from "../index.js";
import { type AuditEvent } from "./logger.js";

/**
 * Synchronizes local audit.jsonl telemetry events into LanceDB.
 * Performs incremental delta indexing based on the latest checkpoint timestamp.
 */
export async function syncAuditLedger(
  dbPath?: string,
  logPath?: string
): Promise<{ synced: number }> {
  // Resolve ~ prefix or fallback to default home paths
  const finalDbPath = dbPath
    ? dbPath.startsWith("~")
      ? join(homedir(), dbPath.slice(1))
      : dbPath
    : join(homedir(), ".clew", "lancedb");

  const finalLogPath = logPath
    ? logPath.startsWith("~")
      ? join(homedir(), logPath.slice(1))
      : logPath
    : join(homedir(), ".clew", "audit.jsonl");

  if (!fs.existsSync(finalLogPath)) {
    return { synced: 0 };
  }

  // Ensure DB parent directory exists
  const parentDbDir = join(finalDbPath, "..");
  if (!fs.existsSync(parentDbDir)) {
    fs.mkdirSync(parentDbDir, { recursive: true });
  }

  const db = await lancedb.connect(finalDbPath);
  let table: lancedb.Table;

  const schemaObj = {
    vector: new Float32Array(384),
    timestamp: "",
    eventId: "",
    eventType: "",
    actor: "",
    cwd: "",
    payloadJson: "",
    vectorText: ""
  };

  try {
    table = await db.openTable("audit_events");
  } catch {
    // Table does not exist, create it with the schema and delete the empty initial row
    table = await db.createTable("audit_events", [schemaObj]);
    await table.delete("timestamp = ''");
  }

  // Get most recent timestamp using orderBy
  const records = await table
    .query()
    .select(["timestamp"])
    .orderBy({ columnName: "timestamp", ascending: false })
    .limit(1)
    .toArray();

  const lastTimestamp = records.length > 0 ? (records[0].timestamp as string) : "";

  // Parse JSONL delta
  const fileContent = fs.readFileSync(finalLogPath, "utf-8");
  const lines = fileContent.split("\n").filter((l) => l.trim().length > 0);
  const newEvents: AuditEvent[] = [];

  for (const line of lines) {
    try {
      const ev: AuditEvent = JSON.parse(line);
      if (ev.timestamp && ev.timestamp > lastTimestamp) {
        newEvents.push(ev);
      }
    } catch (err) {
      console.warn("Clew Audit Ledger sync warning: Failed parsing audit log line", err);
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
      cwd: ev.context?.cwd || "",
      payloadJson: JSON.stringify(ev.payload || {}),
      vectorText: ev.vectorText
    });
  }

  await table.add(indexData);
  return { synced: newEvents.length };
}
