import { ActivationEngine, SkillRegistry } from "@clew/core";

export type ClewMcpBridge = {
  search(query: string): unknown;
  recommend(query: string): unknown;
  explain(skillId: string, query: string): unknown;
  lookup(skillId: string): unknown;
};

export function createClewMcpBridge(registry = SkillRegistry.fromProject()): ClewMcpBridge {
  const activation = new ActivationEngine(registry);
  return {
    search(query: string) {
      return registry.search(query).map((bundle) => bundle.manifest);
    },
    recommend(query: string) {
      return activation.recommend({ query });
    },
    explain(skillId: string, query: string) {
      return activation.explain(skillId, { query });
    },
    lookup(skillId: string) {
      return registry.lookup(skillId);
    },
  };
}
