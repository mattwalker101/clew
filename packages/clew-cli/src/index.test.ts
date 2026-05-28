import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

function writeInvalidFutureKindBundle(projectRoot: string): void {
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
}

function outputAt(log: { mock: { calls: unknown[][] } }, index: number): unknown {
  return JSON.parse(log.mock.calls[index]?.[0] as string);
}

function createEmptyProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "clew-doctor-"));
  mkdirSync(join(root, "skills"), { recursive: true });
  return root;
}

function doctorBoundaryContractFixture() {
  return JSON.parse(
    readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "doctor-boundary-contract.json"), "utf8"),
  ) as {
    emptyRegistry: {
      skills: number;
      repoSignals: string[];
      overlaps: number;
      conflicts: unknown[];
      registryWarnings: unknown[];
      agentsDiagnostics: unknown[];
      agentsPreferences: string[];
      warnings: unknown[];
    };
    repoSignals: { signals: string[] };
    overlapsPresent: { overlaps: number; conflicts: unknown[] };
    missingParentConflict: {
      overlaps: number;
      conflicts: Array<{ ids: string[]; reason: string; classification: string; evidence: Array<{ kind: string; values: string[] }> }>;
    };
    agentsSkillDisabled: {
      agentsDiagnostics: Array<{ code: string; message: string; severity: string; origin: string; field: string }>;
      warningCodes: string[];
      warningOrigins: string[];
    };
    populatedPreferences: { agentsPreferences: string[] };
    multipleDiagnostics: { agentsDiagnosticCodes: string[]; warningCodes: string[] };
    warningMergeOrder: { warningCodes: string[]; warningOrigins: string[] };
  };
}

function publicEnvelopeContractFixture(): { cli: unknown } {
  return JSON.parse(
    readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "public-envelope-contract.json"), "utf8"),
  ) as { cli: unknown };
}

function telemetryMutationBoundaryFixture(): { cli: unknown } {
  return JSON.parse(
    readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "telemetry-mutation-boundary-contract.json"), "utf8"),
  ) as { cli: unknown };
}

function providerInteropBoundaryFixture(): { cli: unknown } {
  return JSON.parse(
    readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "provider-interop-boundary-contract.json"), "utf8"),
  ) as { cli: unknown };
}

function providerUnsupportedBoundaryFixture(): {
  scope: { supportedProviders: string[]; excludedProviders: string[] };
  cli: {
    unsupportedProviders: { importUsage: string; exportUsage: string; printsJson: boolean };
    malformedInput: { invalidIdError: string; emptyInstructionsError: string; printsJson: boolean };
    failedCommandsDoNotMutate: {
      telemetryRows: Array<{ skillId: string; usageCount: number }>;
      listSkillIds: string[];
      warnings: unknown[];
    };
  };
} {
  return JSON.parse(
    readFileSync(
      join(originalCwd, "tests", "fixtures", "contracts", "provider-unsupported-boundary-contract.json"),
      "utf8",
    ),
  );
}

