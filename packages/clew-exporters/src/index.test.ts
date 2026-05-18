import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportClaudeSkill, exportOpenCodeSkill } from "./index.js";
import { compatibilityWarningSchema, type CompatibilityWarning, type ExportResult, type SkillBundle } from "@clew/schema";

const bundle: SkillBundle = {
  manifest: {
    id: "refactor-safely",
    version: "1.0.0",
    kind: "instruction_skill",
    name: "Refactor Safely",
    instructions: { file: "skill.md" },
    tags: [],
    capabilities: { required: ["filesystem"], optional: [] },
    compatibility: { providers: ["claude"], incompatible_with: [], warnings: [] },
    preferences: {},
    activation: { triggers: ["refactor"], tags: [], weight: 1 },
    extends: ["engineering-core"],
    policies: [],
    provenance: {},
    extensions: { claude: { slash_command: "/refactor-safely" } },
  },
  instructions: "Keep behavior stable.",
  assets: [],
  examples: [],
  templates: [],
  tests: [],
};

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "interop");
const contractRoot = join(process.cwd(), "tests", "fixtures", "contracts");

type ProviderWarningContract = {
  exports: {
    claudeCanonical: { warnings: CompatibilityWarning[] };
    opencodeFromClaudeOnly: { warnings: CompatibilityWarning[] };
  };
};

type ProviderArtifactContract = {
  exports: {
    claudeCanonical: { artifacts: ExportResult["artifacts"] };
    opencodeCanonical: { artifacts: ExportResult["artifacts"] };
  };
};

type ProviderRoundTripContract = {
  exports: {
    claudeCanonical: {
      artifacts: ExportResult["artifacts"];
      warnings: CompatibilityWarning[];
    };
  };
};

function canonicalFixture(): SkillBundle {
  return JSON.parse(readFileSync(join(fixtureRoot, "canonical-roundtrip.json"), "utf8")) as SkillBundle;
}

function providerWarningContract(): ProviderWarningContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-warning-contract.json"), "utf8"),
  ) as ProviderWarningContract;
}

function providerArtifactContract(): ProviderArtifactContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-artifact-contract.json"), "utf8"),
  ) as ProviderArtifactContract;
}

function providerRoundTripContract(): ProviderRoundTripContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-roundtrip-contract.json"), "utf8"),
  ) as ProviderRoundTripContract;
}

describe("@clew/exporters", () => {
  it("exports Claude artifacts with explicit compatibility warnings", () => {
    const result = exportClaudeSkill(bundle);
    expect(result.artifacts[0]?.contents).toContain("/refactor-safely");
    expect(result.warnings.map((warning) => warning.code)).toContain("composition_degraded");
  });

  it("warns on undeclared provider compatibility", () => {
    const result = exportOpenCodeSkill(bundle);
    const contract = providerWarningContract();

    expect(result.warnings).toEqual(contract.exports.opencodeFromClaudeOnly.warnings);
    expect(result.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(result.warnings);
  });

  it("exports canonical fixtures deterministically with compatibility reports", () => {
    const first = exportClaudeSkill(canonicalFixture());
    const second = exportClaudeSkill(canonicalFixture());
    const artifactContract = providerArtifactContract();
    const warningContract = providerWarningContract();

    expect(first).toEqual(second);
    expect(first.artifacts).toEqual(artifactContract.exports.claudeCanonical.artifacts);
    expect(first.warnings).toEqual(warningContract.exports.claudeCanonical.warnings);
    expect(first.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(first.warnings);
  });

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

  it("exports OpenCode fixtures with provider mode and stable warnings", () => {
    const result = exportOpenCodeSkill(canonicalFixture());
    const artifactContract = providerArtifactContract();

    expect(result.artifacts).toEqual(artifactContract.exports.opencodeCanonical.artifacts);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "composition_degraded",
      "capability_semantics_degraded",
    ]);
    expect(result.warnings.map((warning) => warning.origin)).toEqual(["provider_export", "provider_export"]);
  });
});
