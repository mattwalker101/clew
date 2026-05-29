---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Make sure to trigger this skill whenever the user asks to review their architecture, improve modular depth, consolidate coupled modules, find refactoring opportunities, or make the codebase more testable and AI-navigable.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactoring cycles that turn shallow modules into deep ones. The primary objectives are to optimize codebase testability, promote locality, and maximize AI-navigability.

---

## 1. Architectural Vocabulary & Principles

Before initiating any exploration or review, you MUST read and internalize the strict vocabulary guidelines and principles in [LANGUAGE.md](references/LANGUAGE.md). 

Use these terms exactly in all suggestions and reports. Consistent language is crucial:
*   **Module** (interface + implementation).
*   **Interface** (everything a caller must know to use the module correctly).
*   **Implementation** (the code inside).
*   **Depth** (leverage at the interface: a lot of behavior behind a small surface).
*   **Seam** (where the interface lives; avoid "boundary").
*   **Adapter** (concrete implementer at a seam).
*   **Leverage** & **Locality** (the benefits for callers and maintainers).

---

## 2. Process Workflow

### Step A: Explore & Diagnose
1.  Read the project's domain glossary (`CONTEXT.md`) and any architectural decisions in `docs/adr/` to ground your understanding.
2.  Walk the codebase. You can delegate deep background repository surveys to the `research` subagent or explore inline using your search and grep tools.
3.  Diagnose areas of friction:
    *   Where does understanding a single concept require bouncing between multiple small, shallow modules?
    *   Where are module interfaces nearly as complex as their implementations?
    *   Where do tightly-coupled modules leak across their interfaces?
    *   Apply the **deletion test**: If you deleted a module, would its complexity disappear entirely, or would it disperse across callers? If it disperses, the module was a shallow pass-through.
4.  Define candidates for deepening. Classify the dependencies of each candidate using [DEEPENING.md](references/DEEPENING.md) (`in-process`, `local-substitutable`, `ports & adapters`, or `mock`).

### Step B: Generate the HTML Report
Write a self-contained HTML review file using the specifications and templates in [HTML-REPORT.md](references/HTML-REPORT.md).
1.  **Output Path:** Resolve the system temp directory from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows). Write to `<tmpdir>/architecture-review-<timestamp>.html` so you never pollute the git working directory.
2.  **Visuals:** Use Tailwind CSS and Mermaid graphs for call-flows. Supplement with hand-drawn SVG/CSS visual cross-sections and collapsed call-graphs.
3.  **DX Auto-Open:** Automatically open the file for the user (`open <path>` on macOS, `xdg-open <path>` on Linux, or `start <path>` on Windows) and print the absolute file path to the terminal.
4.  Do **NOT** propose interfaces yet. Simply present the cards, show the before/after visualizations, state your **Top Recommendation**, and ask: *"Which of these candidates would you like to explore?"*

### Step C: Grilling & Interface Design
Once the user selects a candidate, enter the **Grilling Loop** to explore alternative designs:
1.  **Iterate on Interfaces:** Follow the process in [INTERFACE-DESIGN.md](references/INTERFACE-DESIGN.md) ("Design It Twice") to contrast designs on depth, locality, and seam placement.
2.  **Domain Sync:** If a deepened module introduces a new domain concept or clarifies a fuzzy term, proactively add or sharpen it in the project's `CONTEXT.md` file.
3.  **ADR Creation:** If the user rejects a candidate for a structural, load-bearing reason, offer to record it as an architectural decision record (`docs/adr/`) to prevent future reviews from re-suggesting it.
