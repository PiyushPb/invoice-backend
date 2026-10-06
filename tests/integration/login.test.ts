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

describe("Login API (/api/v1/auth/login)", () => {
  describe("Success Scenarios", () => {
    it("should successfully authenticate with valid credentials and return tokens, user, business, and session", async () => {
      const email = generateUniqueEmail("login");
      const registerPayload = generateValidRegisterPayload({ email });

      // Create test user
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        registerPayload
      );
      expect(regRes.status).toBe(201);

      // Perform login
      const loginRes = await api.post<LoginResponseData>("/api/v1/auth/login", {
        email: email.toUpperCase(), // Test case insensitivity
        password: DEFAULT_PASSWORD,
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.data.success).toBe(true);
      expect(loginRes.data.message).toBe("Login successful");

      const data = loginRes.data.data!;
      expect(data).toBeDefined();

      // User verification
      expect(data.user.id).toBe(regRes.data.data!.user.id);
      expect(data.user.email).toBe(email.toLowerCase());
      expect(data.user.lastLoginAt).toBeDefined();

      // Business verification
      expect(data.business).toBeDefined();
      expect(data.business?.id).toBe(regRes.data.data!.business.id);
      expect(data.businesses.length).toBeGreaterThanOrEqual(1);

      // Tokens verification
      expect(data.tokens.accessToken).toBeTypeOf("string");
      expect(data.tokens.refreshToken).toBeTypeOf("string");

      // Session verification
      expect(data.session.id).toBeDefined();
      expect(data.session.expiresAt).toBeDefined();
    });

    it("should record device info from request headers into the session", async () => {
      const email = generateUniqueEmail("device");
      const regRes = await api.post("/api/v1/auth/register", generateValidRegisterPayload({ email }));
      expect(regRes.status).toBe(201);

      const customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
      const loginRes = await api.post<LoginResponseData>(
        "/api/v1/auth/login",
        { email, password: DEFAULT_PASSWORD },
        { "user-agent": customUserAgent }
      );

      expect(loginRes.status).toBe(200);
      expect(loginRes.data.data!.session.deviceName).toBeDefined();
    });
  });

  describe("Validation Failure Scenarios (400 Bad Request)", () => {
    it("should return 400 when email is missing", async () => {
      const res = await api.post("/api/v1/auth/login", {
        password: DEFAULT_PASSWORD,
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "email",
          }),
        ])
      );
    });

    it("should return 400 when password is missing or empty", async () => {
      const res = await api.post("/api/v1/auth/login", {
        email: "user@example.com",
        password: "",
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
          }),
        ])
      );
    });

    it("should return 400 when email format is invalid", async () => {
      const res = await api.post("/api/v1/auth/login", {
        email: "notanemail",
        password: DEFAULT_PASSWORD,
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "email",
          }),
        ])
      );
    });
  });

  describe("Authentication Failure Scenarios (401 Unauthorized)", () => {
    it("should return 401 with generic error when user does not exist", async () => {
      const res = await api.post("/api/v1/auth/login", {
        email: "nonexistent_user_9999@example.com",
        password: DEFAULT_PASSWORD,
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Invalid email or password");
    });

    it("should return 401 with generic error when password is wrong", async () => {
      const email = generateUniqueEmail("wrongpwd");
      await api.post("/api/v1/auth/register", generateValidRegisterPayload({ email }));

      const res = await api.post("/api/v1/auth/login", {
        email,
        password: "IncorrectPassword!123",
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Invalid email or password");
    });
  });

  describe("Session Management & LRU Eviction (Max 5 Active Sessions)", () => {
    it("should enforce max 5 active sessions by evicting the oldest session when 6th session is created", async () => {
      const email = generateUniqueEmail("lru");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      expect(regRes.status).toBe(201);
      const firstSessionId = regRes.data.data!.session.id;

      // Log in 5 more times (making 6 total sessions for this user)
      let lastAccessToken = "";
      for (let i = 1; i <= 5; i++) {
        // Small delay to ensure timestamp progression
        await new Promise((r) => setTimeout(r, 50));
        const res = await api.post<LoginResponseData>("/api/v1/auth/login", {
          email,
          password: DEFAULT_PASSWORD,
        });
        expect(res.status).toBe(200);
        lastAccessToken = res.data.data!.tokens.accessToken;
      }

      // Query active sessions
      const sessionsRes = await api.get<SessionsListData>(
        "/api/v1/auth/sessions",
        authHeader(lastAccessToken)
      );

      expect(sessionsRes.status).toBe(200);
      expect(sessionsRes.data.data!.totalActive).toBeLessThanOrEqual(5);

      const activeIds = sessionsRes.data.data!.sessions.map((s) => s.id);
      // The first registered session should have been evicted
      expect(activeIds).not.toContain(firstSessionId);
    });
  });
});
