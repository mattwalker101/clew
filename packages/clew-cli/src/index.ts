#!/usr/bin/env node
import { readFileSync } from "node:fs";
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
  rebuildRegistryIndex,
  SkillRegistry,
} from "@clew/core";
import { exportProviderSkill } from "@clew/exporters";
import { importClaudeSkill, importOpenCodeSkill } from "@clew/importers";
import {
  formatValidationIssue,
  SkillBundleValidationError,
  type ActivationContext,
  type CompatibilityWarning,
} from "@clew/schema";

type Command = (args: string[]) => void | Promise<void>;

const registryDbPath = () => join(process.cwd(), ".clew-registry.db");

const registry = () => new SkillRegistry(rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() }));

const commands: Record<string, Command> = {
  list() {
    const current = readRegistry();
    printJsonEnvelope({
      skills: current.registry.list().map((bundle) => bundle.manifest),
      warnings: current.warnings,
    });
  },
  search(args) {
    const explain = args[0] === "--explain";
    const query = queryText(explain ? args.slice(1) : args);
    const current = readRegistry();
    if (explain) {
      printJsonEnvelope({
        query,
        analysis: current.registry.analyzeSearch(query),
        warnings: current.warnings,
      });
      return;
    }
    printJsonEnvelope({
      query,
      skills: current.registry.search(query).map((bundle) => bundle.manifest),
      warnings: current.warnings,
    });
  },
  lookup(args) {
    const [skillId] = args;
    if (!skillId) fail("usage: clew lookup <skill-id>");
    const current = readRegistry();
    const warning = skillStateWarning(current.registry, skillId);
    printJsonEnvelope({
      skillId,
      bundle: warning ? null : current.registry.lookup(skillId) ?? null,
      warnings: warning ? [...current.warnings, warning] : current.warnings,
    });
  },
  recommend(args) {
    const query = queryText(args);
    const current = readRegistry();
    const activationContext = buildActivationContext(query);
    const db = openRegistryDb(registryDbPath());
    try {
      const recommendations = new ActivationEngine(current.registry).recommend(activationContext);
      for (const recommendation of recommendations) db.recordRecommendation(recommendation.skillId);
      printJsonEnvelope({ query, recommendations, warnings: current.warnings });
    } finally {
      db.close();
    }
  },
  explain(args) {
    const [skillId, ...queryArgs] = args;
    if (!skillId) fail("usage: clew explain <skill-id> [query]");
    const query = queryText(queryArgs);
    const current = readRegistry();
    const stateWarning = skillStateWarning(current.registry, skillId);
    if (stateWarning) {
      printJsonEnvelope({
        skillId,
        query,
        recommendation: null,
        warnings: [...current.warnings, stateWarning],
      });
      return;
    }

    const recommendation = new ActivationEngine(current.registry).explain(skillId, buildActivationContext(query)) ?? null;
    printJsonEnvelope({
      skillId,
      query,
      recommendation,
      warnings: recommendation ? current.warnings : [...current.warnings, notRecommendedWarning(skillId)],
    });
  },
  import(args) {
    const [provider, file] = args;
    if ((provider !== "claude" && provider !== "opencode") || !file) fail("usage: clew import <claude|opencode> <json-file>");
    const input = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    printJson(provider === "claude" ? importClaudeSkill(input) : importOpenCodeSkill(input));
  },
  export(args) {
    const [provider, skillId] = args;
    if ((provider !== "claude" && provider !== "opencode") || !skillId) fail("usage: clew export <claude|opencode> <skill-id>");
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
    const current = readRegistry();
    printJsonEnvelope({ overlaps: findOverlaps(current.registry.list()), warnings: current.warnings });
  },
  conflicts() {
    const current = readRegistry();
    printJsonEnvelope({ conflicts: findConflicts(current.registry.list()), warnings: current.warnings });
  },
  async telemetry() {
    const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
    const db = openRegistryDb(registryDbPath());
    try {
      printJson({
        dbPath: registryDbPath(),
        skills: snapshot.entries.length,
        warnings: db.listRegistryWarnings(),
        telemetry: db.listTelemetry(),
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
    printJson({
      skills: bundles.length,
      dbPath: registryDbPath(),
      repoSignals: detectRepoSignals(process.cwd()),
      overlaps: findOverlaps(bundles).length,
      conflicts: findConflicts(bundles),
      registryWarnings,
      agentsDiagnostics,
      warnings: [...registryWarnings, ...agentsDiagnostics],
    });
  },
};

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
        "  explain <skill-id> [query]",
        "  import <claude|opencode> <json-file>",
        "  export <claude|opencode> <skill-id>",
        "  enable <skill-id>",
        "  disable <skill-id>",
        "  overlaps",
        "  conflicts",
        "  telemetry",
        "  doctor",
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
        errors: error.issues,
        formattedErrors: error.issues.map(formatValidationIssue),
        warnings: [],
      });
      return;
    }
    throw error;
  }
}

function readRegistry(): { registry: SkillRegistry; warnings: CompatibilityWarning[] } {
  const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  return { registry: new SkillRegistry(snapshot), warnings: snapshot.warnings };
}

function readAgentsContext(): { raw: string; activeSkillIds: string[] } {
  try {
    const raw = readFileSync("AGENTS.md", "utf8");
    return { raw, activeSkillIds: parseAgentsMd(raw).activeSkillIds };
  } catch {
    return { raw: "", activeSkillIds: [] };
  }
}

function buildActivationContext(query: string): Partial<ActivationContext> {
  const agentContext = readAgentsContext();
  return {
    query,
    agentsMd: agentContext.raw,
    activeSkillIds: agentContext.activeSkillIds,
    repoSignals: detectRepoSignals(process.cwd()),
    capabilities: ["filesystem", "terminal", "git", "mcp"],
  };
}

function queryText(args: string[]): string {
  return args.join(" ");
}

function skillStateWarning(registry: SkillRegistry, skillId: string): CompatibilityWarning | undefined {
  const entry = registry.entries.find((candidate) => candidate.bundle.manifest.id === skillId);
  if (!entry) {
    return {
      code: "skill_unknown",
      message: `Skill "${skillId}" is not registered.`,
      severity: "warning",
      origin: "request",
    };
  }
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

function notRecommendedWarning(skillId: string): CompatibilityWarning {
  return {
    code: "skill_not_recommended",
    message: `Skill "${skillId}" was not recommended for the supplied activation context.`,
    severity: "warning",
    origin: "request",
  };
}

function setDisabledState(args: string[], disabled: boolean): void {
  const [skillId] = args;
  const action = disabled ? "disable" : "enable";
  if (!skillId) fail(`usage: clew ${action} <skill-id>`);
  const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  if (!snapshot.entries.some((entry) => entry.bundle.manifest.id === skillId)) fail(`unknown skill: ${skillId}`);
  const db = openRegistryDb(registryDbPath());
  try {
    db.setSkillDisabled(skillId, disabled);
  } finally {
    db.close();
  }
  const refreshed = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
  printJson({
    skillId,
    disabled,
    active: refreshed.entries.some((entry) => entry.bundle.manifest.id === skillId && !entry.disabled),
  });
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printJsonEnvelope<T extends { warnings: CompatibilityWarning[] }>(value: T): void {
  printJson(value);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
