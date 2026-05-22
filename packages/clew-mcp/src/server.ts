import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClewMcpBridge, type ClewMcpBridge } from "./index.js";
import { SkillRegistry } from "@clew-ops/core";
import { coreCapabilities, type Capability } from "@clew-ops/schema";

const SearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

const RecommendInputSchema = z.object({
  query: z.string(),
  context: z
    .object({
      tags: z.array(z.string()).optional(),
      agentsMd: z.string().optional(),
      repoSignals: z.array(z.string()).optional(),
      capabilities: z.array(z.enum(coreCapabilities as any)).optional() as z.ZodType<Capability[] | undefined>,
      activeSkillIds: z.array(z.string()).optional(),
    })
    .optional(),
  limit: z.number().optional(),
});

const ExplainInputSchema = z.object({
  skillId: z.string(),
  query: z.string(),
  context: z
    .object({
      tags: z.array(z.string()).optional(),
      agentsMd: z.string().optional(),
      repoSignals: z.array(z.string()).optional(),
      capabilities: z.array(z.enum(coreCapabilities as any)).optional() as z.ZodType<Capability[] | undefined>,
      activeSkillIds: z.array(z.string()).optional(),
    })
    .optional(),
});

const LookupInputSchema = z.object({
  skillId: z.string(),
});

const TelemetryInputSchema = z.object({
  records: z
    .array(
      z.object({
        skillId: z.string(),
        usageCount: z.number(),
        lastUsed: z.string().optional(),
        disabled: z.boolean(),
        favorite: z.boolean(),
      })
    )
    .optional(),
});

export async function runClewMcpServer(projectRoot = process.cwd()) {
  const registry = await SkillRegistry.fromProject(projectRoot);
  const bridge = await createClewMcpBridge(registry);

  const server = new Server(
    {
      name: "clew",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools: Tool[] = [
    {
      name: "clew_search",
      description: "Search for skills in the clew registry using keyword matching.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query terms" },
          limit: { type: "number", description: "Optional limit for results" },
        },
        required: ["query"],
      },
    },
    {
      name: "clew_recommend",
      description: "Get explainable skill recommendations for a specific query or task.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The task or query to get recommendations for" },
          limit: { type: "number", description: "Optional limit for results" },
          context: {
            type: "object",
            description: "Optional activation context signals",
            properties: {
              tags: { type: "array", items: { type: "string" } },
              repoSignals: { type: "array", items: { type: "string" } },
              capabilities: { type: "array", items: { type: "string" } },
              activeSkillIds: { type: "array", items: { type: "string" } },
            },
          },
        },
        required: ["query"],
      },
    },
    {
      name: "clew_explain",
      description: "Explain why a specific skill is recommended for a query.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string", description: "The ID of the skill to explain" },
          query: { type: "string", description: "The query to explain against" },
        },
        required: ["skillId", "query"],
      },
    },
    {
      name: "clew_lookup",
      description: "Retrieve a full skill bundle by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string", description: "The ID of the skill to look up" },
        },
        required: ["skillId"],
      },
    },
    {
      name: "clew_analyze_index",
      description: "Get a comprehensive analysis of all skills currently in the registry index.",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "clew_search": {
          const parsed = SearchInputSchema.parse(args);
          return { content: [{ type: "text", text: JSON.stringify(bridge.search(parsed), null, 2) }] };
        }
        case "clew_recommend": {
          const parsed = RecommendInputSchema.parse(args);
          return { content: [{ type: "text", text: JSON.stringify(await bridge.recommend(parsed), null, 2) }] };
        }
        case "clew_explain": {
          const parsed = ExplainInputSchema.parse(args);
          return { content: [{ type: "text", text: JSON.stringify(await bridge.explain(parsed), null, 2) }] };
        }
        case "clew_lookup": {
          const parsed = LookupInputSchema.parse(args);
          return { content: [{ type: "text", text: JSON.stringify(bridge.lookup(parsed), null, 2) }] };
        }
        case "clew_analyze_index": {
          return { content: [{ type: "text", text: JSON.stringify(bridge.analyzeIndex(), null, 2) }] };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("clew MCP server running on stdio");
}
