# Phase 1 Schema Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen Phase 1 schema-level provenance validation and add a combined provider interop contract covering warnings, artifacts, and provenance.

**Architecture:** Keep `@clew-ops/schema` as the canonical contract boundary. Provider-specific behavior stays in `manifest.extensions.<provider>` and provider result envelopes remain plain `warnings`, `artifacts`, and `provenance` arrays/objects. Importers and exporters only consume these contracts; they do not introduce provider-specific wrapper envelopes.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspace packages.

---

## File Structure

- Modify: `packages/clew-schema/src/index.ts`
  - Add stricter provenance refinements while preserving the existing public `provenanceSchema` type.
  - Export provider namespace helpers only if tests need them; prefer private helpers unless external packages already need them.
- Modify: `packages/clew-schema/src/index.test.ts`
  - Add failing schema tests for invalid provenance and provider-specific extension namespace placement.
- Create: `packages/clew-schema/fixtures/invalid-provenance-imported-via.json`
  - Invalid canonical bundle where `provenance.imported_via.importer` is set but `provenance.source` is missing.
- Create: `packages/clew-schema/fixtures/invalid-provenance-provider-extension.json`
  - Invalid canonical bundle where a provider source is present but provider metadata is stored outside the matching `extensions.<provider>` namespace.
- Create: `tests/fixtures/contracts/provider-roundtrip-contract.json`
  - Combined executable fixture pinning import provenance, import warnings, exported artifacts, and export warnings in one shape.
- Modify: `packages/clew-importers/src/index.test.ts`
  - Assert imported degraded provider output matches the combined round-trip contract.
- Modify: `packages/clew-exporters/src/index.test.ts`
  - Assert exported canonical output matches the combined round-trip contract.
- Modify: `docs/warning-contract.md`
  - Document the combined fixture as an interop contract, not a new envelope shape.

---

### Task 1: Strengthen Provenance Schema Validation

**Files:**
- Modify: `packages/clew-schema/src/index.ts`
- Modify: `packages/clew-schema/src/index.test.ts`
- Create: `packages/clew-schema/fixtures/invalid-provenance-imported-via.json`
- Create: `packages/clew-schema/fixtures/invalid-provenance-provider-extension.json`

- [ ] **Step 1: Write invalid provenance fixtures**

Create `packages/clew-schema/fixtures/invalid-provenance-imported-via.json`:

```json
{
  "manifest": {
    "id": "missing-source-provenance",
    "version": "1.0.0",
    "kind": "instruction_skill",
    "name": "Missing Source Provenance",
    "instructions": { "file": "skill.md" },
    "provenance": {
      "imported_via": {
        "importer": "claude",
        "imported_at": "2026-05-16T00:00:00.000Z"
      }
    },
    "extensions": {
      "claude": {
        "slash_command": "/missing-source-provenance"
      }
    }
  },
  "instructions": "Keep provenance explainable."
}
```

Create `packages/clew-schema/fixtures/invalid-provenance-provider-extension.json`:

```json
{
  "manifest": {
    "id": "misplaced-provider-metadata",
    "version": "1.0.0",
    "kind": "instruction_skill",
    "name": "Misplaced Provider Metadata",
    "instructions": { "file": "skill.md" },
    "provenance": {
      "source": {
        "type": "claude",
        "location": "claude:misplaced-provider-metadata",
        "original_id": "misplaced-provider-metadata"
      },
      "imported_via": {
        "importer": "claude",
        "imported_at": "2026-05-16T00:00:00.000Z"
      }
    },
    "extensions": {
      "local": {
        "claude": {
          "slash_command": "/misplaced-provider-metadata"
        }
      }
    }
  },
  "instructions": "Provider metadata must live in the explicit provider namespace."
}
```

- [ ] **Step 2: Add failing schema tests**

Add these imports in `packages/clew-schema/src/index.test.ts`:

```ts
import {
  compatibilityWarningSchema,
  formatValidationIssue,
  parseSkillBundle,
  provenanceSchema,
  SkillBundleValidationError,
  skillManifestSchema,
  validateSkillBundle,
} from "./index.js";
```

