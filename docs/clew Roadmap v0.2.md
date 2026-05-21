# clew v0.2: The Explainable Registry

## **Vision**
Transition `clew` from a declarative skill discovery tool to a context-aware intelligence layer that deeply understands the meaning, relationships, and utility of operational knowledge—all while remaining local-first and perfectly explainable.

---

## **Pillars of v0.2**

### **1. Semantic Understanding**
*   **Local Embeddings**: Implement a local-first semantic indexing system (e.g., using `transformers.js` or `onnxruntime`) to enable "meaning-based" discovery.
*   **Vector Registry**: Enhance the SQLite registry with vector search capabilities to supplement keyword and tag triggers.
*   **Explainable Semantic Matches**: Every semantic match must report its "Similarity Score" and the specific instruction snippets that drove the match.

### **2. Relationship Intelligence**
*   **Runtime Overlap Resolution**: Automatically identify and resolve redundant skill recommendations. If two skills cover the same ground, `clew` should recommend the most relevant one and explicitly state why the other was suppressed.
*   **Conflict Prevention**: Elevate conflict detection from a diagnostic tool (`clew conflicts`) to a runtime safety guard that warns agents when active skills have contradictory mandates.
*   **Constraint-Aware Activation**: Use project preferences to "force-exclude" skills that violate project-level "never" or "avoid" rules.

### **3. Operational Observability (The Dashboard)**
*   **clew Cockpit**: A lightweight, local web-based dashboard to visualize the registry.
*   **Knowledge Map**: Visual graph showing how skills extend each other and where they overlap.
*   **Activation Trace**: A "live" view of how a specific query or project context results in a specific set of recommendations.
*   **Registry Health Score**: A visual summary of the `doctor` command, highlighting stale skills, missing signals, and contract violations.

---

## **Phased Execution**

### **Phase 8: Semantic Foundations**
- [ ] Research and select local embedding library.
- [ ] Update `@clew/core` to generate and store embeddings for skill instructions.
- [ ] Implement `clew search --semantic` and integrate into `recommend`.

### **Phase 9: Relationship Overlays**
- [ ] Implement "Redundancy Suppression" in the Activation Engine.
- [ ] Add "Preference-Based Exclusion" (mandates from `AGENTS.md`).
- [ ] Update `clew explain` to show relationship-based logic (e.g., "Skill X suppressed because Skill Y is more specific").

### **Phase 10: The clew Cockpit**
- [ ] Create `@clew/dashboard` package (React/Vite or similar lightweight stack).
- [ ] Implement `clew dashboard` command to launch the local server.
- [ ] Build visual "Signal Debugger" for Activation Engine verification.

---

## **Success Criteria**
1.  **Discovery Fidelity**: `clew recommend` finds relevant skills even when exact keywords are missing.
2.  **Explainability Depth**: Every recommendation explains its semantic similarity and its relationship (overlap/conflict) to other candidates.
3.  **Visual Trust**: Users can see their entire operational knowledge base and its health in a single, intuitive interface.
