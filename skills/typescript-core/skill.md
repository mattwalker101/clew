# TypeScript Core

This skill provides strict guidance for developing high-fidelity TypeScript packages within a pnpm monorepo. It prioritizes type safety, explicit boundaries, and runtime correctness.

## Core Mandates

### 1. Strict Type Safety
- **No `any`**: The use of `any` is strictly prohibited unless specifically required for low-level interop. Use `unknown` and type guards instead.
- **Explicit Returns**: Always provide explicit return types for public API functions and exported methods. This improves readability and ensures that internal changes don't accidentally leak type modifications.
- **Strict Null Checks**: Assume that everything could be `null` or `undefined` unless the type system proves otherwise.

### 2. Explicit Package Boundaries
- **Encapsulation**: Treat each package as a black box. Only expose what is absolutely necessary through the package's primary entry point (`src/index.ts`).
- **Internal Visibility**: Use TypeScript's module visibility features to hide implementation details from the rest of the monorepo.
- **No Circular Dependencies**: Ensure that packages follow a strict hierarchical dependency graph. Circular dependencies between packages are a violation of the monorepo architecture.

### 3. Runtime Validation
- **Boundary Checks**: Validate all data crossing package boundaries using strict runtime validators (e.g., Zod). Never trust data coming from another package or an external source.
- **Fail Fast**: Throw explicit, actionable errors when validation fails. Do not proceed with malformed or invalid state.

### 4. Monorepo Ecosystem
- **pnpm Workspaces**: Use `workspace:*` protocols for internal dependencies. Do not hardcode versions for packages within the same monorepo.
- **Shared Configs**: Inherit from shared `tsconfig.base.json` and linting configurations. Maintain consistency across all packages.

## Operational Policies
- **Document Public Types**: Provide TSDoc comments for all exported types, interfaces, and public methods.
- **Type-Safe Testing**: Use Vitest with strict type-checking in tests. Ensure that test code adheres to the same safety standards as production code.
- **Deterministic Imports**: Use explicit, deterministic import paths. Avoid "magic" resolution or deeply nested relative paths where absolute workspace paths are more clear.
