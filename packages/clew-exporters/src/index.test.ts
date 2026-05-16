import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportClaudeSkill, exportOpenCodeSkill } from "./index.js";
import { compatibilityWarningSchema, type SkillBundle } from "@clew/schema";

const bundle: SkillBundle = {
  manifest: {
    id: "refactor-safely",
    version: "1.0.0",
    kind: "instruction_skill",
    name: "Refactor Safely",
    instructions: { file: "skill.md" },
    tags: [],
    capabilities: { required: ["filesystem"], optional: [] },
    compatibility: { providers: ["claude"], warnings: [] },
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

function canonicalFixture(): SkillBundle {
  return JSON.parse(readFileSync(join(fixtureRoot, "canonical-roundtrip.json"), "utf8")) as SkillBundle;
}

describe("@clew/exporters", () => {
  it("exports Claude artifacts with explicit compatibility warnings", () => {
    const result = exportClaudeSkill(bundle);
    expect(result.artifacts[0]?.contents).toContain("/refactor-safely");
    expect(result.warnings.map((warning) => warning.code)).toContain("composition_degraded");
  });

  it("warns on undeclared provider compatibility", () => {
    const result = exportOpenCodeSkill(bundle);
    expect(result.warnings.map((warning) => warning.code)).toContain("target_provider_not_declared");
  });

  it("exports canonical fixtures deterministically with compatibility reports", () => {
    const first = exportClaudeSkill(canonicalFixture());
    const second = exportClaudeSkill(canonicalFixture());

    expect(first).toEqual(second);
    expect(first.artifacts).toEqual([
      {
        path: "interop-core/SKILL.md",
        contents: [
          "# Interop Core",
          "",
          "Preserve operational meaning across providers.",
          "Slash command: /interop-core",
          "",
          "Preserve intent and report degradation.",
        ].join("\n"),
      },
    ]);
    expect(first.warnings.map((warning) => warning.code)).toEqual([
      "composition_degraded",
      "capability_semantics_degraded",
    ]);
    expect(first.warnings.map((warning) => warning.origin)).toEqual(["provider_export", "provider_export"]);
    expect(first.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(first.warnings);
  });

  it("exports OpenCode fixtures with provider mode and stable warnings", () => {
    const result = exportOpenCodeSkill(canonicalFixture());

    expect(result.artifacts[0]).toEqual({
      path: "interop-core.md",
      contents: [
        "---",
        "name: Interop Core",
        "description: Preserve operational meaning across providers.",
        "mode: safe",
        "---",
        "",
        "Preserve intent and report degradation.",
      ].join("\n"),
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "composition_degraded",
      "capability_semantics_degraded",
    ]);
    expect(result.warnings.map((warning) => warning.origin)).toEqual(["provider_export", "provider_export"]);
  });
});
