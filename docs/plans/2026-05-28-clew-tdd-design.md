# Design Spec: Native clew-tdd Operational Skill

## Goal
Implement a native, canonical `clew` operational skill `clew-tdd` inside the `skills/` directory to enable automated, explainable, and local-first Test-Driven Development (TDD) cycles using clew runbooks and verification gates.

## Directory Structure
```text
skills/
  clew-tdd/
    clew.yaml   # Skill metadata, policies, and runbook steps
    skill.md    # Strict TDD execution guidelines and reference
```

## Specification

### 1. Skill Manifest (`skills/clew-tdd/clew.yaml`)
```yaml
id: clew-tdd
version: 1.0.0
kind: instruction_skill
name: Test-Driven Development (TDD)
description: Strict red-green-refactor loop with automated test execution gates.
instructions:
  file: skill.md
tags:
  - tdd
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
    - tdd
    - write test
    - failing test
    - red-green-refactor
    - unit test
policies:
  - write the failing test first
  - write the minimal code to pass the test
  - refactor code only when all tests are green
  - preserve existing test suites from regressions
steps:
  - id: tdd-red
    title: "TDD Phase 1: Red (Failing Test)"
    instruction: "Author a new unit test in your test file that asserts the desired new behavior. Run it and verify that it fails."
    gates:
      - type: command
        command: "TEST_FILE=$(git diff --name-only | grep -E 'test\\.(ts|tsx|js)$' | head -n 1); if [ -z \"$TEST_FILE\" ]; then echo 'No modified test file found!' >&2; exit 1; fi; npx vitest run \"$TEST_FILE\"; [ $? -ne 0 ]"
        description: "Asserts that the active test file has been modified and that the new test fails upon execution."

  - id: tdd-green
    title: "TDD Phase 2: Green (Passing Implementation)"
    instruction: "Write the minimal code needed to make the new test pass. Do not over-engineer or add extra logic."
    gates:
      - type: command
        command: "TEST_FILE=$(git diff --name-only | grep -E 'test\\.(ts|tsx|js)$' | head -n 1); if [ -z \"$TEST_FILE\" ]; then echo 'No modified test file found!' >&2; exit 1; fi; npx vitest run \"$TEST_FILE\""
        description: "Asserts that the implementation is complete and the active test now passes cleanly."

  - id: tdd-refactor
    title: "TDD Phase 3: Refactor"
    instruction: "Clean up, optimize, and refactor your implementation. Verify that the changes build cleanly and all tests remain green."
    gates:
      - type: command
        command: "pnpm build"
        description: "Asserts that the codebase compiles with zero TypeScript build or module resolution errors after refactoring."
```

### 2. Instruction Guidelines (`skills/clew-tdd/skill.md`)
The instruction guidelines detail strict rules for Red-Green-Refactor development, avoiding YAGNI over-engineering, localized monorepo test targeting, and keeping public TypeScript boundaries explicit.
