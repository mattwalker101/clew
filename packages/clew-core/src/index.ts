import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as fs from "node:fs";
import { exec, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { pipeline } from "@huggingface/transformers";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {
  type ActivationContext,
  activationContextSchema,
  type Capability,
  type CompositionResult,
  type CompatibilityWarning,
  type Recommendation,
  type RecommendationSignal,
  type RegistryLayer,
  type SkillBundle,
  type SkillManifest,
  type Suppression,
  compatibilityWarningSchema,
  compositionInputSchema,
  compositionResultSchema,
  formatValidationIssue,
  parseSkillBundle,
  suppressionSchema,
  SkillBundleValidationError,
  type SkillSearchSemanticMatch,
  type SkillSearchSemanticAnalysisResult,
  skillSearchSemanticMatchSchema,
  skillSearchSemanticAnalysisResultSchema,
} from "@clew-ops/schema";

export type RegistryEntry = {
  bundle: SkillBundle;
  layer: RegistryLayer;
  root: string;
  disabled: boolean;
  favorite: boolean;
  usageCount?: number;
  lastUsed?: string;
};

export type RegistrySnapshot = {
  entries: RegistryEntry[];
  warnings: CompatibilityWarning[];
  dbPath?: string;
};

export type SkillBundleDiscoveryResult = {
  bundles: SkillBundle[];
  warnings: CompatibilityWarning[];
};

export type TelemetryState = {
  disabled: string[];
  favorites: string[];
  usage: Record<string, number>;
  lastUsed?: Record<string, string>;
};

export type SqliteIndexResult = {
  dbPath: string;
  skills: number;
  overlaps: number;
  conflicts: number;
  warnings: number;
};

export type OverlapClassification = "complementary" | "redundant";

export type ConflictClassification = "conflicting";

export type RelationshipEvidence = {
  kind: string;
  values: string[];
};

export type SkillSearchEvidenceKind =
  | "identity"
  | "activation_trigger"
  | "activation_tag"
  | "tag"
  | "policy"
  | "required_capability"
  | "optional_capability"
  | "provider"
  | "parent"
  | "provenance"
  | "instructions_text";

export type SkillSearchEvidence = {
  kind: SkillSearchEvidenceKind;
  values: string[];
};

export type SkillSearchIndexEntry = {
  skillId: string;
  evidence: SkillSearchEvidence[];
};

export type SkillIndexAnalysisResult = {
  index: SkillSearchIndexEntry[];
};

export type SkillSearchMatch = {
  skillId: string;
  score: number;
  matchedTerms: string[];
  evidence: SkillSearchEvidence[];
  reasons: string[];
};

export { type SkillSearchSemanticMatch, type SkillSearchSemanticAnalysisResult };

export type SkillSearchAnalysisResult = {
  query: string;
  terms: string[];
  index: SkillSearchIndexEntry[];
  matches: SkillSearchMatch[];
};

export type SkillTelemetryEvidenceKind = "orphan" | "disabled" | "favorite" | "usage_count" | "last_used";

export type SkillTelemetryEvidence = {
  kind: SkillTelemetryEvidenceKind;
  values: string[];
};

export type SkillTelemetryAnalysisRecord = {
  skillId: string;
  known: boolean;
  enabled: boolean;
  disabled: boolean;
  favorite: boolean;
  usageCount: number;
  lastUsed?: string;
  evidence: SkillTelemetryEvidence[];
};

export type SkillTelemetryAnalysisResult = {
  records: SkillTelemetryAnalysisRecord[];
};

export type SkillActivationCandidateStatus = "included" | "excluded" | "suppressed";

export type SkillActivationScoreComponentKind =
  | "trigger"
  | "tag"
  | "agents_md"
  | "repo_signal"
  | "telemetry_favorite"
  | "telemetry_usage"
  | "project_preference"
  | "semantic";

export type SkillActivationScoreComponent = {
  kind: SkillActivationScoreComponentKind;
  value: string;
  points: number;
  reason: string;
};

export type SkillActivationExclusionKind = "disabled" | "unmatched" | "relationship" | "preference_violation";

export type SkillActivationExclusion = {
  kind: SkillActivationExclusionKind;
  reason: string;
};

export type SkillActivationCandidate = {
  skillId: string;
  enabled: boolean;
  status: SkillActivationCandidateStatus;
  score: number;
  rank?: number | undefined;
  components: SkillActivationScoreComponent[];
  reasons: string[];
  signals: RecommendationSignal[];
  warnings: CompatibilityWarning[];
  exclusions: SkillActivationExclusion[];
  suppression?: Suppression | undefined;
};

export type SkillActivationAnalysisResult = {
  context: ActivationContext;
  candidates: SkillActivationCandidate[];
  recommendations: Recommendation[];
};

export type OverlapRelationship = {
  ids: string[];
  triggers: string[];
  tags: string[];
  classification: OverlapClassification;
  evidence: RelationshipEvidence[];
};

export type ConflictRelationship = {
  ids: string[];
  reason: string;
  classification: ConflictClassification;
  evidence: RelationshipEvidence[];
};

export type RegistryOptions = {
  projectRoot?: string;
  org?: string;
  dbPath?: string;
  sessionBundles?: SkillBundle[];
  includeReferenceSkills?: boolean;
};

export type TelemetryRecord = {
  skillId: string;
  usageCount: number;
  lastUsed?: string;
  disabled: boolean;
  favorite: boolean;
};

type SqliteStatement = {
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
  run(...values: unknown[]): unknown;
};

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  transaction<T>(fn: () => T): () => T;
  loadExtension(path: string): void;
  close(): void;
};

export const registryPrecedence: RegistryLayer[] = ["session", "project", "org", "global"];

export function canonicalRegistryRoots(
  projectRoot = process.cwd(),
  org?: string,
  includeReferenceSkills = true,
): Record<RegistryLayer, string[]> {
  const projectRoots = [join(projectRoot, ".clew")];
  if (includeReferenceSkills) projectRoots.push(join(projectRoot, "skills"));
  return {
    session: [],
    project: projectRoots,
    org: org ? [join(homedir(), ".clew", "orgs", org)] : [],
    global: [join(homedir(), ".clew", "global")],
  };
}

export function parseAgentsMd(content: string): { activeSkillIds: string[]; preferences: string[] } {
  const active: string[] = [];
  const preferences: string[] = [];
  let activeSkillsHeaderLevel: number | undefined = undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      let level = 0;
      while (level < line.length && line[level] === "#") level++;

      if (level > 0 && level <= 6 && (level === line.length || line[level] === " ")) {
        const title = line.slice(level).trim();

        if (/^Active Skills$/i.test(title)) {
          activeSkillsHeaderLevel = level;
        } else if (activeSkillsHeaderLevel !== undefined && level <= activeSkillsHeaderLevel) {
          activeSkillsHeaderLevel = undefined;
        }
        continue;
      }
    }

    if (activeSkillsHeaderLevel !== undefined) {
      const match = line.match(/^-\s+`?([a-z0-9._-]+)`?\s*$/i);
      if (match?.[1]) active.push(match[1]);
    }

    if (
      !line.startsWith("#") &&
      /prefer|avoid|must|should|local-first|deterministic|explainable|always|never/i.test(line)
    ) {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        preferences.push(line);
      } else {
        preferences.push(line);
      }
    }
  }

  return { activeSkillIds: unique(active), preferences: unique(preferences) };
}

export function getAgentsMdDiagnostics(
  content: string,
  registry: SkillRegistry,
  projectRoot = process.cwd(),
): CompatibilityWarning[] {
  const diagnostics: CompatibilityWarning[] = [];
  const parsed = parseAgentsMd(content);
  const repoSignals = detectRepoSignals(projectRoot);

  for (const skillId of parsed.activeSkillIds) {
    const entry = registry.entries.find((candidate) => candidate.bundle.manifest.id === skillId);
    if (!entry) {
      diagnostics.push({
        code: "agents_skill_unknown",
        message: `AGENTS.md references unknown skill "${skillId}".`,
        severity: "warning",
        origin: "agents_diagnostic",
        field: "AGENTS.md",
      });
    } else if (entry.disabled) {
      diagnostics.push({
        code: "agents_skill_disabled",
        message: `AGENTS.md references disabled skill "${skillId}".`,
        severity: "warning",
        origin: "agents_diagnostic",
        field: "AGENTS.md",
      });
    } else {
      const skill = entry.bundle.manifest;
      const mismatchingSignals = [...skill.activation.triggers, ...skill.tags].filter(
        (t) =>
          ["typescript", "python", "go", "rust", "node", "pnpm", "npm", "yarn", "testing"].includes(t) &&
          !repoSignals.includes(t as any),
      );

      if (mismatchingSignals.length > 0) {
        diagnostics.push({
          code: "agents_skill_mismatch",
          message: `AGENTS.md references skill "${skillId}" which expects repository signals [${mismatchingSignals.join(", ")}] not detected in this project.`,
          severity: "info",
          origin: "agents_diagnostic",
          field: "AGENTS.md",
        });
      }
    }
  }
  return diagnostics;
}

