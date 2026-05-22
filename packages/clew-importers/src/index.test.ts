import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importClaudeSkill, importOpenCodeSkill, importProviderSkill } from "./index.js";
import type { ProviderSkillInput } from "./index.js";
import { compatibilityWarningSchema, type CompatibilityWarning, type ImportResult } from "@clew-ops/schema";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "interop");
const contractRoot = join(process.cwd(), "tests", "fixtures", "contracts");

type ProviderWarningContract = {
  imports: {
    claudeDegraded: { warnings: CompatibilityWarning[] };
    opencodeNormalized: { warnings: CompatibilityWarning[] };
  };
};

type ProviderProvenanceContract = {
  imports: {
    claudeDegraded: { provenance: ImportResult["provenance"] };
    opencodeNormalized: { provenance: ImportResult["provenance"] };
  };
};

type ProviderRoundTripContract = {
  imports: {
    claudeDegraded: {
      provenance: ImportResult["provenance"];
      warnings: CompatibilityWarning[];
    };
  };
};

type ProviderInteropBoundaryContract = {
  scope: {
    supportedProviders: string[];
    excludedProviders: string[];
  };
  imports: {
    claudeDegraded: {
      provider: string;
      manifestId: string;
      extensionNamespaceKeys: string[];
      preservedProviderMetadata: Record<string, unknown>;
      provenance: ImportResult["provenance"];
      warningCodes: string[];
      warningOrigins: string[];
    };
    opencodeNormalized: {
      provider: string;
      manifestId: string;
      extensionNamespaceKeys: string[];
      preservedProviderMetadata: Record<string, unknown>;
      provenance: ImportResult["provenance"];
      warningCodes: string[];
      warningOrigins: string[];
    };
  };
};

type ProviderUnsupportedBoundaryContract = {
  scope: {
    supportedProviders: string[];
    excludedProviders: string[];
  };
};

function fixture(name: string): ProviderSkillInput {
  return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8")) as ProviderSkillInput;
}

function providerWarningContract(): ProviderWarningContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-warning-contract.json"), "utf8"),
  ) as ProviderWarningContract;
}

function providerProvenanceContract(): ProviderProvenanceContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-provenance-contract.json"), "utf8"),
  ) as ProviderProvenanceContract;
}

function providerRoundTripContract(): ProviderRoundTripContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-roundtrip-contract.json"), "utf8"),
  ) as ProviderRoundTripContract;
}

function providerInteropBoundaryContract(): ProviderInteropBoundaryContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-interop-boundary-contract.json"), "utf8"),
  ) as ProviderInteropBoundaryContract;
}

function providerUnsupportedBoundaryContract(): ProviderUnsupportedBoundaryContract {
  return JSON.parse(
    readFileSync(join(contractRoot, "provider-unsupported-boundary-contract.json"), "utf8"),
  ) as ProviderUnsupportedBoundaryContract;
}

