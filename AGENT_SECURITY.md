# Agent Security Rules for clew

clew is a high-risk supply-chain surface because it may propagate skills, schemas, MCP integrations, and agent-facing behavior.

## Package installation

Before adding any dependency:

1. Explain why the dependency is needed.
2. Prefer no new dependency when standard library or an existing dependency is sufficient.
3. Use exact versions.
4. Use pnpm only.
5. Do not use npm, yarn, or bun in this repo.
6. Do not use GitHub, git, external file, external link, or latest dependencies without explicit approval.
7. Do not run lifecycle scripts automatically.
8. Use the existing lockfile; do not delete `pnpm-lock.yaml` by default.

Allowed install pattern:

```bash
corepack pnpm add <package>@<exact-version> --ignore-scripts
```

For dev dependencies:

```bash
corepack pnpm add -D <package>@<exact-version> --ignore-scripts
```

## Publishing

Agents may not run:

- npm publish
- pnpm publish
- yarn publish
- bun publish
- npm login
- npm adduser
- npm token create

Agents may only prepare dry-runs:

```bash
npm pack --dry-run
```

## Sensitive files

Agents may not edit without explicit approval:

- `~/.npmrc`
- `.npmrc`
- `~/.zshrc`
- `~/.bashrc`
- `~/Library/LaunchAgents`
- `/Library/LaunchDaemons`
- `~/.ssh`
- `~/.config/gh`
- `.github/workflows/*`
- `pnpm-lock.yaml` deletion
- package `publishConfig`
- package `private` flag
- package `bin` entrypoints
- `sandbox/`
- generated skill registry files

## clew-specific integrity

After any dependency or build-system change, run:

```bash
git diff -- packages
git diff -- pnpm-lock.yaml
corepack pnpm -r build
corepack pnpm -r check
corepack pnpm test
```
