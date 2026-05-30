# clew — the thread for agentic navigation

[![CI](https://github.com/mattwalker101/clew/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mattwalker101/clew/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.6.0-blue.svg)](https://github.com/mattwalker101/clew/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**clew** is a portable, local-first operational knowledge system for coding agents. It serves as a secure, runtime-agnostic, and 100% offline layer for reusable skills, registry intelligence, capability-aware activation, and explainable orchestration guidance.

`clew` is not a workflow execution engine, autonomous agent runtime, prompt package manager, or vendor-specific framework.

---

## 🧵 Why clew?

Most agentic knowledge is currently trapped in:
*   **Isolated Prompts**: One-off instructions that don't scale or travel.
*   **Vendor-Specific Hacks**: Logic tied to a single AI interface.
*   **Opaque Orchestration**: Systems that do things without explaining *why*.

**clew** changes the game by treating operational knowledge as **portable, secure, and explainable infrastructure**.

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

### 4. Run Telemetry & Diagnostics
```sh
# Sync logs and index new telemetry records
node packages/clew-cli/dist/index.js audit sync

# Analyze the last 15 commands for anomalous behaviors
node packages/clew-cli/dist/index.js audit analyze
```

---

## 🛡️ Multi-Pillar Security Gating (Antivirus & Veto Layer)

Version `v0.4.0` through `v0.6.0` introduce comprehensive, local-first safety gating for reusable skills, registry loading, and step executions:

*   **Constitutional Pre-Commit Hooks (`v0.4.0`):** Hard-vetoes commit attempts automatically if repository configurations or core security policies in `AGENTS.md` are degraded.
*   **Static Manifest Scanner (`v0.5.0`):** A zero-dependency, JS-native YAML rule validator checking skill manifests for malicious payloads or capacity misalignments using safe, linear-time regex patterns.
*   **Script Behavioral AST Scanner (`v0.5.0`):** Traverses JavaScript/TypeScript ASTs using `acorn` and processes Python/Shell regex heuristics to strictly block unauthorized imports (`child_process`, `net`), global identifiers (`fetch`, `eval`), and privilege bypass vectors (`sudo`, `curl`). Enforces an AST scope-stack to eliminate local shadowing false-positives.
*   **Local Semantic LLM-as-a-Judge (`v0.5.0`):** Vets natural language instruction markdown files for prompt injection vectors. Runs 100% offline by default using a local **Ollama** REST daemon.

---

## 📊 LanceDB Telemetry & Anomaly Ledger

Version `v0.6.0` introduces real-time telemetry audit trails and AI-augmented vector anomaly detection:

*   **Real-time Append Logging:** Every CLI command execution, MCP tool query, and security veto is appended immediately to a secure local JSONL file (`audit.jsonl`), failing silently in read-only sandboxes to protect command execution.
*   **LanceDB Synchronization:** Decoupled, high-speed delta indexing vectorizes telemetry logs using our local HuggingFace Embedding Engine (`Xenova/all-MiniLM-L6-v2`) into a local LanceDB table.
*   **K-Nearest Neighbors (KNN) Anomaly Vetoes:** Searches LanceDB for vector neighbors. If an executed command's cosine distance to historical precedents exceeds `0.75`, `clew` flags a high-priority anomaly warning in a premium console alert block.

---

## 🖥️ clew Cockpit (Observability Dashboard)

Serves a beautiful, glassmorphic local dashboard directly from the CLI to visualize your operational registry:

*   **Interactive Concentric Knowledge Map**: A responsive SVG relationship network mapping skills concentrically based on their layer (`System`, `Project`, and `User`). Highlights active warning conflicts in neon red, redundant suppressions in dashed amber, and inheritance lines in solid blue.
*   **Glassmorphic Health Gauge**: A glowing progress ring card that dynamically computes a 0–100% Registry Health Score based on active conflicts, overlaps, and warnings.
*   **Activation Trace Debugger**: A real-time explain console to run live queries, map triggers/telemetry, and trace suppressed redundant candidate recommendations.

---

## 🔌 Ecosystem Interop

`clew` is designed to be the "source of truth" that bridges between different agent ecosystems.

*   **Claude Desktop**: Import JSON skills from Claude Desktop and export them back with full fidelity (preserving slash commands and metadata).
*   **OpenCode**: High-fidelity bridge for the OpenCode agent format.
*   **Portable Registry**: Move your `~/.clew` and `.jsonl` files to any machine to bring your senior-level judgment with you.

---

## ✨ Built with Superpowers

This project is built using its own core philosophy. We use a **"Plan-First"** and **"Contract-First"** methodology (the `superpowers` pattern).

*   **Deterministic Logic**: Every decision the CLI or MCP server makes is backed by a reportable evidence trail.
*   **Surgical Precision**: We prioritize small, verifiable diffs and behavior-preserving refactors.
*   **Strict Typing**: High-fidelity TypeScript packages with validated boundaries.

See [docs/plans/archive/](docs/plans/archive/) for detailed planning archives.

---

## 🤝 Contributing

We welcome contributions that align with our core mandates of **Explainability**, **Local-First**, and **Deterministic Interop**.

1.  Read our [Architecture Guide](docs/ARCHITECTURE.md) to understand the vector and security gates.
2.  Read our [Contributing Guidelines](CONTRIBUTING.md).
3.  Ensure all **288+ tests** pass before submitting a PR.

---

## ⚖️ License

MIT © [Matthew Walker](https://github.com/mattwalker101)
