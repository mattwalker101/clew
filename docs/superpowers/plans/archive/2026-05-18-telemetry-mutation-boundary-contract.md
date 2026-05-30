# Telemetry Mutation Boundary Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the Phase 2 telemetry mutation boundary so only explicit local telemetry mutations write derived SQLite state, while analysis/read commands, request warnings, and filesystem skill bundles remain non-mutating.

**Architecture:** Add a focused documentation contract and executable fixture for telemetry mutation behavior. Use CLI integration tests for command-level mutation boundaries and core tests for SQLite persistence/rebuild semantics. Keep filesystem bundles canonical, SQLite registry/telemetry derived, and request-time warnings ephemeral.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, pnpm workspace packages.

---

## File Structure

- Create: `docs/telemetry-mutation-boundary-contract.md`
  - Define allowed telemetry mutations, non-mutating read/analysis surfaces, filesystem immutability, and warning persistence rules.
- Create: `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json`
  - Pin representative CLI/core observations: usage counts, mutation/no-mutation command lists, disabled state behavior, unchanged filesystem bundle text, and persisted warning rows.
- Modify: `packages/clew-cli/src/index.test.ts`
  - Add fixture-backed CLI integration tests for recommendation usage recording, read/analysis no-op behavior, enable/disable boundaries, and request warning ephemerality.
- Modify: `packages/clew-core/src/index.test.ts`
  - Add fixture-backed core tests for SQLite-derived telemetry state, registry rebuild behavior, and filesystem canonical truth.
- Optional Modify: `packages/clew-core/src/index.ts` and `packages/clew-cli/src/index.ts`
  - Only change implementation if the new failing tests reveal a real contract gap.

---

## Contract Shape

Use this fixture shape unless implementation discovers a simpler local convention:

```json
{
  "version": 1,
  "description": "Telemetry mutation boundaries keep filesystem bundles canonical and restrict writes to explicit derived SQLite state.",
  "cli": {
    "usageRecording": {
      "plainRecommendUsageCount": 1,
      "recommendExplainUsageCount": 0,
      "nonMutatingCommandsUsageCount": 0,
      "recordedRecommendationIds": ["typescript-core"],
      "excludedRecommendationIds": ["unmatched-skill"]
    },
    "disableEnable": {
      "disabledTelemetryRow": { "skillId": "typescript-core", "disabled": true, "usageCount": 0 },
      "disabledListSkillIds": [],
      "reenabledListSkillIds": ["typescript-core"],
      "filesystemManifestUnchanged": true
    },
    "requestWarnings": {
      "lookupMissingWarningCodes": ["skill_unknown"],
      "lookupDisabledWarningCodes": ["skill_disabled"],
      "explainUnrecommendedWarningCodes": ["skill_not_recommended"],
      "persistedRegistryWarningCodes": []
    }
  },
  "core": {
    "sqliteDerivedState": {
      "disabledAffectsRegistryWhileDbExists": true,
      "deleteDbClearsDisabledState": true,
      "filesystemManifestUnchanged": true
    },
    "registryRebuildWarnings": {
      "requestWarningCodesPersisted": [],
      "registryWarningCodesPersisted": ["skill_bundle_invalid"]
    }
  }
}
```

---

### Task 1: Document The Mutation Boundary

**Files:**
- Create: `docs/telemetry-mutation-boundary-contract.md`

- [ ] **Step 1: Write the contract doc**

Create the doc with these sections:

```markdown
# Telemetry Mutation Boundary Contract

Telemetry mutation is derived local state only. Filesystem skill bundles remain canonical truth, and SQLite registry/telemetry data must be rebuildable from filesystem bundles plus explicit local telemetry choices.

## Mutating Surfaces

- `clew-cli recommend <query>` records usage only for skills included in the returned recommendations.
- `clew-cli disable <skill-id>` records disabled state only in SQLite telemetry-derived state.
- `clew-cli enable <skill-id>` clears disabled state only in SQLite telemetry-derived state.

## Non-Mutating Surfaces

- `clew-cli recommend --explain <query>` does not record usage.
- `clew-cli explain <skill-id> [query]` does not record usage.
- `clew-cli search <query>` and `clew-cli search --explain <query>` do not record usage.
- `clew-cli lookup <skill-id>` does not record usage.
- `clew-cli telemetry` and `clew-cli telemetry --explain` do not record usage.
- MCP read and analysis surfaces do not record usage unless an explicit future mutation API is introduced.

## Filesystem Boundary

Enable/disable and recommendation usage never rewrite filesystem skill bundles. Disabled telemetry may exclude a known skill from public read and recommendation surfaces while the DB exists, but deleting the DB removes telemetry-derived local state and leaves the filesystem bundle as canonical truth.

## Warning Boundary

Request-time warnings such as unknown, disabled, and not-recommended skill warnings are returned on request envelopes only. They are not persisted as registry rebuild warnings or telemetry rows. Registry rebuild warnings remain top-level persisted rebuild diagnostics.

The executable fixture at `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json` pins representative command behavior.
```

