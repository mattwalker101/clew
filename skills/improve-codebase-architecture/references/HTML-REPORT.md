# HTML Report Format

The architectural review is rendered as a single self-contained HTML file in the OS temp directory. Tailwind and Mermaid both come from CDNs. Mermaid handles graph-shaped diagrams reliably; hand-built divs and inline SVG handle the more editorial visuals (mass diagrams, cross-sections). Mix the two — don't lean on Mermaid for everything, it'll start to look generic.

---

## 1. Scaffold Layout

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review — {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* small custom layer for things Tailwind doesn't cover cleanly:
         dashed seam lines, hand-drawn-feeling arrow heads, etc. */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

---

## 2. Structural Requirements

### A. Header Panel
Repo name, date, and a compact legend: solid box = module, dashed line = seam, red arrow = leakage, thick dark box = deep module. No introduction paragraph — straight into the candidates.

### B. Candidate Card (`<article>`)
Render each candidate as a Tailwind card:
*   **Title** — short, names the deepening (e.g. "Collapse the Order intake pipeline").
*   **Badge Row** — recommendation strength (`Strong` = emerald, `Worth exploring` = amber, `Speculative` = slate), plus a tag for the dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
*   **Files** — monospaced list, `font-mono text-sm`.
*   **Before / After Diagram** — the centerpiece. Two columns, side by side.
*   **Problem** & **Solution** — exactly one sentence each. Sparse and direct.
*   **Wins** — bullet list, max 6 words per bullet. e.g. "Tests hit one interface", "Pricing stops leaking", "Delete 4 shallow wrappers".
*   **ADR warning callout** (if applicable) — one line in an amber-tinted box.

---

## 3. Diagram Patterns

### A. Mermaid flowchart (dependency/call flow)
Wrap it in a Tailwind-styled card so it doesn't feel parachuted in:
```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### B. Hand-built boxes-and-arrows (visualizing deep modules)
Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements positioned absolutely over a relative container. Reach for this when you want the "after" diagram to feel like one thick-bordered deep module with greyed-out internals.

### C. Cross-sections (visualizing layers)
Stack horizontal bands (`h-12 border-l-4`) to show layers a call passes through. Before: 6 thin layers doing nothing. After: 1 consolidated thick band.

### D. Call-graph collapse
Before: nested boxes of function trees. After: collapsed box, with the now-internal calls shown faded inside it.

---

## 4. Style & Wording Guidance

*   **Aesthetic:** Lean editorial. Serif optional for headings (`font-serif`). Stone/slate theme.
*   **Colors:** Accent (emerald/indigo), red for leakage, amber for warnings.
*   **Sizing:** Keep diagrams ~320px tall so before/after sits side-by-side without vertical scrolling.
*   **Wording:** Be concise. Avoid "throat-clearing" phrasing. Use exact glossary terms from `LANGUAGE.md`.
*   **Wins structure:** State gain in glossary terms (*"locality: bugs concentrate in one module"*, *"leverage: one interface, N call sites"*, *"interface shrinks; implementation absorbs wrappers"*). Don't use non-glossary words like *"cleaner code"*.
