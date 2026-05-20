#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ActivationEngine,
  detectRepoSignals,
  findConflicts,
  findOverlaps,
  getAgentsMdDiagnostics,
  openRegistryDb,
  parseAgentsMd,
  rebuildRegistry,
  rebuildRegistryIndex,
  SkillRegistry,
  stringifyYaml,
} from "@clew/core";
import { exportProviderSkill } from "@clew/exporters";
import { importClaudeSkill, importOpenCodeSkill } from "@clew/importers";
import { runClewMcpServer } from "@clew/mcp";
import {
  formatValidationIssue,
  SkillBundleValidationError,
  type ActivationContext,
  type CompatibilityWarning,
} from "@clew/schema";

type Command = (args: string[]) => void | Promise<void>;

const commands: Record<string, Command> = {
  list() {
    printJsonEnvelope({
      skills: registry().list().map((b) => b.manifest),
      warnings: registry().warnings,
    });
  },
  search(args) {
    const explain = args.includes("--explain");
    const query = args.filter((arg) => arg !== "--explain").join(" ");
    if (!query) fail("usage: clew search <query> [--explain]");
    if (explain) {
      printJsonEnvelope({
        query,
        analysis: registry().analyzeSearch(query),
        warnings: registry().warnings,
      });
    } else {
      printJsonEnvelope({
        query,
        skills: registry().search(query).map((b) => b.manifest),
        warnings: registry().warnings,
      });
    }
  },
  lookup(args) {
    const [skillId] = args;
    if (!skillId) fail("usage: clew lookup <skill-id>");
    const stateWarning = lookupStateWarning(skillId);
    if (stateWarning) {
      printJsonEnvelope({
        skillId,
        bundle: null,
        warnings: [...registry().warnings, stateWarning],
      });
      return;
    }
    const bundle = registry().lookup(skillId) ?? null;
    printJsonEnvelope({
      skillId,
      bundle,
      warnings: bundle ? registry().warnings : [...registry().warnings, skillUnknownWarning(skillId)],
    });
  },
  recommend(args) {
    const explain = args.includes("--explain");
    const query = args.filter((arg) => arg !== "--explain").join(" ");
    if (!query) fail("usage: clew recommend <query> [--explain]");
    const activation = new ActivationEngine(registry());
    const context = buildActivationContext(query);
    if (explain) {
      printJsonEnvelope({
        query,
        analysis: activation.analyzeRecommendations(context),
        warnings: registry().warnings,
      });
    } else {
      const recommendations = activation.recommend(context);
      const db = openRegistryDb(registryDbPath());
      try {
        for (const rec of recommendations) {
          db.recordRecommendation(rec.skillId);
        }
      } finally {
        db.close();
      }
      printJsonEnvelope({
        query,
        recommendations,
        warnings: registry().warnings,
      });
    }
  },
  explain(args) {
    const [skillId, ...queryArgs] = args;
    const query = queryArgs.join(" ");
    if (!skillId) fail("usage: clew explain <skill-id> [query]");

    const stateWarning = lookupStateWarning(skillId);
    if (stateWarning) {
      printJsonEnvelope({
        skillId,
        query,
        recommendation: null,
        warnings: [...registry().warnings, stateWarning],
      });
      return;
    }

    const recommendation = new ActivationEngine(registry()).explain(skillId, buildActivationContext(query)) ?? null;
    printJsonEnvelope({
      skillId,
      query,
      recommendation,
      warnings: recommendation ? registry().warnings : [...registry().warnings, notRecommendedWarning(skillId)],
    });
  },
  import(args) {
    const save = args.includes("--save");
    const filteredArgs = args.filter((arg) => arg !== "--save");
    const [provider, file] = filteredArgs;
    if ((provider !== "claude" && provider !== "opencode") || !file) {
      fail("usage: clew import <claude|opencode> <json-file> [--save]");
    }
    const input = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const result = provider === "claude" ? importClaudeSkill(input) : importOpenCodeSkill(input);

    if (save) {
      const projectRegistryRoot = join(process.cwd(), ".clew");
      for (const bundle of result.bundles) {
        const skillPath = join(projectRegistryRoot, bundle.manifest.id);
        mkdirSync(skillPath, { recursive: true });
        writeFileSync(join(skillPath, "clew.yaml"), stringifyYaml(bundle.manifest));
        writeFileSync(join(skillPath, "skill.md"), bundle.instructions);
      }
      rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
    }

    printJson(result);
  },
  export(args) {
    const [provider, skillId] = args;
    if ((provider !== "claude" && provider !== "opencode") || !skillId) {
      fail("usage: clew export <claude|opencode> <skill-id>");
    }
    const bundle = registry().lookup(skillId);
    if (!bundle) fail(`unknown skill: ${skillId}`);
    printJson(exportProviderSkill(provider, bundle));
  },
  enable(args) {
    setDisabledState(args, false);
  },
  disable(args) {
    setDisabledState(args, true);
  },
  overlaps() {
    printJsonEnvelope({
      overlaps: findOverlaps(registry().list()),
      warnings: registry().warnings,
    });
  },
  conflicts() {
    printJsonEnvelope({
      conflicts: findConflicts(registry().list()),
      warnings: registry().warnings,
    });
  },
  telemetry(args) {
    const explain = args.includes("--explain");
    const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
    const registry = new SkillRegistry(snapshot);
    const db = openRegistryDb(registryDbPath());
    try {
      const telemetry = db.listTelemetry();
      printJsonEnvelope({
        dbPath: registryDbPath(),
        skills: snapshot.entries.length,
        warnings: db.listRegistryWarnings(),
        ...(explain ? { analysis: registry.analyzeTelemetry(telemetry) } : { telemetry }),
      });
    } finally {
      db.close();
    }
  },
  doctor() {
    const current = readRegistry();
    const bundles = current.registry.list();
    const agentsContext = readAgentsContext();
    const registryWarnings = current.warnings;
    const agentsDiagnostics = getAgentsMdDiagnostics(agentsContext.raw, current.registry);
    printJsonEnvelope({
      skills: bundles.length,
      dbPath: registryDbPath(),
      repoSignals: detectRepoSignals(process.cwd()),
      overlaps: findOverlaps(bundles).length,
      conflicts: findConflicts(bundles),
      registryWarnings,
      agentsDiagnostics,
      agentsPreferences: agentsContext.preferences,
      warnings: [...registryWarnings, ...agentsDiagnostics],
    });
  },
  async mcp(args) {
    const [action] = args;
    if (action === "run" || !action) {
      await runClewMcpServer(process.cwd());
    } else {
      fail("usage: clew mcp [run]");
    }
  },
};