- [ ] **Step 2: Run a docs-only sanity check**

Run: `test -f docs/telemetry-mutation-boundary-contract.md`

Expected: command exits `0`.

- [ ] **Step 3: Commit the doc**

```bash
git add docs/telemetry-mutation-boundary-contract.md
git commit -m "docs: define telemetry mutation boundary"
```

---

### Task 2: Add The Executable Contract Fixture

**Files:**
- Create: `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json`

- [ ] **Step 1: Add the fixture**

Create `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json` using the contract shape above. Keep fields outcome-focused, not implementation-specific.

- [ ] **Step 2: Verify JSON syntax**

Run: `node -e 'JSON.parse(require("node:fs").readFileSync("tests/fixtures/contracts/telemetry-mutation-boundary-contract.json", "utf8"))'`

Expected: command exits `0`.

- [ ] **Step 3: Commit the fixture**

```bash
git add tests/fixtures/contracts/telemetry-mutation-boundary-contract.json
git commit -m "test: add telemetry mutation boundary fixture"
```

---

### Task 3: Pin CLI Mutation Semantics

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

- [ ] **Step 1: Add a fixture helper**

Near `publicEnvelopeContractFixture()`, add:

```ts
function telemetryMutationBoundaryFixture(): { cli: unknown } {
  return JSON.parse(
    readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "telemetry-mutation-boundary-contract.json"), "utf8"),
  ) as { cli: unknown };
}
```

- [ ] **Step 2: Write the failing CLI contract test**

Add one fixture-backed test that creates a project with `typescript-core` and an unmatched second skill, then runs:

- `recommend "typescript"` and `telemetry` to prove only included recommendations are recorded.
- A fresh project with `recommend --explain`, `explain`, `search`, `lookup`, `telemetry`, and `telemetry --explain` to prove read/analysis commands leave usage at `0`.
- `disable`, `list`, `enable`, `list` while comparing the original `skills/typescript-core/clew.yaml` contents before and after.
- `lookup missing-skill`, `disable typescript-core`, `lookup typescript-core`, and `explain typescript-core unrelated`, followed by `telemetry`, to prove request warnings are absent from persisted registry warnings.

Build an observed object and compare it to `telemetryMutationBoundaryFixture().cli`.

- [ ] **Step 3: Run the failing CLI test**

Run: `corepack pnpm vitest run packages/clew-cli/src/index.test.ts -t "telemetry mutation boundary"`

Expected before implementation/fixture alignment: FAIL if the fixture or behavior is not yet wired correctly.

- [ ] **Step 4: Make the minimal CLI/core changes if needed**

Expected likely implementation state:

- `clew-cli recommend <query>` already calls `db.recordRecommendation()` for returned recommendations only.
- `clew-cli recommend --explain`, `explain`, `search`, `lookup`, and `telemetry` should already avoid `recordRecommendation()`.
- `enable`/`disable` should already use `db.setSkillDisabled()` and avoid filesystem writes.

Only edit implementation if the test exposes a gap. Do not add hidden mutation APIs.

- [ ] **Step 5: Run the CLI test again**

Run: `corepack pnpm vitest run packages/clew-cli/src/index.test.ts -t "telemetry mutation boundary"`

Expected: PASS.

- [ ] **Step 6: Commit CLI contract test and any implementation fix**

```bash
git add packages/clew-cli/src/index.test.ts packages/clew-cli/src/index.ts packages/clew-core/src/index.ts
git commit -m "test: pin cli telemetry mutation boundary"
```

---

### Task 4: Pin Core SQLite-Derived State Semantics

**Files:**
- Modify: `packages/clew-core/src/index.test.ts`

- [ ] **Step 1: Add a fixture helper type cast**

Reuse existing `contractFixture(name)` and read `telemetry-mutation-boundary-contract.json`.

- [ ] **Step 2: Write the failing core contract test**

Add a test that:

1. Creates a temporary filesystem skill bundle.
2. Reads the original `clew.yaml`.
3. Opens a registry DB and calls `rebuildRegistryIndex`.
4. Calls `db.setSkillDisabled("typescript-core", true)`.
5. Rebuilds the registry index with the same DB and proves `SkillRegistry.list()` excludes the skill.
6. Confirms the `clew.yaml` text is unchanged.
7. Deletes `.clew-registry.db`.
8. Rebuilds the registry index and proves the skill is enabled again because filesystem truth remained unchanged.

