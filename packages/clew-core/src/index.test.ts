import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivationEngine,
  composeRegistrySkill,
  composeRegistrySkillWithReport,
  composeSkill,
  composeSkillWithReport,
  detectRepoSignals,
  discoverSkillBundles,
  findConflicts,
  findOverlaps,
  getAgentsMdDiagnostics,
  loadSkillBundle,
  openRegistryDb,
  openSessionDatabase,
  parseAgentsMd,
  rebuildRegistry,
  rebuildRegistryIndex,
  rebuildSqliteIndex,
  type RegistrySnapshot,
  registryPrecedence,
  SkillRegistry,
} from "./index.js";
import {
  compositionResultSchema,
  recommendationSchema,
  type CompatibilityWarning,
  type SkillBundle,
} from "@clew-ops/schema";

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
      compatibility: { providers: [], warnings: [], incompatible_with: [] },
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

function writeFilesystemBundle(root: string, options: { id: string; kind: string; name: string; instructions: string }): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "clew.yaml"),
    [
      `id: ${options.id}`,
      "version: 1.0.0",
      `kind: ${options.kind}`,
      `name: ${options.name}`,
      "instructions:",
      "  file: skill.md",
    ].join("\n"),
  );
  writeFileSync(join(root, "skill.md"), options.instructions);
}

function contractFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "contracts", name), "utf8")) as unknown;
}

function normalizeProjectWarning(warning: CompatibilityWarning, projectRoot: string): CompatibilityWarning {
  if (!warning.field?.startsWith(projectRoot)) return warning;
  return { ...warning, field: warning.field.slice(projectRoot.length + 1) };
}

