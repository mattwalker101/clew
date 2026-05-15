import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivationEngine,
  composeSkill,
  findConflicts,
  findOverlaps,
  parseAgentsMd,
  rebuildSqliteIndex,
  SkillRegistry,
} from "./index.js";
import type { SkillBundle } from "@clew/schema";

function bundle(id: string, overrides: Partial<SkillBundle["manifest"]> = {}): SkillBundle {
  return {
    manifest: {
      id,
      version: "1.0.0",
      kind: "instruction_skill",
      name: id,
      instructions: { file: "skill.md" },
      description: undefined,
      tags: [],
      capabilities: { required: [], optional: [] },
      compatibility: { providers: [], warnings: [] },
      preferences: {},
      activation: { triggers: [], tags: [], weight: 1 },
      extends: [],
      policies: [],
      provenance: {},
      extensions: {},
      ...overrides,
    },
    instructions: `${id} instructions`,
    assets: [],
    examples: [],
    templates: [],
    tests: [],
  };
}

describe("@clew/core", () => {
  it("parses AGENTS.md active skills", () => {
    expect(parseAgentsMd("# Active Skills\n\n- engineering-core\n- `safe-editing`\n").activeSkillIds).toEqual([
      "engineering-core",
      "safe-editing",
    ]);
  });

  it("composes skills additively without parent execution semantics", () => {
    const parent = bundle("engineering-core", {
      tags: ["engineering"],
      policies: ["prefer deterministic behavior"],
      activation: { triggers: ["build"], tags: [], weight: 1 },
      capabilities: { required: ["filesystem"], optional: [] },
      compatibility: { providers: ["claude"], warnings: [] },
    });
    const child = bundle("typescript-core", {
      extends: ["engineering-core"],
      tags: ["typescript"],
      policies: ["validate runtime inputs"],
      activation: { triggers: ["typescript"], tags: [], weight: 1 },
      capabilities: { required: ["terminal"], optional: [] },
      compatibility: { providers: ["opencode"], warnings: [] },
    });

    const composed = composeSkill(child, [parent]);
    expect(composed.manifest.tags).toEqual(["engineering", "typescript"]);
    expect(composed.manifest.policies).toEqual(["prefer deterministic behavior", "validate runtime inputs"]);
    expect(composed.manifest.capabilities.required).toEqual(["filesystem", "terminal"]);
    expect(composed.manifest.compatibility.providers).toEqual(["claude", "opencode"]);
  });

  it("recommends only explained matches", () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("debugging-core", {
            tags: ["debugging"],
            activation: { triggers: ["debug"], tags: [], weight: 1 },
            capabilities: { required: ["terminal"], optional: [] },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const [recommendation] = new ActivationEngine(registry).recommend({
      query: "debug failing tests",
      capabilities: [],
    });
    expect(recommendation?.skillId).toBe("debugging-core");
    expect(recommendation?.reasons.length).toBeGreaterThan(0);
    expect(recommendation?.warnings[0]?.code).toBe("capability_missing");
  });

  it("reports overlap and missing-parent conflicts", () => {
    const first = bundle("a", { tags: ["typescript"], activation: { triggers: ["refactor"], tags: [], weight: 1 } });
    const second = bundle("b", {
      tags: ["typescript"],
      activation: { triggers: ["refactor"], tags: [], weight: 1 },
      extends: ["missing"],
    });
    expect(findOverlaps([first, second])).toEqual([
      { ids: ["a", "b"], triggers: ["refactor"], tags: ["typescript"] },
    ]);
    expect(findConflicts([first, second])).toEqual([{ ids: ["b", "missing"], reason: "missing parent skill" }]);
  });

  it("rebuilds SQLite derived index tables from registry snapshots", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "clew-")), "registry.db");
    const result = await rebuildSqliteIndex(dbPath, {
      entries: [
        {
          bundle: bundle("engineering-core"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
        },
      ],
      warnings: [],
    });

    expect(result).toMatchObject({ dbPath, skills: 1, overlaps: 0, conflicts: 0 });
  });
});
