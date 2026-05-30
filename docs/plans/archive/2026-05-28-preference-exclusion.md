# Preference-Based Exclusion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement direct Skill ID matching and explainable preference suppressions for `AGENTS.md` mandates.

**Architecture:**
- Update `analyzeActivationCandidate` in `@clew-ops/core` to match preferences by exact Skill ID (`matchesId`).
- Set candidate status to `"suppressed"` rather than `"excluded"` when a preference violation occurs, populating `suppression: { kind: "preference_violation", reason: ... }`.
- Ensure explain commands cleanly show the suppression details.

**Tech Stack:** TypeScript, Vitest, Zod, and clew core packages.

---

### Task 1: Update core ActivationEngine and Candidate Matching

**Files:**
- Modify: `packages/clew-core/src/index.ts`
- Modify: `packages/clew-core/src/index.test.ts`

**Step 1: Write the failing test**

Modify the existing test `excludes skills that violate negative project preferences` in `packages/clew-core/src/index.test.ts` to assert that preference violations use explainable suppressions:

```typescript
    it("excludes skills that violate negative project preferences", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("recursive-skill", { tags: ["recursion"] }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    const context = {
      query: "build",
      agentsMd: "# Rules\n- avoid recursion",
    };

    const result = await activation.analyzeRecommendations(context);
    const candidate = result.candidates.find((c) => c.skillId === "recursive-skill")!;

    expect(candidate.status).toBe("suppressed");
    expect(candidate.suppression).toMatchObject({
      kind: "preference_violation",
      reason: 'violates project preference "- avoid recursion"',
    });
    expect(result.recommendations).toHaveLength(0);
    });
```

Also, add a new test right below it verifying direct exact Skill ID matching:

```typescript
    it("suppresses skills using exact Skill ID matching in project preferences", async () => {
    const registry = new SkillRegistry({
      entries: [
        {
          bundle: bundle("engineering-core", { tags: ["eng"] }),
          layer: "project",
          root: "skills",
          disabled: false,
          favorite: false,
        },
      ],
      warnings: [],
    });

    const activation = new ActivationEngine(registry);
    const context = {
      query: "build",
      agentsMd: "# Rules\n- never: engineering-core",
    };

    const result = await activation.analyzeRecommendations(context);
    const candidate = result.candidates.find((c) => c.skillId === "engineering-core")!;

    expect(candidate.status).toBe("suppressed");
    expect(candidate.suppression).toMatchObject({
      kind: "preference_violation",
      reason: 'violates project preference "- never: engineering-core"',
    });
    expect(result.recommendations).toHaveLength(0);
    });
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: FAIL due to status expecting `"suppressed"` but receiving `"excluded"`.

**Step 3: Write minimal implementation**

In `packages/clew-core/src/index.ts`:
1. In `analyzeActivationCandidate` around line 1534, modify the matching loop to support `matchesId` and set `status = "suppressed"` & `suppression`:
```typescript
  let suppression: Suppression | undefined = undefined;

  // ... matching loops ...
  for (const preference of projectPreferences) {
    const prefLower = preference.toLowerCase();
    const matchesId = prefLower.includes(bundle.manifest.id.toLowerCase());
    const matchesPolicy = bundle.manifest.policies.some(
      (p) => prefLower.includes(p.toLowerCase()) || p.toLowerCase().includes(prefLower),
    );
    const matchesTag = bundle.manifest.tags.some((t) => prefLower.includes(t.toLowerCase()));
    const matchesName = prefLower.includes(bundle.manifest.name.toLowerCase());

    if (matchesId || matchesPolicy || matchesTag || matchesName) {
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
```
2. Modify the returned candidate object to return `suppression` and clear score points if status is `"suppressed"`:
```typescript
  let score = status === "suppressed" ? 0 : components.reduce((sum, c) => sum + c.points, 0);

  return {
    skillId: bundle.manifest.id,
    enabled,
    status,
    score,
    components,
    reasons: components.map((c) => c.reason),
    signals: components.map((c) => ({ type: c.kind as any, value: c.value })),
    warnings,
    exclusions,
    suppression,
  };
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-core/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-core/src/index.ts packages/clew-core/src/index.test.ts
git commit -m "feat(core): implement direct skill ID matching and explainable preference suppressions"
```

---

### Task 2: Verify CLI explain Command Integration

**Files:**
- Modify: `packages/clew-cli/src/index.test.ts`

**Step 1: Write the failing test**

Add an integration test in `packages/clew-cli/src/index.test.ts` that launches the CLI to explain a preference-suppressed skill and asserts that the printed JSON contains the `suppression` details:

```typescript
  it("CLI explains why a skill was suppressed due to project preferences", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "clew-cli-pref-suppress-"));
    process.chdir(projectRoot);
    
    const projectSkillsRoot = join(projectRoot, ".clew");
    mkdirSync(join(projectSkillsRoot, "safe-editing"), { recursive: true });
    writeFileSync(
      join(projectSkillsRoot, "safe-editing", "clew.yaml"),
      [
        "id: safe-editing",
        "version: 1.0.0",
        "kind: instruction_skill",
        "name: Safe Editing",
        "instructions:",
        "  file: skill.md",
        "tags:",
        "  - editing",
        "activation:",
        "  triggers:",
        "    - edit",
      ].join("\n"),
    );
    writeFileSync(join(projectSkillsRoot, "safe-editing", "skill.md"), "Guidelines.");
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Rules\n- never: safe-editing\n");

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await main(["explain", "safe-editing", "edit"]);
      
      const output = outputAt(log, 0) as { skillId: string; recommendation: { suppression: { kind: string; reason: string } } };
      expect(output.skillId).toBe("safe-editing");
      expect(output.recommendation?.suppression).toMatchObject({
        kind: "preference_violation",
        reason: expect.stringContaining("violates project preference"),
      });
    } finally {
      log.mockRestore();
    }
  });
```

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-cli/src/index.test.ts`
Expected: FAIL (because typescript build needs to transpile and core packages need to be compiled).

**Step 3: Write minimal implementation**

Compile all packages and build to let `packages/clew-cli` resolve the new `@clew-ops/core` types:
Run: `pnpm build`

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-cli/src/index.test.ts
git commit -m "test(cli): verify explain command retrieves preference suppression reason"
```

---

### Task 3: Final Build and Test Verification

**Files:**
- None (verification task)

**Step 1: Build the packages**

Run: `pnpm build`
Expected: Done (No compilation or typecheck errors).

**Step 2: Run all tests**

Run: `pnpm test`
Expected: ALL tests pass successfully.
