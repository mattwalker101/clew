import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@clew-ops/core": new URL("./packages/clew-core/src/index.ts", import.meta.url).pathname,
      "@clew-ops/schema": new URL("./packages/clew-schema/src/index.ts", import.meta.url).pathname,
      "@clew-ops/importers": new URL("./packages/clew-importers/src/index.ts", import.meta.url).pathname,
      "@clew-ops/exporters": new URL("./packages/clew-exporters/src/index.ts", import.meta.url).pathname,
      "@clew-ops/mcp": new URL("./packages/clew-mcp/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
  },
});
