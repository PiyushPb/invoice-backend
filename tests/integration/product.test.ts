import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { RegisterResponseData } from "../helpers/types.js";

async function createTestUser(prefix = "prod_test") {
  const email = generateUniqueEmail(prefix);
  const regPayload = generateValidRegisterPayload({
    email,
    firstName: "Prod",
    lastName: "Tester",
    business: {
      name: "Product Test Corp",
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

describe("Products API (/api/v1/products)", () => {
  describe("Authentication Guards", () => {
    it("should reject unauthenticated requests with 401", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000000";

      const postRes = await api.post("/api/v1/products", {});
      expect(postRes.status).toBe(401);

      const getRes = await api.get("/api/v1/products");
      expect(getRes.status).toBe(401);

      const getSingleRes = await api.get(`/api/v1/products/${dummyId}`);
      expect(getSingleRes.status).toBe(401);

      const patchRes = await api.patch(`/api/v1/products/${dummyId}`, {});
      expect(patchRes.status).toBe(401);

      const archiveRes = await api.post(`/api/v1/products/${dummyId}/archive`);
      expect(archiveRes.status).toBe(401);

      const restoreRes = await api.post(`/api/v1/products/${dummyId}/restore`);
      expect(restoreRes.status).toBe(401);

      const deleteRes = await api.delete(`/api/v1/products/${dummyId}`);
      expect(deleteRes.status).toBe(401);
    });
  });

  describe("Product Creation (POST /api/v1/products)", () => {
    it("should successfully create a PRODUCT with required fields", async () => {
      const { accessToken } = await createTestUser("prod_create");

      const payload = {
        type: "PRODUCT",
        name: "Wireless Mouse M350",
        sku: "WM-350-GRY",
        hsnCode: "84716060",
        unit: "piece",
        unitPrice: 1299.5,
        defaultQuantity: 1,
        currencyCode: "INR",
        defaultDiscountType: "PERCENTAGE",
        defaultDiscountValue: 10,
        defaultTaxRate: 18,
        isTaxable: true,
      };

      const res = await api.post(
        "/api/v1/products",
        payload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Product created successfully");
      expect(res.data.data.name).toBe("Wireless Mouse M350");
      expect(res.data.data.type).toBe("PRODUCT");
      expect(res.data.data.sku).toBe("WM-350-GRY");
      expect(res.data.data.status).toBe("ACTIVE");
      expect(Number(res.data.data.unitPrice)).toBe(1299.5);
    });

    it("should successfully create a SERVICE", async () => {
      const { accessToken } = await createTestUser("serv_create");

      const payload = {
        type: "SERVICE",
        name: "Cloud Consulting Hours",
        sacCode: "998313",
        unit: "hour",
        unitPrice: 5000,
        isTaxable: true,
      };

      const res = await api.post(
        "/api/v1/products",
        payload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.type).toBe("SERVICE");
      expect(res.data.data.sacCode).toBe("998313");
    });

    it("should reject creation with missing or invalid fields", async () => {
      const { accessToken } = await createTestUser("prod_val_fail");

      // Missing unitPrice
      const res1 = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Incomplete" },
        authHeader(accessToken)
      );
      expect(res1.status).toBe(400);

      // Negative unitPrice
      const res2 = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Negative Price", unitPrice: -50 },
        authHeader(accessToken)
      );
      expect(res2.status).toBe(400);

      // Invalid type
      const res3 = await api.post(
        "/api/v1/products",
        { type: "SUBSCRIPTION", name: "Invalid Type", unitPrice: 100 },
        authHeader(accessToken)
      );
      expect(res3.status).toBe(400);
    });
  });

  describe("Product Listing, Filtering & Pagination (GET /api/v1/products)", () => {
    it("should list products with pagination and filters", async () => {
      const { accessToken } = await createTestUser("prod_list");

      // Create 3 items: 2 products, 1 service
      await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Alpha Gadget", sku: "AG-01", unitPrice: 100 },
        authHeader(accessToken)
      );
      await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Beta Widget", sku: "BW-02", unitPrice: 200 },
        authHeader(accessToken)
      );
      await api.post(
        "/api/v1/products",
        { type: "SERVICE", name: "Gamma Support", sacCode: "9983", unitPrice: 300 },
        authHeader(accessToken)
      );

      // List all
      const listAll = await api.get(
        "/api/v1/products?page=1&limit=10",
        authHeader(accessToken)
      );
      expect(listAll.status).toBe(200);
      expect(listAll.data.data.length).toBe(3);
      expect(listAll.data.meta.total).toBe(3);

      // Filter by type=SERVICE
      const services = await api.get(
        "/api/v1/products?type=SERVICE",
        authHeader(accessToken)
      );
      expect(services.status).toBe(200);
      expect(services.data.data.length).toBe(1);
      expect(services.data.data[0].name).toBe("Gamma Support");

      // Search by keyword
      const searchRes = await api.get(
        "/api/v1/products?search=Beta",
        authHeader(accessToken)
      );
      expect(searchRes.status).toBe(200);
      expect(searchRes.data.data.length).toBe(1);
      expect(searchRes.data.data[0].name).toBe("Beta Widget");

      // Sort by unitPrice desc
      const sortedRes = await api.get(
        "/api/v1/products?sort=unitPrice&order=desc",
        authHeader(accessToken)
      );
      expect(sortedRes.status).toBe(200);
      expect(sortedRes.data.data[0].name).toBe("Gamma Support");
      expect(sortedRes.data.data[2].name).toBe("Alpha Gadget");
    });
  });

  describe("Product Detail & Tenant Isolation (GET /api/v1/products/:productId)", () => {
    it("should retrieve a single product by ID", async () => {
      const { accessToken } = await createTestUser("prod_detail");

      const createRes = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Solo Item", unitPrice: 499 },
        authHeader(accessToken)
      );
      const productId = createRes.data.data.id;

      const getRes = await api.get(
        `/api/v1/products/${productId}`,
        authHeader(accessToken)
      );
      expect(getRes.status).toBe(200);
      expect(getRes.data.data.id).toBe(productId);
      expect(getRes.data.data.name).toBe("Solo Item");
    });

    it("should prevent cross-tenant access to another business's product", async () => {
      const userA = await createTestUser("user_a");
      const userB = await createTestUser("user_b");

      const createRes = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Secret Item A", unitPrice: 999 },
        authHeader(userA.accessToken)
      );
      const productAId = createRes.data.data.id;

      // User B tries to access User A's product
      const leakRes = await api.get(
        `/api/v1/products/${productAId}`,
        authHeader(userB.accessToken)
      );
      expect(leakRes.status).toBe(404);
    });
  });

  describe("Update Product (PATCH /api/v1/products/:productId)", () => {
    it("should update mutable fields of a product", async () => {
      const { accessToken } = await createTestUser("prod_patch");

      const createRes = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Old Name", unitPrice: 100 },
        authHeader(accessToken)
      );
      const productId = createRes.data.data.id;

      const patchRes = await api.patch(
        `/api/v1/products/${productId}`,
        { name: "New Name", unitPrice: 250, description: "Updated description" },
        authHeader(accessToken)
      );

      expect(patchRes.status).toBe(200);
      expect(patchRes.data.data.name).toBe("New Name");
      expect(Number(patchRes.data.data.unitPrice)).toBe(250);
      expect(patchRes.data.data.description).toBe("Updated description");
    });
  });

  describe("Archive & Restore Product", () => {
    it("should archive and restore a product with conflict protection", async () => {
      const { accessToken } = await createTestUser("prod_lifecycle");

      const createRes = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "Lifecycle Item", unitPrice: 150 },
        authHeader(accessToken)
      );
      const productId = createRes.data.data.id;

      // Archive
      const archRes = await api.post(
        `/api/v1/products/${productId}/archive`,
        {},
        authHeader(accessToken)
      );
      expect(archRes.status).toBe(200);
      expect(archRes.data.data.status).toBe("ARCHIVED");

      // Archive again -> 409 Conflict
      const archAgain = await api.post(
        `/api/v1/products/${productId}/archive`,
        {},
        authHeader(accessToken)
      );
      expect(archAgain.status).toBe(409);

      // Verify filtered out from active list
      const activeList = await api.get(
        "/api/v1/products?status=active",
        authHeader(accessToken)
      );
      expect(activeList.data.data.find((p: any) => p.id === productId)).toBeUndefined();

      // Restore
      const restoreRes = await api.post(
        `/api/v1/products/${productId}/restore`,
        {},
        authHeader(accessToken)
      );
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.data.data.status).toBe("ACTIVE");

      // Restore again -> 409 Conflict
      const restoreAgain = await api.post(
        `/api/v1/products/${productId}/restore`,
        {},
        authHeader(accessToken)
      );
      expect(restoreAgain.status).toBe(409);
    });
  });

  describe("Hard Delete Product (DELETE /api/v1/products/:productId)", () => {
    it("should permanently delete an unreferenced product", async () => {
      const { accessToken } = await createTestUser("prod_del");

      const createRes = await api.post(
        "/api/v1/products",
        { type: "PRODUCT", name: "To Delete", unitPrice: 50 },
        authHeader(accessToken)
      );
      const productId = createRes.data.data.id;

      const delRes = await api.delete(
        `/api/v1/products/${productId}`,
        authHeader(accessToken)
      );
      expect(delRes.status).toBe(200);
      expect(delRes.data.message).toBe("Product permanently deleted");

      // Subsequent GET should be 404
      const getRes = await api.get(
        `/api/v1/products/${productId}`,
        authHeader(accessToken)
      );
      expect(getRes.status).toBe(404);
    });
  });
});
