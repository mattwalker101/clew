# CLI Registry Warning Public Envelope Placement — Design

## Problem

`public-envelope-contract.json` pins empty `warnings` arrays for all CLI read surfaces in the happy path. A separate standalone test proves `clew list` emits `skill_bundle_invalid` for an invalid filesystem bundle, but no documented fixture pins that warning's `code` and `origin` across every CLI read surface. Consumers have no contractual reference for how registry rebuild warnings propagate through `search`, `recommend`, `lookup`, `explain`, `overlaps`, `conflicts`, `telemetry`, or `doctor`.

## Goal

Extend the documented CLI public-envelope fixture to cover the degraded-registry scenario. Pin `skill_bundle_invalid` warning codes and origins across all CLI read surfaces when an invalid filesystem bundle exists at discovery time.

## Non-goals

- No runtime behavior changes.
- No new test files or fixture files.
- No changes to the existing happy-path or disabled-skill fixture assertions.
- No merging of `registryWarnings` and `agentsDiagnostics` in `doctor`.
- No surfacing of AGENTS.md diagnostics in `telemetry` warnings.

## Design

### Approach

Option 2 (new parallel section). Keep existing `cli.warnings` happy-path block unchanged. Add two new keys to `public-envelope-contract.json`:

- `cli.invalidBundleWarnings` — codes + origins per read surface
- `cli.invalidBundleDoctor` — registry/agents/combined codes + origins for `doctor`

Extend the existing `matches the documented CLI public envelope contract fixture` test with a third block that re-enables `typescript-core`, injects `writeInvalidFutureKindBundle`, clears the spy, re-runs all read surfaces, and asserts against the new fixture keys.

### Fixture additions

**`cli.invalidBundleWarnings`**

```json
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
}
```

**`cli.invalidBundleDoctor`**

AGENTS.md still holds `- missing-skill` from fixture setup, so `agents_skill_unknown` remains. Doctor splits into three arrays:

```json
"invalidBundleDoctor": {
  "registryWarningCodes":   ["skill_bundle_invalid"],
  "registryWarningOrigins": ["registry_rebuild"],
  "agentsDiagnosticCodes":  ["agents_skill_unknown"],
  "warningCodes":           ["skill_bundle_invalid", "agents_skill_unknown"],
  "warningOrigins":         ["registry_rebuild", "agents_diagnostic"]
}
```

### Test extension (index.test.ts)

Add after the existing disable/enable block inside `matches the documented CLI public envelope contract fixture`:

```typescript
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

// cast outputs, extract codes+origins, assert against
// fixture.cli.invalidBundleWarnings and fixture.cli.invalidBundleDoctor
```

Each surface: extract `warnings.map(w => w.code)` and `warnings.map(w => w.origin)`. Doctor: extract `registryWarnings`, `agentsDiagnostics`, and combined `warnings` separately.

## Warning contract alignment

`skill_bundle_invalid` with `origin: "registry_rebuild"` and `severity: "error"` is specified in `docs/filesystem-discovery-contract.md` and pinned in `tests/fixtures/contracts/warning-contract.json`. This design pins the same warning's placement in CLI read envelopes, consistent with MCP `topLevelWarningCodes` already in the fixture.

## Files changed

| File | Change |
|------|--------|
| `tests/fixtures/contracts/public-envelope-contract.json` | Add `cli.invalidBundleWarnings` and `cli.invalidBundleDoctor` |
| `packages/clew-cli/src/index.test.ts` | Extend fixture test with invalid-bundle block |

## Verification

- `corepack pnpm --filter @clew/cli test` green
- `corepack pnpm test` green
- `corepack pnpm check` clean
