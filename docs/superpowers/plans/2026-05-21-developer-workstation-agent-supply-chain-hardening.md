# Developer Workstation Agent Supply Chain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Matt's local developer workstation, the `clew` monorepo, and the `aimux` repo against npm supply-chain attacks, credential exposure, accidental publication, and unsafe agent-mediated mutation.

**Architecture:** Run read-only compromise triage before any remediation, then apply narrow repo-local guardrails. Keep `clew` aligned with its local-first and deterministic project rules: filesystem and source files remain canonical, package publishing is blocked by manifest policy, and future publishing design is documented before release automation exists.

**Tech Stack:** macOS shell, Git, pnpm/Corepack, npm dry-run packaging, Go tooling, Docker CLI when present, markdown security docs.

---

## Recommendations

Harden both repos, but use different mutation scopes:

- `clew`: allow repo-local hardening changes because it is the active npm supply-chain surface.
- `aimux`: keep mutations limited to `SECURITY.md` and `AGENT_SECURITY.md`; otherwise use read-only checks because its main risk is local session/worktree state, not npm packaging today.

Do not upgrade pnpm in the main hardening pass. The current pin should first be tested with `--ignore-scripts`; if it blocks required checks or lacks needed safety commands, run a separate approved pnpm-upgrade task with an exact target version.

## Files

- Create: `docs/superpowers/plans/2026-05-21-developer-workstation-agent-supply-chain-hardening.md`
- Create or modify during execution: `/Users/matt/code/clew/SECURITY.md`
- Create or modify during execution: `/Users/matt/code/clew/AGENT_SECURITY.md`
- Modify during execution: `/Users/matt/code/clew/packages/*/package.json`
- Optional create during execution: `/Users/matt/code/clew/.npmignore`
- Optional create during execution: `/Users/matt/code/clew/docs/superpowers/specs/2026-05-21-npm-publishing-design.md`
- Create or modify during execution: `/Users/matt/code/aimux/SECURITY.md`
- Create or modify during execution: `/Users/matt/code/aimux/AGENT_SECURITY.md`

## Safety Rules

- [ ] Do not run `npm login`, `npm adduser`, `npm token create`, `npm publish`, `pnpm publish`, `yarn publish`, or `bun publish`.
- [ ] Do not delete `pnpm-lock.yaml`, `node_modules`, `dist`, `sandbox`, `.code-index`, `.aimux`, or worktrees.
- [ ] Do not mutate `~/.npmrc`, project `.npmrc`, shell profiles, LaunchAgents, LaunchDaemons, `.ssh`, `.config/gh`, or GitHub Actions workflows without explicit approval.
- [ ] Do not run `git stash -u` by default. Capture diffs as evidence first, then ask before stashing.
- [ ] If compromise indicators are found, stop normal hardening and switch to incident response.

### Task 1: Normalize Scope and Capture Evidence

**Files:**
- No repo source edits.
- Create evidence files under `~/security-audits/mini-shai-hulud-v4/`.

- [ ] **Step 1: Create the evidence directory**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
mkdir -p "$EVID"
date > "$EVID/started-at.txt"
printf '%s\n' "$EVID" > "$EVID/evidence-dir.txt"
```

Expected: directory exists and contains `started-at.txt`.

- [ ] **Step 2: Snapshot `clew` without mutating it**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
git status --short > "$EVID/clew-git-status.txt"
git branch --show-current > "$EVID/clew-branch.txt"
git remote -v > "$EVID/clew-remotes.txt"
git diff > "$EVID/clew-worktree.diff"
git diff --cached > "$EVID/clew-index.diff"
```

Expected: evidence files are written. Do not stash or switch branches yet.

- [ ] **Step 3: Snapshot `aimux` without mutating it**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/aimux
git status --short > "$EVID/aimux-git-status.txt"
git branch --show-current > "$EVID/aimux-branch.txt"
git remote -v > "$EVID/aimux-remotes.txt"
git diff > "$EVID/aimux-worktree.diff"
git diff --cached > "$EVID/aimux-index.diff"
```

Expected: evidence files are written. Do not stash or switch branches yet.

- [ ] **Step 4: Record evidence hashes**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
find "$EVID" -maxdepth 1 -type f ! -name "MANIFEST.sha256" -print0 | xargs -0 shasum -a 256 -- > "$EVID/MANIFEST.sha256"
```

Expected: `MANIFEST.sha256` exists. If the command fails, report the failure and do not proceed to mutation.

### Task 2: Read-Only Host Compromise Triage

