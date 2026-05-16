import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compatibilityWarningSchema,
  formatValidationIssue,
  parseSkillBundle,
  SkillBundleValidationError,
  skillManifestSchema,
  validateSkillBundle,
} from "./index.js";

const manifest = {
  id: "safe-refactor",
  version: "1.0.0",
  kind: "instruction_skill",
  name: "Safe Refactor",
  instructions: { file: "skill.md" },
};

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesRoot, name), "utf8")) as unknown;
}

describe("@clew/schema", () => {
  it("validates a canonical instruction skill bundle", () => {
    const result = validateSkillBundle({ manifest, instructions: "Refactor safely." });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.manifest.capabilities.required).toEqual([]);
      expect(result.bundle.manifest.extensions).toEqual({});
    }
  });

  it("defaults optional bundle and manifest fields deterministically", () => {
    const bundle = parseSkillBundle(fixture("minimal-valid.json"));

    expect(bundle).toMatchObject({
      manifest: {
        tags: [],
        capabilities: { required: [], optional: [] },
        compatibility: { providers: [], warnings: [] },
        preferences: {},
        activation: { triggers: [], tags: [], weight: 1 },
        extends: [],
        policies: [],
        provenance: {},
        extensions: {},
      },
      assets: [],
      examples: [],
      templates: [],
      tests: [],
    });
  });

  it("preserves complete canonical bundle fields", () => {
    const bundle = parseSkillBundle(fixture("complete-valid.json"));

    expect(bundle.manifest.capabilities).toEqual({ required: ["filesystem"], optional: ["terminal", "git"] });
    expect(bundle.manifest.compatibility.warnings).toEqual([
      {
        code: "tool_semantics_degraded",
        provider: "claude",
        field: "allowed_tools",
        message: "Provider tool allow-list preserved as metadata.",
        severity: "warning",
      },
    ]);
    expect(bundle.manifest.extensions).toMatchObject({
      claude: { slash_command: "/interop-core" },
      opencode: { agent_mode: "safe" },
    });
    expect(bundle.assets).toEqual(["assets/example.txt"]);
  });

  it("returns structured validation issues for invalid bundles", () => {
    const result = validateSkillBundle(fixture("bad-manifest.json"));

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: "manifest.id",
          code: "too_small",
          message: "String must contain at least 1 character(s)",
        },
      ],
      warnings: [],
    });
    if (!result.ok) {
      expect(formatValidationIssue(result.errors[0]!)).toBe(
        "manifest.id [too_small]: String must contain at least 1 character(s)",
      );
    }
  });

  it("throws formatted validation issues when parsing invalid bundles", () => {
    expect(() => parseSkillBundle(fixture("future-kind.json"))).toThrow(SkillBundleValidationError);
    expect(() => parseSkillBundle(fixture("future-kind.json"))).toThrow(
      "manifest.kind [invalid_enum_value]: Invalid enum value. Expected 'instruction_skill', received 'workflow_skill'",
    );
  });

  it("rejects future workflow kinds in v0.1", () => {
    expect(() => skillManifestSchema.parse({ ...manifest, kind: "workflow_skill" })).toThrow();
    const result = validateSkillBundle(fixture("future-kind.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "manifest.kind", code: "invalid_enum_value" }),
      );
    }
  });

  it("rejects invalid capabilities", () => {
    expect(() =>
      skillManifestSchema.parse({
        ...manifest,
        capabilities: { required: ["filesystem", "docker"] },
      }),
    ).toThrow();
    const result = validateSkillBundle(fixture("invalid-capability.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "manifest.capabilities.required.1", code: "invalid_enum_value" }),
      );
    }
  });

  it("rejects non-provider extension namespace shapes", () => {
    expect(() =>
      skillManifestSchema.parse({
        ...manifest,
        extensions: { "Bad Namespace": {} },
      }),
    ).toThrow();
    const result = validateSkillBundle(fixture("malformed-extension.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "manifest.extensions.Bad Namespace" }));
    }
  });

  it("rejects empty instruction contents", () => {
    const result = validateSkillBundle(fixture("empty-instructions.json"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "instructions", code: "too_small" }));
    }
  });

  it("keeps compatibility warning envelopes stable", () => {
    expect(compatibilityWarningSchema.parse({ code: "compat", message: "Degraded." })).toEqual({
      code: "compat",
      message: "Degraded.",
      severity: "warning",
    });
    expect(
      compatibilityWarningSchema.parse({
        code: "provider_metadata_preserved",
        provider: "claude",
        field: "metadata",
        origin: "provider_import",
        message: "Preserved.",
        severity: "info",
      }),
    ).toEqual({
      code: "provider_metadata_preserved",
      provider: "claude",
      field: "metadata",
      origin: "provider_import",
      message: "Preserved.",
      severity: "info",
    });
  });

  it("accepts supported optional warning origins and rejects unknown origins", () => {
    const origins = [
      "registry_rebuild",
      "request",
      "agents_diagnostic",
      "activation",
      "provider_import",
      "provider_export",
    ] as const;

    for (const origin of origins) {
      expect(compatibilityWarningSchema.parse({ code: "compat", message: "Degraded.", origin })).toMatchObject({
        origin,
      });
    }
    expect(compatibilityWarningSchema.parse({ code: "compat", message: "Degraded." })).not.toHaveProperty("origin");
    expect(() =>
      compatibilityWarningSchema.parse({ code: "compat", message: "Degraded.", origin: "workflow_runtime" }),
    ).toThrow();
  });
});
