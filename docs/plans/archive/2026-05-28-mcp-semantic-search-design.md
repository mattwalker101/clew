# Design Specification: Exposing Semantic Search via MCP

**Goal**: Expose the core local-first semantic search capabilities of `clew` via the MCP server and bridge, enabling external AI agents (such as Claude Code) to perform meaning-based skill discovery.

**Architecture**: 
- Extend the `ClewMcpBridge` interface with `searchSemantic` and `analyzeSearchSemantic` methods.
- Register `clew_search_semantic` as a public tool in `@clew-ops/mcp`'s server.
- Ensure proper schema validation with Zod and clean JSON envelope responses.

---

## 1. Interface & Bridge Extension

We will update the `ClewMcpBridge` interface in `packages/clew-mcp/src/bridge.ts`:

```typescript
export interface ClewMcpBridge {
  // Existing methods ...
  searchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchResult>;
  analyzeSearchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchAnalysisResult>;
}
```

### Response Envelopes

```typescript
export interface ClewMcpSearchResult {
  query: string;
  skills: any[];
  warnings: CompatibilityWarning[];
}

export interface ClewMcpSearchAnalysisResult {
  query: string;
  analysis: {
    query: string;
    matches: Array<{
      skillId: string;
      distance: number;
      score: number;
      reasons: string[];
    }>;
  };
  warnings: CompatibilityWarning[];
}
```

---

## 2. MCP Tool Definition

A new tool `clew_search_semantic` will be added to the server's list of tools:

```json
{
  "name": "clew_search_semantic",
  "description": "Perform a local-first semantic vector search over all registered skills by meaning, returning similarity scores.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query to match by meaning."
      },
      "limit": {
        "type": "integer",
        "description": "Optional maximum number of skills to return."
      },
      "explain": {
        "type": "boolean",
        "description": "If true, returns similarity distances and matching reasons."
      }
    },
    "required": ["query"]
  }
}
```

---

## 3. Data Flow & Execution

When `clew_search_semantic` is called:
1. The server parses the arguments using `SearchSemanticInputSchema`.
2. It delegates to the bridge:
   - If `explain` is true, calls `bridge.analyzeSearchSemantic(args)`.
   - If `explain` is false, calls `bridge.searchSemantic(args)`.
3. The bridge embeds the query using `EmbeddingEngine` (via the core `SkillRegistry` semantic search methods) and executes vector matching on the SQLite `vec_skills` table.
4. Returns the structured JSON-formatted result string inside a single MCP text content block.

---

## 4. Test Strategy

We will write integration tests in `packages/clew-mcp/src/index.test.ts` to assert that:
- The `ClewMcpBridge` exposes the new methods.
- The `clew_search_semantic` tool is registered in the list of available tools.
- A query to the semantic search tool successfully loads embeddings, queries the SQLite database, and returns the expected similarity matches and metadata.
