import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type {
  BusinessDetailData,
  RegisterResponseData,
} from "../helpers/types.js";

describe("Business API (/api/v1/business)", () => {
  describe("GET /api/v1/business - Get Business Details of Logged-in Individual", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await api.get("/api/v1/business");

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toMatch(/token/i);
    });

    it("should return comprehensive business details strictly for the logged-in user", async () => {
      const email = generateUniqueEmail("biz_detail_strict");
      const regPayload = generateValidRegisterPayload({
        email,
        firstName: "Alice",
        lastName: "Smith",
        business: {
          name: "Apex Global Solutions Pvt Ltd",
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
      const registeredBiz = regRes.data.data!.business;

      const res = await api.get<BusinessDetailData>(
        "/api/v1/business",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Business details retrieved successfully");

      const biz = res.data.data!;
      expect(biz).toBeDefined();

      // 1. Core business properties
      expect(biz.id).toBe(registeredBiz.id);
      expect(biz.name).toBe("Apex Global Solutions Pvt Ltd");
      expect(biz.businessType).toBe("PRIVATE_LIMITED");
      expect(biz.countryCode).toBe("IN");
      expect(biz.currencyCode).toBe("INR");
      expect(biz.status).toBe("ACTIVE");
      expect(biz.createdAt).toBeDefined();
      expect(biz.updatedAt).toBeDefined();

      // 2. Current member identity & role
      expect(biz.currentMember).toBeDefined();
      expect(biz.currentMember.role).toBe("OWNER");
      expect(biz.currentMember.status).toBe("ACTIVE");
      expect(biz.currentMember.joinedAt).toBeDefined();

      // 3. Settings (safe serialization of BigInt invoiceStartNumber)
      expect(biz.settings).toBeDefined();
      expect(biz.settings?.invoicePrefix).toBe("INV");
      expect(biz.settings?.invoiceStartNumber).toBe("1");
      expect(typeof biz.settings?.invoiceStartNumber).toBe("string");
      expect(biz.settings?.defaultDueDays).toBe(7);
      expect(biz.settings?.defaultCurrency).toBe("INR");
      expect(biz.settings?.defaultTaxInclusive).toBe(false);
      expect(biz.settings?.showLogo).toBe(true);
      expect(biz.settings?.showBankDetails).toBe(true);

      // 4. Tax profile
      expect(biz.taxProfile).toBeDefined();
      expect(biz.taxProfile?.taxCountry).toBe("IN");
      expect(biz.taxProfile?.taxRegistered).toBe(false);
      expect(biz.taxProfile?.defaultTaxMode).toBe("TAX_EXCLUSIVE");

      // 5. Addresses and Bank Accounts arrays
      expect(Array.isArray(biz.addresses)).toBe(true);
      expect(Array.isArray(biz.bankAccounts)).toBe(true);

      // 6. Active subscription
      expect(biz.subscription).toBeDefined();
      expect(biz.subscription?.planCode).toBe("FREE");
      expect(biz.subscription?.isFree).toBe(true);
      expect(biz.subscription?.status).toBe("ACTIVE");

      // 7. Resource counts
      expect(biz.counts).toBeDefined();
      expect(biz.counts.members).toBeGreaterThanOrEqual(1);
      expect(typeof biz.counts.customers).toBe("number");
      expect(typeof biz.counts.products).toBe("number");
      expect(typeof biz.counts.invoices).toBe("number");
    });
  });
});
