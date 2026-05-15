import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import Database from "better-sqlite3";
import {
  type ActivationContext,
  activationContextSchema,
  type Capability,
  type CompatibilityWarning,
  type Recommendation,
  type RegistryLayer,
  type SkillBundle,
  type SkillManifest,
  skillBundleSchema,
  skillManifestSchema,
} from "@clew/schema";

export type RegistryEntry = {
  bundle: SkillBundle;
  layer: RegistryLayer;
  root: string;
  disabled: boolean;
  favorite: boolean;
};

export type RegistrySnapshot = {
  entries: RegistryEntry[];
  warnings: CompatibilityWarning[];
};

export type TelemetryState = {
  disabled: string[];
  favorites: string[];
  usage: Record<string, number>;
};

export type SqliteIndexResult = {
  dbPath: string;
  skills: number;
  overlaps: number;
  conflicts: number;
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
  let inActiveSkills = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^#+\s+Active Skills/i.test(line)) {
      inActiveSkills = true;
      continue;
    }
    if (inActiveSkills && /^#+\s+/.test(line)) {
      inActiveSkills = false;
    }
    if (inActiveSkills) {
      const match = line.match(/^-\s+`?([a-z0-9._-]+)`?/i);
      if (match?.[1]) active.push(match[1]);
    }
    if (/prefer|avoid|must|should|local-first|deterministic|explainable/i.test(line)) {
      preferences.push(line);
    }
  }

  return { activeSkillIds: unique(active), preferences: unique(preferences) };
}

export function getAgentsMdDiagnostics(content: string, registry: SkillRegistry): CompatibilityWarning[] {
  const diagnostics: CompatibilityWarning[] = [];
  const parsed = parseAgentsMd(content);
  for (const skillId of parsed.activeSkillIds) {
    const entry = registry.entries.find((candidate) => candidate.bundle.manifest.id === skillId);
    if (!entry) {
      diagnostics.push({
        code: "agents_skill_unknown",
        message: `AGENTS.md references unknown skill "${skillId}".`,
        severity: "warning",
        field: "AGENTS.md",
      });
    } else if (entry.disabled) {
      diagnostics.push({
        code: "agents_skill_disabled",
        message: `AGENTS.md references disabled skill "${skillId}".`,
        severity: "warning",
        field: "AGENTS.md",
      });
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
      parent.push(parseScalar(trimmed.slice(2).trim()));
      continue;
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
      lines.push(`${" ".repeat(indent)}${key}:`);
      for (const item of child) lines.push(`${" ".repeat(indent + 2)}- ${item}`);
    } else if (isRecord(child)) {
      lines.push(`${" ".repeat(indent)}${key}:`);
      lines.push(stringifyYaml(child, indent + 2));
    } else if (child !== undefined) {
      lines.push(`${" ".repeat(indent)}${key}: ${child}`);
    }
  }
  return lines.join("\n");
}

export function loadSkillBundle(directory: string): SkillBundle {
  const manifestPath = join(directory, "clew.yaml");
  const manifest = skillManifestSchema.parse(parseYaml(readFileSync(manifestPath, "utf8")));
  const instructionPath = join(directory, manifest.instructions.file);
  const bundle = {
    manifest,
    instructions: readFileSync(instructionPath, "utf8"),
    path: directory,
    examples: childPaths(directory, "examples"),
    templates: childPaths(directory, "templates"),
    assets: childPaths(directory, "assets"),
    tests: childPaths(directory, "tests"),
  };
  return skillBundleSchema.parse(bundle);
}

export function discoverSkillBundles(root: string): SkillBundle[] {
  if (!existsSync(root)) return [];
  const candidates = readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "clew.yaml")));
  return candidates.map(loadSkillBundle).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
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
      for (const bundle of discoverSkillBundles(root)) {
        entries.push(toEntry(bundle, layer, root, telemetry));
      }
    }
  }

  const byId = new Map<string, RegistryEntry>();
  for (const entry of entries.sort(entrySort)) {
    if (!byId.has(entry.bundle.manifest.id)) byId.set(entry.bundle.manifest.id, entry);
  }
  const resolved = [...byId.values()].sort((a, b) => a.bundle.manifest.id.localeCompare(b.bundle.manifest.id));
  return { entries: resolved, warnings };
}

export function rebuildRegistryIndex(options: RegistryOptions = {}): RegistrySnapshot {
  const dbPath = options.dbPath ?? join(options.projectRoot ?? process.cwd(), ".clew-registry.db");
  const db = openRegistryDb(dbPath);
  try {
    const snapshot = rebuildRegistry({ ...options, telemetry: db.getTelemetryState() });
    db.rebuildIndex(snapshot);
    return snapshot;
  } finally {
    db.close();
  }
}

