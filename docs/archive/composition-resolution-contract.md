# Composition Resolution Contract

`composeSkillWithReport()` and `composeRegistrySkillWithReport()` are the v0.1 additive composition contract. They return schema-valid `CompositionResult` objects that expose the composed bundle, the parent ids actually applied, and composition-scoped warnings.

Parent application order follows the child bundle's `manifest.extends` order. Supplied parent bundles are eligible only when their `manifest.id` is explicitly declared by the child. Unrelated supplied parents are ignored, and composition does not infer dependency graphs from available registry entries.

Composition is additive. Parent values are merged before child values for tags, policies, capabilities, activation triggers, activation tags, compatibility providers, and declared incompatibilities. Duplicate values are removed deterministically while preserving first-seen order. The child keeps local override control for fields such as activation weight and other non-additive manifest metadata.

Registry composition resolves each declared parent through the public registry lookup surface. That means the highest-precedence enabled parent is applied, disabled parents are treated as unavailable, and missing parents are not applied.

Composition does not execute parent skills, imply workflow ordering, create autonomous runtime behavior, mutate registry state, or add provider-specific behavior. It only returns a composed skill bundle and a report explaining which declared parents were applied.

In v0.1, unavailable parents are silent composition skips. Missing or disabled parents are reflected by absence from `appliedParentIds`; they do not emit composition warnings. Registry rebuild warnings remain reserved for degraded rebuild state, such as invalid filesystem bundles, and are not used for request-time composition skips.

The executable fixture at `tests/fixtures/contracts/composition-resolution-contract.json` pins representative direct composition, registry parent precedence, disabled-parent skipping, warning placement, and public report shape.
