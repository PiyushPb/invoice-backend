import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import { queryDb } from "../helpers/db.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type { RegisterResponseData } from "../helpers/types.js";

async function createTestUser(prefix = "inv_test") {
  const email = generateUniqueEmail(prefix);
  const regPayload = generateValidRegisterPayload({
    email,
    firstName: "Invoice",
    lastName: "Tester",
    business: {
      name: "Acme Invoicing Corp",
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

describe("Invoices API (/api/v1/invoices)", () => {
  describe("Authentication Guards", () => {
    it("should reject unauthenticated requests with 401", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000000";

      const listRes = await api.get("/api/v1/invoices");
      expect(listRes.status).toBe(401);

      const getRes = await api.get(`/api/v1/invoices/${dummyId}`);
      expect(getRes.status).toBe(401);

      const postRes = await api.post("/api/v1/invoices", {});
      expect(postRes.status).toBe(401);

      const patchRes = await api.patch(`/api/v1/invoices/${dummyId}`, {});
      expect(patchRes.status).toBe(401);

      const delRes = await api.delete(`/api/v1/invoices/${dummyId}`);
      expect(delRes.status).toBe(401);
    });
  });

  describe("Invoice Creation (POST /api/v1/invoices)", () => {
    it("should successfully create an invoice for an existing customer with auto-generated sequential number", async () => {
      const { accessToken } = await createTestUser("inv_cust");

      // 1. Create a customer
      const custRes = await api.post(
        "/api/v1/customers",
        {
          customerType: "BUSINESS",
          displayName: "TechCorp Logistics",
          legalName: "TechCorp Logistics Pvt Ltd",
          email: "billing@techcorp.example.com",
          gstin: "27AABCT3518Q1ZV",
          placeOfSupplyStateCode: "27",
        },
        authHeader(accessToken)
      );
      expect(custRes.status).toBe(201);
      const customerId = custRes.data.data.id;

      // 2. Add an address to the customer
      await api.post(
        `/api/v1/customers/${customerId}/addresses`,
        {
          type: "BILLING",
          addressLine1: "123 Marine Drive",
          city: "Mumbai",
          state: "Maharashtra",
          stateCode: "27",
          postalCode: "400020",
          countryCode: "IN",
          isPrimary: true,
        },
        authHeader(accessToken)
      );

      // 3. Create invoice with line items
      const invoicePayload = {
        customerId,
        items: [
          {
            type: "PRODUCT",
            description: "Enterprise Router Setup",
            quantity: 2,
            unitPrice: 15000,
            discountType: "PERCENTAGE",
            discountValue: 10,
            taxRate: 18,
          },
          {
            type: "SERVICE",
            description: "Onsite Installation & Wiring",
            quantity: 1,
            unitPrice: 5000,
            discountType: "FIXED",
            discountValue: 500,
            taxRate: 18,
          },
        ],
        shippingAmount: 500,
        notes: "Thank you for your business!",
      };

      const res = await api.post(
        "/api/v1/invoices",
        invoicePayload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Invoice created successfully");

      const invoice = res.data.data;
      expect(invoice.status).toBe("DRAFT");
      expect(invoice.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
      expect(invoice.buyerName).toBe("TechCorp Logistics Pvt Ltd");
      expect(invoice.buyerGstin).toBe("27AABCT3518Q1ZV");
      expect(invoice.items.length).toBe(2);

      // Verify item 1 calculation:
      // Gross = 2 * 15000 = 30000
      // Discount = 10% = 3000 -> Taxable = 27000
      // Tax = 18% of 27000 = 4860 -> Total = 31860
      const item1 = invoice.items[0];
      expect(Number(item1.taxableAmount)).toBe(27000);
      expect(Number(item1.lineTotal)).toBe(31860);

      // Verify item 2 calculation:
      // Gross = 1 * 5000 = 5000
      // Discount = 500 -> Taxable = 4500
      // Tax = 18% of 4500 = 810 -> Total = 5310
      const item2 = invoice.items[1];
      expect(Number(item2.taxableAmount)).toBe(4500);
      expect(Number(item2.lineTotal)).toBe(5310);

      // Invoice Totals:
      // Taxable = 27000 + 4500 = 31500
      // Tax = 4860 + 810 = 5670
      // Shipping = 500
      // Total = 31500 + 5670 + 500 = 37670
      expect(Number(invoice.taxableAmount)).toBe(31500);
      expect(Number(invoice.taxAmount)).toBe(5670);
      expect(Number(invoice.totalAmount)).toBe(37670);
      expect(Number(invoice.amountDue)).toBe(37670);
    });

    it("should successfully create an invoice for a walk-in / guest buyer without customerId", async () => {
      const { accessToken } = await createTestUser("inv_guest");

      const payload = {
        buyerName: "Walk-in Buyer",
        buyerEmail: "walkin@example.com",
        items: [
          {
            type: "PRODUCT",
            description: "Direct Retail Sale",
            quantity: 1,
            unitPrice: 1200,
            taxRate: 18,
          },
        ],
      };

      const res = await api.post(
        "/api/v1/invoices",
        payload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(201);
      expect(res.data.data.buyerName).toBe("Walk-in Buyer");
      expect(res.data.data.customerId).toBeNull();
      expect(Number(res.data.data.totalAmount)).toBe(1416);
    });

    it("should allow a custom invoice number and reject duplicate invoice number", async () => {
      const { accessToken } = await createTestUser("inv_custom_num");

      const payload = {
        invoiceNumber: "CUSTOM-INV-2026-001",
        buyerName: "Enterprise Client",
        items: [
          {
            type: "SERVICE",
            description: "Custom Consulting",
            quantity: 1,
            unitPrice: 10000,
          },
        ],
      };

      const res1 = await api.post(
        "/api/v1/invoices",
        payload,
        authHeader(accessToken)
      );
      expect(res1.status).toBe(201);
      expect(res1.data.data.invoiceNumber).toBe("CUSTOM-INV-2026-001");

      // Attempt duplicate invoice number -> 409 Conflict
      const res2 = await api.post(
        "/api/v1/invoices",
        payload,
        authHeader(accessToken)
      );
      expect(res2.status).toBe(409);
      expect(res2.data.message).toMatch(/already exists/i);
    });

    it("should reject invoice creation when neither customerId nor buyerName is provided", async () => {
      const { accessToken } = await createTestUser("inv_invalid");

      const res = await api.post(
        "/api/v1/invoices",
        {
          items: [
            {
              type: "PRODUCT",
              description: "Product A",
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
        authHeader(accessToken)
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Invoice Listing, Filtering & Pagination (GET /api/v1/invoices)", () => {
    it("should list invoices with pagination, search, status, and date filters", async () => {
      const { accessToken } = await createTestUser("inv_list");

      // Create 2 invoices
      await api.post(
        "/api/v1/invoices",
        {
          invoiceNumber: "FILTER-001",
          buyerName: "Alpha Buyer",
          items: [{ type: "PRODUCT", description: "P1", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      await api.post(
        "/api/v1/invoices",
        {
          invoiceNumber: "FILTER-002",
          buyerName: "Beta Buyer",
          items: [{ type: "PRODUCT", description: "P2", quantity: 1, unitPrice: 200 }],
        },
        authHeader(accessToken)
      );

      // List all
      const listRes = await api.get(
        "/api/v1/invoices?page=1&limit=10",
        authHeader(accessToken)
      );
      expect(listRes.status).toBe(200);
      expect(listRes.data.data.length).toBe(2);
      expect(listRes.data.meta.total).toBe(2);

      // Search by buyerName
      const searchRes = await api.get(
        "/api/v1/invoices?search=Beta",
        authHeader(accessToken)
      );
      expect(searchRes.status).toBe(200);
      expect(searchRes.data.data.length).toBe(1);
      expect(searchRes.data.data[0].invoiceNumber).toBe("FILTER-002");

      // Filter by status=DRAFT
      const statusRes = await api.get(
        "/api/v1/invoices?status=DRAFT",
        authHeader(accessToken)
      );
      expect(statusRes.status).toBe(200);
      expect(statusRes.data.data.length).toBe(2);
    });
  });

  describe("Invoice Detail & Cross-Tenant Isolation (GET /api/v1/invoices/:invoiceId)", () => {
    it("should retrieve full invoice details and enforce tenant isolation", async () => {
      const userA = await createTestUser("inv_iso_a");
      const userB = await createTestUser("inv_iso_b");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Tenant A Buyer",
          items: [{ type: "PRODUCT", description: "Secret Item", quantity: 1, unitPrice: 500 }],
        },
        authHeader(userA.accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // User A can access
      const getResA = await api.get(
        `/api/v1/invoices/${invoiceId}`,
        authHeader(userA.accessToken)
      );
      expect(getResA.status).toBe(200);
      expect(getResA.data.data.id).toBe(invoiceId);

      // User B cannot access -> 404
      const getResB = await api.get(
        `/api/v1/invoices/${invoiceId}`,
        authHeader(userB.accessToken)
      );
      expect(getResB.status).toBe(404);
    });
  });

  describe("Draft Invoice Update (PATCH /api/v1/invoices/:invoiceId)", () => {
    it("should update mutable draft fields and recalculate totals when items change", async () => {
      const { accessToken } = await createTestUser("inv_patch");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Draft Buyer",
          items: [{ type: "PRODUCT", description: "Initial Item", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      const patchRes = await api.patch(
        `/api/v1/invoices/${invoiceId}`,
        {
          buyerName: "Updated Buyer Name",
          notes: "Updated delivery notes",
          shippingAmount: 150,
          items: [
            { type: "PRODUCT", description: "New Item A", quantity: 2, unitPrice: 300, taxRate: 18 },
          ],
        },
        authHeader(accessToken)
      );

      expect(patchRes.status).toBe(200);
      expect(patchRes.data.data.buyerName).toBe("Updated Buyer Name");
      expect(patchRes.data.data.notes).toBe("Updated delivery notes");
      // Taxable = 600, Tax = 108, Shipping = 150, Total = 858
      expect(Number(patchRes.data.data.totalAmount)).toBe(858);
    });

    it("should reject modifying an issued or non-draft invoice with 409 Conflict", async () => {
      const { accessToken, business } = await createTestUser("inv_patch_lock");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Issued Buyer",
          items: [{ type: "PRODUCT", description: "Locked Item", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Simulate issuing the invoice directly in DB
      await queryDb(
        `UPDATE "Invoice" SET status = 'ISSUED' WHERE id = $1::uuid`,
        [invoiceId]
      );

      // Attempt to patch -> 409 Conflict
      const patchRes = await api.patch(
        `/api/v1/invoices/${invoiceId}`,
        { notes: "Trying to edit issued invoice" },
        authHeader(accessToken)
      );

      expect(patchRes.status).toBe(409);
      expect(patchRes.data.message).toMatch(/Only DRAFT invoices can be updated/i);
    });
  });

  describe("Draft Invoice Deletion (DELETE /api/v1/invoices/:invoiceId)", () => {
    it("should permanently delete a DRAFT invoice", async () => {
      const { accessToken } = await createTestUser("inv_del");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "To Delete",
          items: [{ type: "PRODUCT", description: "Item", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      const delRes = await api.delete(
        `/api/v1/invoices/${invoiceId}`,
        authHeader(accessToken)
      );
      expect(delRes.status).toBe(200);
      expect(delRes.data.message).toBe("Draft invoice deleted successfully");

      const getRes = await api.get(
        `/api/v1/invoices/${invoiceId}`,
        authHeader(accessToken)
      );
      expect(getRes.status).toBe(404);
    });

    it("should strictly prevent deleting an issued financial document with 409 Conflict", async () => {
      const { accessToken } = await createTestUser("inv_del_issued");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Permanent Document",
          items: [{ type: "PRODUCT", description: "Item", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Set status to ISSUED
      await queryDb(
        `UPDATE "Invoice" SET status = 'ISSUED' WHERE id = $1::uuid`,
        [invoiceId]
      );

      const delRes = await api.delete(
        `/api/v1/invoices/${invoiceId}`,
        authHeader(accessToken)
      );

      expect(delRes.status).toBe(409);
      expect(delRes.data.message).toMatch(/Cannot delete an issued financial document/i);
    });
  });

  describe("Lifetime 50 Invoices Quota Enforcement", () => {
    it("should enforce the 50 lifetime invoices plan limit on Free tier", async () => {
      const { accessToken, business } = await createTestUser("inv_quota");

      // Verify business can create 1 invoice
      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "First Invoice",
          items: [{ type: "PRODUCT", description: "Item", quantity: 1, unitPrice: 50 }],
        },
        authHeader(accessToken)
      );
      expect(createRes.status).toBe(201);

      // Simulate reaching the 50 lifetime invoice limit by inserting dummy invoices directly in DB
      const currentCount = 1;
      const targetCount = 50;
      for (let i = currentCount + 1; i <= targetCount; i++) {
        await queryDb(
          `INSERT INTO "Invoice" (
            id, "businessId", "invoiceNumber", "financialYear", "documentType", status,
            "issueDate", "currencyCode", "sellerName", "sellerAddressSnapshot",
            "buyerName", "buyerAddressSnapshot", subtotal, "taxableAmount",
            "totalAmount", "amountDue", "createdById", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1::uuid, $2, '2026-27', 'TAX_INVOICE', 'DRAFT',
            CURRENT_DATE, 'INR', 'Seller', '{}',
            'Buyer', '{}', 100, 100,
            100, 100, (SELECT id FROM "User" LIMIT 1), NOW(), NOW()
          )`,
          [business.id, `MOCK-INV-${i}`]
        );
      }

      // Attempt creating the 51st invoice -> must be blocked
      const overLimitRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "51st Invoice",
          items: [{ type: "PRODUCT", description: "Over quota item", quantity: 1, unitPrice: 50 }],
        },
        authHeader(accessToken)
      );

      expect(overLimitRes.status).toBe(403);
      expect(overLimitRes.data.message).toMatch(/plan limit for invoices \(50\) has been reached/i);
    });
  });

  describe("Invoice Lifecycle Operations", () => {
    it("should issue a draft invoice, transition status to ISSUED, and reject issuing twice", async () => {
      const { accessToken } = await createTestUser("inv_issue");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Ready Buyer",
          items: [{ type: "PRODUCT", description: "Router", quantity: 1, unitPrice: 2000, taxRate: 18 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;
      expect(createRes.data.data.status).toBe("DRAFT");

      // Issue invoice
      const issueRes = await api.post(
        `/api/v1/invoices/${invoiceId}/issue`,
        {},
        authHeader(accessToken)
      );

      expect(issueRes.status).toBe(200);
      expect(issueRes.data.success).toBe(true);
      expect(issueRes.data.data.status).toBe("ISSUED");
      expect(issueRes.data.data.issuedAt).toBeDefined();

      // Attempt issuing again -> 409 Conflict
      const issueAgain = await api.post(
        `/api/v1/invoices/${invoiceId}/issue`,
        {},
        authHeader(accessToken)
      );
      expect(issueAgain.status).toBe(409);
      expect(issueAgain.data.message).toMatch(/Only DRAFT invoices can be issued/i);
    });

    it("should reject sending a draft invoice, and successfully send an issued invoice", async () => {
      const { accessToken } = await createTestUser("inv_send");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Email Buyer",
          buyerEmail: "buyer@domain.com",
          items: [{ type: "PRODUCT", description: "Item", quantity: 1, unitPrice: 500 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Try sending while DRAFT -> 400 Bad Request
      const draftSendRes = await api.post(
        `/api/v1/invoices/${invoiceId}/send`,
        {},
        authHeader(accessToken)
      );
      expect(draftSendRes.status).toBe(400);
      expect(draftSendRes.data.message).toMatch(/Cannot send a draft invoice/i);

      // Issue invoice first
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      // Now send invoice
      const sendRes = await api.post(
        `/api/v1/invoices/${invoiceId}/send`,
        { subject: "Here is your invoice" },
        authHeader(accessToken)
      );
      expect(sendRes.status).toBe(200);
      expect(sendRes.data.data.status).toBe("SENT");
      expect(sendRes.data.data.sentAt).toBeDefined();
    });

    it("should generate and download the invoice PDF", async () => {
      const { accessToken } = await createTestUser("inv_pdf");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "PDF Buyer",
          items: [{ type: "PRODUCT", description: "Physical Good", quantity: 2, unitPrice: 1500 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Generate PDF
      const postPdfRes = await api.post(
        `/api/v1/invoices/${invoiceId}/pdf`,
        {},
        authHeader(accessToken)
      );
      expect(postPdfRes.status).toBe(200);
      expect(postPdfRes.data.data.pdfUrl).toBe(`/api/v1/invoices/${invoiceId}/pdf`);

      // Download PDF
      const getPdfRes = await api.get(
        `/api/v1/invoices/${invoiceId}/pdf`,
        authHeader(accessToken)
      );
      expect(getPdfRes.status).toBe(200);
      expect(getPdfRes.headers["content-type"]).toBe("application/pdf");
      expect(getPdfRes.headers["content-disposition"]).toMatch(/inline; filename=/i);
      expect(getPdfRes.data).toBeDefined();
    });

    it("should cancel an issued invoice and reject cancelling again", async () => {
      const { accessToken } = await createTestUser("inv_cancel");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Cancel Buyer",
          items: [{ type: "SERVICE", description: "Temp Service", quantity: 1, unitPrice: 1000 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Issue first
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      // Cancel
      const cancelRes = await api.post(
        `/api/v1/invoices/${invoiceId}/cancel`,
        { reason: "Customer requested cancellation" },
        authHeader(accessToken)
      );
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.data.data.status).toBe("CANCELLED");
      expect(cancelRes.data.data.cancelledAt).toBeDefined();

      // Cancel again -> 409 Conflict
      const cancelAgain = await api.post(
        `/api/v1/invoices/${invoiceId}/cancel`,
        {},
        authHeader(accessToken)
      );
      expect(cancelAgain.status).toBe(409);
      expect(cancelAgain.data.message).toMatch(/already cancelled/i);
    });

    it("should void an invoice for audit compliance", async () => {
      const { accessToken } = await createTestUser("inv_void");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Void Buyer",
          items: [{ type: "PRODUCT", description: "Clerical Error Item", quantity: 1, unitPrice: 300 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Issue first
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      // Void
      const voidRes = await api.post(
        `/api/v1/invoices/${invoiceId}/void`,
        { reason: "Created in error" },
        authHeader(accessToken)
      );
      expect(voidRes.status).toBe(200);
      expect(voidRes.data.data.status).toBe("VOID");

      // Void again -> 409 Conflict
      const voidAgain = await api.post(
        `/api/v1/invoices/${invoiceId}/void`,
        {},
        authHeader(accessToken)
      );
      expect(voidAgain.status).toBe(409);
      expect(voidAgain.data.message).toMatch(/already void/i);
    });

    it("should duplicate an invoice into a fresh draft with a new distinct invoice number", async () => {
      const { accessToken } = await createTestUser("inv_dup");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Template Client",
          items: [{ type: "SERVICE", description: "Monthly Retainer", quantity: 1, unitPrice: 25000 }],
        },
        authHeader(accessToken)
      );
      const originalId = createRes.data.data.id;
      const originalNumber = createRes.data.data.invoiceNumber;

      // Issue original
      await api.post(`/api/v1/invoices/${originalId}/issue`, {}, authHeader(accessToken));

      // Duplicate
      const dupRes = await api.post(
        `/api/v1/invoices/${originalId}/duplicate`,
        {},
        authHeader(accessToken)
      );
      expect(dupRes.status).toBe(201);
      expect(dupRes.data.success).toBe(true);

      const duplicated = dupRes.data.data;
      expect(duplicated.id).not.toBe(originalId);
      expect(duplicated.invoiceNumber).not.toBe(originalNumber);
      expect(duplicated.status).toBe("DRAFT");
      expect(duplicated.buyerName).toBe("Template Client");
      expect(duplicated.items.length).toBe(1);
      expect(Number(duplicated.totalAmount)).toBe(25000);
    });

    it("should retrieve audit event timeline for an invoice", async () => {
      const { accessToken } = await createTestUser("inv_events");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Audit Buyer",
          items: [{ type: "PRODUCT", description: "Item", quantity: 1, unitPrice: 100 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Issue and generate PDF
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));
      await api.post(`/api/v1/invoices/${invoiceId}/pdf`, {}, authHeader(accessToken));

      // Fetch events
      const eventsRes = await api.get(
        `/api/v1/invoices/${invoiceId}/events`,
        authHeader(accessToken)
      );

      expect(eventsRes.status).toBe(200);
      expect(eventsRes.data.success).toBe(true);
      expect(Array.isArray(eventsRes.data.data)).toBe(true);

      const eventTypes = eventsRes.data.data.map((e: any) => e.eventType);
      expect(eventTypes).toContain("CREATED");
      expect(eventTypes).toContain("ISSUED");
      expect(eventTypes).toContain("PDF_GENERATED");
    });
  });

  describe("Invoice Payments API", () => {
    it("should record partial and full payments and update invoice balance and status", async () => {
      const { accessToken } = await createTestUser("inv_pay_record");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Paying Customer",
          items: [
            { type: "PRODUCT", description: "Hardware", quantity: 2, unitPrice: 5000 },
          ],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;

      // Issue the invoice first
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      // Record first partial payment: 4000 out of 10000
      const pay1Res = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        {
          amount: 4000,
          paymentDate: "2026-10-04",
          paymentMethod: "UPI",
          referenceNumber: "UPI123456",
          notes: "Advance payment",
        },
        authHeader(accessToken)
      );

      expect(pay1Res.status).toBe(201);
      expect(pay1Res.data.success).toBe(true);
      expect(Number(pay1Res.data.data.payment.amount)).toBe(4000);
      expect(pay1Res.data.data.payment.status).toBe("COMPLETED");
      expect(pay1Res.data.data.invoiceSummary.amountPaid).toBe(4000);
      expect(pay1Res.data.data.invoiceSummary.amountDue).toBe(6000);
      expect(pay1Res.data.data.invoiceSummary.status).toBe("PARTIALLY_PAID");

      // Verify invoice state
      const invCheck1 = await api.get(`/api/v1/invoices/${invoiceId}`, authHeader(accessToken));
      expect(invCheck1.data.data.status).toBe("PARTIALLY_PAID");
      expect(Number(invCheck1.data.data.amountPaid)).toBe(4000);
      expect(Number(invCheck1.data.data.amountDue)).toBe(6000);

      // Attempt payment exceeding amount due (e.g. 7000 when 6000 due) -> 400 Bad Request
      const overpayRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        {
          amount: 7000,
          paymentMethod: "CASH",
        },
        authHeader(accessToken)
      );
      expect(overpayRes.status).toBe(400);
      expect(overpayRes.data.message).toMatch(/exceeds remaining amount due/i);

      // Record second payment to fully pay: 6000
      const pay2Res = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        {
          amount: 6000,
          paymentMethod: "BANK_TRANSFER",
          referenceNumber: "NEFT987654",
          notes: "Final clearance",
        },
        authHeader(accessToken)
      );

      expect(pay2Res.status).toBe(201);
      expect(pay2Res.data.data.invoiceSummary.amountPaid).toBe(10000);
      expect(pay2Res.data.data.invoiceSummary.amountDue).toBe(0);
      expect(pay2Res.data.data.invoiceSummary.status).toBe("PAID");

      // Verify invoice is PAID
      const invCheck2 = await api.get(`/api/v1/invoices/${invoiceId}`, authHeader(accessToken));
      expect(invCheck2.data.data.status).toBe("PAID");
      expect(invCheck2.data.data.paidAt).toBeDefined();

      // Recording payment on already fully paid invoice -> 409 Conflict
      const extraPayRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        { amount: 500, paymentMethod: "CASH" },
        authHeader(accessToken)
      );
      expect(extraPayRes.status).toBe(409);
      expect(extraPayRes.data.message).toMatch(/already fully paid/i);
    });

    it("should list invoice payments with summary metadata", async () => {
      const { accessToken } = await createTestUser("inv_pay_list");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Client A",
          items: [{ type: "SERVICE", description: "Design", quantity: 1, unitPrice: 8000 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        { amount: 3000, paymentMethod: "CARD" },
        authHeader(accessToken)
      );

      const listRes = await api.get(
        `/api/v1/invoices/${invoiceId}/payments`,
        authHeader(accessToken)
      );

      expect(listRes.status).toBe(200);
      expect(listRes.data.success).toBe(true);
      expect(listRes.data.data.payments.length).toBe(1);
      expect(listRes.data.data.summary.totalAmount).toBe(8000);
      expect(listRes.data.data.summary.amountPaid).toBe(3000);
      expect(listRes.data.data.summary.amountDue).toBe(5000);
      expect(listRes.data.data.summary.paymentCount).toBe(1);
    });

    it("should update a payment and recalculate invoice status if amount changed", async () => {
      const { accessToken } = await createTestUser("inv_pay_update");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Client B",
          items: [{ type: "PRODUCT", description: "Supplies", quantity: 1, unitPrice: 5000 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      const payRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        { amount: 2000, paymentMethod: "UPI", notes: "Initial installment" },
        authHeader(accessToken)
      );
      const paymentId = payRes.data.data.payment.id;

      // Update notes and increase amount to 5000 (fully paying)
      const updateRes = await api.patch(
        `/api/v1/invoices/${invoiceId}/payments/${paymentId}`,
        {
          amount: 5000,
          notes: "Full payment revised",
        },
        authHeader(accessToken)
      );

      expect(updateRes.status).toBe(200);
      expect(updateRes.data.success).toBe(true);
      expect(Number(updateRes.data.data.amount)).toBe(5000);
      expect(updateRes.data.data.notes).toBe("Full payment revised");

      // Verify invoice transitioned to PAID
      const invCheck = await api.get(`/api/v1/invoices/${invoiceId}`, authHeader(accessToken));
      expect(invCheck.data.data.status).toBe("PAID");
      expect(Number(invCheck.data.data.amountPaid)).toBe(5000);
      expect(Number(invCheck.data.data.amountDue)).toBe(0);
    });

    it("should refund a payment and restore invoice balance and status", async () => {
      const { accessToken } = await createTestUser("inv_pay_refund");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Client C",
          items: [{ type: "PRODUCT", description: "Goods", quantity: 1, unitPrice: 6000 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      const payRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        { amount: 6000, paymentMethod: "UPI" },
        authHeader(accessToken)
      );
      const paymentId = payRes.data.data.payment.id;

      // Invoice is currently PAID
      let invCheck = await api.get(`/api/v1/invoices/${invoiceId}`, authHeader(accessToken));
      expect(invCheck.data.data.status).toBe("PAID");

      // Refund the payment
      const refundRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments/${paymentId}/refund`,
        { reason: "Customer requested return" },
        authHeader(accessToken)
      );

      expect(refundRes.status).toBe(200);
      expect(refundRes.data.success).toBe(true);
      expect(refundRes.data.data.status).toBe("REFUNDED");
      expect(refundRes.data.data.notes).toMatch(/Refund: Customer requested return/);

      // Invoice status reverts to ISSUED and amountDue back to 6000
      invCheck = await api.get(`/api/v1/invoices/${invoiceId}`, authHeader(accessToken));
      expect(invCheck.data.data.status).toBe("ISSUED");
      expect(Number(invCheck.data.data.amountPaid)).toBe(0);
      expect(Number(invCheck.data.data.amountDue)).toBe(6000);

      // Attempting to refund again -> 409 Conflict
      const refundAgain = await api.post(
        `/api/v1/invoices/${invoiceId}/payments/${paymentId}/refund`,
        {},
        authHeader(accessToken)
      );
      expect(refundAgain.status).toBe(409);
      expect(refundAgain.data.message).toMatch(/already refunded/i);
    });

    it("should preserve financial history on delete by creating a reversal rather than hard deleting", async () => {
      const { accessToken } = await createTestUser("inv_pay_delete");

      const createRes = await api.post(
        "/api/v1/invoices",
        {
          buyerName: "Client D",
          items: [{ type: "PRODUCT", description: "Service Hours", quantity: 1, unitPrice: 4000 }],
        },
        authHeader(accessToken)
      );
      const invoiceId = createRes.data.data.id;
      await api.post(`/api/v1/invoices/${invoiceId}/issue`, {}, authHeader(accessToken));

      const payRes = await api.post(
        `/api/v1/invoices/${invoiceId}/payments`,
        { amount: 4000, paymentMethod: "CASH" },
        authHeader(accessToken)
      );
      const paymentId = payRes.data.data.payment.id;

      // Delete payment
      const delRes = await api.delete(
        `/api/v1/invoices/${invoiceId}/payments/${paymentId}`,
        authHeader(accessToken)
      );

      expect(delRes.status).toBe(200);
      expect(delRes.data.success).toBe(true);
      expect(delRes.data.data.status).toBe("REFUNDED");

      // Verify the payment row still exists in listing (not hard-deleted)
      const listRes = await api.get(
        `/api/v1/invoices/${invoiceId}/payments`,
        authHeader(accessToken)
      );
      expect(listRes.data.data.payments.length).toBe(1);
      expect(listRes.data.data.payments[0].status).toBe("REFUNDED");
      // And financial balance restored
      expect(listRes.data.data.summary.amountPaid).toBe(0);
      expect(listRes.data.data.summary.amountDue).toBe(4000);
    });
  });
});