export function composeSkill(bundle: SkillBundle, parents: SkillBundle[]): SkillBundle {
  const orderedParents = parents.filter((parent) => bundle.manifest.extends.includes(parent.manifest.id));
  const manifest: SkillManifest = {
    ...bundle.manifest,
    tags: unique([...orderedParents.flatMap((parent) => parent.manifest.tags), ...bundle.manifest.tags]),
    policies: unique([...orderedParents.flatMap((parent) => parent.manifest.policies), ...bundle.manifest.policies]),
    extends: unique(bundle.manifest.extends),
    capabilities: {
      required: uniqueCapability([
        ...orderedParents.flatMap((parent) => parent.manifest.capabilities.required),
        ...bundle.manifest.capabilities.required,
      ]),
      optional: uniqueCapability([
        ...orderedParents.flatMap((parent) => parent.manifest.capabilities.optional),
        ...bundle.manifest.capabilities.optional,
      ]),
    },
    compatibility: {
      providers: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.compatibility.providers),
        ...bundle.manifest.compatibility.providers,
      ]),
      warnings: [
        ...orderedParents.flatMap((parent) => parent.manifest.compatibility.warnings),
        ...bundle.manifest.compatibility.warnings,
      ],
    },
    activation: {
      ...orderedParents.reduce<Record<string, unknown>>(
        (merged, parent) => ({ ...merged, ...parent.manifest.activation }),
        {},
      ),
      ...bundle.manifest.activation,
      triggers: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.activation.triggers),
        ...bundle.manifest.activation.triggers,
      ]),
      tags: unique([
        ...orderedParents.flatMap((parent) => parent.manifest.activation.tags),
        ...bundle.manifest.activation.tags,
      ]),
      weight: bundle.manifest.activation.weight,
    },
  };
  return { ...bundle, manifest };
}

export function findOverlaps(bundles: SkillBundle[]): Array<{ ids: string[]; triggers: string[]; tags: string[] }> {
  const overlaps: Array<{ ids: string[]; triggers: string[]; tags: string[] }> = [];
  for (let left = 0; left < bundles.length; left += 1) {
    for (let right = left + 1; right < bundles.length; right += 1) {
      const a = bundles[left]!;
      const b = bundles[right]!;
      const triggers = intersection(a.manifest.activation.triggers, b.manifest.activation.triggers);
      const tags = intersection(a.manifest.tags, b.manifest.tags);
      if (triggers.length || tags.length) overlaps.push({ ids: [a.manifest.id, b.manifest.id], triggers, tags });
    }
  }
  return overlaps;
}

export function findConflicts(bundles: SkillBundle[]): Array<{ ids: string[]; reason: string }> {
  const conflicts: Array<{ ids: string[]; reason: string }> = [];
  const byId = new Map(bundles.map((bundle) => [bundle.manifest.id, bundle]));
  for (const bundle of bundles) {
    for (const parentId of bundle.manifest.extends) {
      if (!byId.has(parentId)) conflicts.push({ ids: [bundle.manifest.id, parentId], reason: "missing parent skill" });
    }
  }
  return conflicts.sort((a, b) => a.ids.join(":").localeCompare(b.ids.join(":")));
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

export class RegistryDb {
  private readonly db: SqliteDatabase;

  constructor(readonly dbPath: string) {
    this.db = openSqliteDatabase(dbPath);
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
      .prepare("SELECT skill_id, usage_count, disabled, favorite FROM telemetry")
      .all() as Array<{ skill_id: string; usage_count: number; disabled: number; favorite: number }>;
    return {
      disabled: rows.filter((row) => row.disabled === 1).map((row) => row.skill_id).sort(),
      favorites: rows.filter((row) => row.favorite === 1).map((row) => row.skill_id).sort(),
      usage: Object.fromEntries(rows.map((row) => [row.skill_id, row.usage_count])),
    };
  }

  listTelemetry(): TelemetryRecord[] {
    const rows = this.db
      .prepare("SELECT skill_id FROM telemetry ORDER BY skill_id")
      .all() as Array<{ skill_id: string }>;
    return rows.map((row) => this.getTelemetry(row.skill_id));
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
      this.db.exec("DELETE FROM skills; DELETE FROM overlaps; DELETE FROM conflicts;");
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
    });
    transaction();
    return { dbPath: this.dbPath, skills: snapshot.entries.length, overlaps: overlaps.length, conflicts: conflicts.length };
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
      close() {
        db.close();
      },
    };
  } catch (error) {
    const require = createRequire(import.meta.url);
    const sqlite = require("node:sqlite") as {
      DatabaseSync: new (path: string) => {
        exec(sql: string): void;
        prepare(sql: string): SqliteStatement;
        close(): void;
      };
    };
    const db = new sqlite.DatabaseSync(dbPath);
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
      close() {
        db.close();
      },
    };
  }
}

