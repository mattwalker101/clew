import {
  type CompatibilityWarning,
  type ImportResult,
  type SkillBundle,
  type SkillManifest,
  importResultSchema,
  parseSkillBundle,
} from "@clew/schema";

export type Provider = "claude" | "opencode";

export type ProviderSkillInput = {
  id?: string;
  name?: string;
  description?: string;
  instructions?: string;
  content?: string;
  tags?: string[];
  triggers?: string[];
  allowed_tools?: string[];
  slash_command?: string;
  mode?: string;
  agent_mode?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export function importClaudeSkill(input: ProviderSkillInput): ImportResult {
  return importProviderSkill("claude", input);
}

export function importOpenCodeSkill(input: ProviderSkillInput): ImportResult {
  return importProviderSkill("opencode", input);
}

export function importProviderSkill(provider: Provider, input: ProviderSkillInput): ImportResult {
  assertProviderInput(provider, input);
  const warnings: CompatibilityWarning[] = [];
  const id = slug(input.id ?? input.name ?? `${provider}-skill`);
  const instructions = providerInstructions(provider, input);
  const unknown = unknownProviderFields(input, provider);
  if (input.allowed_tools?.length) {
    warnings.push({
      code: "tool_semantics_degraded",
      provider,
      field: "allowed_tools",
      message: "Provider tool allow-list preserved as metadata; clew v0.1 does not execute tools.",
      severity: "warning",
    });
  }
  if (provider === "opencode" && input.mode && !input.agent_mode) {
    warnings.push({
      code: "provider_field_normalized",
      provider,
      field: "mode",
      message: "OpenCode mode normalized to extensions.opencode.agent_mode.",
      severity: "warning",
    });
  }
  if (unknown.length) {
    warnings.push({
      code: "provider_metadata_preserved",
      provider,
      message: `Unknown ${provider} fields preserved under extensions.${provider}: ${unknown.join(", ")}`,
      severity: "warning",
    });
  }

  const manifest: SkillManifest = {
    id,
    version: "1.0.0",
    kind: "instruction_skill",
    name: input.name ?? title(id),
    description: input.description,
    instructions: { file: "skill.md" },
    tags: input.tags ?? [],
    capabilities: { required: [], optional: mapToolsToCapabilities(input.allowed_tools ?? []) },
    compatibility: { providers: [provider], warnings },
    preferences: {},
    activation: { triggers: input.triggers ?? [], tags: [], weight: 1 },
    extends: [],
    policies: [],
    provenance: {
      source: { type: provider, location: provider, original_id: input.id },
      imported_via: { importer: provider },
    },
    extensions: {
      [provider]: providerExtension(input, provider),
    },
  };

  const bundle = parseSkillBundle({
    manifest,
    instructions,
    path: `${provider}:${id}`,
    assets: [],
    examples: [],
    templates: [],
    tests: [],
  });

  return importResultSchema.parse({ provider, bundles: [bundle], warnings, provenance: manifest.provenance });
}

function assertProviderInput(provider: Provider, input: ProviderSkillInput): void {
  for (const key of ["id", "name", "description", "instructions", "content", "slash_command", "mode", "agent_mode"] as const) {
    const value = input[key];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`${provider} field "${key}" must be a string`);
    }
  }
  for (const key of ["tags", "triggers", "allowed_tools"] as const) {
    const value = input[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) {
      throw new Error(`${provider} field "${key}" must be an array of strings`);
    }
  }
}

function providerInstructions(provider: Provider, input: ProviderSkillInput): string {
  const instructions = input.instructions ?? input.content;
  if (!instructions?.trim()) {
    throw new Error(`${provider} skill must include non-empty instructions or content`);
  }
  return instructions;
}

function providerExtension(input: ProviderSkillInput, provider: Provider): Record<string, unknown> {
  const extension: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) extension[key] = value;
  }
  if (provider === "opencode" && input.mode && !input.agent_mode) extension.agent_mode = input.mode;
  return extension;
}

function unknownProviderFields(input: ProviderSkillInput, provider: Provider): string[] {
  const known = new Set<string>([
    "id",
    "name",
    "description",
    "instructions",
    "content",
    "tags",
    "triggers",
    "allowed_tools",
    "metadata",
  ]);
  if (provider === "claude") known.add("slash_command");
  if (provider === "opencode") {
    known.add("agent_mode");
    known.add("mode");
  }
  return Object.keys(input).filter((key) => !known.has(key)).sort();
}

function mapToolsToCapabilities(tools: string[]): Array<SkillBundle["manifest"]["capabilities"]["optional"][number]> {
  const capabilities = new Set<Array<SkillBundle["manifest"]["capabilities"]["optional"][number]>[number]>();
  for (const tool of tools.map((value) => value.toLowerCase())) {
    if (tool.includes("file") || tool.includes("read") || tool.includes("write")) capabilities.add("filesystem");
    if (tool.includes("bash") || tool.includes("shell") || tool.includes("terminal")) capabilities.add("terminal");
    if (tool.includes("git")) capabilities.add("git");
    if (tool.includes("web") || tool.includes("internet")) capabilities.add("internet");
    if (tool.includes("mcp")) capabilities.add("mcp");
  }
  return [...capabilities];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function title(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
