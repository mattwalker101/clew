# CLI Runbooks Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the new `clew run` terminal subcommands (`start`, `status`, `verify`) to allow developers to control and verify runbook sessions from the terminal.

**Architecture:** Extend `packages/clew-cli/src/index.ts` with a new `run` command handler. Use `@clew-ops/core` `SessionManager` and `openSessionDatabase` pointing to `.clew-session.db` in `process.cwd()` to persist session states and progress.

**Tech Stack:** Node.js, TypeScript, Vitest, Zod, native `node:sqlite`.

---

### Task 1: Update .gitignore to exclude session database files

**Files:**
- Modify: `.gitignore`

**Step 1: Write minimal modification**
Add the following entries to `.gitignore`:
```text
.clew-session.db
.clew-session.db-*
```

**Step 2: Run command to verify change**
Run: `git diff .gitignore`
Expected: Newly added lines are present.

**Step 3: Commit**
```bash
git add .gitignore
git commit -m "chore: ignore local session database files in git"
```

---

### Task 2: Stub the `run` command routing and usage instructions

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**
Add a test in `packages/clew-cli/src/index.test.ts` checking that `clew run` prints usage or handles invalid subcommands.
```typescript
it("should print usage instructions when run without arguments or with invalid subcommand", async () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  
  console.log = (...msg) => logs.push(msg.join(" "));
  console.error = (...msg) => errors.push(msg.join(" "));
  (process as any).exit = (code: number) => { throw new Error(`Exit ${code}`); };

  try {
    await main(["run"]);
  } catch (err: any) {
    expect(err.message).toBe("Exit 1");
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }
  expect(errors[0]).toContain("usage: clew run <start|status|verify>");
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL due to "unknown command: run"

**Step 3: Write minimal implementation**
In `packages/clew-cli/src/index.ts`:
1. Register `run` in `commands`:
```typescript
  async run(args) {
    const [subcommand] = args;
    if (subcommand !== "start" && subcommand !== "status" && subcommand !== "verify") {
      fail("usage: clew run <start|status|verify> [args]");
    }
  },
