#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ActivationEngine,
  checkSecuritySettings,
  detectRepoSignals,
  findConflicts,
  findOverlaps,
  getAgentsMdDiagnostics,
  openRegistryDb,
  openSessionDatabase,
  parseAgentsMd,
  rebuildRegistry,
  rebuildRegistryIndex,
  SessionManager,
  SkillRegistry,
  stringifyYaml,
  scanSkillBundle,
  writeAuditEvent,
} from "@clew-ops/core";
import { exportProviderSkill } from "@clew-ops/exporters";
import { importClaudeSkill, importOpenCodeSkill } from "@clew-ops/importers";
import { runClewMcpServer } from "@clew-ops/mcp";
import { startDashboardServer } from "./server.js";
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
    const scan = args.includes("--scan");
    const semantic = args.includes("--semantic");
    const ollama = args.includes("--ollama") || args.includes("--ollama-model");
    const modelIdx = args.indexOf("--ollama-model");
    const ollamaModel = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

    const filteredArgs = args.filter(
      (arg, idx) =>
        arg !== "--save" &&
        arg !== "--scan" &&
        arg !== "--semantic" &&
        arg !== "--ollama" &&
        arg !== "--ollama-model" &&
        (modelIdx === -1 || idx !== modelIdx + 1)
    );
    const [provider, file] = filteredArgs;
    if ((provider !== "claude" && provider !== "opencode") || !file) {
      fail("usage: clew import <claude|opencode> <json-file> [--save]");
    }
    const input = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const result = provider === "claude" ? importClaudeSkill(input) : importOpenCodeSkill(input);

    if (scan) {
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempRoot = mkdtempSync(join(tmpdir(), "clew-import-scan-"));
      let failed = false;
      let scanErrors: string[] = [];
      try {
        for (const bundle of result.bundles) {
          const tempSkillPath = join(tempRoot, bundle.manifest.id);
          mkdirSync(tempSkillPath, { recursive: true });
          writeFileSync(join(tempSkillPath, "clew.yaml"), stringifyYaml(bundle.manifest));
          if (bundle.instructions) {
            writeFileSync(join(tempSkillPath, "skill.md"), bundle.instructions);
          }

          const scanOptions: any = {};
          if (semantic) scanOptions.semantic = true;
          if (ollama) scanOptions.ollama = true;
          if (ollamaModel !== undefined) scanOptions.ollamaModel = ollamaModel;

          const scanResult = await scanSkillBundle(tempSkillPath, scanOptions);
          if (!scanResult.valid) {
            failed = true;
            scanErrors = scanResult.errors;
            break;
          }
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }

      if (failed) {
        console.error("\x1b[31m✖ [clew security] VETO: Skill Scan Safety Failure!\x1b[0m");
        console.error("  -------------------------------------------------------------");
        for (const err of scanErrors) {
          console.error(`  Violation:    ${err}`);
        }
        console.error("  -------------------------------------------------------------");
        console.error("  ⚠️ Validation aborted. Skill package possesses critical risks.");
        logSecurityVeto("Skill Scan Safety Failure", { violations: scanErrors });
        process.exit(1);
      }
    }

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
  async "skill"(args) {
    const [sub, pathArg] = args;
    if (sub !== "scan") {
      fail("usage: clew skill scan [path] [--semantic] [--ollama] [--ollama-model <model>]");
    }
    let targetPath = process.cwd();
    let optionsStartIdx = 1;
    if (pathArg && !pathArg.startsWith("-")) {
      targetPath = pathArg;
      optionsStartIdx = 2;
    }
    const optionsArgs = args.slice(optionsStartIdx);
    const semantic = optionsArgs.includes("--semantic");
    const ollama = optionsArgs.includes("--ollama") || optionsArgs.includes("--ollama-model");
    const modelIdx = optionsArgs.indexOf("--ollama-model");
    const ollamaModel = modelIdx !== -1 ? optionsArgs[modelIdx + 1] : undefined;

    const scanOptions: any = {};
    if (semantic) scanOptions.semantic = true;
    if (ollama) scanOptions.ollama = true;
    if (ollamaModel !== undefined) scanOptions.ollamaModel = ollamaModel;

    const result = await scanSkillBundle(targetPath, scanOptions);
    if (!result.valid) {
      console.error("\x1b[31m✖ [clew security] VETO: Skill Scan Safety Failure!\x1b[0m");
      console.error("  -------------------------------------------------------------");
      for (const err of result.errors) {
        console.error(`  Violation:    ${err}`);
      }
      console.error("  -------------------------------------------------------------");
      console.error("  ⚠️ Validation aborted. Skill package possesses critical risks.");
      logSecurityVeto("Skill Scan Safety Failure", { violations: result.errors });
      process.exit(1);
    }

    if (result.errors.length > 0) {
      console.warn("\x1b[33m⚠️ [clew security] WARNING: Skill scan completed with warnings:\x1b[0m");
      console.warn("  -------------------------------------------------------------");
      for (const err of result.errors) {
        console.warn(`  Warning:      ${err}`);
      }
      console.warn("  -------------------------------------------------------------");
    } else {
      console.log("✔ [clew security] Skill scan completed successfully!");
    }
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
  async dashboard(args) {
    const portArg = args.find((a) => a.startsWith("--port="));
    const port = portArg ? parseInt(portArg.split("=")[1]!, 10) : 7708;
    await startDashboardServer(port);
    await new Promise(() => {});
  },
  async run(args) {
    const [subcommand] = args;
    if (subcommand !== "start" && subcommand !== "status" && subcommand !== "verify") {
      fail("usage: clew run <start|status|verify> [args]");
    }

    if (subcommand === "start") {
      const skillId = args[1];
      if (!skillId) fail("usage: clew run start <skill-id>");
      const db = openSessionDatabase(sessionDbPath());
      try {
        db.prepare("UPDATE session_runs SET status = 'completed' WHERE status = 'active'").run();

        const manager = new SessionManager(db, {
          getSkill: async (id) => {
            const current = await registry();
            const bundle = current.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        });

        const run = await manager.createSession(skillId);
        console.log(`Started runbook session ${run.id} for skill ${skillId}`);

        const currentRegistry = await registry();
        const bundle = currentRegistry.lookup(skillId);
        const steps = bundle?.manifest.steps || [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (!step) continue;
          console.log(`[Step ${i + 1}/${steps.length}]: ${step.title}`);
          console.log(`Instruction: ${step.instruction}`);
          for (const gate of step.gates || []) {
            let gateDetails = "";
            if (gate.type === "file") {
              gateDetails = `File path: ${gate.path}`;
            } else if (gate.type === "grep") {
              gateDetails = `File path: ${gate.path}, Pattern: ${gate.pattern}`;
            } else if (gate.type === "command") {
              gateDetails = `Command: ${gate.command}`;
            }
            const desc = gate.description ? ` (${gate.description})` : "";
            console.log(`• [${gate.type}] ${gateDetails}${desc}`);
          }
        }
      } finally {
        db.close();
      }
    } else if (subcommand === "status") {
      const db = openSessionDatabase(sessionDbPath());
      try {
        const run = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
        if (!run) {
          console.log("No active runbook session found");
          return;
        }

        const manager = new SessionManager(db, {
          getSkill: async (id) => {
            const current = await registry();
            const bundle = current.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        });

        const step = await manager.getCurrentStep(run.id);
        if (!step) {
          console.log("No active step found");
          return;
        }

        const currentRegistry = await registry();
        const bundle = currentRegistry.lookup(run.skill_id);
        const steps = bundle?.manifest.steps || [];
        const stepIndex = steps.findIndex((s) => s.id === step.id);

        console.log(`Active Session: ${run.id}`);
        console.log(`[Step ${stepIndex + 1}/${steps.length}]: ${step.title}`);
        console.log(`Instruction: ${step.instruction}`);

        const stepState = db.prepare("SELECT * FROM session_step_states WHERE session_id = ? AND step_id = ?").get(run.id, step.id) as any;
        const gateResults = stepState?.error_log ? JSON.parse(stepState.error_log) : [];

        for (let i = 0; i < (step.gates || []).length; i++) {
          const gate = step.gates[i];
          let symbol = "•";
          let gateError = "";

          if (stepState?.status === "completed") {
            symbol = "✔";
          } else if (stepState?.status === "failed") {
            const res = gateResults[i];
            if (res) {
              symbol = res.success ? "✔" : "✖";
              if (!res.success && res.error) {
                gateError = ` (Error: ${res.error})`;
              }
            }
          }

          let gateDetails = "";
          if (gate.type === "file" || gate.type === "grep") {
            gateDetails = gate.path;
          } else if (gate.type === "command") {
            gateDetails = gate.command;
          }

          console.log(`${symbol} [${gate.type}] ${gateDetails}${gateError}`);
        }
      } finally {
        db.close();
      }
    } else if (subcommand === "verify") {
      const skipConfirm = args.includes("--yes") || args.includes("--force");
      const db = openSessionDatabase(sessionDbPath());
      try {
        const run = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
        if (!run) {
          console.log("No active runbook session found");
          return;
        }

        const manager = new SessionManager(db, {
          getSkill: async (id) => {
            const current = await registry();
            const bundle = current.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        }, {
          confirmCommand: async (command, description) => {
            if (skipConfirm) return true;
            const rl = createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            try {
              const desc = description ? ` (${description})` : "";
              const answer = await rl.question(`⚠️  Verification gate requests executing shell command:\n   > ${command}${desc}\nConfirm execution? (y/N): `);
              return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
            } finally {
              rl.close();
            }
          }
        });

        const step = await manager.getCurrentStep(run.id);
        if (!step) {
          console.log("Runbook is already fully completed!");
          return;
        }

        console.log(`Verifying Step: ${step.title}...`);

        const result = await manager.verifyCurrentStep(run.id);
        if (result.success) {
          console.log("🎉 Step verified successfully!");
          const nextStep = await manager.getCurrentStep(run.id);
          if (nextStep) {
            const currentRegistry = await registry();
            const bundle = currentRegistry.lookup(run.skill_id);
            const steps = bundle?.manifest.steps || [];
            const stepIndex = steps.findIndex((s) => s.id === nextStep.id);

            console.log(`[Step ${stepIndex + 1}/${steps.length}]: ${nextStep.title}`);
            console.log(`Instruction: ${nextStep.instruction}`);
            for (const gate of nextStep.gates || []) {
              let gateDetails = "";
              if (gate.type === "file") {
                gateDetails = `File path: ${gate.path}`;
              } else if (gate.type === "grep") {
                gateDetails = `File path: ${gate.path}, Pattern: ${gate.pattern}`;
              } else if (gate.type === "command") {
                gateDetails = `Command: ${gate.command}`;
              }
              const desc = gate.description ? ` (${gate.description})` : "";
              console.log(`• [${gate.type}] ${gateDetails}${desc}`);
            }
          } else {
            console.log("🏆 Dynamic verification check passed! Runbook successfully completed!");
          }
        } else {
          console.log("❌ Verification failed.");
          for (const res of result.gates) {
            if (!res) continue;
            const symbol = res.success ? "✔" : "✖";
            console.log(`${symbol} [${res.type}] ${res.success ? "Check passed" : "Check failed"}`);
            if (!res.success && res.error) {
              console.log(`  ↳ Error: ${res.error}`);
            }
          }
          console.log("⚠️ Please resolve the gates above and run 'clew run verify' again.");
        }
      } finally {
        db.close();
      }
    }

  },
  async "check-security"(args) {
    const cached = args.includes("--cached");
    const repoRoot = findRepoRoot() || process.cwd();
    const result = await checkSecuritySettings(repoRoot, { cached });
    if (!result.valid) {
      console.error("\x1b[31m✖ [clew security] VETO: Security configuration degraded!\x1b[0m");
      console.error("  -------------------------------------------------------------");
      for (const err of result.errors) {
        console.error(`  Violation:    ${err}`);
      }
      console.error("\n  Rationale:    Deactivating AST-based security rules is prohibited by the");
      console.error("                project's security constitution.");
      console.error("  -------------------------------------------------------------");
      console.error("  ⚠️ Commit aborted. Please restore the security rules and try again.");
      logSecurityVeto("Security configuration degraded", { violations: result.errors });
      process.exit(1);
    }
    console.log("✔ [clew security] Constitution review passed successfully!");
  },
  async security(args) {
    const [subcommand] = args;
    if (subcommand !== "install") {
      fail("usage: clew security install");
    }
    
    const hookDir = findHooksDir();
    if (!hookDir) {
      fail("❌ Not a git repository.");
    }
    
    if (!existsSync(hookDir)) {
      mkdirSync(hookDir, { recursive: true });
    }
    
    const hookPath = join(hookDir, "pre-commit");
    const clewHookLine = "node packages/clew-cli/dist/index.js check-security --cached || exit 1";
    const hookContent = `#!/bin/sh\n# clew constitutional security gate\n${clewHookLine}\n`;
    
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf-8");
      if (existing.includes("check-security")) {
        console.log("🎉 Constitutional pre-commit hook is already installed!");
        return;
      }
      
      // Backup the old hook
      writeFileSync(`${hookPath}.bak`, existing);
      
      let updated = existing;
      const shebangRegex = /^#!.*(?:\r?\n|$)/;
      if (shebangRegex.test(existing)) {
        updated = existing.replace(shebangRegex, (match) => {
          const newline = match.endsWith("\n") ? "" : "\n";
          return `${match}${newline}\n# clew constitutional security gate\n${clewHookLine}\n`;
        });
      } else {
        updated = `#!/bin/sh\n\n# clew constitutional security gate\n${clewHookLine}\n\n${existing}`;
      }
      writeFileSync(hookPath, updated, { mode: 0o755 });
      console.log("🎉 Successfully appended clew security gate to existing pre-commit hook (backed up original to pre-commit.bak)!");
    } else {
      writeFileSync(hookPath, hookContent, { mode: 0o755 });
      console.log("🎉 Successfully installed constitutional pre-commit hook!");
    }
  },
};

function findRepoRoot(): string {
  try {
    const { execSync } = createRequire(import.meta.url)("node:child_process");
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Fallback recursive parent search
    let current = process.cwd();
    while (current !== join(current, "..")) {
      const testDir = join(current, ".git");
      if (existsSync(testDir)) {
        return current;
      }
      current = join(current, "..");
    }
  }
  return "";
}

function findHooksDir(): string {
  try {
    const { execSync } = createRequire(import.meta.url)("node:child_process");
    const hooksPath = execSync("git rev-parse --git-path hooks", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return join(process.cwd(), hooksPath);
  } catch {
    // Fallback recursive parent search
    let current = process.cwd();
    while (current !== join(current, "..")) {
      const testDir = join(current, ".git");
      if (existsSync(testDir) && statSync(testDir).isDirectory()) {
        return join(testDir, "hooks");
      }
      current = join(current, "..");
    }
  }
  return "";
}

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

function sessionDbPath() {
  return join(process.cwd(), ".clew-session.db");
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

let currentCommandLine = "";

function logSecurityVeto(reason: string, details?: any) {
  writeAuditEvent({
    eventType: "veto",
    actor: "human",
    context: {
      cwd: process.cwd(),
      activeSkills: readAgentsContext().activeSkillIds
    },
    payload: {
      commandLine: currentCommandLine,
      reason,
      details
    },
    vectorText: `Security veto: ${reason}. Command: clew ${currentCommandLine}`
  });
}

function fail(message: string): never {
  console.error(message);
  writeAuditEvent({
    eventType: "veto",
    actor: "human",
    context: {
      cwd: process.cwd(),
      activeSkills: readAgentsContext().activeSkillIds
    },
    payload: {
      commandLine: currentCommandLine,
      error: message
    },
    vectorText: `CLI command failure: ${message}`
  });
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
        "  import <claude|opencode> <json-file> [--save] [--scan] [--semantic] [--ollama] [--ollama-model <model>]",
        "  export <claude|opencode> <skill-id>",
        "  enable <skill-id>",
        "  disable <skill-id>",
        "  skill scan [path] [--semantic] [--ollama] [--ollama-model <model>]",
        "  overlaps",
        "  conflicts",
        "  telemetry",
        "  telemetry --explain",
        "  doctor",
        "  mcp [run|install]",
        "  dashboard [--port=<number>]",
        "  run <start|status|verify>",
        "  check-security",
        "  security install",
      ].join("\n"),
    );
    return;
  }

  currentCommandLine = argv.join(" ");

  let activeSkills: string[] = [];
  try {
    activeSkills = readAgentsContext().activeSkillIds;
  } catch {
    // Ignore
  }

  writeAuditEvent({
    eventType: "cli",
    actor: "human",
    context: {
      cwd: process.cwd(),
      activeSkills,
    },
    payload: {
      commandLine: currentCommandLine,
    },
    vectorText: "human ran CLI command: clew " + currentCommandLine,
  });

  const command = commands[name];
  if (!command) fail(`unknown command: ${name}`);
  try {
    await command(args);
  } catch (error) {
    writeAuditEvent({
      eventType: "veto",
      actor: "human",
      context: {
        cwd: process.cwd(),
        activeSkills: readAgentsContext().activeSkillIds
      },
      payload: {
        commandLine: currentCommandLine,
        error: error instanceof Error ? error.message : String(error)
      },
      vectorText: `CLI command error: ${error instanceof Error ? error.message : String(error)}`
    });

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
