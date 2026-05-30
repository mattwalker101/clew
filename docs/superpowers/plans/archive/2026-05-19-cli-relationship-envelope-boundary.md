# CLI Relationship Envelope Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin CLI `overlaps` and `conflicts` as default relationship read envelopes in the public envelope contract.

**Architecture:** Keep relationship commands read-only and compatibility-shaped. `clew-cli overlaps` returns `{ overlaps, warnings }`; `clew-cli conflicts` returns `{ conflicts, warnings }`; registry rebuild warnings stay top-level and relationship rows remain advisory analysis data.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/cli`.

---

### Task 1: Extend CLI Public Envelope Coverage for Relationship Reads

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`
- Modify: `docs/public-envelope-contract.md`

**Step 1: Write the failing fixture assertion**

In the documented CLI public envelope contract test, call relationship commands before disabling `typescript-core`:

```ts
await main(["overlaps"]);
await main(["conflicts"]);
```

Capture outputs and add:

```ts
defaultSurfaces: {
  overlapsKeys: Object.keys(overlaps),
  conflictsKeys: Object.keys(conflicts),
  ...
},
relationshipReads: {
  overlapCount: overlaps.overlaps.length,
  conflictCount: conflicts.conflicts.length,
},
warnings: {
  overlaps: overlaps.warnings,
  conflicts: conflicts.warnings,
  ...
}
```

**Step 2: Run the focused CLI test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: FAIL because `public-envelope-contract.json` does not yet include relationship envelope fields.

**Step 3: Update the fixture and docs**

Update `tests/fixtures/contracts/public-envelope-contract.json` with:

```json
"overlapsKeys": ["overlaps", "warnings"],
"conflictsKeys": ["conflicts", "warnings"],
"relationshipReads": {
  "overlapCount": 0,
  "conflictCount": 0
},
"overlaps": [],
"conflicts": []
```

Update `docs/public-envelope-contract.md` to list:

```md
- CLI `clew-cli overlaps` returns `{ overlaps, warnings }`.
- CLI `clew-cli conflicts` returns `{ conflicts, warnings }`.
```

**Step 4: Run the focused CLI test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: PASS.

### Task 2: Avoid Behavior Expansion

**Files:**
- Modify only if needed: `packages/clew-cli/src/index.ts`

**Step 1: Preserve existing semantics**

Do not add MCP relationship endpoints, workflow execution, hidden activation, telemetry mutation, or provider-specific behavior.

**Step 2: If implementation changes are required**

Keep relationship output read-only and top-level-warning shaped; do not persist request-time relationship diagnostics.

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
