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
});
