import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
  DEFAULT_PASSWORD,
} from "../helpers/test-data.js";
import type {
  LoginResponseData,
  RegisterResponseData,
  SessionsListData,
} from "../helpers/types.js";

describe("Session & Logout APIs", () => {
  describe("GET /api/v1/auth/sessions", () => {
    it("should retrieve active sessions for the authenticated user", async () => {
      const email = generateUniqueEmail("sess_list");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.get<SessionsListData>(
        "/api/v1/auth/sessions",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Active sessions retrieved successfully");

      const data = res.data.data!;
      expect(data.totalActive).toBeGreaterThanOrEqual(1);
      expect(data.maxAllowed).toBe(5);
      expect(Array.isArray(data.sessions)).toBe(true);

      const first = data.sessions[0];
      expect(first).toBeDefined();
      expect(first!.id).toBeDefined();
      expect(first!.lastUsedAt).toBeDefined();
      expect(first!.expiresAt).toBeDefined();
    });
  });

  describe("DELETE /api/v1/auth/sessions/:sessionId", () => {
    it("should revoke a specific session belonging to the user", async () => {
      const email = generateUniqueEmail("sess_revoke");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const firstAccessToken = regRes.data.data!.tokens.accessToken;

      // Create a second session
      const loginRes = await api.post<LoginResponseData>("/api/v1/auth/login", {
        email,
        password: DEFAULT_PASSWORD,
      });
      const secondSessionId = loginRes.data.data!.session.id;

      // Revoke the second session using the first session's access token
      const revokeRes = await api.delete(
        `/api/v1/auth/sessions/${secondSessionId}`,
        authHeader(firstAccessToken)
      );

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.data.success).toBe(true);
      expect(revokeRes.data.message).toBe("Session revoked successfully");

      // Verify the revoked session is no longer active
      const listRes = await api.get<SessionsListData>(
        "/api/v1/auth/sessions",
        authHeader(firstAccessToken)
      );
      const activeIds = listRes.data.data!.sessions.map((s) => s.id);
      expect(activeIds).not.toContain(secondSessionId);
    });

    it("should support the singular alias /api/v1/auth/session/:sessionId", async () => {
      const email = generateUniqueEmail("sess_alias");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const sessionId = regRes.data.data!.session.id;

      const res = await api.delete(
        `/api/v1/auth/session/${sessionId}`,
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it("should return 400 when sessionId is not a valid UUID", async () => {
      const email = generateUniqueEmail("invalid_uuid");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.delete(
        "/api/v1/auth/sessions/not-a-valid-uuid-12345",
        authHeader(accessToken)
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain("Must be a valid UUID");
    });

    it("should return 404 when sessionId does not exist or was already revoked", async () => {
      const email = generateUniqueEmail("notfound_uuid");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const nonExistentUuid = "a0000000-0000-4000-8000-000000000000";

      const res = await api.delete(
        `/api/v1/auth/sessions/${nonExistentUuid}`,
        authHeader(accessToken)
      );

      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain("Session not found or already revoked");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke session when refreshToken is provided in request body", async () => {
      const email = generateUniqueEmail("logout_refresh");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const refreshToken = regRes.data.data!.tokens.refreshToken;

      const logoutRes = await api.post("/api/v1/auth/logout", {
        refreshToken,
      });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.data.success).toBe(true);
      expect(logoutRes.data.message).toBe("Logged out successfully");

      // Attempting to refresh with the logged out token should fail
      const refreshRes = await api.post("/api/v1/auth/refresh", {
        refreshToken,
      });
      expect(refreshRes.status).toBe(401);
    });

    it("should revoke session when Bearer token is provided in headers without body", async () => {
      const email = generateUniqueEmail("logout_bearer");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const refreshToken = regRes.data.data!.tokens.refreshToken;

      const logoutRes = await api.post(
        "/api/v1/auth/logout",
        {},
        authHeader(accessToken)
      );

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.data.success).toBe(true);

      // Verify the session associated with that user was revoked
      const refreshRes = await api.post("/api/v1/auth/refresh", {
        refreshToken,
      });
      expect(refreshRes.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/logout-all", () => {
    it("should revoke all active sessions for the user across all devices", async () => {
      const email = generateUniqueEmail("logout_all");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const firstRefreshToken = regRes.data.data!.tokens.refreshToken;

      // Create two more sessions
      const login1 = await api.post<LoginResponseData>("/api/v1/auth/login", {
        email,
        password: DEFAULT_PASSWORD,
      });
      const secondRefreshToken = login1.data.data!.tokens.refreshToken;

      const login2 = await api.post<LoginResponseData>("/api/v1/auth/login", {
        email,
        password: DEFAULT_PASSWORD,
      });
      const thirdAccessToken = login2.data.data!.tokens.accessToken;
      const thirdRefreshToken = login2.data.data!.tokens.refreshToken;

      // Call logout-all
      const logoutAllRes = await api.post<{ revokedSessionsCount: number }>(
        "/api/v1/auth/logout-all",
        {},
        authHeader(thirdAccessToken)
      );

      expect(logoutAllRes.status).toBe(200);
      expect(logoutAllRes.data.success).toBe(true);
      expect(logoutAllRes.data.message).toBe(
        "Logged out from all devices successfully"
      );
      expect(logoutAllRes.data.data?.revokedSessionsCount).toBeGreaterThanOrEqual(3);

      // Verify none of the refresh tokens can be used anymore
      for (const token of [firstRefreshToken, secondRefreshToken, thirdRefreshToken]) {
        const refreshRes = await api.post("/api/v1/auth/refresh", {
          refreshToken: token,
        });
        expect(refreshRes.status).toBe(401);
      }
    });
  });
});