**Files:**
- No repo source edits.
- Create evidence files under `~/security-audits/mini-shai-hulud-v4/`.

- [ ] **Step 1: Check known persistence indicators**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
{
  echo "=== Known persistence paths ==="
  ls -la "$HOME/Library/LaunchAgents/com.user.kitty-monitor.plist" 2>/dev/null || true
  ls -la "$HOME/.local/share/kitty/cat.py" 2>/dev/null || true
  ls -la "$HOME/.local/bin/gh-token-monitor.sh" 2>/dev/null || true
  echo "=== Recent user LaunchAgents ==="
  find "$HOME/Library/LaunchAgents" -name "*.plist" -mtime -30 -print 2>/dev/null || true
  echo "=== Recent system LaunchDaemons ==="
  find /Library/LaunchDaemons -name "*.plist" -mtime -30 -print 2>/dev/null || true
} > "$EVID/host-persistence-check.txt"
```

Expected: no known persistence paths exist. If a suspicious recent LaunchAgent or LaunchDaemon appears, stop and report.

- [ ] **Step 2: Check Bun usage**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
{
  echo "=== bun binary ==="
  command -v bun 2>/dev/null || true
  bun --version 2>/dev/null || true
  echo "=== bun project files ==="
  find /Users/matt/code -maxdepth 5 \( -name "bun.lockb" -o -name "bun.lock" -o -name "bunfig.toml" \) -not -path "*/node_modules/*" -print 2>/dev/null || true
} > "$EVID/bun-check.txt"
```

Expected: Bun is absent, or any Bun usage is tied to a known project. Unexpected Bun usage stops normal hardening.

- [ ] **Step 3: Check npm registry and user config with token redaction**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
{
  echo "=== npm registry ==="
  npm config get registry || true
  echo "=== npm userconfig ==="
  npm config get userconfig || true
  echo "=== npm user config list ==="
  npm config list --location=user || true
  echo "=== ~/.npmrc metadata ==="
  ls -la "$HOME/.npmrc" 2>/dev/null || true
  sed -E 's#(_authToken=).+#\1[REDACTED]#g; s#(//.*:_authToken=).+#\1[REDACTED]#g' "$HOME/.npmrc" 2>/dev/null || true
} > "$EVID/npm-config-check.txt"
```

Expected: registry is `https://registry.npmjs.org/` unless intentionally documented. Real tokens stop normal hardening.

- [ ] **Step 4: Check project `.npmrc` files**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
find /Users/matt/code -maxdepth 5 -name ".npmrc" -not -path "*/node_modules/*" -print -exec sh -c '
  echo "=== $1 ==="
  sed -E "s#(_authToken=).+#\1[REDACTED]#g; s#(//.*:_authToken=).+#\1[REDACTED]#g" "$1"
' _ {} \; > "$EVID/project-npmrc-check.txt" 2>/dev/null
```

Expected: no real tokens and no undocumented registry overrides.

- [ ] **Step 5: Check GitHub workflow risk surface without editing workflows**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
{
  echo "=== GitHub workflows under /Users/matt/code ==="
  find /Users/matt/code \( -path "*/.github/workflows/*.yml" -o -path "*/.github/workflows/*.yaml" \) -print 2>/dev/null || true
  echo "=== workflow risk scan ==="
  find /Users/matt/code \( -path "*/.github/workflows/*.yml" -o -path "*/.github/workflows/*.yaml" \) -print0 2>/dev/null |
    xargs -0 grep -nE "npm publish|pnpm publish|yarn publish|NPM_TOKEN|NODE_AUTH_TOKEN|secrets|pull_request_target|workflow_run|curl|wget|base64|gh auth" 2>/dev/null || true
} > "$EVID/github-workflow-scan.txt"
```

Expected: publishing workflows and risky triggers are reported, not modified.

- [ ] **Step 6: Check Docker socket exposure if Docker is available**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
{
  echo "=== containers ==="
  docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null || true
  echo "=== docker socket mounts ==="
  docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | while read -r id name; do
    if docker inspect "$id" 2>/dev/null | grep -q '/var/run/docker.sock'; then
      echo "SOCKET MOUNTED: $name ($id)"
    fi
  done
} > "$EVID/docker-socket-check.txt"
```

Expected: any socket-mounted container is reported and left unchanged.

### Task 3: Branch and Dirty Worktree Decision

**Files:**
- No source edits unless the user approves stashing or branch changes.

- [ ] **Step 1: Review dirty worktree evidence**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cat "$EVID/clew-git-status.txt"
cat "$EVID/aimux-git-status.txt"
```

