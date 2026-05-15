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

describe("@clew/cli", () => {
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
    expect(JSON.parse(log.mock.calls[1]?.[0] as string)).toEqual([]);
  });

  it("records recommendation telemetry and reports repo signals", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["telemetry"]);
    await main(["doctor"]);

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)[0]).toMatchObject({
      skillId: "typescript-core",
      signals: expect.arrayContaining(["trigger:typescript", "tag:typescript", "agents-md", "repo:typescript"]),
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
});
