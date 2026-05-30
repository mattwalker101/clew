# CLI List Envelope Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin CLI `list` as a default public read envelope with enabled skill IDs and top-level registry warnings.

**Architecture:** Keep `clew-cli list` compatibility-shaped as `{ skills, warnings }`. The command should expose enabled public skills only, and disabled telemetry should continue to remove those skills from the list without creating request-time warnings.

**Tech Stack:** TypeScript, Vitest, fixture-backed JSON contracts, `@clew-ops/cli`.

---

### Task 1: Extend CLI Public Envelope Coverage for Enabled `list`

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`

**Step 1: Write the failing fixture assertion**

In the documented CLI public envelope contract test, call enabled `list` before other reads:

```ts
await main(["list"]);
```

Capture the output and add:

```ts
defaultSurfaces: {
  listKeys: Object.keys(list),
  ...
},
enabledReads: {
  listSkillIds: list.skills.map((skill) => skill.id),
  ...
},
warnings: {
  list: list.warnings,
  ...
}
```

**Step 2: Run the focused CLI test to verify it fails**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: FAIL because `public-envelope-contract.json` does not yet include enabled CLI list fields.

**Step 3: Update the fixture**

Update `tests/fixtures/contracts/public-envelope-contract.json` with:

```json
"listKeys": ["skills", "warnings"],
"listSkillIds": ["typescript-core"],
"list": []
```

**Step 4: Run the focused CLI test to verify it passes**

Run: `corepack pnpm --filter @clew-ops/cli test`

Expected: PASS.

### Task 2: Avoid Behavior Expansion

**Files:**
- Modify only if needed: `packages/clew-cli/src/index.ts`
- Modify only if needed: `docs/public-envelope-contract.md`

**Step 1: Preserve existing semantics**

Do not add MCP `list`, hidden activation, telemetry mutation, workflow behavior, or provider-specific behavior.

**Step 2: If docs need clarification**

Add CLI `clew-cli list` to the default read envelope bullets as `{ skills, warnings }`.

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
