# Provider Unsupported Input Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make unsupported provider and malformed provider-input failure behavior executable for CLI import/export boundaries.

**Architecture:** Add a focused public contract fixture that derives its provider scope from `provider-interop-boundary-contract.json`: Claude and OpenCode stay supported, while Cursor, Windsurf, and Copilot remain excluded. Pin CLI failure surfaces as stderr-only failures with no JSON output and no registry or telemetry mutation. Reuse existing importer/exporter APIs; do not add new provider adapters, provider-specific wrapper envelopes, or runtime state writes.

**Tech Stack:** TypeScript, Vitest, Node filesystem test helpers, existing `@clew-ops/cli`, `@clew-ops/importers`, `@clew-ops/exporters`, and contract fixtures under `tests/fixtures/contracts`.

---

### Task 1: Add the Unsupported Boundary Fixture

**Files:**
- Create: `tests/fixtures/contracts/provider-unsupported-boundary-contract.json`

**Steps:**
1. Add `version`, `description`, and `scope`.
2. Copy the provider scope from `provider-interop-boundary-contract.json`:
   - `supportedProviders`: `["claude", "opencode"]`
   - `excludedProviders`: `["cursor", "windsurf", "copilot"]`
3. Add `cli.unsupportedProviders` with one row per excluded provider:
   - `importUsage`: `usage: clew-cli import <claude|opencode> <json-file>`
   - `exportUsage`: `usage: clew-cli export <claude|opencode> <skill-id>`
   - `printsJson`: `false`
4. Add `cli.malformedInput` rows for invalid field type and empty instructions/content:
   - `invalidIdError`: `claude field "id" must be a string`
   - `emptyInstructionsError`: `claude skill must include non-empty instructions or content`
   - `printsJson`: `false`
5. Add `cli.failedCommandsDoNotMutate` expectations:
   - `telemetryRows`: `[{ "skillId": "typescript-core", "usageCount": 0 }]`
   - `listSkillIds`: `["typescript-core"]`
   - `warnings`: `[]`

### Task 2: Write Failing CLI Unsupported Provider Tests

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

**Steps:**
1. Add a helper to load `provider-unsupported-boundary-contract.json`.
2. Add a test that iterates over fixture `scope.excludedProviders`.
3. For each provider, run `main(["import", provider, inputPath])` and `main(["export", provider, "typescript-core"])`.
4. Spy on `console.error` and `console.log`.
5. Expect both commands to throw via `process.exit`, print the fixture usage strings to stderr, and print no JSON.
6. Run: `corepack pnpm --filter @clew-ops/cli test -- --runInBand`
7. Expected red result before implementation if the current `process.exit` behavior is not test-friendly.

### Task 3: Write Failing CLI Malformed Input Tests

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

**Steps:**
1. Use fixture `cli.malformedInput`.
2. Write invalid JSON files with:
   - `{ "id": 123, "instructions": "Use the skill." }`
   - `{ "id": "broken", "instructions": "" }`
3. Run `main(["import", "claude", inputPath])`.
4. Expect rejection messages to match the fixture and `console.log` to remain uncalled.
5. Run the targeted CLI tests and confirm they fail if current behavior prints JSON or hides the clear error.

### Task 4: Write Failed-Command Non-Mutation Test

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

**Steps:**
1. Create a project using the existing test helper.
2. Run failed commands:
   - unsupported import
   - unsupported export
   - malformed import
   - unknown-skill export
3. Catch failures so the test can continue.
4. Run `main(["telemetry"])` and `main(["list"])`.
5. Compare telemetry rows, list skill ids, and warning arrays to `cli.failedCommandsDoNotMutate`.
6. This pins that failed provider commands do not mutate registry or telemetry state.

### Task 5: Implement Minimal CLI Error Handling If Needed

**Files:**
- Modify: `packages/clew-cli/src/index.ts`

**Steps:**
1. Only change production code if the red tests expose a gap.
2. Keep provider allow-list validation before file reads, JSON parsing, registry rebuilds, or export lookup.
3. Keep malformed provider-input errors thrown before `printJson`.
4. Do not add provider support for Cursor, Windsurf, or Copilot.
5. Do not add wrapper envelopes around provider import/export success or failure output.

### Task 6: Verify the Slice

**Files:**
- Expected changes:
  - `docs/superpowers/plans/2026-05-19-provider-unsupported-input-boundary.md`
  - `tests/fixtures/contracts/provider-unsupported-boundary-contract.json`
  - `packages/clew-cli/src/index.test.ts`
  - `packages/clew-cli/src/index.ts` only if required by red tests

**Steps:**
1. Run targeted CLI tests:
   - `corepack pnpm --filter @clew-ops/cli test`
2. Run full repo verification:
   - `corepack pnpm test`
   - `corepack pnpm check`
3. Inspect `git diff` and confirm no unsupported provider support or provider-specific wrapper envelopes were introduced.
