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
  getAgentsMdDiagnostics
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
