# CLI Lookup Explain Envelope Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin CLI `lookup` and `explain` as default public read envelopes in the executable public envelope contract.

**Architecture:** Keep CLI default read surfaces compatibility-shaped with named payload fields and top-level warnings. Enabled `lookup` returns `{ skillId, bundle, warnings }`; enabled `explain` returns `{ skillId, query, recommendation, warnings }`; disabled variants continue to return null payloads plus request warnings.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/cli`.

---

### Task 1: Extend the CLI Public Envelope Fixture

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`

**Step 1: Write the failing fixture assertion**

In the documented CLI public envelope contract test, call enabled `lookup` and `explain` before disabling `typescript-core`:

```ts
await main(["lookup", "typescript-core"]);
await main(["explain", "typescript-core", "typescript"]);
```

Capture those outputs and add:

```ts
defaultSurfaces: {
  lookupKeys: Object.keys(lookup),
  explainKeys: Object.keys(explain),
  ...
},
enabledReads: {
  lookupSkillId: lookup.bundle?.manifest.id,
  explanationSkillId: explain.recommendation?.skillId,
  ...
},
warnings: {
  lookup: lookup.warnings,
  explain: explain.warnings,
  ...
}
```

**Step 2: Run the focused CLI test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: FAIL because `public-envelope-contract.json` is missing the new CLI `lookup` and `explain` fields.

**Step 3: Update the fixture**

Update `tests/fixtures/contracts/public-envelope-contract.json` with:

```json
"lookupKeys": ["skillId", "bundle", "warnings"],
"explainKeys": ["skillId", "query", "recommendation", "warnings"],
"lookupSkillId": "typescript-core",
"explanationSkillId": "typescript-core",
"lookup": [],
"explain": []
```

**Step 4: Run the focused CLI test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: PASS.

### Task 2: Avoid Behavior Expansion

**Files:**
- Modify only if needed: `packages/clew-cli/src/index.ts`

**Step 1: Preserve default envelope semantics**

Do not add a new analysis mode, telemetry mutation, workflow execution, provider behavior, or hidden activation.

**Step 2: If implementation changes are required**

Keep enabled `lookup` and `explain` aligned with `docs/public-envelope-contract.md`, and keep request-time unavailable-skill warnings envelope-local rather than persisted.

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
