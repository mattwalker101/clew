import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startDashboardServer } from "./server.js";

describe("clew Dashboard API Server", () => {
  let server: http.Server;

  beforeAll(async () => {
    server = await startDashboardServer(7709);
  });

  afterAll(() => {
    server.close();
  });

  it("exposes the live composed registry at GET /api/registry", async () => {
    const res = await fetch("http://localhost:7709/api/registry");
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("entries");
    expect(body).toHaveProperty("warnings");
  });

  it("runs the live activation explanation engine at POST /api/explain", async () => {
    const res = await fetch("http://localhost:7709/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "typescript" }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("candidates");
    expect(body).toHaveProperty("recommendations");
  });
});
