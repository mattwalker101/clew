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

type Command = (args: string[]) => void | Promise<void>;

const registryDbPath = () => join(process.cwd(), ".clew-registry.db");

const registry = () => new SkillRegistry(rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() }));

const commands: Record<string, Command> = {
  list() {
    printJson(registry().list().map((bundle) => bundle.manifest));
  },
  search(args) {
    printJson(registry().search(args.join(" ")).map((bundle) => bundle.manifest));
  },
  recommend(args) {
    const agentContext = readAgentsContext();
    const db = openRegistryDb(registryDbPath());
    try {
      const recommendations = new ActivationEngine(registry()).recommend({
        query: args.join(" "),
        agentsMd: agentContext.raw,
        activeSkillIds: agentContext.activeSkillIds,
        repoSignals: detectRepoSignals(process.cwd()),
        capabilities: ["filesystem", "terminal", "git", "mcp"],
      });
      for (const recommendation of recommendations) db.recordRecommendation(recommendation.skillId);
      printJson(recommendations);
    } finally {
      db.close();
    }
  },
  explain(args) {
    const [skillId, ...query] = args;
    if (!skillId) fail("usage: clew explain <skill-id> [query]");
    const agentContext = readAgentsContext();
    printJson(
      new ActivationEngine(registry()).explain(skillId, {
        query: query.join(" "),
        agentsMd: agentContext.raw,
        activeSkillIds: agentContext.activeSkillIds,
        repoSignals: detectRepoSignals(process.cwd()),
        capabilities: ["filesystem", "terminal", "git", "mcp"],
      }) ?? { skillId, score: 0, reasons: ["skill was not recommended for this context"], signals: [], warnings: [] },
    );
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
    printJson(findOverlaps(registry().list()));
  },
  conflicts() {
    printJson(findConflicts(registry().list()));
  },
  async telemetry() {
    const snapshot = rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath() });
    const db = openRegistryDb(registryDbPath());
    try {
      printJson({
        dbPath: registryDbPath(),
        skills: snapshot.entries.length,
        telemetry: db.listTelemetry(),
      });
    } finally {
      db.close();
    }
  },
  doctor() {
    const currentRegistry = registry();
    const bundles = currentRegistry.list();
    const agentsContext = readAgentsContext();
    printJson({
      skills: bundles.length,
      dbPath: registryDbPath(),
      repoSignals: detectRepoSignals(process.cwd()),
      overlaps: findOverlaps(bundles).length,
      conflicts: findConflicts(bundles),
      warnings: getAgentsMdDiagnostics(agentsContext.raw, currentRegistry),
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
  await command(args);
}

function readAgentsContext(): { raw: string; activeSkillIds: string[] } {
  try {
    const raw = readFileSync("AGENTS.md", "utf8");
    return { raw, activeSkillIds: parseAgentsMd(raw).activeSkillIds };
  } catch {
    return { raw: "", activeSkillIds: [] };
  }
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
