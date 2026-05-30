# Guided Runbooks & Execution Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Guided Runbooks and Execution Tracking in `clew`, extending Zod schemas, adding a SQLite-based session tracking engine, exposing three stateful MCP tools, CLI commands, and Cockpit Dashboard visualizations.

**Architecture:** Extend `@clew-ops/schema` to parse step structures under skill manifests. Maintain execution runs in a dedicated `session.db` using Node's native `node:sqlite` DatabaseSync. Create a `SessionManager` inside `@clew-ops/core` to evaluate step verification gates and handle progression.

**Tech Stack:** TypeScript, Zod, Node.js (`node:sqlite` DatabaseSync), MCP SDK, React, Tailwind CSS (for dashboard).

---

### Task 1: Extend `@clew-ops/schema` for Guided Runbook Steps

**Files:**
- Modify: `packages/clew-schema/src/index.ts`
- Test: `packages/clew-schema/src/index.test.ts`

**Step 1: Write the failing test**
In `packages/clew-schema/src/index.test.ts`, add a test to verify parsing steps and composite verification gates.

```typescript
describe("Runbook Steps Schema Verification", () => {
  it("should successfully parse valid steps with file, grep, and command gates", () => {
    const rawManifest = {
      id: "run-harness-skill",
      version: "0.1.0",
      kind: "instruction_skill",
      name: "Run Harness",
      instructions: { file: "skill.md" },
      tags: [],
      capabilities: { required: [], optional: [] },
      extends: [],
      policies: [],
      steps: [
        {
          id: "step-1",
          title: "Install Dependencies",
          instruction: "Run npm install",
          gates: [
            { type: "file", path: "package.json" },
            { type: "grep", path: "package.json", pattern: '"vitest"' },
            { type: "command", command: "npm test", timeoutMs: 10000 }
          ]
        }
      ]
    };
    
    const result = skillManifestSchema.safeParse(rawManifest);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm --filter @clew-ops/schema test`
Expected: FAIL due to `steps` not recognized on `skillManifestSchema`.

**Step 3: Write minimal implementation**
In `packages/clew-schema/src/index.ts`, add the new schema definitions and append them to `skillManifestSchema`:

```typescript
export const VerificationGateSchema = z.union([
  z.object({
    type: z.literal("file"),
    path: z.string().min(1),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal("grep"),
    path: z.string().min(1),
    pattern: z.string().min(1),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal("command"),
    command: z.string().min(1),
    timeoutMs: z.number().default(15000).optional(),
    description: z.string().optional()
  })
]);

export const RunbookStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  gates: z.array(VerificationGateSchema).default([])
});

// Inside skillManifestSchema z.object definition (around line 145-160):
export const skillManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    kind: skillKindSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    instructions: instructionsSchema,
    tags: stringArraySchema,
    capabilities: capabilitySetSchema,
    compatibility: compatibilitySchema,
    preferences: preferencesSchema,
    activation: activationSchema,
    extends: stringArraySchema,
    policies: stringArraySchema,
    provenance: provenanceSchema,
    extensions: extensionNamespacesSchema,
    steps: z.array(RunbookStepSchema).optional() // ADD THIS
  })
  // ... rest of refine chain ...
```

