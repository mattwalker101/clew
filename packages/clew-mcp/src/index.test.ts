import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillRegistry, type RegistryEntry } from "@clew/core";
import type { CompatibilityWarning } from "@clew/schema";
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
        signals: [{ type: "agents_md", value: "safe-editing" }],
      },
      warnings: [],
    });
  });

  it("includes registry warnings in successful read envelopes", () => {
    const warning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = createClewMcpBridge(registryWithWarnings([entry("engineering-core")], [warning]));

    expect(bridge.search("engineering")).toMatchObject({
      warnings: [warning],
    });
    expect(bridge.recommend("build")).toMatchObject({
      warnings: [warning],
    });
    expect(bridge.explain("engineering-core", "build")).toMatchObject({
      warnings: [warning],
    });
    expect(bridge.lookup("engineering-core")).toMatchObject({
      warnings: [warning],
    });
  });

  it("keeps capability warnings on recommendations while preserving top-level registry warnings", () => {
    const registryWarning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = createClewMcpBridge(
      registryWithWarnings([entry("terminal-skill", { requiredCapabilities: ["terminal"] })], [registryWarning]),
    );

    expect(bridge.recommend({ query: "build", context: { capabilities: [] } })).toMatchObject({
      warnings: [registryWarning],
      recommendations: [
        {
          skillId: "terminal-skill",
          warnings: [{ code: "capability_missing", origin: "activation" }],
        },
      ],
    });
  });

  it("exposes overlap and conflict warnings on recommend and explain recommendations", () => {
    const bridge = createClewMcpBridge(
      registryWith(
        entry("safe-refactor", { triggers: ["refactor"], tags: ["refactor"] }),
        entry("incremental-refactor", { triggers: ["refactor"], tags: ["refactor"] }),
        entry("typescript-core", { triggers: ["typescript"], extends: ["missing-parent"] }),
      ),
    );

    expect(bridge.recommend("refactor")).toMatchObject({
      query: "refactor",
      warnings: [],
      recommendations: [
        {
          skillId: "incremental-refactor",
          warnings: [
            {
              code: "activation_overlap",
              origin: "activation",
              message:
                'Recommendation has complementary overlap with "safe-refactor" using shared_trigger: refactor; shared_tag: refactor.',
            },
          ],
        },
        {
          skillId: "safe-refactor",
          warnings: [{ code: "activation_overlap", origin: "activation" }],
        },
      ],
    });
    expect(bridge.explain("typescript-core", "typescript")).toMatchObject({
      skillId: "typescript-core",
      query: "typescript",
      recommendation: {
        skillId: "typescript-core",
        warnings: [
          {
            code: "activation_conflict",
            origin: "activation",
            message:
              'Recommendation has conflicting relationship with "missing-parent": missing parent skill. Evidence: missing_parent: missing-parent.',
          },
        ],
      },
      warnings: [],
    });
  });

  it("returns null plus explicit warnings for missing, disabled, or unrecommended skills", () => {
    const registryWarning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = createClewMcpBridge(
      registryWithWarnings(
        [entry("disabled-skill", { disabled: true }), entry("available-skill", { triggers: ["available"] })],
        [registryWarning],
      ),
    );

    expect(bridge.lookup("missing-skill")).toMatchObject({
      skillId: "missing-skill",
      bundle: null,
      warnings: [registryWarning, { code: "skill_unknown", origin: "request" }],
    });
    expect(bridge.lookup("disabled-skill")).toMatchObject({
      skillId: "disabled-skill",
      bundle: null,
      warnings: [registryWarning, { code: "skill_disabled", origin: "request" }],
    });
    expect(bridge.explain("available-skill", "no match")).toMatchObject({
      skillId: "available-skill",
      query: "no match",
      recommendation: null,
      warnings: [registryWarning, { code: "skill_not_recommended", origin: "request" }],
    });
  });

  it("matches the documented public warning contract fixture", () => {
    const contract = warningContractFixture();
    const registryWarning = contract.warnings.registryRebuild;
    const bridge = createClewMcpBridge(
      registryWithWarnings(
        [
          entry("disabled-skill", { disabled: true }),
          entry("terminal-skill", { requiredCapabilities: ["terminal"] }),
        ],
        [registryWarning],
      ),
    );

    expect({
      skillId: bridge.lookup("missing-skill").skillId,
      bundle: bridge.lookup("missing-skill").bundle,
      warnings: bridge.lookup("missing-skill").warnings,
    }).toEqual(contract.envelopes.lookupMissingSkill);

    const recommendation = bridge.recommend({ query: "build", context: { capabilities: [] } });
    expect({
      warnings: recommendation.warnings,
      recommendations: recommendation.recommendations.map((item) => ({
        skillId: item.skillId,
        warnings: item.warnings,
      })),
    }).toEqual(contract.envelopes.recommendCapabilityWarning);
  });
});

function warningContractFixture(): {
  warnings: { registryRebuild: CompatibilityWarning };
  envelopes: {
    lookupMissingSkill: { skillId: string; bundle: null; warnings: CompatibilityWarning[] };
    recommendCapabilityWarning: {
      warnings: CompatibilityWarning[];
      recommendations: Array<{ skillId: string; warnings: CompatibilityWarning[] }>;
    };
  };
} {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "contracts", "warning-contract.json"), "utf8"),
  ) as {
    warnings: { registryRebuild: CompatibilityWarning };
    envelopes: {
      lookupMissingSkill: { skillId: string; bundle: null; warnings: CompatibilityWarning[] };
      recommendCapabilityWarning: {
        warnings: CompatibilityWarning[];
        recommendations: Array<{ skillId: string; warnings: CompatibilityWarning[] }>;
      };
    };
  };
}

function registryWith(...entries: RegistryEntry[]): SkillRegistry {
  return new SkillRegistry({ entries, warnings: [] });
}

function registryWithWarnings(entries: RegistryEntry[], warnings: CompatibilityWarning[]): SkillRegistry {
  return new SkillRegistry({ entries, warnings });
}

function entry(
  id: string,
  options: {
    disabled?: boolean;
    tags?: string[];
    triggers?: string[];
    weight?: number;
    requiredCapabilities?: Array<"filesystem" | "terminal" | "internet" | "git" | "mcp">;
    extends?: string[];
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
        extends: options.extends ?? [],
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