describe("@clew-ops/core", () => {
  it("parses AGENTS.md active skills", () => {
    expect(parseAgentsMd("# Active Skills\n\n- engineering-core\n- `safe-editing`\n").activeSkillIds).toEqual([
      "engineering-core",
      "safe-editing",
    ]);
  });

  it("parses AGENTS.md with nested headers and complex preferences", () => {
    const content = `
# Project Context
## Active Skills
- engineering-core
- safe-editing

### Sub-Section
- typescript-core

# Another Section
- must prefer local-first behavior
- should avoid opaque orchestration
- always use typescript
- never use recursion
- some random bullet point
    `;
    const parsed = parseAgentsMd(content);
    expect(parsed.activeSkillIds).toEqual(["engineering-core", "safe-editing", "typescript-core"]);
    expect(parsed.preferences).toEqual([
      "- must prefer local-first behavior",
      "- should avoid opaque orchestration",
      "- always use typescript",
      "- never use recursion",
    ]);
  });

  it("diagnoses AGENTS.md skill mismatches", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-core-"));
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", { tags: ["typescript"] }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const content = "# Active Skills\n- typescript-core";
    // In a directory without typescript files, it should issue a mismatch warning
    const diagnostics = getAgentsMdDiagnostics(content, registry, projectRoot);
    expect(diagnostics).toMatchObject([
      {
        code: "agents_skill_mismatch",
        message: expect.stringContaining('expects repository signals [typescript]'),
      },
    ]);
  });

  it("boosts recommendations based on project preferences", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core", {
            activation: { triggers: ["build"], tags: [], weight: 1 },
            policies: ["deterministic behavior"],
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("random-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    const context = {
      query: "build",
      agentsMd: "# Preferences\n- must use deterministic behavior",
    };

    const recommendations = await activation.recommend(context);
    const eng = recommendations.find((r) => r.skillId === "engineering-core")!;
    expect(eng.score).toBeGreaterThan(
      (await activation.recommend({ query: "build" })).find((r) => r.skillId === "engineering-core")!.score,
    );
    expect(eng.reasons).toContain('matched project preference "- must use deterministic behavior"');
    expect(eng.signals).toContainEqual({ type: "project_preference", value: "- must use deterministic behavior" });
    });

    it("suppresses redundant recommendations from lower layers", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core"),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("safe-editing", {
            tags: ["editing"],
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 },
            capabilities: { required: ["filesystem", "terminal"], optional: [] },
            extends: ["engineering-core"],
          }),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("specific-safe-editing", {
            tags: ["safety", "editing"], // Redundant shared_tag
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 }, // Redundant shared_trigger
            capabilities: { required: ["filesystem", "terminal"], optional: [] }, // Redundant shared_required_capability
            extends: ["engineering-core"], // Redundant common_parent
          }),
          layer: "project",
          root: "project-skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    const result = await activation.analyzeRecommendations({ query: "edit" });

    const specific = result.candidates.find((c) => c.skillId === "specific-safe-editing")!;
    const global = result.candidates.find((c) => c.skillId === "safe-editing")!;

    expect(specific.status).toBe("included");
    expect(global.status).toBe("suppressed");
    expect(global.suppression).toMatchObject({
      kind: "redundancy",
      bySkillId: "specific-safe-editing",
    });
    expect(result.recommendations.map((r) => r.skillId)).toEqual(["specific-safe-editing"]);
    });

    it("excludes skills that violate negative project preferences", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("recursive-skill", { tags: ["recursion"] }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    const context = {
      query: "build",
      agentsMd: "# Rules\n- avoid recursion",
    };

    const result = await activation.analyzeRecommendations(context);
    const candidate = result.candidates.find((c) => c.skillId === "recursive-skill")!;

    expect(candidate.status).toBe("excluded");
    expect(candidate.exclusions).toContainEqual({
      kind: "preference_violation",
      reason: 'violates project preference "- avoid recursion"',
    });
    expect(result.recommendations).toHaveLength(0);
    });

    it("matches the documented AGENTS.md parsing and diagnostic contract fixture", async () => {
    const contract = contractFixture("agents-md-contract.json") as {
      content: string;
      parsed: ReturnType<typeof parseAgentsMd>;
      diagnostics: ReturnType<typeof getAgentsMdDiagnostics>;
    };
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("safe-editing"),
          layer: "project",
          root: "skills",
          disabled: true,
          favorite: false,
        },
      ],
      warnings: [],
    });

    expect(parseAgentsMd(contract.content)).toEqual(contract.parsed);
    expect(getAgentsMdDiagnostics(contract.content, registry)).toEqual(contract.diagnostics);
  });

  it("composes skills additively without parent execution semantics", () => {
    const parent = bundle("engineering-core", {
      tags: ["engineering"],
      policies: ["prefer deterministic behavior"],
      activation: { triggers: ["build"], tags: [], weight: 1 },
      capabilities: { required: ["filesystem"], optional: [] },
      compatibility: { providers: ["claude"], incompatible_with: [], warnings: [] },
    });
    const child = bundle("typescript-core", {
      extends: ["engineering-core"],
      tags: ["typescript"],
      policies: ["validate runtime inputs"],
      activation: { triggers: ["typescript"], tags: [], weight: 1 },
      capabilities: { required: ["terminal"], optional: [] },
      compatibility: { providers: ["opencode"], incompatible_with: [], warnings: [] },
    });

    const composed = composeSkill(child, [parent]);
    expect(composed.manifest.tags).toEqual(["engineering", "typescript"]);
    expect(composed.manifest.policies).toEqual(["prefer deterministic behavior", "validate runtime inputs"]);
    expect(composed.manifest.capabilities.required).toEqual(["filesystem", "terminal"]);
    expect(composed.manifest.compatibility.providers).toEqual(["claude", "opencode"]);
  });

  it("returns a schema-validated composition report without implicit parents", () => {
    const engineering = bundle("engineering-core", {
      tags: ["engineering"],
      policies: ["prefer deterministic behavior"],
    });
    const safeEditing = bundle("safe-editing", {
      tags: ["safety"],
      policies: ["preserve public interfaces"],
    });
    const unrelated = bundle("debugging-core", {
      tags: ["debugging"],
      policies: ["explain failures"],
    });
    const child = bundle("typescript-core", {
      extends: ["safe-editing", "engineering-core"],
      tags: ["typescript"],
      policies: ["validate runtime inputs"],
    });

    const report = composeSkillWithReport(child, [engineering, unrelated, safeEditing]);

    expect(compositionResultSchema.parse(report)).toEqual(report);
    expect(report.appliedParentIds).toEqual(["safe-editing", "engineering-core"]);
    expect(report.warnings).toEqual([]);
    expect(report.bundle.manifest.tags).toEqual(["safety", "engineering", "typescript"]);
    expect(report.bundle.manifest.policies).toEqual([
      "preserve public interfaces",
      "prefer deterministic behavior",
      "validate runtime inputs",
    ]);
  });

  it("matches the documented additive composition contract fixture", () => {
    const engineering = bundle("engineering-core", {
      tags: ["engineering"],
      policies: ["prefer deterministic behavior"],
      activation: { triggers: ["build"], tags: ["core"], weight: 1 },
      capabilities: { required: ["filesystem"], optional: ["git"] },
      compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
    });
    const safeEditing = bundle("safe-editing", {
      tags: ["safety"],
      policies: ["preserve public interfaces"],
      activation: { triggers: ["review"], tags: ["safety"], weight: 1 },
      capabilities: { required: ["terminal"], optional: [] },
      compatibility: { providers: ["claude"], incompatible_with: [], warnings: [] },
    });
    const unrelated = bundle("debugging-core", {
      tags: ["debugging"],
      policies: ["explain failures"],
    });
    const child = bundle("typescript-core", {
      extends: ["safe-editing", "engineering-core", "missing-parent"],
      tags: ["typescript", "engineering"],
      policies: ["validate runtime inputs", "preserve public interfaces"],
      activation: { triggers: ["typescript", "build"], tags: ["ts"], weight: 2 },
      capabilities: { required: ["terminal"], optional: ["git"] },
      compatibility: { providers: ["opencode"], incompatible_with: [], warnings: [] },
    });

    const directReport = composeSkillWithReport(child, [engineering, unrelated, safeEditing]);
    const registry = new SkillRegistry({
      entries: [
        { bundle: child, layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("safe-editing", { tags: ["session-safety"] }), layer: "session", root: "session", disabled: false, favorite: false },
        { bundle: safeEditing, layer: "global", root: "global", disabled: false, favorite: false },
        { bundle: bundle("engineering-core", { tags: ["session-engineering"] }), layer: "session", root: "session", disabled: false, favorite: false },
        { bundle: engineering, layer: "global", root: "global", disabled: false, favorite: false },
      ],
      warnings: [],
    });
    const registryReport = composeRegistrySkillWithReport(registry, "typescript-core");
    const disabledRegistry = new SkillRegistry({
      entries: [
        { bundle: bundle("disabled-child", { extends: ["disabled-parent"], tags: ["child"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("disabled-parent", { tags: ["parent"] }), layer: "session", root: "session", disabled: true, favorite: false },
      ],
      warnings: [],
    });
    const disabledParentReport = composeRegistrySkillWithReport(disabledRegistry, "disabled-child");

    expect(compositionResultSchema.parse(directReport)).toEqual(directReport);
    expect(compositionResultSchema.parse(registryReport)).toEqual(registryReport);
    expect(compositionResultSchema.parse(disabledParentReport)).toEqual(disabledParentReport);
    expect(
      JSON.parse(
        JSON.stringify({
          direct: directReport,
          registryHighestPrecedence: registryReport,
          disabledParent: disabledParentReport,
          registryWarnings: disabledRegistry.warnings,
        }),
      ),
    ).toEqual(contractFixture("composition-resolution-contract.json"));
  });

  it("composes registry skills with the highest-precedence resolved parent", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("typescript-core", { extends: ["engineering-core"], tags: ["typescript"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("engineering-core", { tags: ["project"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("engineering-core", { tags: ["org"] }), layer: "org", root: "org", disabled: false, favorite: false },
        { bundle: bundle("engineering-core", { tags: ["global"] }), layer: "global", root: "global", disabled: false, favorite: false },
        { bundle: bundle("engineering-core", { tags: ["session"] }), layer: "session", root: "session", disabled: false, favorite: false },
      ],
      warnings: [],
    });

    const report = composeRegistrySkillWithReport(registry, "typescript-core");

    expect(report?.appliedParentIds).toEqual(["engineering-core"]);
    expect(report?.bundle.manifest.tags).toEqual(["session", "typescript"]);
    expect(composeRegistrySkill(registry, "typescript-core")?.manifest.tags).toEqual(["session", "typescript"]);
  });

  it("composes registry parents in child extends order", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("child", { extends: ["parent-b", "parent-a"], tags: ["child"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("parent-a", { tags: ["a"], policies: ["policy-a"] }), layer: "session", root: "session", disabled: false, favorite: false },
        { bundle: bundle("parent-b", { tags: ["b"], policies: ["policy-b"] }), layer: "global", root: "global", disabled: false, favorite: false },
      ],
      warnings: [],
    });

    const report = composeRegistrySkillWithReport(registry, "child");

    expect(report?.appliedParentIds).toEqual(["parent-b", "parent-a"]);
    expect(report?.bundle.manifest.tags).toEqual(["b", "a", "child"]);
    expect(report?.bundle.manifest.policies).toEqual(["policy-b", "policy-a"]);
  });

  it("does not apply disabled registry parents", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("child", { extends: ["parent"], tags: ["child"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        { bundle: bundle("parent", { tags: ["parent"] }), layer: "session", root: "session", disabled: true, favorite: false },
      ],
      warnings: [],
    });

    const report = composeRegistrySkillWithReport(registry, "child");

    expect(report?.appliedParentIds).toEqual([]);
    expect(report?.warnings).toEqual([]);
    expect(report?.bundle.manifest.tags).toEqual(["child"]);
  });

  it("returns undefined for unknown registry children without request-time warnings", () => {
    const registry = new SkillRegistry({ entries: [], warnings: [] });

    expect(composeRegistrySkill(registry, "missing")).toBeUndefined();
    expect(composeRegistrySkillWithReport(registry, "missing")).toBeUndefined();
    expect(registry.warnings).toEqual([]);
  });

  it("recommends only explained matches", async () => {
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

    const [recommendation] = await new ActivationEngine(registry).recommend({
      query: "debug failing tests",
      capabilities: [],
    });
    expect(recommendation?.skillId).toBe("debugging-core");
    expect(recommendation?.reasons.length).toBeGreaterThan(0);
    expect(recommendation?.warnings[0]?.code).toBe("capability_missing");
  });

  it("analyzes the deterministic semantic index without embeddings", () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("semantic-index", {
            name: "Semantic Index",
            description: "Local searchable skill evidence.",
            tags: ["typescript"],
            policies: ["preserve deterministic behavior"],
            capabilities: { required: ["filesystem"], optional: ["git"] },
            compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
            activation: { triggers: ["index"], tags: ["search"], weight: 1 },
            extends: ["engineering-core"],
            provenance: {
              source: { type: "github", location: "mattpocock/skills", original_id: "semantic-index-source" },
              imported_via: { importer: "claude" },
            },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });
    registry.entries[0]!.bundle.instructions = "Build deterministic local-first instructions-derived evidence.";

    expect(registry.analyzeIndex()).toEqual(contractFixture("semantic-index-contract.json"));
  });

  it("does not include disabled skills in semantic index analysis", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("disabled-index", { tags: ["search"] }), layer: "project", root: "skills", disabled: true, favorite: false },
      ],
      warnings: [],
    });

    expect(registry.analyzeIndex()).toEqual({ index: [] });
  });

  it("analyzes deterministic search evidence without embeddings", () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("semantic-index", {
            name: "Semantic Index",
            description: "Local searchable skill evidence.",
            tags: ["typescript"],
            policies: ["preserve deterministic behavior"],
            capabilities: { required: ["filesystem"], optional: ["git"] },
            compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
            activation: { triggers: ["index"], tags: ["search"], weight: 1 },
            extends: ["engineering-core"],
            provenance: {
              source: { type: "github", location: "mattpocock/skills", original_id: "semantic-index-source" },
              imported_via: { importer: "claude" },
            },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });
    registry.entries[0]!.bundle.instructions = "Build deterministic local-first instructions-derived evidence.";

    expect(registry.analyzeSearch("index typescript deterministic filesystem git codex engineering github claude instructions")).toEqual({
      query: "index typescript deterministic filesystem git codex engineering github claude instructions",
      terms: ["index", "typescript", "deterministic", "filesystem", "git", "codex", "engineering", "github", "claude", "instructions"],
      index: [
        {
          skillId: "semantic-index",
          evidence: [
            { kind: "identity", values: ["Local searchable skill evidence.", "Semantic Index", "semantic-index"] },
            { kind: "activation_trigger", values: ["index"] },
            { kind: "activation_tag", values: ["search"] },
            { kind: "tag", values: ["typescript"] },
            { kind: "policy", values: ["preserve deterministic behavior"] },
            { kind: "required_capability", values: ["filesystem"] },
            { kind: "optional_capability", values: ["git"] },
            { kind: "provider", values: ["codex"] },
            { kind: "parent", values: ["engineering-core"] },
            { kind: "provenance", values: ["claude", "github", "mattpocock/skills", "semantic-index-source"] },
            { kind: "instructions_text", values: ["build", "deterministic", "evidence", "instructions-derived", "local-first"] },
          ],
        },
      ],
      matches: [
        {
          skillId: "semantic-index",
          score: 101,
          matchedTerms: ["index", "typescript", "deterministic", "filesystem", "git", "codex", "engineering", "claude", "github", "instructions"],
          evidence: [
            { kind: "identity", values: ["Semantic Index", "semantic-index"] },
            { kind: "activation_trigger", values: ["index"] },
            { kind: "tag", values: ["typescript"] },
            { kind: "policy", values: ["preserve deterministic behavior"] },
            { kind: "required_capability", values: ["filesystem"] },
            { kind: "optional_capability", values: ["git"] },
            { kind: "provider", values: ["codex"] },
            { kind: "parent", values: ["engineering-core"] },
            { kind: "provenance", values: ["claude", "github", "semantic-index-source"] },
            { kind: "instructions_text", values: ["deterministic", "instructions-derived"] },
          ],
          reasons: [
            'matched identity "Semantic Index"',
            'matched identity "semantic-index"',
            'matched activation_trigger "index"',
            'matched tag "typescript"',
            'matched policy "preserve deterministic behavior"',
            'matched required_capability "filesystem"',
            'matched optional_capability "git"',
            'matched provider "codex"',
            'matched parent "engineering-core"',
            'matched provenance "claude"',
            'matched provenance "github"',
            'matched provenance "semantic-index-source"',
            'matched instructions_text "deterministic"',
            'matched instructions_text "instructions-derived"',
          ],
        },
      ],
    });
  });

  it("orders search analysis matches deterministically by score then skill id", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("beta", { tags: ["search"] }), layer: "project", root: "skills", disabled: false, favorite: false },
        {
          bundle: bundle("alpha", { tags: ["search"], activation: { triggers: ["search"], tags: [], weight: 1 } }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        { bundle: bundle("gamma", { tags: ["search"] }), layer: "project", root: "skills", disabled: false, favorite: false },
      ],
      warnings: [],
    });

    expect(registry.analyzeSearch("search").matches.map((match) => [match.skillId, match.score])).toEqual([
      ["alpha", 19],
      ["beta", 9],
      ["gamma", 9],
    ]);
  });

  it("keeps search returning only bundles derived from search analysis", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("semantic-index", { policies: ["deterministic evidence"] }), layer: "project", root: "skills", disabled: false, favorite: false },
      ],
      warnings: [],
    });

    expect(registry.search("deterministic").map((candidate) => candidate.manifest.id)).toEqual(["semantic-index"]);
  });

  it("does not analyze disabled skills as search matches", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("disabled-index", { tags: ["search"] }), layer: "project", root: "skills", disabled: true, favorite: false },
      ],
      warnings: [],
    });

    expect(registry.analyzeSearch("search")).toEqual({
      query: "search",
      terms: ["search"],
      index: [],
      matches: [],
    });
  });

  it("matches the documented search analysis contract fixture", () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("semantic-index", {
            name: "Semantic Index",
            description: "Local searchable skill evidence.",
            tags: ["typescript"],
            policies: ["preserve deterministic behavior"],
            capabilities: { required: ["filesystem"], optional: ["git"] },
            compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
            activation: { triggers: ["index"], tags: ["search"], weight: 1 },
            extends: ["engineering-core"],
            provenance: {
              source: { type: "github", location: "mattpocock/skills", original_id: "semantic-index-source" },
              imported_via: { importer: "claude" },
            },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });
    registry.entries[0]!.bundle.instructions = "Build deterministic local-first instructions-derived evidence.";

    expect(registry.analyzeSearch("index typescript deterministic filesystem git codex engineering github claude instructions")).toEqual(
      contractFixture("search-analysis-contract.json"),
    );
  });

  it("analyzes telemetry for enabled, disabled, favorite, used, and orphan skills deterministically", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("beta-skill"), layer: "project", root: "skills", disabled: false, favorite: true, usageCount: 2 },
        { bundle: bundle("alpha-skill"), layer: "project", root: "skills", disabled: true, favorite: false, usageCount: 0 },
      ],
      warnings: [],
    });

    expect(
      registry.analyzeTelemetry([
        { skillId: "orphan-skill", usageCount: 4, lastUsed: "2026-05-17T10:00:00.000Z", disabled: false, favorite: true },
      ]),
    ).toEqual({
      records: [
        {
          skillId: "alpha-skill",
          known: true,
          enabled: false,
          disabled: true,
          favorite: false,
          usageCount: 0,
          evidence: [{ kind: "disabled", values: ["true"] }],
        },
        {
          skillId: "beta-skill",
          known: true,
          enabled: true,
          disabled: false,
          favorite: true,
          usageCount: 2,
          evidence: [
            { kind: "favorite", values: ["true"] },
            { kind: "usage_count", values: ["2"] },
          ],
        },
        {
          skillId: "orphan-skill",
          known: false,
          enabled: false,
          disabled: false,
          favorite: true,
          usageCount: 4,
          lastUsed: "2026-05-17T10:00:00.000Z",
          evidence: [
            { kind: "orphan", values: ["true"] },
            { kind: "favorite", values: ["true"] },
            { kind: "usage_count", values: ["4"] },
            { kind: "last_used", values: ["2026-05-17T10:00:00.000Z"] },
          ],
        },
      ],
    });
  });

  it("matches the documented telemetry analysis contract fixture", () => {
    const registry = new SkillRegistry({
      entries: [
        { bundle: bundle("disabled-skill"), layer: "project", root: "skills", disabled: true, favorite: false, usageCount: 0 },
        { bundle: bundle("favorite-skill"), layer: "project", root: "skills", disabled: false, favorite: true, usageCount: 3 },
      ],
      warnings: [],
    });

    expect(
      registry.analyzeTelemetry([
        { skillId: "orphan-skill", usageCount: 1, lastUsed: "2026-05-17T12:00:00.000Z", disabled: false, favorite: false },
      ]),
    ).toEqual(contractFixture("telemetry-analysis-contract.json"));
  });

  it("reports enriched overlap and missing-parent conflict rows", () => {
    const first = bundle("a", { tags: ["typescript"], activation: { triggers: ["refactor"], tags: [], weight: 1 } });
    const second = bundle("b", {
      tags: ["typescript"],
      activation: { triggers: ["refactor"], tags: [], weight: 1 },
      extends: ["missing"],
    });
    expect(findOverlaps([first, second])).toEqual([
      {
        ids: ["a", "b"],
        triggers: ["refactor"],
        tags: ["typescript"],
        classification: "complementary",
        evidence: [
          { kind: "shared_trigger", values: ["refactor"] },
          { kind: "shared_tag", values: ["typescript"] },
        ],
      },
    ]);
    expect(findConflicts([first, second])).toEqual([
      {
        ids: ["b", "missing"],
        reason: "missing parent skill",
        classification: "conflicting",
        evidence: [{ kind: "missing_parent", values: ["missing"] }],
      },
    ]);
  });

  it("classifies redundant overlaps with deterministic evidence and row ordering", () => {
    const alpha = bundle("alpha", {
      tags: ["typescript", "refactor"],
      policies: ["preserve public APIs", "prefer small patches"],
      capabilities: { required: ["filesystem"], optional: ["git"] },
      compatibility: { providers: ["claude"], incompatible_with: [], warnings: [] },
      provenance: {
        source: { type: "github", location: "mattpocock/skills", original_id: "refactor" },
        imported_via: { importer: "claude" },
      },
      activation: { triggers: ["build"], tags: [], weight: 1 },
      extends: ["base"],
    });
    const beta = bundle("beta", {
      tags: ["typescript", "debugging"],
      policies: ["preserve public APIs"],
      capabilities: { required: ["filesystem"], optional: ["git"] },
      compatibility: { providers: ["claude"], incompatible_with: [], warnings: [] },
      provenance: {
        source: { type: "github", location: "mattpocock/skills", original_id: "debugging" },
        imported_via: { importer: "claude" },
      },
      activation: { triggers: ["build"], tags: [], weight: 1 },
      extends: ["base"],
    });
    const gamma = bundle("gamma", {
      policies: ["preserve public APIs"],
    });

    expect(findOverlaps([beta, gamma, alpha])).toEqual([
      {
        ids: ["alpha", "beta"],
        triggers: ["build"],
        tags: ["typescript"],
        classification: "redundant",
        evidence: [
          { kind: "shared_trigger", values: ["build"] },
          { kind: "shared_tag", values: ["typescript"] },
          { kind: "shared_policy", values: ["preserve public APIs"] },
          { kind: "shared_required_capability", values: ["filesystem"] },
          { kind: "shared_optional_capability", values: ["git"] },
          { kind: "common_parent", values: ["base"] },
          { kind: "shared_provider", values: ["claude"] },
          { kind: "shared_provenance", values: ["claude", "github", "mattpocock/skills"] },
        ],
      },
      {
        ids: ["alpha", "gamma"],
        triggers: [],
        tags: [],
        classification: "complementary",
        evidence: [{ kind: "shared_policy", values: ["preserve public APIs"] }],
      },
      {
        ids: ["beta", "gamma"],
        triggers: [],
        tags: [],
        classification: "complementary",
        evidence: [{ kind: "shared_policy", values: ["preserve public APIs"] }],
      },
    ]);
  });

  it("reports provenance-only overlaps as complementary evidence", () => {
    const importedViaClaude = {
      source: { type: "github" as const, location: "mattpocock/skills", original_id: "typescript-core" },
      imported_via: { importer: "claude" },
    };
    const first = bundle("first", { provenance: importedViaClaude });
    const second = bundle("second", {
      provenance: {
        source: { type: "github", location: "mattpocock/skills", original_id: "safe-editing" },
        imported_via: { importer: "claude" },
      },
    });

    expect(findOverlaps([first, second])).toEqual([
      {
        ids: ["first", "second"],
        triggers: [],
        tags: [],
        classification: "complementary",
        evidence: [{ kind: "shared_provenance", values: ["claude", "github", "mattpocock/skills"] }],
      },
    ]);
  });

  it("reports declared incompatible skills as deduplicated advisory conflicts", () => {
    const first = bundle("first", {
      compatibility: { providers: [], warnings: [], incompatible_with: ["second", "missing"] },
    });
    const second = bundle("second", {
      compatibility: { providers: [], warnings: [], incompatible_with: ["first"] },
    });
    const unrelated = bundle("unrelated");

    expect(findConflicts([unrelated, second, first])).toEqual([
      {
        ids: ["first", "second"],
        reason: "declared incompatible skill",
        classification: "conflicting",
        evidence: [{ kind: "declared_incompatibility", values: ["first", "second"] }],
      },
    ]);
  });

  it("matches the documented overlap/conflict analysis contract fixture", () => {
    const typescriptCore = bundle("typescript-core", {
      tags: ["typescript", "refactor"],
      policies: ["preserve public APIs"],
      capabilities: { required: ["filesystem"], optional: ["git"] },
      compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
      provenance: {
        source: { type: "github", location: "mattpocock/skills", original_id: "typescript-core" },
        imported_via: { importer: "claude" },
      },
      activation: { triggers: ["typescript"], tags: [], weight: 1 },
      extends: ["engineering-core"],
    });
    const typescriptRefactor = bundle("typescript-refactor", {
      tags: ["typescript"],
      policies: ["preserve public APIs"],
      capabilities: { required: ["filesystem"], optional: ["git"] },
      compatibility: { providers: ["codex"], incompatible_with: [], warnings: [] },
      provenance: {
        source: { type: "github", location: "mattpocock/skills", original_id: "typescript-refactor" },
        imported_via: { importer: "claude" },
      },
      activation: { triggers: ["typescript"], tags: [], weight: 1 },
      extends: ["engineering-core", "missing-parent"],
    });
    const safetyReview = bundle("safety-review", {
      policies: ["preserve public APIs"],
      compatibility: { providers: [], warnings: [], incompatible_with: ["typescript-core"] },
    });
    const engineeringCore = bundle("engineering-core");
    const bundles = [typescriptRefactor, safetyReview, engineeringCore, typescriptCore];

    expect({
      overlaps: findOverlaps(bundles),
      conflicts: findConflicts(bundles),
    }).toEqual(contractFixture("overlap-conflict-analysis-contract.json"));
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
      warnings: [
        {
          code: "skill_bundle_invalid",
          severity: "error",
          origin: "registry_rebuild",
          field: "skills/future-kind",
          message: "Unsupported skill kind.",
          provider: "local",
        },
        {
          code: "provider_metadata_preserved",
          severity: "info",
          message: "Provider metadata was preserved.",
        },
      ],
    });

    expect(result).toMatchObject({ dbPath, skills: 1, overlaps: 0, conflicts: 0, warnings: 2 });

    const db = openRegistryDb(dbPath);
    try {
      expect(db.listRegistryWarnings()).toEqual([
        {
          code: "skill_bundle_invalid",
          severity: "error",
          origin: "registry_rebuild",
          field: "skills/future-kind",
          message: "Unsupported skill kind.",
          provider: "local",
        },
        {
          code: "provider_metadata_preserved",
          severity: "info",
          message: "Provider metadata was preserved.",
        },
      ]);

      db.recordRecommendation("engineering-core");
      db.rebuildIndex({
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

      expect(db.listRegistryWarnings()).toEqual([]);
      expect(db.getTelemetry("engineering-core")).toMatchObject({
        skillId: "engineering-core",
        usageCount: 1,
        favorite: true,
      });
    } finally {
      db.close();
    }
  });

  it("preserves disabled telemetry across deterministic registry rebuilds", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "clew-")), "registry.db");
    const db = openRegistryDb(dbPath);
    try {
      db.setSkillDisabled("engineering-core", true);
      const first = await rebuildRegistryIndex({
        dbPath,
        sessionBundles: [bundle("engineering-core"), bundle("typescript-core")],
        includeReferenceSkills: false,
      });
      const second = await rebuildRegistryIndex({
        dbPath,
        sessionBundles: [bundle("engineering-core"), bundle("typescript-core")],
        includeReferenceSkills: false,
      });

      expect(first.entries.map((entry) => [entry.bundle.manifest.id, entry.disabled])).toEqual([
        ["engineering-core", true],
        ["typescript-core", false],
      ]);
      expect(second.entries.map((entry) => [entry.bundle.manifest.id, entry.disabled])).toEqual([
        ["engineering-core", true],
        ["typescript-core", false],
      ]);
      expect(new SkillRegistry(second).list().map((entry) => entry.manifest.id)).toEqual(["typescript-core"]);
    } finally {
      db.close();
    }
  });

  it("resolves duplicate skill ids by registry precedence", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const fakeHome = mkdtempSync(join(tmpdir(), "clew-home-"));
    const projectClewRoot = join(projectRoot, ".clew", "layered-skill");
    const orgRoot = join(fakeHome, ".clew", "orgs", "acme", "layered-skill");
    const globalRoot = join(fakeHome, ".clew", "global", "layered-skill");
    writeFilesystemBundle(projectClewRoot, {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Project Clew Skill",
      instructions: "Use the project .clew skill.",
    });
    writeFilesystemBundle(orgRoot, {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Org Skill",
      instructions: "Use the org skill.",
    });
    writeFilesystemBundle(globalRoot, {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Global Skill",
      instructions: "Use the global skill.",
    });

    const oldHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const snapshot = rebuildRegistry({
        projectRoot,
        org: "acme",
        includeReferenceSkills: false,
        sessionBundles: [
          bundle("layered-skill", { name: "Session Skill" }),
          bundle("alpha-skill", { name: "Alpha Skill" }),
        ],
        telemetry: { disabled: ["layered-skill"], favorites: [], usage: {} },
      });

      expect(snapshot.entries.map((entry) => [entry.bundle.manifest.id, entry.layer, entry.bundle.manifest.name])).toEqual([
        ["alpha-skill", "session", "Alpha Skill"],
        ["layered-skill", "session", "Session Skill"],
      ]);
      expect(snapshot.entries.find((entry) => entry.bundle.manifest.id === "layered-skill")?.disabled).toBe(true);
      expect(snapshot.warnings).toEqual([]);
      const registry = new SkillRegistry(snapshot);
      expect(registry.list().map((candidate) => candidate.manifest.id)).toEqual(["alpha-skill"]);
      expect(registry.lookup("layered-skill")).toBeUndefined();
      expect(registry.search("org")).toEqual([]);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("keeps registry resolution details off public snapshots and registries", () => {
    const snapshot = rebuildRegistry({
      includeReferenceSkills: false,
      sessionBundles: [bundle("layered-skill"), bundle("layered-skill", { name: "Duplicate Session Skill" })],
    });
    const registry = new SkillRegistry(snapshot);

    expect(snapshot).not.toHaveProperty("resolutionDiagnostics");
    expect(registry).not.toHaveProperty("resolutionDiagnostics");
    expect(snapshot.entries.map((entry) => entry.bundle.manifest.id)).toEqual(["layered-skill"]);
    expect(snapshot.warnings).toEqual([]);
  });

  it("keeps registry warnings separate from duplicate resolution", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const validRoot = join(projectRoot, "skills", "valid-skill");
    const invalidRoot = join(projectRoot, "skills", "future-kind");
    writeFilesystemBundle(validRoot, {
      id: "valid-skill",
      kind: "instruction_skill",
      name: "Valid Skill",
      instructions: "Use the valid skill.",
    });
    writeFilesystemBundle(invalidRoot, {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for later.",
    });

    const snapshot = rebuildRegistry({
      projectRoot,
      includeReferenceSkills: true,
      sessionBundles: [bundle("valid-skill", { name: "Session Skill" })],
    });

    expect(snapshot.entries.map((entry) => [entry.bundle.manifest.id, entry.layer, entry.bundle.manifest.name])).toEqual([
      ["valid-skill", "session", "Session Skill"],
    ]);
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        code: "skill_bundle_invalid",
        severity: "error",
        origin: "registry_rebuild",
        field: invalidRoot,
      }),
    ]);
    expect(snapshot).not.toHaveProperty("resolutionDiagnostics");
  });

  it("matches the documented registry resolution contract fixture", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const fakeHome = mkdtempSync(join(tmpdir(), "clew-home-"));
    writeFilesystemBundle(join(projectRoot, ".clew", "layered-skill"), {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Project Skill",
      instructions: "Use the project layer.",
    });
    writeFilesystemBundle(join(fakeHome, ".clew", "orgs", "acme", "layered-skill"), {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Org Skill",
      instructions: "Use the org layer.",
    });
    writeFilesystemBundle(join(fakeHome, ".clew", "global", "layered-skill"), {
      id: "layered-skill",
      kind: "instruction_skill",
      name: "Global Skill",
      instructions: "Use the global layer.",
    });
    writeFilesystemBundle(join(projectRoot, ".clew", "disabled-public"), {
      id: "disabled-public",
      kind: "instruction_skill",
      name: "Disabled Public Skill",
      instructions: "Use the disabled project skill.",
    });
    writeFilesystemBundle(join(projectRoot, ".clew", "alpha-skill"), {
      id: "alpha-skill",
      kind: "instruction_skill",
      name: "Alpha Skill",
      instructions: "Use the alpha project skill.",
    });

    const oldHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const snapshot = rebuildRegistry({
        projectRoot,
        org: "acme",
        includeReferenceSkills: false,
        sessionBundles: [
          bundle("layered-skill", {
            name: "Session Skill",
            tags: ["session"],
            activation: { triggers: ["session"], tags: [], weight: 1 },
          }),
        ],
        telemetry: {
          disabled: ["disabled-public"],
          favorites: ["layered-skill"],
          usage: { "layered-skill": 2 },
          lastUsed: { "layered-skill": "2026-05-18T12:00:00.000Z" },
        },
      });
      const registry = new SkillRegistry(snapshot);
      const engine = new ActivationEngine(registry);
      const contract = {
        precedence: registryPrecedence,
        snapshot: {
          entries: snapshot.entries.map((entry) => ({
            skillId: entry.bundle.manifest.id,
            layer: entry.layer,
            name: entry.bundle.manifest.name,
            disabled: entry.disabled,
            favorite: entry.favorite,
            usageCount: entry.usageCount,
            ...(entry.lastUsed ? { lastUsed: entry.lastUsed } : {}),
          })),
          warnings: snapshot.warnings,
        },
        publicEligibility: {
          list: registry.list().map((candidate) => candidate.manifest.id),
          lookupLayeredSkill: registry.lookup("layered-skill")?.manifest.name,
          lookupDisabledPublic: registry.lookup("disabled-public") ?? null,
          searchDisabled: registry.search("disabled").map((candidate) => candidate.manifest.id),
          analyzeSearchDisabled: registry.analyzeSearch("disabled").matches.map((match) => match.skillId),
          index: registry.analyzeIndex(),
          recommendDisabled: (await engine
            .recommend({ query: "disabled", capabilities: [] }))
            .map((recommendation) => recommendation.skillId),
          explainDisabledPublic: (await engine.explain("disabled-public", { query: "disabled", capabilities: [] })) ?? null,
        },
        publicSurfaces: {
          snapshotHasResolutionDiagnostics: Object.hasOwn(snapshot, "resolutionDiagnostics"),
          registryHasResolutionDiagnostics: Object.hasOwn(registry, "resolutionDiagnostics"),
        },
      };

      expect(contract).toEqual(contractFixture("registry-resolution-contract.json"));
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("opens older SQLite registry databases without registry warning tables", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "clew-")), "registry.db");
    const oldDb = openNodeSqliteDatabase(dbPath);
    oldDb.exec(`
      CREATE TABLE telemetry (
        skill_id TEXT PRIMARY KEY,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO telemetry (skill_id, usage_count, disabled, favorite)
      VALUES ('engineering-core', 3, 1, 0);
    `);
    oldDb.close();

    const db = openRegistryDb(dbPath);
    try {
      expect(db.listRegistryWarnings()).toEqual([]);
      expect(db.getTelemetry("engineering-core")).toMatchObject({
        skillId: "engineering-core",
        usageCount: 3,
        disabled: true,
      });

      const result = db.rebuildIndex({
        entries: [
          {
            bundle: bundle("engineering-core"),
            layer: "project",
            root: "skills",
            disabled: true,
            favorite: false,
          },
        ],
        warnings: [
          {
            code: "skill_bundle_invalid",
            severity: "error",
            origin: "registry_rebuild",
            field: "skills/future-kind",
            message: "Unsupported skill kind.",
          },
        ],
      });

      expect(result.warnings).toBe(1);
      expect(db.listRegistryWarnings()).toEqual([
        {
          code: "skill_bundle_invalid",
          severity: "error",
          origin: "registry_rebuild",
          field: "skills/future-kind",
          message: "Unsupported skill kind.",
        },
      ]);
      expect(db.getTelemetry("engineering-core").usageCount).toBe(3);
    } finally {
      db.close();
    }
  });

  it("records recommendation usage without losing disabled state", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "clew-")), "registry.db");
    const db = openRegistryDb(dbPath);
    try {
      db.setSkillDisabled("debugging-core", true);
      db.recordRecommendation("debugging-core");
      db.recordRecommendation("debugging-core");
      expect(db.getTelemetry("debugging-core")).toMatchObject({
        skillId: "debugging-core",
        usageCount: 2,
        disabled: true,
        favorite: false,
      });
    } finally {
      db.close();
    }
  });

  it("adds conservative telemetry evidence only after normal activation matches", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("plain-skill", { activation: { triggers: ["build"], tags: [], weight: 1 } }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("favorite-skill", { activation: { triggers: ["build"], tags: [], weight: 1 } }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 3,
        },
        {
          bundle: bundle("telemetry-only"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 10,
        },
      ],
      warnings: [],
    });

    const recommendations = await new ActivationEngine(registry).recommend({ query: "build" });

    expect(recommendations.map((recommendation) => [recommendation.skillId, recommendation.score])).toEqual([
      ["favorite-skill", 7],
      ["plain-skill", 5],
    ]);
    expect(recommendations[0]).toMatchObject({
      skillId: "favorite-skill",
      reasons: ['query matched trigger "build"', "favorite skill", "used 3 times previously"],
      signals: [
        { type: "trigger", value: "build" },
        { type: "telemetry_favorite", value: "true" },
        { type: "telemetry_usage", value: "3" },
      ],
    });
    expect(recommendationSchema.parse(recommendations[0])).toEqual(recommendations[0]);
  });

  it("analyzes activation recommendations with included and excluded candidate rows", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
            capabilities: { required: ["terminal"], optional: [] },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 2,
        },
        {
          bundle: bundle("typescript-refactor", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("disabled-skill", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: true,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("unmatched-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
      ],
      warnings: [],
    });

    const analysis = await new ActivationEngine(registry).analyzeRecommendations({
      query: "typescript",
      agentsMd: "# Active Skills\n- typescript-core\n- disabled-skill\n",
      repoSignals: ["typescript"],
      capabilities: [],
    });

    expect(analysis.candidates.map((candidate) => [candidate.skillId, candidate.status, candidate.rank])).toEqual([
      ["typescript-core", "included", 1],
      ["typescript-refactor", "included", 2],
      ["disabled-skill", "excluded", undefined],
      ["unmatched-skill", "excluded", undefined],
    ]);
    expect(analysis.candidates[0]).toMatchObject({
      skillId: "typescript-core",
      enabled: true,
      score: 16,
      components: [
        { kind: "trigger", value: "typescript", points: 5, reason: 'query matched trigger "typescript"' },
        { kind: "tag", value: "typescript", points: 3, reason: 'matched tag "typescript"' },
        { kind: "agents_md", value: "typescript-core", points: 4, reason: "referenced by AGENTS.md active skills" },
        { kind: "repo_signal", value: "typescript", points: 2, reason: 'matched repository signal "typescript"' },
        { kind: "telemetry_favorite", value: "true", points: 1, reason: "favorite skill" },
        { kind: "telemetry_usage", value: "2", points: 1, reason: "used 2 times previously" },
      ],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "capability_missing", origin: "activation" }),
        expect.objectContaining({ code: "activation_overlap", origin: "activation" }),
      ]),
      exclusions: [],
    });
    expect(analysis.candidates[2]).toMatchObject({
      skillId: "disabled-skill",
      enabled: false,
      status: "excluded",
      exclusions: [{ kind: "disabled", reason: "skill is disabled" }],
    });
    expect(analysis.candidates[3]).toMatchObject({
      skillId: "unmatched-skill",
      enabled: true,
      status: "excluded",
      score: 0,
      exclusions: [{ kind: "unmatched", reason: "no activation evidence matched the supplied context" }],
    });
    expect(analysis.recommendations).toEqual(await new ActivationEngine(registry).recommend({
      query: "typescript",
      agentsMd: "# Active Skills\n- typescript-core\n- disabled-skill\n",
      repoSignals: ["typescript"],
      capabilities: [],
    }));
  });

  it("matches the documented activation analysis contract fixture", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
            compatibility: { providers: [], warnings: [], incompatible_with: ["typescript-refactor"] },
            capabilities: { required: ["terminal"], optional: [] },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 2,
        },
        {
          bundle: bundle("typescript-refactor", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("conflicted-skill", {
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
            extends: ["missing-parent"],
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("disabled-skill", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: true,
          favorite: false,
          usageCount: 0,
        },
        {
          bundle: bundle("unmatched-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
          usageCount: 0,
        },
      ],
      warnings: [],
    });

    expect(
      await new ActivationEngine(registry).analyzeRecommendations({
        query: "typescript",
        tags: ["typescript"],
        agentsMd: "# Active Skills\n- typescript-core\n- disabled-skill\n",
        repoSignals: ["typescript"],
        capabilities: [],
      }),
    ).toEqual(contractFixture("activation-analysis-contract.json"));
  });

  it("matches the documented activation and telemetry boundary contract fixture", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("matched-boosted-skill", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 4,
        },
        {
          bundle: bundle("telemetry-only-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: true,
          usageCount: 9,
        },
        {
          bundle: bundle("disabled-matched-skill", {
            tags: ["typescript"],
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: true,
          favorite: true,
          usageCount: 6,
        },
      ],
      warnings: [],
    });
    const engine = new ActivationEngine(registry);
    const context = { query: "typescript", tags: ["typescript"], capabilities: [] };
    const orphanTelemetry = [
      {
        skillId: "orphan-telemetry-skill",
        usageCount: 3,
        lastUsed: "2026-05-18T12:00:00.000Z",
        disabled: false,
        favorite: true,
      },
    ];

    expect(
      JSON.parse(
        JSON.stringify({
          activation: await engine.analyzeRecommendations(context),
          recommend: await engine.recommend(context),
          explainMatched: await engine.explain("matched-boosted-skill", context),
          explainTelemetryOnly: await engine.explain("telemetry-only-skill", context),
          explainDisabledMatched: await engine.explain("disabled-matched-skill", context),
          telemetry: registry.analyzeTelemetry(orphanTelemetry),
          publicReadSurfaces: {
            list: registry.list().map((skill) => skill.manifest.id),
            lookupDisabledMatched: registry.lookup("disabled-matched-skill")?.manifest.id,
            lookupOrphanTelemetry: registry.lookup("orphan-telemetry-skill")?.manifest.id,
            searchTypescript: registry.search("typescript").map((skill) => skill.manifest.id),
            analyzeSearchTypescript: registry.analyzeSearch("typescript").matches.map((match) => match.skillId),
          },
          registryWarnings: registry.warnings,
        }),
      ),
    ).toEqual(contractFixture("activation-telemetry-boundary-contract.json"));
  });

  it("detects repository signals and explains repo heuristic matches", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ devDependencies: { typescript: "latest" } }));
    writeFileSync(join(projectRoot, "tsconfig.json"), "{}");
    writeFileSync(join(projectRoot, "pnpm-lock.yaml"), "");

    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", { tags: ["typescript"], activation: { triggers: ["typescript"], tags: [], weight: 1 } }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const [recommendation] = await new ActivationEngine(registry).recommend({
      query: "update validation",
      repoSignals: detectRepoSignals(projectRoot),
    });

    expect(detectRepoSignals(projectRoot)).toEqual(expect.arrayContaining(["node", "typescript", "pnpm"]));
    expect(recommendation?.reasons).toContain('matched repository signal "typescript"');
    expect(recommendation?.signals).toContainEqual({ type: "repo_signal", value: "typescript" });
  });

  it("recommends active skill ids with AGENTS.md activation provenance", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("safe-editing"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    expect(await new ActivationEngine(registry).recommend({ activeSkillIds: ["safe-editing"] })).toEqual([
      expect.objectContaining({
        skillId: "safe-editing",
        reasons: ["referenced by AGENTS.md active skills"],
        signals: [{ type: "agents_md", value: "safe-editing" }],
      }),
    ]);
  });

  it("activates only parsed AGENTS.md active skills, not raw prose mentions", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("safe-editing"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("debugging-core"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const recommendations = await new ActivationEngine(registry).recommend({
      agentsMd: [
        "# Active Skills",
        "- safe-editing",
        "",
        "Mention debugging-core in prose, but do not activate it.",
      ].join("\n"),
    });

    expect(recommendations.map((recommendation) => recommendation.skillId)).toEqual(["safe-editing"]);
    expect(recommendations[0]?.signals).toEqual([{ type: "agents_md", value: "safe-editing" }]);
  });

  it("does not cross-activate similar AGENTS.md skill ids", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("typescript-core"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    expect(
      (await new ActivationEngine(registry)
        .recommend({ agentsMd: "# Active Skills\n- typescript-core\n" }))
        .map((recommendation) => recommendation.skillId),
    ).toEqual(["typescript-core"]);
  });

  it("deduplicates AGENTS.md activation references from context and parsed content", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("safe-editing"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const [recommendation] = await new ActivationEngine(registry).recommend({
      activeSkillIds: ["safe-editing"],
      agentsMd: "# Active Skills\n- safe-editing\n",
    });

    expect(recommendation?.reasons).toEqual(["referenced by AGENTS.md active skills"]);
    expect(recommendation?.signals).toEqual([{ type: "agents_md", value: "safe-editing" }]);
  });

  it("sorts equal-score recommendations deterministically by skill id", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("beta-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("alpha-skill"),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    expect(
      (await new ActivationEngine(registry)
        .recommend({ activeSkillIds: ["beta-skill", "alpha-skill"] }))
        .map((recommendation) => recommendation.skillId),
    ).toEqual(["alpha-skill", "beta-skill"]);
  });

  it("marks recommendation capability warnings as activation provenance", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("terminal-skill", {
            activation: { triggers: ["build"], tags: [], weight: 1 },
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

    expect((await new ActivationEngine(registry).recommend({ query: "build", capabilities: [] }))[0]?.warnings).toEqual([
      expect.objectContaining({ code: "capability_missing", origin: "activation" }),
    ]);
  });

  it("adds overlap warnings only for overlapping recommended skills", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("safe-refactor", {
            tags: ["refactor"],
            provenance: {
              source: { type: "github", location: "mattpocock/skills", original_id: "safe-refactor" },
              imported_via: { importer: "claude" },
            },
            activation: { triggers: ["refactor"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("incremental-refactor", {
            tags: ["refactor"],
            provenance: {
              source: { type: "github", location: "mattpocock/skills", original_id: "incremental-refactor" },
              imported_via: { importer: "claude" },
            },
            activation: { triggers: ["refactor"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("unrecommended-refactor", {
            tags: ["workflow"],
            activation: { triggers: ["unrelated"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const recommendations = await new ActivationEngine(registry).recommend({ query: "refactor" });

    expect(recommendations.map((recommendation) => recommendation.skillId)).toEqual([
      "incremental-refactor",
      "safe-refactor",
    ]);
    expect(recommendations).toEqual([
      expect.objectContaining({
        skillId: "incremental-refactor",
        warnings: [
          expect.objectContaining({
            code: "activation_overlap",
            origin: "activation",
            field: "incremental-refactor:safe-refactor",
          }),
        ],
      }),
      expect.objectContaining({
        skillId: "safe-refactor",
        warnings: [
          expect.objectContaining({
            code: "activation_overlap",
            origin: "activation",
            field: "incremental-refactor:safe-refactor",
          }),
        ],
      }),
    ]);
    expect(recommendations.flatMap((recommendation) => recommendation.warnings).map((warning) => warning.message)).toEqual([
      'Recommendation has complementary overlap with "safe-refactor" using shared_trigger: refactor; shared_tag: refactor; shared_provenance: claude, github, mattpocock/skills.',
      'Recommendation has complementary overlap with "incremental-refactor" using shared_trigger: refactor; shared_tag: refactor; shared_provenance: claude, github, mattpocock/skills.',
    ]);
  });

  it("adds deterministic conflict warnings to affected recommendations", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", {
            extends: ["missing-parent"],
            compatibility: { providers: [], warnings: [], incompatible_with: ["debugging-core"] },
            activation: { triggers: ["typescript"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("debugging-core", {
            compatibility: { providers: [], warnings: [], incompatible_with: ["typescript-core"] },
            activation: { triggers: ["debug"], tags: [], weight: 1 },
          }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const recommendations = await new ActivationEngine(registry).recommend({
      query: "typescript",
      activeSkillIds: ["debugging-core"],
    });

    expect(recommendations.map((recommendation) => recommendationSchema.parse(recommendation))).toEqual(recommendations);
    expect(recommendations.map((recommendation) => [recommendation.skillId, recommendation.warnings])).toEqual([
      [
        "typescript-core",
        [
          {
            code: "activation_conflict",
            message: 'Recommendation has conflicting relationship with "debugging-core": declared incompatible skill. Evidence: declared_incompatibility: debugging-core, typescript-core.',
            severity: "warning",
            origin: "activation",
            field: "debugging-core:typescript-core",
          },
          {
            code: "activation_conflict",
            message: 'Recommendation has conflicting relationship with "missing-parent": missing parent skill. Evidence: missing_parent: missing-parent.',
            severity: "warning",
            origin: "activation",
            field: "typescript-core:missing-parent",
          },
        ],
      ],
      [
        "debugging-core",
        [
          {
            code: "activation_conflict",
            message: 'Recommendation has conflicting relationship with "typescript-core": declared incompatible skill. Evidence: declared_incompatibility: debugging-core, typescript-core.',
            severity: "warning",
            origin: "activation",
            field: "debugging-core:typescript-core",
          },
        ],
      ],
    ]);
  });

  it("returns schema-valid recommendations from activation", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("typescript-core", {
            tags: ["typescript"],
            activation: { triggers: ["test"], tags: [], weight: 1 },
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

    const recommendations = await new ActivationEngine(registry).recommend({
      query: "test typescript",
      repoSignals: ["typescript"],
      capabilities: [],
    });

    expect(recommendations.map((recommendation) => recommendationSchema.parse(recommendation))).toEqual(recommendations);
  });

  it("warns when AGENTS.md references unknown or disabled skills", () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("safe-editing"),
          layer: "project",
          root: "skills",
          disabled: true,
          favorite: false,
        },
      ],
      warnings: [],
    });

    expect(getAgentsMdDiagnostics("# Active Skills\n- safe-editing\n- missing-skill\n", registry)).toEqual([
      {
        code: "agents_skill_disabled",
        origin: "agents_diagnostic",
        field: "AGENTS.md",
        message: 'AGENTS.md references disabled skill "safe-editing".',
        severity: "warning",
      },
      {
        code: "agents_skill_unknown",
        origin: "agents_diagnostic",
        field: "AGENTS.md",
        message: 'AGENTS.md references unknown skill "missing-skill".',
        severity: "warning",
      },
    ]);
  });

  it("loads filesystem bundles through schema defaults", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillRoot = join(projectRoot, "schema-defaults");
    writeFileSync(join(projectRoot, "placeholder"), "");
    mkdirSync(skillRoot);
    writeFileSync(
      join(skillRoot, "clew.yaml"),
      [
        "id: schema-defaults",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Schema Defaults",
        "instructions:",
        "  file: skill.md",
      ].join("\n"),
    );
    writeFileSync(join(skillRoot, "skill.md"), "Use schema defaults.");

    expect(loadSkillBundle(skillRoot).manifest.activation.weight).toBe(1);
  });

  it("discovers valid filesystem bundles while warning about invalid bundles", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillsRoot = join(projectRoot, "skills");
    const validRoot = join(skillsRoot, "valid-skill");
    const invalidRoot = join(skillsRoot, "future-kind");
    writeFilesystemBundle(validRoot, {
      id: "valid-skill",
      kind: "instruction_skill",
      name: "Valid Skill",
      instructions: "Use the valid skill.",
    });
    writeFilesystemBundle(invalidRoot, {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for later.",
    });

    const discovery = discoverSkillBundles(skillsRoot);

    expect(discovery.bundles.map((candidate) => candidate.manifest.id)).toEqual(["valid-skill"]);
    expect(discovery.warnings).toEqual([
      {
        code: "skill_bundle_invalid",
        severity: "error",
        origin: "registry_rebuild",
        field: invalidRoot,
        message: "manifest.kind [invalid_enum_value]: Invalid enum value. Expected 'instruction_skill', received 'workflow_skill'",
      },
    ]);
  });

  it("matches the documented filesystem discovery warning contract fixture", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillsRoot = join(projectRoot, "skills");
    const alphaRoot = join(skillsRoot, "alpha-skill");
    const futureKindRoot = join(skillsRoot, "future-kind");
    const zetaRoot = join(skillsRoot, "zeta-skill");
    writeFilesystemBundle(zetaRoot, {
      id: "zeta-skill",
      kind: "instruction_skill",
      name: "Zeta Skill",
      instructions: "Use the zeta skill.",
    });
    writeFilesystemBundle(futureKindRoot, {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for a later runtime contract.",
    });
    writeFilesystemBundle(alphaRoot, {
      id: "alpha-skill",
      kind: "instruction_skill",
      name: "Alpha Skill",
      instructions: "Use the alpha skill.",
    });

    const missingRootDiscovery = discoverSkillBundles(join(projectRoot, "missing-skills"));
    const discovery = discoverSkillBundles(skillsRoot);
    const loadedAlpha = loadSkillBundle(alphaRoot);
    const snapshot = rebuildRegistry({ projectRoot, includeReferenceSkills: true });
    const dbPath = join(projectRoot, ".clew-registry.db");
    const indexedSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const db = openRegistryDb(dbPath);
    try {
      const contract = {
        missingRootDiscovery,
        discovery: {
          bundleIds: discovery.bundles.map((candidate) => candidate.manifest.id),
          schemaDefaults: {
            activationWeight: loadedAlpha.manifest.activation.weight,
            tags: loadedAlpha.manifest.tags,
            requiredCapabilities: loadedAlpha.manifest.capabilities.required,
            compatibilityProviders: loadedAlpha.manifest.compatibility.providers,
          },
          warnings: discovery.warnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
        },
        registryRebuild: {
          entries: snapshot.entries.map((entry) => ({
            skillId: entry.bundle.manifest.id,
            layer: entry.layer,
            root: entry.root.slice(projectRoot.length + 1),
            disabled: entry.disabled,
            favorite: entry.favorite,
            usageCount: entry.usageCount,
          })),
          warnings: snapshot.warnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
        },
        sqliteRebuild: {
          snapshotWarnings: indexedSnapshot.warnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
          persistedWarnings: db.listRegistryWarnings().map((warning) => normalizeProjectWarning(warning, projectRoot)),
        },
      };

      expect(contract).toEqual(contractFixture("filesystem-discovery-contract.json"));
    } finally {
      db.close();
    }
  });

  it("matches the documented SQLite registry rebuildability contract fixture", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillsRoot = join(projectRoot, "skills");
    const dbPath = join(projectRoot, ".clew-registry.db");
    writeFilesystemBundle(join(skillsRoot, "alpha-skill"), {
      id: "alpha-skill",
      kind: "instruction_skill",
      name: "Alpha Skill",
      instructions: "Use the shared refactor skill.",
    });
    writeFilesystemBundle(join(skillsRoot, "beta-skill"), {
      id: "beta-skill",
      kind: "instruction_skill",
      name: "Beta Skill",
      instructions: "Use the shared refactor skill.",
    });
    writeFilesystemBundle(join(skillsRoot, "missing-parent-child"), {
      id: "missing-parent-child",
      kind: "instruction_skill",
      name: "Missing Parent Child",
      instructions: "Declares a missing parent for conflict analysis.",
    });
    writeFilesystemBundle(join(skillsRoot, "future-kind"), {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for a later runtime contract.",
    });
    writeFileSync(
      join(skillsRoot, "alpha-skill", "clew.yaml"),
      [
        "id: alpha-skill",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Alpha Skill",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - shared",
        "activation:",
        "  triggers:",
        "    - refactor",
      ].join("\n"),
    );
    writeFileSync(
      join(skillsRoot, "beta-skill", "clew.yaml"),
      [
        "id: beta-skill",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Beta Skill",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - shared",
        "activation:",
        "  triggers:",
        "    - refactor",
      ].join("\n"),
    );
    writeFileSync(
      join(skillsRoot, "missing-parent-child", "clew.yaml"),
      [
        "id: missing-parent-child",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Missing Parent Child",
        "instructions:",
        "  file: skill.md",
        "extends:",
        "  - missing-parent",
      ].join("\n"),
    );

    const firstSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const firstDerivedRows = readSqliteRegistryRows(dbPath, projectRoot);
    const db = openRegistryDb(dbPath);
    try {
      db.setSkillDisabled("alpha-skill", true);
      db.setSkillFavorite("beta-skill", true);
    } finally {
      db.close();
    }
    const telemetryDb = openNodeSqliteDatabase(dbPath);
    telemetryDb.exec(`
      UPDATE telemetry
      SET usage_count = 3, last_used = '2026-05-18T12:00:00.000Z'
      WHERE skill_id = 'alpha-skill';
      UPDATE telemetry
      SET usage_count = 2
      WHERE skill_id = 'beta-skill';
    `);
    telemetryDb.close();

    const secondSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const secondDerivedRows = readSqliteRegistryRows(dbPath, projectRoot);
    const preservedDb = openRegistryDb(dbPath);
    const preservedTelemetry = preservedDb.listTelemetry();
    const preservedWarnings = preservedDb.listRegistryWarnings();
    preservedDb.close();

    unlinkIfExists(dbPath);
    unlinkIfExists(`${dbPath}-wal`);
    unlinkIfExists(`${dbPath}-shm`);

    const deletedDbSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const deletedDbDerivedRows = readSqliteRegistryRows(dbPath, projectRoot);
    const recreatedDb = openRegistryDb(dbPath);
    const recreatedTelemetry = recreatedDb.listTelemetry();
    const recreatedWarnings = recreatedDb.listRegistryWarnings();
    recreatedDb.close();

    const contract = {
      firstRebuild: {
        snapshot: summarizeSnapshot(firstSnapshot, projectRoot),
        derivedRows: firstDerivedRows,
      },
      secondRebuildWithTelemetry: {
        snapshot: summarizeSnapshot(secondSnapshot, projectRoot),
        derivedRows: secondDerivedRows,
        persistedWarnings: preservedWarnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
        telemetry: preservedTelemetry,
      },
      afterDatabaseDeletion: {
        snapshot: summarizeSnapshot(deletedDbSnapshot, projectRoot),
        derivedRows: deletedDbDerivedRows,
        persistedWarnings: recreatedWarnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
        telemetry: recreatedTelemetry,
      },
    };

    expect(contract).toEqual(contractFixture("registry-rebuildability-contract.json"));
  });

  it("matches the documented core telemetry mutation boundary contract fixture", async () => {
    const fixture = contractFixture("telemetry-mutation-boundary-contract.json") as {
      core: {
        sqliteDerivedState: unknown;
        registryRebuildWarnings: unknown;
      };
    };
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillRoot = join(projectRoot, "skills", "typescript-core");
    const dbPath = join(projectRoot, ".clew-registry.db");
    writeFilesystemBundle(skillRoot, {
      id: "typescript-core",
      kind: "instruction_skill",
      name: "TypeScript Core",
      instructions: "Use TypeScript carefully.",
    });
    const manifestPath = join(skillRoot, "clew.yaml");
    const originalManifest = readFileSync(manifestPath, "utf8");

    await rebuildRegistryIndex({ projectRoot, dbPath });
    const db = openRegistryDb(dbPath);
    try {
      db.setSkillDisabled("typescript-core", true);
    } finally {
      db.close();
    }

    const disabledSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const disabledRegistry = new SkillRegistry(disabledSnapshot);
    const disabledAffectsRegistryWhileDbExists = disabledRegistry.list().map((skill) => skill.manifest.id).length === 0;
    const filesystemManifestUnchanged = readFileSync(manifestPath, "utf8") === originalManifest;

    unlinkIfExists(dbPath);
    unlinkIfExists(`${dbPath}-wal`);
    unlinkIfExists(`${dbPath}-shm`);

    const resetSnapshot = await rebuildRegistryIndex({ projectRoot, dbPath });
    const resetRegistry = new SkillRegistry(resetSnapshot);
    const deleteDbClearsDisabledState = resetRegistry.list().map((skill) => skill.manifest.id).includes("typescript-core");

    const warningProjectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const validRoot = join(warningProjectRoot, "skills", "valid-skill");
    const invalidRoot = join(warningProjectRoot, "skills", "future-kind");
    const warningDbPath = join(warningProjectRoot, ".clew-registry.db");
    writeFilesystemBundle(validRoot, {
      id: "valid-skill",
      kind: "instruction_skill",
      name: "Valid Skill",
      instructions: "Use the valid skill.",
    });
    writeFilesystemBundle(invalidRoot, {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for later.",
    });
    await rebuildRegistryIndex({ projectRoot: warningProjectRoot, dbPath: warningDbPath });
    const warningDb = openRegistryDb(warningDbPath);
    const persistedWarningCodes = warningDb.listRegistryWarnings().map((warning) => warning.code);
    warningDb.close();

    expect({
      sqliteDerivedState: {
        disabledAffectsRegistryWhileDbExists,
        deleteDbClearsDisabledState,
        filesystemManifestUnchanged,
      },
      registryRebuildWarnings: {
        requestWarningCodesPersisted: persistedWarningCodes.filter((code) =>
          ["skill_unknown", "skill_disabled", "skill_not_recommended"].includes(code),
        ),
        registryWarningCodesPersisted: persistedWarningCodes,
      },
    }).toEqual(fixture.core);
  });

  it("rebuilds registry indexes with valid bundles and invalid bundle warnings", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const validRoot = join(projectRoot, "skills", "valid-skill");
    const invalidRoot = join(projectRoot, "skills", "future-kind");
    writeFilesystemBundle(validRoot, {
      id: "valid-skill",
      kind: "instruction_skill",
      name: "Valid Skill",
      instructions: "Use the valid skill.",
    });
    writeFilesystemBundle(invalidRoot, {
      id: "future-kind",
      kind: "workflow_skill",
      name: "Future Kind",
      instructions: "Reserved for later.",
    });

    const snapshot = await rebuildRegistryIndex({
      projectRoot,
      dbPath: join(projectRoot, ".clew-registry.db"),
    });

    expect(snapshot.entries.map((entry) => entry.bundle.manifest.id)).toEqual(["valid-skill"]);
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        code: "skill_bundle_invalid",
        severity: "error",
        origin: "registry_rebuild",
        field: invalidRoot,
      }),
    ]);
  });

  it("formats filesystem bundle validation errors through the schema contract", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-"));
    const skillRoot = join(projectRoot, "future-kind");
    mkdirSync(skillRoot);
    writeFileSync(
      join(skillRoot, "clew.yaml"),
      [
        "id: future-kind",
        "version: 1.0.0",
        "kind: workflow_skill",
        "name: Future Kind",
        "instructions:",
        "  file: skill.md",
      ].join("\n"),
    );
    writeFileSync(join(skillRoot, "skill.md"), "Reserved for later.");

    expect(() => loadSkillBundle(skillRoot)).toThrow("manifest.kind [invalid_enum_value]");
  });

  it("performs semantic search and analysis using local database", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-core-semantic-"));
    const dbPath = join(projectRoot, "registry.db");
    
    const validRoot = join(projectRoot, ".clew", "engineering-core");
    writeFilesystemBundle(validRoot, {
      id: "engineering-core",
      kind: "instruction_skill",
      name: "Engineering Core",
      instructions: "Perform rigorous engineering builds, testing, and validations of project code.",
    });

    const snapshot = await rebuildRegistryIndex({
      projectRoot,
      dbPath,
      includeReferenceSkills: false,
    });

    const registry = new SkillRegistry(snapshot);
    const searchResult = await registry.searchSemantic("validation testing");
    expect(searchResult.map((b) => b.manifest.id)).toContain("engineering-core");

    const analysisResult = await registry.analyzeSearchSemantic("validation testing");
    expect(analysisResult.query).toBe("validation testing");
    expect(analysisResult.matches.map((m) => m.skillId)).toContain("engineering-core");
    const match = analysisResult.matches.find((m) => m.skillId === "engineering-core")!;
    expect(match.distance).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeGreaterThan(0);
    expect(match.reasons[0]).toContain("semantic similarity match");
  });

  it("explains why a redundant skill was suppressed", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core"),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("safe-editing", {
            tags: ["editing"],
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 },
            capabilities: { required: ["filesystem", "terminal"], optional: [] },
            extends: ["engineering-core"],
          }),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("specific-safe-editing", {
            tags: ["safety", "editing"],
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 },
            capabilities: { required: ["filesystem", "terminal"], optional: [] },
            extends: ["engineering-core"],
          }),
          layer: "project",
          root: "project-skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    
    // explain the suppressed "safe-editing" skill
    const explanation = await activation.explain("safe-editing", { query: "edit" });
    
    expect(explanation).toBeDefined();
    expect(explanation?.suppression).toMatchObject({
      kind: "redundancy",
      bySkillId: "specific-safe-editing",
      reason: expect.stringContaining("redundant overlap"),
    });
  });
});