function readRegistry() {
  const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  return { registry: new SkillRegistry(snapshot), warnings: snapshot.warnings };
}

function registry() {
  return readRegistry().registry;
}

function registryDbPath() {
  return join(process.cwd(), ".clew-registry.db");
}

function buildActivationContext(query: string): Partial<ActivationContext> {
  const agents = readAgentsContext();
  return {
    query,
    tags: [],
    agentsMd: agents.raw,
    repoSignals: detectRepoSignals(process.cwd()),
    capabilities: [],
    activeSkillIds: agents.activeSkillIds,
  };
}

function readAgentsContext() {
  const path = join(process.cwd(), "AGENTS.md");
  try {
    const raw = readFileSync(path, "utf8");
    return { raw, ...parseAgentsMd(raw) };
  } catch {
    return { raw: "", activeSkillIds: [], preferences: [] };
  }
}

function setDisabledState(args: string[], disabled: boolean) {
  const [skillId] = args;
  if (!skillId) fail(`usage: clew ${disabled ? "disable" : "enable"} <skill-id>`);
  const db = openRegistryDb(registryDbPath());
  try {
    db.setSkillDisabled(skillId, disabled);
    db.rebuildIndex(rebuildRegistry({ projectRoot: process.cwd(), telemetry: db.getTelemetryState() }));
    printJson({ skillId, active: !disabled, disabled });
  } finally {
    db.close();
  }
}

function lookupStateWarning(skillId: string): CompatibilityWarning | undefined {
  const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  const entry = snapshot.entries.find((e) => e.bundle.manifest.id === skillId);
  if (!entry) return skillUnknownWarning(skillId);
  if (entry.disabled) {
    return {
      code: "skill_disabled",
      message: `Skill "${skillId}" is disabled.`,
      severity: "warning",
      origin: "request",
    };
  }
  return undefined;
}

function skillUnknownWarning(skillId: string): CompatibilityWarning {
  return {
    code: "skill_unknown",
    message: `Skill "${skillId}" is not registered.`,
    severity: "warning",
    origin: "request",
  };
}

function notRecommendedWarning(skillId: string): CompatibilityWarning {
  return {
    code: "skill_not_recommended",
    message: `Skill "${skillId}" was not recommended for the supplied activation context.`,
    severity: "warning",
    origin: "request",
  };
}

function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function printJsonEnvelope(data: Record<string, unknown> & { warnings: CompatibilityWarning[] }) {
  printJson(data);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [name, ...args] = argv;
  if (!name || name === "help" || name === "--help") {
    console.log(
      [
        "clew commands:",
        "  list",
        "  search <query>",
        "  search --explain <query>",
        "  lookup <skill-id>",
        "  recommend <query>",
        "  recommend --explain <query>",
        "  explain <skill-id> [query]",
        "  import <claude|opencode> <json-file> [--save]",
        "  export <claude|opencode> <skill-id>",
        "  enable <skill-id>",
        "  disable <skill-id>",
        "  overlaps",
        "  conflicts",
        "  telemetry",
        "  telemetry --explain",
        "  doctor",
        "  mcp [run]",
      ].join("\n"),
    );
    return;
  }
  const command = commands[name];
  if (!command) fail(`unknown command: ${name}`);
  try {
    await command(args);
  } catch (error) {
    if (error instanceof SkillBundleValidationError) {
      printJson({
        ok: false,
        errors: error.issues.map(formatValidationIssue),
        warnings: [],
      });
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