export function detectRepoSignals(projectRoot = process.cwd()): string[] {
  const signals = new Set<string>();
  const packageJsonPath = join(projectRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    signals.add("node");
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        packageManager?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (packageJson.packageManager?.startsWith("pnpm@")) signals.add("pnpm");
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      for (const dependency of Object.keys(dependencies)) {
        if (dependency === "typescript" || dependency.startsWith("@types/")) signals.add("typescript");
        if (dependency === "zod") signals.add("zod");
        if (dependency === "vitest") signals.add("testing");
      }
    } catch {
      signals.add("package-json-unreadable");
    }
  }
  if (existsSync(join(projectRoot, "tsconfig.json")) || existsSync(join(projectRoot, "tsconfig.base.json"))) {
    signals.add("typescript");
  }
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) signals.add("pnpm");
  if (existsSync(join(projectRoot, ".git"))) signals.add("git");
  return [...signals].sort();
}

export function parseYaml(input: string): unknown {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> | unknown[] }> = [{ indent: -1, value: root }];
  const lines = input.split(/\r?\n/);

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const trimmed = rawLine.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.value;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`YAML list item has no list parent: ${trimmed}`);
      const remainder = trimmed.slice(2).trim();
      const firstChar = remainder[0];
      const hasColon = remainder.includes(":");
      const isMapping = hasColon && firstChar !== '"' && firstChar !== "'";

      if (isMapping) {
        const item: Record<string, unknown> = {};
        parent.push(item);
        const separator = remainder.indexOf(":");
        const key = remainder.slice(0, separator).trim();
        const rawValue = remainder.slice(separator + 1).trim();
        if (rawValue) {
          item[key] = parseScalar(rawValue);
        } else {
          const next = nextContentLine(lines, lines.indexOf(rawLine) + 1);
          const child = next?.trim().startsWith("- ") ? [] : {};
          item[key] = child;
          stack.push({ indent, value: child });
        }
        stack.push({ indent, value: item });
        continue;
      } else {
        parent.push(parseScalar(remainder));
        continue;
      }
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) throw new Error(`Invalid YAML line: ${trimmed}`);
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (Array.isArray(parent)) throw new Error(`YAML mapping cannot be nested directly in a list: ${trimmed}`);

    if (rawValue) {
      parent[key] = parseScalar(rawValue);
      continue;
    }

    const next = nextContentLine(lines, lines.indexOf(rawLine) + 1);
    const child: Record<string, unknown> | unknown[] = next?.trim().startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }

  return root;
}

function nextContentLine(lines: string[], start: number): string | undefined {
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line?.trim() && !line.trimStart().startsWith("#")) return line;
  }
  return undefined;
}

function parseScalar(value: string): unknown {
  if (value === "[]") return [];
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function stringifyYaml(value: unknown, indent = 0): string {
  if (!isRecord(value)) return `${value ?? ""}`;
  const lines: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      if (child.length === 0) continue;
      lines.push(`${" ".repeat(indent)}${key}:`);
      for (const item of child) lines.push(`${" ".repeat(indent + 2)}- ${item}`);
    } else if (isRecord(child)) {
      const childYaml = stringifyYaml(child, indent + 2);
      if (!childYaml.trim()) continue;
      lines.push(`${" ".repeat(indent)}${key}:`);
      lines.push(childYaml);
    } else if (child !== undefined && child !== null && child !== "") {
      lines.push(`${" ".repeat(indent)}${key}: ${child}`);
    }
  }
  return lines.join("\n");
}

export function loadSkillBundle(directory: string): SkillBundle {
  const manifestPath = join(directory, "clew.yaml");
  const manifest = parseYaml(readFileSync(manifestPath, "utf8"));
  const instructionFile = manifestInstructionFile(manifest);
  if (!instructionFile) return parseSkillBundle({ manifest, instructions: "" });
  const instructionPath = join(directory, instructionFile);
  const bundle = {
    manifest,
    instructions: readFileSync(instructionPath, "utf8"),
    path: directory,
    examples: childPaths(directory, "examples"),
    templates: childPaths(directory, "templates"),
    assets: childPaths(directory, "assets"),
    tests: childPaths(directory, "tests"),
  };
  return parseSkillBundle(bundle);
}

function manifestInstructionFile(manifest: unknown): string | undefined {
  if (!isRecord(manifest)) return undefined;
  const instructions = manifest.instructions;
  if (!isRecord(instructions)) return undefined;
  return typeof instructions.file === "string" && instructions.file ? instructions.file : undefined;
}

export function discoverSkillBundles(root: string): SkillBundleDiscoveryResult {
  if (!existsSync(root)) return { bundles: [], warnings: [] };
  const candidates = readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "clew.yaml")))
    .sort((a, b) => a.localeCompare(b));
  const bundles: SkillBundle[] = [];
  const warnings: CompatibilityWarning[] = [];

  for (const candidate of candidates) {
    try {
      bundles.push(loadSkillBundle(candidate));
    } catch (error) {
      if (!(error instanceof SkillBundleValidationError)) throw error;
      warnings.push({
        code: "skill_bundle_invalid",
        severity: "error",
        origin: "registry_rebuild",
        field: candidate,
        message: error.issues.map(formatValidationIssue).join("\n"),
      });
    }
  }

  return {
    bundles: bundles.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)),
    warnings: sortWarnings(warnings),
  };
}

export function rebuildRegistry(options: RegistryOptions & { telemetry?: TelemetryState } = {}): RegistrySnapshot {
  const roots = canonicalRegistryRoots(
    options.projectRoot ?? process.cwd(),
    options.org,
    options.includeReferenceSkills ?? true,
  );
  const entries: RegistryEntry[] = [];
  const warnings: CompatibilityWarning[] = [];
  const telemetry = options.telemetry ?? { disabled: [], favorites: [], usage: {} };

  for (const bundle of options.sessionBundles ?? []) {
    entries.push(toEntry(bundle, "session", bundle.path ?? "session", telemetry));
  }
  for (const layer of ["project", "org", "global"] as const) {
    for (const root of roots[layer]) {
      const discovery = discoverSkillBundles(root);
      warnings.push(...discovery.warnings);
      for (const bundle of discovery.bundles) {
        entries.push(toEntry(bundle, layer, root, telemetry));
      }
    }
  }

  return { entries: resolveRegistryEntries(entries), warnings: sortWarnings(warnings) };
}

export async function rebuildRegistryIndex(options: RegistryOptions = {}): Promise<RegistrySnapshot> {
  const dbPath = options.dbPath ?? join(options.projectRoot ?? process.cwd(), ".clew-registry.db");
  const db = openRegistryDb(dbPath);
  try {
    const snapshot = rebuildRegistry({ ...options, telemetry: db.getTelemetryState() });
    db.rebuildIndex(snapshot);

    // Semantic indexing
    const engine = new EmbeddingEngine();
    for (const entry of snapshot.entries) {
      const text = `${entry.bundle.manifest.name}. ${entry.bundle.manifest.description ?? ""}. ${entry.bundle.instructions}`;
      const embedding = await engine.embed(text);
      db.upsertEmbedding(entry.bundle.manifest.id, embedding);
    }

    const result: RegistrySnapshot = {
      entries: snapshot.entries,
      warnings: snapshot.warnings,
      dbPath,
    };
    return result;
  } finally {
    db.close();
  }
}

export function composeSkill(bundle: SkillBundle, parents: SkillBundle[]): SkillBundle {
  return composeSkillWithReport(bundle, parents).bundle;
}

export function composeRegistrySkill(registry: SkillRegistry, skillId: string): SkillBundle | undefined {
  return composeRegistrySkillWithReport(registry, skillId)?.bundle;
}

export function composeRegistrySkillWithReport(
  registry: SkillRegistry,
  skillId: string,
): CompositionResult | undefined {
  const bundle = registry.lookup(skillId);
  if (!bundle) return undefined;
  const parents = bundle.manifest.extends
    .map((parentId) => registry.lookup(parentId))
    .filter((parent): parent is SkillBundle => parent !== undefined);
  return composeSkillWithReport(bundle, parents);
}

