import { describe, expect, it } from "vitest";
import { importClaudeSkill, importOpenCodeSkill } from "./index.js";

describe("@clew/importers", () => {
  it("imports Claude skills while preserving degraded provider fields", () => {
    const result = importClaudeSkill({
      id: "safe-refactor",
      name: "Safe Refactor",
      instructions: "Refactor safely.",
      allowed_tools: ["Bash", "Read"],
      slash_command: "/safe-refactor",
      custom_field: true,
    });

    expect(result.bundles[0]?.manifest.extensions.claude).toMatchObject({ custom_field: true });
    expect(result.warnings.map((warning) => warning.code)).toContain("tool_semantics_degraded");
    expect(result.warnings.map((warning) => warning.code)).toContain("provider_metadata_preserved");
  });

  it("imports OpenCode agent metadata under extensions.opencode", () => {
    const result = importOpenCodeSkill({ name: "Safe Mode", content: "Stay safe.", mode: "safe" });
    expect(result.bundles[0]?.manifest.extensions.opencode).toMatchObject({ agent_mode: "safe" });
  });
});