describe("@clew-ops/cli", () => {
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

  it("supports semantic search CLI execution", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["search", "--semantic", "typescript compiler"]);
    await main(["search", "--semantic", "--explain", "typescript compiler"]);

    const searchOutput = outputAt(log, 0) as { query: string; skills: Array<{ id: string }> };
    expect(searchOutput.query).toBe("typescript compiler");
    expect(searchOutput.skills.map((s) => s.id)).toContain("typescript-core");

    const explainOutput = outputAt(log, 1) as { query: string; analysis: { matches: Array<{ skillId: string; distance: number; score: number; reasons: string[] }> } };
    expect(explainOutput.query).toBe("typescript compiler");
    const match = explainOutput.analysis.matches.find((m) => m.skillId === "typescript-core")!;
    expect(match.distance).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeGreaterThan(0);
    expect(match.reasons[0]).toContain("semantic similarity match");
  });

  it("prints opt-in search analysis without changing default search", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["search", "typescript"]);
    await main(["search", "--explain", "typescript"]);

    expect(outputAt(log, 0)).toEqual({
      query: "typescript",
      skills: [
        expect.objectContaining({
          id: "typescript-core",
        }),
      ],
      warnings: [],
    });
    expect(outputAt(log, 0)).not.toHaveProperty("matches");
    expect(outputAt(log, 1)).toMatchObject({
      query: "typescript",
      analysis: {
        query: "typescript",
        terms: ["typescript"],
        matches: [
          {
            skillId: "typescript-core",
            matchedTerms: ["typescript"],
            evidence: expect.arrayContaining([
              { kind: "identity", values: expect.arrayContaining(["TypeScript Core", "typescript-core"]) },
              { kind: "activation_trigger", values: ["typescript"] },
              { kind: "tag", values: ["typescript"] },
              { kind: "instructions_text", values: ["typescript"] },
            ]),
          },
        ],
      },
      warnings: [],
    });
  });

  it("prints enriched overlap and conflict rows inside stable envelopes", async () => {
    const projectRoot = createProject();
    const baseRoot = join(projectRoot, "skills", "typescript-core");
    writeFileSync(
      join(baseRoot, "clew.yaml"),
      [
        "id: typescript-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Core",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - typescript",
        "compatibility:",
        "  incompatible_with:",
        "    - typescript-refactor",
        "provenance:",
        "  source:",
        "    type: github",
        "    location: mattpocock/skills",
        "    original_id: typescript-core",
        "  imported_via:",
        "    importer: claude",
        "activation:",
        "  triggers:",
        "    - typescript",
      ].join("\n"),
    );
    const pairedRoot = join(projectRoot, "skills", "typescript-refactor");
    mkdirSync(pairedRoot, { recursive: true });
    writeFileSync(
      join(pairedRoot, "clew.yaml"),
      [
        "id: typescript-refactor",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Refactor",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - typescript",
        "provenance:",
        "  source:",
        "    type: github",
        "    location: mattpocock/skills",
        "    original_id: typescript-refactor",
        "  imported_via:",
        "    importer: claude",
        "activation:",
        "  triggers:",
        "    - typescript",
        "extends:",
        "  - missing-parent",
      ].join("\n"),
    );
    writeFileSync(join(pairedRoot, "skill.md"), "# TypeScript Refactor\n\nRefactor TypeScript safely.\n");
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["overlaps"]);
    await main(["conflicts"]);

    const overlapEnvelope = outputAt(log, 0);
    const conflictEnvelope = outputAt(log, 1);

    expect(Object.keys(overlapEnvelope as Record<string, unknown>)).toEqual(["overlaps", "warnings"]);
    expect(Object.keys(conflictEnvelope as Record<string, unknown>)).toEqual(["conflicts", "warnings"]);
    expect(overlapEnvelope).toEqual({
      overlaps: [
        {
          ids: ["typescript-core", "typescript-refactor"],
          triggers: ["typescript"],
          tags: ["typescript"],
          classification: "complementary",
          evidence: [
            { kind: "shared_trigger", values: ["typescript"] },
            { kind: "shared_tag", values: ["typescript"] },
            { kind: "shared_provenance", values: ["claude", "github", "mattpocock/skills"] },
          ],
        },
      ],
      warnings: [],
    });
    expect(conflictEnvelope).toEqual({
      conflicts: [
        {
          ids: ["typescript-core", "typescript-refactor"],
          reason: "declared incompatible skill",
          classification: "conflicting",
          evidence: [{ kind: "declared_incompatibility", values: ["typescript-core", "typescript-refactor"] }],
        },
        {
          ids: ["typescript-refactor", "missing-parent"],
          reason: "missing parent skill",
          classification: "conflicting",
          evidence: [{ kind: "missing_parent", values: ["missing-parent"] }],
        },
      ],
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
      warnings: [{ code: "skill_unknown", origin: "request" }],
    });
    expect(outputAt(log, 2)).toMatchObject({
      skillId: "typescript-core",
      bundle: null,
      warnings: [{ code: "skill_disabled", origin: "request" }],
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
      warnings: [{ code: "skill_unknown", origin: "request" }],
    });
    expect(outputAt(log, 1)).toMatchObject({
      skillId: "typescript-core",
      query: "unrelated",
      recommendation: null,
      warnings: [{ code: "skill_not_recommended", origin: "request" }],
    });
    expect(outputAt(log, 3)).toMatchObject({
      skillId: "typescript-core",
      query: "typescript",
      recommendation: null,
      warnings: [{ code: "skill_disabled", origin: "request" }],
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

  it("prints opt-in recommendation analysis without recording telemetry", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "--explain", "typescript"]);
    await main(["telemetry"]);

    expect(outputAt(log, 0)).toMatchObject({
      query: "typescript",
      analysis: {
        candidates: [
          expect.objectContaining({
            skillId: "typescript-core",
            status: "included",
            components: expect.arrayContaining([
              { kind: "trigger", value: "typescript", points: 5, reason: 'query matched trigger "typescript"' },
              { kind: "agents_md", value: "typescript-core", points: 4, reason: "referenced by AGENTS.md active skills" },
              { kind: "repo_signal", value: "typescript", points: 2, reason: 'matched repository signal "typescript"' },
            ]),
          }),
        ],
      },
      warnings: [],
    });
    expect(outputAt(log, 0)).not.toHaveProperty("recommendations");
    expect(outputAt(log, 1)).toMatchObject({
      telemetry: [{ skillId: "typescript-core", usageCount: 0 }],
    });
  });

  it("reports persisted registry rebuild warnings in telemetry output", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    writeInvalidFutureKindBundle(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["telemetry"]);

    expect(outputAt(log, 0)).toMatchObject({
      dbPath: expect.stringContaining(".clew-registry.db"),
      skills: 1,
      telemetry: [{ skillId: "typescript-core", usageCount: 0 }],
      warnings: [
        {
          code: "skill_bundle_invalid",
          origin: "registry_rebuild",
          severity: "error",
          field: expect.stringContaining("/skills/future-kind"),
        },
      ],
    });
  });

  it("prints opt-in telemetry analysis without changing default telemetry", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["telemetry"]);
    await main(["telemetry", "--explain"]);

    expect(outputAt(log, 1)).toMatchObject({
      dbPath: expect.stringContaining(".clew-registry.db"),
      skills: 1,
      warnings: [],
      telemetry: [{ skillId: "typescript-core", usageCount: 1 }],
    });
    expect(outputAt(log, 1)).not.toHaveProperty("analysis");
    expect(outputAt(log, 2)).toMatchObject({
      dbPath: expect.stringContaining(".clew-registry.db"),
      skills: 1,
      warnings: [],
      analysis: {
        records: [
          {
            skillId: "typescript-core",
            known: true,
            enabled: true,
            usageCount: 1,
            evidence: expect.arrayContaining([{ kind: "usage_count", values: ["1"] }]),
          },
        ],
      },
    });
  });

  it("keeps AGENTS.md diagnostics out of telemetry and categorizes doctor warnings", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    writeInvalidFutureKindBundle(projectRoot);
    writeFileSync(
      join(projectRoot, "AGENTS.md"),
      [
        "# Active Skills",
        "- missing-skill",
        "",
        "## Runtime Preferences",
        "- Prefer local-first deterministic behavior.",
        "- Avoid hidden activation.",
      ].join("\n"),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["telemetry"]);
    await main(["doctor"]);

    expect(outputAt(log, 0)).toMatchObject({
      warnings: [{ code: "skill_bundle_invalid" }],
    });
    expect(outputAt(log, 0)).not.toMatchObject({
      warnings: expect.arrayContaining([expect.objectContaining({ code: "agents_skill_unknown" })]),
    });
    expect(outputAt(log, 1)).toMatchObject({
      registryWarnings: [expect.objectContaining({ code: "skill_bundle_invalid", origin: "registry_rebuild" })],
      agentsDiagnostics: [expect.objectContaining({ code: "agents_skill_unknown", origin: "agents_diagnostic" })],
      agentsPreferences: ["- Prefer local-first deterministic behavior.", "- Avoid hidden activation."],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "skill_bundle_invalid", origin: "registry_rebuild" }),
        expect.objectContaining({ code: "agents_skill_unknown", origin: "agents_diagnostic" }),
      ]),
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
          signals: expect.arrayContaining([
            { type: "trigger", value: "typescript" },
            { type: "tag", value: "typescript" },
            { type: "agents_md", value: "typescript-core" },
            { type: "repo_signal", value: "typescript" },
          ]),
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

  it("prints activation relationship warnings inside recommend analysis and explain recommendations", async () => {
    const projectRoot = createProject();
    const baseRoot = join(projectRoot, "skills", "typescript-core");
    writeFileSync(
      join(baseRoot, "clew.yaml"),
      [
        "id: typescript-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Core",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - typescript",
        "compatibility:",
        "  incompatible_with:",
        "    - typescript-refactor",
        "activation:",
        "  triggers:",
        "    - typescript",
      ].join("\n"),
    );
    const pairedRoot = join(projectRoot, "skills", "typescript-refactor");
    mkdirSync(pairedRoot, { recursive: true });
    writeFileSync(
      join(pairedRoot, "clew.yaml"),
      [
        "id: typescript-refactor",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Refactor",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - typescript",
        "activation:",
        "  triggers:",
        "    - typescript",
      ].join("\n"),
    );
    writeFileSync(join(pairedRoot, "skill.md"), "# TypeScript Refactor\n\nRefactor TypeScript safely.\n");
    process.chdir(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["recommend", "--explain", "typescript"]);

    expect(outputAt(log, 0)).toMatchObject({
      query: "typescript",
      recommendations: expect.arrayContaining([
        expect.objectContaining({
          skillId: "typescript-core",
          warnings: [
            expect.objectContaining({
              code: "activation_overlap",
              origin: "activation",
              message:
                'Recommendation has complementary overlap with "typescript-refactor" using shared_trigger: typescript; shared_tag: typescript.',
            }),
            expect.objectContaining({
              code: "activation_conflict",
              origin: "activation",
              message:
                'Recommendation has conflicting relationship with "typescript-refactor": declared incompatible skill. Evidence: declared_incompatibility: typescript-core, typescript-refactor.',
            }),
          ],
        }),
        expect.objectContaining({
          skillId: "typescript-refactor",
          warnings: [
            expect.objectContaining({ code: "activation_overlap", origin: "activation" }),
            expect.objectContaining({ code: "activation_conflict", origin: "activation" }),
          ],
        }),
      ]),
      warnings: [],
    });
    expect(outputAt(log, 1)).toMatchObject({
      skillId: "typescript-core",
      query: "typescript",
      recommendation: {
        skillId: "typescript-core",
        warnings: [
          expect.objectContaining({ code: "activation_overlap", origin: "activation" }),
          expect.objectContaining({
            code: "activation_conflict",
            origin: "activation",
            message:
              'Recommendation has conflicting relationship with "typescript-refactor": declared incompatible skill. Evidence: declared_incompatibility: typescript-core, typescript-refactor.',
          }),
        ],
      },
      warnings: [],
    });
    expect(outputAt(log, 2)).toMatchObject({
      query: "typescript",
      analysis: {
        recommendations: expect.arrayContaining([
          expect.objectContaining({
            skillId: "typescript-core",
            warnings: expect.arrayContaining([
              expect.objectContaining({ code: "activation_overlap", origin: "activation" }),
              expect.objectContaining({
                code: "activation_conflict",
                origin: "activation",
                message:
                  'Recommendation has conflicting relationship with "typescript-refactor": declared incompatible skill. Evidence: declared_incompatibility: typescript-core, typescript-refactor.',
              }),
            ]),
          }),
        ]),
      },
      warnings: [],
    });
    expect(outputAt(log, 2)).not.toHaveProperty("recommendations");
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
      warnings: [
        { code: "tool_semantics_degraded", origin: "provider_import" },
        { code: "provider_metadata_preserved", origin: "provider_import" },
      ],
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
      warnings: [{ code: "target_provider_not_declared", origin: "provider_export" }],
    });
  });

  it("persists imported skills with --save and maintains round-trip fidelity", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(projectRoot, "claude-skill.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        id: "imported-skill",
        name: "Imported Skill",
        instructions: "Imported instructions.",
        slash_command: "/imported",
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    // 1. Import with --save
    await main(["import", "claude", inputPath, "--save"]);

    // 2. Verify it's in the list
    log.mockClear();
    await main(["list"]);
    const list = JSON.parse(log.mock.calls[0]?.[0] as string) as { skills: Array<{ id: string }> };
    expect(list.skills.map((s) => s.id)).toContain("imported-skill");

    // 3. Export it back and check fidelity
    log.mockClear();
    await main(["export", "claude", "imported-skill"]);
    const exported = JSON.parse(log.mock.calls[0]?.[0] as string) as { artifacts: Array<{ contents: string }> };
    expect(exported.artifacts[0]?.contents).toContain("Slash command: /imported");
    expect(exported.artifacts[0]?.contents).toContain("Imported instructions.");
  });

  it("installs mcp server to Claude desktop config", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const home = join(projectRoot, "home");
    const configPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });

    // 1. Initial install
    vi.stubEnv("HOME", home);
    await main(["mcp", "install"]);
    const first = JSON.parse(readFileSync(configPath, "utf8"));
    expect(first.mcpServers.clew).toMatchObject({
      command: "node",
      args: [expect.stringContaining("dist/index.js"), "mcp", "run"],
    });

    // 2. Preserve existing config
    writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: "test" } } }));
    await main(["mcp", "install"]);
    const second = JSON.parse(readFileSync(configPath, "utf8"));
    expect(second.mcpServers.other).toEqual({ command: "test" });
    expect(second.mcpServers.clew).toBeDefined();
    vi.unstubAllEnvs();
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

  it("matches the provider unsupported boundary scope from the provider interop fixture", () => {
    const unsupported = providerUnsupportedBoundaryFixture();
    const interop = JSON.parse(
      readFileSync(join(originalCwd, "tests", "fixtures", "contracts", "provider-interop-boundary-contract.json"), "utf8"),
    ) as { scope: unknown };

    expect(unsupported.scope).toEqual(interop.scope);
  });

  it("rejects unsupported provider import and export commands before printing JSON", async () => {
    const fixture = providerUnsupportedBoundaryFixture();
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(process.cwd(), "claude-skill.json");
    writeFileSync(inputPath, JSON.stringify({ id: "db-migration", instructions: "Plan migrations." }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    for (const provider of fixture.scope.excludedProviders) {
      await expect(main(["import", provider, inputPath])).rejects.toThrow("process.exit:1");
      await expect(main(["export", provider, "typescript-core"])).rejects.toThrow("process.exit:1");
    }

    expect(log).not.toHaveBeenCalled();
    expect(fixture.cli.unsupportedProviders.printsJson).toBe(false);
    expect(error.mock.calls.map((call) => call[0])).toEqual(
      fixture.scope.excludedProviders.flatMap(() => [
        fixture.cli.unsupportedProviders.importUsage,
        fixture.cli.unsupportedProviders.exportUsage,
      ]),
    );
  });

  it("matches malformed provider input failures without printing JSON", async () => {
    const fixture = providerUnsupportedBoundaryFixture();
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const invalidIdPath = join(process.cwd(), "invalid-id-skill.json");
    const emptyInstructionsPath = join(process.cwd(), "empty-instructions-skill.json");
    writeFileSync(invalidIdPath, JSON.stringify({ id: 123, instructions: "Use the skill." }));
    writeFileSync(emptyInstructionsPath, JSON.stringify({ id: "broken", instructions: "" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(main(["import", "claude", invalidIdPath])).rejects.toThrow(fixture.cli.malformedInput.invalidIdError);
    await expect(main(["import", "claude", emptyInstructionsPath])).rejects.toThrow(
      fixture.cli.malformedInput.emptyInstructionsError,
    );

    expect(log).not.toHaveBeenCalled();
    expect(fixture.cli.malformedInput.printsJson).toBe(false);
  });

  it("does not mutate registry or telemetry state after failed provider commands", async () => {
    const fixture = providerUnsupportedBoundaryFixture();
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(process.cwd(), "claude-skill.json");
    const malformedPath = join(process.cwd(), "malformed-skill.json");
    writeFileSync(inputPath, JSON.stringify({ id: "db-migration", instructions: "Plan migrations." }));
    writeFileSync(malformedPath, JSON.stringify({ id: "broken", instructions: "" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    await expect(main(["import", fixture.scope.excludedProviders[0] ?? "cursor", inputPath])).rejects.toThrow(
      "process.exit:1",
    );
    await expect(main(["export", fixture.scope.excludedProviders[0] ?? "cursor", "typescript-core"])).rejects.toThrow(
      "process.exit:1",
    );
    await expect(main(["import", "claude", malformedPath])).rejects.toThrow(
      fixture.cli.malformedInput.emptyInstructionsError,
    );
    await expect(main(["export", "opencode", "missing-skill"])).rejects.toThrow("process.exit:1");
    expect(log).not.toHaveBeenCalled();

    await main(["telemetry"]);
    await main(["list"]);

    const telemetry = outputAt(log, 0) as {
      telemetry: Array<{ skillId: string; usageCount: number }>;
      warnings: unknown[];
    };
    const list = outputAt(log, 1) as { skills: Array<{ id: string }>; warnings: unknown[] };

    expect({
      telemetryRows: telemetry.telemetry.map((record) => ({
        skillId: record.skillId,
        usageCount: record.usageCount,
      })),
      listSkillIds: list.skills.map((skill) => skill.id),
      warnings: [...telemetry.warnings, ...list.warnings],
    }).toEqual(fixture.cli.failedCommandsDoNotMutate);
  });

  it("matches the provider interop fidelity boundary for import and export commands", async () => {
    const fixture = providerInteropBoundaryFixture();
    const projectRoot = createProject();
    process.chdir(projectRoot);
    const inputPath = join(process.cwd(), "claude-skill.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        id: "db-migration",
        name: "Database Migration",
        instructions: "Plan migrations with rollback steps.",
        allowed_tools: ["Bash"],
        risk_level: "high",
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["import", "claude", inputPath]);
    await main(["export", "opencode", "typescript-core"]);

    const imported = outputAt(log, 0) as {
      provider: string;
      bundles: Array<{ manifest: { id: string; extensions: Record<string, unknown> } }>;
      warnings: Array<{ code: string; origin?: string }>;
    };
    const exported = outputAt(log, 1) as {
      provider: string;
      artifacts: Array<{ path: string }>;
      warnings: Array<{ code: string; origin?: string }>;
    };

    expect({
      importClaudeDegraded: {
        provider: imported.provider,
        bundleIds: imported.bundles.map((bundle) => bundle.manifest.id),
        extensionNamespaceKeys: Object.keys(imported.bundles[0]?.manifest.extensions ?? {}).sort(),
        warningCodes: imported.warnings.map((warning) => warning.code),
        warningOrigins: imported.warnings.map((warning) => warning.origin),
      },
      exportOpenCodeUndeclared: {
        provider: exported.provider,
        artifactPaths: exported.artifacts.map((artifact) => artifact.path),
        warningCodes: exported.warnings.map((warning) => warning.code),
        warningOrigins: exported.warnings.map((warning) => warning.origin),
      },
    }).toEqual(fixture.cli);
  });

  it("lists valid registry bundles and warnings for invalid registry bundles", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    writeInvalidFutureKindBundle(projectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["list"]);

    expect(outputAt(log, 0)).toMatchObject({
      skills: [{ id: "typescript-core" }],
      warnings: [
        {
          code: "skill_bundle_invalid",
          origin: "registry_rebuild",
          severity: "error",
          field: expect.stringContaining("/skills/future-kind"),
        },
      ],
    });
    expect(outputAt(log, 0)).not.toHaveProperty("ok");
  });

  it("matches the documented CLI public envelope contract fixture", async () => {
    const projectRoot = createProject();
    process.chdir(projectRoot);
    writeFileSync(join(projectRoot, "AGENTS.md"), ["# Active Skills", "- missing-skill"].join("\n"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["list"]);
    await main(["search", "typescript"]);
    await main(["search", "--explain", "typescript"]);
    await main(["recommend", "typescript"]);
    await main(["recommend", "--explain", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["overlaps"]);
    await main(["conflicts"]);
    await main(["doctor"]);
    await main(["telemetry"]);
    await main(["telemetry", "--explain"]);
    await main(["disable", "typescript-core"]);
    await main(["list"]);
    await main(["search", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["recommend", "typescript"]);
    await main(["explain", "typescript-core", "typescript"]);

    const list = outputAt(log, 0) as { skills: Array<{ id: string }>; warnings: unknown[] };
    const search = outputAt(log, 1) as { skills: Array<{ id: string }>; warnings: unknown[] };
    const searchExplain = outputAt(log, 2) as { analysis: { matches: Array<{ skillId: string }> }; warnings: unknown[] };
    const recommend = outputAt(log, 3) as { recommendations: Array<{ skillId: string }>; warnings: unknown[] };
    const recommendExplain = outputAt(log, 4) as { analysis: { recommendations: Array<{ skillId: string }> }; warnings: unknown[] };
    const lookup = outputAt(log, 5) as { bundle: { manifest: { id: string } } | null; warnings: unknown[] };
    const explain = outputAt(log, 6) as { recommendation: { skillId: string } | null; warnings: unknown[] };
    const overlaps = outputAt(log, 7) as { overlaps: unknown[]; warnings: unknown[] };
    const conflicts = outputAt(log, 8) as { conflicts: unknown[]; warnings: unknown[] };
    const doctor = outputAt(log, 9) as {
      skills: number;
      registryWarnings: Array<{ code: string }>;
      agentsDiagnostics: Array<{ code: string }>;
      agentsPreferences: string[];
      warnings: Array<{ code: string }>;
    };
    const telemetry = outputAt(log, 10) as { telemetry: Array<{ skillId: string; usageCount: number }>; warnings: unknown[] };
    const telemetryExplain = outputAt(log, 11) as { analysis: { records: Array<{ skillId: string; enabled: boolean }> }; warnings: unknown[] };
    const disabledList = outputAt(log, 13) as { skills: Array<{ id: string }>; warnings: unknown[] };
    const disabledSearch = outputAt(log, 14) as { skills: Array<{ id: string }>; warnings: unknown[] };
    const disabledLookup = outputAt(log, 15) as { bundle: unknown; warnings: Array<{ code: string; origin?: string }> };
    const disabledRecommend = outputAt(log, 16) as { recommendations: Array<{ skillId: string }>; warnings: unknown[] };
    const disabledExplain = outputAt(log, 17) as { recommendation: unknown; warnings: Array<{ code: string; origin?: string }> };

    expect({
      defaultSurfaces: {
        listKeys: Object.keys(list),
        searchKeys: Object.keys(search),
        recommendKeys: Object.keys(recommend),
        lookupKeys: Object.keys(lookup),
        explainKeys: Object.keys(explain),
        overlapsKeys: Object.keys(overlaps),
        conflictsKeys: Object.keys(conflicts),
        doctorKeys: Object.keys(doctor),
        telemetryKeys: Object.keys(telemetry),
      },
      analysisSurfaces: {
        searchExplainKeys: Object.keys(searchExplain),
        recommendExplainKeys: Object.keys(recommendExplain),
        telemetryExplainKeys: Object.keys(telemetryExplain),
      },
      enabledReads: {
        listSkillIds: list.skills.map((skill) => skill.id),
        searchSkillIds: search.skills.map((skill) => skill.id),
        searchAnalysisMatchIds: searchExplain.analysis.matches.map((match) => match.skillId),
        recommendationIds: recommend.recommendations.map((item) => item.skillId),
        recommendationAnalysisIds: recommendExplain.analysis.recommendations.map((item) => item.skillId),
        lookupSkillId: lookup.bundle?.manifest.id,
        explanationSkillId: explain.recommendation?.skillId,
        telemetryRows: telemetry.telemetry.map((record) => ({
          skillId: record.skillId,
          usageCount: record.usageCount,
        })),
        telemetryAnalysisRows: telemetryExplain.analysis.records.map((record) => ({
          skillId: record.skillId,
          enabled: record.enabled,
        })),
      },
      relationshipReads: {
        overlapCount: overlaps.overlaps.length,
        conflictCount: conflicts.conflicts.length,
      },
      doctor: {
        skills: doctor.skills,
        registryWarningCodes: doctor.registryWarnings.map((warning) => warning.code),
        agentsDiagnosticCodes: doctor.agentsDiagnostics.map((warning) => warning.code),
        warningCodes: doctor.warnings.map((warning) => warning.code),
        agentsPreferences: doctor.agentsPreferences,
      },
      disabledReads: {
        listSkillIds: disabledList.skills.map((skill) => skill.id),
        searchSkillIds: disabledSearch.skills.map((skill) => skill.id),
        lookupBundle: disabledLookup.bundle,
        lookupWarningCodes: disabledLookup.warnings.map((warning) => warning.code),
        lookupWarningOrigins: disabledLookup.warnings.map((warning) => warning.origin),
        recommendationIds: disabledRecommend.recommendations.map((item) => item.skillId),
        explainRecommendation: disabledExplain.recommendation,
        explainWarningCodes: disabledExplain.warnings.map((warning) => warning.code),
        explainWarningOrigins: disabledExplain.warnings.map((warning) => warning.origin),
      },
      warnings: {
        list: list.warnings,
        search: search.warnings,
        searchExplain: searchExplain.warnings,
        recommend: recommend.warnings,
        recommendExplain: recommendExplain.warnings,
        lookup: lookup.warnings,
        explain: explain.warnings,
        overlaps: overlaps.warnings,
        conflicts: conflicts.warnings,
        telemetry: telemetry.warnings,
        telemetryExplain: telemetryExplain.warnings,
        disabledList: disabledList.warnings,
        disabledSearch: disabledSearch.warnings,
        disabledRecommend: disabledRecommend.warnings,
      },
    }).toEqual(publicEnvelopeContractFixture().cli);

    await main(["enable", "typescript-core"]);
    writeInvalidFutureKindBundle(projectRoot);
    log.mockClear();

    await main(["list"]);
    await main(["search", "typescript"]);
    await main(["search", "--explain", "typescript"]);
    await main(["recommend", "typescript"]);
    await main(["recommend", "--explain", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["overlaps"]);
    await main(["conflicts"]);
    await main(["doctor"]);
    await main(["telemetry"]);
    await main(["telemetry", "--explain"]);

    const invList = outputAt(log, 0) as { warnings: Array<{ code: string; origin?: string }> };
    const invSearch = outputAt(log, 1) as { warnings: Array<{ code: string; origin?: string }> };
    const invSearchExplain = outputAt(log, 2) as { warnings: Array<{ code: string; origin?: string }> };
    const invRecommend = outputAt(log, 3) as { warnings: Array<{ code: string; origin?: string }> };
    const invRecommendExplain = outputAt(log, 4) as { warnings: Array<{ code: string; origin?: string }> };
    const invLookup = outputAt(log, 5) as { warnings: Array<{ code: string; origin?: string }> };
    const invExplain = outputAt(log, 6) as { warnings: Array<{ code: string; origin?: string }> };
    const invOverlaps = outputAt(log, 7) as { warnings: Array<{ code: string; origin?: string }> };
    const invConflicts = outputAt(log, 8) as { warnings: Array<{ code: string; origin?: string }> };
    const invDoctor = outputAt(log, 9) as {
      registryWarnings: Array<{ code: string; origin?: string }>;
      agentsDiagnostics: Array<{ code: string; origin?: string }>;
      warnings: Array<{ code: string; origin?: string }>;
    };
    const invTelemetry = outputAt(log, 10) as { warnings: Array<{ code: string; origin?: string }> };
    const invTelemetryExplain = outputAt(log, 11) as { warnings: Array<{ code: string; origin?: string }> };

    const invFixture = publicEnvelopeContractFixture() as unknown as {
      invalidBundleWarnings: Record<string, { codes: string[]; origins: string[] }>;
      invalidBundleDoctor: {
        registryWarningCodes: string[];
        registryWarningOrigins: string[];
        agentsDiagnosticCodes: string[];
        warningCodes: string[];
        warningOrigins: string[];
      };
    };

    expect({
      invalidBundleWarnings: {
        list: { codes: invList.warnings.map((w) => w.code), origins: invList.warnings.map((w) => w.origin) },
        search: { codes: invSearch.warnings.map((w) => w.code), origins: invSearch.warnings.map((w) => w.origin) },
        searchExplain: { codes: invSearchExplain.warnings.map((w) => w.code), origins: invSearchExplain.warnings.map((w) => w.origin) },
        recommend: { codes: invRecommend.warnings.map((w) => w.code), origins: invRecommend.warnings.map((w) => w.origin) },
        recommendExplain: { codes: invRecommendExplain.warnings.map((w) => w.code), origins: invRecommendExplain.warnings.map((w) => w.origin) },
        lookup: { codes: invLookup.warnings.map((w) => w.code), origins: invLookup.warnings.map((w) => w.origin) },
        explain: { codes: invExplain.warnings.map((w) => w.code), origins: invExplain.warnings.map((w) => w.origin) },
        overlaps: { codes: invOverlaps.warnings.map((w) => w.code), origins: invOverlaps.warnings.map((w) => w.origin) },
        conflicts: { codes: invConflicts.warnings.map((w) => w.code), origins: invConflicts.warnings.map((w) => w.origin) },
        telemetry: { codes: invTelemetry.warnings.map((w) => w.code), origins: invTelemetry.warnings.map((w) => w.origin) },
        telemetryExplain: { codes: invTelemetryExplain.warnings.map((w) => w.code), origins: invTelemetryExplain.warnings.map((w) => w.origin) },
      },
      invalidBundleDoctor: {
        registryWarningCodes: invDoctor.registryWarnings.map((w) => w.code),
        registryWarningOrigins: invDoctor.registryWarnings.map((w) => w.origin),
        agentsDiagnosticCodes: invDoctor.agentsDiagnostics.map((w) => w.code),
        warningCodes: invDoctor.warnings.map((w) => w.code),
        warningOrigins: invDoctor.warnings.map((w) => w.origin),
      },
    }).toEqual({
      invalidBundleWarnings: invFixture.invalidBundleWarnings,
      invalidBundleDoctor: invFixture.invalidBundleDoctor,
    });
  });

  it("matches the documented CLI telemetry mutation boundary contract fixture", async () => {
    const usageProjectRoot = createProject();
    const unmatchedRoot = join(usageProjectRoot, "skills", "unmatched-skill");
    mkdirSync(unmatchedRoot, { recursive: true });
    writeFileSync(
      join(unmatchedRoot, "clew.yaml"),
      [
        "id: unmatched-skill",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Unmatched Skill",
        "instructions:",
        "  file: skill.md",
        "activation:",
        "  triggers:",
        "    - python",
      ].join("\n"),
    );
    writeFileSync(join(unmatchedRoot, "skill.md"), "# Unmatched Skill\n\nUse Python carefully.\n");
    process.chdir(usageProjectRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["recommend", "typescript"]);
    await main(["telemetry"]);

    const plainRecommend = outputAt(log, 0) as { recommendations: Array<{ skillId: string }> };
    const usageTelemetry = outputAt(log, 1) as {
      telemetry: Array<{ skillId: string; usageCount: number }>;
    };
    const recordedRecommendationIds = plainRecommend.recommendations.map((recommendation) => recommendation.skillId);
    const excludedRecommendationIds = usageTelemetry.telemetry
      .filter((record) => record.usageCount === 0)
      .map((record) => record.skillId);

    process.chdir(createProject());
    log.mockClear();
    await main(["recommend", "--explain", "typescript"]);
    await main(["explain", "typescript-core", "typescript"]);
    await main(["search", "typescript"]);
    await main(["search", "--explain", "typescript"]);
    await main(["lookup", "typescript-core"]);
    await main(["telemetry"]);
    await main(["telemetry", "--explain"]);

    const recommendExplainTelemetry = outputAt(log, 5) as {
      telemetry: Array<{ skillId: string; usageCount: number }>;
    };

    const disableProjectRoot = createProject();
    const manifestPath = join(disableProjectRoot, "skills", "typescript-core", "clew.yaml");
    const originalManifest = readFileSync(manifestPath, "utf8");
    process.chdir(disableProjectRoot);
    log.mockClear();
    await main(["disable", "typescript-core"]);
    await main(["telemetry"]);
    await main(["list"]);
    await main(["enable", "typescript-core"]);
    await main(["list"]);

    const disabledTelemetry = outputAt(log, 1) as {
      telemetry: Array<{ skillId: string; disabled: boolean; usageCount: number }>;
    };
    const disabledTelemetryRow = disabledTelemetry.telemetry.find((record) => record.skillId === "typescript-core");
    const disabledList = outputAt(log, 2) as { skills: Array<{ id: string }> };
    const reenabledList = outputAt(log, 4) as { skills: Array<{ id: string }> };

    const warningProjectRoot = createProject();
    process.chdir(warningProjectRoot);
    writeFileSync(join(warningProjectRoot, "AGENTS.md"), "# Active Skills\n");
    writeFileSync(join(warningProjectRoot, "package.json"), JSON.stringify({}));
    log.mockClear();
    await main(["lookup", "missing-skill"]);
    await main(["explain", "typescript-core", "unrelated"]);
    await main(["disable", "typescript-core"]);
    await main(["lookup", "typescript-core"]);
    await main(["telemetry"]);

    const lookupMissing = outputAt(log, 0) as { warnings: Array<{ code: string }> };
    const explainUnrecommended = outputAt(log, 1) as { warnings: Array<{ code: string }> };
    const lookupDisabled = outputAt(log, 3) as { warnings: Array<{ code: string }> };
    const warningTelemetry = outputAt(log, 4) as { warnings: Array<{ code: string }> };

    expect({
      usageRecording: {
        plainRecommendUsageCount:
          usageTelemetry.telemetry.find((record) => record.skillId === "typescript-core")?.usageCount ?? 0,
        recommendExplainUsageCount:
          recommendExplainTelemetry.telemetry.find((record) => record.skillId === "typescript-core")?.usageCount ?? 0,
        nonMutatingCommandsUsageCount:
          recommendExplainTelemetry.telemetry.find((record) => record.skillId === "typescript-core")?.usageCount ?? 0,
        recordedRecommendationIds,
        excludedRecommendationIds,
      },
      disableEnable: {
        disabledTelemetryRow: disabledTelemetryRow
          ? {
              skillId: disabledTelemetryRow.skillId,
              disabled: disabledTelemetryRow.disabled,
              usageCount: disabledTelemetryRow.usageCount,
            }
          : undefined,
        disabledListSkillIds: disabledList.skills.map((skill) => skill.id),
        reenabledListSkillIds: reenabledList.skills.map((skill) => skill.id),
        filesystemManifestUnchanged: readFileSync(manifestPath, "utf8") === originalManifest,
      },
      requestWarnings: {
        lookupMissingWarningCodes: lookupMissing.warnings.map((warning) => warning.code),
        lookupDisabledWarningCodes: lookupDisabled.warnings.map((warning) => warning.code),
        explainUnrecommendedWarningCodes: explainUnrecommended.warnings.map((warning) => warning.code),
        persistedRegistryWarningCodes: warningTelemetry.warnings.map((warning) => warning.code),
      },
    }).toEqual(telemetryMutationBoundaryFixture().cli);
  });

  it("matches the documented CLI doctor boundary contract fixture", async () => {
    const fixture = doctorBoundaryContractFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    {
      const root = createEmptyProjectRoot();
      process.chdir(root);
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as Record<string, unknown>;
      expect({
        skills: out.skills,
        repoSignals: out.repoSignals,
        overlaps: out.overlaps,
        conflicts: out.conflicts,
        registryWarnings: out.registryWarnings,
        agentsDiagnostics: out.agentsDiagnostics,
        agentsPreferences: out.agentsPreferences,
        warnings: out.warnings,
      }).toEqual(fixture.emptyRegistry);
    }

    {
      const root = createEmptyProjectRoot();
      mkdirSync(join(root, ".git"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { zod: "latest", vitest: "latest" } }));
      process.chdir(root);
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { repoSignals: string[] };
      expect(out.repoSignals).toEqual(fixture.repoSignals.signals);
    }

    {
      const root = createEmptyProjectRoot();
      for (const [id, name] of [["skill-alpha", "Skill Alpha"], ["skill-beta", "Skill Beta"]] as [string, string][]) {
        const skillRoot = join(root, "skills", id);
        mkdirSync(skillRoot, { recursive: true });
        writeFileSync(
          join(skillRoot, "clew.yaml"),
          ["id: " + id, "version: 1.0.0", "kind: instruction_skill", "name: " + name, "instructions:", "  file: skill.md", "activation:", "  triggers:", "    - shared-trigger"].join("\n"),
        );
        writeFileSync(join(skillRoot, "skill.md"), "# " + name + "\n\nContent.\n");
      }
      process.chdir(root);
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { overlaps: number; conflicts: unknown[] };
      expect({ overlaps: out.overlaps, conflicts: out.conflicts }).toEqual(fixture.overlapsPresent);
    }

    {
      const root = createEmptyProjectRoot();
      const skillRoot = join(root, "skills", "child-skill");
      mkdirSync(skillRoot, { recursive: true });
      writeFileSync(
        join(skillRoot, "clew.yaml"),
        ["id: child-skill", "version: 1.0.0", "kind: instruction_skill", "name: Child Skill", "instructions:", "  file: skill.md", "extends:", "  - nonexistent-parent"].join("\n"),
      );
      writeFileSync(join(skillRoot, "skill.md"), "# Child Skill\n\nContent.\n");
      process.chdir(root);
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { overlaps: number; conflicts: unknown[] };
      expect({ overlaps: out.overlaps, conflicts: out.conflicts }).toEqual(fixture.missingParentConflict);
    }

    {
      const root = createProject();
      process.chdir(root);
      await main(["disable", "typescript-core"]);
      writeFileSync(join(root, "AGENTS.md"), "# Active Skills\n- typescript-core\n");
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as {
        agentsDiagnostics: Array<{ code: string; message: string; severity: string; origin: string; field: string }>;
        warnings: Array<{ code: string; origin: string }>;
      };
      expect({
        agentsDiagnostics: out.agentsDiagnostics,
        warningCodes: out.warnings.map((w) => w.code),
        warningOrigins: out.warnings.map((w) => w.origin),
      }).toEqual(fixture.agentsSkillDisabled);
    }

    {
      const root = createProject();
      process.chdir(root);
      writeFileSync(
        join(root, "AGENTS.md"),
        ["# Active Skills", "", "## Runtime Preferences", "- Prefer explicit over implicit.", "- Avoid unnecessary complexity."].join("\n"),
      );
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { agentsPreferences: string[] };
      expect(out.agentsPreferences).toEqual(fixture.populatedPreferences.agentsPreferences);
    }

    {
      const root = createProject();
      process.chdir(root);
      await main(["disable", "typescript-core"]);
      writeFileSync(join(root, "AGENTS.md"), "# Active Skills\n- unknown-skill\n- typescript-core\n");
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { agentsDiagnostics: Array<{ code: string }>; warnings: Array<{ code: string }> };
      expect({
        agentsDiagnosticCodes: out.agentsDiagnostics.map((d) => d.code),
        warningCodes: out.warnings.map((w) => w.code),
      }).toEqual(fixture.multipleDiagnostics);
    }

    {
      const root = createProject();
      process.chdir(root);
      writeInvalidFutureKindBundle(root);
      writeFileSync(join(root, "AGENTS.md"), "# Active Skills\n- missing-skill\n");
      log.mockClear();
      await main(["doctor"]);
      const out = outputAt(log, 0) as { warnings: Array<{ code: string; origin: string }> };
      expect({
        warningCodes: out.warnings.map((w) => w.code),
        warningOrigins: out.warnings.map((w) => w.origin),
      }).toEqual(fixture.warningMergeOrder);
    }
  });

  it("CLI explains why a redundant skill was suppressed", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-cli-suppress-"));
    process.chdir(projectRoot);
    
    // Set up global skills root
    const globalRoot = join(projectRoot, "global-skills");
    mkdirSync(globalRoot, { recursive: true });
    
    // 1. global base skill
    const globalBaseRoot = join(globalRoot, "engineering-core");
    mkdirSync(globalBaseRoot, { recursive: true });
    writeFileSync(
      join(globalBaseRoot, "clew.yaml"),
      [
        "id: engineering-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Engineering Core",
        "instructions:",
        "  file: skill.md",
      ].join("\n"),
    );
    writeFileSync(join(globalBaseRoot, "skill.md"), "Perform rigorous engineering builds.");

    // 2. global redundant skill
    const globalRedundantRoot = join(globalRoot, "safe-editing");
    mkdirSync(globalRedundantRoot, { recursive: true });
    writeFileSync(
      join(globalRedundantRoot, "clew.yaml"),
      [
        "id: safe-editing",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Safe Editing",
        "extends:",
        "  - engineering-core",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - editing",
        "capabilities:",
        "  required:",
        "    - filesystem",
        "    - terminal",
        "activation:",
        "  triggers:",
        "    - edit",
        "  tags:",
        "    - editing",
      ].join("\n"),
    );
    writeFileSync(join(globalRedundantRoot, "skill.md"), "Global safety guidelines.");

    // Mock OS home for global discovery
    const oldHome = process.env.HOME;
    process.env.HOME = projectRoot;
    
    // Copy global skills to mock home path: ~/.clew/global
    const mockGlobalRoot = join(projectRoot, ".clew", "global");
    mkdirSync(mockGlobalRoot, { recursive: true });
    
    mkdirSync(join(mockGlobalRoot, "engineering-core"), { recursive: true });
    writeFileSync(join(mockGlobalRoot, "engineering-core", "clew.yaml"), readFileSync(join(globalBaseRoot, "clew.yaml")));
    writeFileSync(join(mockGlobalRoot, "engineering-core", "skill.md"), readFileSync(join(globalBaseRoot, "skill.md")));

    mkdirSync(join(mockGlobalRoot, "safe-editing"), { recursive: true });
    writeFileSync(join(mockGlobalRoot, "safe-editing", "clew.yaml"), readFileSync(join(globalRedundantRoot, "clew.yaml")));
    writeFileSync(join(mockGlobalRoot, "safe-editing", "skill.md"), readFileSync(join(globalRedundantRoot, "skill.md")));

    // 3. project specific skill under projectRoot/.clew/specific-safe-editing
    const projectSkillsRoot = join(projectRoot, ".clew");
    mkdirSync(join(projectSkillsRoot, "specific-safe-editing"), { recursive: true });
    writeFileSync(
      join(projectSkillsRoot, "specific-safe-editing", "clew.yaml"),
      [
        "id: specific-safe-editing",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Specific Safe Editing",
        "extends:",
        "  - engineering-core",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - safety",
        "  - editing",
        "capabilities:",
        "  required:",
        "    - filesystem",
        "    - terminal",
        "activation:",
        "  triggers:",
        "    - edit",
        "  tags:",
        "    - editing",
      ].join("\n"),
    );
    writeFileSync(join(projectSkillsRoot, "specific-safe-editing", "skill.md"), "Project safety rules.");

    // Write package.json and AGENTS.md in projectRoot
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({}));
    writeFileSync(
      join(projectRoot, "AGENTS.md"),
      [
        "# Active Skills",
        "- specific-safe-editing",
        "- safe-editing",
        "",
        "## Runtime Preferences",
        "- Prefer safety.",
      ].join("\n")
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await main(["explain", "safe-editing", "edit"]);
      const output = outputAt(log, 0) as { skillId: string; recommendation: { suppression: { kind: string; bySkillId: string } } };
      expect(output.skillId).toBe("safe-editing");
      expect(output.recommendation?.suppression).toMatchObject({
        kind: "redundancy",
        bySkillId: "specific-safe-editing",
      });
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("should start a runbook session and display step details", async () => {
    const projectRoot = createProject();
    // Overwrite the skill with steps
    const skillRoot = join(projectRoot, "skills", "typescript-core");
    writeFileSync(
      join(skillRoot, "clew.yaml"),
      [
        "id: typescript-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Core",
        "instructions:",
        "  file: skill.md",
        "tags: []",
        "activation:",
        "  triggers: []",
        "steps:",
        "  - id: step-1",
        "    title: First Step",
        "    instruction: Make a file named test.txt",
        "    gates:",
        "      - type: file",
        "        path: test.txt",
        "        description: Check for test.txt",
      ].join("\n"),
    );

    process.chdir(projectRoot);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["run", "start", "typescript-core"]);

    expect(logSpy).toHaveBeenCalled();
    const allLogs = logSpy.mock.calls.map(c => c.join(" ")).join("\n");
    expect(allLogs).toContain("Started runbook session");
    expect(allLogs).toContain("[Step 1/1]: First Step");
    expect(allLogs).toContain("Instruction: Make a file named test.txt");
    expect(allLogs).toContain("• [file] File path: test.txt (Check for test.txt)");

    logSpy.mockRestore();
  });

  it("should print usage instructions when run without arguments or with invalid subcommand", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    try {
      await main(["run"]);
    } catch (err: any) {
      expect(err.message).toBe("process.exit called");
    }

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toContain("usage: clew run <start|status|verify>");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should show status for active vs no active runbook session", async () => {
    const projectRoot = createProject();
    const skillRoot = join(projectRoot, "skills", "typescript-core");
    writeFileSync(
      join(skillRoot, "clew.yaml"),
      [
        "id: typescript-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Core",
        "instructions:",
        "  file: skill.md",
        "tags: []",
        "activation:",
        "  triggers: []",
        "steps:",
        "  - id: step-1",
        "    title: First Step",
        "    instruction: Make a file named test.txt",
        "    gates:",
        "      - type: file",
        "        path: test.txt",
        "        description: Check for test.txt",
      ].join("\n"),
    );

    process.chdir(projectRoot);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    // 1. Status when no active session
    await main(["run", "status"]);
    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls[0]?.[0]).toContain("No active runbook session found");
    logSpy.mockClear();

    // 2. Start session and check status
    await main(["run", "start", "typescript-core"]);
    logSpy.mockClear();

    await main(["run", "status"]);
    const allLogs = logSpy.mock.calls.map(c => c.join(" ")).join("\n");
    expect(allLogs).toContain("Active Session:");
    expect(allLogs).toContain("[Step 1/1]: First Step");
    expect(allLogs).toContain("Instruction: Make a file named test.txt");
    expect(allLogs).toContain("• [file] test.txt");

    logSpy.mockRestore();
  });

  it("should trigger verify, show failure details, pass validation, and auto-advance or complete", async () => {
    const projectRoot = createProject();
    const skillRoot = join(projectRoot, "skills", "typescript-core");
    writeFileSync(
      join(skillRoot, "clew.yaml"),
      [
        "id: typescript-core",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: TypeScript Core",
        "instructions:",
        "  file: skill.md",
        "tags: []",
        "activation:",
        "  triggers: []",
        "steps:",
        "  - id: step-1",
        "    title: First Step",
        "    instruction: Make a file named test.txt",
        "    gates:",
        "      - type: file",
        "        path: test.txt",
        "        description: Check for test.txt",
      ].join("\n"),
    );

    process.chdir(projectRoot);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    // Start session
    await main(["run", "start", "typescript-core"]);
    logSpy.mockClear();

    // Verify when file test.txt does not exist yet (should fail)
    await main(["run", "verify"]);
    let allLogs = logSpy.mock.calls.map(c => c.join(" ")).join("\n");
    expect(allLogs).toContain("Verifying Step: First Step...");
    expect(allLogs).toContain("Verification failed");
    expect(allLogs).toContain("✖ [file] Check failed");
    logSpy.mockClear();

    // Create file and verify again (should pass and complete)
    writeFileSync(join(projectRoot, "test.txt"), "Done");
    await main(["run", "verify"]);
    allLogs = logSpy.mock.calls.map(c => c.join(" ")).join("\n");
    expect(allLogs).toContain("🎉 Step verified successfully!");
    expect(allLogs).toContain("🏆 Dynamic verification check passed! Runbook successfully completed!");

    logSpy.mockRestore();
  });
});


