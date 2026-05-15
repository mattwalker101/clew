import { describe, expect, it } from "vitest";
import { skillManifestSchema, validateSkillBundle } from "./index.js";

const manifest = {
  id: "safe-refactor",
  version: "1.0.0",
  kind: "instruction_skill",
  name: "Safe Refactor",
  instructions: { file: "skill.md" },
};

describe("@clew/schema", () => {
  it("validates a canonical instruction skill bundle", () => {
    const result = validateSkillBundle({ manifest, instructions: "Refactor safely." });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.manifest.capabilities.required).toEqual([]);
      expect(result.bundle.manifest.extensions).toEqual({});
    }
  });

  it("rejects future workflow kinds in v0.1", () => {
    expect(() => skillManifestSchema.parse({ ...manifest, kind: "workflow_skill" })).toThrow();
  });

  it("rejects invalid capabilities", () => {
    expect(() =>
      skillManifestSchema.parse({
        ...manifest,
        capabilities: { required: ["filesystem", "docker"] },
      }),
    ).toThrow();
  });

  it("rejects non-provider extension namespace shapes", () => {
    expect(() =>
      skillManifestSchema.parse({
        ...manifest,
        extensions: { "Bad Namespace": {} },
      }),
    ).toThrow();
  });
});
