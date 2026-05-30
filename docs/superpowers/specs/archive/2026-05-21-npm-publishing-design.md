# clew npm Publishing Design

## Current Status
- **Scope:** `@clew` is UNAVAILABLE (owned by Clew, Inc.).
- **Decision:** Use **`@clew-ops`** as the official npm scope.
- **Decision:** Rename the CLI binary to **`clew-cli`** to avoid conflict with the existing Rust-based `clew` tool.

No packages should be published until this document is fully implemented and reviewed.

## Candidate Package Mapping
Transitioning from the internal `@clew` namespace to the public `@clew-ops` scope:

| Current Name | New Public Name | Status |
| :--- | :--- | :--- |
| `@clew-ops/cli` | `@clew-ops/cli` | Public (Binary: `clew-cli`) |
| `@clew-ops/core` | `@clew-ops/core` | Public |
| `@clew-ops/schema` | `@clew-ops/schema` | Public |
| `@clew-ops/mcp` | `@clew-ops/mcp` | Public |
| `@clew-ops/importers` | `@clew-ops/importers` | Internal/Pending |
| `@clew-ops/exporters` | `@clew-ops/exporters` | Internal/Pending |

## Migration Guide (Implementation Steps)

### 1. Claim the Scope
- Log in to [npmjs.com](https://www.npmjs.com/).
- Create a new Organization named **`clew-ops`**.
- Set the organization to "Public" (free for open source).

### 2. Rename Packages in Monorepo
- Update all `package.json` `name` fields to use the `@clew-ops/` prefix.
- Update `dependencies` and `devDependencies` in sibling packages to point to the new names.
- Update the `bin` field in `packages/clew-cli/package.json` to `"clew-cli": "./dist/index.js"`.

### 3. Update Build & Import Logic
- Grep for `import ... from '@clew-ops/` across the monorepo and replace with `@clew-ops/`.
- Verify `pnpm-workspace.yaml` and root-level scripts still resolve correctly.

## Required Controls Before First Publish

Each public package must have:
- `private: false` changed in an explicit release-preparation commit.
- `publishConfig.access: "public"`.
- Package-level `files` allowlist (already implemented for `clew-cli`).
- `README.md` and `LICENSE` in each package directory.
- Clean `npm pack --dry-run` output (verified manually).
- No sandbox, cache, session, log, env, or auth files.
- CI-only release workflow (GitHub Actions).
- npm Trusted Publishing (OIDC) configured.
- Provenance enabled (`--provenance`).

## Preferred Publishing Model

Use **npm Trusted Publishing** with GitHub Actions OIDC.
- **NO** long-lived `NPM_TOKEN` should be used if OIDC is available.
- The GitHub workflow must have `id-token: write` permissions.

## Manual Publish Policy
Manual publish is strictly prohibited except for emergency recovery and must be explicitly approved by Matt.

## Post-Publish Verification
After the first successful publish:
- Verify the "Provenance" badge appears on npmjs.com.
- Verify that `npm install -g @clew-ops/cli` correctly installs the `clew-cli` binary.
- Enable 2FA for all organization members.
