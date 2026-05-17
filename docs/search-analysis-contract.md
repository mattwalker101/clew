# Search Analysis Contract

`SkillRegistry.analyzeSearch(query)` is the v0.2 deterministic semantic indexing surface. It builds an in-memory index from canonical filesystem bundle fields and returns explainable matches without embeddings, vector storage, or activation side effects.

The analysis result contains:

- `query`: the original query string.
- `terms`: normalized query terms in input order.
- `index`: enabled skill evidence derived from identity, triggers, activation tags, manifest tags, policies, capabilities, providers, parents, provenance, and instruction terms.
- `matches`: scored, explainable matches with `skillId`, `score`, `matchedTerms`, `evidence`, and `reasons`.

`SkillRegistry.search(query)` remains compatibility sugar over this analysis and still returns `SkillBundle[]`.

`clew search --explain <query>` and MCP `analyzeSearch()` expose the analysis result explicitly. Plain CLI and MCP `search()` envelopes stay `{ query, skills, warnings }`.

The executable fixture at `tests/fixtures/contracts/search-analysis-contract.json` pins the public result shape and representative evidence ordering.
