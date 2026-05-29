# Shared Architectural Language

Establish a consistent, shared vocabulary for every recommendation, discussion, and design this skill makes. Use these terms exactly — never substitute "component," "service," "API," or "boundary." Consistent language is the whole point.

---

## 1. Glossary Terms

### **Module**
Anything with an interface and an implementation. Deliberately scale-agnostic — applies equally to a function, class, package, or tier-spanning slice.
*   *Avoid*: unit, component, service.

### **Interface**
Everything a caller must know to use the module correctly. Includes the type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics.
*   *Avoid*: API, signature (too narrow — those refer only to the type-level surface).

### **Implementation**
What's inside a module — its body of code. Distinct from **Adapter**: a thing can be a small adapter with a large implementation (a Postgres repository) or a large adapter with a small implementation (an in-memory fake). Reach for "adapter" when the seam is the topic; "implementation" otherwise.

### **Depth**
Leverage at the interface — the amount of behavior a caller (or test) can exercise per unit of interface they have to learn. A module is **deep** when a large amount of behavior sits behind a small interface. A module is **shallow** when the interface is nearly as complex as the implementation.

### **Seam**
A place where you can alter behavior without editing in that place. The *location* at which a module's interface lives. Choosing where to put the seam is its own design decision, distinct from what goes behind it.
*   *Avoid*: boundary (overloaded with DDD's bounded context).

### **Adapter**
A concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance (what's inside).

### **Leverage**
What callers get from depth. More capability per unit of interface they have to learn. One implementation pays back across N call sites and M tests.

### **Locality**
What maintainers get from depth. Change, bugs, knowledge, and verification concentrate at one place rather than spreading across callers. Fix once, fixed everywhere.

---

## 2. Load-Bearing Principles

*   **Depth is a property of the interface, not the implementation:** A deep module can be internally composed of small, mockable, swappable parts — they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface.
*   **The Deletion Test:** Imagine deleting the module. If complexity vanishes, the module wasn't hiding anything (it was a pass-through). If complexity reappears across N callers, the module was earning its keep.
*   **The interface is the test surface:** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape.
*   **One adapter means a hypothetical seam. Two adapters means a real one:** Don't introduce a seam unless something actually varies across it (such as production vs in-memory tests).
