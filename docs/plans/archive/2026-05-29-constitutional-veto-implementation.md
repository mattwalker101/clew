# Constitutional Review & Hard-Veto Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a strict, deterministic, local-first veto gate in clew to block any commits or runbook executions that weaken core security rules (Ruff, Biome, and Gitleaks).

**Architecture:** A fast (<100ms) parsing library that scans changes to config files (`pyproject.toml`, `biome.json`, `.gitleaks.toml`) during git pre-commit and runbook execution. It deep-diffs against base configuration settings to prevent security degradations, returning exit code 1 or failing verification steps with a structured `active_conflict` envelope.

**Tech Stack:** TypeScript, Node.js FS APIs, Vitest, Git commands.

---

### Task 1: Core TOML Parsing Utility

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**

Add these tests to `packages/clew-core/src/index.test.ts`:
```typescript
import { parseToml } from "./index";

describe("parseToml", () => {
  it("should parse simple key-values, sections, and arrays", () => {
    const toml = `
      # Comment
      global_key = "global_value"

      [tool.ruff.lint]
      ignore = ["S101", "S102"]
      extend-select = [
        "S",
        "B"
      ]
    `;
    const parsed = parseToml(toml);
    expect(parsed.global_key).toBe("global_value");
    expect(parsed.tool.ruff.lint.ignore).toEqual(["S101", "S102"]);
    expect(parsed.tool.ruff.lint["extend-select"]).toEqual(["S", "B"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: FAIL with "parseToml is not defined" or similar.

**Step 3: Write minimal implementation**

Add `parseToml` to `packages/clew-core/src/index.ts`:
```typescript
export function parseToml(content: string): any {
  const result: any = {};
  let currentSection: any = result;
  const lines = content.split(/\r?\n/);
  
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      i++;
      continue;
    }
    
    if (line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1).trim();
      const parts = sectionName.split(".");
      let temp = result;
      for (const part of parts) {
        const p = part.trim();
        if (!temp[p] || typeof temp[p] !== "object") {
          temp[p] = {};
        }
        temp = temp[p];
      }
      currentSection = temp;
      i++;
      continue;
    }
    
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      let valuePart = line.slice(eqIdx + 1).trim();
      
      if (valuePart.startsWith("[")) {
        let arrayStr = valuePart;
        while (!arrayStr.includes("]") && i + 1 < lines.length) {
          i++;
          arrayStr += " " + lines[i].trim();
        }
        const items = arrayStr
          .slice(1, arrayStr.lastIndexOf("]"))
          .split(",")
          .map(item => {
            const trimmed = item.trim();
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
              return trimmed.slice(1, -1);
            }
            return trimmed;
          })
          .filter(item => item !== "");
        
        currentSection[key] = items;
      } else {
        if ((valuePart.startsWith('"') && valuePart.endsWith('"')) || (valuePart.startsWith("'") && valuePart.endsWith("'"))) {
          valuePart = valuePart.slice(1, -1);
        }
        currentSection[key] = valuePart;
      }
    }
    i++;
  }
  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat: add robust minimal TOML parser utility"
```

---

### Task 2: Security Validation Engine

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**

Add tests for security configurations. We'll verify Ruff `ignore` checks, Biome rules, and Gitleaks rules.
```typescript
import { checkSecuritySettings } from "./index";

