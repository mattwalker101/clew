# clew-grill-me Operational Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a native, canonical `clew` operational skill `clew-grill-me` that provides structured, automated, and explainable Interactive Planning Alignment runbook steps and validation gates.

**Architecture:** Create a new skill directory `skills/clew-grill-me/` containing a `clew.yaml` manifest specifying metadata, triggers, and two runbook steps (Design Spec, Implementation Plan) with shell-based file and grep checks, alongside a `skill.md` defining general interactive planning guidelines.

**Tech Stack:** TypeScript, YAML, Markdown, Bash shell scripting.

---

### Task 1: Create Interactive Planning Instruction Guidelines

**Files:**
- Create: `skills/clew-grill-me/skill.md`

**Step 1: Write guidelines**
Create `skills/clew-grill-me/skill.md` with structured alignment principles:
```markdown
# Interactive Planning Alignment (Grill Me) Skill

You are in structured planning and design mode. You must align on the problem scope, explore architectural approaches, and author a design document before writing a single line of implementation code.

## Core Rules

1. **One Question at a Time**:
   - Do not overwhelm the user with lists of questions. Ask exactly one focused, high-value question per turn.
   - Seek to clarify: core purpose, constraints, external integration boundaries, and success criteria.

2. **Propose Alternatives First**:
   - Always present 2-3 distinct approaches with clear technical trade-offs.
   - Lead with your recommended approach and explicitly explain why it is optimal.

3. **Design Specification**:
   - Once aligned on the approach, author a design specification under `docs/plans/YYYY-MM-DD-<feature-name>-design.md`.
   - The design spec must cover: Architecture, Directory Structure, File Changes, Data Flow, and Test Plan.
   - Present the design in sections and wait for user approval for each.

4. **Implementation Planning**:
   - After the design is approved, translate it into a step-by-step implementation plan (e.g. `docs/plans/YYYY-MM-DD-<feature-name>.md`) with bite-sized, verifiable tasks.
   - Commit the plan to Git before starting any coding.
```

**Step 2: Verify file creation**
Verify `skills/clew-grill-me/skill.md` exists and contains the correct markdown content.

**Step 3: Commit**
```bash
git add skills/clew-grill-me/skill.md
git commit -m "feat(skills): create clew-grill-me instruction guidelines"
```

---

### Task 2: Create manifest and runbook steps

**Files:**
- Create: `skills/clew-grill-me/clew.yaml`

**Step 1: Write the manifest content**
Create `skills/clew-grill-me/clew.yaml` with the metadata, triggers, and runbook gates:
```yaml
id: clew-grill-me
version: 1.0.0
kind: instruction_skill
name: Interactive Planning Alignment (Grill Me)
description: Clarify scope, explore designs, and align on architecture before coding.
instructions:
  file: skill.md
tags:
  - planning
  - design
  - alignment
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
    - plan
    - design
    - bootstrap
    - new feature
    - architecture
    - grill-me
policies:
  - always interview the user with clarifying questions one at a time
  - propose 2-3 approaches with clear trade-offs and your recommendation
  - never write implementation code or step-by-step plans until a design specification is saved and approved
  - keep all designs strictly bound by the YAGNI principle
steps:
  - id: grill-design
    title: "Planning Phase 1: Interactive Design Spec"
    instruction: "Interview the user one question at a time to clarify scope, propose 2-3 approaches, and author a design document named 'docs/plans/YYYY-MM-DD-<feature>-design.md' containing a '# Design Spec' header."
    gates:
      - type: command
        command: "DESIGN_FILE=$(find docs/plans -name '*design.md' | head -n 1); if [ -z \"$DESIGN_FILE\" ]; then echo 'No design document found in docs/plans/!' >&2; exit 1; fi; grep -q '# Design Spec' \"$DESIGN_FILE\""
        description: "Asserts that the design specification document exists in 'docs/plans/' and contains the proper '# Design Spec' header."

  - id: grill-plan
    title: "Planning Phase 2: Implementation Plan"
    instruction: "Translate the approved design into a step-by-step implementation plan saved under 'docs/plans/YYYY-MM-DD-<feature>.md' that includes the standard hands-off executing-plans instruction."
    gates:
      - type: command
        command: "PLAN_FILE=$(find docs/plans -name '*.md' ! -name '*design.md' | head -n 1); if [ -z \"$PLAN_FILE\" ]; then echo 'No implementation plan found in docs/plans/!' >&2; exit 1; fi; grep -q 'REQUIRED SUB-SKILL: Use superpowers:executing-plans' \"$PLAN_FILE\""
        description: "Asserts that the step-by-step implementation plan document exists and conforms to standard handoff conventions."
```

**Step 2: Verify manifest file**
Verify `skills/clew-grill-me/clew.yaml` exists and compiles cleanly.

**Step 3: Commit**
```bash
git add skills/clew-grill-me/clew.yaml
git commit -m "feat(skills): create clew-grill-me manifest and runbook steps"
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
Expected: Output JSON includes `clew-grill-me` inside the `skills` list.