**Step 4: Run test to verify it passes**
Run: `pnpm --filter @clew-ops/schema test`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-schema/src/index.ts packages/clew-schema/src/index.test.ts
git commit -m "feat(schema): add runbook steps and verification gates schemas"
```

---

### Task 2: Create SQLite Session Database & Tables in Core

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**
In `packages/clew-core/src/index.test.ts`, add a test to open the session DB and verify tables are present:

```typescript
describe("Session DB Initializer", () => {
  it("should initialize session_runs and session_step_states tables correctly", () => {
    const dbPath = ":memory:";
    const db = openSessionDatabase(dbPath);
    
    const runsTable = db.prepare("PRAGMA table_info(session_runs)").all();
    expect(runsTable.length).toBeGreaterThan(0);
    
    const statesTable = db.prepare("PRAGMA table_info(session_step_states)").all();
    expect(statesTable.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm --filter @clew-ops/core test`
Expected: FAIL with "openSessionDatabase is not defined".

**Step 3: Write minimal implementation**
In `packages/clew-core/src/index.ts`, implement `openSessionDatabase`:

```typescript
import { DatabaseSync } from "node:sqlite";

export function openSessionDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_runs (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed')),
      current_step_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  
  db.exec(`
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
  `);
  
  return db;
}
```

**Step 4: Run test to verify it passes**
Run: `pnpm --filter @clew-ops/core test`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat(core): initialize SQLite session database schemas"
```

---

### Task 3: Implement SessionManager in Core for Runbook Gating

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**
In `packages/clew-core/src/index.test.ts`, add a test to verify starting a runbook and executing a composite verification gate.

```typescript
describe("SessionManager Execution Gating", () => {
  it("should initialize runbook session, verify file existence gate, and auto-advance to next step", async () => {
    const mockSkill = {
      id: "test-skill",
      version: "0.1.0",
      kind: "instruction_skill" as const,
      name: "Test Skill",
      instructions: { file: "test.md" },
      tags: [],
      capabilities: { required: [], optional: [] },
      extends: [],
      policies: [],
      steps: [
        {
          id: "step-1",
          title: "Verify workspace file",
          instruction: "Ensure readme exists",
          gates: [{ type: "file", path: "README.md" }]
        }
      ]
    };

    const sessionDb = openSessionDatabase(":memory:");
    const manager = new SessionManager(sessionDb, { getSkill: async () => mockSkill });
    
    const run = await manager.createSession("test-skill");
    expect(run.status).toBe("active");
    expect(run.current_step_id).toBe("step-1");
    
    // Create actual test file in workspace mock
    const fs = require("node:fs");
    fs.writeFileSync("README.md", "Hello Test");
    
    const result = await manager.verifyCurrentStep(run.id);
    expect(result.success).toBe(true);
    
    const updated = await manager.getCurrentStep(run.id);
    expect(updated).toBeNull(); // Last step completed, run is complete
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm --filter @clew-ops/core test`
Expected: FAIL with "SessionManager is not defined".

**Step 3: Write minimal implementation**
In `packages/clew-core/src/index.ts`, add the complete `SessionManager` class:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";

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
  constructor(
    private db: DatabaseSync,
    private registry: { getSkill: (id: string) => Promise<any> }
  ) {}

  async createSession(skillId: string) {
    const skill = await this.registry.getSkill(skillId);
    if (!skill || !skill.steps || skill.steps.length === 0) {
      throw new Error(`Skill ${skillId} has no runbook steps.`);
    }

    const sessionId = Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const firstStep = skill.steps[0].id;

    this.db.prepare(`
      INSERT INTO session_runs (id, skill_id, status, current_step_id, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?)
    `).run(sessionId, skillId, firstStep, now, now);

    for (const step of skill.steps) {
      this.db.prepare(`
        INSERT INTO session_step_states (session_id, step_id, status)
        VALUES (?, ?, ?)
      `).run(sessionId, step.id, step.id === firstStep ? 'active' : 'pending');
    }

    return { id: sessionId, status: "active", current_step_id: firstStep };
  }

  async getCurrentStep(sessionId: string) {
    const run: any = this.db.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId);
    if (!run || run.status !== "active" || !run.current_step_id) {
      return null;
    }
    const skill = await this.registry.getSkill(run.skill_id);
    return skill.steps.find((s: any) => s.id === run.current_step_id) || null;
  }

  async verifyCurrentStep(sessionId: string): Promise<VerificationResult> {
    const step = await this.getCurrentStep(sessionId);
    if (!step) {
      return { success: false, gates: [{ type: "file", success: false, error: "No active step found" }] };
    }

    const gateResults: VerificationResult["gates"] = [];
    let allPassed = true;

    for (const gate of step.gates) {
      let passed = false;
      let errorMsg: string | undefined;

      try {
        if (gate.type === "file") {
          passed = fs.existsSync(gate.path) && fs.statSync(gate.path).isFile();
          if (!passed) errorMsg = `File not found: ${gate.path}`;
        } else if (gate.type === "grep") {
          if (fs.existsSync(gate.path)) {
            const content = fs.readFileSync(gate.path, "utf-8");
            passed = new RegExp(gate.pattern).test(content);
            if (!passed) errorMsg = `Pattern /${gate.pattern}/ not found in ${gate.path}`;
          } else {
            errorMsg = `File not found: ${gate.path}`;
          }
        } else if (gate.type === "command") {
          passed = await new Promise<boolean>((resolve) => {
            const cp = exec(gate.command, { timeout: gate.timeoutMs || 15000 }, (error) => {
              if (error) {
                errorMsg = error.message;
                resolve(false);
              } else {
                resolve(true);
              }
            });
          });
        }
      } catch (err: any) {
        errorMsg = err.message;
        passed = false;
      }

      gateResults.push({ type: gate.type, success: passed, error: errorMsg });
      if (!passed) allPassed = false;
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE session_step_states
      SET status = ?, attempts = attempts + 1, last_verified_at = ?, error_log = ?
      WHERE session_id = ? AND step_id = ?
    `).run(
      allPassed ? "completed" : "failed",
      now,
      allPassed ? null : JSON.stringify(gateResults),
      sessionId,
      step.id
    );

    if (allPassed) {
      const run: any = this.db.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId);
      const skill = await this.registry.getSkill(run.skill_id);
      const currentIndex = skill.steps.findIndex((s: any) => s.id === step.id);
      const nextStep = skill.steps[currentIndex + 1];

      if (nextStep) {
        this.db.prepare(`
          UPDATE session_runs SET current_step_id = ?, updated_at = ? WHERE id = ?
        `).run(nextStep.id, now, sessionId);

        this.db.prepare(`
          UPDATE session_step_states SET status = 'active' WHERE session_id = ? AND step_id = ?
        `).run(sessionId, nextStep.id);
      } else {
        this.db.prepare(`
          UPDATE session_runs SET status = 'completed', current_step_id = NULL, updated_at = ? WHERE id = ?
        `).run(now, sessionId);
      }
    }

    return { success: allPassed, gates: gateResults };
  }
}
```

**Step 4: Run test to verify it passes**
Run: `pnpm --filter @clew-ops/core test`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat(core): implement SessionManager step verification runtime"
```
