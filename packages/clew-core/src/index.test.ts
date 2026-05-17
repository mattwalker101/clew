import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivationEngine,
  composeSkill,
  composeSkillWithReport,
  detectRepoSignals,
  discoverSkillBundles,
  findConflicts,
  findOverlaps,
  getAgentsMdDiagnostics,
  loadSkillBundle,
  openRegistryDb,
  parseAgentsMd,
  rebuildRegistry,
  rebuildRegistryIndex,
  rebuildSqliteIndex,
  SkillRegistry,
} from "./index.js";
import { compositionResultSchema, recommendationSchema, type SkillBundle } from "@clew/schema";

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

  it("preserves disabled telemetry across deterministic registry rebuilds", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "clew-")), "registry.db");
    const db = openRegistryDb(dbPath);
    try {
      db.setSkillDisabled("engineering-core", true);
      const first = rebuildRegistryIndex({
        dbPath,
        sessionBundles: [bundle("engineering-core"), bundle("typescript-core")],
        includeReferenceSkills: false,
      });
      const second = rebuildRegistryIndex({
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

  it("detects repository signals and explains repo heuristic matches", () => {
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

    const [recommendation] = new ActivationEngine(registry).recommend({
      query: "update validation",
      repoSignals: detectRepoSignals(projectRoot),
    });

    expect(detectRepoSignals(projectRoot)).toEqual(expect.arrayContaining(["node", "typescript", "pnpm"]));
    expect(recommendation?.reasons).toContain('matched repository signal "typescript"');
    expect(recommendation?.signals).toContainEqual({ type: "repo_signal", value: "typescript" });
  });

  it("marks recommendation capability warnings as activation provenance", () => {
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

    expect(new ActivationEngine(registry).recommend({ query: "build", capabilities: [] })[0]?.warnings).toEqual([
      expect.objectContaining({ code: "capability_missing", origin: "activation" }),
    ]);
  });

  it("returns schema-valid recommendations from activation", () => {
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

    const recommendations = new ActivationEngine(registry).recommend({
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

  it("rebuilds registry indexes with valid bundles and invalid bundle warnings", () => {
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

    const snapshot = rebuildRegistryIndex({
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
});

function openNodeSqliteDatabase(dbPath: string): { exec(sql: string): void; close(): void } {
  const require = createRequire(import.meta.url);
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
  };
  return new sqlite.DatabaseSync(dbPath);
}
