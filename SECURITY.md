# clew Security Notes

## Current npm publishing posture

The root package is private and all workspace packages are intentionally private until a release workflow is designed and approved.

Workspace packages:

- @clew/core
- @clew/exporters
- @clew/schema
- @clew/cli
- @clew/mcp
- @clew/importers

Do not publish any package manually.

## Release requirements before any package is made public

Before any workspace package is changed to `private: false`, it must have:

- Explicit package-level `files` allowlist
- Correct `publishConfig`
- Clean `npm pack --dry-run` output
- No secrets, sandbox state, session logs, or agent artifacts in the package tarball
- CI-only release workflow
- npm Trusted Publishing configured where available
- Provenance enabled
- Manual approval for release
- Changelog or release notes
- Security review of package dependencies and executable entrypoints

## High-risk packages

`@clew/cli` is high-risk because it exposes an executable entrypoint.

`@clew/mcp` is high-risk because it touches agent and tooling integration boundaries.

`@clew/core` is high-risk because compromise may affect downstream packages.

## Agent rules

Agents may prepare release branches and dry-run package builds, but may not run:

- npm publish
- pnpm publish
- yarn publish
- bun publish
- npm login
- npm adduser
- npm token create

Agents may not edit npm auth files or GitHub release workflows without explicit approval.
