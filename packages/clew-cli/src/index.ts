#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ActivationEngine,
  findConflicts,
  findOverlaps,
  parseAgentsMd,
  rebuildRegistry,
  rebuildSqliteIndex,
  SkillRegistry,
} from "@clew/core";
import { exportProviderSkill } from "@clew/exporters";
import { importClaudeSkill, importOpenCodeSkill } from "@clew/importers";

type Command = (args: string[]) => void | Promise<void>;

const registry = () => SkillRegistry.fromProject(process.cwd());

const commands: Record<string, Command> = {
  list() {
    printJson(registry().list().map((bundle) => bundle.manifest));
  },
  search(args) {
    printJson(registry().search(args.join(" ")).map((bundle) => bundle.manifest));
  },
  recommend(args) {
    const agentContext = readAgentsContext();
    printJson(
      new ActivationEngine(registry()).recommend({
        query: args.join(" "),
        agentsMd: agentContext.raw,
        activeSkillIds: agentContext.activeSkillIds,
        capabilities: ["filesystem", "terminal", "git", "mcp"],
      }),
    );
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
    stateOnly(args, "enable");
  },
  disable(args) {
    stateOnly(args, "disable");
  },
  overlaps() {
    printJson(findOverlaps(registry().list()));
  },
  conflicts() {
    printJson(findConflicts(registry().list()));
  },
  async telemetry() {
    const snapshot = rebuildRegistry({ projectRoot: process.cwd() });
    printJson(await rebuildSqliteIndex(join(process.cwd(), ".clew-registry.db"), snapshot));
  },
  doctor() {
    const bundles = registry().list();
    printJson({
      skills: bundles.length,
      overlaps: findOverlaps(bundles).length,
      conflicts: findConflicts(bundles),
      warnings: [],
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

function stateOnly(args: string[], action: "enable" | "disable"): void {
  const [skillId] = args;
  if (!skillId) fail(`usage: clew ${action} <skill-id>`);
  printJson({
    skillId,
    action,
    warning: "Persistent enable/disable state belongs in derived telemetry; no filesystem bundle was modified.",
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
