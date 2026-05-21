# Contributing to clew

First off, thank you for considering contributing to **clew**! It’s people like you that make the agentic ecosystem a better place for everyone.

## 🧭 Our Philosophy

We follow a **Plan-First** and **Contract-First** development methodology. This ensures that every change is intentional, verifiable, and explainable.

### Core Mandates
*   **Explainability**: Every feature must expose its reasoning.
*   **Local-First**: No required cloud dependencies for core logic.
*   **Deterministic**: Same input + same context = same output.

---

## 🛠 How to Contribute

### 1. Identify a Gap
Check the [Issue Tracker](https://github.com/mattwalker101/clew/issues) or the [Implementation Roadmap](docs/clew%20Implementation%20Roadmap%20v0.1.md) to see what’s next.

### 2. Propose a Plan
For non-trivial changes, we prefer seeing a **Plan** before code.
*   Create a new file in `docs/superpowers/plans/` using the naming convention `YYYY-MM-DD-feature-name.md`.
*   Outline the objective, background, and implementation steps.
*   Once the plan is approved, implementation can begin.

### 3. Implement & Verify
*   Use `corepack pnpm install` to set up.
*   Write tests for every new feature. We use **Vitest**.
*   Maintain strict TypeScript types at all package boundaries.
*   Run the full verification suite before submitting:
    ```sh
    corepack pnpm check
    corepack pnpm test
    ```

### 4. Submit a Pull Request
*   Reference the plan you created.
*   Provide a clear summary of the changes and why they matter.
*   Ensure CI passes.

---

## 🏗 Repository Structure

*   `packages/clew-schema`: Foundational Zod contracts.
*   `packages/clew-core`: The registry and activation engine.
*   `packages/clew-cli`: The primary human interface.
*   `packages/clew-mcp`: The Model Context Protocol bridge.
*   `packages/clew-importers/exporters`: Ecosystem interop logic.

---

## 📜 Code of Conduct

Please be respectful and professional in all interactions. We aim to build a collaborative environment for senior-level engineering judgment.

---

## ⚖️ License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
