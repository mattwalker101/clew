# clew npm Publishing Design

## Current status

No `@clew/*` packages should be published until this document is implemented and reviewed.

## Candidate package classification

Candidate public packages:

- `@clew/cli`
- `@clew/core`
- `@clew/schema`
- `@clew/mcp`

Candidate internal or later-review packages:

- `@clew/importers`
- `@clew/exporters`

This classification must be reviewed before first release.

## Required controls before first publish

Each public package must have:

- `private: false` changed in an explicit release-preparation commit
- `publishConfig.access: public`
- package-level `files` allowlist
- README
- LICENSE
- clean `npm pack --dry-run`
- no sandbox, cache, session, log, env, or auth files
- exact repository metadata
- CI-only release workflow
- npm Trusted Publishing configured if possible
- provenance enabled
- package owner review
- no long-lived npm publish token by default

## Preferred publishing model

Use npm Trusted Publishing with GitHub Actions OIDC.

Do not use a long-lived `NPM_TOKEN` unless Trusted Publishing is unavailable and the exception is explicitly approved.

## Manual publish policy

Manual publish is prohibited except for emergency recovery and must be explicitly approved by Matt.

## First publish checklist

For each package:

```bash
cd packages/<package>
npm pack --dry-run
```

Inspect tarball contents before publishing.

Verify npm package scope ownership before any publish attempt.

## Post-publish controls

After a package exists:

- configure Trusted Publishing
- require 2FA for account and package settings
- minimize package owners
- enable provenance
- consider staged publishing after package exists
