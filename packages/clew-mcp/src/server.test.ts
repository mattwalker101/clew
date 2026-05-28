import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SkillRegistry } from "@clew-ops/core";
import { runClewMcpServer } from "./server.js";
import { createClewMcpBridge } from "./bridge.js";

// Define the mock outside the factory function to avoid [vitest] warning
const mockServerInstance = {
  setRequestHandler: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
  return {
    Server: vi.fn().mockImplementation(function() {
      return mockServerInstance;
    }),
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: vi.fn(),
  };
});

vi.mock("./bridge.js", () => {
  return {
    createClewMcpBridge: vi.fn(),
  };
});

describe("runClewMcpServer", () => {
  let mockBridge: any;
  let fromProjectSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockBridge = {
      search: vi.fn(),
      searchSemantic: vi.fn(),
      analyzeSearchSemantic: vi.fn(),
      recommend: vi.fn(),
      explain: vi.fn(),
      lookup: vi.fn(),
      analyzeIndex: vi.fn(),
      close: vi.fn(),
    };
    
    vi.mocked(createClewMcpBridge).mockResolvedValue(mockBridge);
    fromProjectSpy = vi.spyOn(SkillRegistry, "fromProject").mockResolvedValue(new SkillRegistry({ entries: [], warnings: [] }));
  });

  afterEach(() => {
    fromProjectSpy.mockRestore();
  });

  it("initializes a server and registers tool handlers", async () => {
    await runClewMcpServer();

    expect(Server).toHaveBeenCalledWith(
      expect.objectContaining({ name: "clew" }),
      expect.objectContaining({ capabilities: { tools: {} } })
    );

    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
      ListToolsRequestSchema,
      expect.any(Function)
    );
    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
      CallToolRequestSchema,
      expect.any(Function)
    );
    expect(mockServerInstance.connect).toHaveBeenCalled();
  });

  it("registers clew_search_semantic in the tools list", async () => {
    await runClewMcpServer();

    const listToolsHandler = mockServerInstance.setRequestHandler.mock.calls.find(
      (call) => call[0] === ListToolsRequestSchema
    )?.[1];

    expect(listToolsHandler).toBeDefined();
    const result = await listToolsHandler();
    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "clew_search_semantic",
          description: expect.stringContaining("semantic vector search"),
          inputSchema: expect.objectContaining({
            required: ["query"],
            properties: expect.objectContaining({
              query: expect.any(Object),
              limit: expect.any(Object),
              explain: expect.any(Object),
            }),
          }),
        }),
      ])
    );
  });

  it("routes clew_search_semantic tool calls correctly", async () => {
    await runClewMcpServer();

    const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    expect(callToolHandler).toBeDefined();

    // 1. Without explain
    mockBridge.searchSemantic.mockResolvedValue({
      query: "engineering",
      skills: [{ id: "engineering-core" }],
      warnings: [],
    });

    const res1 = await callToolHandler({
      params: {
        name: "clew_search_semantic",
        arguments: { query: "engineering", limit: 5 },
      },
    });

    expect(mockBridge.searchSemantic).toHaveBeenCalledWith({
      query: "engineering",
      limit: 5,
    });
    expect(JSON.parse(res1.content[0].text)).toMatchObject({
      query: "engineering",
      skills: [{ id: "engineering-core" }],
    });

    // 2. With explain
    mockBridge.analyzeSearchSemantic.mockResolvedValue({
      query: "engineering",
      analysis: { matches: [{ skillId: "engineering-core", score: 0.9 }] },
      warnings: [],
    });

    const res2 = await callToolHandler({
      params: {
        name: "clew_search_semantic",
        arguments: { query: "engineering", limit: 5, explain: true },
      },
    });

    expect(mockBridge.analyzeSearchSemantic).toHaveBeenCalledWith({
      query: "engineering",
      limit: 5,
    });
    expect(JSON.parse(res2.content[0].text)).toMatchObject({
      query: "engineering",
      analysis: { matches: [{ skillId: "engineering-core", score: 0.9 }] },
    });
  });
});
