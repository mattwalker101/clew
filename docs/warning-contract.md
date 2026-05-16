# Warning Contract

clew read surfaces expose warnings as plain `CompatibilityWarning` objects. The compatibility surface is the array shape already used by CLI and MCP envelopes:

- top-level `warnings` on read envelopes
- `registryWarnings` and `agentsDiagnostics` on `clew doctor`
- per-recommendation `warnings` for activation capability warnings

Do not replace these arrays with categorized envelope objects. Consumers should be able to keep reading `warnings[].code` while newer consumers can also read `warnings[].origin`.

## Warning Object

Required fields:

- `code`
- `message`
- `severity`

Optional fields:

- `provider`
- `field`
- `origin`

Supported `origin` values are:

- `registry_rebuild`
- `request`
- `agents_diagnostic`
- `activation`
- `provider_import`
- `provider_export`

`origin` is provenance metadata, not a replacement for the existing category arrays. Missing `origin` remains valid for older persisted rows and older provider payloads.

## Executable Fixture

The public fixture at `tests/fixtures/contracts/warning-contract.json` pins representative read-envelope shapes. It is exercised by the MCP test suite so future refactors catch accidental changes to warning array placement or warning object fields.
