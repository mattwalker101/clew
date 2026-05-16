import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./index.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

function createProject(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), "clew-cli-"));
  const skillRoot = join(projectRoot, "skills", "typescript-core");
  mkdirSync(skillRoot, { recursive: true });
  writeFileSync(
    join(skillRoot, "clew.yaml"),
    [
      "id: typescript-core",
      "version: 1.0.0",
      "kind: instruction_skill",
      "name: TypeScript Core",
      "instructions:",
      "  file: skill.md",
      "tags:",
      "  - typescript",
      "activation:",
      "  triggers:",
      "    - typescript",
    ].join("\n"),
  );
  writeFileSync(join(skillRoot, "skill.md"), "# TypeScript Core\n\nUse TypeScript carefully.\n");
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ devDependencies: { typescript: "latest" } }));
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Active Skills\n- typescript-core\n");
  return projectRoot;
}

function outputAt(log: { mock: { calls: unknown[][] } }, index: number): unknown {
  return JSON.parse(log.mock.calls[index]?.[0] as string);
}

describe("@clew/cli", () => {
  it("prints read command JSON envelopes with warnings arrays", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["list"]);
    await main(["search", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["recommend", "typescript"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["overlaps"]);
    await main(["conflicts"]);

    expect(outputAt(log, 0)).toMatchObject({
      skills: [{ id: "typescript-core" }],
      warnings: [],
    });
    expect(outputAt(log, 1)).toMatchObject({
      query: "typescript",
      skills: [{ id: "typescript-core" }],
      warnings: [],
    });
    expect(outputAt(log, 2)).toMatchObject({
      skillId: "typescript-core",
      bundle: { manifest: { id: "typescript-core" } },
      warnings: [],
    });
    expect(outputAt(log, 3)).toMatchObject({
      query: "typescript",
      recommendations: [{ skillId: "typescript-core" }],
      warnings: [],
    });
    expect(outputAt(log, 4)).toMatchObject({
      skillId: "typescript-core",
      query: "typescript",
      recommendation: { skillId: "typescript-core" },
      warnings: [],
    });
    expect(outputAt(log, 5)).toMatchObject({
      overlaps: [],
      warnings: [],
    });
    expect(outputAt(log, 6)).toMatchObject({
      conflicts: [],
      warnings: [],
    });
  });

  it("returns null and explicit warnings for unavailable lookup skills", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["lookup", "missing-skill"]);
    await main(["disable", "typescript-core"]);
    await main(["lookup", "typescript-core"]);

    expect(outputAt(log, 0)).toMatchObject({
      skillId: "missing-skill",
      bundle: null,
      warnings: [{ code: "skill_unknown" }],
    });
    expect(outputAt(log, 2)).toMatchObject({
      skillId: "typescript-core",
      bundle: null,
      warnings: [{ code: "skill_disabled" }],
    });
  });

  it("returns null and explicit warnings for unavailable explain recommendations", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Active Skills\n");
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({}));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["explain", "missing-skill", "typescript"]);
    await main(["explain", "typescript-core", "unrelated"]);
    await main(["disable", "typescript-core"]);
    await main(["explain", "typescript-core", "typescript"]);

    expect(outputAt(log, 0)).toMatchObject({
      skillId: "missing-skill",
      query: "typescript",
      recommendation: null,
      warnings: [{ code: "skill_unknown" }],
    });
    expect(outputAt(log, 1)).toMatchObject({
      skillId: "typescript-core",
      query: "unrelated",
      recommendation: null,
      warnings: [{ code: "skill_not_recommended" }],
    });
    expect(outputAt(log, 3)).toMatchObject({
      skillId: "typescript-core",
      query: "typescript",
      recommendation: null,
      warnings: [{ code: "skill_disabled" }],
    });
  });

  it("keeps recommend telemetry while returning an envelope", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["telemetry"]);

    expect(outputAt(log, 0)).toMatchObject({
      query: "typescript",
      recommendations: [{ skillId: "typescript-core" }],
      warnings: [],
    });
    expect(outputAt(log, 1)).toMatchObject({
      dbPath: expect.stringContaining(".clew-registry.db"),
      skills: 1,
      warnings: [],
      telemetry: [{ skillId: "typescript-core", usageCount: 1 }],
    });
  });

  it("reports persisted registry rebuild warnings in telemetry output", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const invalidRoot = join(projectRoot, "skills", "future-kind");
    mkdirSync(invalidRoot, { recursive: true });
    writeFileSync(
      join(invalidRoot, "clew.yaml"),
      [
        "id: future-kind",
        "version: 1.0.0",
        "kind: workflow_skill",
        "name: Future Kind",
        "instructions:",
        "  file: skill.md",
      ].join("\n"),
    );
    writeFileSync(join(invalidRoot, "skill.md"), "Reserved for later.");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["telemetry"]);

    expect(outputAt(log, 0)).toMatchObject({
      dbPath: expect.stringContaining(".clew-registry.db"),
      skills: 1,
      telemetry: [{ skillId: "typescript-core", usageCount: 0 }],
      warnings: [
        {
          code: "skill_bundle_invalid",
          severity: "error",
          field: expect.stringContaining("/skills/future-kind"),
        },
      ],
    });
  });

  it("lists lookup in help output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["help"]);

    expect(log.mock.calls[0]?.[0]).toContain("lookup <skill-id>");
  });

  it("persists disabled state and excludes disabled skills from list", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["disable", "typescript-core"]);
    await main(["list"]);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      skillId: "typescript-core",
      disabled: true,
      active: false,
    });
    expect(JSON.parse(log.mock.calls[1]?.[0] as string)).toEqual({ skills: [], warnings: [] });
  });

  it("records recommendation telemetry and reports repo signals", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["telemetry"]);
    await main(["doctor"]);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      query: "typescript",
      recommendations: [
        {
          skillId: "typescript-core",
          signals: expect.arrayContaining(["trigger:typescript", "tag:typescript", "agents-md", "repo:typescript"]),
        },
      ],
      warnings: [],
    });
    expect(JSON.parse(log.mock.calls[1]?.[0] as string).telemetry[0]).toMatchObject({
      skillId: "typescript-core",
      usageCount: 1,
    });
    expect(JSON.parse(log.mock.calls[2]?.[0] as string).repoSignals).toEqual(
      expect.arrayContaining(["node", "typescript"]),
    );
  });

  it("prints scriptable import JSON with compatibility warnings", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(process.cwd(), "claude-skill.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        id: "db-migration",
        name: "Database Migration",
        instructions: "Plan migrations.",
        allowed_tools: ["Bash"],
        risk_level: "high",
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["import", "claude", inputPath]);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      provider: "claude",
      bundles: [{ manifest: { id: "db-migration", extensions: { claude: { risk_level: "high" } } } }],
      warnings: [{ code: "tool_semantics_degraded" }, { code: "provider_metadata_preserved" }],
    });
  });

  it("prints scriptable export JSON with compatibility warnings", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["export", "opencode", "typescript-core"]);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      provider: "opencode",
      artifacts: [{ path: "typescript-core.md" }],
      warnings: [{ code: "target_provider_not_declared" }],
    });
  });

  it("rejects malformed import input before printing JSON", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(process.cwd(), "broken-skill.json");
    writeFileSync(inputPath, JSON.stringify({ id: "broken", instructions: "" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(main(["import", "claude", inputPath])).rejects.toThrow(
      "claude skill must include non-empty instructions or content",
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("lists valid registry bundles and warnings for invalid registry bundles", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const skillRoot = join(projectRoot, "skills", "future-kind");
    mkdirSync(skillRoot, { recursive: true });
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
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["list"]);

    expect(outputAt(log, 0)).toMatchObject({
      skills: [{ id: "typescript-core" }],
      warnings: [
        {
          code: "skill_bundle_invalid",
          severity: "error",
          field: expect.stringContaining("/skills/future-kind"),
        },
      ],
    });
    expect(outputAt(log, 0)).not.toHaveProperty("ok");
  });
});
