# clew — the thread for agentic navigation

[![CI](https://github.com/mattwalker101/clew/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mattwalker101/clew/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](https://github.com/mattwalker101/clew/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**clew** is a portable operational knowledge system for coding agents. It is a runtime-agnostic, local-first layer for reusable skills, registry intelligence, capability-aware activation, ecosystem interoperability, and explainable orchestration guidance.

clew is not a workflow execution engine, autonomous agent runtime, prompt package manager, or vendor-specific framework.

---

## 🧵 Why clew?

Most agentic knowledge is currently trapped in:
*   **Isolated Prompts**: One-off instructions that don't scale or travel.
*   **Vendor-Specific Hacks**: Logic tied to a single AI interface.
*   **Opaque Orchestration**: Systems that do things without explaining *why*.

**clew** changes the game by treating operational knowledge as **portable infrastructure**.

---

## 🚀 Quick Start (in 60 Seconds)

### 1. Install & Build
```sh
git clone https://github.com/mattwalker101/clew.git
cd clew
corepack pnpm install
corepack pnpm build
```

### 2. Connect to Claude Desktop
The most powerful way to use `clew` is via the Model Context Protocol (MCP).
```sh
corepack pnpm -w exec node packages/clew-cli/dist/index.js mcp install
```
*Restart Claude Desktop to see the new `clew` tools!*

### 3. Launch the clew Cockpit
Launch the dynamic observability dashboard locally:
```sh
node packages/clew-cli/dist/index.js dashboard --port=7708
```
*Open `http://localhost:7708` in your browser to inspect your registry!*

### 4. Get Your First Recommendation
From any project directory:
```sh
clew-cli recommend "I need to refactor a complex module" --explain
```

---

## 🖥️ clew Cockpit (Observability Dashboard)

Version `v0.2.0` introduces the **clew Cockpit**, a beautiful local web-based dashboard served directly from the CLI to visualize your composed registry and diagnose your project environment:

*   **Interactive Concentric Knowledge Map**: A responsive SVG relationship network mapping skills concentrically based on their layer (`System`, `Project`, and `User`). Highlights active warning conflicts in neon red, redundant suppressions in dashed amber, and inheritance lines in solid blue.
*   **Glassmorphic Health Gauge**: A glowing progress ring card that dynamically computes a 0–100% Registry Health Score based on active conflicts, overlaps, and warnings.
*   **Activation Trace Debugger**: A real-time explain console to run live queries, map triggers/telemetry, and trace suppressed redundant candidate recommendations.
*   **Workspace Diagnostic Feed**: Aggregated health warnings combining filesystem registry errors and `AGENTS.md` preferences.

---

## 🧠 Semantic & Relationship Intelligence

clew `v0.2.0` moves beyond basic keywords to offer a highly context-aware intelligence layer:

*   **Local Embeddings**: Meaning-based discovery powered by a local embedding engine using `@huggingface/transformers` and `sqlite-vec` in SQLite (no API keys required).
*   **Smart Suppression**: Automated overlay resolution that prioritizes and recommends the most specific skill when redundancies are detected, explaining why others were suppressed.
*   **Constraint-Aware Exclusions**: Integrates active project policies directly from `AGENTS.md` to force-exclude skills violating "never" or "avoid" rules.

---

## 🧠 Core Concepts

See our [Architecture Guide](docs/ARCHITECTURE.md) for a deep dive into how `clew` works.

### **Skills**
Canonical bundles of operational knowledge. A skill is a simple directory with a `clew.yaml` manifest and a `skill.md` instruction file. They can **extend** each other to build deep, hierarchical judgment.

### **Registry**
A layered discovery system. `clew` scans your session, project, and global directories to build a unified index of available knowledge. The SQLite-backed registry is a **rebuildable derived state** from your filesystem bundles.

### **Activation Engine**
Intelligent, explainable routing. The engine uses keyword matching, tag activation, project-specific overlays (`AGENTS.md`), and repository signals (e.g., "this is a TypeScript project") to recommend exactly the right skill for the task at hand.

---

## 🔌 Ecosystem Interop

`clew` is designed to be the "source of truth" that bridges between different agent ecosystems.

*   **Claude**: Import `.json` skills from Claude Desktop and export them back with full fidelity (preserving slash commands and metadata).
*   **OpenCode**: High-fidelity bridge for the OpenCode format.
*   **Portable Registry**: Move your `~/.clew/global` directory to any machine to bring your senior-level judgment with you.

---

## ✨ Built with Superpowers

This project is built using its own core philosophy. We use a **"Plan-First"** and **"Contract-First"** methodology (the `superpowers` pattern).

*   **Deterministic Logic**: Every decision the CLI or MCP server makes is backed by a reportable evidence trail.
*   **Surgical Precision**: We prioritize small, verifiable diffs and behavior-preserving refactors.
*   **Strict Typing**: High-fidelity TypeScript packages with validated boundaries.

See [docs/v0.1-workflows.md](docs/v0.1-workflows.md) for detailed operational guidance on using these patterns.

---

## 🤝 Contributing

We welcome contributions that align with our core mandates of **Explainability**, **Local-First**, and **Deterministic Interop**.

1.  Check the [Roadmap](docs/clew Roadmap v0.2.md) for upcoming phases.
2.  Read our [Contributing Guidelines](CONTRIBUTING.md).
3.  Ensure all **148+ tests** pass before submitting a PR.

---

## ⚖️ License

MIT © [Matthew Walker](https://github.com/mattwalker101)