Compare the observed object to `telemetryMutationBoundaryFixture().core.sqliteDerivedState`.

- [ ] **Step 3: Add request-warning persistence coverage**

If CLI coverage is enough for request warnings, keep this core-side check narrow:

- Build one invalid bundle to produce a registry rebuild warning.
- Persist the rebuild index.
- Assert `db.listRegistryWarnings()` contains only the registry rebuild warning code.
- Assert request warning codes from the fixture are not present, because request warnings are created by CLI/MCP envelope code and never passed to `rebuildIndex()`.

Compare to `telemetryMutationBoundaryFixture().core.registryRebuildWarnings`.

- [ ] **Step 4: Run the failing core test**

Run: `corepack pnpm vitest run packages/clew-core/src/index.test.ts -t "telemetry mutation boundary"`

Expected before implementation/fixture alignment: FAIL if current rebuild behavior does not match the contract.

- [ ] **Step 5: Make the minimal core changes if needed**

Likely no implementation change is needed unless `rebuildIndex()` overwrites usage unexpectedly or persists request-like warnings. Preserve:

- SQLite as derived local state.
- Filesystem bundle manifests as canonical.
- Registry rebuild warnings as the only persisted warning class.

- [ ] **Step 6: Run the core test again**

Run: `corepack pnpm vitest run packages/clew-core/src/index.test.ts -t "telemetry mutation boundary"`

Expected: PASS.

- [ ] **Step 7: Commit core contract test and any implementation fix**

```bash
git add packages/clew-core/src/index.test.ts packages/clew-core/src/index.ts
git commit -m "test: pin sqlite telemetry mutation boundary"
```

---

### Task 5: Cross-Link Contracts

**Files:**
- Modify: `docs/telemetry-intelligence-contract.md`
- Modify: `docs/public-envelope-contract.md`
- Optional Modify: `docs/warning-contract.md`

- [ ] **Step 1: Link from telemetry intelligence**

Append a short paragraph to `docs/telemetry-intelligence-contract.md`:

```markdown
Telemetry mutation boundaries are pinned separately in `docs/telemetry-mutation-boundary-contract.md`: read and analysis surfaces report telemetry state without recording usage, enable/disable mutate only derived SQLite state, and request-time warnings are not persisted.
```

- [ ] **Step 2: Link from public envelopes**

Append a short paragraph to `docs/public-envelope-contract.md`:

```markdown
Envelope shape is independent from telemetry mutation. Default and opt-in read envelopes may include warnings and analysis, but only plain `clew-cli recommend <query>` records included recommendation usage; request-time warnings remain envelope-local.
```

- [ ] **Step 3: Run targeted doc check**

Run: `rg -n "telemetry-mutation-boundary|Telemetry Mutation Boundary" docs`

Expected: the new doc and cross-links are listed.

- [ ] **Step 4: Commit cross-links**

```bash
git add docs/telemetry-intelligence-contract.md docs/public-envelope-contract.md docs/warning-contract.md
git commit -m "docs: link telemetry mutation boundary contracts"
```

---

### Task 6: Full Verification

**Files:**
- No new edits unless verification reveals failures.

- [ ] **Step 1: Run targeted CLI tests**

Run: `corepack pnpm vitest run packages/clew-cli/src/index.test.ts`

Expected: PASS.

- [ ] **Step 2: Run targeted core tests**

Run: `corepack pnpm vitest run packages/clew-core/src/index.test.ts`

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `corepack pnpm test`

Expected: PASS.

- [ ] **Step 4: Run workspace checks**

Run: `corepack pnpm check`

Expected: PASS.

- [ ] **Step 5: Review git diff**

Run: `git diff --stat main...HEAD`

Expected: only telemetry mutation boundary docs, fixture, and focused tests/implementation changes appear.

- [ ] **Step 6: Final commit if verification required fixes**

```bash
git add <changed-files>
git commit -m "test: harden telemetry mutation boundary contract"
```

---

## Review Notes

- Do not add workflow execution, autonomous activation, prompt package management, provider-specific telemetry behavior, embeddings, daemon behavior, or SQLite-as-canonical semantics.
- Keep warning placement unchanged:
  - Registry rebuild warnings: top-level persisted rebuild diagnostics.
  - Request warnings: top-level request envelope only.
  - Activation warnings: recommendation-scoped.
- Keep recommendation usage conservative: record only returned included recommendations from plain `clew-cli recommend <query>`.
- Preserve local-first rebuildability: deleting `.clew-registry.db` must remove telemetry-derived local state without changing filesystem bundles.
