# Provider Interop Fidelity Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin Claude/OpenCode import/export fidelity as an executable public contract.

**Architecture:** Add one combined contract fixture that summarizes provider boundary outcomes across importers, exporters, and CLI command envelopes. Reuse existing provider fixtures and APIs; only change production code if the new contract exposes drift from the intended behavior.

**Tech Stack:** TypeScript, Vitest, Zod schemas from `@clew/schema`, existing `@clew/importers`, `@clew/exporters`, and `@clew/cli`.

---

### Task 1: Add the Combined Provider Boundary Fixture

**Files:**
- Create: `tests/fixtures/contracts/provider-interop-boundary-contract.json`

**Steps:**
1. Create a fixture with `version`, `description`, and sections for `scope`, `imports`, `exports`, and `cli`.
2. In `scope`, pin supported providers as `["claude", "opencode"]` and excluded providers as `["cursor", "windsurf", "copilot"]`.
3. In `imports`, pin degraded Claude metadata preservation and OpenCode mode normalization:
   - Provider-specific metadata remains under `extensions.<provider>`.
   - Provenance source/importer fields are preserved.
   - Warning codes and origins are explicit provider import warnings.
4. In `exports`, pin Claude/OpenCode artifacts and warnings:
   - Artifacts remain plain arrays.
   - Composition/capability degradation warnings remain explicit.
   - Exporting to undeclared providers warns rather than silently implying compatibility.
5. In `cli`, pin `clew import` and `clew export` summary envelopes against the same provider boundary outcomes.

### Task 2: Add Importer Fixture-Backed Boundary Test

**Files:**
- Modify: `packages/clew-importers/src/index.test.ts`

**Steps:**
1. Add a helper to read `provider-interop-boundary-contract.json`.
2. Write a failing test that imports `claude-degraded.json` and `opencode-normalized.json`.
3. Compare provider names, manifest ids, extension namespace keys, preserved provider metadata, provenance, warning codes, and warning origins to the fixture.
4. Run `corepack pnpm --filter @clew/importers test` and confirm the test fails until the fixture exists.

### Task 3: Add Exporter Fixture-Backed Boundary Test

**Files:**
- Modify: `packages/clew-exporters/src/index.test.ts`

**Steps:**
1. Add a helper to read `provider-interop-boundary-contract.json`.
2. Write a test that exports `canonical-roundtrip.json` to Claude and OpenCode, plus the existing Claude-only bundle to OpenCode.
3. Compare artifact paths, warning codes, warning origins, and undeclared-provider warning behavior to the fixture.
4. Run `corepack pnpm --filter @clew/exporters test`.

### Task 4: Add CLI Fixture-Backed Boundary Test

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

**Steps:**
1. Add a helper to read `provider-interop-boundary-contract.json`.
2. Write a test for `clew import claude <json-file>` using degraded provider metadata.
3. Write a test for `clew export opencode typescript-core`.
4. Compare scriptable JSON summaries to the fixture without introducing wrapper envelopes.
5. Run the targeted CLI test command through `corepack pnpm --filter @clew/cli test`.

### Task 5: Verify the Slice

**Files:**
- Expected production code changes: none unless contract drift is discovered.

**Steps:**
1. Run targeted package tests:
   - `corepack pnpm --filter @clew/importers test`
   - `corepack pnpm --filter @clew/exporters test`
   - `corepack pnpm --filter @clew/cli test`
2. Run full repo verification:
   - `corepack pnpm test`
   - `corepack pnpm check`
3. Inspect `git diff` to confirm the slice only adds the boundary fixture and fixture-backed tests unless a real implementation gap required a production fix.
