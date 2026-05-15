import { describe, expect, it } from "vitest";
import { SkillRegistry } from "@clew/core";
import { createClewMcpBridge } from "./index.js";

describe("@clew/mcp", () => {
  it("delegates read-oriented lookup without workflow execution tools", () => {
    const bridge = createClewMcpBridge(
      new SkillRegistry({
        entries: [
          {
            bundle: {
              manifest: {
                id: "engineering-core",
                version: "1.0.0",
                kind: "instruction_skill",
                name: "Engineering Core",
                instructions: { file: "skill.md" },
                tags: ["engineering"],
                capabilities: { required: [], optional: [] },
                compatibility: { providers: [], warnings: [] },
                preferences: {},
                activation: { triggers: ["build"], tags: [], weight: 1 },
                extends: [],
                policies: [],
                provenance: {},
                extensions: {},
              },
              instructions: "Build contracts first.",
              assets: [],
              examples: [],
              templates: [],
              tests: [],
            },
            layer: "project",
            root: "skills",
            disabled: false,
            favorite: false,
          },
        ],
        warnings: [],
      }),
    );

    expect(Object.keys(bridge).sort()).toEqual(["explain", "lookup", "recommend", "search"]);
    expect(bridge.search("engineering")).toHaveLength(1);
  });
});
