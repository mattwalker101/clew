import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDashboardServer } from "./server.js";

describe("clew Dashboard API Server", () => {
  let server: http.Server;

  beforeAll(async () => {
    server = await startDashboardServer(7709);
  });

  afterAll(() => {
    server.close();
  });

  it("exposes the live composed registry at GET /api/registry", async () => {
    const res = await fetch("http://localhost:7709/api/registry");
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("entries");
    expect(body).toHaveProperty("warnings");
  });

  it("runs the live activation explanation engine at POST /api/explain", async () => {
    const res = await fetch("http://localhost:7709/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "typescript" }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("candidates");
    expect(body).toHaveProperty("recommendations");
  });

  it("exposes the live health diagnostic metrics at GET /api/doctor", async () => {
    const res = await fetch("http://localhost:7709/api/doctor");
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("skills");
    expect(body).toHaveProperty("dbPath");
    expect(body).toHaveProperty("repoSignals");
    expect(body).toHaveProperty("overlaps");
    expect(body).toHaveProperty("conflicts");
    expect(body).toHaveProperty("warnings");
  });

  it("allows favoriting and disabling skills via POST /api/telemetry/favorite and /api/telemetry/disable", async () => {
    // 1. Favorite a skill
    const resFav = await fetch("http://localhost:7709/api/telemetry/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: "engineering-core", favorite: true }),
    });
    const bodyFav = (await resFav.json()) as any;
    expect(resFav.status).toBe(200);
    expect(bodyFav.success).toBe(true);

    // 2. Disable a skill
    const resDis = await fetch("http://localhost:7709/api/telemetry/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: "engineering-core", disabled: true }),
    });
    const bodyDis = (await resDis.json()) as any;
    expect(resDis.status).toBe(200);
    expect(bodyDis.success).toBe(true);

    // 3. Verify registry shows modified states
    const resReg = await fetch("http://localhost:7709/api/registry");
    const bodyReg = (await resReg.json()) as any;
    const entry = bodyReg.entries.find((e: any) => e.skillId === "engineering-core");
    expect(entry).toBeDefined();
    expect(entry.favorite).toBe(true);
    expect(entry.disabled).toBe(true);
  });

  describe("Cockpit API Runbook Endpoints", () => {
    let projectRoot: string;
    const originalCwd = process.cwd();

    beforeAll(() => {
      projectRoot = mkdtempSync(join(tmpdir(), "clew-server-runbook-"));
      const skillRoot = join(projectRoot, "skills", "typescript-core");
      mkdirSync(skillRoot, { recursive: true });
      writeFileSync(
        join(skillRoot, "clew.yaml"),
        [
          "id: typescript-core",
          "version: 1.0.0",
          "kind: instruction_skill",
          "name: TypeScript Core",
          "instructions:",
          "  file: skill.md",
          "tags: []",
          "activation:",
          "  triggers: []",
          "steps:",
          "  - id: step-1",
          "    title: First Step",
          "    instruction: Make a file named test.txt",
          "    gates:",
          "      - type: file",
          "        path: test.txt",
          "        description: Check for test.txt",
        ].join("\n"),
      );
      writeFileSync(join(skillRoot, "skill.md"), "# TypeScript Core\n");
      writeFileSync(join(projectRoot, "package.json"), JSON.stringify({}));
      writeFileSync(join(projectRoot, "AGENTS.md"), "# Active Skills\n- typescript-core\n");
      
      process.chdir(projectRoot);
    });

    afterAll(() => {
      process.chdir(originalCwd);
    });

    it("GET /api/run/status should return active: false when no session exists", async () => {
      const res = await fetch("http://localhost:7709/api/run/status");
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body).toEqual({ active: false });
    });

    it("POST /api/run/start should fail with invalid skill", async () => {
      const res = await fetch("http://localhost:7709/api/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: "non-existent" }),
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(body).toHaveProperty("error");
    });

    it("POST /api/run/start should start a new session", async () => {
      const res = await fetch("http://localhost:7709/api/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: "typescript-core" }),
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.active).toBe(true);
      expect(body.skillId).toBe("typescript-core");
      expect(body.sessionId).toBeDefined();
      expect(body.currentStep.id).toBe("step-1");
      expect(body.currentStep.gates[0].type).toBe("file");
      expect(body.currentStep.gates[0].status).toBe("pending");
    });

    it("GET /api/run/status should now return the active session", async () => {
      const res = await fetch("http://localhost:7709/api/run/status");
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.active).toBe(true);
      expect(body.skillId).toBe("typescript-core");
      expect(body.currentStep.id).toBe("step-1");
    });

    it("POST /api/run/verify should fail if verification gates are not satisfied", async () => {
      const res = await fetch("http://localhost:7709/api/run/verify", {
        method: "POST",
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.completed).toBe(false);
      expect(body.gates[0].success).toBe(false);
      expect(body.gates[0].error).toContain("File not found");
    });

    it("POST /api/run/verify should succeed when verification gates are satisfied", async () => {
      writeFileSync(join(projectRoot, "test.txt"), "hello world");

      const res = await fetch("http://localhost:7709/api/run/verify", {
        method: "POST",
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.completed).toBe(true);
    });

    it("GET /api/run/status should return active: false after success", async () => {
      const res = await fetch("http://localhost:7709/api/run/status");
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body).toEqual({ active: false });
    });
  });
});

