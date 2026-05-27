import {
  ActivationEngine,
  openRegistryDb,
  SkillRegistry,
  type SkillActivationAnalysisResult,
  type SkillIndexAnalysisResult,
  type SkillSearchAnalysisResult,
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
  analyzeTelemetry(records?: TelemetryRecord[]): ClewMcpTelemetryAnalysisResult;
  analyzeRecommendations(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendationAnalysisResult>;
  recommend(input: string | ClewMcpRecommendInput): Promise<ClewMcpRecommendResult>;
  explain(skillId: string, query: string): Promise<ClewMcpExplainResult>;
  explain(input: ClewMcpExplainInput): Promise<ClewMcpExplainResult>;
  lookup(input: string | ClewMcpLookupInput): ClewMcpLookupResult;
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
    close() {
      db?.close();
    },
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
