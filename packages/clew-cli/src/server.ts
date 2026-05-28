import http from "node:http";
import fs from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { 
  rebuildRegistryIndex, 
  SkillRegistry, 
  ActivationEngine,
  detectRepoSignals,
  parseAgentsMd,
  findConflicts,
  findOverlaps,
  getAgentsMdDiagnostics,
  openSessionDatabase,
  SessionManager
} from "@clew-ops/core";

const require = createRequire(import.meta.url);

function getDashboardDistPath(): string {
  try {
    const pkgPath = require.resolve("@clew-ops/dashboard/package.json");
    return join(pkgPath, "..", "dist");
  } catch {
    // Fallback for monorepo development paths
    return join(process.cwd(), "packages", "clew-dashboard", "dist");
  }
}

export async function startDashboardServer(port = 7708): Promise<http.Server> {
  const distPath = getDashboardDistPath();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host || "localhost"}`);
    
    // CORS headers for local frontend development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. API: GET /api/registry
    if (url.pathname === "/api/registry" && req.method === "GET") {
      try {
        const dbPath = join(process.cwd(), ".clew-registry.db");
        const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          entries: snapshot.entries.map((e) => ({
            skillId: e.bundle.manifest.id,
            layer: e.layer,
            version: e.bundle.manifest.version,
            name: e.bundle.manifest.name,
            disabled: e.disabled,
            favorite: e.favorite,
            tags: e.bundle.manifest.tags,
            capabilities: e.bundle.manifest.capabilities,
          })),
          warnings: snapshot.warnings,
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 1b. API: GET /api/doctor
    if (url.pathname === "/api/doctor" && req.method === "GET") {
      try {
        const dbPath = join(process.cwd(), ".clew-registry.db");
        const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath });
        const registry = new SkillRegistry(snapshot);
        const bundles = registry.list();
        
        let agentsMd = "";
        try {
          agentsMd = fs.readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
        } catch {}
        
        const parsedAgents = parseAgentsMd(agentsMd);
        const registryWarnings = snapshot.warnings;
        const agentsDiagnostics = getAgentsMdDiagnostics(agentsMd, registry);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          skills: bundles.length,
          dbPath,
          repoSignals: detectRepoSignals(process.cwd()),
          overlaps: findOverlaps(bundles).length,
          conflicts: findConflicts(bundles),
          registryWarnings,
          agentsDiagnostics,
          agentsPreferences: parsedAgents.preferences,
          warnings: [...registryWarnings, ...agentsDiagnostics],
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 2. API: POST /api/explain
    if (url.pathname === "/api/explain" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          const { query = "" } = payload;
          const dbPath = join(process.cwd(), ".clew-registry.db");
          const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath });
          const registry = new SkillRegistry(snapshot);
          const engine = new ActivationEngine(registry);
          
          let agentsMd = "";
          try {
            agentsMd = fs.readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
          } catch {}

          const context = {
            query,
            tags: [],
            agentsMd,
            repoSignals: detectRepoSignals(process.cwd()),
            capabilities: [],
            activeSkillIds: parseAgentsMd(agentsMd).activeSkillIds,
          };

          const analysis = await engine.analyzeRecommendations(context);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(analysis));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: GET /api/run/status
    if (url.pathname === "/api/run/status" && req.method === "GET") {
      try {
        const db = openSessionDatabase(join(process.cwd(), ".clew-session.db"));
        try {
          const run = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
          if (!run) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ active: false }));
            return;
          }

          const registryDbPath = join(process.cwd(), ".clew-registry.db");
          const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath });
          const registry = new SkillRegistry(snapshot);

          const manager = new SessionManager(db, {
            getSkill: async (id) => {
              const bundle = registry.lookup(id);
              return bundle ? bundle.manifest : null;
            },
          });

          const step = await manager.getCurrentStep(run.id);
          const bundle = registry.lookup(run.skill_id);
          const steps = bundle?.manifest.steps || [];
          const stepIndex = step ? steps.findIndex((s) => s.id === step.id) : -1;

          let stepState: any = null;
          let gateResults: any[] = [];
          if (step) {
            stepState = db.prepare("SELECT * FROM session_step_states WHERE session_id = ? AND step_id = ?").get(run.id, step.id) as any;
            gateResults = stepState?.error_log ? JSON.parse(stepState.error_log) : [];
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            active: true,
            sessionId: run.id,
            skillId: run.skill_id,
            status: run.status,
            createdAt: run.created_at,
            currentStep: step ? {
              id: step.id,
              title: step.title,
              instruction: step.instruction,
              index: stepIndex,
              totalSteps: steps.length,
              status: stepState?.status || "pending",
              gates: (step.gates || []).map((gate: any, idx: number) => {
                let status = "pending";
                let error = "";
                if (stepState?.status === "completed") {
                  status = "completed";
                } else if (stepState?.status === "failed") {
                  const res = gateResults[idx];
                  if (res) {
                    status = res.success ? "completed" : "failed";
                    error = res.error || "";
                  }
                }
                return {
                  ...gate,
                  status,
                  error,
                };
              }),
            } : null,
          }));
        } finally {
          db.close();
        }
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API: POST /api/run/start
    if (url.pathname === "/api/run/start" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          const { skillId } = payload;
          if (!skillId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing skillId" }));
            return;
          }

          const registryDbPath = join(process.cwd(), ".clew-registry.db");
          const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath });
          const registry = new SkillRegistry(snapshot);
          const bundle = registry.lookup(skillId);
          if (!bundle) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Unknown skill: ${skillId}` }));
            return;
          }

          const db = openSessionDatabase(join(process.cwd(), ".clew-session.db"));
          try {
            db.prepare("UPDATE session_runs SET status = 'completed' WHERE status = 'active'").run();

            const manager = new SessionManager(db, {
              getSkill: async (id) => {
                const b = registry.lookup(id);
                return b ? b.manifest : null;
              },
            });

            const run = await manager.createSession(skillId);
            const step = await manager.getCurrentStep(run.id);
            const steps = bundle.manifest.steps || [];
            const stepIndex = step ? steps.findIndex((s) => s.id === step.id) : -1;

            let stepState: any = null;
            if (step) {
              stepState = db.prepare("SELECT * FROM session_step_states WHERE session_id = ? AND step_id = ?").get(run.id, step.id) as any;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              active: true,
              sessionId: run.id,
              skillId,
              status: run.status,
              currentStep: step ? {
                id: step.id,
                title: step.title,
                instruction: step.instruction,
                index: stepIndex,
                totalSteps: steps.length,
                status: stepState?.status || "pending",
                gates: (step.gates || []).map((gate: any) => ({
                  ...gate,
                  status: "pending",
                  error: "",
                })),
              } : null,
            }));
          } finally {
            db.close();
          }
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: POST /api/run/verify
    if (url.pathname === "/api/run/verify" && req.method === "POST") {
      try {
        const db = openSessionDatabase(join(process.cwd(), ".clew-session.db"));
        try {
          const run = db.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
          if (!run) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No active runbook session found" }));
            return;
          }

          const registryDbPath = join(process.cwd(), ".clew-registry.db");
          const snapshot = await rebuildRegistryIndex({ projectRoot: process.cwd(), dbPath: registryDbPath });
          const registry = new SkillRegistry(snapshot);

          const manager = new SessionManager(db, {
            getSkill: async (id) => {
              const bundle = registry.lookup(id);
              return bundle ? bundle.manifest : null;
            },
          });

          const currentStep = await manager.getCurrentStep(run.id);
          if (!currentStep) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, completed: true, gates: [] }));
            return;
          }

          const result = await manager.verifyCurrentStep(run.id);
          const nextStep = await manager.getCurrentStep(run.id);
          const steps = registry.lookup(run.skill_id)?.manifest.steps || [];

          let nextStepDetails: any = null;
          if (nextStep) {
            const nextStepIndex = steps.findIndex((s) => s.id === nextStep.id);
            const nextStepState = db.prepare("SELECT * FROM session_step_states WHERE session_id = ? AND step_id = ?").get(run.id, nextStep.id) as any;
            nextStepDetails = {
              id: nextStep.id,
              title: nextStep.title,
              instruction: nextStep.instruction,
              index: nextStepIndex,
              totalSteps: steps.length,
              status: nextStepState?.status || "pending",
              gates: (nextStep.gates || []).map((gate: any) => ({
                ...gate,
                status: "pending",
                error: "",
              })),
            };
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: result.success,
            completed: !nextStep,
            gates: result.gates,
            nextStep: nextStepDetails,
          }));
        } finally {
          db.close();
        }
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 3. Static Asset Serving
    let filePath = join(distPath, url.pathname === "/" ? "index.html" : url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = join(distPath, "index.html");
    }

    const ext = filePath.split(".").pop();
    const contentType: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
    };
    const mimeType = contentType[ext ?? ""] ?? "application/octet-stream";

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeType });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`🧵 clew Cockpit running at http://localhost:${port}`);
      resolve(server);
    });
  });
}
