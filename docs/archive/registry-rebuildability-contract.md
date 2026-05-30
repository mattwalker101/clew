# Registry Rebuildability Contract

`rebuildRegistryIndex()` is the SQLite rebuildability contract for the registry. Filesystem skill bundles remain canonical truth. SQLite registry tables are local derived state that can be deleted and recreated from the filesystem plus any surviving telemetry rows.

The rebuildable index tables are:

- `skills`
- `overlaps`
- `conflicts`
- `registry_warnings`

Rebuilding from the same filesystem snapshot must recreate the same resolved skills, overlap rows, conflict rows, and registry warning rows. `registry_warnings` mirrors the top-level `RegistrySnapshot.warnings` produced during rebuild; it is not a new canonical warning source.

Telemetry is the local state boundary. `rebuildIndex()` preserves existing telemetry rows while the database remains, including disabled state, favorite state, usage counts, and last-used timestamps. Those telemetry values may affect the rebuilt snapshot and indexed skill eligibility, but they do not replace filesystem bundle semantics.

Deleting the SQLite database deletes telemetry-derived local state. A rebuild after deletion must still restore filesystem-derived bundle resolution, overlap rows, conflict rows, and registry warnings. The rebuilt telemetry rows start from default local state, so disabled, favorite, usage, and last-used values from the deleted database are gone.

This contract does not add workflow execution, autonomous runtime behavior, remote registry behavior, provider-specific rebuild logic, or SQLite-as-canonical semantics.

The executable fixture at `tests/fixtures/contracts/registry-rebuildability-contract.json` pins representative rebuild output, persisted warning rows, telemetry preservation across rebuilds, and telemetry loss after database deletion.