Add tests inside `describe("@clew-ops/schema", () => { ... })`:

```ts
  it("requires imported provenance to include a source", () => {
    const result = validateSkillBundle(fixture("invalid-provenance-imported-via.json"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "manifest.provenance.source",
          code: "custom",
          message: "Imported provenance must include source metadata.",
        }),
      );
    }
  });

  it("keeps provider metadata under the explicit provider extension namespace", () => {
    const result = validateSkillBundle(fixture("invalid-provenance-provider-extension.json"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "manifest.extensions.claude",
          code: "custom",
          message: "Provider source metadata for claude must be preserved under extensions.claude.",
        }),
      );
    }
  });

  it("accepts complete provider provenance with matching extension namespace", () => {
    expect(
      provenanceSchema.parse({
        source: {
          type: "claude",
          location: "claude:safe-refactor",
          original_id: "safe-refactor",
        },
        imported_via: {
          importer: "claude",
          imported_at: "2026-05-16T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      source: { type: "claude" },
      imported_via: { importer: "claude" },
    });

    const result = validateSkillBundle({
      manifest: {
        ...manifest,
        provenance: {
          source: {
            type: "claude",
            location: "claude:safe-refactor",
            original_id: "safe-refactor",
          },
          imported_via: {
            importer: "claude",
            imported_at: "2026-05-16T00:00:00.000Z",
          },
        },
        extensions: {
          claude: { slash_command: "/safe-refactor" },
        },
      },
      instructions: "Refactor safely.",
    });

    expect(result.ok).toBe(true);
  });
```

- [ ] **Step 3: Run schema tests to verify failure**

Run:

```bash
corepack pnpm --filter @clew-ops/schema test
```

Expected: FAIL. The first failure should show the missing `provenanceSchema` export or missing custom validation issues, depending on the order of edits.

- [ ] **Step 4: Implement minimal provenance refinements**

In `packages/clew-schema/src/index.ts`, replace `provenanceSchema` and `skillManifestSchema` with this structure. Keep existing exported names unchanged:

```ts
const providerSourceTypes = ["claude", "opencode", "local"] as const;

function isProviderSourceType(type: string): type is (typeof providerSourceTypes)[number] {
  return providerSourceTypes.includes(type as (typeof providerSourceTypes)[number]);
}

export const provenanceSchema = z
  .object({
    source: z
      .object({
        type: z.enum(["filesystem", "github", "claude", "opencode", "local", "unknown"]),
        location: z.string().min(1),
        original_id: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
    imported_via: z
      .object({
        importer: z.string().min(1),
        imported_at: z.string().datetime().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.imported_via && !value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Imported provenance must include source metadata.",
        path: ["source"],
      });
    }
  })
  .default({});
```

Then update `skillManifestSchema` to add a manifest-level refinement after the object definition:

```ts
export const skillManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    kind: skillKindSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    instructions: instructionsSchema,
    tags: stringArraySchema,
    capabilities: capabilitySetSchema,
    compatibility: compatibilitySchema,
    preferences: preferencesSchema,
    activation: activationSchema,
    extends: stringArraySchema,
    policies: stringArraySchema,
    provenance: provenanceSchema,
    extensions: extensionNamespacesSchema,
  })
  .superRefine((value, ctx) => {
    const sourceType = value.provenance.source?.type;
    if (sourceType && isProviderSourceType(sourceType) && value.extensions[sourceType] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provider source metadata for ${sourceType} must be preserved under extensions.${sourceType}.`,
        path: ["extensions", sourceType],
      });
    }
  });
