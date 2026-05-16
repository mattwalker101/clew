# Changelog

## Unreleased

### Changed

- CLI read commands now return stable JSON envelopes instead of raw arrays. This is a breaking v0.1 pre-release contract cleanup for script-facing output.
- Registry-backed reads now tolerate invalid filesystem skill bundles by loading valid bundles and returning `skill_bundle_invalid` compatibility warnings instead of aborting the command.

### Added

- Added `clew lookup <skill-id>` for scriptable registry lookup.
- Missing, disabled, and unrecommended skill states now return `null` payloads with explicit warnings such as `skill_unknown`, `skill_disabled`, and `skill_not_recommended`.
