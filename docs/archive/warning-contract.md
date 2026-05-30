# Warning Contract

clew read surfaces expose warnings as plain `CompatibilityWarning` objects. The compatibility surface is the array shape already used by CLI and MCP envelopes:

- top-level `warnings` on read envelopes
- `registryWarnings` and `agentsDiagnostics` on `clew-cli doctor`
- per-recommendation `warnings` for activation capability warnings
- top-level importer and exporter result `warnings`

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

Provider interop warnings must keep `origin: "provider_import"` or `origin: "provider_export"` on the warning object. They must not replace import or export result envelopes with provider-specific wrapper envelopes.

## Executable Fixture

The public fixture at `tests/fixtures/contracts/warning-contract.json` pins representative read-envelope shapes. It is exercised by the MCP test suite so future refactors catch accidental changes to warning array placement or warning object fields.

The provider interop fixture at `tests/fixtures/contracts/provider-warning-contract.json` pins importer and exporter warning arrays for provider degradation, metadata preservation, field normalization, and undeclared-provider exports.

The provider provenance fixture at `tests/fixtures/contracts/provider-provenance-contract.json` pins importer provenance on both import results and imported bundle manifests. Provenance contracts stay separate from provider metadata so `manifest.extensions.<provider>` remains provider-specific.

The provider artifact fixture at `tests/fixtures/contracts/provider-artifact-contract.json` pins exported Claude and OpenCode artifact paths and contents. Artifact contracts stay separate from warning contracts so provider export results can preserve plain `artifacts` and `warnings` arrays without wrapping either surface in provider-specific envelopes.

## Combined Provider Round-Trip Contract

The combined provider round-trip fixture at `tests/fixtures/contracts/provider-roundtrip-contract.json` pins the interop surface across import and export in one executable contract:

- importer `warnings`
- importer `provenance`
- imported bundle `manifest.provenance`
- exporter `artifacts`
- exporter `warnings`

This fixture does not introduce a new runtime envelope. Import results must remain plain `ImportResult` objects, and export results must remain plain `ExportResult` objects. Provider-specific metadata belongs under `manifest.extensions.<provider>`, while cross-provider provenance belongs under `manifest.provenance` and import result `provenance`.
