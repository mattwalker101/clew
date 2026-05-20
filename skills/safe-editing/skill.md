# Safe Editing

This skill ensures that file modifications are conservative, context-aware, and respectful of existing code patterns. It prioritizes the preservation of system integrity over implementation speed.

## Core Mandates

### 1. Contextual Awareness
- **Read-Before-Edit**: Always read the surrounding code, imports, and related tests before making modifications. Understand the local "gravity" and coding style.
- **Identify Intent**: Discern the original programmer's intent before altering logic. If the intent is ambiguous, use search tools to find related implementations.

### 2. Surgical Precision
- **Scoped Patches**: Keep edits strictly scoped to the requested behavior. Avoid unrelated "clean-up" or refactoring unless explicitly instructed.
- **Minimal Diff**: Aim for the smallest possible change that correctly achieves the goal. This reduces the surface area for bugs and simplifies peer review.

### 3. Change Preservation
- **Preserve Unrelated Work**: Never revert or discard unrelated user changes. Be extremely careful when using "search and replace" tools to avoid unintended side effects in adjacent modules.
- **Respect Linting**: Adhere to the existing linting and formatting rules of the file. Do not introduce foreign formatting styles.

### 4. Verification-First
- **Validation**: Every change must be verifiable. If a change cannot be tested or observed, it is incomplete.
- **Regression Checks**: After editing, run relevant tests to ensure that existing functionality remains intact.

## Operational Policies
- **No Silent Erasure**: If a change requires removing code, ensure it is truly dead code or that its functionality has been correctly relocated.
- **Conservative Automation**: Use ecosystem tools (like `eslint --fix`) for mechanical changes, but manually verify their output.
