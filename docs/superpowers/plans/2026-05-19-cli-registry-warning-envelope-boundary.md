# CLI Registry Warning Public Envelope Placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin `skill_bundle_invalid` warning codes and origins across all CLI read surfaces in the documented public-envelope fixture, covering the degraded-registry scenario.

**Architecture:** Two files change only. TDD order: write the failing test extension first, then add the fixture values to make it pass. No runtime code changes. The invalid bundle block runs after the existing happy-path and disabled-skill blocks inside the same `it` test.

**Tech Stack:** TypeScript, Vitest, JSON fixture files.

---

## File Map

| File | Change |
|------|--------|
| `packages/clew-cli/src/index.test.ts` | Add third block (lines 1011–1012) inside `matches the documented CLI public envelope contract fixture` |
| `tests/fixtures/contracts/public-envelope-contract.json` | Add `cli.invalidBundleWarnings` and `cli.invalidBundleDoctor` sections |

---

## Background: What `writeInvalidFutureKindBundle` does

Already defined at `packages/clew-cli/src/index.test.ts:40-55`. Creates `skills/future-kind/clew.yaml` with `kind: workflow_skill` — an unrecognised kind that fails schema validation and produces a `skill_bundle_invalid` warning with `origin: "registry_rebuild"` and `severity: "error"`. No new helper needed.

## Background: Fixture test structure

`matches the documented CLI public envelope contract fixture` (line 890) runs three sequential blocks in one `it`:

1. **Happy-path block** (lines 893–1011) — valid registry, valid AGENTS.md (`- missing-skill`), all read surfaces, then disabled-skill reads.
2. **[NEW] Invalid-bundle block** — re-enable `typescript-core`, inject invalid bundle, re-run all read surfaces, assert against new fixture sections.

---

