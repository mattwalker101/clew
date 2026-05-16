# Changelog

## Unreleased

### Changed

- CLI read commands now return stable JSON envelopes instead of raw arrays. This is a breaking v0.1 pre-release contract cleanup for script-facing output.

### Added

- Added `clew lookup <skill-id>` for scriptable registry lookup.
- Missing, disabled, and unrecommended skill states now return `null` payloads with explicit warnings such as `skill_unknown`, `skill_disabled`, and `skill_not_recommended`.
