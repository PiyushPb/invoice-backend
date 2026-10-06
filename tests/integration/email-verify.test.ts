import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { MeResponseData, RegisterResponseData } from "../helpers/types.js";

describe("Email Verification API Flow", () => {
  describe("POST /api/v1/auth/verify-email/resend", () => {
    it("should issue a verification token for an unverified user", async () => {
      const email = generateUniqueEmail("verify_resend");
      await api.post("/api/v1/auth/register", generateValidRegisterPayload({ email }));

      const res = await api.post("/api/v1/auth/verify-email/resend", { email });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Verification email sent successfully.");
      expect(res.data.previewToken).toBeDefined();
    });

    it("should return a generic message for non-existent email to prevent enumeration", async () => {
      const res = await api.post("/api/v1/auth/verify-email/resend", {
        email: "nonexistent_verification_user@example.com",
      });

      expect(res.status).toBe(200);
      expect(res.data.message).toBe(
        "If an account with this email exists, verification instructions have been sent."
      );
      expect(res.data.previewToken).toBeUndefined();
    });

    it("should return 400 when email format is invalid", async () => {
      const res = await api.post("/api/v1/auth/verify-email/resend", {
        email: "invalid-email-format",
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    it("should successfully verify email with valid token and reflect in workspace profile", async () => {
      const email = generateUniqueEmail("verify_flow");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      // 1. Request verification token
      const resendRes = await api.post<{ previewToken?: string }>(
        "/api/v1/auth/verify-email/resend",
        { email }
      );
      const verificationToken = resendRes.data.previewToken!;
      expect(verificationToken).toBeDefined();

      // 2. Submit verification token
      const verifyRes = await api.post("/api/v1/auth/verify-email", {
        token: verificationToken,
      });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.data.success).toBe(true);
      expect(verifyRes.data.message).toBe("Email address verified successfully");

      // 3. Confirm emailVerifiedAt is now populated in /me
      const meRes = await api.get<MeResponseData>("/api/v1/me", authHeader(accessToken));
      expect(meRes.status).toBe(200);
      expect(meRes.data.data!.user.emailVerifiedAt).toBeDefined();

      // 4. Requesting resend for an already verified email should state it is verified
      const secondResend = await api.post("/api/v1/auth/verify-email/resend", { email });
      expect(secondResend.status).toBe(200);
      expect(secondResend.data.message).toBe("Email is already verified.");
    });

    it("should return 400 when verification token is invalid or expired", async () => {
      const res = await api.post("/api/v1/auth/verify-email", {
        token: "completely_fake_invalid_token_98765",
      });

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Invalid or expired email verification token");
    });
  });
});
