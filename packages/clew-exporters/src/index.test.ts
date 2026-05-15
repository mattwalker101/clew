import { describe, expect, it } from "vitest";
import { exportClaudeSkill, exportOpenCodeSkill } from "./index.js";
import type { SkillBundle } from "@clew/schema";

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
});
