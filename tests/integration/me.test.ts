import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
  DEFAULT_PASSWORD,
} from "../helpers/test-data.js";
import type {
  DeleteAccountData,
  MeResponseData,
  PreferencesData,
  RegisterResponseData,
  UpdatedProfileData,
} from "../helpers/types.js";

describe("Me / Current User & Workspace API (/api/v1/me)", () => {
  describe("GET /api/v1/me - Get Current User & Workspace Context", () => {
    it("should return comprehensive workspace, subscription, and entitlements profile", async () => {
      const email = generateUniqueEmail("me_profile");
      const regPayload = generateValidRegisterPayload({
        email,
        firstName: "Jane",
        lastName: "Doe",
        business: {
          name: "Acme Enterprises Private Limited",
          businessType: "PRIVATE_LIMITED",
          countryCode: "IN",
          currencyCode: "INR",
        },
      });

      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        regPayload
      );
      expect(regRes.status).toBe(201);
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.get<MeResponseData>(
        "/api/v1/me",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Workspace profile retrieved successfully");

      const data = res.data.data!;
      expect(data).toBeDefined();

      // 1. User & Preferences profile
      expect(data.user.id).toBe(regRes.data.data!.user.id);
      expect(data.user.email).toBe(email.toLowerCase());
      expect(data.user.firstName).toBe("Jane");
      expect(data.user.lastName).toBe("Doe");
      expect(data.user.preferences).toBeDefined();
      expect(data.user.preferences?.["language"]).toBe("en-IN");
      expect(data.user.preferences?.["timezone"]).toBe("Asia/Kolkata");

      // 2. Business profile
      expect(data.business).toBeDefined();
      expect(data.business?.id).toBe(regRes.data.data!.business.id);
      expect(data.business?.name).toBe("Acme Enterprises Private Limited");
      expect(data.business?.businessType).toBe("PRIVATE_LIMITED");
      expect(data.business?.countryCode).toBe("IN");
      expect(data.business?.currencyCode).toBe("INR");

      // 3. Settings & Tax Profile
      expect(data.business?.settings).toBeDefined();
      expect(data.business?.settings?.["invoicePrefix"]).toBe("INV");
      expect(data.business?.settings?.["invoiceStartNumber"]).toBe("1");
      expect(data.business?.taxProfile).toBeDefined();
      expect(data.business?.taxProfile?.["taxCountry"]).toBe("IN");

      // 4. Role
      expect(data.role).toBe("OWNER");

      // 5. Subscription
      expect(data.subscription).toBeDefined();
      expect(data.subscription?.planCode).toBe("FREE");
      expect(data.subscription?.isFree).toBe(true);
      expect(data.subscription?.status).toBe("ACTIVE");

      // 6. Entitlements & Usage counters
      expect(Array.isArray(data.entitlements)).toBe(true);
      expect(Array.isArray(data.usage)).toBe(true);
      expect(data.usage.length).toBeGreaterThanOrEqual(3);
      const metrics = data.usage.map((u) => u.metric);
      expect(metrics).toContain("INVOICES_LIFETIME");
      expect(metrics).toContain("CUSTOMERS_ACTIVE");
      expect(metrics).toContain("PRODUCTS_ACTIVE");
    });

    it("should respect the x-business-id header for multi-workspace switching", async () => {
      const email = generateUniqueEmail("workspace_switch");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      const res = await api.get<MeResponseData>("/api/v1/me", {
        ...authHeader(accessToken),
        "x-business-id": businessId,
      });

      expect(res.status).toBe(200);
      expect(res.data.data!.business?.id).toBe(businessId);
    });

    it("should return 401 Unauthorized when Bearer token is missing", async () => {
      const res = await api.get("/api/v1/me");
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });
  });

  describe("PATCH /api/v1/me - Update Personal Profile", () => {
    it("should update firstName, lastName, and phone successfully", async () => {
      const email = generateUniqueEmail("update_profile");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({
          email,
          firstName: "OriginalFirst",
          lastName: "OriginalLast",
        })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const updatePayload = {
        firstName: "UpdatedFirst",
        lastName: "UpdatedLast",
        phone: "+919876543210",
      };

      const res = await api.patch<UpdatedProfileData>(
        "/api/v1/me",
        updatePayload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Profile updated successfully");
      expect(res.data.data!.firstName).toBe("UpdatedFirst");
      expect(res.data.data!.lastName).toBe("UpdatedLast");
      expect(res.data.data!.phone).toBe("+919876543210");

      // Verify that GET /api/v1/me reflects the updated name
      const meRes = await api.get<MeResponseData>(
        "/api/v1/me",
        authHeader(accessToken)
      );
      expect(meRes.status).toBe(200);
      expect(meRes.data.data!.user.firstName).toBe("UpdatedFirst");
      expect(meRes.data.data!.user.lastName).toBe("UpdatedLast");
      expect(meRes.data.data!.user.phone).toBe("+919876543210");
    });

    it("should allow partial profile update (firstName only)", async () => {
      const email = generateUniqueEmail("update_partial");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({
          email,
          firstName: "FirstOnly",
          lastName: "KeptLast",
        })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch<UpdatedProfileData>(
        "/api/v1/me",
        { firstName: "NewFirstName" },
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.data!.firstName).toBe("NewFirstName");
      expect(res.data.data!.lastName).toBe("KeptLast");
    });

    it("should reject update when no fields are provided (empty body)", async () => {
      const email = generateUniqueEmail("empty_patch");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch("/api/v1/me", {}, authHeader(accessToken));
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should reject attempts to update protected fields like email or password", async () => {
      const email = generateUniqueEmail("protected_patch");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/me",
        { firstName: "Hacker", email: "hacked@example.com" },
        authHeader(accessToken)
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  describe("GET /api/v1/me/preferences - Retrieve Preferences", () => {
    it("should return the user preferences with standard defaults", async () => {
      const email = generateUniqueEmail("get_prefs");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.get<PreferencesData>(
        "/api/v1/me/preferences",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Preferences retrieved successfully");
      expect(res.data.data!.language).toBe("en-IN");
      expect(res.data.data!.timezone).toBe("Asia/Kolkata");
      expect(res.data.data!.dateFormat).toBe("DD/MM/YYYY");
      expect(res.data.data!.numberFormat).toBe("en-IN");
      expect(res.data.data!.emailNotifications).toBe(true);
      expect(res.data.data!.paymentNotifications).toBe(true);
      expect(res.data.data!.marketingEmails).toBe(false);
    });

    it("should return 401 when unauthenticated", async () => {
      const res = await api.get("/api/v1/me/preferences");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/v1/me/preferences - Update Preferences", () => {
    it("should update user preferences successfully", async () => {
      const email = generateUniqueEmail("patch_prefs");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch<PreferencesData>(
        "/api/v1/me/preferences",
        {
          timezone: "America/New_York",
          dateFormat: "YYYY-MM-DD",
          emailNotifications: false,
          marketingEmails: true,
        },
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Preferences updated successfully");
      expect(res.data.data!.timezone).toBe("America/New_York");
      expect(res.data.data!.dateFormat).toBe("YYYY-MM-DD");
      expect(res.data.data!.emailNotifications).toBe(false);
      expect(res.data.data!.marketingEmails).toBe(true);
      // Unmodified fields should retain previous values
      expect(res.data.data!.language).toBe("en-IN");
    });

    it("should reject empty preferences update", async () => {
      const email = generateUniqueEmail("empty_prefs");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/me/preferences",
        {},
        authHeader(accessToken)
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });
  });

  describe("DELETE /api/v1/me - Controlled Account Deactivation / Soft Delete", () => {
    it("should reject deletion when password is missing or empty", async () => {
      const email = generateUniqueEmail("del_nopass");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.delete(
        "/api/v1/me",
        { password: "" },
        authHeader(accessToken)
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should reject deletion when password is incorrect", async () => {
      const email = generateUniqueEmail("del_badpass");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.delete(
        "/api/v1/me",
        { password: "WrongPassword999!" },
        authHeader(accessToken)
      );
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should successfully soft-delete account, archive business, revoke sessions, and block future access", async () => {
      const email = generateUniqueEmail("del_success");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.delete<DeleteAccountData>(
        "/api/v1/me",
        {
          password: DEFAULT_PASSWORD,
          reason: "Testing controlled deactivation",
        },
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data!.status).toBe("DELETED");
      expect(res.data.data!.retentionPeriodDays).toBe(30);

      // Attempting to query GET /api/v1/me with the same token should now return 404 (user soft-deleted)
      const afterMeRes = await api.get("/api/v1/me", authHeader(accessToken));
      expect(afterMeRes.status).toBe(404);

      // Attempting to login again with deleted credentials should be rejected
      const loginRes = await api.post("/api/v1/auth/login", {
        email,
        password: DEFAULT_PASSWORD,
      });
      expect(loginRes.status).toBe(401);
    });
  });
});
