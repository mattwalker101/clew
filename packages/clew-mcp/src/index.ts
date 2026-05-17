import {
  ActivationEngine,
  SkillRegistry,
  type SkillActivationAnalysisResult,
  type SkillSearchAnalysisResult,
  type SkillTelemetryAnalysisResult,
  type TelemetryRecord,
} from "@clew/core";
import type {
  ActivationContext,
  Capability,
  CompatibilityWarning,
  Recommendation,
  SkillBundle,
  SkillManifest,
} from "@clew/schema";

export type ClewMcpBridge = {
  search(input: string | ClewMcpSearchInput): ClewMcpSearchResult;
  analyzeSearch(input: string | ClewMcpSearchInput): ClewMcpSearchAnalysisResult;
  analyzeTelemetry(records?: TelemetryRecord[]): ClewMcpTelemetryAnalysisResult;
  analyzeRecommendations(input: string | ClewMcpRecommendInput): ClewMcpRecommendationAnalysisResult;
  recommend(input: string | ClewMcpRecommendInput): ClewMcpRecommendResult;
  explain(skillId: string, query: string): ClewMcpExplainResult;
  explain(input: ClewMcpExplainInput): ClewMcpExplainResult;
  lookup(input: string | ClewMcpLookupInput): ClewMcpLookupResult;
};

export type ClewMcpBridgeOptions = {
  registry?: SkillRegistry;
  defaultContext?: Partial<ClewMcpRequestContext>;
  defaultLimit?: number;
};

export type ClewMcpRequestContext = {
  tags?: string[];
  agentsMd?: string;
  repoSignals?: string[];
  capabilities?: Capability[];
  activeSkillIds?: string[];
};

export type ClewMcpSearchInput = {
  query: string;
  limit?: number;
};

export type ClewMcpRecommendInput = {
  query: string;
  context?: Partial<ClewMcpRequestContext>;
  limit?: number;
};

export type ClewMcpExplainInput = {
  skillId: string;
  query: string;
  context?: Partial<ClewMcpRequestContext>;
};

export type ClewMcpLookupInput = {
  skillId: string;
};

export type ClewMcpSearchResult = {
  query: string;
  skills: SkillManifest[];
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

export function createClewMcpBridge(
  registryOrOptions: SkillRegistry | ClewMcpBridgeOptions = SkillRegistry.fromProject(),
): ClewMcpBridge {
  const options = registryOrOptions instanceof SkillRegistry ? { registry: registryOrOptions } : registryOrOptions;
  const registry = options.registry ?? SkillRegistry.fromProject();
  const activation = new ActivationEngine(registry);
  const registryWarnings = registry.warnings;
  return {
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
    analyzeRecommendations(input: string | ClewMcpRecommendInput): ClewMcpRecommendationAnalysisResult {
      const request = typeof input === "string" ? { query: input } : input;
      const analysis = activation.analyzeRecommendations(
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
    recommend(input: string | ClewMcpRecommendInput): ClewMcpRecommendResult {
      const request = typeof input === "string" ? { query: input } : input;
      return {
        query: request.query,
        recommendations: applyLimit(
          activation.recommend(toActivationContext(request.query, options.defaultContext, request.context)),
          request.limit ?? options.defaultLimit,
        ),
        warnings: registryWarnings,
      };
    },
    explain(skillIdOrInput: string | ClewMcpExplainInput, query?: string): ClewMcpExplainResult {
      const request =
        typeof skillIdOrInput === "string"
          ? { skillId: skillIdOrInput, query: query ?? "" }
          : skillIdOrInput;
      const stateWarning = lookupStateWarning(registry, request.skillId);
      if (stateWarning) {
        return {
          skillId: request.skillId,
          query: request.query,
          recommendation: null,
          warnings: [...registryWarnings, stateWarning],
        };
      }

      const recommendation = activation.explain(
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
  };
}

function toActivationContext(
  query: string,
  defaultContext: Partial<ClewMcpRequestContext> | undefined,
  requestContext: Partial<ClewMcpRequestContext> | undefined,
): Partial<ActivationContext> {
  return {
    ...defaultContext,
    ...requestContext,
    query,
  };
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