Expected: determine whether existing changes are present.

- [ ] **Step 2: If `clew` has no conflicting local changes, create or switch hardening branch**

Run:

```bash
cd /Users/matt/code/clew
if git rev-parse --verify hardening/v4-supply-chain >/dev/null 2>&1; then
  git switch hardening/v4-supply-chain
else
  git switch -c hardening/v4-supply-chain
fi
```

Expected: `clew` is on `hardening/v4-supply-chain`.

- [ ] **Step 3: If `aimux` will receive docs changes and has no conflicting local changes, create or switch hardening branch**

Run:

```bash
cd /Users/matt/code/aimux
if git rev-parse --verify hardening/v4-supply-chain >/dev/null 2>&1; then
  git switch hardening/v4-supply-chain
else
  git switch -c hardening/v4-supply-chain
fi
```

Expected: `aimux` is on `hardening/v4-supply-chain`.

### Task 4: Harden `clew` Package Publication Posture

**Files:**
- Modify: `/Users/matt/code/clew/packages/*/package.json`
- Create or modify: `/Users/matt/code/clew/SECURITY.md`
- Optional create or modify: `/Users/matt/code/clew/.npmignore`

- [ ] **Step 1: Record current workspace package manifests**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
{
  echo "=== root package.json ==="
  jq '{name, private, workspaces, packageManager, scripts, devDependencies, dependencies}' package.json
  echo "=== pnpm-workspace.yaml ==="
  cat pnpm-workspace.yaml 2>/dev/null || echo "MISSING pnpm-workspace.yaml"
  echo "=== package manifests ==="
  find packages -maxdepth 2 -name package.json -print0 |
    xargs -0 jq -r '[input_filename, .name, .version, (.private // false), (.publishConfig // null | tostring), (.bin // null | tostring), (.files // null | tostring), (.scripts // null | tostring)] | @tsv'
} > "$EVID/clew-workspace-state.txt"
```

Expected: all package privacy and artifact fields are captured before edits.

- [ ] **Step 2: Set all workspace packages private**

Run:

```bash
cd /Users/matt/code/clew
for f in packages/*/package.json; do
  tmp="$(mktemp)"
  jq '.private = true' "$f" > "$tmp" && mv "$tmp" "$f"
done
find packages -maxdepth 2 -name package.json -print0 |
  xargs -0 jq -r '[input_filename, .name, .private] | @tsv'
```

Expected: every workspace package prints `true` in the private column.

- [ ] **Step 3: Add `SECURITY.md`**

Create `/Users/matt/code/clew/SECURITY.md` with:

```markdown
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
```

Expected: file exists and documents the current private posture.

- [ ] **Step 4: Add `.npmignore` only as a backstop**

Create `/Users/matt/code/clew/.npmignore` with:

```gitignore
.env
.env.*
*.log
.DS_Store
sandbox/
node_modules/
coverage/
.cache/
.code-index/
.aimux/
*.pem
*.key
*.crt
CLAUDE.local.md
.local/
tmp/
```

Expected: file exists. Package-level `files` allowlists remain required before public release.

### Task 5: Add `clew` Agent Guardrails

**Files:**
- Create or modify: `/Users/matt/code/clew/AGENT_SECURITY.md`

- [ ] **Step 1: Add agent security rules**

Create `/Users/matt/code/clew/AGENT_SECURITY.md` with:

````markdown
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
````

Expected: file exists and does not introduce executable behavior.

### Task 6: Run `clew` Dependency and Build Checks Without pnpm Upgrade

**Files:**
- No planned source edits.
- Evidence files under `~/security-audits/mini-shai-hulud-v4/`.

- [ ] **Step 1: Record current pnpm version**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
{
  jq -r '.packageManager' package.json
  corepack pnpm --version
} > "$EVID/clew-pnpm-version.txt"
```

Expected: command records the configured package manager and active pnpm version.

- [ ] **Step 2: Install with scripts disabled**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
corepack pnpm install --frozen-lockfile --ignore-scripts > "$EVID/clew-pnpm-install-ignore-scripts.txt" 2>&1
```

Expected: install succeeds without running lifecycle scripts. If it fails because of network or package-manager version issues, report and ask before changing pnpm.

- [ ] **Step 3: List ignored builds**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
corepack pnpm ignored-builds > "$EVID/clew-pnpm-ignored-builds.txt" 2>&1 || true
```

Expected: blocked native build packages are recorded and not approved automatically.

- [ ] **Step 4: Build, check, and test**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
corepack pnpm -r build > "$EVID/clew-build.txt" 2>&1
corepack pnpm -r check > "$EVID/clew-check.txt" 2>&1
corepack pnpm test > "$EVID/clew-test.txt" 2>&1
```

Expected: all commands pass, or failures are reported with exact excerpts.

- [ ] **Step 5: Run audit as a signal only**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
corepack pnpm audit --audit-level high > "$EVID/clew-pnpm-audit.txt" 2>&1 || true
```

Expected: audit output is captured. A clean audit does not prove safety.

### Task 7: Scan `clew` Lockfile and Package Artifacts

**Files:**
- No planned source edits.
- Evidence files under `~/security-audits/mini-shai-hulud-v4/`.

- [ ] **Step 1: Scan lockfile sources and lifecycle hints**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
{
  echo "=== github/file/git/link/workspace sources ==="
  grep -nE "github:|git\\+|file:|link:|workspace:" pnpm-lock.yaml || true
  echo "=== lifecycle/script hints in lockfile ==="
  grep -nE "postinstall|preinstall|prepare|install:" pnpm-lock.yaml || true
  echo "=== package importers ==="
  grep -n "importers:" pnpm-lock.yaml || true
} > "$EVID/clew-lockfile-scan.txt"
```

Expected: `workspace:` entries are expected inside the monorepo. External `github:`, `git+`, `file:`, or `link:` entries require review.

- [ ] **Step 2: Scan installed package lifecycle scripts**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
find node_modules -path "*/package.json" 2>/dev/null |
  xargs jq -r 'select(.scripts != null) | select(.scripts.preinstall or .scripts.install or .scripts.postinstall or .scripts.prepare or .scripts.prepack or .scripts.prepublishOnly) | [.name, .version, (.scripts | tostring)] | @tsv' 2>/dev/null > "$EVID/clew-installed-lifecycle-scripts.txt"
