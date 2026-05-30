# Design Specification: Explainable Preference-Based Exclusion

**Goal**: Elevate preference-based exclusions to first-class explainable suppressions, allowing developers and coding agents to understand why a skill was suppressed due to a project-level `never` or `avoid` mandate in `AGENTS.md`.

**Architecture**:
- Add direct Skill ID matching to the candidate analyzer (`matchesId`).
- Set candidate status to `"suppressed"` rather than `"excluded"` when a preference violation occurs.
- Set `suppression: { kind: "preference_violation", reason: "..." }` on the candidate.
- Maintain existing compatibility schemas and allow the CLI and MCP bridges to cleanly explain the suppression.

---

## 1. Candidate Analyzer Modification

We will modify the core candidate matching loop (`analyzeActivationCandidate`) in `packages/clew-core/src/index.ts`:

```typescript
function analyzeActivationCandidate(
  entry: RegistryEntry,
  context: ActivationContext,
  distance?: number,
): SkillActivationCandidate {
  // ... existing code ...
  let status: SkillActivationCandidateStatus = "included";
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

  // Ensure score points are cleared if suppressed
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
}
```

---

## 2. CLI and MCP Integration

Since the candidate's status is `"suppressed"`, they are preserved through to the end of `analyzeRecommendations` and returned by `explain`:
- **Parity**: Parity with redundancy suppressions.
- **Observability**: When `clew explain <skill-id>` is called, it returns the recommendation block with `"suppression"` populated, showing exactly which line of `AGENTS.md` caused the violation.

---

## 3. Test Strategy

We will update the core test suite in `packages/clew-core/src/index.test.ts`:
- Update `excludes skills that violate negative project preferences` to expect `"suppressed"` status and check `candidate.suppression`.
- Add `direct ID matching` test case verifying `- never: engineering-core` suppresses `engineering-core` successfully.
