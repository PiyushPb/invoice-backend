import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
  DEFAULT_PASSWORD,
} from "../helpers/test-data.js";
import type {
  LoginResponseData,
  RefreshResponseData,
  RegisterResponseData,
  SessionsListData,
} from "../helpers/types.js";

describe("Token Management & Refresh API (/api/v1/auth/refresh)", () => {
  describe("Token Refresh & Rotation", () => {
    it("should rotate refresh token and issue new access & refresh token pair", async () => {
      const email = generateUniqueEmail("refresh");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      expect(regRes.status).toBe(201);
      const originalRefreshToken = regRes.data.data!.tokens.refreshToken;

      const refreshRes = await api.post<RefreshResponseData>(
        "/api/v1/auth/refresh",
        { refreshToken: originalRefreshToken }
      );

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.data.success).toBe(true);
      expect(refreshRes.data.message).toBe("Token refreshed successfully");

      const newTokens = refreshRes.data.data!.tokens;
      expect(newTokens.accessToken).toBeTypeOf("string");
      expect(newTokens.refreshToken).toBeTypeOf("string");
      expect(newTokens.refreshToken).not.toBe(originalRefreshToken);

      // Verify the new access token is valid on protected routes
      const meRes = await api.get("/api/v1/me", authHeader(newTokens.accessToken));
      expect(meRes.status).toBe(200);
    });

    it("should detect token replay and revoke all sessions if a rotated token is reused", async () => {
      const email = generateUniqueEmail("replay");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const originalRefreshToken = regRes.data.data!.tokens.refreshToken;

      // First refresh: succeeds and rotates originalRefreshToken
      const firstRefresh = await api.post<RefreshResponseData>(
        "/api/v1/auth/refresh",
        { refreshToken: originalRefreshToken }
      );
      expect(firstRefresh.status).toBe(200);
      const secondTokens = firstRefresh.data.data!.tokens;

      // Second refresh with OLD (already used) token -> Replay attack simulation!
      const replayRes = await api.post("/api/v1/auth/refresh", {
        refreshToken: originalRefreshToken,
      });

      expect(replayRes.status).toBe(401);
      expect(replayRes.data.success).toBe(false);
      expect(replayRes.data.message).toBe(
        "Session is invalid or already rotated. Please log in again."
      );

      // Verify that all active sessions were revoked as a security measure
      // Even secondTokens should now have its session invalidated
      const thirdRefresh = await api.post("/api/v1/auth/refresh", {
        refreshToken: secondTokens.refreshToken,
      });
      expect(thirdRefresh.status).toBe(401);
    });
  });

  describe("Validation & Error Scenarios", () => {
    it("should return 400 when refreshToken is missing in payload", async () => {
      const res = await api.post("/api/v1/auth/refresh", {});

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "refreshToken",
          }),
        ])
      );
    });

    it("should return 401 when refreshToken is malformed or invalid", async () => {
      const res = await api.post("/api/v1/auth/refresh", {
        refreshToken: "not.a.valid.jwt.token",
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Invalid or expired refresh token");
    });
  });

  describe("Authorization Guard Middleware", () => {
    it("should return 401 when Authorization header is missing on protected routes", async () => {
      const endpoints = [
        () => api.get("/api/v1/me"),
        () => api.get("/api/v1/auth/sessions"),
        () => api.post("/api/v1/auth/logout-all"),
      ];

      for (const endpoint of endpoints) {
        const res = await endpoint();
        expect(res.status).toBe(401);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain("Authentication token is missing");
      }
    });

    it("should return 401 when Authorization header format is not Bearer", async () => {
      const res = await api.get("/api/v1/me", {
        Authorization: "Basic some_credentials",
      });

      expect(res.status).toBe(401);
      expect(res.data.message).toContain("missing or malformed");
    });

    it("should return 401 when Authorization token is invalid or corrupted", async () => {
      const res = await api.get("/api/v1/me", {
        Authorization: "Bearer invalid.token.payload",
      });

      expect(res.status).toBe(401);
      expect(res.data.message).toBe("Invalid or expired authentication token");
    });
  });
});
