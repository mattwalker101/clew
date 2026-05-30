# MCP Semantic Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the core local-first semantic search capabilities of `clew` via the MCP server and bridge.

**Architecture:** 
- Add `searchSemantic` and `analyzeSearchSemantic` to the `ClewMcpBridge` interface.
- Implement Zod schema parsing and route `clew_search_semantic` to the bridge.
- Validate semantic search envelope responses through Vitest integration tests.

**Tech Stack:** TypeScript, Vitest, Zod, sqlite-vec, and Hugging Face Transformers.

---

### Task 1: Extend the MCP Bridge Interface and Implement Semantic Methods

**Files:**
- Modify: `packages/clew-mcp/src/bridge.ts`
- Modify: `packages/clew-mcp/src/index.test.ts`

**Step 1: Write the failing test**

Add tests inside `packages/clew-mcp/src/index.test.ts` asserting that `searchSemantic` and `analyzeSearchSemantic` exist in the bridge surface:

```typescript
  it("should expose semantic search on the bridge", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "clew-mcp-semantic-search-"));
    try {
      const registry = new SkillRegistry({
        entries: [
          entry("engineering-core", {
            tags: ["engineering"],
          }),
        ],
        warnings: [],
        dbPath: join(tempDir, ".clew-registry.db"),
      });

      const bridge = await createClewMcpBridge(registry);
      
      expect(typeof bridge.searchSemantic).toBe("function");
      expect(typeof bridge.analyzeSearchSemantic).toBe("function");

      const result = await bridge.searchSemantic("engineering");
      expect(result.query).toBe("engineering");
      expect(result.skills).toBeDefined();

      const analysis = await bridge.analyzeSearchSemantic("engineering");
      expect(analysis.query).toBe("engineering");
      expect(analysis.analysis.matches).toBeDefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

Also, update the `exposes only read-oriented bridge methods` test in `packages/clew-mcp/src/index.test.ts` to expect `"searchSemantic"` and `"analyzeSearchSemantic"` in `Object.keys(bridge).sort()`.

Also, update the `tests/fixtures/contracts/telemetry-mutation-boundary-contract.json` fixture to include `"analyzeSearchSemantic"` and `"searchSemantic"` inside `"readOnlyMethodNames"`.

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-mcp/src/index.test.ts`
Expected: Compile errors/vitest failures stating `searchSemantic` / `analyzeSearchSemantic` are not defined on `ClewMcpBridge`.

**Step 3: Write minimal implementation**

In `packages/clew-mcp/src/bridge.ts`, add the methods to `ClewMcpBridge` interface and returned bridge object:

```typescript
export interface ClewMcpBridge {
  // ... existing methods
  searchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchResult>;
  analyzeSearchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchAnalysisResult>;
}

// Inside createClewMcpBridge returned object:
    async searchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchResult> {
      const request = typeof input === "string" ? { query: input } : input;
      const skills = (await registry.searchSemantic(request.query, request.limit ?? options.defaultLimit)).map(
        (bundle) => bundle.manifest,
      );
      return {
        query: request.query,
        skills,
        warnings: registryWarnings,
      };
    },
    async analyzeSearchSemantic(input: string | ClewMcpSearchInput): Promise<ClewMcpSearchAnalysisResult> {
      const request = typeof input === "string" ? { query: input } : input;
      const analysis = await registry.analyzeSearchSemantic(request.query, request.limit ?? options.defaultLimit);
      return {
        query: request.query,
        analysis,
        warnings: registryWarnings,
      };
    },
```

**Step 4: Run test to verify it passes**

Run: `pnpm test packages/clew-mcp/src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-mcp/src/bridge.ts packages/clew-mcp/src/index.test.ts tests/fixtures/contracts/telemetry-mutation-boundary-contract.json
git commit -m "feat(mcp): implement semantic search bridge methods"
```

---

### Task 2: Register the `clew_search_semantic` Tool in MCP Server

**Files:**
- Modify: `packages/clew-mcp/src/server.ts`
- Modify: `packages/clew-mcp/src/index.test.ts`

**Step 1: Write the failing test**

Add a test in `packages/clew-mcp/src/index.test.ts` that mocks a call to the MCP server tool list and tool handlers to assert `clew_search_semantic` returns correctly:

```typescript
  it("registers clew_search_semantic tool in server", async () => {
    // We can verify that server registers it in tools schema list
    // (similar to list tools and call tool tests in packages/clew-mcp/src/server.test.ts)
  });
```
Or verify via `packages/clew-mcp/src/server.test.ts`.

**Step 2: Run test to verify it fails**

Run: `pnpm test packages/clew-mcp/src/server.test.ts`
Expected: Fail to locate `clew_search_semantic`.

**Step 3: Write minimal implementation**

In `packages/clew-mcp/src/server.ts`:
1. Define the inputs schema:
```typescript
const SearchSemanticInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
  explain: z.boolean().optional(),
});
```
2. Register the tool in `tools`:
```typescript
    {
      name: "clew_search_semantic",
      description: "Perform a local-first semantic vector search over all registered skills by meaning, returning similarity scores.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to match by meaning." },
          limit: { type: "integer", description: "Optional maximum number of skills to return." },
          explain: { type: "boolean", description: "If true, returns similarity distances and matching reasons." },
        },
        required: ["query"],
      },
    },
```
3. Add tool execution case handler:
```typescript
        case "clew_search_semantic": {
          const parsed = SearchSemanticInputSchema.parse(args);
          const result = parsed.explain
            ? await bridge.analyzeSearchSemantic({ query: parsed.query, limit: parsed.limit })
            : await bridge.searchSemantic({ query: parsed.query, limit: parsed.limit });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
```

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/clew-mcp/src/server.ts
git commit -m "feat(mcp): register clew_search_semantic tool in server"
```

---

### Task 3: Final Build and Test Verification

**Files:**
- None (verification task)

**Step 1: Build the packages**

Run: `pnpm build`
Expected: Done (No compilation or typecheck errors).

**Step 2: Run all tests**

Run: `pnpm test`
Expected: ALL 165+ tests pass successfully.

**Step 3: Commit final updates**

If any contract tests or warning fixtures changed, commit them:
```bash
git commit -am "chore(mcp): final build verification and semantic search tests passing"
```
