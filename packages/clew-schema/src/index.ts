import { z } from "zod";

export const supportedSkillKinds = ["instruction_skill"] as const;
export const reservedFutureSkillKinds = [
  "workflow_skill",
  "persona_skill",
  "tool_extension",
] as const;

export const coreCapabilities = [
  "filesystem",
  "terminal",
  "internet",
  "git",
  "mcp",
  "multimodal",
  "vector_memory",
  "persistent_memory",
  "subagents",
] as const;

export const reservedExtensionNamespaces = [
  "claude",
  "opencode",
  "pi",
  "codex",
  "local",
] as const;

export const registryLayers = ["session", "project", "org", "global"] as const;
export const compatibilityWarningOrigins = [
  "registry_rebuild",
  "request",
  "agents_diagnostic",
  "activation",
  "provider_import",
  "provider_export",
] as const;

export const skillKindSchema = z.enum(supportedSkillKinds);
export const capabilitySchema = z.enum(coreCapabilities);
export const registryLayerSchema = z.enum(registryLayers);
export const compatibilityWarningOriginSchema = z.enum(compatibilityWarningOrigins);

const stringArraySchema = z.array(z.string().min(1)).default([]);

export const compatibilityWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]).default("warning"),
  provider: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  origin: compatibilityWarningOriginSchema.optional(),
});

export const capabilitySetSchema = z
  .object({
    required: z.array(capabilitySchema).default([]),
    optional: z.array(capabilitySchema).default([]),
  })
  .default({ required: [], optional: [] });

export const instructionsSchema = z.object({
  file: z.string().min(1),
});

export const compatibilitySchema = z
  .object({
    providers: stringArraySchema,
    warnings: z.array(compatibilityWarningSchema).default([]),
  })
  .default({ providers: [], warnings: [] });

export const preferencesSchema = z
  .object({
    reasoning: z
      .object({
        preferred_models: stringArraySchema,
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .default({});

export const activationSchema = z
  .object({
    triggers: stringArraySchema,
    tags: stringArraySchema,
    weight: z.number().finite().default(1),
  })
  .passthrough()
  .default({ triggers: [], tags: [], weight: 1 });

const providerSourceTypes = ["claude", "opencode", "local"] as const;

function isProviderSourceType(type: string): type is (typeof providerSourceTypes)[number] {
  return providerSourceTypes.includes(type as (typeof providerSourceTypes)[number]);
}

export const provenanceSchema = z
  .object({
    source: z
      .object({
        type: z.enum(["filesystem", "github", "claude", "opencode", "local", "unknown"]),
        location: z.string().min(1),
        original_id: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
    imported_via: z
      .object({
        importer: z.string().min(1),
        imported_at: z.string().datetime().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.imported_via && !value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Imported provenance must include source metadata.",
        path: ["source"],
      });
    }
  })
  .default({});

export const extensionNamespacesSchema = z
  .record(z.string().min(1), z.unknown())
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid extension namespace "${key}". Use lowercase provider namespaces.`,
          path: [key],
        });
      }
    }
  })
  .default({});

export const skillManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    kind: skillKindSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    instructions: instructionsSchema,
    tags: stringArraySchema,
    capabilities: capabilitySetSchema,
    compatibility: compatibilitySchema,
    preferences: preferencesSchema,
    activation: activationSchema,
    extends: stringArraySchema,
    policies: stringArraySchema,
    provenance: provenanceSchema,
    extensions: extensionNamespacesSchema,
  })
  .superRefine((value, ctx) => {
    const sourceType = value.provenance.source?.type;
    if (sourceType && isProviderSourceType(sourceType) && value.extensions[sourceType] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provider source metadata for ${sourceType} must be preserved under extensions.${sourceType}.`,
        path: ["extensions", sourceType],
      });
    }
  });

export const skillBundleSchema = z.object({
  manifest: skillManifestSchema,
  instructions: z.string().min(1),
  path: z.string().min(1).optional(),
  assets: stringArraySchema,
  examples: stringArraySchema,
  templates: stringArraySchema,
  tests: stringArraySchema,
});

export const activationContextSchema = z
  .object({
    query: z.string().default(""),
    tags: stringArraySchema,
    agentsMd: z.string().default(""),
    repoSignals: stringArraySchema,
    capabilities: z.array(capabilitySchema).default([]),
    activeSkillIds: stringArraySchema,
  })
  .default({
    query: "",
    tags: [],
    agentsMd: "",
    repoSignals: [],
    capabilities: [],
    activeSkillIds: [],
  });

export const recommendationSchema = z.object({
  skillId: z.string().min(1),
  score: z.number().finite(),
  reasons: z.array(z.string().min(1)).min(1),
  signals: z.array(z.string().min(1)).default([]),
  warnings: z.array(compatibilityWarningSchema).default([]),
});

export const validationIssueSchema = z.object({
  path: z.string(),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const validationResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    bundle: skillBundleSchema,
    warnings: z.array(compatibilityWarningSchema).default([]),
  }),
  z.object({
    ok: z.literal(false),
    errors: z.array(validationIssueSchema).min(1),
    warnings: z.array(compatibilityWarningSchema).default([]),
  }),
]);

export const importResultSchema = z.object({
  provider: z.string().min(1),
  bundles: z.array(skillBundleSchema),
  warnings: z.array(compatibilityWarningSchema).default([]),
  provenance: provenanceSchema.optional(),
});

export const exportResultSchema = z.object({
  provider: z.string().min(1),
  artifacts: z.array(
    z.object({
      path: z.string().min(1),
      contents: z.string(),
    }),
  ),
  warnings: z.array(compatibilityWarningSchema).default([]),
});

export type SkillKind = z.infer<typeof skillKindSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type RegistryLayer = z.infer<typeof registryLayerSchema>;
export type CapabilitySet = z.infer<typeof capabilitySetSchema>;
export type CompatibilityWarningOrigin = z.infer<typeof compatibilityWarningOriginSchema>;
export type CompatibilityWarning = z.infer<typeof compatibilityWarningSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillBundle = z.infer<typeof skillBundleSchema>;
export type ActivationContext = z.infer<typeof activationContextSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;
export type ExtensionNamespaces = z.infer<typeof extensionNamespacesSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;

export class SkillBundleValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map(formatValidationIssue).join("\n"));
    this.name = "SkillBundleValidationError";
    this.issues = issues;
  }
}

export function validateSkillManifest(input: unknown): SkillManifest {
  return skillManifestSchema.parse(input);
}

export function validateSkillBundle(input: unknown): ValidationResult {
  const parsed = skillBundleSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, bundle: parsed.data, warnings: [] };
  }

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "bundle",
      code: issue.code,
      message: issue.message,
    })),
    warnings: [],
  };
}

export function parseSkillBundle(input: unknown): SkillBundle {
  const result = validateSkillBundle(input);
  if (result.ok) return result.bundle;
  throw new SkillBundleValidationError(result.errors);
}

export function formatValidationIssue(issue: ValidationIssue): string {
  return `${issue.path} [${issue.code}]: ${issue.message}`;
}
