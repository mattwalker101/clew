import { describe, expect, it } from "vitest";
import { SkillRegistry, type RegistryEntry } from "@clew/core";
import { createClewMcpBridge } from "./index.js";

describe("@clew/mcp", () => {
  it("exposes only read-oriented bridge methods", () => {
    const bridge = createClewMcpBridge(registryWith(entry("engineering-core")));

    expect(Object.keys(bridge).sort()).toEqual(["explain", "lookup", "recommend", "search"]);
    expect("execute" in bridge).toBe(false);
    expect("activate" in bridge).toBe(false);
    expect("run" in bridge).toBe(false);
    expect("tools" in bridge).toBe(false);
  });

  it("returns structured envelopes for legacy positional calls", () => {
    const bridge = createClewMcpBridge(registryWith(entry("engineering-core")));

    expect(bridge.search("engineering")).toMatchObject({
      query: "engineering",
      skills: [{ id: "engineering-core" }],
      warnings: [],
    });
    expect(bridge.recommend("build")).toMatchObject({
      query: "build",
      recommendations: [{ skillId: "engineering-core" }],
      warnings: [],
    });
    expect(bridge.explain("engineering-core", "build")).toMatchObject({
      skillId: "engineering-core",
      query: "build",
      recommendation: { skillId: "engineering-core" },
      warnings: [],
    });
    expect(bridge.lookup("engineering-core")).toMatchObject({
      skillId: "engineering-core",
      bundle: { manifest: { id: "engineering-core" } },
      warnings: [],
    });
  });

  it("supports object inputs and limits result sets", () => {
    const bridge = createClewMcpBridge(
      registryWith(
        entry("engineering-core", { triggers: ["build"], weight: 1 }),
        entry("typescript-core", { triggers: ["build"], tags: ["typescript"], weight: 2 }),
      ),
    );

    expect(bridge.search({ query: "core", limit: 1 }).skills.map((skill) => skill.id)).toEqual(["engineering-core"]);
    expect(bridge.recommend({ query: "build", limit: 1 }).recommendations.map((item) => item.skillId)).toEqual([
      "typescript-core",
    ]);
    expect(bridge.explain({ skillId: "typescript-core", query: "build" })).toMatchObject({
      skillId: "typescript-core",
      query: "build",
      recommendation: { skillId: "typescript-core" },
      warnings: [],
    });
    expect(bridge.lookup({ skillId: "typescript-core" })).toMatchObject({
      skillId: "typescript-core",
      bundle: { manifest: { id: "typescript-core" } },
      warnings: [],
    });
  });

  it("threads activation context through recommend and explain", () => {
    const bridge = createClewMcpBridge(
      registryWith(
        entry("typescript-core", {
          triggers: ["compile"],
          tags: ["typescript"],
          requiredCapabilities: ["terminal"],
        }),
        entry("safe-editing", { triggers: ["patch"] }),
      ),
    );

    expect(
      bridge.recommend({
        query: "",
        context: { tags: ["typescript"], capabilities: ["terminal"] },
      }),
    ).toMatchObject({
      query: "",
      recommendations: [{ skillId: "typescript-core", warnings: [] }],
      warnings: [],
    });
    expect(
      bridge.explain({
        skillId: "safe-editing",
        query: "",
        context: { activeSkillIds: ["safe-editing"] },
      }),
    ).toMatchObject({
      skillId: "safe-editing",
      query: "",
      recommendation: {
        skillId: "safe-editing",
        signals: ["agents-md"],
      },
      warnings: [],
    });
  });

  it("returns null plus explicit warnings for missing, disabled, or unrecommended skills", () => {
    const bridge = createClewMcpBridge(
      registryWith(
        entry("disabled-skill", { disabled: true }),
        entry("available-skill", { triggers: ["available"] }),
      ),
    );

    expect(bridge.lookup("missing-skill")).toMatchObject({
      skillId: "missing-skill",
      bundle: null,
      warnings: [{ code: "skill_unknown" }],
    });
    expect(bridge.lookup("disabled-skill")).toMatchObject({
      skillId: "disabled-skill",
      bundle: null,
      warnings: [{ code: "skill_disabled" }],
    });
    expect(bridge.explain("available-skill", "no match")).toMatchObject({
      skillId: "available-skill",
      query: "no match",
      recommendation: null,
      warnings: [{ code: "skill_not_recommended" }],
    });
  });
});

function registryWith(...entries: RegistryEntry[]): SkillRegistry {
  return new SkillRegistry({ entries, warnings: [] });
}

function entry(
  id: string,
  options: {
    disabled?: boolean;
    tags?: string[];
    triggers?: string[];
    weight?: number;
    requiredCapabilities?: Array<"filesystem" | "terminal" | "internet" | "git" | "mcp">;
  } = {},
): RegistryEntry {
  return {
    bundle: {
      manifest: {
        id,
        version: "1.0.0",
        kind: "instruction_skill",
        name: titleize(id),
        instructions: { file: "skill.md" },
        tags: options.tags ?? [id],
        capabilities: { required: options.requiredCapabilities ?? [], optional: [] },
        compatibility: { providers: [], warnings: [] },
        preferences: {},
        activation: { triggers: options.triggers ?? ["build"], tags: [], weight: options.weight ?? 1 },
        extends: [],
        policies: [],
        provenance: {},
        extensions: {},
      },
      instructions: `${id} instructions.`,
      assets: [],
      examples: [],
      templates: [],
      tests: [],
    },
    layer: "project",
    root: "skills",
    disabled: options.disabled ?? false,
    favorite: false,
  };
}

function titleize(id: string): string {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
