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

Conflict evidence currently contains only `missing_parent`. Future conflict intelligence must stay advisory and recommendation-scoped until a separate contract expands the public surface.

Relationship rows are sorted by `ids.join(":")`. Evidence values are sorted inside each row so bundle discovery order cannot change public output.

CLI `clew overlaps` must keep returning `{ overlaps, warnings }`. CLI `clew conflicts` must keep returning `{ conflicts, warnings }`. MCP recommendation and explanation surfaces must keep top-level registry/request warnings separate from relationship warnings; overlap and conflict warnings belong on affected recommendations as activation warnings.

The executable fixture at `tests/fixtures/contracts/overlap-conflict-analysis-contract.json` pins overlap evidence ordering, conflict evidence ordering, row ordering, relationship shape, advisory classifications, and missing-parent conflict output.
