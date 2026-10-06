import { describe, it, expect } from "vitest";
import { api } from "../helpers/client.js";

describe("Global Middlewares & Router Edge Cases", () => {
  describe("404 Not Found Handler", () => {
    it("GET on an undefined route should return 404 with structured error response", async () => {
      const res = await api.get("/api/v1/non-existent-endpoint");

      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain("Resource not found: GET /api/v1/non-existent-endpoint");
    });

    it("POST on an undefined auth route should return 404", async () => {
      const res = await api.post("/api/v1/auth/non-existent-action", {});

      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain("Resource not found: POST /api/v1/auth/non-existent-action");
    });
  });

  describe("CORS & Security Headers", () => {
    it("should allow CORS requests with access-control-allow-origin header", async () => {
      const res = await api.raw({
        method: "OPTIONS",
        url: "/api/v1/health",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(res.headers["access-control-allow-origin"]).toBeDefined();
    });

    it("should never expose x-powered-by header in any response", async () => {
      const endpoints = [
        () => api.get("/api/v1/health"),
        () => api.get("/api/v1/non-existent-route"),
      ];

      for (const req of endpoints) {
        const res = await req();
        expect(res.headers["x-powered-by"]).toBeUndefined();
      }
    });
  });

  describe("Malformed JSON Payload Handling", () => {
    it("should gracefully handle malformed JSON syntax in request body", async () => {
      const res = await api.raw({
        method: "POST",
        url: "/api/v1/auth/login",
        data: '{"invalidJson": unquoted}',
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });
});
