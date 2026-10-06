import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { MeResponseData, RegisterResponseData } from "../helpers/types.js";

describe("Me / Workspace Profile API (/api/v1/me)", () => {
  it("GET /api/v1/me should return comprehensive workspace, subscription, and entitlements profile", async () => {
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
