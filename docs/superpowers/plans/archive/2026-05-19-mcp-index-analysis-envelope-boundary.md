# MCP Index Analysis Envelope Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin MCP `analyzeIndex()` as an explicit public analysis envelope with top-level registry warnings.

**Architecture:** Keep MCP read envelopes compatibility-shaped and explicit analysis surfaces opt-in. `analyzeIndex()` should expose `{ analysis, warnings }`, reuse `SkillRegistry.analyzeIndex()`, and keep registry rebuild warnings at the top level without adding request or activation semantics.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/mcp`.

---

### Task 1: Extend the Public Envelope Fixture for MCP `analyzeIndex()`

**Files:**
- Modify: `packages/clew-mcp/src/index.test.ts`
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`

**Step 1: Write the failing fixture assertion**

In the documented MCP public envelope contract test, capture:

```ts
const indexAnalysis = bridge.analyzeIndex();
```

Add these generated fixture fields:

```ts
analysisSurfaces: {
  indexAnalysisKeys: Object.keys(indexAnalysis),
  searchAnalysisKeys: Object.keys(searchAnalysis),
  recommendationAnalysisKeys: Object.keys(recommendationAnalysis),
  telemetryAnalysisKeys: Object.keys(telemetryAnalysis),
},
enabledReads: {
  indexAnalysisSkillIds: indexAnalysis.analysis.index.map((item) => item.skillId),
  ...
},
topLevelWarningCodes: {
  indexAnalysis: indexAnalysis.warnings.map((warning) => warning.code),
  ...
}
```

**Step 2: Run the focused MCP test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/mcp test`

Expected: FAIL because `public-envelope-contract.json` is missing the new MCP `analyzeIndex()` fields.

**Step 3: Update the fixture**

Update `tests/fixtures/contracts/public-envelope-contract.json` to include:

```json
"indexAnalysisKeys": ["analysis", "warnings"],
"indexAnalysisSkillIds": ["typescript-core"],
"indexAnalysis": ["skill_bundle_invalid"]
```

**Step 4: Run the focused MCP test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/mcp test`

Expected: PASS.

### Task 2: Avoid Behavior Expansion

**Files:**
- Modify only if the red test reveals a mismatch: `packages/clew-mcp/src/index.ts`

**Step 1: Preserve existing envelope semantics**

Do not add CLI `analyzeIndex`, workflow execution, hidden activation, telemetry mutation, or provider-specific behavior.

**Step 2: If implementation changes are required**

Keep `analyzeIndex()` as:

```ts
{
  analysis: registry.analyzeIndex(),
  warnings: registryWarnings,
}
```

Registry rebuild warnings remain top-level only.

### Task 3: Verify

**Files:**
- No edits expected.

**Step 1: Run MCP tests**

Run: `corepack pnpm --filter @clew-ops/mcp test`

Expected: PASS.

**Step 2: Run repo tests and checks**

Run:

```bash
corepack pnpm test
corepack pnpm check
git diff --check
```

Expected: all pass.
