import { describe, it, expect } from "vitest";
import { api } from "../helpers/client.js";

describe("Health API (/api/v1/health)", () => {
  it("GET /api/v1/health should return 200 OK with healthy status and database status", async () => {
    const res = await api.get<{
      database: string;
    }>("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.success).toBe(true);
    expect(res.data.status).toBe("healthy");
    expect(res.data.timestamp).toBeDefined();
    expect(typeof res.data.uptime).toBe("number");
    expect(res.data.services).toBeDefined();
    expect(res.data.services?.["database"]).toBe("healthy");
  });

  it("should not expose x-powered-by header for security hardening", async () => {
    const res = await api.get("/api/v1/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