```

- [ ] **Step 5: Run schema tests to verify pass**

Run:

```bash
corepack pnpm --filter @clew-ops/schema test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/clew-schema/src/index.ts packages/clew-schema/src/index.test.ts packages/clew-schema/fixtures/invalid-provenance-imported-via.json packages/clew-schema/fixtures/invalid-provenance-provider-extension.json
git commit -m "test: harden provenance schema contracts"
```

---

### Task 2: Add Combined Provider Round-Trip Contract

**Files:**
- Create: `tests/fixtures/contracts/provider-roundtrip-contract.json`
- Modify: `packages/clew-importers/src/index.test.ts`
- Modify: `packages/clew-exporters/src/index.test.ts`

- [ ] **Step 1: Create combined contract fixture**

Create `tests/fixtures/contracts/provider-roundtrip-contract.json`:

```json
{
  "description": "Combined provider interop contract. This fixture pins warnings, provenance, and artifacts without introducing provider-specific wrapper envelopes.",
  "imports": {
    "claudeDegraded": {
      "provenance": {
        "source": {
          "type": "claude",
          "location": "claude:safe-refactor",
          "original_id": "safe-refactor"
        },
        "imported_via": {
          "importer": "claude",
          "imported_at": "2026-05-16T00:00:00.000Z"
        }
      },
      "warnings": [
        {
          "code": "tool_semantics_degraded",
          "provider": "claude",
          "field": "allowed_tools",
          "origin": "provider_import",
          "message": "Claude allowed_tools cannot be represented as canonical runtime permissions; preserved under extensions.claude.",
          "severity": "warning"
        },
        {
          "code": "provider_metadata_preserved",
          "provider": "claude",
          "field": "metadata",
          "origin": "provider_import",
          "message": "Unrecognized Claude metadata preserved under extensions.claude.",
          "severity": "info"
        }
      ]
    }
  },
  "exports": {
    "claudeCanonical": {
      "artifacts": [
        {
          "path": ".claude/skills/interop-core/SKILL.md",
          "contents": "# Interop Core\n\nPreserve intent and report degradation.\n\nSlash command: /interop-core\n"
        }
      ],
      "warnings": [
        {
          "code": "composition_degraded",
          "provider": "claude",
          "field": "extends",
          "origin": "provider_export",
          "message": "Skill inheritance is documented but not executable in Claude skill output.",
          "severity": "warning"
        },
        {
          "code": "capability_semantics_degraded",
          "provider": "claude",
          "field": "capabilities",
          "origin": "provider_export",
          "message": "Canonical capability requirements are documented but not enforced by Claude skill output.",
          "severity": "warning"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Add failing importer contract assertion**

In `packages/clew-importers/src/index.test.ts`, add:

```ts
type ProviderRoundTripContract = {
  imports: {
    claudeDegraded: {
      provenance: ImportResult["provenance"];
      warnings: CompatibilityWarning[];
    };
  };
};

function providerRoundTripContract(): ProviderRoundTripContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-roundtrip-contract.json"), "utf8"),
  ) as ProviderRoundTripContract;
}
```

Add this test inside `describe("@clew-ops/importers", () => { ... })`:

```ts
  it("matches the combined provider round-trip contract on import", () => {
    const result = importClaudeSkill(fixture("claude-degraded.json"));
    const contract = providerRoundTripContract();

    expect(result).toMatchObject({
      provider: "claude",
      provenance: contract.imports.claudeDegraded.provenance,
      warnings: contract.imports.claudeDegraded.warnings,
    });
    expect(result.bundles[0]?.manifest.provenance).toEqual(contract.imports.claudeDegraded.provenance);
    expect(result.bundles[0]?.manifest.extensions.claude).toBeDefined();
  });
```

- [ ] **Step 3: Run importer tests to verify failure or pass**

Run:

```bash
corepack pnpm --filter @clew-ops/importers test
```

Expected: PASS if the combined fixture exactly mirrors existing contracts; otherwise FAIL with a precise diff. If it fails, update only `provider-roundtrip-contract.json` to match existing behavior unless the diff reveals a real schema-contract violation.

- [ ] **Step 4: Add failing exporter contract assertion**

In `packages/clew-exporters/src/index.test.ts`, add:

```ts
type ProviderRoundTripContract = {
  exports: {
    claudeCanonical: {
      artifacts: ExportResult["artifacts"];
      warnings: CompatibilityWarning[];
    };
  };
};

function providerRoundTripContract(): ProviderRoundTripContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-roundtrip-contract.json"), "utf8"),
  ) as ProviderRoundTripContract;
}
```

Add this test inside `describe("@clew-ops/exporters", () => { ... })`:

```ts
  it("matches the combined provider round-trip contract on export", () => {
    const result = exportClaudeSkill(canonicalFixture());
    const contract = providerRoundTripContract();

    expect(result).toEqual({
      provider: "claude",
      artifacts: contract.exports.claudeCanonical.artifacts,
      warnings: contract.exports.claudeCanonical.warnings,
    });
    expect(result.artifacts).toEqual(contract.exports.claudeCanonical.artifacts);
    expect(result.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(result.warnings);
  });
```

- [ ] **Step 5: Run exporter tests to verify failure or pass**

Run:

```bash
corepack pnpm --filter @clew-ops/exporters test
```

Expected: PASS if the combined fixture exactly mirrors existing contracts; otherwise FAIL with a precise diff. If it fails, update only `provider-roundtrip-contract.json` to match existing behavior unless the diff reveals a real schema-contract violation.

- [ ] **Step 6: Commit Task 2**

```bash
git add tests/fixtures/contracts/provider-roundtrip-contract.json packages/clew-importers/src/index.test.ts packages/clew-exporters/src/index.test.ts
git commit -m "test: add provider round-trip interop contract"
```

---

### Task 3: Document the Hardened Contract

**Files:**
- Modify: `docs/warning-contract.md`

- [ ] **Step 1: Update contract documentation**

Append this section to `docs/warning-contract.md`:

```md

## Combined Provider Round-Trip Contract

The combined provider round-trip fixture at `tests/fixtures/contracts/provider-roundtrip-contract.json` pins the interop surface across import and export in one executable contract:

- importer `warnings`
- importer `provenance`
- imported bundle `manifest.provenance`
- exporter `artifacts`
- exporter `warnings`

This fixture does not introduce a new runtime envelope. Import results must remain plain `ImportResult` objects, and export results must remain plain `ExportResult` objects. Provider-specific metadata belongs under `manifest.extensions.<provider>`, while cross-provider provenance belongs under `manifest.provenance` and import result `provenance`.
```

- [ ] **Step 2: Run documentation-adjacent contract tests**

Run:

```bash
corepack pnpm --filter @clew-ops/schema test
corepack pnpm --filter @clew-ops/importers test
corepack pnpm --filter @clew-ops/exporters test
```

Expected: PASS.

- [ ] **Step 3: Commit Task 3**

```bash
git add docs/warning-contract.md
git commit -m "docs: document provider round-trip contract"
```

---

### Task 4: Final Verification

**Files:**
- No new edits expected.

- [ ] **Step 1: Run full test suite**

```bash
corepack pnpm -r test
corepack pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run type and build checks**

```bash
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 3: Run whitespace check**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Inspect final diff**

```bash
git status --short
git diff --stat
```

Expected: only schema tests, schema implementation, contract fixture, interop tests, and docs are changed.

---

## Self-Review

Spec coverage:

- Phase 1 schema validation is covered by stricter `provenanceSchema` and manifest-level extension namespace checks.
- Invalid bundle coverage is extended with two explicit provenance failures.
- Extension namespace rules are strengthened without adding provider-specific behavior to core runtime code.
- Import/export interop is covered by a combined fixture while preserving plain result envelopes.

Placeholder scan:

- No task uses TBD, TODO, or unspecified error handling.
- Every code-editing step includes concrete code or exact JSON content.

Type consistency:

- `ProviderRoundTripContract` uses existing `ImportResult["provenance"]`, `ExportResult["artifacts"]`, and `CompatibilityWarning` types from `@clew-ops/schema`.
- Existing exported schema names remain stable: `provenanceSchema`, `skillManifestSchema`, `validateSkillBundle`, `ImportResult`, and `ExportResult`.
