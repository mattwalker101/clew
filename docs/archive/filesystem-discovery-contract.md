# Filesystem Discovery Contract

`discoverSkillBundles()` is the registry filesystem discovery contract. It reads local filesystem skill bundle directories, treats each directory containing `clew.yaml` as a candidate bundle, validates candidates through `loadSkillBundle()`, and returns deterministic valid bundles plus invalid bundle warnings.

Missing discovery roots are not degraded registry state. They return empty `bundles` and empty `warnings` so projects can rebuild cleanly before any local skill directories exist.

Candidate directories are discovered deterministically and valid returned bundles are sorted by `manifest.id`. Loaded bundles pass through the canonical schema parser, so omitted optional manifest fields are schema-defaulted before the bundle reaches registry resolution.

Invalid filesystem bundles are degraded rebuild state. They are skipped from `bundles` and produce `skill_bundle_invalid` warnings with `severity: "error"` and `origin: "registry_rebuild"`. The warning `field` identifies the invalid bundle directory, and the warning `message` is formatted from the schema validation issues.

`rebuildRegistry()` aggregates discovery warnings into the top-level `RegistrySnapshot.warnings` array. `rebuildRegistryIndex()` persists those same warnings into SQLite `registry_warnings` rows. SQLite registry warnings are rebuildable derived state: deleting the database and rebuilding from the filesystem must recreate the same warning surface while preserving filesystem bundle resolution semantics.

Discovery warning hardening does not add workflow execution, autonomous runtime behavior, remote package management, provider-specific discovery behavior, or request-time composition diagnostics. Duplicate valid skill ids, disabled telemetry, and composition skips remain outside the filesystem discovery warning surface.

The executable fixture at `tests/fixtures/contracts/filesystem-discovery-contract.json` pins missing-root discovery, deterministic bundle ordering, schema-defaulted valid bundle loading, invalid bundle warning shape, registry rebuild warning placement, and SQLite warning persistence.