## Task 1: Write the failing test block

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts:1011`

- [ ] **Step 1: Insert the invalid-bundle block** after the existing `.toEqual(publicEnvelopeContractFixture().cli)` call at line 1011, before the closing `});` at line 1012.

Find this exact text:
```typescript
    }).toEqual(publicEnvelopeContractFixture().cli);
  });

  it("matches the documented CLI telemetry mutation boundary contract fixture", async () => {
```

Replace with:
```typescript
    }).toEqual(publicEnvelopeContractFixture().cli);

    await main(["enable", "typescript-core"]);
    writeInvalidFutureKindBundle(projectRoot);
    log.mockClear();

    await main(["list"]);
    await main(["search", "typescript"]);
    await main(["search", "--explain", "typescript"]);
    await main(["recommend", "typescript"]);
    await main(["recommend", "--explain", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["overlaps"]);
    await main(["conflicts"]);
    await main(["doctor"]);
    await main(["telemetry"]);
    await main(["telemetry", "--explain"]);

    const invList = outputAt(log, 0) as { warnings: Array<{ code: string; origin?: string }> };
    const invSearch = outputAt(log, 1) as { warnings: Array<{ code: string; origin?: string }> };
    const invSearchExplain = outputAt(log, 2) as { warnings: Array<{ code: string; origin?: string }> };
    const invRecommend = outputAt(log, 3) as { warnings: Array<{ code: string; origin?: string }> };
    const invRecommendExplain = outputAt(log, 4) as { warnings: Array<{ code: string; origin?: string }> };
    const invLookup = outputAt(log, 5) as { warnings: Array<{ code: string; origin?: string }> };
    const invExplain = outputAt(log, 6) as { warnings: Array<{ code: string; origin?: string }> };
    const invOverlaps = outputAt(log, 7) as { warnings: Array<{ code: string; origin?: string }> };
    const invConflicts = outputAt(log, 8) as { warnings: Array<{ code: string; origin?: string }> };
    const invDoctor = outputAt(log, 9) as {
      registryWarnings: Array<{ code: string; origin?: string }>;
      agentsDiagnostics: Array<{ code: string; origin?: string }>;
      warnings: Array<{ code: string; origin?: string }>;
    };
    const invTelemetry = outputAt(log, 10) as { warnings: Array<{ code: string; origin?: string }> };
    const invTelemetryExplain = outputAt(log, 11) as { warnings: Array<{ code: string; origin?: string }> };

    const invFixture = publicEnvelopeContractFixture() as {
      cli: {
        invalidBundleWarnings: Record<string, { codes: string[]; origins: string[] }>;
        invalidBundleDoctor: {
          registryWarningCodes: string[];
          registryWarningOrigins: string[];
          agentsDiagnosticCodes: string[];
          warningCodes: string[];
          warningOrigins: string[];
        };
      };
    };

    expect({
      invalidBundleWarnings: {
        list: { codes: invList.warnings.map((w) => w.code), origins: invList.warnings.map((w) => w.origin) },
        search: { codes: invSearch.warnings.map((w) => w.code), origins: invSearch.warnings.map((w) => w.origin) },
        searchExplain: { codes: invSearchExplain.warnings.map((w) => w.code), origins: invSearchExplain.warnings.map((w) => w.origin) },
        recommend: { codes: invRecommend.warnings.map((w) => w.code), origins: invRecommend.warnings.map((w) => w.origin) },
        recommendExplain: { codes: invRecommendExplain.warnings.map((w) => w.code), origins: invRecommendExplain.warnings.map((w) => w.origin) },
        lookup: { codes: invLookup.warnings.map((w) => w.code), origins: invLookup.warnings.map((w) => w.origin) },
        explain: { codes: invExplain.warnings.map((w) => w.code), origins: invExplain.warnings.map((w) => w.origin) },
        overlaps: { codes: invOverlaps.warnings.map((w) => w.code), origins: invOverlaps.warnings.map((w) => w.origin) },
        conflicts: { codes: invConflicts.warnings.map((w) => w.code), origins: invConflicts.warnings.map((w) => w.origin) },
        telemetry: { codes: invTelemetry.warnings.map((w) => w.code), origins: invTelemetry.warnings.map((w) => w.origin) },
        telemetryExplain: { codes: invTelemetryExplain.warnings.map((w) => w.code), origins: invTelemetryExplain.warnings.map((w) => w.origin) },
      },
      invalidBundleDoctor: {
        registryWarningCodes: invDoctor.registryWarnings.map((w) => w.code),
        registryWarningOrigins: invDoctor.registryWarnings.map((w) => w.origin),
        agentsDiagnosticCodes: invDoctor.agentsDiagnostics.map((w) => w.code),
        warningCodes: invDoctor.warnings.map((w) => w.code),
        warningOrigins: invDoctor.warnings.map((w) => w.origin),
      },
    }).toEqual({
      invalidBundleWarnings: invFixture.cli.invalidBundleWarnings,
      invalidBundleDoctor: invFixture.cli.invalidBundleDoctor,
    });
  });

  it("matches the documented CLI telemetry mutation boundary contract fixture", async () => {
```

- [ ] **Step 2: Run the CLI test to confirm it fails**

```bash
cd /Users/matt/code/clew && corepack pnpm --filter @clew/cli test
```

Expected: test `matches the documented CLI public envelope contract fixture` FAILS. Error will be something like `TypeError: Cannot read properties of undefined (reading 'invalidBundleWarnings')` because the fixture JSON does not yet have those keys.

If the test PASSES at this step, stop — the fixture already has those keys and something is wrong.

---

## Task 2: Add fixture sections

**Files:**
- Modify: `tests/fixtures/contracts/public-envelope-contract.json`

- [ ] **Step 1: Add `invalidBundleWarnings` and `invalidBundleDoctor`** inside the `"cli"` object, after the `"warnings"` block.

Find this exact text (the last two lines of the `"cli"` block):
```json
      "disabledRecommend": []
    }
  },
  "mcp": {
```

Replace with:
```json
      "disabledRecommend": []
    },
    "invalidBundleWarnings": {
      "list":             { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "search":           { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "searchExplain":    { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "recommend":        { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "recommendExplain": { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "lookup":           { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "explain":          { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "overlaps":         { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "conflicts":        { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "telemetry":        { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] },
      "telemetryExplain": { "codes": ["skill_bundle_invalid"], "origins": ["registry_rebuild"] }
    },
    "invalidBundleDoctor": {
      "registryWarningCodes":   ["skill_bundle_invalid"],
      "registryWarningOrigins": ["registry_rebuild"],
      "agentsDiagnosticCodes":  ["agents_skill_unknown"],
      "warningCodes":           ["skill_bundle_invalid", "agents_skill_unknown"],
      "warningOrigins":         ["registry_rebuild", "agents_diagnostic"]
    }
  },
  "mcp": {
```

- [ ] **Step 2: Run the CLI test to confirm it passes**

```bash
cd /Users/matt/code/clew && corepack pnpm --filter @clew/cli test
```

Expected: ALL tests pass. If `matches the documented CLI public envelope contract fixture` still fails, read the actual error:

- If `warningCodes` order mismatch in `invalidBundleDoctor`: check whether doctor emits `skill_bundle_invalid` before or after `agents_skill_unknown` in combined `warnings`. Adjust `"warningCodes"` and `"warningOrigins"` arrays in the fixture to match actual output order.
- If a surface has zero warnings: that surface does not propagate registry rebuild warnings. Remove that surface from `invalidBundleWarnings` and verify against `filesystem-discovery-contract.md`.
- If a surface has two warnings: `skill_bundle_invalid` may precede a request warning. Update the fixture codes/origins arrays to match.

---

## Task 3: Full suite verification and commit

**Files:** none additional

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/matt/code/clew && corepack pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Run type check**

```bash
cd /Users/matt/code/clew && corepack pnpm check
```

Expected: no errors.

- [ ] **Step 3: Check for whitespace issues**

```bash
cd /Users/matt/code/clew && git diff --check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/matt/code/clew && git add tests/fixtures/contracts/public-envelope-contract.json packages/clew-cli/src/index.test.ts && git commit -m "$(cat <<'EOF'
feat(contracts): pin CLI registry warning envelope placement across all read surfaces

Extends the documented CLI public-envelope fixture to cover the degraded-
registry scenario. Adds cli.invalidBundleWarnings (codes + origins per
surface) and cli.invalidBundleDoctor (registry/agents/combined) so
consumers have a contractual reference for how skill_bundle_invalid
registry rebuild warnings propagate through list, search, recommend,
lookup, explain, overlaps, conflicts, telemetry, and doctor.

No runtime behavior changes. The fixture test gains a third block that
re-enables typescript-core, injects writeInvalidFutureKindBundle, and
asserts against the new fixture sections.
EOF
)"
```

---

## Self-review notes

- `warningCodes` order in `invalidBundleDoctor` is `["skill_bundle_invalid", "agents_skill_unknown"]` — matches doctor's expected registry-first, agents-second concatenation. If wrong, Task 2 Step 2 error message will show the actual order.
- `writeInvalidFutureKindBundle` is already defined at `index.test.ts:40-55`. No import or helper needed.
- `enable` command is exercised at `index.test.ts:1070`. No new CLI command needed.
- `log.mockClear()` resets the spy index back to 0 for the third block. Indices 0–11 map to: list, search, search--explain, recommend, recommend--explain, lookup, explain, overlaps, conflicts, doctor, telemetry, telemetry--explain.
- AGENTS.md still contains `- missing-skill` from the fixture test setup at line 892-893. Doctor's `agentsDiagnostics` will still include `agents_skill_unknown`. This is intentional — the fixture pins both warning origins coexisting.
- `telemetry --explain` top-level `warnings` should contain `skill_bundle_invalid` (registry rebuild) but not AGENTS diagnostics. The existing test at line 453-475 confirms AGENTS diagnostics stay out of telemetry.
