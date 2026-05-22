# Example: Explicit Package Boundaries

This example demonstrates the "Encapsulation" and "Internal Visibility" mandates in a monorepo.

## The Problem
Directly importing implementation details from another package creates tight coupling and makes refactoring difficult.

```typescript
// BAD: Reaching into internal modules
import { InternalRegistryHelper } from "@clew-ops/core/src/internal/helper.js";
```

## The Solution: Explicit Entry Points

### 1. Define Internal Implementation (`src/internal/registry.ts`)
Logic that should not be exposed to other packages.

```typescript
// Only used within @clew-ops/core
export class InternalRegistryManager {
  // ...
}
```

### 2. Define Public API (`src/index.ts`)
The package's "black box" interface.

```typescript
// Export ONLY the public interface
export { SkillRegistry } from "./registry.js";
export type { RegistryEntry } from "./types.js";

// DO NOT export InternalRegistryManager
```

### 3. Consume via Workspace Protocol (`package.json`)
Callers must use the public interface via the workspace package.

```json
{
  "dependencies": {
    "@clew-ops/core": "workspace:*"
  }
}
```

## Why this is "TypeScript Core"
- **Encapsulation**: Implementation details can change without breaking other packages.
- **Architectural Clarity**: The hierarchical structure of the monorepo is preserved.
- **Improved Compilation**: Smaller public API surfaces reduce the work the TypeScript compiler needs to do across package boundaries.
