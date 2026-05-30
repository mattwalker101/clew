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

Score components cover query trigger matches, tag matches, AGENTS.md active-skill references, repository signals, and conservative telemetry boosts. Telemetry components are additive only for enabled candidates after normal activation evidence has matched. Telemetry alone must not include a recommendation. Disabled candidates may report normal activation evidence and disabled exclusions, but disabled telemetry is explainable only through telemetry analysis and must not appear as activation boost components.

Capability degradation warnings remain activation warnings on included candidates and their compatibility recommendations. Overlap and conflict warnings remain recommendation-scoped activation warnings and are added only after the included recommendation set is known. Declared incompatibility evidence from `manifest.compatibility.incompatible_with` is advisory and appears as recommendation-scoped `activation_conflict` warnings; it must not change top-level registry/request warnings or introduce routing behavior.

`ActivationEngine.recommend(context)` remains compatibility sugar over this analysis and returns `analysis.recommendations`.

`clew-cli recommend --explain <query>` and MCP `analyzeRecommendations()` expose the analysis result explicitly. Plain CLI and MCP `recommend()` envelopes stay `{ query, recommendations, warnings }`.

The executable fixture at `tests/fixtures/contracts/activation-analysis-contract.json` pins the public result shape, ordering, warning placement, score components, included/excluded status, capability degradation, overlap/conflict warnings including declared incompatibility evidence, AGENTS.md evidence, repo signal evidence, and telemetry boost evidence.

The executable fixture at `tests/fixtures/contracts/activation-telemetry-boundary-contract.json` pins the cross-boundary trust rule: matched enabled skills may receive telemetry boosts, telemetry-only skills remain excluded, disabled matched skills report only normal activation evidence plus disabled exclusions, disabled and orphan telemetry remain explainable through telemetry analysis, and disabled/orphan telemetry does not leak into public recommendation, explain, lookup, list, search, or search-analysis read surfaces.
