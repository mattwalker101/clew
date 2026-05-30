# clew-diagnose Operational Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a native, canonical `clew` operational skill `clew-diagnose` that provides structured, automated, and explainable Systematic Debugging runbook steps and validation gates.

**Architecture:** Create a new skill directory `skills/clew-diagnose/` containing a `clew.yaml` manifest specifying metadata, triggers, and four runbook steps (Reproduce, Hypothesize & Fix, Verify, Clean Up) with shell-based reproduction detection and execution checks, alongside a `skill.md` defining general debugging guidelines.

**Tech Stack:** TypeScript, YAML, Markdown, Bash shell scripting.

---

### Task 1: Create Debugging Instruction Guidelines

**Files:**
- Create: `skills/clew-diagnose/skill.md`

**Step 1: Write TDD guidelines**
Create `skills/clew-diagnose/skill.md` with systematic debugging principles:
```markdown
# Systematic Debugging (Diagnose) Skill

You are in systematic debugging mode. Do not make ad-hoc changes to source code or guess fixes without solid evidence. You must follow the structured debugging lifecycle.

## Core Rules

1. **Reproduce First**:
   - Before editing any source files, write a minimal reproduction file.
   - Naming convention: Use `reproduce.js`, `reproduce.ts`, or a test file like `reproduce.test.ts`.
   - Run the reproduction file and confirm it fails (exits with a non-zero exit code or fails a Vitest assertion).

2. **Minimize & Isolate**:
   - Prune any extra dependencies or code paths from the reproduction case.
   - Locate the exact line or condition that triggers the defect.

3. **Hypothesize & Fix**:
   - Formulate a clear, logical hypothesis for the bug.
   - Implement the minimal fix in the codebase to satisfy the reproduction case.

4. **Verify**:
   - Run the reproduction case again. Verify that it now passes completely (exits with code 0).
   - Ensure the rest of the workspace's test suite remains green.

5. **Cleanup**:
   - Delete the temporary reproduction files (e.g. `reproduce.js`) to keep the working tree clean.
```

**Step 2: Verify file creation**
Verify `skills/clew-diagnose/skill.md` exists and contains the correct markdown content.

**Step 3: Commit**
```bash
git add skills/clew-diagnose/skill.md
git commit -m "feat(skills): create clew-diagnose instruction guidelines"
```

---

### Task 2: Create TDD manifest and runbook steps

**Files:**
- Create: `skills/clew-diagnose/clew.yaml`

**Step 1: Write the manifest content**
Create `skills/clew-diagnose/clew.yaml` with the metadata, triggers, and runbook gates:
```yaml
id: clew-diagnose
version: 1.0.0
kind: instruction_skill
name: Systematic Debugging (Diagnose)
description: Reproduce, isolate, hypothesize, fix, and verify defects systematically.
instructions:
  file: skill.md
tags:
  - debugging
  - testing
  - quality
capabilities:
  required:
    - filesystem
    - terminal
  optional:
    - git
compatibility:
  providers:
    - claude
    - codex
    - opencode
activation:
  triggers:
    - bug
    - fix
    - error
    - crash
    - debug
    - fails
    - diagnose
policies:
  - always reproduce the defect with a minimal test or script first
  - isolate the minimal code that produces the failure
  - verify that the reproduction case goes from red to green
  - clean up temporary reproduction files after verification
steps:
  - id: debug-reproduce
    title: "Debugging Phase 1: Reproduce"
    instruction: "Create a new reproduction file containing the word 'reproduce' (e.g. 'reproduce.js', 'reproduce.ts', or 'reproduce.test.ts'). Write code that fails and exposes the bug. Run it and verify that it exits with a non-zero code."
    gates:
      - type: command
        command: "REPRO_FILE=$(git status --porcelain | awk '{print $2}' | grep -E 'reproduce' | head -n 1); if [ -z \"$REPRO_FILE\" ]; then echo 'No active reproduction file found in git status!' >&2; exit 1; fi; if echo \"$REPRO_FILE\" | grep -qE '\\.test\\.(ts|tsx|js)$'; then npx vitest run \"$REPRO_FILE\"; elif echo \"$REPRO_FILE\" | grep -qE '\\.ts$'; then npx tsx \"$REPRO_FILE\"; else node \"$REPRO_FILE\"; fi; [ $? -ne 0 ]"
        description: "Verify that the reproduction file is found and that it fails (returns a non-zero exit code) to isolate the defect."

  - id: debug-fix
    title: "Debugging Phase 2: Hypothesize and Fix"
    instruction: "Analyze the defect, locate the root cause in the source files, and apply the minimal fix to solve the issue."
    gates: []

  - id: debug-verify
    title: "Debugging Phase 3: Verify Fix"
    instruction: "Execute the reproduction file again. The same case that previously failed must now execute and pass cleanly (exit with code 0)."
    gates:
      - type: command
        command: "REPRO_FILE=$(git status --porcelain | awk '{print $2}' | grep -E 'reproduce' | head -n 1); if [ -z \"$REPRO_FILE\" ]; then echo 'No active reproduction file found in git status!' >&2; exit 1; fi; if echo \"$REPRO_FILE\" | grep -qE '\\.test\\.(ts|tsx|js)$'; then npx vitest run \"$REPRO_FILE\"; elif echo \"$REPRO_FILE\" | grep -qE '\\.ts$'; then npx tsx \"$REPRO_FILE\"; else node \"$REPRO_FILE\"; fi"
        description: "Assert that the bug is resolved by verifying that the reproduction case now passes cleanly."

  - id: debug-cleanup
    title: "Debugging Phase 4: Clean Up"
    instruction: "Delete the temporary reproduction file and restore the git status to a pristine state before completing."
    gates:
      - type: command
        command: "REPRO_FILE=$(find . -maxdepth 4 -name '*reproduce*' | head -n 1); if [ -n \"$REPRO_FILE\" ]; then rm -f \"$REPRO_FILE\"; fi; git status --porcelain | grep -v 'reproduce' | wc -l"
        description: "Ensure that any temporary reproduction files are removed and all edits have been finalized."
```

**Step 2: Verify manifest file**
Verify `skills/clew-diagnose/clew.yaml` exists and compiles cleanly.

**Step 3: Commit**
```bash
git add skills/clew-diagnose/clew.yaml
git commit -m "feat(skills): create clew-diagnose manifest and runbook steps"
```

---

### Task 3: Final Build and Test Verification

**Files:**
- None

**Step 1: Rebuild composed index**
Run: `pnpm build`
Expected: Monorepo compiles completely with zero errors.

**Step 2: Run workspace tests**
Run: `pnpm test`
Expected: All 168 Vitest tests pass cleanly.

**Step 3: Verify composed list includes the new skill**
Run: `npx tsx packages/clew-cli/src/index.ts list`
Expected: Output JSON includes `clew-diagnose` inside the `skills` list.
