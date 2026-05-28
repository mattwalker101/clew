import { join } from "node:path";
import {
  ActivationEngine,
  openRegistryDb,
  SkillRegistry,
  openSessionDatabase,
  SessionManager,
  type SkillActivationAnalysisResult,
  type SkillIndexAnalysisResult,
  type SkillSearchAnalysisResult,
  type SkillSearchSemanticAnalysisResult,
  type SkillTelemetryAnalysisResult,
  type TelemetryRecord,
} from "@clew-ops/core";
import type {
  ActivationContext,
  Capability,
  CompatibilityWarning,
  Recommendation,
  SkillBundle,
  SkillManifest,
} from "@clew-ops/schema";

export type ClewMcpBridge = {
  analyzeIndex(): ClewMcpIndexAnalysisResult;
  search(input: string | ClewMcpSearchInput): ClewMcpSearchResult;
  analyzeSearch(input: string | ClewMcpSearchInput): ClewMcpSearchAnalysisResult;
  searchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchResult>;
  analyzeSearchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchSemanticAnalysisResult>;
  analyzeTelemetry(records?: TelemetryRecord[]): ClewMcpTelemetryAnalysisResult;
  analyzeRecommendations(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendationAnalysisResult>;
  recommend(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendResult>;
  explain(skillId: string, query: string): Promise<ClewMcpExplainResult>;
  explain(input: ClewMcpExplainInput): Promise<ClewMcpExplainResult>;
  lookup(input: string | ClewMcpLookupInput): ClewMcpLookupResult;
  startRunbook(skillId: string): Promise<ClewMcpRunbookSessionResult>;
  getRunbookStatus(sessionId?: string): Promise<ClewMcpRunbookStatusResult>;
  verifyRunbookStep(sessionId?: string): Promise<ClewMcpRunbookVerifyResult>;
  close(): void;
};

export type ClewMcpBridgeOptions = {
  registry?: SkillRegistry | undefined;
  defaultContext?: Partial<ClewMcpRequestContext> | undefined;
  defaultLimit?: number | undefined;
};

export type ClewMcpRequestContext = {
  tags?: string[] | undefined;
  agentsMd?: string | undefined;
  repoSignals?: string[] | undefined;
  capabilities?: Capability[] | undefined;
  activeSkillIds?: string[] | undefined;
};

export type ClewMcpSearchInput = {
  query: string;
  limit?: number | undefined;
};

export type ClewMcpRecommendInput = {
  query: string;
  context?: Partial<ClewMcpRequestContext> | undefined;
  limit?: number | undefined;
};

export type ClewMcpExplainInput = {
  skillId: string;
  query: string;
  context?: Partial<ClewMcpRequestContext> | undefined;
};

export type ClewMcpLookupInput = {
  skillId: string;
};

export type ClewMcpSearchResult = {
  query: string;
  skills: SkillManifest[];
  warnings: CompatibilityWarning[];
};

export type ClewMcpIndexAnalysisResult = {
  analysis: SkillIndexAnalysisResult;
  warnings: CompatibilityWarning[];
};

export type ClewMcpSearchAnalysisResult = {
  query: string;
  analysis: SkillSearchAnalysisResult;
  warnings: CompatibilityWarning[];
};

export type ClewMcpSearchSemanticAnalysisResult = {
  query: string;
  analysis: SkillSearchSemanticAnalysisResult;
  warnings: CompatibilityWarning[];
};

export type ClewMcpTelemetryAnalysisResult = {
  analysis: SkillTelemetryAnalysisResult;
  warnings: CompatibilityWarning[];
};

export type ClewMcpRecommendationAnalysisResult = {
  query: string;
  analysis: SkillActivationAnalysisResult;
  warnings: CompatibilityWarning[];
};

export type ClewMcpRecommendResult = {
  query: string;
  recommendations: Recommendation[];
  warnings: CompatibilityWarning[];
};

export type ClewMcpExplainResult = {
  skillId: string;
  query: string;
  recommendation: Recommendation | null;
  warnings: CompatibilityWarning[];
};

export type ClewMcpLookupResult = {
  skillId: string;
  bundle: SkillBundle | null;
  warnings: CompatibilityWarning[];
};

export type ClewMcpRunbookSessionResult = {
  sessionId: string;
  skillId: string;
  status: string;
  currentStep: {
    id: string;
    title: string;
    instruction: string;
    index: number;
    totalSteps: number;
    gates: any[];
  } | null;
  warnings: CompatibilityWarning[];
};

export type ClewMcpRunbookStatusResult = {
  active: boolean;
  sessionId?: string;
  skillId?: string;
  status?: string;
  currentStep?: {
    id: string;
    title: string;
    instruction: string;
    index: number;
    totalSteps: number;
    status: string;
    gates: any[];
  } | null;
  warnings: CompatibilityWarning[];
};

export type ClewMcpRunbookVerifyResult = {
  success: boolean;
  sessionId?: string;
  skillId?: string;
  gates: any[];
  completed: boolean;
  nextStep?: {
    id: string;
    title: string;
    instruction: string;
    index: number;
    totalSteps: number;
    gates: any[];
  } | null;
  warnings: CompatibilityWarning[];
};

export async function createClewMcpBridge(
  registryOrOptions: SkillRegistry | ClewMcpBridgeOptions | Promise<SkillRegistry> = SkillRegistry.fromProject(),
): Promise<ClewMcpBridge> {
  const resolved = await registryOrOptions;
  const options = resolved instanceof SkillRegistry ? { registry: resolved } : resolved;
  const registry = options.registry ?? (await SkillRegistry.fromProject());
  const db = registry.dbPath ? openRegistryDb(registry.dbPath) : undefined;
  const activation = new ActivationEngine(registry, db);
  const registryWarnings = registry.warnings;
  return {
    analyzeIndex(): ClewMcpIndexAnalysisResult {
      return {
        analysis: registry.analyzeIndex(),
        warnings: registryWarnings,
      };
    },
    search(input: string | ClewMcpSearchInput): ClewMcpSearchResult {
      const request = typeof input === "string" ? { query: input } : input;
      return {
        query: request.query,
        skills: applyLimit(
          registry.search(request.query).map((bundle) => bundle.manifest),
          request.limit ?? options.defaultLimit,
        ),
        warnings: registryWarnings,
      };
    },
    analyzeSearch(input: string | ClewMcpSearchInput): ClewMcpSearchAnalysisResult {
      const request = typeof input === "string" ? { query: input } : input;
      const analysis = registry.analyzeSearch(request.query);
      return {
        query: request.query,
        analysis: {
          ...analysis,
          matches: applyLimit(analysis.matches, request.limit ?? options.defaultLimit),
        },
        warnings: registryWarnings,
      };
    },
    async searchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchResult> {
      const request = typeof input === "string" ? { query: input } : input;
      const skills = (await registry.searchSemantic(request.query, request.limit ?? options.defaultLimit)).map(
        (bundle) => bundle.manifest,
      );
      return {
        query: request.query,
        skills,
        warnings: registryWarnings,
      };
    },
    async analyzeSearchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchSemanticAnalysisResult> {
      const request = typeof input === "string" ? { query: input } : input;
      const analysis = await registry.analyzeSearchSemantic(request.query, request.limit ?? options.defaultLimit);
      return {
        query: request.query,
        analysis,
        warnings: registryWarnings,
      };
    },
    analyzeTelemetry(records: TelemetryRecord[] = []): ClewMcpTelemetryAnalysisResult {
      return {
        analysis: registry.analyzeTelemetry(records),
        warnings: registryWarnings,
      };
    },
    async analyzeRecommendations(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendationAnalysisResult> {
      const request = typeof input === "string" ? { query: input } : input;
      const analysis = await activation.analyzeRecommendations(
        toActivationContext(request.query, options.defaultContext, request.context),
      );
      return {
        query: request.query,
        analysis: {
          ...analysis,
          recommendations: applyLimit(analysis.recommendations, request.limit ?? options.defaultLimit),
        },
        warnings: registryWarnings,
      };
    },
    async recommend(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendResult> {
      const request = typeof input === "string" ? { query: input } : input;
      return {
        query: request.query,
        recommendations: applyLimit(
          await activation.recommend(toActivationContext(request.query, options.defaultContext, request.context)),
          request.limit ?? options.defaultLimit,
        ),
        warnings: registryWarnings,
      };
    },
    async explain(skillIdOrInput: string | ClewMcpExplainInput, query?: string): Promise<ClewMcpExplainResult> {
      const request =
        typeof skillIdOrInput === "string" ? { skillId: skillIdOrInput, query: query ?? "" } : skillIdOrInput;
      const stateWarning = lookupStateWarning(registry, request.skillId);
      if (stateWarning) {
        return {
          skillId: request.skillId,
          query: request.query,
          recommendation: null,
          warnings: [...registryWarnings, stateWarning],
        };
      }

      const recommendation = await activation.explain(
        request.skillId,
        toActivationContext(request.query, options.defaultContext, request.context),
      );
      return {
        skillId: request.skillId,
        query: request.query,
        recommendation: recommendation ?? null,
        warnings: recommendation ? registryWarnings : [...registryWarnings, notRecommendedWarning(request.skillId)],
      };
    },
    lookup(input: string | ClewMcpLookupInput): ClewMcpLookupResult {
      const skillId = typeof input === "string" ? input : input.skillId;
      const warning = lookupStateWarning(registry, skillId);
      return {
        skillId,
        bundle: warning ? null : registry.lookup(skillId) ?? null,
        warnings: warning ? [...registryWarnings, warning] : registryWarnings,
      };
    },
    async startRunbook(skillId: string): Promise<ClewMcpRunbookSessionResult> {
      const projectRoot = registry.dbPath ? join(registry.dbPath, "..") : process.cwd();
      const sessionDb = openSessionDatabase(join(projectRoot, ".clew-session.db"));
      try {
        sessionDb.prepare("UPDATE session_runs SET status = 'completed' WHERE status = 'active'").run();

        const manager = new SessionManager(sessionDb, {
          getSkill: async (id) => {
            const bundle = registry.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        });

        const run = await manager.createSession(skillId);
        const step = await manager.getCurrentStep(run.id);
        const bundle = registry.lookup(skillId);
        const steps = bundle?.manifest.steps || [];

        return {
          sessionId: run.id,
          skillId,
          status: "active",
          currentStep: formatMcpStep(step, steps),
          warnings: registryWarnings,
        };
      } finally {
        sessionDb.close();
      }
    },
    async getRunbookStatus(sessionId?: string): Promise<ClewMcpRunbookStatusResult> {
      const projectRoot = registry.dbPath ? join(registry.dbPath, "..") : process.cwd();
      const sessionDb = openSessionDatabase(join(projectRoot, ".clew-session.db"));
      try {
        let run: any;
        if (sessionId) {
          run = sessionDb.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId) as any;
        } else {
          run = sessionDb.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
        }

        if (!run) {
          return { active: false, warnings: registryWarnings };
        }

        const manager = new SessionManager(sessionDb, {
          getSkill: async (id) => {
            const bundle = registry.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        });

        const step = await manager.getCurrentStep(run.id);
        const bundle = registry.lookup(run.skill_id);
        const steps = bundle?.manifest.steps || [];

        return {
          active: run.status === "active",
          sessionId: run.id,
          skillId: run.skill_id,
          status: run.status,
          currentStep: step ? {
            ...formatMcpStep(step, steps)!,
            status: run.status,
          } : null,
          warnings: registryWarnings,
        };
      } finally {
        sessionDb.close();
      }
    },
    async verifyRunbookStep(sessionId?: string): Promise<ClewMcpRunbookVerifyResult> {
      const projectRoot = registry.dbPath ? join(registry.dbPath, "..") : process.cwd();
      const sessionDb = openSessionDatabase(join(projectRoot, ".clew-session.db"));
      try {
        let run: any;
        if (sessionId) {
          run = sessionDb.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId) as any;
        } else {
          run = sessionDb.prepare("SELECT * FROM session_runs WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get() as any;
        }

        if (!run || run.status !== "active") {
          throw new Error("No active runbook session found to verify.");
        }

        const manager = new SessionManager(sessionDb, {
          getSkill: async (id) => {
            const bundle = registry.lookup(id);
            return bundle ? bundle.manifest : null;
          },
        });

        const beforeStep = await manager.getCurrentStep(run.id);
        if (!beforeStep) {
          return {
            success: true,
            sessionId: run.id,
            skillId: run.skill_id,
            gates: [],
            completed: true,
            warnings: registryWarnings,
          };
        }

        const result = await manager.verifyCurrentStep(run.id);
        const afterStep = await manager.getCurrentStep(run.id);
        const bundle = registry.lookup(run.skill_id);
        const steps = bundle?.manifest.steps || [];

        return {
          success: result.success,
          sessionId: run.id,
          skillId: run.skill_id,
          gates: result.gates,
          completed: result.success && !afterStep,
          nextStep: result.success && afterStep ? formatMcpStep(afterStep, steps) : null,
          warnings: registryWarnings,
        };
      } finally {
        sessionDb.close();
      }
    },
    close() {
      db?.close();
    },
  };
}

function formatMcpStep(step: any, steps: any[]) {
  if (!step) return null;
  const idx = steps.findIndex((s) => s.id === step.id);
  return {
    id: step.id,
    title: step.title,
    instruction: step.instruction,
    index: idx,
    totalSteps: steps.length,
    gates: step.gates || [],
  };
}

function toActivationContext(
  query: string,
  defaultContext: Partial<ClewMcpRequestContext> | undefined,
  requestContext: Partial<ClewMcpRequestContext> | undefined,
): Partial<ActivationContext> {
  const context: any = { query };
  const sources = [defaultContext, requestContext];

  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        context[key] = value;
      }
    }
  }

  return context as Partial<ActivationContext>;
}

function applyLimit<T>(values: T[], limit: number | undefined): T[] {
  if (limit === undefined) return values;
  return values.slice(0, Math.max(0, Math.floor(limit)));
}

function lookupStateWarning(registry: SkillRegistry, skillId: string): CompatibilityWarning | undefined {
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
