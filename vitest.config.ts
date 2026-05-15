import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@clew/core": new URL("./packages/clew-core/src/index.ts", import.meta.url).pathname,
      "@clew/schema": new URL("./packages/clew-schema/src/index.ts", import.meta.url).pathname,
      "@clew/importers": new URL("./packages/clew-importers/src/index.ts", import.meta.url).pathname,
      "@clew/exporters": new URL("./packages/clew-exporters/src/index.ts", import.meta.url).pathname,
      "@clew/mcp": new URL("./packages/clew-mcp/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
  },
});