export class SkillRegistry {
  readonly entries: RegistryEntry[];

  constructor(snapshot: RegistrySnapshot) {
    this.entries = snapshot.entries;
  }

  static fromProject(projectRoot = process.cwd()): SkillRegistry {
    return new SkillRegistry(rebuildRegistryIndex({ projectRoot }));
  }

  list(): SkillBundle[] {
    return this.entries.filter((entry) => !entry.disabled).map((entry) => entry.bundle);
  }

  lookup(id: string): SkillBundle | undefined {
    return this.entries.find((entry) => entry.bundle.manifest.id === id && !entry.disabled)?.bundle;
  }

  search(query: string): SkillBundle[] {
    const terms = normalizeTerms(query);
    return this.list().filter((bundle) => searchableText(bundle).some((text) => terms.some((term) => text.includes(term))));
  }
}

export class ActivationEngine {
  constructor(private readonly registry: SkillRegistry) {}

  recommend(input: Partial<ActivationContext>): Recommendation[] {
    const context = activationContextSchema.parse(input);
    return this.registry
      .list()
      .map((bundle) => scoreBundle(bundle, context))
      .filter((recommendation) => recommendation.score > 0 && recommendation.reasons.length > 0)
      .sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId));
  }

  explain(skillId: string, input: Partial<ActivationContext>): Recommendation | undefined {
    return this.recommend(input).find((recommendation) => recommendation.skillId === skillId);
  }
}

function scoreBundle(bundle: SkillBundle, context: ActivationContext): Recommendation {
  const reasons: string[] = [];
  const signals: string[] = [];
  const warnings: CompatibilityWarning[] = [...bundle.manifest.compatibility.warnings];
  let score = 0;
  const queryTerms = normalizeTerms(context.query);

  for (const trigger of bundle.manifest.activation.triggers) {
    if (queryTerms.includes(normalize(trigger))) {
      score += 5 * bundle.manifest.activation.weight;
      reasons.push(`query matched trigger "${trigger}"`);
      signals.push(`trigger:${trigger}`);
    }
  }
  for (const tag of bundle.manifest.tags) {
    if (context.tags.includes(tag) || queryTerms.includes(normalize(tag))) {
      score += 3;
      reasons.push(`matched tag "${tag}"`);
      signals.push(`tag:${tag}`);
    }
  }
  if (context.activeSkillIds.includes(bundle.manifest.id) || context.agentsMd.includes(bundle.manifest.id)) {
    score += 4;
    reasons.push("referenced by AGENTS.md active skills");
    signals.push("agents-md");
  }
  for (const repoSignal of context.repoSignals) {
    if (bundle.manifest.tags.includes(repoSignal) || bundle.manifest.activation.triggers.includes(repoSignal)) {
      score += 2;
      reasons.push(`matched repository signal "${repoSignal}"`);
      signals.push(`repo:${repoSignal}`);
    }
  }
  const missing = bundle.manifest.capabilities.required.filter((capability) => !context.capabilities.includes(capability));
  if (missing.length) {
    warnings.push({
      code: "capability_missing",
      message: `Runtime is missing required capabilities: ${missing.join(", ")}`,
      severity: "warning",
    });
  }

  return {
    skillId: bundle.manifest.id,
    score,
    reasons: unique(reasons),
    signals: unique(signals),
    warnings,
  };
}

function toEntry(bundle: SkillBundle, layer: RegistryLayer, root: string, telemetry: TelemetryState): RegistryEntry {
  return {
    bundle,
    layer,
    root,
    disabled: telemetry.disabled.includes(bundle.manifest.id),
    favorite: telemetry.favorites.includes(bundle.manifest.id),
  };
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

function searchableText(bundle: SkillBundle): string[] {
  return [
    bundle.manifest.id,
    bundle.manifest.name,
    bundle.manifest.description ?? "",
    ...bundle.manifest.tags,
    ...bundle.manifest.activation.triggers,
    bundle.instructions,
  ].map(normalize);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueCapability(values: Capability[]): Capability[] {
  return unique(values);
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value))).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
