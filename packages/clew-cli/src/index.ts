#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
} from "@clew-ops/core";
import { exportProviderSkill } from "@clew-ops/exporters";
import { importClaudeSkill, importOpenCodeSkill } from "@clew-ops/importers";
import { runClewMcpServer } from "@clew-ops/mcp";
import {
  formatValidationIssue,
  SkillBundleValidationError,
  type ActivationContext,
  type CompatibilityWarning,
} from "@clew-ops/schema";

type Command = (args: string[]) => void | Promise<void>;

const commands: Record<string, Command> = {
  async list() {
    const current = await readRegistry();
    printJsonEnvelope({
      skills: current.registry.list().map((b) => b.manifest),
      warnings: current.registry.warnings,
    });
  },
  async search(args) {
    const explain = args.includes("--explain");
    const semantic = args.includes("--semantic");
    const query = args.filter((arg) => arg !== "--explain" && arg !== "--semantic").join(" ");
    if (!query) fail("usage: clew search <query> [--explain] [--semantic]");
    const current = await readRegistry();
    if (semantic) {
      if (explain) {
        printJsonEnvelope({
          query,
          analysis: await current.registry.analyzeSearchSemantic(query),
          warnings: current.registry.warnings,
        });
      } else {
        const skills = (await current.registry.searchSemantic(query)).map((b) => b.manifest);
        printJsonEnvelope({
          query,
          skills,
          warnings: current.registry.warnings,
        });
      }
    } else if (explain) {
      printJsonEnvelope({
        query,
        analysis: current.registry.analyzeSearch(query),
        warnings: current.registry.warnings,
      });
    } else {
      printJsonEnvelope({
        query,
        skills: current.registry.search(query).map((b) => b.manifest),
        warnings: current.registry.warnings,
      });
    }
  },
  async lookup(args) {
    const [skillId] = args;
    if (!skillId) fail("usage: clew lookup <skill-id>");
    const stateWarning = await lookupStateWarning(skillId);
    if (stateWarning) {
      printJsonEnvelope({
        skillId,
        bundle: null,
        warnings: [...(await registry()).warnings, stateWarning],
      });
      return;
    }
    const current = await registry();
    const bundle = current.lookup(skillId) ?? null;
    printJsonEnvelope({
      skillId,
      bundle,
      warnings: bundle ? current.warnings : [...current.warnings, skillUnknownWarning(skillId)],
    });
  },
  async recommend(args) {
    const explain = args.includes("--explain");
    const query = args.filter((arg) => arg !== "--explain").join(" ");
    if (!query) fail("usage: clew recommend <query> [--explain]");
    const current = await registry();
    const db = openRegistryDb(registryDbPath());
    const activation = new ActivationEngine(current, db);
    const context = buildActivationContext(query);
    try {
      if (explain) {
        printJsonEnvelope({
          query,
          analysis: await activation.analyzeRecommendations(context),
          warnings: current.warnings,
        });
      } else {
        const recommendations = await activation.recommend(context);
        for (const rec of recommendations) {
          db.recordRecommendation(rec.skillId);
        }
        printJsonEnvelope({
          query,
          recommendations,
          warnings: current.warnings,
        });
      }
    } finally {
      db.close();
    }
    },
    async explain(args) {
    const [skillId, ...queryArgs] = args;
    const query = queryArgs.join(" ");
    if (!skillId) fail("usage: clew explain <skill-id> [query]");

    const stateWarning = await lookupStateWarning(skillId);
    if (stateWarning) {
      printJsonEnvelope({
        skillId,
        query,
        recommendation: null,
        warnings: [...(await registry()).warnings, stateWarning],
      });
      return;
    }

    const current = await registry();
    const db = openRegistryDb(registryDbPath());
    const activation = new ActivationEngine(current, db);
    try {
      const recommendation = (await activation.explain(skillId, buildActivationContext(query))) ?? null;
      printJsonEnvelope({
        skillId,
        query,
        recommendation,
        warnings: recommendation ? current.warnings : [...current.warnings, notRecommendedWarning(skillId)],
      });
    } finally {
      db.close();
    }
    },  async import(args) {
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
      await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
    }

    printJson(result);
  },
  async export(args) {
    const [provider, skillId] = args;
    if ((provider !== "claude" && provider !== "opencode") || !skillId) {
      fail("usage: clew export <claude|opencode> <skill-id>");
    }
    const current = await registry();
    const bundle = current.lookup(skillId);
    if (!bundle) fail(`unknown skill: ${skillId}`);
    printJson(exportProviderSkill(provider, bundle));
  },
  async enable(args) {
    await setDisabledState(args, false);
  },
  async disable(args) {
    await setDisabledState(args, true);
  },
  async overlaps() {
    const current = await registry();
    printJsonEnvelope({
      overlaps: findOverlaps(current.list()),
      warnings: current.warnings,
    });
  },
  async conflicts() {
    const current = await registry();
    printJsonEnvelope({
      conflicts: findConflicts(current.list()),
      warnings: current.warnings,
    });
  },
  async telemetry(args) {
    const explain = args.includes("--explain");
    const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
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
  async doctor() {
    const current = await readRegistry();
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
    } else if (action === "install") {
      const configPath = join(
        homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      );
      const cliPath = join(process.cwd(), "packages", "clew-cli", "dist", "index.js");

      let config: any = { mcpServers: {} };
      try {
        config = JSON.parse(readFileSync(configPath, "utf8"));
      } catch {
        // Use default
      }

      if (!config.mcpServers) config.mcpServers = {};

      config.mcpServers.clew = {
        command: "node",
        args: [cliPath, "mcp", "run"],
        env: {
          NODE_ENV: "production",
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`Successfully installed clew MCP server to ${configPath}`);
    } else {
      fail("usage: clew mcp [run|install]");
    }
  },
};

async function readRegistry() {
  const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  return { registry: new SkillRegistry(snapshot), warnings: snapshot.warnings };
}

async function registry() {
  return (await readRegistry()).registry;
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

async function setDisabledState(args: string[], disabled: boolean) {
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

async function lookupStateWarning(skillId: string): Promise<CompatibilityWarning | undefined> {
  const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
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
        "  search --semantic <query>",
        "  search --semantic --explain <query>",
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
        "  mcp [run|install]",
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
