# Design Document: CLI Runbooks Integration

**Date:** 2026-05-28  
**Topic:** CLI Integration for Guided Runbooks & Execution Tracking  
**Status:** Approved (Approach A)  

---

## 1. Background & Context

In `clew v0.3`, we introduced underlying guided runbook support, including:
1. Zod schema validation for runbook steps and verification gates (file existence, grep regex matches, and script commands).
2. SQLite state machine persistence (using native `node:sqlite` in `packages/clew-core`).
3. Execution verification runtime via `SessionManager`.

To expose this capability to developers, we need to extend `@clew-ops/cli` with terminal subcommands under a unified `clew run` namespace.

---

## 2. Architecture & Design Decisions

### A. Repository-Level Session DB
Following the design of the composed skills registry (`.clew-registry.db`), all runbook session data will be persisted locally within each workspace:
* **Session Database Path:** `.clew-session.db` (in `process.cwd()`).
* **Git Cleanliness:** `.clew-session.db` and `.clew-session.db-*` (WAL/journal files) will be added to the repository's `.gitignore`.

### B. Session Lifecycle & Implicit Lookup
To ensure an ergonomic developer experience, the CLI will implicitly target the **most recently started active session**.
* **Active Session Lookup:**
  ```sql
  SELECT id, skill_id, current_step_id FROM session_runs 
  WHERE status = 'active' 
  ORDER BY created_at DESC LIMIT 1;
  ```
* **Step Progression:** When `SessionManager.verifyCurrentStep` succeeds on the last step, the session's status changes to `completed` automatically, so subsequent status calls will recognize that no active session is running.

---

## 3. CLI Subcommand Specifications

All subcommands will reside under the `run` command route: `clew run <start|status|verify>`.

### 1. `clew run start <skill-id>`
* **Description:** Initializes a new runbook session for the specified skill ID.
* **Flow:**
  1. Validates that the skill exists in the registry.
  2. Creates a local session database if not already present.
  3. Verifies if there are any currently active sessions. If there are, it transitions their statuses to `failed` or `completed` to prevent concurrent active runbook conflicts.
  4. Calls `SessionManager.createSession(skillId)` to initialize the step states.
  5. Outputs the title, instruction, and verification gates of the first step.

### 2. `clew run status`
* **Description:** Displays the current active step's instructions and the validation status of its verification gates.
* **Flow:**
  1. Locates the active session in `.clew-session.db`. If none is active, displays an informative error.
  2. Queries the active step's state (including verification attempts, last verified timestamp, and failure logs).
  3. Formats and prints each gate status with standard green checkmark (`✔`), red cross (`✖`), or bullet (`•`) indicators.

### 3. `clew run verify`
* **Description:** Triggers verification logic on the active session's current step.
* **Flow:**
  1. Resolves the active session ID.
  2. Instantiates `SessionManager` and calls `verifyCurrentStep(sessionId)`.
  3. Outputs real-time gate evaluation status.
  4. If validation passes and a next step is available: advances the pointer and prints the next step's instruction.
  5. If validation passes and it was the final step: marks the runbook session as `completed` and outputs a celebration message.
  6. If validation fails: prints detailed error diagnostics for each failed gate.

---

## 4. Testing & Verification Plan

1. **Unit Tests (`packages/clew-cli/src/index.test.ts`):**
   * Mock the registry database and filesystem.
   * Verify that `clew run start` creates a session.
   * Verify that `clew run status` parses and renders the active step state correctly.
   * Verify that `clew run verify` successfully triggers the execution engine and formats the results.
2. **Integration Checks:**
   * Run the CLI commands end-to-end using a mock runbook manifest.
   * Verify SQLite persistence file `.clew-session.db` is correctly ignored in `.gitignore`.
