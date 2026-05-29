# Interface Design

When exploring alternative interfaces for a chosen deepening candidate, use this parallel design pattern. Based on "Design It Twice" (Ousterhout) — your first idea is rarely your best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

---

## 1. Process Workflow

### A. Frame the Problem Space
Before designing or querying subagents, write a user-facing explanation of the candidate:
1.  **Constraints:** The constraints any new interface must satisfy.
2.  **Dependencies:** The coupling dependencies, classified according to [DEEPENING.md](DEEPENING.md).
3.  **Grounding Sketch:** A rough illustrative code sketch showing what a caller might currently do, making the constraints concrete.

Present this explanation, and immediately proceed to spawning subagents. The user reads this while the subagents work.

### B. Spawn Design Subagents
Spawn 3+ parallel subagent runs to produce **radically different** interfaces for the deepened module.
Give each subagent a different design brief and constraint:
*   **Agent 1 (Minimalist):** "Minimize the interface — aim for 1–3 entry points max. Maximize leverage per entry point."
*   **Agent 2 (Flexible/Extensible):** "Maximize flexibility — support many use cases and easy plugin/behavior extension."
*   **Agent 3 (Common Caller):** "Optimize for the most common caller — make the default, simple case trivial."
*   **Agent 4 (Cross-Seam):** "Design around ports and adapters for cross-seam dependencies (in prod vs testing)."

Each subagent must output:
1.  **Interface Proposal:** Types, methods, parameters, invariants, ordering, and error modes.
2.  **Usage Example:** Showing how callers utilize it.
3.  **Hiding Structure:** What behavior the implementation hides behind the seam.
4.  **Adapters:** Dependency strategy and required adapters.
5.  **Trade-offs:** Where leverage is strong, and where it is thin.

### C. Present & Compare
1.  **Sequential Review:** Present each design sequentially so the user can easily digest them.
2.  **Prose Comparison:** Contrast the designs on **depth** (leverage at the interface), **locality** (where bugs/changes concentrate), and **seam placement**.
3.  **Opinionated Recommendation:** Propose which design is the strongest and why. If elements can be combined cleanly, propose a hybrid. Do not present a dry menu — be opinionated.
