# Search Analysis Contract

`SkillRegistry.analyzeIndex()` is the v0.2 deterministic semantic indexing contract. It builds an in-memory index from canonical filesystem bundle fields without embeddings, vector storage, runtime database dependence, or activation side effects.

The index analysis result contains:

- `index`: enabled skill evidence derived from identity, triggers, activation tags, manifest tags, policies, capabilities, providers, parents, provenance, and instruction terms.

Index rows are deterministic and local-first. They include enabled registry entries only, sorted by existing registry precedence and `skillId`.

`SkillRegistry.analyzeSearch(query)` consumes the first-class index contract and returns explainable query matches over the same evidence.

The analysis result contains:

- `query`: the original query string.
- `terms`: normalized query terms in input order.
- `index`: the `SkillRegistry.analyzeIndex()` evidence rows used for matching.
- `matches`: scored, explainable matches with `skillId`, `score`, `matchedTerms`, `evidence`, and `reasons`.

`SkillRegistry.search(query)` remains compatibility sugar over this analysis and still returns `SkillBundle[]`.

MCP `analyzeIndex()` exposes the raw semantic index result explicitly as `{ analysis, warnings }` without ranking, filtering, or result limiting.

`clew-cli search --explain <query>` and MCP `analyzeSearch()` expose the search analysis result explicitly. Plain CLI and MCP `search()` envelopes stay `{ query, skills, warnings }`.

Executable fixtures pin the public result shapes and representative evidence ordering:

- `tests/fixtures/contracts/semantic-index-contract.json`
- `tests/fixtures/contracts/search-analysis-contract.json`
