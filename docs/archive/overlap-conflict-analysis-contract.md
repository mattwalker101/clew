# Overlap/Conflict Analysis Contract

`findOverlaps(bundles)` and `findConflicts(bundles)` are the v0.2 deterministic relationship analysis surfaces. They inspect canonical filesystem skill bundle manifests and return advisory relationship rows without executing skills, activating skills, querying remote services, or adding workflow semantics.

Overlap rows contain:

- `ids`: the two skill ids, sorted lexicographically.
- `triggers`: shared activation triggers, sorted lexicographically.
- `tags`: shared manifest tags, sorted lexicographically.
- `classification`: `complementary` or `redundant`.
- `evidence`: deterministic evidence rows with `kind` and sorted `values`.

Conflict rows contain:

- `ids`: the affected skill id and referenced skill id.
- `reason`: a stable human-readable reason.
- `classification`: `conflicting`.
- `evidence`: deterministic evidence rows with `kind` and sorted `values`.

Overlap evidence is ordered by evidence scope:

1. `shared_trigger`
2. `shared_tag`
3. `shared_policy`
4. `shared_required_capability`
5. `shared_optional_capability`
6. `common_parent`
7. `shared_provider`
8. `shared_provenance`

Conflict evidence is ordered by evidence scope:

1. `missing_parent`
2. `declared_incompatibility`

`missing_parent` evidence reports unresolved inheritance references from `manifest.extends`. `declared_incompatibility` evidence reports advisory skill incompatibilities from `manifest.compatibility.incompatible_with` only when both skill bundles are present in the analyzed bundle set. One-sided and reciprocal declarations both produce a single bidirectional conflict row. Missing incompatible targets are ignored because incompatibility is advisory metadata, not a dependency contract.

Relationship rows are sorted by `ids.join(":")`. Evidence values are sorted inside each row so bundle discovery order cannot change public output.

CLI `clew-cli overlaps` must keep returning `{ overlaps, warnings }`. CLI `clew-cli conflicts` must keep returning `{ conflicts, warnings }`. MCP recommendation and explanation surfaces must keep top-level registry/request warnings separate from relationship warnings; overlap and conflict warnings belong on affected recommendations as activation warnings.

The executable fixture at `tests/fixtures/contracts/overlap-conflict-analysis-contract.json` pins overlap evidence ordering, conflict evidence ordering, row ordering, relationship shape, advisory classifications, declared incompatibility output, and missing-parent conflict output.
