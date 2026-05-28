import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillRegistry, type RegistryEntry } from "@clew-ops/core";
import type { CompatibilityWarning } from "@clew-ops/schema";
import { createClewMcpBridge } from "./index.js";

describe("@clew-ops/mcp", () => {
  it("exposes only read-oriented bridge methods", async () => {
    const bridge = await createClewMcpBridge(registryWith(entry("engineering-core")));

    expect(Object.keys(bridge).sort()).toEqual([
      "analyzeIndex",
      "analyzeRecommendations",
      "analyzeSearch",
      "analyzeSearchSemantic",
      "analyzeTelemetry",
      "close",
      "explain",
      "lookup",
      "recommend",
      "search",
      "searchSemantic",
    ]);
    expect("execute" in bridge).toBe(false);
    expect("activate" in bridge).toBe(false);
    expect("run" in bridge).toBe(false);
    expect("tools" in bridge).toBe(false);
  });

  it("exposes the deterministic semantic index analysis with registry warnings", async () => {
    const registryWarning: CompatibilityWarning = {
      code: "skill_bundle_invalid",
      severity: "error",
      origin: "registry_rebuild",
      message: "Unsupported skill kind.",
    };
    const registry = registryWithWarnings(
      [
        entry("engineering-core", {
          tags: ["engineering"],
          triggers: ["build"],
        }),
        entry("disabled-skill", {
          disabled: true,
          tags: ["disabled"],
          triggers: ["disabled"],
        }),
      ],
      [registryWarning],
    );
    const bridge = await createClewMcpBridge(registry);

    expect(bridge.analyzeIndex()).toEqual({
      analysis: registry.analyzeIndex(),
      warnings: [registryWarning],
    });
    expect(bridge.analyzeIndex()).toMatchObject({
      analysis: {
        index: [
          {
            skillId: "engineering-core",
            evidence: expect.arrayContaining([
              { kind: "identity", values: ["Engineering Core", "engineering-core"] },
              { kind: "activation_trigger", values: ["build"] },
              { kind: "tag", values: ["engineering"] },
              { kind: "instructions_text", values: ["engineering-core", "instructions"] },
            ]),
          },
        ],
      },
      warnings: [registryWarning],
    });
    expect(bridge.analyzeIndex().analysis.index.map((candidate) => candidate.skillId)).toEqual(["engineering-core"]);
  });

  it("returns structured envelopes for legacy positional calls", async () => {
    const bridge = await createClewMcpBridge(registryWith(entry("engineering-core")));

    expect(await bridge.search("engineering")).toMatchObject({
      query: "engineering",
      skills: [{ id: "engineering-core" }],
      warnings: [],
    });
    expect(await bridge.recommend("build")).toMatchObject({
      query: "build",
      recommendations: [{ skillId: "engineering-core" }],
      warnings: [],
    });
    expect(await bridge.explain("engineering-core", "build")).toMatchObject({
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

  it("exposes opt-in deterministic search analysis without changing search", async () => {
    const bridge = await createClewMcpBridge(registryWith(entry("engineering-core")));

    expect(await bridge.search("engineering")).toMatchObject({
      query: "engineering",
      skills: [{ id: "engineering-core" }],
      warnings: [],
    });
    expect(await bridge.search("engineering")).not.toHaveProperty("analysis");
    expect(bridge.analyzeSearch("engineering")).toMatchObject({
      query: "engineering",
      analysis: {
        query: "engineering",
        terms: ["engineering"],
        matches: [
          {
            skillId: "engineering-core",
            matchedTerms: ["engineering"],
            evidence: expect.arrayContaining([
              { kind: "identity", values: ["Engineering Core", "engineering-core"] },
              { kind: "tag", values: ["engineering-core"] },
            ]),
          },
        ],
      },
      warnings: [],
    });
  });

  it("exposes telemetry analysis with registry warnings", async () => {
    const registryWarning: CompatibilityWarning = {
      code: "skill_bundle_invalid",
      severity: "error",
      origin: "registry_rebuild",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(
      registryWithWarnings(
        [
          entry("disabled-skill", { disabled: true }),
          entry("favorite-skill", { favorite: true, usageCount: 2 }),
        ],
        [registryWarning],
      ),
    );

    expect(
      bridge.analyzeTelemetry([
        { skillId: "orphan-skill", usageCount: 1, disabled: false, favorite: false },
      ]),
    ).toMatchObject({
      analysis: {
        records: [
          { skillId: "disabled-skill", known: true, enabled: false, disabled: true },
          { skillId: "favorite-skill", known: true, enabled: true, favorite: true, usageCount: 2 },
          { skillId: "orphan-skill", known: false, enabled: false, usageCount: 1 },
        ],
      },
      warnings: [registryWarning],
    });
  });

  it("exposes opt-in recommendation analysis without changing recommend", async () => {
    const registryWarning: CompatibilityWarning = {
      code: "skill_bundle_invalid",
      severity: "error",
      origin: "registry_rebuild",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(
      registryWithWarnings(
        [
          entry("terminal-skill", { requiredCapabilities: ["terminal"] }),
          entry("unmatched-skill", { triggers: ["nomatch"], tags: ["nomatch"] }),
        ],
        [registryWarning],
      ),
    );

    expect(await bridge.recommend({ query: "build", context: { capabilities: [] } })).not.toHaveProperty("analysis");
    expect(await bridge.analyzeRecommendations({ query: "build", context: { capabilities: [] } })).toMatchObject({
      query: "build",
      analysis: {
        candidates: [
          {
            skillId: "terminal-skill",
            status: "included",
            warnings: [{ code: "capability_missing", origin: "activation" }],
          },
          {
            skillId: "unmatched-skill",
            status: "excluded",
            exclusions: [{ kind: "unmatched" }],
          },
        ],
        recommendations: [{ skillId: "terminal-skill" }],
      },
      warnings: [registryWarning],
    });
  });

  it("supports object inputs and limits result sets", async () => {
    const bridge = await createClewMcpBridge(
      registryWith(
        entry("engineering-core", { triggers: ["build"], weight: 1 }),
        entry("typescript-core", { triggers: ["build"], tags: ["typescript"], weight: 2 }),
      ),
    );

    expect((await bridge.search({ query: "core", limit: 1 })).skills.map((skill) => skill.id)).toEqual(["engineering-core"]);
    expect((await bridge.analyzeSearch({ query: "typescript", limit: 1 })).analysis.matches.map((item) => item.skillId)).toEqual([
      "typescript-core",
    ]);
    expect(bridge.analyzeIndex().analysis.index.map((item) => item.skillId)).toEqual([
      "engineering-core",
      "typescript-core",
    ]);
    expect((await bridge.recommend({ query: "build", limit: 1 })).recommendations.map((item) => item.skillId)).toEqual([
      "typescript-core",
    ]);
    expect(await bridge.explain({ skillId: "typescript-core", query: "build" })).toMatchObject({
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

  it("threads activation context through recommend and explain", async () => {
    const bridge = await createClewMcpBridge(
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
      await bridge.recommend({
        query: "",
        context: { tags: ["typescript"], capabilities: ["terminal"] },
      }),
    ).toMatchObject({
      query: "",
      recommendations: [{ skillId: "typescript-core", warnings: [] }],
      warnings: [],
    });
    expect(
      await bridge.explain({
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

  it("includes registry warnings in successful read envelopes", async () => {
    const warning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(registryWithWarnings([entry("engineering-core")], [warning]));

    expect(await bridge.search("engineering")).toMatchObject({
      warnings: [warning],
    });
    expect(await bridge.recommend("build")).toMatchObject({
      warnings: [warning],
    });
    expect(await bridge.explain("engineering-core", "build")).toMatchObject({
      warnings: [warning],
    });
    expect(bridge.lookup("engineering-core")).toMatchObject({
      warnings: [warning],
    });
  });

  it("keeps capability warnings on recommendations while preserving top-level registry warnings", async () => {
    const registryWarning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(
      registryWithWarnings([entry("terminal-skill", { requiredCapabilities: ["terminal"] })], [registryWarning]),
    );

    expect(await bridge.recommend({ query: "build", context: { capabilities: [] } })).toMatchObject({
      warnings: [registryWarning],
      recommendations: [
        {
          skillId: "terminal-skill",
          warnings: [{ code: "capability_missing", origin: "activation" }],
        },
      ],
    });
  });

  it("exposes overlap and conflict warnings on recommend and explain recommendations", async () => {
    const bridge = await createClewMcpBridge(
      registryWith(
        entry("safe-refactor", { triggers: ["refactor"], tags: ["refactor"], incompatibleWith: ["incremental-refactor"] }),
        entry("incremental-refactor", { triggers: ["refactor"], tags: ["refactor"] }),
        entry("typescript-core", { triggers: ["typescript"], extends: ["missing-parent"] }),
      ),
    );

    const recommendEnvelope = await bridge.recommend("refactor");
    const explainEnvelope = await bridge.explain("typescript-core", "typescript");

    expect(Object.keys(recommendEnvelope)).toEqual(["query", "recommendations", "warnings"]);
    expect(Object.keys(explainEnvelope)).toEqual(["skillId", "query", "recommendation", "warnings"]);
    expect(recommendEnvelope.warnings).toEqual([]);
    expect(explainEnvelope.warnings).toEqual([]);
    expect(recommendEnvelope).not.toHaveProperty("overlaps");
    expect(recommendEnvelope).not.toHaveProperty("conflicts");
    expect(explainEnvelope).not.toHaveProperty("overlaps");
    expect(explainEnvelope).not.toHaveProperty("conflicts");
    expect(recommendEnvelope).toMatchObject({
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
            {
              code: "activation_conflict",
              origin: "activation",
              message:
                'Recommendation has conflicting relationship with "safe-refactor": declared incompatible skill. Evidence: declared_incompatibility: incremental-refactor, safe-refactor.',
            },
          ],
        },
        {
          skillId: "safe-refactor",
          warnings: [
            { code: "activation_overlap", origin: "activation" },
            { code: "activation_conflict", origin: "activation" },
          ],
        },
      ],
    });
    expect(explainEnvelope).toMatchObject({
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

  it("returns null plus explicit warnings for missing, disabled, or unrecommended skills", async () => {
    const registryWarning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(
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
    expect(await bridge.explain("available-skill", "no match")).toMatchObject({
      skillId: "available-skill",
      query: "no match",
      recommendation: null,
      warnings: [registryWarning, { code: "skill_not_recommended", origin: "request" }],
    });
  });

  it("matches the documented public warning contract fixture", async () => {
    const contract = warningContractFixture();
    const registryWarning = contract.warnings.registryRebuild;
    const bridge = await createClewMcpBridge(
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

    const recommendation = await bridge.recommend({ query: "build", context: { capabilities: [] } });
    expect({
      warnings: recommendation.warnings,
      recommendations: recommendation.recommendations.map((item) => ({
        skillId: item.skillId,
        warnings: item.warnings,
      })),
    }).toEqual(contract.envelopes.recommendCapabilityWarning);
  });

  it("matches the documented MCP public envelope contract fixture", async () => {
    const registryWarning = {
      code: "skill_bundle_invalid",
      severity: "error" as const,
      origin: "registry_rebuild" as const,
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const bridge = await createClewMcpBridge(
      registryWithWarnings(
        [
          entry("typescript-core", {
            triggers: ["typescript"],
            tags: ["typescript"],
            requiredCapabilities: ["terminal"],
          }),
          entry("disabled-skill", {
            disabled: true,
            triggers: ["typescript"],
            tags: ["typescript"],
            usageCount: 3,
          }),
        ],
        [registryWarning],
      ),
    );

    const search = await bridge.search("typescript");
    const indexAnalysis = bridge.analyzeIndex();
    const searchAnalysis = bridge.analyzeSearch("typescript");
    const recommendation = await bridge.recommend({ query: "typescript", context: { capabilities: [] } });
    const recommendationAnalysis = await bridge.analyzeRecommendations({
      query: "typescript",
      context: { capabilities: [] },
    });
    const disabledLookup = bridge.lookup("disabled-skill");
    const disabledExplain = await bridge.explain("disabled-skill", "typescript");
    const telemetryAnalysis = bridge.analyzeTelemetry([
      {
        skillId: "orphan-telemetry-skill",
        usageCount: 2,
        disabled: false,
        favorite: true,
      },
    ]);

    expect({
      defaultSurfaces: {
        searchKeys: Object.keys(search),
        recommendKeys: Object.keys(recommendation),
        lookupKeys: Object.keys(disabledLookup),
        explainKeys: Object.keys(disabledExplain),
      },
      analysisSurfaces: {
        indexAnalysisKeys: Object.keys(indexAnalysis),
        searchAnalysisKeys: Object.keys(searchAnalysis),
        recommendationAnalysisKeys: Object.keys(recommendationAnalysis),
        telemetryAnalysisKeys: Object.keys(telemetryAnalysis),
      },
      enabledReads: {
        indexAnalysisSkillIds: indexAnalysis.analysis.index.map((item) => item.skillId),
        searchSkillIds: search.skills.map((skill) => skill.id),
        searchAnalysisMatchIds: searchAnalysis.analysis.matches.map((match) => match.skillId),
        recommendationIds: recommendation.recommendations.map((item) => item.skillId),
        recommendationWarningCodes: recommendation.recommendations.flatMap((item) =>
          item.warnings.map((warning) => warning.code),
        ),
        recommendationAnalysisStatuses: recommendationAnalysis.analysis.candidates.map((candidate) => ({
          skillId: candidate.skillId,
          status: candidate.status,
        })),
      },
      disabledReads: {
        lookupBundle: disabledLookup.bundle,
        lookupWarningCodes: disabledLookup.warnings.map((warning) => warning.code),
        lookupWarningOrigins: disabledLookup.warnings.map((warning) => warning.origin),
        explainRecommendation: disabledExplain.recommendation,
        explainWarningCodes: disabledExplain.warnings.map((warning) => warning.code),
        explainWarningOrigins: disabledExplain.warnings.map((warning) => warning.origin),
      },
      telemetryAnalysisRows: telemetryAnalysis.analysis.records.map((record) => ({
        skillId: record.skillId,
        known: record.known,
        enabled: record.enabled,
      })),
      topLevelWarningCodes: {
        indexAnalysis: indexAnalysis.warnings.map((warning) => warning.code),
        search: search.warnings.map((warning) => warning.code),
        searchAnalysis: searchAnalysis.warnings.map((warning) => warning.code),
        recommend: recommendation.warnings.map((warning) => warning.code),
        recommendationAnalysis: recommendationAnalysis.warnings.map((warning) => warning.code),
        telemetryAnalysis: telemetryAnalysis.warnings.map((warning) => warning.code),
      },
    }).toEqual(publicEnvelopeContractFixture().mcp);
  });

  it("matches the documented MCP telemetry mutation boundary contract fixture", async () => {
    const fixture = telemetryMutationBoundaryFixture().mcp;
    const registryWarning: CompatibilityWarning = {
      code: "skill_bundle_invalid",
      severity: "error",
      origin: "registry_rebuild",
      field: "skills/future-kind",
      message: "Unsupported skill kind.",
    };
    const registry = registryWithWarnings(
      [
        entry("typescript-core", { triggers: ["typescript"], tags: ["typescript"], usageCount: 3 }),
        entry("disabled-skill", { disabled: true, triggers: ["typescript"], tags: ["typescript"], usageCount: 7 }),
      ],
      [registryWarning],
    );
    const bridge = await createClewMcpBridge(registry);
    const forbiddenMutationMethodNames = [
      "recordRecommendation",
      "enable",
      "disable",
      "execute",
      "activate",
      "run",
    ];
    const usageCounts = () =>
      registry.entries.map((item) => ({
        skillId: item.bundle.manifest.id,
        usageCount: item.usageCount ?? 0,
      }));
    const initialUsageCounts = usageCounts();

    await bridge.recommend("typescript");
    await bridge.analyzeRecommendations("typescript");
    await bridge.search("typescript");
    await bridge.analyzeSearch("typescript");
    const missingLookup = bridge.lookup("missing-skill");
    const disabledLookup = bridge.lookup("disabled-skill");
    const unrecommendedExplain = await bridge.explain("typescript-core", "unrelated");
    const telemetryAnalysis = bridge.analyzeTelemetry();
    bridge.analyzeIndex();

    expect({
      methodSurface: {
        readOnlyMethodNames: Object.keys(bridge).sort(),
        forbiddenMutationMethodNames,
        exposedForbiddenMutationMethodNames: forbiddenMutationMethodNames.filter((name) => name in bridge),
      },
      usageRecording: {
        initialUsageCounts,
        afterReadAnalysisUsageCounts: usageCounts(),
      },
      requestWarnings: {
        lookupMissingWarningCodes: missingLookup.warnings.map((warning) => warning.code),
        lookupMissingWarningOrigins: missingLookup.warnings.map((warning) => warning.origin),
        lookupDisabledWarningCodes: disabledLookup.warnings.map((warning) => warning.code),
        lookupDisabledWarningOrigins: disabledLookup.warnings.map((warning) => warning.origin),
        explainUnrecommendedWarningCodes: unrecommendedExplain.warnings.map((warning) => warning.code),
        explainUnrecommendedWarningOrigins: unrecommendedExplain.warnings.map((warning) => warning.origin),
        telemetryAnalysisRequestWarningCodes: telemetryAnalysis.analysis.records.flatMap((record) =>
          record.evidence
            .flatMap((evidence) => evidence.values)
            .filter((value) => ["skill_unknown", "skill_disabled", "skill_not_recommended"].includes(value)),
        ),
      },
    }).toEqual(fixture);
  });

  it("should expose semantic search on the bridge", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "clew-mcp-semantic-search-"));
    try {
      const registry = new SkillRegistry({
        entries: [
          entry("engineering-core", {
            tags: ["engineering"],
          }),
        ],
        warnings: [],
        dbPath: join(tempDir, ".clew-registry.db"),
      });

      const bridge = await createClewMcpBridge(registry);
      
      expect(typeof bridge.searchSemantic).toBe("function");
      expect(typeof bridge.analyzeSearchSemantic).toBe("function");

      const result = await bridge.searchSemantic("engineering");
      expect(result.query).toBe("engineering");
      expect(result.skills).toBeDefined();

      const analysis = await bridge.analyzeSearchSemantic("engineering");
      expect(analysis.query).toBe("engineering");
      expect(analysis.analysis.matches).toBeDefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

function publicEnvelopeContractFixture(): { mcp: unknown } {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "contracts", "public-envelope-contract.json"), "utf8"),
  ) as { mcp: unknown };
}

function telemetryMutationBoundaryFixture(): { mcp: unknown } {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "contracts", "telemetry-mutation-boundary-contract.json"), "utf8"),
  ) as { mcp: unknown };
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
    favorite?: boolean;
    usageCount?: number;
    tags?: string[];
    triggers?: string[];
    weight?: number;
    requiredCapabilities?: Array<"filesystem" | "terminal" | "internet" | "git" | "mcp">;
    extends?: string[];
    incompatibleWith?: string[];
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
        compatibility: { providers: [], warnings: [], incompatible_with: options.incompatibleWith ?? [] },
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
    favorite: options.favorite ?? false,
    usageCount: options.usageCount ?? 0,
  };
}

function titleize(id: string): string {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
