# Phase 9: Relationship Overlays & Explainable Suppression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the core activation engine and CLI explain commands to show relationship-based logic and detail why redundant or conflicting skills are suppressed.

**Architecture:** We will modify `ActivationEngine.explain` to search the full list of candidates in `analyzeRecommendations` rather than only matching included recommendations. This allows retrieving suppressed candidates with their nested `suppression` objects intact, exposing them to the CLI and MCP bridges without schema changes.

**Tech Stack:** TypeScript, Vitest, Zod, and clew core packages.

---

### Task 1: Update core ActivationEngine.explain implementation

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Test: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**

Insert a test in `packages/clew-core/src/index.test.ts` showing that calling `.explain()` on a suppressed skill retrieves a recommendation object containing the `suppression` details:

```typescript
  it("explains why a redundant skill was suppressed", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core"),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("safe-editing", {
            tags: ["editing"],
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 },
            capabilities: { required: ["filesystem", "terminal"], optional: [] },
            extends: ["engineering-core"],
          }),
          layer: "global",
          root: "global-skills",
          disabled: false,
          favorite: false,
        },
        {
          bundle: bundle("specific-safe-editing", {
            tags: ["safety", "editing"],
            activation: { triggers: ["edit"], tags: ["editing"], weight: 1 },
            capabilities: { required: ["filesystem", "terminal"], optional: [] },
            extends: ["engineering-core"],
          }),
          layer: "project",
          root: "project-skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    
    // explain the suppressed "safe-editing" skill
    const explanation = await activation.explain("safe-editing", { query: "edit" });
    
    expect(explanation).toBeDefined();
    expect(explanation?.suppression).toMatchObject({
      kind: "redundancy",
      bySkillId: "specific-safe-editing",
      reason: expect.stringContaining("redundant overlap"),
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: FAIL with `AssertionError: expected undefined to be defined`

**Step 3: Write minimal implementation**

Modify `packages/clew-core/src/index.ts` around line 1221 to use `analyzeRecommendations` inside `.explain()` and construct the full recommendation structure including suppression:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat(core): support explaining suppressed skills in ActivationEngine"
```

---

### Task 2: Verify CLI explain command integration

**Files:**
- Modify: `packages/clew-cli/src/index.ts`
- Test: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**

Add an integration test in `packages/clew-cli/src/index.test.ts` that launches the CLI to explain a suppressed skill and asserts that the printed JSON contains the `suppression` details:

```typescript
  it("CLI explains why a redundant skill was suppressed", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-cli-suppress-"));
    process.chdir(projectRoot);
    
    // Set up project skills
    const globalRoot = join(projectRoot, "global-skills");
    mkdirSync(globalRoot, { recursive: true });
    
    // 1. global base skill
    writeFilesystemBundle(join(globalRoot, "engineering-core"), {
      id: "engineering-core",
      kind: "instruction_skill",
      name: "Engineering Core",
      instructions: "Perform rigorous engineering builds.",
    });

    // 2. global redundant skill
    mkdirSync(join(globalRoot, "safe-editing"), { recursive: true });
    writeFileSync(
      join(globalRoot, "safe-editing", "clew.yaml"),
      [
        "id: safe-editing",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Safe Editing",
        "extends:",
        "  - engineering-core",
        "tags:",
        "  - editing",
        "activation:",
        "  triggers:",
        "    - edit",
        "  tags:",
        "    - editing",
      ].join("\n"),
    );
    writeFileSync(join(globalRoot, "safe-editing", "skill.md"), "Global safety guidelines.");

    // 3. project specific skill
    const projectSkillsRoot = join(projectRoot, ".clew");
    mkdirSync(join(projectSkillsRoot, "specific-safe-editing"), { recursive: true });
    writeFileSync(
      join(projectSkillsRoot, "specific-safe-editing", "clew.yaml"),
      [
        "id: specific-safe-editing",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Specific Safe Editing",
        "extends:",
        "  - engineering-core",
        "tags:",
        "  - safety",
        "  - editing",
        "activation:",
        "  triggers:",
        "    - edit",
        "  tags:",
        "    - editing",
      ].join("\n"),
    );
    writeFileSync(join(projectSkillsRoot, "specific-safe-editing", "skill.md"), "Project safety rules.");

    // Mock OS home for global discovery
    const oldHome = process.env.HOME;
    process.env.HOME = projectRoot;
    mkdirSync(join(projectRoot, ".clew", "global"), { recursive: true });
    
    // Copy global skills to mock home path
    const mockGlobalRoot = join(projectRoot, ".clew", "global");
    mkdirSync(join(mockGlobalRoot, "engineering-core"), { recursive: true });
    writeFileSync(join(mockGlobalRoot, "engineering-core", "clew.yaml"), readFileSync(join(globalRoot, "engineering-core", "clew.yaml")));
    writeFileSync(join(mockGlobalRoot, "engineering-core", "skill.md"), readFileSync(join(globalRoot, "engineering-core", "skill.md")));

    mkdirSync(join(mockGlobalRoot, "safe-editing"), { recursive: true });
    writeFileSync(join(mockGlobalRoot, "safe-editing", "clew.yaml"), readFileSync(join(globalRoot, "safe-editing", "clew.yaml")));
    writeFileSync(join(mockGlobalRoot, "safe-editing", "skill.md"), readFileSync(join(globalRoot, "safe-editing", "skill.md")));

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await main(["explain", "safe-editing", "edit"]);
      
      const output = outputAt(log, 0) as { skillId: string; recommendation: { suppression: { kind: string; bySkillId: string } } };
      expect(output.skillId).toBe("safe-editing");
      expect(output.recommendation?.suppression).toMatchObject({
        kind: "redundancy",
        bySkillId: "specific-safe-editing",
      });
    } finally {
      process.env.HOME = oldHome;
    }
  });
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-cli/src/index.test.ts`
Expected: FAIL (either due to undefined recommendation output, or because of tsbuild error if types don't match)

**Step 3: Write minimal implementation**

No extra CLI implementation is required because the CLI `explain` router already uses the returned `recommendation` from `activation.explain()` directly:
```typescript
      const recommendation = (await activation.explain(skillId, buildActivationContext(query))) ?? null;
```
If compile issues exist, ensure all workspace packages are built and compiled.

**Step 4: Run test to verify it passes**

Run: `pnpm build && pnpm test`
Expected: PASS for all 144 tests!

**Step 5: Commit**

```bash
git add packages/clew-cli/src/index.test.ts
git commit -m "test(cli): verify explain subcommand retrieves suppression reasons"
```
