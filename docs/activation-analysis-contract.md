# Activation Analysis Contract

`ActivationEngine.analyzeRecommendations(context)` is the v0.2 deterministic activation analysis surface. It explains the same scoring path used by `ActivationEngine.recommend()` without executing skills, creating hidden activation, or changing canonical filesystem bundle semantics.

The analysis result contains:

- `context`: the normalized activation context after schema defaults.
- `candidates`: registered skill rows, with included recommendations first by rank and excluded candidates afterward by `skillId`.
- `recommendations`: the existing compatibility recommendation objects for included candidates.

Candidate rows contain:

- `skillId`, `enabled`, `status`, `score`, optional `rank`, `reasons`, `signals`, and `warnings`.
- `components`: deterministic score components with `kind`, `value`, `points`, and `reason`.
- `exclusions`: explicit disabled or unmatched explanations for excluded candidates.

Score components cover query trigger matches, tag matches, AGENTS.md active-skill references, repository signals, and conservative telemetry boosts. Telemetry components are additive only after normal activation evidence has matched. Telemetry alone must not include a recommendation.

Capability degradation warnings remain activation warnings on included candidates and their compatibility recommendations. Overlap and conflict warnings remain recommendation-scoped activation warnings and are added only after the included recommendation set is known.

`ActivationEngine.recommend(context)` remains compatibility sugar over this analysis and returns `analysis.recommendations`.

`clew recommend --explain <query>` and MCP `analyzeRecommendations()` expose the analysis result explicitly. Plain CLI and MCP `recommend()` envelopes stay `{ query, recommendations, warnings }`.

The executable fixture at `tests/fixtures/contracts/activation-analysis-contract.json` pins the public result shape, ordering, warning placement, score components, included/excluded status, capability degradation, overlap/conflict warnings, AGENTS.md evidence, repo signal evidence, and telemetry boost evidence.
