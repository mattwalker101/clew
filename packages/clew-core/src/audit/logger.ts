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