export function composeSkillWithReport(bundle: SkillBundle, parents: SkillBundle[]): CompositionResult {
  const input = compositionInputSchema.parse({ bundle, parents });
  const parentsById = new Map(input.parents.map((parent) => [parent.manifest.id, parent]));
  const orderedParents = input.bundle.manifest.extends
    .map((parentId) => parentsById.get(parentId))
    .filter((parent): parent is SkillBundle => parent !== undefined);
  const manifest: SkillManifest = {
    ...input.bundle.manifest,
    tags: unique([...orderedParents.flatMap((parent) => parent.manifest.tags), ...input.bundle.manifest.tags]),
    policies: unique([
      ...orderedParents.flatMap((parent) => parent.manifest.policies),
      ...input.bundle.manifest.policies,
    ]),
    extends: unique(input.bundle.manifest.extends),
    capabilities: {
      required: uniqueCapability([
        ...orderedParents.flatMap((parent) => parent.manifest.capabilities.required),
        ...input.bundle.manifest.capabilities.required,
      ]),
      optional: uniqueCapability([
        ...orderedParents.flatMap((parent) => parent.manifest.capabilities.optional),
        ...input.bundle.manifest.capabilities.optional,
      ]),
    },
    compatibility: {
      providers: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.compatibility.providers),
        ...input.bundle.manifest.compatibility.providers,
      ]),
      incompatible_with: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.compatibility.incompatible_with ?? []),
        ...(input.bundle.manifest.compatibility.incompatible_with ?? []),
      ]),
      warnings: [
        ...orderedParents.flatMap((parent) => parent.manifest.compatibility.warnings),
        ...input.bundle.manifest.compatibility.warnings,
      ],
    },
    activation: {
      ...orderedParents.reduce<Record<string, unknown>>(
        (merged, parent) => ({ ...merged, ...parent.manifest.activation }),
        {},
      ),
      ...input.bundle.manifest.activation,
      triggers: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.activation.triggers),
        ...input.bundle.manifest.activation.triggers,
      ]),
      tags: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.activation.tags),
        ...input.bundle.manifest.activation.tags,
      ]),
      weight: input.bundle.manifest.activation.weight,
    },
  };
  return compositionResultSchema.parse({
    bundle: { ...input.bundle, manifest },
    appliedParentIds: orderedParents.map((parent) => parent.manifest.id),
    warnings: [],
  });
}

const overlapEvidenceKindOrder = [
  "shared_trigger",
  "shared_tag",
  "shared_policy",
  "shared_required_capability",
  "shared_optional_capability",
  "common_parent",
  "shared_provider",
  "shared_provenance",
] as const;

const conflictEvidenceKindOrder = ["missing_parent", "declared_incompatibility"] as const;

export function findOverlaps(bundles: SkillBundle[]): OverlapRelationship[] {
  const overlaps: OverlapRelationship[] = [];
  for (let left = 0; left < bundles.length; left += 1) {
    for (let right = left + 1; right < bundles.length; right += 1) {
      const a = bundles[left]!;
      const b = bundles[right]!;
      const triggers = intersection(a.manifest.activation.triggers, b.manifest.activation.triggers);
      const tags = intersection(a.manifest.tags, b.manifest.tags);
      const evidence = sortEvidence(
        [
          relationshipEvidence("shared_trigger", triggers),
          relationshipEvidence("shared_tag", tags),
          relationshipEvidence("shared_policy", intersection(a.manifest.policies, b.manifest.policies)),
          relationshipEvidence(
            "shared_required_capability",
            intersection(a.manifest.capabilities.required, b.manifest.capabilities.required),
          ),
          relationshipEvidence(
            "shared_optional_capability",
            intersection(a.manifest.capabilities.optional, b.manifest.capabilities.optional),
          ),
          relationshipEvidence("common_parent", intersection(a.manifest.extends, b.manifest.extends)),
          relationshipEvidence(
            "shared_provider",
            intersection(a.manifest.compatibility.providers, b.manifest.compatibility.providers),
          ),
          relationshipEvidence(
            "shared_provenance",
            intersection(provenanceSearchValues(a.manifest.provenance), provenanceSearchValues(b.manifest.provenance)),
          ),
        ],
        overlapEvidenceKindOrder,
      );
      if (evidence.length) {
        overlaps.push({
          ids: [a.manifest.id, b.manifest.id].sort(),
          triggers,
          tags,
          classification: classifyOverlap(evidence),
          evidence,
        });
      }
    }
  }
  return sortRelationships(overlaps);
}

export function findConflicts(bundles: SkillBundle[]): ConflictRelationship[] {
  const conflicts: ConflictRelationship[] = [];
  const byId = new Map(bundles.map((bundle) => [bundle.manifest.id, bundle]));
  const declaredConflictIds = new Set<string>();
  for (const bundle of bundles) {
    for (const parentId of bundle.manifest.extends) {
      if (!byId.has(parentId)) {
        conflicts.push({
          ids: [bundle.manifest.id, parentId],
          reason: "missing parent skill",
          classification: "conflicting",
          evidence: sortEvidence([relationshipEvidence("missing_parent", [parentId])], conflictEvidenceKindOrder),
        });
      }
    }
    for (const incompatibleSkillId of bundle.manifest.compatibility.incompatible_with ?? []) {
      if (!byId.has(incompatibleSkillId)) continue;
      const ids = [bundle.manifest.id, incompatibleSkillId].sort();
      const conflictId = ids.join(":");
      if (declaredConflictIds.has(conflictId)) continue;
      declaredConflictIds.add(conflictId);
      conflicts.push({
        ids,
        reason: "declared incompatible skill",
        classification: "conflicting",
        evidence: sortEvidence([relationshipEvidence("declared_incompatibility", ids)], conflictEvidenceKindOrder),
      });
    }
  }
  return sortRelationships(conflicts);
}

export function rebuildSqliteIndex(dbPath: string, snapshot: RegistrySnapshot): SqliteIndexResult {
  const db = openRegistryDb(dbPath);
  try {
    return db.rebuildIndex(snapshot);
  } finally {
    db.close();
  }
}

export function openRegistryDb(dbPath: string): RegistryDb {
  return new RegistryDb(dbPath);
}

export function openSessionDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_runs (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed')),
      current_step_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_step_states (
      session_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed', 'failed')),
      attempts INTEGER DEFAULT 0,
      last_verified_at TEXT,
      error_log TEXT,
      PRIMARY KEY (session_id, step_id),
      FOREIGN KEY (session_id) REFERENCES session_runs(id) ON DELETE CASCADE
    );
  `);
  
  return db;
}

export interface VerificationResult {
  success: boolean;
  gates: {
    type: "file" | "grep" | "command";
    success: boolean;
    message?: string;
    error?: string;
  }[];
}

export class SessionManager {
  constructor(
    private db: DatabaseSync,
    private registry: { getSkill: (id: string) => Promise<any> },
    private options?: {
      confirmCommand?: (command: string, description?: string) => Promise<boolean>;
    }
  ) {}

  async createSession(skillId: string) {
    const skill = await this.registry.getSkill(skillId);
    if (!skill || !skill.steps || skill.steps.length === 0) {
      throw new Error(`Skill ${skillId} has no runbook steps.`);
    }

    const sessionId = randomBytes(9).toString("base64url");
    const now = new Date().toISOString();
    const firstStep = skill.steps[0].id;

    this.db.prepare(`
      INSERT INTO session_runs (id, skill_id, status, current_step_id, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?)
    `).run(sessionId, skillId, firstStep, now, now);

    for (const step of skill.steps) {
      this.db.prepare(`
        INSERT INTO session_step_states (session_id, step_id, status)
        VALUES (?, ?, ?)
      `).run(sessionId, step.id, step.id === firstStep ? 'active' : 'pending');
    }

    return { id: sessionId, status: "active", current_step_id: firstStep };
  }

  async getCurrentStep(sessionId: string) {
    const run: any = this.db.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId);
    if (!run || run.status !== "active" || !run.current_step_id) {
      return null;
    }
    const skill = await this.registry.getSkill(run.skill_id);
    return skill.steps.find((s: any) => s.id === run.current_step_id) || null;
  }

  async verifyCurrentStep(sessionId: string): Promise<VerificationResult> {
    const step = await this.getCurrentStep(sessionId);
    if (!step) {
      return { success: false, gates: [{ type: "file", success: false, error: "No active step found" }] };
    }

    const gateResults: VerificationResult["gates"] = [];
    let allPassed = true;

    // Run constitutional security checks
    const secCheck = await checkSecuritySettings(process.cwd(), { cached: false });
    if (!secCheck.valid) {
      allPassed = false;
      for (const err of secCheck.errors) {
        gateResults.push({
          type: "file" as any,
          success: false,
          error: `[CONSTITUTIONAL_VETO] ${err}`
        });
      }
    }

    for (const gate of step.gates) {
      let passed = false;
      let errorMsg: string | undefined;

      try {
        if (gate.type === "file") {
          passed = fs.existsSync(gate.path) && fs.statSync(gate.path).isFile();
          if (!passed) errorMsg = `File not found: ${gate.path}`;
        } else if (gate.type === "grep") {
          if (fs.existsSync(gate.path)) {
            const content = fs.readFileSync(gate.path, "utf-8");
            passed = new RegExp(gate.pattern).test(content);
            if (!passed) errorMsg = `Pattern /${gate.pattern}/ not found in ${gate.path}`;
          } else {
            errorMsg = `File not found: ${gate.path}`;
          }
        } else if (gate.type === "command") {
          let allowed = true;
          if (this.options?.confirmCommand) {
            allowed = await this.options.confirmCommand(gate.command, gate.description);
          }
          if (allowed) {
            passed = await new Promise<boolean>((resolve) => {
              const cp = exec(gate.command, { timeout: gate.timeoutMs || 15000 }, (error) => {
                if (error) {
                  errorMsg = error.message;
                  resolve(false);
                } else {
                  resolve(true);
                }
              });
            });
          } else {
            passed = false;
            errorMsg = "Command execution verification denied by user.";
          }
        }
      } catch (err: any) {
        errorMsg = err.message;
        passed = false;
      }

      gateResults.push({
        type: gate.type as any,
        success: passed,
        ...(errorMsg !== undefined ? { error: errorMsg } : {})
      });
      if (!passed) allPassed = false;
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE session_step_states
      SET status = ?, attempts = attempts + 1, last_verified_at = ?, error_log = ?
      WHERE session_id = ? AND step_id = ?
    `).run(
      allPassed ? "completed" : "failed",
      now,
      allPassed ? null : JSON.stringify(gateResults),
      sessionId,
      step.id
    );

    if (allPassed) {
      const run: any = this.db.prepare("SELECT * FROM session_runs WHERE id = ?").get(sessionId);
      const skill = await this.registry.getSkill(run.skill_id);
      const currentIndex = skill.steps.findIndex((s: any) => s.id === step.id);
      const nextStep = skill.steps[currentIndex + 1];

      if (nextStep) {
        this.db.prepare(`
          UPDATE session_runs SET current_step_id = ?, updated_at = ? WHERE id = ?
        `).run(nextStep.id, now, sessionId);

        this.db.prepare(`
          UPDATE session_step_states SET status = 'active' WHERE session_id = ? AND step_id = ?
        `).run(sessionId, nextStep.id);
      } else {
        this.db.prepare(`
          UPDATE session_runs SET status = 'completed', current_step_id = NULL, updated_at = ? WHERE id = ?
        `).run(now, sessionId);
      }
    }

    return { success: allPassed, gates: gateResults };
  }
}



