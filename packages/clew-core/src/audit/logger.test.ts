import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { writeAuditEvent } from "./logger.js";

// Mock node:os to control homedir() behavior for default path test
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: vi.fn(),
  };
});

// Mock node:fs to allow simulating appendFileSync write errors safely
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  const mockAppend = vi.fn().mockImplementation((path, data, options) => {
    if (typeof path === "string" && path.includes("error-trigger")) {
      throw new Error("Permission Denied (Mocked)");
    }
    return original.appendFileSync(path, data, options);
  });
  return {
    ...original,
    appendFileSync: mockAppend,
  };
});

describe("Audit Logger", () => {
  const tempDir = join(tmpdir(), `clew-audit-test-${Date.now()}`);
  const logPath = join(tempDir, "audit.jsonl");
  const mockHome = join(tempDir, "mock-home");

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(mockHome, { recursive: true });
    vi.mocked(homedir).mockReturnValue(mockHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should write valid audit events safely to JSONL file at custom path", () => {
    const eventPayload = {
      eventType: "cli" as const,
      actor: "human",
      context: {
        cwd: "/test-cwd",
        gitBranch: "main",
        activeSkills: ["engineering-core"],
      },
      payload: { commandLine: "clew recommend" },
      vectorText: "human ran CLI command: clew recommend",
    };

    writeAuditEvent(eventPayload, logPath);

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, "utf-8").trim();
    const parsedEvent = JSON.parse(content);

    expect(parsedEvent.eventType).toBe("cli");
    expect(parsedEvent.actor).toBe("human");
    expect(parsedEvent.context.cwd).toBe("/test-cwd");
    expect(parsedEvent.context.gitBranch).toBe("main");
    expect(parsedEvent.context.activeSkills).toEqual(["engineering-core"]);
    expect(parsedEvent.payload).toEqual({ commandLine: "clew recommend" });
    expect(parsedEvent.vectorText).toBe("human ran CLI command: clew recommend");

    // Auto-generated fields
    expect(parsedEvent.eventId).toBeDefined();
    expect(typeof parsedEvent.eventId).toBe("string");
    // Simple UUIDv4 regex validation
    expect(parsedEvent.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    expect(parsedEvent.timestamp).toBeDefined();
    expect(typeof parsedEvent.timestamp).toBe("string");
    // ISO 8601 validation
    expect(new Date(parsedEvent.timestamp).toISOString()).toBe(parsedEvent.timestamp);
  });

  it("should fallback to ~/.clew/audit.jsonl when logPath is not provided", () => {
    const eventPayload = {
      eventType: "system" as const,
      actor: "system",
      context: {
        cwd: "/sys-cwd",
        activeSkills: [],
      },
      payload: { action: "startup" },
      vectorText: "system started",
    };

    writeAuditEvent(eventPayload);

    const expectedDefaultPath = join(mockHome, ".clew", "audit.jsonl");
    expect(fs.existsSync(expectedDefaultPath)).toBe(true);

    const content = fs.readFileSync(expectedDefaultPath, "utf-8").trim();
    const parsedEvent = JSON.parse(content);
    expect(parsedEvent.eventType).toBe("system");
    expect(parsedEvent.actor).toBe("system");
    expect(parsedEvent.eventId).toBeDefined();
    expect(parsedEvent.timestamp).toBeDefined();
  });

  it("should support safe, silent error handling and not throw when fs operations fail", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorTriggerPath = join(tempDir, "error-trigger.jsonl");

    const eventPayload = {
      eventType: "veto" as const,
      actor: "agent",
      context: {
        cwd: "/veto-cwd",
        activeSkills: [],
      },
      payload: { rule: "veto-rule" },
      vectorText: "agent vetoed action",
    };

    // This should NOT throw
    expect(() => {
      writeAuditEvent(eventPayload, errorTriggerPath);
    }).not.toThrow();

    expect(fs.appendFileSync).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnCall = consoleWarnSpy.mock.calls[0];
    expect(warnCall?.[0]).toContain("Clew Audit Logging warning: Failed writing to audit log");
  });
});
