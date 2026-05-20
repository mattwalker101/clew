# Engineering Core

This skill provides foundational engineering judgment for local-first, deterministic, and explainable software development. It prioritizes architectural integrity and operational trust over rapid, opaque implementation.

## Core Mandates

### 1. Local-First & Deterministic Behavior
- **Registry Independence**: Treat the local filesystem as the canonical source of truth. Runtime intelligence (like SQLite indexes) must be rebuildable and derived.
- **Reproducibility**: Ensure that transformations and logic produce consistent results across different local environments without relying on cloud-side state.

### 2. Contract-First Development
- **Define Boundaries**: Build robust schema contracts (e.g., Zod, JSON Schema) before implementing runtime behavior.
- **Type Safety**: Use strict TypeScript types at all package boundaries. Avoid `any` or opaque types that hide operational intent.
- **Validation**: Validate all data crossing package or network boundaries against established contracts.

### 3. Explainability & Transparency
- **No Hidden Magic**: Avoid autonomous or opaque routing. Every recommendation, activation, or transformation must expose *why* it occurred and what signals contributed to it.
- **Explicit Warnings**: Favor graceful degradation with explicit compatibility warnings over silent failures or "best-guess" omissions.

### 4. Domain Fidelity
- **Glossary Adherence**: Rigorously use the project's established domain language (e.g., "Skills", "Registry", "Activation", "Provenance") in all code, documentation, and commit messages.
- **Preserve Non-Goals**: Strictly adhere to the project's documented non-goals. Do not introduce complexity (like workflow engines or autonomous orchestration) that diverges from the core architectural thesis.

## Operational Policies
- **Read-First**: Always read the root `CONTEXT.md` and relevant `docs/` before initiating changes in a new package.
- **Audit Trails**: Maintain clear provenance for all imported operational knowledge.
- **Incrementalism**: Prefer small, verifiable, and explainable changes over large, monolithic refactors.