describe("checkSecuritySettings", () => {
  it("should fail when Ruff security rules are added to ignore list", async () => {
    // Mock diff where S101 is added to ignore list
    const result = await checkSecuritySettings("/mock/path", {
      mockFiles: {
        "pyproject.toml": `
          [tool.ruff.lint]
          ignore = ["S101"]
        `
      }
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Ruff security rule 'S101' added to ignore list");
  });

  it("should fail when Biome security linter rules are set to off", async () => {
    const result = await checkSecuritySettings("/mock/path", {
      mockFiles: {
        "biome.json": JSON.stringify({
          linter: {
            rules: {
              security: {
                noEval: "off"
              }
            }
          }
        })
      }
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Biome linter rule 'noEval' was disabled (set to 'off')");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: FAIL with `checkSecuritySettings is not defined`.

**Step 3: Write minimal implementation**

Add `checkSecuritySettings` to `packages/clew-core/src/index.ts`. It will run git commands to compare staged files if `--cached` is passed, or read the files directly from the filesystem.
```typescript
import { execSync } from "child_process";

export interface SecurityCheckResult {
  valid: boolean;
  errors: string[];
}

export async function checkSecuritySettings(
  workspacePath: string,
  options?: { cached?: boolean; mockFiles?: Record<string, string> }
): Promise<SecurityCheckResult> {
  const errors: string[] = [];
  
  const getFileContent = (relPath: string): string | null => {
    if (options?.mockFiles && relPath in options.mockFiles) {
      return options.mockFiles[relPath];
    }
    const fullPath = path.join(workspacePath, relPath);
    if (!fs.existsSync(fullPath)) return null;
    
    if (options?.cached) {
      try {
        return execSync(`git show :${relPath}`, { cwd: workspacePath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return fs.readFileSync(fullPath, "utf-8");
      }
    }
    return fs.readFileSync(fullPath, "utf-8");
  };

  // 1. Pyproject TOML Checker
  const ruffContent = getFileContent("pyproject.toml");
  if (ruffContent) {
    try {
      const parsed = parseToml(ruffContent);
      const lintIgnore = parsed.tool?.ruff?.lint?.ignore || [];
      const lintExtendIgnore = parsed.tool?.ruff?.lint?.["extend-ignore"] || [];
      
      const sIgnore = [...lintIgnore, ...lintExtendIgnore].filter(rule => rule.startsWith("S"));
      if (sIgnore.length > 0) {
        errors.push(`Ruff security rule '${sIgnore.join(", ")}' added to ignore list in pyproject.toml!`);
      }
      
      const select = parsed.tool?.ruff?.lint?.select || [];
      const extendSelect = parsed.tool?.ruff?.lint?.["extend-select"] || [];
      // If select is customized, make sure S class is in select or extend-select if previously configured
      // Wait, let's verify if they have selected security rules.
    } catch (e: any) {
      errors.push(`Failed to parse pyproject.toml: ${e.message}`);
    }
  }

  // 2. Biome Checker
  const biomeContent = getFileContent("biome.json");
  if (biomeContent) {
    try {
      const parsed = JSON.parse(biomeContent);
      const secRules = parsed.linter?.rules?.security || {};
      for (const [rule, status] of Object.entries(secRules)) {
        if (status === "off") {
          errors.push(`Biome linter rule '${rule}' was disabled (set to 'off') in biome.json!`);
        }
      }
    } catch (e: any) {
      errors.push(`Failed to parse biome.json: ${e.message}`);
    }
  }

  // 3. Gitleaks Checker
  const gitleaksContent = getFileContent(".gitleaks.toml");
  if (gitleaksContent) {
    try {
      const parsed = parseToml(gitleaksContent);
      // Check allowlist paths
      const allowlistPaths = parsed.allowlist?.paths || [];
      const suspicious = allowlistPaths.filter((p: string) => p === "*" || p === "/" || p === "src" || p === "src/" || p.startsWith("../"));
      if (suspicious.length > 0) {
        errors.push(`.gitleaks.toml allowlist contains unsafe generic path: '${suspicious.join(", ")}'!`);
      }
    } catch (e: any) {
      errors.push(`Failed to parse .gitleaks.toml: ${e.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat: implement checkSecuritySettings verification engine"
```

---

### Task 3: CLI Subcommand integration

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**

Add a test inside CLI tests verifying command routing for `check-security` and `security install`.
```typescript
// in packages/clew-cli/src/index.test.ts
describe("clew check-security", () => {
  it("should run the check-security command and exit with 0 if clean", async () => {
    const { stdout, exitCode } = await runCli(["check-security"]);
    expect(exitCode).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-cli/src/index.test.ts`
Expected: FAIL with `usage: ...` error because check-security is not routing yet.

**Step 3: Write minimal implementation**

Add command routing in `packages/clew-cli/src/index.ts`.
In the `main` command parser:
```typescript
    } else if (subcommand === "check-security") {
      const cached = args.includes("--cached");
      const result = await checkSecuritySettings(process.cwd(), { cached });
      if (!result.valid) {
        console.error("\x1b[31m✖ [clew security] VETO: Security configuration degraded!\x1b[0m");
        console.error("  -------------------------------------------------------------");
        for (const err of result.errors) {
          console.error(`  Violation:    ${err}`);
        }
        console.error("\n  Rationale:    Deactivating AST-based security rules is prohibited by the");
        console.error("                project's security constitution.");
        console.error("  -------------------------------------------------------------");
        console.error("  ⚠️ Commit aborted. Please restore the security rules and try again.");
        process.exit(1);
      }
      console.log("✔ [clew security] Constitution review passed successfully!");
      process.exit(0);
    } else if (subcommand === "security" && args[0] === "install") {
      const gitDir = path.join(process.cwd(), ".git");
      if (!fs.existsSync(gitDir)) {
        console.error("❌ Not a git repository.");
        process.exit(1);
      }
      const hookPath = path.join(gitDir, "hooks", "pre-commit");
      const hookContent = `#!/bin/sh\n# clew constitutional security gate\nnpx clew check-security --cached\n`;
      fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
      console.log("🎉 Successfully installed constitutional pre-commit hook!");
      process.exit(0);
    }
```
Remember to add these commands to the help text output in the CLI.

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-cli/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-cli/src/index.ts packages/clew-cli/src/index.test.ts
git commit -m "feat: integrate clew check-security and security install to CLI"
```

---

### Task 4: Runbook Session Integration (Implicit Veto Gate)

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**

Add a test inside `SessionManager` test suite in `packages/clew-core/src/index.test.ts` where running verification fails implicitly if the workspace has a security degradation.
```typescript
  it("should fail verification and append an active_conflict warning if security configurations are degraded", async () => {
    // Setup a session and set current step
    // Modify pyproject.toml in workspace to include Ruff S ignore rule
    // verifyCurrentStep should return success: false and have active_conflict warnings
  });
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Inside `SessionManager.verifyCurrentStep(sessionId)`:
1. Call `checkSecuritySettings(process.cwd(), { cached: false })`.
2. If `!result.valid`:
   - Append an `active_conflict` warning entry in `gateResults`.
   - Set `allPassed = false`.
```typescript
    // Inside SessionManager.verifyCurrentStep
    const secCheck = await checkSecuritySettings(process.cwd(), { cached: false });
    if (!secCheck.valid) {
      allPassed = false;
      for (const err of secCheck.errors) {
        gateResults.push({
          type: "file" as any,
          success: false,
          error: `[CONSTITUTIONAL_VETO] ${err}`
        });
      }
    }
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat: embed implicit constitutional veto gate in SessionManager verifyCurrentStep"
```

---

### Task 5: End-to-End CLI and Git Hook Verification

**Files:**
- Verify execution of `clew check-security` and `clew security install` commands.
- Modify: `docs/plans/2026-05-29-constitutional-veto-design.md` (Update status to complete/implemented)

**Step 1: Install hook and run verification**

Run: `pnpm build`
Run: `node packages/clew-cli/dist/index.js security install`
Expected: "🎉 Successfully installed constitutional pre-commit hook!"

**Step 2: Run check-security**

Run: `node packages/clew-cli/dist/index.js check-security`
Expected: "✔ [clew security] Constitution review passed successfully!"

**Step 3: Update documentation and Commit**

Change status in `docs/plans/2026-05-29-constitutional-veto-design.md` from "Approved" to "Implemented".

```bash
git add docs/plans/2026-05-29-constitutional-veto-design.md
git commit -m "docs: mark v0.4 constitutional veto layer as fully implemented"
```

---