```

Expected: lifecycle scripts are reviewed, not deleted.

- [ ] **Step 3: Generate package dry-runs**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/clew
for pkg in packages/*; do
  if [ -f "$pkg/package.json" ]; then
    echo "=== PACK DRY RUN: $pkg ==="
    (cd "$pkg" && npm pack --dry-run)
  fi
done > "$EVID/clew-pack-dry-run.txt" 2>&1
```

Expected: tarball contents contain no secrets, sandbox state, `.npmrc`, logs, agent memory, or unexpected large/private files.

### Task 8: Add `aimux` Security Docs and Run Read-Only Checks

**Files:**
- Create or modify: `/Users/matt/code/aimux/SECURITY.md`
- Create or modify: `/Users/matt/code/aimux/AGENT_SECURITY.md`
- Evidence files under `~/security-audits/mini-shai-hulud-v4/`.

- [ ] **Step 1: Capture aimux state**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/aimux
{
  echo "=== aimux root ==="
  pwd
  git status --short
  git remote -v
  cat go.mod
  echo "=== possible sensitive files in aimux repo ==="
  find . -maxdepth 4 -type f \( -name ".env*" -o -name ".npmrc" -o -name "*token*" -o -name "*session*" -o -name "*.log" \) -not -path "*/.git/*" -print
  echo "=== aimux managed worktrees ==="
  find "$HOME/.aimux/worktrees" -maxdepth 2 -name go.mod -print 2>/dev/null || true
} > "$EVID/aimux-state.txt"
```

Expected: aimux repo and managed worktrees are observed but not mutated.

- [ ] **Step 2: Add aimux `SECURITY.md`**

Create `/Users/matt/code/aimux/SECURITY.md` with:

```markdown
# aimux Security Notes

aimux is currently a Go project, not an npm package.

The primary risks are:

- terminal and session visibility
- managed worktrees under `~/.aimux/worktrees`
- accidental persistence of session logs or tokens
- future installer or wrapper packages
- Docker/socket exposure if used with container orchestration

## Rules

