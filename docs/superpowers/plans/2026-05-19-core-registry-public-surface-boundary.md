# Core Registry Public Surface Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin Phase 2 registry public read surfaces so disabled skills and telemetry-only state stay out of normal reads while explicit diagnostic surfaces remain explainable.

**Architecture:** Keep filesystem bundles as canonical registry input and telemetry as derived local state. Public registry and activation reads should flow through enabled-only helpers, while `analyzeTelemetry()` remains the explicit diagnostic surface for disabled and orphan telemetry.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/core`.

---

### Task 1: Extend Registry Contract Coverage

**Files:**
- Modify: `packages/clew-core/src/index.test.ts`
- Modify: `tests/fixtures/contracts/registry-resolution-contract.json`

**Step 1: Write the failing contract test**

Add `analyzeSearch`, `recommend`, and `explain` assertions to the existing `registry-resolution-contract.json` fixture construction:

```ts
publicEligibility: {
  list: registry.list().map((candidate) => candidate.manifest.id),
  lookupLayeredSkill: registry.lookup("layered-skill")?.manifest.name,
  lookupDisabledPublic: registry.lookup("disabled-public") ?? null,
  searchDisabled: registry.search("disabled").map((candidate) => candidate.manifest.id),
  analyzeSearchDisabled: registry.analyzeSearch("disabled").matches.map((match) => match.skillId),
  index: registry.analyzeIndex(),
  recommendDisabled: new ActivationEngine(registry)
    .recommend({ query: "disabled", capabilities: [] })
    .map((recommendation) => recommendation.skillId),
  explainDisabledPublic: new ActivationEngine(registry).explain("disabled-public", {
    query: "disabled",
    capabilities: [],
  }) ?? null,
}
```

**Step 2: Run the focused test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/core test -- --runInBand`

Expected: FAIL because the generated contract has new public surface fields missing from `registry-resolution-contract.json`.

**Step 3: Update the fixture**

Update `tests/fixtures/contracts/registry-resolution-contract.json` with:

```json
"analyzeSearchDisabled": [],
"recommendDisabled": [],
"explainDisabledPublic": null
```

**Step 4: Run the focused test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/core test -- --runInBand`

Expected: PASS.

### Task 2: Harden Implementation Only If Red Test Reveals Leakage

**Files:**
- Modify if needed: `packages/clew-core/src/index.ts`

**Step 1: Inspect the failing field**

If any new registry contract field exposes `disabled-public`, identify the surface:

- `analyzeSearchDisabled` means `analyzeIndex()` or `analyzeSearch()` is indexing disabled entries.
- `recommendDisabled` means activation inclusion is not respecting disabled status.
- `explainDisabledPublic` means `explain()` is resolving outside recommendation results.

**Step 2: Implement the minimum fix**

Keep the existing public boundary shape:

- `SkillRegistry.list()` returns enabled bundles only.
- `SkillRegistry.lookup()` returns enabled bundles only.
- `SkillRegistry.analyzeIndex()` indexes enabled entries only.
- `SkillRegistry.search()` maps search matches back through `list()`.
- `ActivationEngine.recommend()` returns only included candidates.
- `ActivationEngine.explain()` searches `recommend()` output only.

**Step 3: Re-run focused tests**

Run: `corepack pnpm --filter @clew-ops/core test -- --runInBand`

Expected: PASS.

### Task 3: Verify Warning Placement

**Files:**
- Modify if needed: `packages/clew-core/src/index.test.ts`
- Modify if needed: `tests/fixtures/contracts/registry-resolution-contract.json`

**Step 1: Confirm duplicate resolution is warning-free**

The existing registry fixture should continue to assert `snapshot.warnings: []` and no `resolutionDiagnostics` on the snapshot or registry.

**Step 2: Confirm degraded rebuild warnings stay top-level**

Run the existing rebuildability tests and ensure invalid filesystem bundles still appear only in snapshot warning arrays and persisted registry warning rows.

**Step 3: Avoid new warning semantics**

Do not add warnings for valid duplicate skill IDs, disabled telemetry, disabled public eligibility, or telemetry-only state.

### Task 4: Final Verification

**Files:**
- No edits expected.

**Step 1: Run core package tests**

Run: `corepack pnpm --filter @clew-ops/core test`

Expected: PASS.

**Step 2: Run repository checks if core tests pass**

Run: `corepack pnpm check`

Expected: PASS.

**Step 3: Inspect changed files**

Run: `git diff --stat && git diff --check`

Expected: only the plan, core contract test, and registry fixture changed; no whitespace errors.