export class EmbeddingEngine {
  private static extractor: any | undefined = undefined;

  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  }

  private async getExtractor() {
    if (!EmbeddingEngine.extractor) {
      EmbeddingEngine.extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return EmbeddingEngine.extractor;
  }
}

export class RegistryDb {
  private readonly db: SqliteDatabase;

  constructor(readonly dbPath: string) {
    this.db = openSqliteDatabase(dbPath);
    sqliteVec.load(this.db);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        root TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        disabled INTEGER NOT NULL,
        favorite INTEGER NOT NULL,
        manifest_json TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_skills USING vec0(
        skill_id TEXT PRIMARY KEY,
        embedding float[384]
      );
      CREATE TABLE IF NOT EXISTS telemetry (
        skill_id TEXT PRIMARY KEY,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS overlaps (
        id TEXT PRIMARY KEY,
        left_skill_id TEXT NOT NULL,
        right_skill_id TEXT NOT NULL,
        triggers_json TEXT NOT NULL,
        tags_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        left_skill_id TEXT NOT NULL,
        right_skill_id TEXT NOT NULL,
        reason TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_warnings (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        code TEXT NOT NULL,
        severity TEXT NOT NULL,
        field TEXT,
        message TEXT NOT NULL,
        provider TEXT,
        warning_json TEXT NOT NULL
      );
    `);
  }

  getTelemetry(skillId: string): TelemetryRecord {
    const row = this.db
      .prepare("SELECT skill_id, usage_count, last_used, disabled, favorite FROM telemetry WHERE skill_id = ?")
      .get(skillId) as
      | { skill_id: string; usage_count: number; last_used: string | null; disabled: number; favorite: number }
      | undefined;
    if (!row) {
      return { skillId, usageCount: 0, disabled: false, favorite: false };
    }
    return {
      skillId: row.skill_id,
      usageCount: row.usage_count,
      ...(row.last_used ? { lastUsed: row.last_used } : {}),
      disabled: row.disabled === 1,
      favorite: row.favorite === 1,
    };
  }

  getTelemetryState(): TelemetryState {
    const rows = this.db
      .prepare("SELECT skill_id, usage_count, last_used, disabled, favorite FROM telemetry")
      .all() as Array<{ skill_id: string; usage_count: number; last_used: string | null; disabled: number; favorite: number }>;
    return {
      disabled: rows.filter((row) => row.disabled === 1).map((row) => row.skill_id).sort(),
      favorites: rows.filter((row) => row.favorite === 1).map((row) => row.skill_id).sort(),
      usage: Object.fromEntries(rows.map((row) => [row.skill_id, row.usage_count])),
      lastUsed: Object.fromEntries(rows.flatMap((row) => (row.last_used ? [[row.skill_id, row.last_used]] : []))),
    };
  }

  listTelemetry(): TelemetryRecord[] {
    const rows = this.db
      .prepare("SELECT skill_id FROM telemetry ORDER BY skill_id")
      .all() as Array<{ skill_id: string }>;
    return rows.map((row) => this.getTelemetry(row.skill_id));
  }

  listRegistryWarnings(): CompatibilityWarning[] {
    const rows = this.db
      .prepare("SELECT warning_json FROM registry_warnings ORDER BY position")
      .all() as Array<{ warning_json: string }>;
    return rows.map((row) => compatibilityWarningSchema.parse(JSON.parse(row.warning_json)));
  }

  searchSemantic(queryEmbedding: Float32Array, k = 10): Array<{ skillId: string; distance: number }> {
    const rows = this.db
      .prepare(
        `
        SELECT 
          skill_id, 
          distance 
        FROM vec_skills 
        WHERE embedding MATCH ? 
          AND k = ?
      `,
      )
      .all(Buffer.from(queryEmbedding.buffer), k) as Array<{ skill_id: string; distance: number }>;

    return rows.map((row) => ({
      skillId: (row as any).skill_id,
      distance: row.distance,
    }));
  }

  upsertEmbedding(skillId: string, embedding: Float32Array): void {
    this.db.prepare("DELETE FROM vec_skills WHERE skill_id = ?").run(skillId);
    this.db
      .prepare("INSERT INTO vec_skills(skill_id, embedding) VALUES (?, ?)")
      .run(skillId, Buffer.from(embedding.buffer));
  }

  setSkillDisabled(skillId: string, disabled: boolean): void {
    this.db
      .prepare(
        "INSERT INTO telemetry (skill_id, disabled) VALUES (?, ?) ON CONFLICT(skill_id) DO UPDATE SET disabled=excluded.disabled",
      )
      .run(skillId, disabled ? 1 : 0);
  }

  setSkillFavorite(skillId: string, favorite: boolean): void {
    this.db
      .prepare(
        "INSERT INTO telemetry (skill_id, favorite) VALUES (?, ?) ON CONFLICT(skill_id) DO UPDATE SET favorite=excluded.favorite",
      )
      .run(skillId, favorite ? 1 : 0);
  }

  recordRecommendation(skillId: string): void {
    this.db
      .prepare(
        "INSERT INTO telemetry (skill_id, usage_count, last_used) VALUES (?, 1, ?) ON CONFLICT(skill_id) DO UPDATE SET usage_count=usage_count + 1, last_used=excluded.last_used",
      )
      .run(skillId, new Date().toISOString());
  }

  rebuildIndex(snapshot: RegistrySnapshot): SqliteIndexResult {
    const bundles = snapshot.entries.map((entry) => entry.bundle);
    const overlaps = findOverlaps(bundles);
    const conflicts = findConflicts(bundles);
    const transaction = this.db.transaction(() => {
      this.db.exec("DELETE FROM skills; DELETE FROM overlaps; DELETE FROM conflicts; DELETE FROM registry_warnings;");
      const insertSkill = this.db.prepare(
        "INSERT INTO skills (id, layer, root, version, name, disabled, favorite, manifest_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const upsertTelemetry = this.db.prepare(
        "INSERT INTO telemetry (skill_id, usage_count, disabled, favorite) VALUES (?, 0, ?, ?) ON CONFLICT(skill_id) DO UPDATE SET disabled=excluded.disabled, favorite=excluded.favorite",
      );
      for (const entry of snapshot.entries) {
        insertSkill.run(
          entry.bundle.manifest.id,
          entry.layer,
          entry.root,
          entry.bundle.manifest.version,
          entry.bundle.manifest.name,
          entry.disabled ? 1 : 0,
          entry.favorite ? 1 : 0,
          JSON.stringify(entry.bundle.manifest),
        );
        upsertTelemetry.run(entry.bundle.manifest.id, entry.disabled ? 1 : 0, entry.favorite ? 1 : 0);
      }
      const insertOverlap = this.db.prepare(
        "INSERT INTO overlaps (id, left_skill_id, right_skill_id, triggers_json, tags_json) VALUES (?, ?, ?, ?, ?)",
      );
      for (const overlap of overlaps) {
        const [leftSkillId, rightSkillId] = overlap.ids;
        insertOverlap.run(
          overlap.ids.join(":"),
          leftSkillId,
          rightSkillId,
          JSON.stringify(overlap.triggers),
          JSON.stringify(overlap.tags),
        );
      }
      const insertConflict = this.db.prepare(
        "INSERT INTO conflicts (id, left_skill_id, right_skill_id, reason) VALUES (?, ?, ?, ?)",
      );
      for (const conflict of conflicts) {
        const [leftSkillId, rightSkillId] = conflict.ids;
        insertConflict.run(conflict.ids.join(":"), leftSkillId, rightSkillId, conflict.reason);
      }
      const insertWarning = this.db.prepare(
        "INSERT INTO registry_warnings (id, position, code, severity, field, message, provider, warning_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      snapshot.warnings.forEach((warning, position) => {
        insertWarning.run(
          String(position),
          position,
          warning.code,
          warning.severity,
          warning.field ?? null,
          warning.message,
          warning.provider ?? null,
          JSON.stringify(warning),
        );
      });
    });
    transaction();
    return {
      dbPath: this.dbPath,
      skills: snapshot.entries.length,
      overlaps: overlaps.length,
      conflicts: conflicts.length,
      warnings: snapshot.warnings.length,
    };
  }

  close(): void {
    this.db.close();
  }
}

function openSqliteDatabase(dbPath: string): SqliteDatabase {
  try {
    const db = new Database(dbPath);
    return {
      exec(sql: string) {
        db.exec(sql);
      },
      prepare(sql: string) {
        return db.prepare(sql);
      },
      transaction<T>(fn: () => T) {
        return db.transaction(fn) as () => T;
      },
      loadExtension(path: string) {
        db.loadExtension(path);
      },
      close() {
        db.close();
      },
    };
  } catch (error) {
    const require = createRequire(import.meta.url);
    const sqlite = require("node:sqlite") as {
      DatabaseSync: new (path: string, options?: { allowExtension?: boolean }) => {
        exec(sql: string): void;
        prepare(sql: string): SqliteStatement;
        loadExtension?(path: string): void;
        close(): void;
      };
    };
    const db = new sqlite.DatabaseSync(dbPath, { allowExtension: true });
    return {
      exec(sql: string) {
        db.exec(sql);
      },
      prepare(sql: string) {
        return db.prepare(sql);
      },
      transaction<T>(fn: () => T) {
        return () => {
          db.exec("BEGIN");
          try {
            const result = fn();
            db.exec("COMMIT");
            return result;
          } catch (transactionError) {
            db.exec("ROLLBACK");
            throw transactionError;
          }
        };
      },
      loadExtension(path: string) {
        if (db.loadExtension) {
          db.loadExtension(path);
        }
      },
      close() {
        db.close();
      },
    };
  }
}

export class SkillRegistry {
  readonly entries: RegistryEntry[];
  readonly warnings: CompatibilityWarning[];
  readonly dbPath?: string | undefined;

  constructor(snapshot: RegistrySnapshot) {
    this.entries = snapshot.entries;
    this.warnings = snapshot.warnings;
    this.dbPath = snapshot.dbPath ?? undefined;
  }

  static async fromProject(projectRoot = process.cwd()): Promise<SkillRegistry> {
    return new SkillRegistry(await rebuildRegistryIndex({ projectRoot }));
  }

  list(): SkillBundle[] {
    return this.entries.filter((entry) => !entry.disabled).map((entry) => entry.bundle);
  }

  lookup(id: string): SkillBundle | undefined {
    return this.entries
      .filter((entry) => entry.bundle.manifest.id === id && !entry.disabled)
      .sort(entrySort)[0]?.bundle;
  }

  analyzeIndex(): SkillIndexAnalysisResult {
    const enabledEntries = [...this.entries].filter((entry) => !entry.disabled).sort(entrySort);
    const index = enabledEntries.map((entry) => buildSearchIndexEntry(entry.bundle));

    return { index };
  }

  analyzeSearch(query: string): SkillSearchAnalysisResult {
    const terms = normalizeTerms(query);
    const { index } = this.analyzeIndex();
    const matches = index
      .map((entry) => matchSearchIndexEntry(entry, terms))
      .filter((match): match is SkillSearchMatch => match !== undefined)
      .sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId));

    return { query, terms, index, matches };
  }

  analyzeTelemetry(records: TelemetryRecord[] = []): SkillTelemetryAnalysisResult {
    const knownSkillIds = new Set(this.entries.map((entry) => entry.bundle.manifest.id));
    const knownRecords = [...this.entries]
      .sort((a, b) => a.bundle.manifest.id.localeCompare(b.bundle.manifest.id))
      .map((entry) => {
        const lastUsed = entry.lastUsed;
        return telemetryAnalysisRecord({
          skillId: entry.bundle.manifest.id,
          known: true,
          enabled: !entry.disabled,
          disabled: entry.disabled,
          favorite: entry.favorite,
          usageCount: entry.usageCount ?? 0,
          ...(lastUsed ? { lastUsed } : {}),
        });
      });
    const orphanRecords = records
      .filter((record) => !knownSkillIds.has(record.skillId))
      .sort((a, b) => a.skillId.localeCompare(b.skillId))
      .map((record) => {
        const lastUsed = record.lastUsed;
        return telemetryAnalysisRecord({
          skillId: record.skillId,
          known: false,
          enabled: false,
          disabled: record.disabled,
          favorite: record.favorite,
          usageCount: record.usageCount,
          ...(lastUsed ? { lastUsed } : {}),
        });
      });

    return { records: [...knownRecords, ...orphanRecords] };
  }

  search(query: string): SkillBundle[] {
    const bySkillId = new Map(this.list().map((bundle) => [bundle.manifest.id, bundle]));
    return this.analyzeSearch(query).matches.flatMap((match) => {
      const bundle = bySkillId.get(match.skillId);
      return bundle ? [bundle] : [];
    });
  }

  async searchSemantic(query: string, limit?: number): Promise<SkillBundle[]> {
    if (!this.dbPath) return [];
    const db = openRegistryDb(this.dbPath);
    try {
      const engine = new EmbeddingEngine();
      const embedding = await engine.embed(query);
      const matches = db.searchSemantic(embedding, limit);
      const bySkillId = new Map(this.list().map((bundle) => [bundle.manifest.id, bundle]));
      return matches.flatMap((match) => {
        const bundle = bySkillId.get(match.skillId);
        return bundle ? [bundle] : [];
      });
    } finally {
      db.close();
    }
  }

  async analyzeSearchSemantic(query: string, limit?: number): Promise<SkillSearchSemanticAnalysisResult> {
    if (!this.dbPath) return { query, matches: [] };
    const db = openRegistryDb(this.dbPath);
    try {
      const engine = new EmbeddingEngine();
      const embedding = await engine.embed(query);
      const matches = db.searchSemantic(embedding, limit);
      return {
        query,
        matches: matches.map((m) => {
          const similarityScore = 1 / (1 + m.distance);
          return {
            skillId: m.skillId,
            distance: m.distance,
            score: Number(similarityScore.toFixed(4)),
            reasons: [`semantic similarity match (distance: ${m.distance.toFixed(4)})`],
          };
        }),
      };
    } finally {
      db.close();
    }
  }
}

export class ActivationEngine {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly db?: RegistryDb,
  ) {}

  async analyzeRecommendations(input: Partial<ActivationContext>): Promise<SkillActivationAnalysisResult> {
    const context = activationContextSchema.parse(input);

    const semanticMatches = new Map<string, number>();
    if (this.db) {
      const engine = new EmbeddingEngine();
      const embedding = await engine.embed(context.query);
      const matches = this.db.searchSemantic(embedding);
      for (const match of matches) {
        semanticMatches.set(match.skillId, match.distance);
      }
    }

    const candidates = [...this.registry.entries]
      .sort(entrySort)
      .map((entry) => analyzeActivationCandidate(entry, context, semanticMatches.get(entry.bundle.manifest.id)));

    const entryById = new Map(this.registry.entries.map((entry) => [entry.bundle.manifest.id, entry]));
    const included = candidates
      .filter((candidate) => candidate.status === "included")
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        const entryA = entryById.get(a.skillId)!;
        const entryB = entryById.get(b.skillId)!;
        return entrySort(entryA, entryB);
      });
    const bySkillId = new Map(this.registry.entries.map((entry) => [entry.bundle.manifest.id, entry.bundle]));
    const includedWithRelationships = withActivationRelationships(
      included.flatMap((candidate) => {
        const bundle = bySkillId.get(candidate.skillId);
        return bundle ? [{ bundle, recommendation: candidateRecommendation(candidate) }] : [];
      }),
      this.registry.list(),
    );

    const suppressedIds = new Set(
      includedWithRelationships.filter((item) => item.recommendation.suppression).map((item) => item.recommendation.skillId),
    );

    const recommendationBySkillId = new Map(
      includedWithRelationships
        .filter((item) => !item.recommendation.suppression)
        .map((item, index) => [
          item.recommendation.skillId,
          { recommendation: item.recommendation, rank: index + 1 },
        ]),
    );

    const processedIncluded = included.map((candidate) => {
      const ranked = recommendationBySkillId.get(candidate.skillId);
      const relationship = includedWithRelationships.find((item) => item.recommendation.skillId === candidate.skillId);
      const status: SkillActivationCandidateStatus = suppressedIds.has(candidate.skillId) ? "suppressed" : "included";

      const result: SkillActivationCandidate = {
        ...candidate,
        status,
        rank: ranked ? ranked.rank : undefined,
        warnings: relationship?.recommendation.warnings ?? candidate.warnings,
        suppression: relationship?.recommendation.suppression ?? undefined,
      };
      return result;
    });

    const suppressed = [
      ...processedIncluded.filter((c) => c.status === "suppressed"),
      ...candidates.filter((c) => c.status === "suppressed"),
    ];
    const finalIncluded = processedIncluded.filter((c) => c.status === "included");

    const excluded = candidates
      .filter((candidate) => candidate.status === "excluded")
      .sort((a, b) => a.skillId.localeCompare(b.skillId));
    const recommendations = includedWithRelationships
      .filter((item) => !item.recommendation.suppression)
      .map((item) => item.recommendation);

    return { context, candidates: [...finalIncluded, ...suppressed, ...excluded], recommendations };
  }

  async recommend(input: Partial<ActivationContext>): Promise<Recommendation[]> {
    return (await this.analyzeRecommendations(input)).recommendations;
  }

  async explain(skillId: string, input: Partial<ActivationContext>): Promise<Recommendation | undefined> {
    const analysis = await this.analyzeRecommendations(input);
    const candidate = analysis.candidates.find((c) => c.skillId === skillId);
    if (!candidate || candidate.status === "excluded") return undefined;
    return {
      skillId: candidate.skillId,
      score: candidate.score,
      reasons: candidate.reasons,
      signals: candidate.signals,
      warnings: candidate.warnings,
      suppression: candidate.suppression,
    };
  }
}

function analyzeActivationCandidate(
  entry: RegistryEntry,
  context: ActivationContext,
  distance?: number,
): SkillActivationCandidate {
  const bundle = entry.bundle;
  const components: SkillActivationScoreComponent[] = [];
  const queryTerms = normalizeTerms(context.query);
  const agentsParsed = parseAgentsMd(context.agentsMd);
  const agentsActiveSkillIds = unique([...context.activeSkillIds, ...agentsParsed.activeSkillIds]);
  const projectPreferences = agentsParsed.preferences;
  const enabled = !entry.disabled;
  const exclusions: SkillActivationExclusion[] = [];
  let status: SkillActivationCandidateStatus = "included";
  let suppression: Suppression | undefined = undefined;

  if (!enabled) {
    exclusions.push({ kind: "disabled", reason: "skill is disabled" });
    status = "excluded";
  }

  for (const trigger of bundle.manifest.activation.triggers) {
    if (queryTerms.includes(normalize(trigger))) {
      components.push({
        kind: "trigger",
        value: trigger,
        points: 5 * bundle.manifest.activation.weight,
        reason: `query matched trigger "${trigger}"`,
      });
    }
  }
  for (const tag of bundle.manifest.tags) {
    if (context.tags.includes(tag) || queryTerms.includes(normalize(tag))) {
      components.push({ kind: "tag", value: tag, points: 3, reason: `matched tag "${tag}"` });
    }
  }
  if (agentsActiveSkillIds.includes(bundle.manifest.id)) {
    components.push({
      kind: "agents_md",
      value: bundle.manifest.id,
      points: 4,
      reason: "referenced by AGENTS.md active skills",
    });
  }
  for (const repoSignal of context.repoSignals) {
    if (bundle.manifest.tags.includes(repoSignal) || bundle.manifest.activation.triggers.includes(repoSignal)) {
      components.push({
        kind: "repo_signal",
        value: repoSignal,
        points: 2,
        reason: `matched repository signal "${repoSignal}"`,
      });
    }
  }
  for (const preference of projectPreferences) {
    const prefLower = preference.toLowerCase();
    const matchesPolicy = bundle.manifest.policies.some(
      (p) => prefLower.includes(p.toLowerCase()) || p.toLowerCase().includes(prefLower),
    );
    const matchesTag = bundle.manifest.tags.some((t) => prefLower.includes(t.toLowerCase()));
    const matchesName = prefLower.includes(bundle.manifest.name.toLowerCase());
    const matchesId = prefLower.includes(bundle.manifest.id.toLowerCase());

    if (matchesPolicy || matchesTag || matchesName || matchesId) {
      if (/avoid|never/i.test(preference)) {
        status = "suppressed";
        suppression = {
          kind: "preference_violation",
          reason: `violates project preference "${preference}"`,
        };
      } else {
        components.push({
          kind: "project_preference",
          value: preference,
          points: 3,
          reason: `matched project preference "${preference}"`,
        });
      }
    }
  }

  if (distance !== undefined && distance < 1.2) {
    const semanticPoints = Math.max(1, Math.round((1.5 - distance) * 5));
    components.push({
      kind: "semantic",
      value: distance.toFixed(4),
      points: semanticPoints,
      reason: `semantic similarity match (distance: ${distance.toFixed(4)})`,
    });
  }

  if (status === "included" && components.length === 0) {
    exclusions.push({ kind: "unmatched", reason: "no activation evidence matched the supplied context" });
    status = "excluded";
  }

  if (status === "included") {
    if (entry.favorite) {
      components.push({ kind: "telemetry_favorite", value: "true", points: 1, reason: "favorite skill" });
    }
    const usageCount = entry.usageCount ?? 0;
    if (usageCount > 0) {
      components.push({
        kind: "telemetry_usage",
        value: String(usageCount),
        points: 1,
        reason: `used ${usageCount} ${usageCount === 1 ? "time" : "times"} previously`,
      });
    }
  }

  const score = status === "suppressed" ? 0 : components.reduce((sum, component) => sum + component.points, 0);
  const reasons = unique(components.map((component) => component.reason));
  const warnings: CompatibilityWarning[] = status === "included" ? [...bundle.manifest.compatibility.warnings] : [];

  if (status === "included") {
    const missing = bundle.manifest.capabilities.required.filter((capability) => !context.capabilities.includes(capability));
    if (missing.length) {
      warnings.push({
        code: "capability_missing",
        message: `Runtime is missing required capabilities: ${missing.join(", ")}`,
        severity: "warning",
        origin: "activation",
      });
    }
  }

  return {
    skillId: bundle.manifest.id,
    enabled,
    status,
    score,
    components,
    reasons,
    signals: uniqueSignals(components.map(componentSignal)),
    warnings,
    exclusions,
    suppression,
  };
}

function candidateRecommendation(candidate: SkillActivationCandidate): Recommendation {
  return {
    skillId: candidate.skillId,
    score: candidate.score,
    reasons: candidate.reasons,
    signals: candidate.signals,
    warnings: candidate.warnings,
  };
}

function componentSignal(component: SkillActivationScoreComponent): RecommendationSignal {
  return { type: component.kind, value: component.value };
}

function withActivationRelationships(
  scored: Array<{ bundle: SkillBundle; recommendation: Recommendation }>,
  activeBundles: SkillBundle[],
): Array<{ bundle: SkillBundle; recommendation: Recommendation }> {
  const bySkillId = new Map(scored.map((item) => [item.recommendation.skillId, item]));

  const overlaps = findOverlaps(scored.map((item) => item.bundle));
  for (const overlap of overlaps) {
    const [leftSkillId, rightSkillId] = overlap.ids;
    if (!leftSkillId || !rightSkillId) continue;

    appendActivationWarning(leftSkillId, {
      code: "activation_overlap",
      message: overlapMessage(overlap, rightSkillId),
      severity: "warning",
      origin: "activation",
      field: overlap.ids.join(":"),
    }, bySkillId);
    appendActivationWarning(rightSkillId, {
      code: "activation_overlap",
      message: overlapMessage(overlap, leftSkillId),
      severity: "warning",
      origin: "activation",
      field: overlap.ids.join(":"),
    }, bySkillId);

    // Smart Redundancy Suppression
    if (overlap.classification === "redundant") {
      const winner = scored.find(item => item.recommendation.skillId === leftSkillId || item.recommendation.skillId === rightSkillId);
      if (!winner) continue;
      
      const winnerId = winner.recommendation.skillId;
      const loserId = winnerId === leftSkillId ? rightSkillId : leftSkillId;

      const loser = bySkillId.get(loserId)!;
      if (!loser.recommendation.suppression) {
        loser.recommendation.suppression = {
          kind: "redundancy",
          reason: `suppressed due to redundant overlap with higher-ranked skill "${winnerId}"`,
          bySkillId: winnerId,
        };
      }
    }
  }

  for (const conflict of findConflicts(activeBundles)) {
    for (const skillId of conflict.ids) {
      const otherSkillIds = conflict.ids.filter((candidate) => candidate !== skillId);
      if (!otherSkillIds.length) continue;
      appendActivationWarning(skillId, {
        code: "activation_conflict",
        message: conflictMessage(conflict, otherSkillIds),
        severity: "warning",
        origin: "activation",
        field: conflict.ids.join(":"),
      }, bySkillId);
    }
  }

  return scored.map((item) => ({
    ...item,
    recommendation: {
      ...item.recommendation,
      warnings: uniqueWarnings(item.recommendation.warnings),
    },
  }));
}

function appendActivationWarning(
  skillId: string,
  warning: CompatibilityWarning,
  bySkillId: Map<string, { bundle: SkillBundle; recommendation: Recommendation }>,
): void {
  const item = bySkillId.get(skillId);
  if (!item) return;
  item.recommendation = {
    ...item.recommendation,
    warnings: [...item.recommendation.warnings, warning],
  };
}

function overlapMessage(overlap: OverlapRelationship, otherSkillId: string): string {
  return `Recommendation has ${overlap.classification} overlap with "${otherSkillId}" using ${formatEvidence(overlap.evidence)}.`;
}

function conflictMessage(conflict: ConflictRelationship, otherSkillIds: string[]): string {
  return `Recommendation has ${conflict.classification} relationship with "${otherSkillIds.join(", ")}": ${conflict.reason}. Evidence: ${formatEvidence(conflict.evidence)}.`;
}

function toEntry(bundle: SkillBundle, layer: RegistryLayer, root: string, telemetry: TelemetryState): RegistryEntry {
  const lastUsed = telemetry.lastUsed?.[bundle.manifest.id];
  return {
    bundle,
    layer,
    root,
    disabled: telemetry.disabled.includes(bundle.manifest.id),
    favorite: telemetry.favorites.includes(bundle.manifest.id),
    usageCount: telemetry.usage[bundle.manifest.id] ?? 0,
    ...(lastUsed ? { lastUsed } : {}),
  };
}

function resolveRegistryEntries(entries: RegistryEntry[]): RegistryEntry[] {
  const byId = new Map<string, RegistryEntry[]>();
  for (const entry of [...entries].sort(entrySort)) {
    const skillId = entry.bundle.manifest.id;
    byId.set(skillId, [...(byId.get(skillId) ?? []), entry]);
  }

  const resolved: RegistryEntry[] = [];
  for (const skillId of [...byId.keys()].sort()) {
    const [selected] = byId.get(skillId) ?? [];
    if (!selected) continue;
    resolved.push(selected);
  }
  return resolved;
}

function entrySort(a: RegistryEntry, b: RegistryEntry): number {
  return registryPrecedence.indexOf(a.layer) - registryPrecedence.indexOf(b.layer) ||
    a.bundle.manifest.id.localeCompare(b.bundle.manifest.id);
}

function childPaths(directory: string, child: string): string[] {
  const path = join(directory, child);
  if (!existsSync(path)) return [];
  return readdirSync(path).map((name) => relative(directory, join(path, name))).sort();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_ -]/g, "").trim();
}

function normalizeTerms(value: string): string[] {
  return unique(normalize(value).split(/\s+/).filter(Boolean));
}

const searchEvidenceKindOrder: SkillSearchEvidenceKind[] = [
  "identity",
  "activation_trigger",
  "activation_tag",
  "tag",
  "policy",
  "required_capability",
  "optional_capability",
  "provider",
  "parent",
  "provenance",
  "instructions_text",
];

const searchEvidenceWeights: Record<SkillSearchEvidenceKind, number> = {
  identity: 4,
  activation_trigger: 10,
  activation_tag: 9,
  tag: 9,
  policy: 9,
  required_capability: 9,
  optional_capability: 9,
  provider: 9,
  parent: 9,
  provenance: 9,
  instructions_text: 1,
};

function buildSearchIndexEntry(bundle: SkillBundle): SkillSearchIndexEntry {
  const manifest = bundle.manifest;
  return {
    skillId: manifest.id,
    evidence: sortSearchEvidence([
      searchEvidence("identity", [manifest.id, manifest.name, manifest.description ?? ""]),
      searchEvidence("activation_trigger", manifest.activation.triggers),
      searchEvidence("activation_tag", manifest.activation.tags),
      searchEvidence("tag", manifest.tags),
      searchEvidence("policy", manifest.policies),
      searchEvidence("required_capability", manifest.capabilities.required),
      searchEvidence("optional_capability", manifest.capabilities.optional),
      searchEvidence("provider", manifest.compatibility.providers),
      searchEvidence("parent", manifest.extends),
      searchEvidence("provenance", provenanceSearchValues(manifest.provenance)),
      searchEvidence("instructions_text", normalizeTerms(bundle.instructions)),
    ]),
  };
}

function matchSearchIndexEntry(entry: SkillSearchIndexEntry, terms: string[]): SkillSearchMatch | undefined {
  const evidence: SkillSearchEvidence[] = [];
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  let score = 0;

  for (const candidate of entry.evidence) {
    const matchingValues = candidate.values.filter((value) => terms.some((term) => normalize(value).includes(term)));
    if (!matchingValues.length) continue;
    evidence.push({ kind: candidate.kind, values: matchingValues });
    score += matchingValues.length * searchEvidenceWeights[candidate.kind];
    for (const value of matchingValues) {
      reasons.push(`matched ${candidate.kind} "${value}"`);
      for (const term of terms) {
        if (normalize(value).includes(term)) matchedTerms.push(term);
      }
    }
  }

  if (!evidence.length) return undefined;
  return {
    skillId: entry.skillId,
    score,
    matchedTerms: unique(matchedTerms),
    evidence,
    reasons: unique(reasons),
  };
}

function searchEvidence(kind: SkillSearchEvidenceKind, values: string[]): SkillSearchEvidence {
  return { kind, values: unique(values.filter(Boolean)) };
}

function sortSearchEvidence(values: SkillSearchEvidence[]): SkillSearchEvidence[] {
  const order = new Map(searchEvidenceKindOrder.map((kind, index) => [kind, index]));
  return values
    .filter((value) => value.values.length > 0)
    .map((value) => ({ ...value, values: [...value.values].sort() }))
    .sort((a, b) => (order.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.kind) ?? Number.MAX_SAFE_INTEGER));
}

function telemetryAnalysisRecord(input: {
  skillId: string;
  known: boolean;
  enabled: boolean;
  disabled: boolean;
  favorite: boolean;
  usageCount: number;
  lastUsed?: string;
}): SkillTelemetryAnalysisRecord {
  const evidence: SkillTelemetryEvidence[] = [];
  if (!input.known) evidence.push({ kind: "orphan", values: ["true"] });
  if (input.disabled) evidence.push({ kind: "disabled", values: ["true"] });
  if (input.favorite) evidence.push({ kind: "favorite", values: ["true"] });
  if (input.usageCount > 0) evidence.push({ kind: "usage_count", values: [String(input.usageCount)] });
  if (input.lastUsed) evidence.push({ kind: "last_used", values: [input.lastUsed] });

  return {
    skillId: input.skillId,
    known: input.known,
    enabled: input.enabled,
    disabled: input.disabled,
    favorite: input.favorite,
    usageCount: input.usageCount,
    ...(input.lastUsed ? { lastUsed: input.lastUsed } : {}),
    evidence,
  };
}

function provenanceSearchValues(provenance: SkillManifest["provenance"]): string[] {
  return [
    provenance.source?.type,
    provenance.source?.location,
    provenance.source?.original_id,
    provenance.imported_via?.importer,
  ].filter((value): value is string => Boolean(value));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueSignals(values: RecommendationSignal[]): RecommendationSignal[] {
  const seen = new Set<string>();
  const result: RecommendationSignal[] = [];
  for (const value of values) {
    const key = `${value.type}:${value.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function uniqueWarnings(values: CompatibilityWarning[]): CompatibilityWarning[] {
  const seen = new Set<string>();
  const result: CompatibilityWarning[] = [];
  for (const value of values) {
    const key = [value.code, value.origin ?? "", value.field ?? "", value.message].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function uniqueCapability(values: Capability[]): Capability[] {
  return unique(values);
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value))).sort();
}

function relationshipEvidence(kind: string, values: string[]): RelationshipEvidence | undefined {
  const sortedValues = unique(values).sort();
  return sortedValues.length ? { kind, values: sortedValues } : undefined;
}

function sortEvidence(
  evidence: Array<RelationshipEvidence | undefined>,
  kindOrder: readonly string[],
): RelationshipEvidence[] {
  const order = new Map(kindOrder.map((kind, index) => [kind, index]));
  return evidence
    .filter((item): item is RelationshipEvidence => item !== undefined)
    .sort((a, b) => (order.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.kind) ?? Number.MAX_SAFE_INTEGER) ||
      a.kind.localeCompare(b.kind));
}

function classifyOverlap(evidence: RelationshipEvidence[]): OverlapClassification {
  const hasActivationEvidence = evidence.some((item) => item.kind === "shared_trigger" || item.kind === "shared_tag");
  const reinforcingEvidenceKinds = new Set(
    evidence
      .map((item) => item.kind)
      .filter((kind) => kind !== "shared_trigger" && kind !== "shared_tag"),
  );
  return hasActivationEvidence && reinforcingEvidenceKinds.size >= 2 ? "redundant" : "complementary";
}

function sortRelationships<T extends { ids: string[] }>(relationships: T[]): T[] {
  return [...relationships].sort((a, b) => a.ids.join(":").localeCompare(b.ids.join(":")));
}

function formatEvidence(evidence: RelationshipEvidence[]): string {
  return evidence.map((item) => `${item.kind}: ${item.values.join(", ")}`).join("; ");
}

function sortWarnings(warnings: CompatibilityWarning[]): CompatibilityWarning[] {
  return [...warnings].sort(
    (a, b) => (a.field ?? "").localeCompare(b.field ?? "") || a.message.localeCompare(b.message),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripComments(line: string): string {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inDoubleQuote) {
      escaped = true;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if ((char === "#" || char === ";") && !inDoubleQuote && !inSingleQuote) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseValue(valStr: string): any {
  const s = valStr.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (!isNaN(Number(s)) && s !== "") return Number(s);
  return s;
}

function parseArray(valStr: string): any[] {
  const result: any[] = [];
  let currentToken = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;
  for (let i = 0; i < valStr.length; i++) {
    const char = valStr[i];
    if (escaped) {
      escaped = false;
      currentToken += char;
      continue;
    }
    if (char === '\\' && inDoubleQuote) {
      escaped = true;
      currentToken += char;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentToken += char;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentToken += char;
      continue;
    }
    if (inDoubleQuote || inSingleQuote) {
      currentToken += char;
      continue;
    }
    if (char === "#" || char === ";") {
      break;
    }
    if (char === ",") {
      const trimmed = currentToken.trim();
      if (trimmed) {
        result.push(parseValue(trimmed));
      }
      currentToken = "";
    } else {
      currentToken += char;
    }
  }
  const trimmed = currentToken.trim();
  if (trimmed) {
    result.push(parseValue(trimmed));
  }
  return result;
}

export function parseToml(content: string): any {
  const result: any = {};
  let currentSection: any = result;
  const lines = content.split(/\r?\n/);
  
  let i = 0;
  while (i < lines.length) {
    let line = stripComments(lines[i]!).trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      i++;
      continue;
    }
    
    if (line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1).trim();
      const parts = sectionName.split(".");
      let temp = result;
      for (const part of parts) {
        const p = part.trim();
        if (p === "__proto__" || p === "constructor" || p === "prototype") {
          throw new Error(`Prototype pollution attempt detected: ${p}`);
        }
        if (temp[p] !== undefined && typeof temp[p] !== "object") {
          throw new Error(`Duplicate key or redefinition in TOML: ${p}`);
        }
        if (!temp[p]) {
          temp[p] = {};
        }
        temp = temp[p];
      }
      currentSection = temp;
      i++;
      continue;
    }
    
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error(`Prototype pollution attempt detected: ${key}`);
      }
      if (currentSection[key] !== undefined) {
        throw new Error(`Duplicate key or redefinition in TOML: ${key}`);
      }
      
      let valuePart = line.slice(eqIdx + 1).trim();
      
      if (valuePart.startsWith("[")) {
        let arrayStr = valuePart;
        while (!arrayStr.includes("]") && i + 1 < lines.length) {
          i++;
          const nextLine = stripComments(lines[i]!).trim();
          arrayStr += " " + nextLine;
        }
        
        const firstBracket = arrayStr.indexOf("[");
        const lastBracket = arrayStr.lastIndexOf("]");
        const innerArrayStr = arrayStr.slice(firstBracket + 1, lastBracket);
        
        const items = parseArray(innerArrayStr);
        currentSection[key] = items;
      } else {
        currentSection[key] = parseValue(valuePart);
      }
    }
    i++;
  }
  return result;
}

function stripJsonComments(jsonStr: string): string {
  let result = "";
  let inDoubleQuote = false;
  let escaped = false;
  let i = 0;
  while (i < jsonStr.length) {
    const char = jsonStr[i]!;
    if (escaped) {
      result += char;
      escaped = false;
      i++;
      continue;
    }
    if (char === '\\') {
      result += char;
      if (inDoubleQuote) {
        escaped = true;
      }
      i++;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      i++;
      continue;
    }
    if (!inDoubleQuote) {
      if (char === '/' && jsonStr[i + 1] === '*') {
        i += 2;
        while (i < jsonStr.length) {
          if (jsonStr[i] === '*' && jsonStr[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
      if (char === '/' && jsonStr[i + 1] === '/') {
        i += 2;
        while (i < jsonStr.length && jsonStr[i] !== '\n' && jsonStr[i] !== '\r') {
          i++;
        }
        continue;
      }
    }
    result += char;
    i++;
  }
  return result;
}

export interface SecurityCheckResult {
  valid: boolean;
  errors: string[];
}

export async function checkSecuritySettings(
  workspacePath: string,
  options?: { cached?: boolean; mockFiles?: Record<string, string> }
): Promise<SecurityCheckResult> {
  const errors: string[] = [];
  
  const getFileContent = (relPath: string): string | null => {
    if (options?.mockFiles && relPath in options.mockFiles) {
      return options.mockFiles[relPath] ?? null;
    }
    const fullPath = join(workspacePath, relPath);
    if (options?.cached) {
      try {
        return execSync(`git show :${relPath}`, { cwd: workspacePath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Fallback to disk
      }
    }
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fs.readFileSync(fullPath, "utf-8");
      }
    } catch {
      // Ignore read errors and return null
    }
    return null;
  };

  // 1. Ruff Checker (pyproject.toml, ruff.toml, .ruff.toml)
  const ruffFiles = ["pyproject.toml", "ruff.toml", ".ruff.toml"];
  for (const file of ruffFiles) {
    const ruffContent = getFileContent(file);
    if (!ruffContent) continue;
    try {
      const parsed = parseToml(ruffContent);
      const ruffConfig = file === "pyproject.toml" ? parsed.tool?.ruff : parsed;
      if (!ruffConfig) continue;

      const lintIgnore = ruffConfig.lint?.ignore || [];
      const lintExtendIgnore = ruffConfig.lint?.["extend-ignore"] || [];
      const ruffIgnore = ruffConfig.ignore || [];
      const ruffExtendIgnore = ruffConfig["extend-ignore"] || [];
      
      const allIgnored = [...lintIgnore, ...lintExtendIgnore, ...ruffIgnore, ...ruffExtendIgnore];
      const sIgnore = allIgnored.filter((rule: any) => typeof rule === "string" && rule.startsWith("S"));
      if (sIgnore.length > 0) {
        errors.push(`Ruff security rule '${sIgnore.join(", ")}' added to ignore list in ${file}!`);
      }

      // Check for selective customized rules that omit security linting
      const lintSelect = ruffConfig.lint?.select;
      const ruffSelect = ruffConfig.select;
      if (lintSelect !== undefined || ruffSelect !== undefined) {
        const selects = [...(lintSelect || []), ...(ruffSelect || [])];
        if (selects.length > 0 && !selects.includes("S") && !selects.includes("ALL")) {
          errors.push(`Ruff security rules ('S') must be explicitly selected when customizing select rules in ${file}!`);
        }
      }
    } catch (e: any) {
      errors.push(`Failed to parse ${file}: ${e.message}`);
    }
  }

  // 2. Biome Checker (biome.json, biome.jsonc)
  const biomeFiles = ["biome.json", "biome.jsonc"];
  for (const file of biomeFiles) {
    const biomeContent = getFileContent(file);
    if (!biomeContent) continue;
    try {
      const cleanContent = stripJsonComments(biomeContent);
      const parsed = JSON.parse(cleanContent);
      const secRules = parsed.linter?.rules?.security || {};
      for (const [rule, val] of Object.entries(secRules)) {
        let isDisabled = false;
        if (val === "off") {
          isDisabled = true;
        } else if (val && typeof val === "object" && (val as any).level === "off") {
          isDisabled = true;
        }
        if (isDisabled) {
          errors.push(`Biome linter rule '${rule}' was disabled (set to 'off') in ${file}!`);
        }
      }
    } catch (e: any) {
      errors.push(`Failed to parse ${file}: ${e.message}`);
    }
  }

  // 3. Gitleaks Checker
  const gitleaksContent = getFileContent(".gitleaks.toml");
  if (gitleaksContent) {
    try {
      const parsed = parseToml(gitleaksContent);
      const allowlistPaths = parsed.allowlist?.paths || [];
      const suspicious = allowlistPaths.filter((p: string) => 
        p === "*" || p === "/" || p === "src" || p === "src/" || p === "." || p === "./" || p === "**" || p.startsWith("../")
      );
      if (suspicious.length > 0) {
        errors.push(`.gitleaks.toml allowlist contains unsafe generic path: '${suspicious.join(", ")}'!`);
      }
    } catch (e: any) {
      errors.push(`Failed to parse .gitleaks.toml: ${e.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export * from "./scanner/static.js";
export * from "./scanner/behavioral.js";