function summarizeSnapshot(snapshot: RegistrySnapshot, projectRoot: string): unknown {
  return {
    entries: snapshot.entries.map((entry) => ({
      skillId: entry.bundle.manifest.id,
      layer: entry.layer,
      root: entry.root.slice(projectRoot.length + 1),
      disabled: entry.disabled,
      favorite: entry.favorite,
      usageCount: entry.usageCount,
      ...(entry.lastUsed ? { lastUsed: entry.lastUsed } : {}),
    })),
    warnings: snapshot.warnings.map((warning) => normalizeProjectWarning(warning, projectRoot)),
  };
}

function readSqliteRegistryRows(dbPath: string, projectRoot: string): unknown {
  const db = openNodeSqliteDatabase(dbPath);
  try {
    const skills = db
      .prepare("SELECT id, layer, root, version, name, disabled, favorite FROM skills ORDER BY id")
      .all()
      .map((row) => {
        const skill = row as {
          id: string;
          layer: string;
          root: string;
          version: string;
          name: string;
          disabled: number;
          favorite: number;
        };
        return {
          id: skill.id,
          layer: skill.layer,
          root: skill.root.slice(projectRoot.length + 1),
          version: skill.version,
          name: skill.name,
          disabled: skill.disabled === 1,
          favorite: skill.favorite === 1,
        };
      });
    const overlaps = db
      .prepare("SELECT id, left_skill_id, right_skill_id, triggers_json, tags_json FROM overlaps ORDER BY id")
      .all()
      .map((row) => {
        const overlap = row as {
          id: string;
          left_skill_id: string;
          right_skill_id: string;
          triggers_json: string;
          tags_json: string;
        };
        return {
          id: overlap.id,
          leftSkillId: overlap.left_skill_id,
          rightSkillId: overlap.right_skill_id,
          triggers: JSON.parse(overlap.triggers_json) as unknown,
          tags: JSON.parse(overlap.tags_json) as unknown,
        };
      });
    const conflicts = db
      .prepare("SELECT id, left_skill_id, right_skill_id, reason FROM conflicts ORDER BY id")
      .all()
      .map((row) => {
        const conflict = row as { id: string; left_skill_id: string; right_skill_id: string; reason: string };
        return {
          id: conflict.id,
          leftSkillId: conflict.left_skill_id,
          rightSkillId: conflict.right_skill_id,
          reason: conflict.reason,
        };
      });
    const warnings = db
      .prepare("SELECT position, code, severity, field, message, provider FROM registry_warnings ORDER BY position")
      .all()
      .map((row) => {
        const warning = row as {
          position: number;
          code: string;
          severity: string;
          field: string | null;
          message: string;
          provider: string | null;
        };
        return {
          position: warning.position,
          code: warning.code,
          severity: warning.severity,
          ...(warning.field ? { field: warning.field.slice(projectRoot.length + 1) } : {}),
          message: warning.message,
          ...(warning.provider ? { provider: warning.provider } : {}),
        };
      });
    return { skills, overlaps, conflicts, warnings };
  } finally {
    db.close();
  }
}

function unlinkIfExists(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function openNodeSqliteDatabase(dbPath: string): {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[] };
  close(): void;
} {
  const require = createRequire(import.meta.url);
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): { all(): unknown[] };
      close(): void;
    };
  };
  return new sqlite.DatabaseSync(dbPath);
}

describe("Session DB Initializer", () => {
  it("should initialize session_runs and session_step_states tables correctly", () => {
    const dbPath = ":memory:";
    // Import/use openSessionDatabase from your index.ts
    const db = openSessionDatabase(dbPath);
    
    const runsTable = db.prepare("PRAGMA table_info(session_runs)").all();
    expect(runsTable.length).toBeGreaterThan(0);
    
    const statesTable = db.prepare("PRAGMA table_info(session_step_states)").all();
    expect(statesTable.length).toBeGreaterThan(0);
  });
});

