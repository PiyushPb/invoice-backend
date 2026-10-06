import { describe, it, expect } from "vitest";
import { api } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
  DEFAULT_PASSWORD,
} from "../helpers/test-data.js";
import type { LoginResponseData, RegisterResponseData } from "../helpers/types.js";

describe("Password Reset API Flow", () => {
  describe("POST /api/v1/auth/forgot-password", () => {
    it("should generate a reset token for a registered email address", async () => {
      const email = generateUniqueEmail("forgot");
      await api.post("/api/v1/auth/register", generateValidRegisterPayload({ email }));

      const res = await api.post("/api/v1/auth/forgot-password", { email });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toContain("instructions sent successfully");
      // In development environment, previewToken is provided
      expect(res.data.previewToken).toBeDefined();
    });

    it("should return a generic safe message for non-existent email to prevent user enumeration", async () => {
      const res = await api.post("/api/v1/auth/forgot-password", {
        email: "nonexistent_email_12345@example.com",
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe(
        "If an account with that email exists, password reset instructions have been sent."
      );
      // No previewToken should be returned for unregistered email
      expect(res.data.previewToken).toBeUndefined();
    });

    it("should return 400 when email format is invalid", async () => {
      const res = await api.post("/api/v1/auth/forgot-password", {
        email: "not-an-email",
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toBeDefined();
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("should successfully reset password, revoke existing sessions, and allow login with new password", async () => {
      const email = generateUniqueEmail("reset_flow");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      expect(regRes.status).toBe(201);
      const initialRefreshToken = regRes.data.data!.tokens.refreshToken;

      // 1. Request password reset
      const forgotRes = await api.post<{ previewToken?: string }>(
        "/api/v1/auth/forgot-password",
        { email }
      );
      expect(forgotRes.status).toBe(200);
      const resetToken = forgotRes.data.previewToken;
      expect(resetToken).toBeDefined();

      // 2. Perform reset password
      const newPassword = "BrandNewSecureP@ssw0rd!2026";
      const resetRes = await api.post("/api/v1/auth/reset-password", {
        token: resetToken,
        newPassword,
      });

      expect(resetRes.status).toBe(200);
      expect(resetRes.data.success).toBe(true);
      expect(resetRes.data.message).toContain("Password has been reset successfully");

      // 3. Verify old password no longer works
      const oldLoginRes = await api.post("/api/v1/auth/login", {
        email,
        password: DEFAULT_PASSWORD,
      });
      expect(oldLoginRes.status).toBe(401);

      // 4. Verify new password successfully logs in
      const newLoginRes = await api.post<LoginResponseData>("/api/v1/auth/login", {
        email,
        password: newPassword,
      });
      expect(newLoginRes.status).toBe(200);

      // 5. Verify previous sessions were revoked upon reset
      const refreshOldSession = await api.post("/api/v1/auth/refresh", {
        refreshToken: initialRefreshToken,
      });
      expect(refreshOldSession.status).toBe(401);
    });

    it("should return 400 when reset token has already been used", async () => {
      const email = generateUniqueEmail("reuse_token");
      await api.post("/api/v1/auth/register", generateValidRegisterPayload({ email }));

      const forgotRes = await api.post<{ previewToken?: string }>(
        "/api/v1/auth/forgot-password",
        { email }
      );
      const resetToken = forgotRes.data.previewToken!;

      // First use succeeds
      const firstUse = await api.post("/api/v1/auth/reset-password", {
        token: resetToken,
        newPassword: "BrandNewSecureP@ssw0rd!2026",
      });
      expect(firstUse.status).toBe(200);

      // Second use of same token fails
      const secondUse = await api.post("/api/v1/auth/reset-password", {
        token: resetToken,
        newPassword: "AnotherNewP@ssw0rd!2026",
      });
      expect(secondUse.status).toBe(400);
      expect(secondUse.data.message).toBe("Invalid or expired password reset token");
    });

    it("should return 400 when new password fails complexity requirements", async () => {
      const weakPasswords = [
        "short",
        "lowercaseonly123!",
        "UPPERCASEONLY123!",
        "NoSpecialChar123",
        "NoNumberPassword!",
      ];

      for (const newPassword of weakPasswords) {
        const res = await api.post("/api/v1/auth/reset-password", {
          token: "dummy-token-sample",
          newPassword,
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      }
    });

    it("should return 400 when reset token is invalid or non-existent", async () => {
      const res = await api.post("/api/v1/auth/reset-password", {
        token: "completely_fake_invalid_token_12345",
        newPassword: "BrandNewSecureP@ssw0rd!2026",
      });

      expect(res.status).toBe(400);
      expect(res.data.message).toBe("Invalid or expired password reset token");
    });
  });
});