- Do not delete or mutate `~/.aimux/worktrees` without explicit approval.
- Do not publish npm packages from this repo unless a separate wrapper package is designed.
- Do not store session tokens, model provider keys, GitHub tokens, or terminal logs in plaintext.
- Do not add package-manager installer scripts without security review.
- If a future npm quick-install package is added, it must be scoped, minimal, and treated as a release artifact rather than canonical source.
```

Expected: file exists and does not imply aimux is an npm package.

- [ ] **Step 3: Add aimux `AGENT_SECURITY.md`**

Create `/Users/matt/code/aimux/AGENT_SECURITY.md` with:

````markdown
# Agent Security Rules for aimux

aimux is a terminal, session, and worktree orchestration project. Treat it as a high-trust local tool.

## Prohibited without explicit approval

Agents may not:

- delete `~/.aimux/worktrees`
- delete session state
- persist tokens in plaintext
- add npm quick-install wrappers
- create `package.json` for npm distribution
- add `curl | sh` installers
- mount the Docker socket
- modify shell startup files
- write LaunchAgents or LaunchDaemons

## Required before dependency changes

For Go dependencies:

```bash
go list -m all
go test ./...
```

Do not run `go get` without explaining why the dependency is needed.

## Future npm wrapper rule

If aimux later gets an npm quick-install package, it must be scoped, minimal, and release-only. It must not contain broad install scripts without review.
````

Expected: file exists and documents agent limits.

- [ ] **Step 4: Run Go checks**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/aimux
go list -m all > "$EVID/aimux-go-modules.txt" 2>&1
go test ./... > "$EVID/aimux-go-test.txt" 2>&1
```

Expected: commands pass, or failures are reported with exact excerpts.

- [ ] **Step 5: Run govulncheck only if already installed**

Run:

```bash
EVID="$HOME/security-audits/mini-shai-hulud-v4"
cd /Users/matt/code/aimux
if command -v govulncheck >/dev/null 2>&1; then
  govulncheck ./... > "$EVID/aimux-govulncheck.txt" 2>&1 || true
else
  echo "govulncheck not installed; skipped without installing" > "$EVID/aimux-govulncheck.txt"
fi
```

Expected: no tool is installed automatically.

### Task 9: Document Future `clew` Publishing Design

**Files:**
- Create: `/Users/matt/code/clew/docs/superpowers/specs/2026-05-21-npm-publishing-design.md`

- [ ] **Step 1: Create publishing design doc**

Create `/Users/matt/code/clew/docs/superpowers/specs/2026-05-21-npm-publishing-design.md` with:

````markdown
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
````

Expected: design doc exists, but no release workflow is created.

### Task 10: Optional pnpm Upgrade Decision

**Files:**
- Potentially modify later: `/Users/matt/code/clew/package.json`
- Potentially modify later: `/Users/matt/code/clew/pnpm-lock.yaml`

- [ ] **Step 1: Decide whether upgrade is necessary**

Use the evidence from Task 6:

- If `corepack pnpm install --frozen-lockfile --ignore-scripts` passes and `ignored-builds` is available, do not upgrade pnpm in this pass.
- If pnpm blocks safety checks, propose a separate exact-version upgrade.

Expected: no pnpm upgrade occurs without a separate approval.

- [ ] **Step 2: If separately approved, use an exact version**

Run only after approval:

```bash
cd /Users/matt/code/clew
corepack use pnpm@<exact-10.x-version>
corepack pnpm --version
```

Expected: `package.json` records the selected package manager. Review any lockfile or package-manager metadata changes before continuing.

### Task 11: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Verify `clew` diffs**

Run:

```bash
cd /Users/matt/code/clew
git diff --stat
git diff -- package.json pnpm-workspace.yaml SECURITY.md AGENT_SECURITY.md .npmignore docs/superpowers/specs/2026-05-21-npm-publishing-design.md packages/*/package.json
git diff --check
```

Expected: changes are limited to approved files and no whitespace errors appear.

- [ ] **Step 2: Verify `clew` checks**

Run:

```bash
cd /Users/matt/code/clew
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm -r build
corepack pnpm -r check
corepack pnpm test
find packages -maxdepth 2 -name package.json -print0 |
  xargs -0 jq -r '[input_filename, .name, .private, (.files // null), (.publishConfig // null)] | @tsv'
```

Expected: checks pass or failures are reported. All workspace packages remain private.

- [ ] **Step 3: Verify `aimux` diffs and tests**

Run:

```bash
cd /Users/matt/code/aimux
git diff --stat
git diff -- SECURITY.md AGENT_SECURITY.md
git diff --check
go test ./...
```

Expected: aimux changes are docs-only and tests pass or failures are reported.

- [ ] **Step 4: Final report**

Report:

- files changed
- host compromise triage findings
- npm config and token findings
- `clew` package privacy state
- package dry-run findings
- `aimux` worktree/session findings
- Docker socket findings
- GitHub workflow publishing findings
- unresolved red/yellow risks
- exact failed commands with short output excerpts

Expected: do not claim the environment is clean unless every check completed successfully.
