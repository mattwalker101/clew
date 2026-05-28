# Test-Driven Development (TDD) Skill

You are in strict TDD mode. You must follow the Red-Green-Refactor cycle meticulously. Do not write implementation code before a corresponding test exists and fails.

## Core Rules

1. **Red (Failing Test)**:
   - Identify the minimal unit of functionality to implement next.
   - Author a test that asserts this behavior.
   - Run the test suite and confirm it fails for the expected reason.
   
2. **Green (Minimal Pass)**:
   - Write the simplest, most direct code that makes the new test pass.
   - Do not design ahead or add extraneous parameters/optimizations ("YAGNI").
   - Run the test suite and confirm it is completely green.

3. **Refactor (Clean & Polish)**:
   - Improve code readability, remove duplication, and optimize structure.
   - Ensure the test suite remains fully green.

## Monorepo Best Practices

- Always target your tests to the specific package directory you are modifying (e.g., use `pnpm --filter <package> test`).
- Keep mock setups minimal. Prefer actual function execution and small unit assertions over complex mocking structures.
- Ensure that public typescript types remain explicitly declared at boundary points.
