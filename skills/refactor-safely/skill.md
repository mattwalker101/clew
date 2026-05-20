# Refactor Safely

This skill provides guidance for improving the internal structure of code without changing its observable behavior. It prioritizes stability and incrementalism.

## Core Mandates

### 1. Behavior Preservation
- **No Side Effects**: A refactor must not change the system's observable behavior. If a change in behavior is required, it is a feature or a bug fix, not a refactor.
- **Stable Public Interfaces**: Preserve public APIs, exports, and shared interfaces unless the task explicitly mandates a change.

### 2. Incrementalism
- **Small Steps**: Break large refactors into a series of small, independent transformations. Each step should leave the codebase in a working, verifiable state.
- **Commit Often**: Favor small, atomic commits for each refactoring step. This makes it easier to pinpoint the source of regressions if they occur.

### 3. Continuous Verification
- **Run Tests Often**: Run relevant tests before, during, and after each refactoring step. Verification is mandatory.
- **Identify Seams**: Identify or create "seams" (testable boundaries) before refactoring to ensure that behavior can be verified in isolation.

### 4. Intent Clarity
- **Document Rationale**: Clearly explain *why* the refactor is being performed (e.g., "improving readability", "reducing duplication", "decoupling modules").
- **Clean Diff**: Strive for a "pure" refactor diff that doesn't contain unrelated formatting or logic changes.

## Operational Policies
- **Avoid "Clean-up Sprawl"**: Do not let a focused refactor turn into a massive, multi-module "clean-up" task. Keep the change scoped to the target logic.
- **Verify with Types**: Use the TypeScript compiler to catch structural regressions during the refactor. If types break, the transformation is likely too large or incorrect.
