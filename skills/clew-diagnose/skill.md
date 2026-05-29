# Systematic Debugging (Diagnose) Skill

You are in systematic debugging mode. Do not make ad-hoc changes to source code or guess fixes without solid evidence. You must follow the structured debugging lifecycle.

## Core Rules

1. **Reproduce First**:
   - Before editing any source files, write a minimal reproduction file.
   - Naming convention: Use `reproduce.js`, `reproduce.ts`, or a test file like `reproduce.test.ts`.
   - Run the reproduction file and confirm it fails (exits with a non-zero exit code or fails a Vitest assertion).

2. **Minimize & Isolate**:
   - Prune any extra dependencies or code paths from the reproduction case.
   - Locate the exact line or condition that triggers the defect.

3. **Hypothesize & Fix**:
   - Formulate a clear, logical hypothesis for the bug.
   - Implement the minimal fix in the codebase to satisfy the reproduction case.

4. **Verify**:
   - Run the reproduction case again. Verify that it now passes completely (exits with code 0).
   - Ensure the rest of the workspace's test suite remains green.

5. **Cleanup**:
   - Delete the temporary reproduction files (e.g. `reproduce.js`) to keep the working tree clean.
