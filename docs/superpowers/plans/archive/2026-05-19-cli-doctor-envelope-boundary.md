# CLI Doctor Envelope Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin CLI `doctor` as the diagnostic public envelope that separates registry rebuild warnings from AGENTS.md diagnostics.

**Architecture:** Keep `clew-cli doctor` read-only and compatibility-shaped. The envelope exposes diagnostic counts/context plus `registryWarnings`, `agentsDiagnostics`, and a combined `warnings` array. AGENTS.md diagnostics remain request diagnostics only and must not leak into telemetry or persisted registry warning rows.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/cli`.

---

### Task 1: Extend CLI Public Envelope Coverage for `doctor`

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`
- Modify: `docs/public-envelope-contract.md`

**Step 1: Write the failing fixture assertion**

In the documented CLI public envelope contract test, write an `AGENTS.md` with one missing active skill and call:

```ts
await main(["doctor"]);
```

Capture the output and add:

```ts
defaultSurfaces: {
  doctorKeys: Object.keys(doctor),
  ...
},
doctor: {
  skills: doctor.skills,
  registryWarningCodes: doctor.registryWarnings.map((warning) => warning.code),
  agentsDiagnosticCodes: doctor.agentsDiagnostics.map((warning) => warning.code),
  warningCodes: doctor.warnings.map((warning) => warning.code),
  agentsPreferences: doctor.agentsPreferences,
},
```

**Step 2: Run the focused CLI test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: FAIL because `public-envelope-contract.json` does not yet include doctor envelope fields.

**Step 3: Update fixture and docs**

Update `tests/fixtures/contracts/public-envelope-contract.json` with the observed doctor keys and warning categories.

Update `docs/public-envelope-contract.md` to list:

```md
- CLI `clew-cli doctor` returns `{ skills, dbPath, repoSignals, overlaps, conflicts, registryWarnings, agentsDiagnostics, agentsPreferences, warnings }`.
```

**Step 4: Run the focused CLI test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: PASS.

### Task 2: Avoid Behavior Expansion

**Files:**
- Modify only if needed: `packages/clew-cli/src/index.ts`

**Step 1: Preserve existing semantics**

Do not add workflow execution, hidden activation, telemetry mutation, provider behavior, or new warning categories.

**Step 2: If implementation changes are required**

Keep registry rebuild warnings and AGENTS.md diagnostics categorized separately, with `warnings` remaining the backward-compatible combined array.

### Task 3: Verify

**Files:**
- No edits expected.

**Step 1: Run CLI tests**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: PASS.

**Step 2: Run repository verification**

Run:

```bash
corepack pnpm test
corepack pnpm check
git diff --check
```

Expected: all pass.