describe("@clew-ops/importers", () => {
  it("imports Claude skills while preserving degraded provider fields", () => {
    const result = importClaudeSkill({
      id: "safe-refactor",
      name: "Safe Refactor",
      instructions: "Refactor safely.",
      allowed_tools: ["Bash", "Read"],
      slash_command: "/safe-refactor",
      custom_field: true,
    });

    expect(result.bundles[0]?.manifest.extensions.claude).toMatchObject({ custom_field: true });
    expect(result.warnings.map((warning) => warning.code)).toContain("tool_semantics_degraded");
    expect(result.warnings.map((warning) => warning.code)).toContain("provider_metadata_preserved");
  });

  it("imports OpenCode agent metadata under extensions.opencode", () => {
    const result = importOpenCodeSkill({ name: "Safe Mode", content: "Stay safe.", mode: "safe" });
    expect(result.bundles[0]?.manifest.extensions.opencode).toMatchObject({ agent_mode: "safe" });
  });

  it("imports Claude fixture inputs deterministically", () => {
    const first = importClaudeSkill(fixture("claude-valid.json"));
    const second = importClaudeSkill(fixture("claude-valid.json"));

    expect(first).toEqual(second);
    expect(first.bundles[0]).toMatchObject({
      manifest: {
        id: "safe-refactor",
        compatibility: { providers: ["claude"] },
        capabilities: { optional: ["terminal", "filesystem"] },
        extensions: { claude: { slash_command: "/safe-refactor" } },
      },
      instructions: "Preserve behavior and keep changes incremental.",
    });
  });

  it("preserves degraded Claude provider metadata with stable warnings", () => {
    const result = importClaudeSkill(fixture("claude-degraded.json"));
    const warningContract = providerWarningContract();
    const provenanceContract = providerProvenanceContract();

    expect(result.provenance).toEqual(provenanceContract.imports.claudeDegraded.provenance);
    expect(result.bundles[0]?.manifest.provenance).toEqual(provenanceContract.imports.claudeDegraded.provenance);
    expect(result.bundles[0]?.manifest.extensions.claude).toMatchObject({ risk_level: "high" });
    expect(result.warnings).toEqual(warningContract.imports.claudeDegraded.warnings);
    expect(result.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(result.warnings);
  });

  it("matches the combined provider round-trip contract on import", () => {
    const result = importClaudeSkill(fixture("claude-degraded.json"));
    const contract = providerRoundTripContract();

    expect(result).toMatchObject({
      provider: "claude",
      provenance: contract.imports.claudeDegraded.provenance,
      warnings: contract.imports.claudeDegraded.warnings,
    });
    expect(result.bundles[0]?.manifest.provenance).toEqual(contract.imports.claudeDegraded.provenance);
    expect(result.bundles[0]?.manifest.extensions.claude).toBeDefined();
  });

  it("matches the provider interop fidelity boundary on import", () => {
    const contract = providerInteropBoundaryContract();
    const claude = importClaudeSkill(fixture("claude-degraded.json"));
    const opencode = importOpenCodeSkill(fixture("opencode-normalized.json"));
    const summarizeImport = (result: ImportResult) => {
      const manifest = result.bundles[0]?.manifest;
      return {
        provider: result.provider,
        manifestId: manifest?.id,
        extensionNamespaceKeys: Object.keys(manifest?.extensions ?? {}).sort(),
        preservedProviderMetadata: manifest?.extensions[result.provider] ?? {},
        provenance: result.provenance,
        warningCodes: result.warnings.map((warning) => warning.code),
        warningOrigins: result.warnings.map((warning) => warning.origin),
      };
    };

    expect(contract.scope).toEqual({
      supportedProviders: ["claude", "opencode"],
      excludedProviders: ["cursor", "windsurf", "copilot"],
    });
    expect(summarizeImport(claude)).toEqual(contract.imports.claudeDegraded);
    expect(summarizeImport(opencode)).toEqual(contract.imports.opencodeNormalized);
  });

  it("rejects excluded providers at the direct import API boundary", () => {
    const contract = providerUnsupportedBoundaryContract();
    const input: ProviderSkillInput = {
      id: "unsupported-provider",
      name: "Unsupported Provider",
      instructions: "This should never become a clew bundle.",
    };

    expect(contract.scope.supportedProviders).toEqual(["claude", "opencode"]);
    expect(contract.scope.excludedProviders).toEqual(["cursor", "windsurf", "copilot"]);

    for (const provider of contract.scope.excludedProviders) {
      let result: ImportResult | undefined;

      expect(() => {
        result = importProviderSkill(provider as any, input);
      }).toThrow(`Unsupported provider "${provider}"; supported providers: claude, opencode`);
      expect(result).toBeUndefined();
    }
  });

  it("normalizes OpenCode mode metadata and reports the transform", () => {
    const result = importOpenCodeSkill(fixture("opencode-normalized.json"));
    const warningContract = providerWarningContract();
    const provenanceContract = providerProvenanceContract();

    expect(result.bundles[0]?.manifest.id).toBe("opencode-migration");
    expect(result.provenance).toEqual(provenanceContract.imports.opencodeNormalized.provenance);
    expect(result.bundles[0]?.manifest.provenance).toEqual(provenanceContract.imports.opencodeNormalized.provenance);
    expect(result.bundles[0]?.manifest.extensions.opencode).toMatchObject({ mode: "review", agent_mode: "review" });
    expect(result.warnings).toEqual(warningContract.imports.opencodeNormalized.warnings);
    expect(result.warnings.map((warning) => compatibilityWarningSchema.parse(warning))).toEqual(result.warnings);
  });

  it("rejects malformed provider fixtures with clear errors", () => {
    expect(() => importClaudeSkill(fixture("claude-malformed.json"))).toThrow(
      "claude skill must include non-empty instructions or content",
    );
    expect(() => importOpenCodeSkill(fixture("opencode-malformed.json"))).toThrow(
      "opencode skill must include non-empty instructions or content",
    );
  });
});
