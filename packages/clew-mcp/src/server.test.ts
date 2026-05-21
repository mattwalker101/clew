import { describe, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SkillRegistry } from "@clew/core";
import { runClewMcpServer } from "./server.js";

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

describe("runClewMcpServer", () => {
  it("initializes a server and registers tool handlers", async () => {
    // Mock the async fromProject
    const fromProjectSpy = vi.spyOn(SkillRegistry, "fromProject").mockResolvedValue(new SkillRegistry({ entries: [], warnings: [] }));
    
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

    fromProjectSpy.mockRestore();
  });
});
