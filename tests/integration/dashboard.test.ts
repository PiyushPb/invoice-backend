import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { RegisterResponseData } from "../helpers/types.js";

async function createTestUser(prefix = "dash_test") {
  const email = generateUniqueEmail(prefix);
  const regPayload = generateValidRegisterPayload({
    email,
    firstName: "Dashboard",
    lastName: "Tester",
    business: {
      name: "Acme Dashboard Corp",
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

describe("Dashboard API (/api/v1/dashboard)", () => {
  describe("Authentication Guards", () => {
    it("should reject unauthenticated requests to /api/v1/dashboard with 401", async () => {
      const res = await api.get("/api/v1/dashboard");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated requests to /api/v1/dashboard/stats with 401", async () => {
      const res = await api.get("/api/v1/dashboard/stats");
      expect(res.status).toBe(401);
    });
  });

  describe("Dashboard Overview (GET /api/v1/dashboard)", () => {
    it("should return clean zero-state metrics for a newly registered user with no invoices", async () => {
      const { accessToken } = await createTestUser("dash_empty");

      const res = await api.get("/api/v1/dashboard", authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Dashboard overview retrieved successfully");

      const data = res.data.data;
      expect(data.totalInvoices).toBe(0);
      expect(data.draftInvoices).toBe(0);
      expect(data.paidInvoices).toBe(0);
      expect(data.unpaidInvoices).toBe(0);
      expect(data.overdueInvoices).toBe(0);
      expect(data.totalRevenue).toBe(0);
      expect(data.totalOutstanding).toBe(0);
      expect(data.recentInvoices).toEqual([]);
      expect(data.recentPayments).toEqual([]);
    });

    it("should correctly compute total, draft, paid, unpaid, and overdue invoices, revenue, outstanding, and recent lists", async () => {
      const { accessToken } = await createTestUser("dash_full");

      // 1. Create a DRAFT invoice (amount: 1,000)
      const draftRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Draft Client",
          buyerEmail: "draft@example.com",
          items: [
            {
              type: "SERVICE",
              description: "Draft Consulting",
              quantity: 1,
              unitPrice: 1000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(draftRes.status).toBe(201);

      // 2. Create and ISSUE an unpaid invoice (amount: 2,000)
      const issuedRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Issued Client",
          buyerEmail: "issued@example.com",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              type: "PRODUCT",
              description: "Standard Widget",
              quantity: 2,
              unitPrice: 1000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(issuedRes.status).toBe(201);
      const issuedId = issuedRes.data.data.id;
      const issueAction = await api.post(
        `/api/v1/invoices/${issuedId}/issue`,
        {},
        authHeader(accessToken)
      );
      expect(issueAction.status).toBe(200);

      // 3. Create, ISSUE, and PARTIALLY PAY an invoice (amount: 3,000, paid: 1,000, due: 2,000)
      const partialRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Partial Client",
          buyerEmail: "partial@example.com",
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              type: "SERVICE",
              description: "Development Sprint",
              quantity: 3,
              unitPrice: 1000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(partialRes.status).toBe(201);
      const partialId = partialRes.data.data.id;
      await api.post(`/api/v1/invoices/${partialId}/issue`, {}, authHeader(accessToken));
      const partialPayRes = await api.post(
        `/api/v1/invoices/${partialId}/payments`,
        {
          amount: 1000,
          paymentMethod: "UPI",
          notes: "50% advance payment",
        },
        authHeader(accessToken)
      );
      expect(partialPayRes.status).toBe(201);

      // 4. Create, ISSUE, and FULLY PAY an invoice (amount: 4,000, paid: 4,000, due: 0)
      const paidRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Paid Client",
          buyerEmail: "paid@example.com",
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: [
            {
              type: "PRODUCT",
              description: "Enterprise License",
              quantity: 1,
              unitPrice: 4000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(paidRes.status).toBe(201);
      const paidId = paidRes.data.data.id;
      await api.post(`/api/v1/invoices/${paidId}/issue`, {}, authHeader(accessToken));
      const fullPayRes = await api.post(
        `/api/v1/invoices/${paidId}/payments`,
        {
          amount: 4000,
          paymentMethod: "BANK_TRANSFER",
          referenceNumber: "NEFT-12345",
        },
        authHeader(accessToken)
      );
      expect(fullPayRes.status).toBe(201);

      // 5. Create, ISSUE an OVERDUE invoice (dueDate in the past, amount: 5,000)
      const overdueRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Overdue Client",
          buyerEmail: "overdue@example.com",
          dueDate: "2026-01-01T00:00:00.000Z",
          items: [
            {
              type: "SERVICE",
              description: "Past Service",
              quantity: 1,
              unitPrice: 5000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(overdueRes.status).toBe(201);
      const overdueId = overdueRes.data.data.id;
      await api.post(`/api/v1/invoices/${overdueId}/issue`, {}, authHeader(accessToken));

      // 6. Fetch Dashboard Overview
      const dashRes = await api.get("/api/v1/dashboard", authHeader(accessToken));
      expect(dashRes.status).toBe(200);
      const data = dashRes.data.data;

      // Validate invoice counts
      expect(data.totalInvoices).toBe(5);
      expect(data.draftInvoices).toBe(1);
      expect(data.paidInvoices).toBe(1);
      // Unpaid = issued (2000) + partially paid (2000 remaining) + overdue (5000 remaining) = 3 invoices
      expect(data.unpaidInvoices).toBe(3);
      expect(data.overdueInvoices).toBe(1);

      // Validate financials
      // totalRevenue = 1000 (from partial) + 4000 (from paid) = 5000
      expect(data.totalRevenue).toBe(5000);
      // totalOutstanding = 2000 (issued) + 2000 (partial remaining) + 5000 (overdue) = 9000
      expect(data.totalOutstanding).toBe(9000);

      // Validate recent lists
      expect(data.recentInvoices.length).toBe(5);
      expect(data.recentInvoices[0]).toHaveProperty("invoiceNumber");
      expect(data.recentInvoices[0]).toHaveProperty("totalAmount");
      expect(data.recentInvoices[0]).toHaveProperty("status");

      expect(data.recentPayments.length).toBe(2);
      expect(data.recentPayments[0]).toHaveProperty("amount");
      expect(data.recentPayments[0]).toHaveProperty("paymentMethod");
      expect(data.recentPayments[0]).toHaveProperty("invoice");
      expect(data.recentPayments[0].invoice).toHaveProperty("invoiceNumber");
    });

    it("should enforce tenant data isolation between different businesses", async () => {
      const userA = await createTestUser("dash_iso_a");
      const userB = await createTestUser("dash_iso_b");

      // User A creates an invoice
      await api.post(
        "/api/v1/invoices",
        {
          buyerName: "User A Buyer",
          items: [{ type: "PRODUCT", description: "Item A", quantity: 1, unitPrice: 9999 }],
        },
        authHeader(userA.accessToken)
      );

      // User B dashboard must remain unaffected
      const resB = await api.get("/api/v1/dashboard", authHeader(userB.accessToken));
      expect(resB.status).toBe(200);
      expect(resB.data.data.totalInvoices).toBe(0);
      expect(resB.data.data.totalRevenue).toBe(0);
      expect(resB.data.data.totalOutstanding).toBe(0);
    });
  });

  describe("Dashboard Statistics (GET /api/v1/dashboard/stats)", () => {
    it("should return statistics with default 30d period when no query params are provided", async () => {
      const { accessToken } = await createTestUser("dash_stats_def");

      const res = await api.get("/api/v1/dashboard/stats", authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data.period).toBeDefined();
      expect(data.period.period).toBe("30d");
      expect(data.period.days).toBe(30);
      expect(Array.isArray(data.series)).toBe(true);
      expect(data.series.length).toBe(30);
      expect(data.series[0]).toHaveProperty("date");
      expect(data.series[0]).toHaveProperty("revenue");
      expect(data.series[0]).toHaveProperty("billed");
      expect(data.series[0]).toHaveProperty("invoiceCount");
      expect(data.series[0]).toHaveProperty("paymentCount");
      expect(data.totalInvoices).toBe(0);
      expect(data.totalRevenue).toBe(0);
    });

    it("should accept ?period=7d and return a 7-day timeline series", async () => {
      const { accessToken } = await createTestUser("dash_stats_7d");

      const res = await api.get("/api/v1/dashboard/stats?period=7d", authHeader(accessToken));
      expect(res.status).toBe(200);

      const data = res.data.data;
      expect(data.period.period).toBe("7d");
      expect(data.period.days).toBe(7);
      expect(data.series.length).toBe(7);
    });

    it("should filter statistics by explicit date range (?from=...&to=...)", async () => {
      const { accessToken } = await createTestUser("dash_stats_range");

      const from = "2026-09-01";
      const to = "2026-09-30";

      const res = await api.get(
        `/api/v1/dashboard/stats?from=${from}&to=${to}`,
        authHeader(accessToken)
      );
      expect(res.status).toBe(200);

      const data = res.data.data;
      expect(data.period.period).toBe("custom");
      expect(data.period.from).toBe(from);
      expect(data.period.to).toBe(to);
      expect(data.series.length).toBe(30);
    });

    it("should reject invalid date range where 'from' is later than 'to' with 400 Bad Request", async () => {
      const { accessToken } = await createTestUser("dash_stats_invalid_date");

      const res = await api.get(
        "/api/v1/dashboard/stats?from=2026-10-30&to=2026-09-01",
        authHeader(accessToken)
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should reject an invalid period value with 400 Bad Request", async () => {
      const { accessToken } = await createTestUser("dash_stats_invalid_period");

      const res = await api.get(
        "/api/v1/dashboard/stats?period=unsupported_period",
        authHeader(accessToken)
      );
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should accurately reflect invoices and payment amounts in stats timeline and paymentMethods", async () => {
      const { accessToken } = await createTestUser("dash_stats_data");

      // Create an invoice
      const invRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Stats Customer",
          buyerEmail: "stats@example.com",
          items: [
            {
              type: "PRODUCT",
              description: "Analyzed Widget",
              quantity: 1,
              unitPrice: 5000,
            },
          ],
        },
        authHeader(accessToken)
      );
      expect(invRes.status).toBe(201);
      const invoiceId = invRes.data.data.id;

      // Issue invoice
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      // Pay invoice via UPI
      await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        {
          amount: 5000,
          paymentMethod: "UPI",
        },
        authHeader(accessToken)
      );

      // Query stats
      const statsRes = await api.get(
        "/api/v1/dashboard/stats?period=30d",
        authHeader(accessToken)
      );
      expect(statsRes.status).toBe(200);

      const data = statsRes.data.data;
      expect(data.totalInvoices).toBe(1);
      expect(data.paidInvoices).toBe(1);
      expect(data.totalBilled).toBe(5000);
      expect(data.totalRevenue).toBe(5000);
      expect(data.totalOutstanding).toBe(0);

      // Verify paymentMethods breakdown
      const upiMethod = data.paymentMethods.find((m: any) => m.method === "UPI");
      expect(upiMethod).toBeDefined();
      expect(upiMethod.count).toBe(1);
      expect(upiMethod.totalAmount).toBe(5000);

      // Verify top customers
      expect(data.topCustomers.length).toBe(1);
      expect(data.topCustomers[0].name).toBe("Stats Customer");
      expect(data.topCustomers[0].billedAmount).toBe(5000);
    });
  });
});
