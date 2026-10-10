import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { RegisterResponseData } from "../helpers/types.js";

async function createTestUser(prefix = "usage_test") {
  const email = generateUniqueEmail(prefix);
  const regPayload = generateValidRegisterPayload({
    email,
    firstName: "Usage",
    lastName: "Tester",
    business: {
      name: "Acme Usage Corp",
      businessType: "PRIVATE_LIMITED",
      countryCode: "IN",
      currencyCode: "INR",
    },
  });

  const res = await api.post<RegisterResponseData>(
    "/api/v1/auth/register",
    regPayload
  );
  expect(res.status).toBe(201);
  return {
    accessToken: res.data.data!.tokens.accessToken,
    business: res.data.data!.business,
  };
}

describe("Usage & Entitlements API (/api/v1/usage & /api/v1/entitlements)", () => {
  describe("Authentication Guards", () => {
    it("should reject unauthenticated request to /api/v1/usage with 401", async () => {
      const res = await api.get("/api/v1/usage");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated request to /api/v1/entitlements with 401", async () => {
      const res = await api.get("/api/v1/entitlements");
      expect(res.status).toBe(401);
    });
  });

  describe("Current Usage (GET /api/v1/usage)", () => {
    it("should return zero usage with full remaining quota for a new business", async () => {
      const { accessToken } = await createTestUser("usage_fresh");

      const res = await api.get("/api/v1/usage", authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data.invoices).toBeDefined();
      expect(data.invoices.used).toBe(0);
      expect(data.invoices.limit).toBe(50);
      expect(data.invoices.remaining).toBe(50);

      expect(data.customers).toBeDefined();
      expect(data.customers.used).toBe(0);
      expect(data.customers.limit).toBe(20);
      expect(data.customers.remaining).toBe(20);

      expect(data.products).toBeDefined();
      expect(data.products.used).toBe(0);
      expect(data.products.limit).toBe(20);
      expect(data.products.remaining).toBe(20);
    });

    it("should dynamically reflect resource creation and archiving in usage counts and remaining limits", async () => {
      const { accessToken } = await createTestUser("usage_dynamic");

      // 1. Create a Customer
      const custRes = await api.post(
        "/api/v1/customers",
        {
          customerType: "BUSINESS",
          displayName: "Customer Alpha",
          email: "alpha@example.com",
        },
        authHeader(accessToken)
      );
      expect(custRes.status).toBe(201);
      const customerId = custRes.data.data.id;

      // 2. Create a Product
      const prodRes = await api.post(
        "/api/v1/products",
        {
          type: "PRODUCT",
          name: "Widget Pro",
          unitPrice: 1500,
        },
        authHeader(accessToken)
      );
      expect(prodRes.status).toBe(201);

      // 3. Create an Invoice
      const invRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Buyer Alpha",
          items: [
            {
              type: "PRODUCT",
              description: "Widget Purchase",
              quantity: 1,
              unitPrice: 1500,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(invRes.status).toBe(201);

      // 4. Check usage
      const usageRes1 = await api.get("/api/v1/usage", authHeader(accessToken));
      expect(usageRes1.status).toBe(200);
      const data1 = usageRes1.data.data;

      expect(data1.invoices.used).toBe(1);
      expect(data1.invoices.remaining).toBe(49);

      expect(data1.customers.used).toBe(1);
      expect(data1.customers.remaining).toBe(19);

      expect(data1.products.used).toBe(1);
      expect(data1.products.remaining).toBe(19);

      // 5. Archive customer -> should free up active customer quota
      const archiveRes = await api.post(
        `/api/v1/customers/${customerId}/archive`,
        {},
        authHeader(accessToken)
      );
      expect(archiveRes.status).toBe(200);

      const usageRes2 = await api.get("/api/v1/usage", authHeader(accessToken));
      expect(usageRes2.status).toBe(200);
      const data2 = usageRes2.data.data;

      expect(data2.customers.used).toBe(0);
      expect(data2.customers.remaining).toBe(20);
    });

    it("should enforce tenant isolation for usage metrics", async () => {
      const userA = await createTestUser("usage_iso_a");
      const userB = await createTestUser("usage_iso_b");

      // User A creates 2 invoices
      await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Buyer A1",
          items: [{ type: "PRODUCT", description: "Item 1", quantity: 1, unitPrice: 100 }],
        },
        authHeader(userA.accessToken)
      );
      await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Buyer A2",
          items: [{ type: "PRODUCT", description: "Item 2", quantity: 1, unitPrice: 200 }],
        },
        authHeader(userA.accessToken)
      );

      // Check User A usage
      const resA = await api.get("/api/v1/usage", authHeader(userA.accessToken));
      expect(resA.data.data.invoices.used).toBe(2);

      // Check User B usage remains 0
      const resB = await api.get("/api/v1/usage", authHeader(userB.accessToken));
      expect(resB.data.data.invoices.used).toBe(0);
      expect(resB.data.data.invoices.remaining).toBe(50);
    });
  });

  describe("Entitlements (GET /api/v1/entitlements)", () => {
    it("should return plan details, features map, and entitlements list for the active plan", async () => {
      const { accessToken } = await createTestUser("entitlements_test");

      const res = await api.get("/api/v1/entitlements", authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data.plan).toBeDefined();
      expect(data.plan.code).toBe("FREE");
      expect(data.plan.isFree).toBe(true);

      expect(data.features).toBeDefined();
      expect(data.features.INVOICES_LIFETIME).toEqual({
        feature: "INVOICES_LIFETIME",
        limit: 50,
        isUnlimited: false,
        isEnabled: true,
      });

      expect(data.features.CUSTOMERS_ACTIVE).toEqual({
        feature: "CUSTOMERS_ACTIVE",
        limit: 20,
        isUnlimited: false,
        isEnabled: true,
      });

      expect(data.features.PRODUCTS_ACTIVE).toEqual({
        feature: "PRODUCTS_ACTIVE",
        limit: 20,
        isUnlimited: false,
        isEnabled: true,
      });

      expect(Array.isArray(data.entitlements)).toBe(true);
      expect(data.entitlements.length).toBeGreaterThanOrEqual(6);
    });
  });
});
