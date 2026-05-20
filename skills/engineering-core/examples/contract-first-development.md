# Example: Contract-First Development

This example demonstrates the "Contract-First" mandate by showing how to define a schema before implementation.

## 1. Define the Contract (`schema.ts`)
Always start by defining the shape of the data and its validation rules.

```typescript
import { z } from "zod";

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  roles: z.array(z.enum(["admin", "editor", "viewer"])).default(["viewer"]),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
```

## 2. Implement the Runtime (`registry.ts`)
The implementation then consumes the contract for validation at the boundaries.

```typescript
import { userProfileSchema, type UserProfile } from "./schema.js";

export function registerUser(input: unknown): UserProfile {
  // Validate at the boundary
  const result = userProfileSchema.safeParse(input);
  
  if (!result.success) {
    throw new Error(`Invalid user profile: ${result.error.message}`);
  }
  
  return result.data;
}
```

## Why this is "Engineering Core"
- **Deterministic**: The validation logic is declarative and consistent.
- **Explainable**: Errors are explicit about *why* they failed (field name, reason).
- **Type-Safe**: TypeScript types are derived directly from the source of truth (the schema).