```
2. Update the `help` menu string in `main()`:
```typescript
        "  doctor",
        "  mcp [run|install]",
        "  dashboard [--port=<number>]",
        "  run <start|status|verify>",
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-cli/src/index.ts packages/clew-cli/src/index.test.ts
git commit -m "feat(cli): add stub run subcommand with usage validation"
```

---

### Task 3: Implement `clew run start <skill-id>`

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**
Add a test in `packages/clew-cli/src/index.test.ts` to assert that starting a runbook successfully creates the session and outputs the first step.
```typescript
it("should start a runbook session and display step details", async () => {
  // Test stub checking that it starts the session successfully and outputs to console.
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL (missing command logic in handler)

**Step 3: Write minimal implementation**
Import `openSessionDatabase` and `SessionManager` from `@clew-ops/core` into `packages/clew-cli/src/index.ts`.
In the `run` command handler:
```typescript
    const [subcommand, ...subArgs] = args;
    const sessionDbPath = join(process.cwd(), ".clew-session.db");
    
    if (subcommand === "start") {
      const [skillId] = subArgs;
      if (!skillId) fail("usage: clew run start <skill-id>");
      
      const current = await registry();
      const bundle = current.lookup(skillId);
      if (!bundle) fail(`unknown skill: ${skillId}`);
      if (!bundle.manifest.steps || bundle.manifest.steps.length === 0) {
        fail(`Skill "${skillId}" has no runbook steps.`);
      }

      const db = openSessionDatabase(sessionDbPath);
      const manager = new SessionManager(db, { getSkill: async (id) => current.lookup(id)?.manifest });
      
      try {
        // Complete/archive any existing active sessions
        db.prepare("UPDATE session_runs SET status = 'completed' WHERE status = 'active'").run();
        
        const run = await manager.createSession(skillId);
        const step = bundle.manifest.steps[0];
        
        console.log(`🚀 Started runbook session '${run.id}' for skill: ${skillId}`);
        console.log(`\n[Step 1/${bundle.manifest.steps.length}]: ${step.title}`);
        console.log(`────────────────────────────────────────────────────────────`);
        console.log(`Instruction: ${step.instruction}`);
        if (step.gates && step.gates.length > 0) {
          console.log(`\nVerification Gates:`);
          for (const gate of step.gates) {
            const desc = gate.description ? ` (${gate.description})` : "";
            if (gate.type === "file") {
              console.log(`• [file] File path: ${gate.path}${desc}`);
            } else if (gate.type === "grep") {
              console.log(`• [grep] ${gate.path} matching '/${gate.pattern}/'${desc}`);
            } else if (gate.type === "command") {
              console.log(`• [command] Command: \`${gate.command}\`${desc}`);
            }
          }
        }
      } finally {
        db.close();
      }
    }
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-cli/src/index.ts packages/clew-cli/src/index.test.ts
git commit -m "feat(cli): implement 'clew run start' subcommand"
```

---

### Task 4: Implement `clew run status`

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**
Assert that checking status prints active step instructions and current verification gate status.

**Step 2: Run test to verify it fails**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
Extend the `run` command handler in `packages/clew-cli/src/index.ts`:
```typescript
    else if (subcommand === "status") {
      const db = openSessionDatabase(sessionDbPath);
      const current = await registry();
      const manager = new SessionManager(db, { getSkill: async (id) => current.lookup(id)?.manifest });
      
      try {
        const activeRun: any = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get();
        if (!activeRun) {
          console.log("❌ No active runbook session found. Start one using 'clew run start <skill-id>'");
          return;
        }
        
        const step = await manager.getCurrentStep(activeRun.id);
        if (!step) {
          console.log("🎉 Runbook is completed! No active step.");
          return;
        }

        const bundle = current.lookup(activeRun.skill_id);
        const steps = bundle?.manifest.steps || [];
        const index = steps.findIndex((s: any) => s.id === step.id);
        const stepState: any = db.prepare("SELECT * FROM session_step_states WHERE session_id = ? AND step_id = ?").get(activeRun.id, step.id);
        const errorLogs = stepState?.error_log ? JSON.parse(stepState.error_log) : [];

        console.log(`🧵 Active Session: ${activeRun.id} (${activeRun.skill_id})`);
        console.log(`\n[Step ${index + 1}/${steps.length}]: ${step.title}`);
        console.log(`────────────────────────────────────────────────────────────`);
        console.log(`Instruction: ${step.instruction}`);
        
        if (step.gates && step.gates.length > 0) {
          console.log(`\nVerification Gates:`);
          step.gates.forEach((gate: any, gateIdx: number) => {
            const errLog = errorLogs.find((e: any) => e.type === gate.type);
            const statusSymbol = stepState?.status === "completed" ? "✔" : (errLog ? "✖" : "•");
            const statusText = stepState?.status === "completed" ? " (Passed)" : (errLog ? " (Failed)" : "");
            
            if (gate.type === "file") {
              console.log(`${statusSymbol} [file] ${gate.path}${statusText}`);
            } else if (gate.type === "grep") {
              console.log(`${statusSymbol} [grep] ${gate.path} matching '/${gate.pattern}/'${statusText}`);
            } else if (gate.type === "command") {
              console.log(`${statusSymbol} [command] \`${gate.command}\`${statusText}`);
            }
            if (errLog && errLog.error) {
              console.log(`  ↳ Error: ${errLog.error}`);
            }
          });
        }
      } finally {
        db.close();
      }
    }
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-cli/src/index.ts packages/clew-cli/src/index.test.ts
git commit -m "feat(cli): implement 'clew run status' subcommand"
```

---

### Task 5: Implement `clew run verify`

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**
Assert that triggering verify runs step validation, outputs detailed status, and auto-advances or completes the runbook.

**Step 2: Run test to verify it fails**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
Extend the `run` command handler in `packages/clew-cli/src/index.ts`:
```typescript
    else if (subcommand === "verify") {
      const db = openSessionDatabase(sessionDbPath);
      const current = await registry();
      const manager = new SessionManager(db, { getSkill: async (id) => current.lookup(id)?.manifest });
      
      try {
        const activeRun: any = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get();
        if (!activeRun) {
          console.log("❌ No active runbook session found. Start one using 'clew run start <skill-id>'");
          return;
        }

        const stepBefore = await manager.getCurrentStep(activeRun.id);
        if (!stepBefore) {
          console.log("🎉 Runbook is already fully completed!");
          return;
        }

        console.log(`🔍 Verifying Step: ${stepBefore.title}...`);
        const result = await manager.verifyCurrentStep(activeRun.id);
        
        if (result.success) {
          console.log(`\n🎉 Step verified successfully!`);
          
          const stepAfter = await manager.getCurrentStep(activeRun.id);
          if (stepAfter) {
            const bundle = current.lookup(activeRun.skill_id);
            const steps = bundle?.manifest.steps || [];
            const index = steps.findIndex((s: any) => s.id === stepAfter.id);
            
            console.log(`\n[Step ${index + 1}/${steps.length}]: ${stepAfter.title}`);
            console.log(`────────────────────────────────────────────────────────────`);
            console.log(`Instruction: ${stepAfter.instruction}`);
            if (stepAfter.gates && stepAfter.gates.length > 0) {
              console.log(`\nVerification Gates:`);
              for (const gate of stepAfter.gates) {
                if (gate.type === "file") console.log(`• [file] File path: ${gate.path}`);
                else if (gate.type === "grep") console.log(`• [grep] ${gate.path} matching '/${gate.pattern}/'`);
                else if (gate.type === "command") console.log(`• [command] Command: \`${gate.command}\``);
              }
            }
          } else {
            console.log(`\n🏆 Dynamic verification check passed! Runbook successfully completed!`);
          }
        } else {
          console.log(`\n❌ Verification failed.`);
          result.gates.forEach((gate: any) => {
            const symbol = gate.success ? "✔" : "✖";
            if (gate.type === "file") {
              console.log(`${symbol} [file] Check failed`);
            } else if (gate.type === "grep") {
              console.log(`${symbol} [grep] Regex check failed`);
            } else if (gate.type === "command") {
              console.log(`${symbol} [command] command failed`);
            }
            if (gate.error) {
              console.log(`  ↳ Error: ${gate.error}`);
            }
          });
          console.log(`\n⚠️ Please resolve the gates above and run 'clew run verify' again.`);
        }
      } finally {
        db.close();
      }
    }
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/clew-cli/src/index.ts packages/clew-cli/src/index.test.ts
git commit -m "feat(cli): implement 'clew run verify' subcommand"
```
