import { type CompatibilityWarning, type ExportResult, type SkillBundle, exportResultSchema } from "@clew/schema";

type Provider = "claude" | "opencode";

export function exportClaudeSkill(bundle: SkillBundle): ExportResult {
  const warnings = exportWarnings(bundle, "claude");
  const command = providerExtension(bundle, "claude").slash_command;
  const contents = [`# ${bundle.manifest.name}`, ""];
  if (bundle.manifest.description) {
    contents.push(bundle.manifest.description);
  }
  if (command) {
    contents.push(`Slash command: ${String(command)}`);
  }
  contents.push("");
  contents.push(bundle.instructions);
  return exportResultSchema.parse({
    provider: "claude",
    artifacts: [
      {
        path: `${bundle.manifest.id}/SKILL.md`,
        contents: contents.join("\n"),
      },
    ],
    warnings,
  });
}

export function exportOpenCodeSkill(bundle: SkillBundle): ExportResult {
  const warnings = exportWarnings(bundle, "opencode");
  const mode = providerExtension(bundle, "opencode").agent_mode;
  const contents = [`---`, `name: ${bundle.manifest.name}`, `description: ${bundle.manifest.description ?? ""}`];
  if (mode) contents.push(`mode: ${String(mode)}`);
  contents.push(`---`, "", bundle.instructions);
  return exportResultSchema.parse({
    provider: "opencode",
    artifacts: [
      {
        path: `${bundle.manifest.id}.md`,
        contents: contents.join("\n"),
      },
    ],
    warnings,
  });
}

export function exportProviderSkill(provider: Provider, bundle: SkillBundle): ExportResult {
  return provider === "claude" ? exportClaudeSkill(bundle) : exportOpenCodeSkill(bundle);
}

function exportWarnings(bundle: SkillBundle, provider: Provider): CompatibilityWarning[] {
  const warnings: CompatibilityWarning[] = [];
  if (!bundle.manifest.compatibility.providers.includes(provider)) {
    warnings.push({
      code: "target_provider_not_declared",
      provider,
      origin: "provider_export",
      message: `Skill does not declare ${provider} compatibility; exporting best-effort instructions only.`,
      severity: "warning",
    });
  }
  if (bundle.manifest.extends.length) {
    warnings.push({
      code: "composition_degraded",
      provider,
      field: "extends",
      origin: "provider_export",
      message: "Provider export does not encode clew inheritance; compose first if parent policies must be inlined.",
      severity: "warning",
    });
  }
  if (bundle.manifest.capabilities.required.length) {
    warnings.push({
      code: "capability_semantics_degraded",
      provider,
      field: "capabilities.required",
      origin: "provider_export",
      message: "Required runtime capabilities are preserved by clew but are advisory in provider exports.",
      severity: "warning",
    });
  }
  return warnings;
}

function providerExtension(bundle: SkillBundle, provider: Provider): Record<string, unknown> {
  const extension = bundle.manifest.extensions[provider];
  return typeof extension === "object" && extension !== null && !Array.isArray(extension)
    ? (extension as Record<string, unknown>)
    : {};
}
