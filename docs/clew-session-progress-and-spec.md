# clew Session Progress, Technical Spec, and Release Roadmap

This document serves as the canonical record of the operational and architectural achievements completed during this session, the current capabilities of the codebase, identified gaps, and the clear steps necessary to finalize the upcoming releases.

---

## 1. Executive Summary: Accomplishments

In this session, `clew` was successfully evolved from a declarative discovery tool into a robust, context-aware operational orchestration engine. The key additions completed and merged include:

1. **Guided Runbooks State Machine**: Implemented a complete SQLite-based runbook execution system inside `@clew-ops/core` and integrated it into the CLI and MCP bridges.
2. **Interactive clew Cockpit Dashboard**: Bootstrapped a lightweight React/Vite local dashboard showcasing health diagnostics, an interactive skill network map, a live trace debugger, and a dynamic runbook execution stepper.
3. **Explainable Preference-Based Exclusions**: Added exact Skill ID matching and preference-based exclusions parsing from `AGENTS.md` (e.g. `never: <skill-id>`), preserving suppressed candidates so that the `explain` commands can clearly trace why a skill was deactivated.
4. **Bootstrapping Canonical Operational Skills**: Implemented three highly valuable, self-documenting workflow skills inside the `skills/` directory to serve as canonical developer guidelines:
   - **`clew-tdd`**: Enforces red-green-refactor cycles with automated test execution gates.
   - **`clew-diagnose`**: Enforces a rigorous defect systematic debugging loop with reproduction and clean-up gates.
   - **`clew-grill-me`**: Enforces interactive design and planning alignment before coding.

---

## 2. Technical Specification & Current Capabilities

### A. Guided Runbooks State Machine
Runbooks are declared directly in a skill's `clew.yaml` under the `steps` namespace. The execution tracking is handled via a SQLite session database (`.clew-session.db`).

*   **SQLite Schema (`session_runs` & `session_step_states`)**:
    *   `session_runs`: Tracks `id`, `skill_id`, `status` (`active`, `completed`, `failed`), `current_step_id`, `created_at`, `updated_at`.
    *   `session_step_states`: Tracks step-by-step state: `status` (`pending`, `active`, `completed`, `failed`), `attempts`, `last_verified_at`, `error_log`.
*   **Verification Gates**:
    1.  `file`: Asserts the existence of a given file path.
    2.  `grep`: Asserts a regular expression matches within a file.
    3.  `command`: Runs an arbitrary shell command with a configurable timeout (default 15 seconds) and checks for exit code `0` (success).

### B. Interactive Dashboard UI (clew Cockpit)
Launched via `clew dashboard`, the UI integrates visual observability into the local composed registry:
*   **Overview & Health Gauge**: Displays the `doctor` command output visually, including warning counts and agent diagnostics.
*   **Composed Registry Table**: Lists all globally and locally registered skills, capabilities, and triggering metadata.
*   **Knowledge Map**: Renders an interactive node-based SVG graph detailing skill hierarchy and extensions.
*   **Trace Debugger**: Shows a live breakdown of score components and multipliers for any arbitrary query context.
*   **Runbook Stepper**: Interacts directly with the session database to display active steps and verification gate statuses.

### C. Relationship Intelligence
Scoring is performed by the `ActivationEngine`, which resolves candidate relationships:
*   **Preference Suppression**: Negative constraints parsed from `AGENTS.md` (e.g. `avoid` or `never`) result in a `suppressed` status instead of `excluded`. This preserves them in the final candidate array to support explainability.
*   **Redundancy Suppression**: Identifies overlapping activation triggers and automatically suppresses the lower-ranked or less specific skill, adding a `redundancy` suppression payload pointing to the winner.

---

## 3. Key Architectural Decisions

1. **Preference Suppression Explainability**: Moving preference-based exclusions from an early-exit `"excluded"` phase to a `"suppressed"` phase in the scoring loop ensures that `clew explain` and the MCP bridge can retrieve the exact reasoning (`preference_violation`) and display it to the user.
2. **Git-Assisted Runbook Gates**: Operational skills like `clew-tdd` and `clew-diagnose` use git status porcelain commands inside their `command` gates (e.g., `git diff --name-only | grep ...`). This allows gates to automatically target the active test or reproduction file being modified by the developer, preventing hardcoded file paths.
3. **Separation of Concerns for Databases**: SQLite utilizes `.clew-registry.db` for the static composed registry index, and `.clew-session.db` in the repository working directory for local runbook tracking. This prevents runtime session writes from polluting the static skill registry.

---

## 4. Identified Gaps

While the current codebase is extremely healthy, the following gaps have been identified for future improvement:

*   **Runtime Conflict Safety Warning**: Although static conflicts are identified by `clew conflicts`, the `recommend` engine does not block or warn the user in real-time if they are actively using two contradictory skills.
*   **Interactive Trace Input in Dashboard**: The `TraceDebugger` visualizes traces for the active workspace context, but lacks a manual text input box to simulate and test arbitrary query activations on the fly.
*   **Writable Dashboard Telemetry Controls**: The Cockpit UI is currently read-only; you cannot toggle a skill's `"favorite"` or `"disabled"` state directly from the web interface.

---

## 5. Release Roadmap: Finishing the Release

To finalize the **v0.2.0 (Explainable Registry)** and **v0.3.0 (Guided Runbooks)** releases, the following steps are required:

### Phase A: CLI Shell Execution Safety (v0.3.0 Release Gate)
*   [x] Implement a command verification confirmation prompt in the CLI when running untrusted or arbitrary shell commands inside `command` gates.
*   [x] Provide a `--yes` or `--force` flag in `clew run verify` to bypass manual verification confirmations in headless CI environments.

### Phase B: Writable Cockpit Control Points (v0.2.0 Release Gate)
*   [x] Add `POST /api/telemetry/favorite` and `POST /api/telemetry/disable` endpoints to the Cockpit API server.
*   [x] Integrate "Favorite" and "Disable/Enable" toggle buttons into the Dashboard `RegistryTable` UI component.

### Phase C: Package Publishing & Diagnostics
*   [ ] Run a workspace-wide build audit using `pnpm -r publish --dry-run` to verify that all monorepo package bundles are packed with proper relative import directories.
*   [ ] Audit and prune stale developer scripts inside `.clew/` to ensure pristine local bootstrapping.
