import { z } from "zod";
import {
  DiscountType,
  InvoiceDocumentType,
  InvoiceStatus,
  ProductType,
} from "../generated/prisma/enums.js";

// ============================================================
// Shared line item schema
// ============================================================

export const invoiceLineItemSchema = z.object({
  productId: z.string().uuid("Invalid productId UUID").nullable().optional(),
  type: z.nativeEnum(ProductType, {
    message: "type must be PRODUCT or SERVICE",
  }),
  description: z
    .string()
    .trim()
    .min(1, "Item description cannot be empty")
    .max(2000, "Item description cannot exceed 2000 characters"),
  sku: z.string().trim().max(100).nullable().optional(),
  hsnCode: z.string().trim().max(20).nullable().optional(),
  sacCode: z.string().trim().max(20).nullable().optional(),
  unit: z.string().trim().max(50).default("unit").optional(),
  quantity: z
    .number({ message: "Quantity must be a number" })
    .positive("Quantity must be greater than zero"),
  unitPrice: z
    .number({ message: "Unit price must be a number" })
    .min(0, "Unit price cannot be negative"),
  discountType: z
    .nativeEnum(DiscountType, {
      message: "Discount type must be PERCENTAGE or FIXED",
    })
    .default(DiscountType.PERCENTAGE)
    .optional(),
  discountValue: z
    .number({ message: "Discount value must be a number" })
    .min(0, "Discount value cannot be negative")
    .default(0)
    .optional(),
  taxRate: z
    .number({ message: "Tax rate must be a number" })
    .min(0, "Tax rate cannot be negative")
    .max(100, "Tax rate cannot exceed 100%")
    .default(0)
    .optional(),
  cessRate: z
    .number({ message: "Cess rate must be a number" })
    .min(0, "Cess rate cannot be negative")
    .max(100, "Cess rate cannot exceed 100%")
    .default(0)
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

// ============================================================
// Create Invoice
// POST /api/v1/invoices
// ============================================================

export const createInvoiceSchema = z
  .object({
    customerId: z.string().uuid("Invalid customerId UUID").nullable().optional(),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, "Invoice number cannot be empty")
      .max(50, "Invoice number cannot exceed 50 characters")
      .optional(),
    documentType: z
      .nativeEnum(InvoiceDocumentType, {
        message: "Invalid document type",
      })
      .default(InvoiceDocumentType.TAX_INVOICE)
      .optional(),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    currencyCode: z
      .string()
      .trim()
      .length(3, "Currency code must be 3 characters")
      .toUpperCase()
      .optional(),
    exchangeRate: z.number().positive().nullable().optional(),

    // Buyer details (can override customer defaults or supply guest info)
    buyerName: z.string().trim().min(1).max(255).optional(),
    buyerEmail: z.string().trim().email("Invalid buyer email").nullable().optional(),
    buyerPhone: z.string().trim().max(30).nullable().optional(),
    buyerGstin: z.string().trim().max(15).nullable().optional(),
    buyerPan: z.string().trim().max(10).nullable().optional(),
    buyerAddressSnapshot: z.record(z.string(), z.unknown()).optional(),
    shippingAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
    placeOfSupplyStateCode: z.string().trim().max(10).nullable().optional(),
    isReverseCharge: z.boolean().default(false).optional(),

    // Financial charges & adjustments
    shippingAmount: z.number().min(0, "Shipping cannot be negative").default(0).optional(),
    otherCharges: z.number().min(0, "Other charges cannot be negative").default(0).optional(),
    roundingAdjustment: z.number().default(0).optional(),

    // Text & Notes
    notes: z.string().trim().max(5000).nullable().optional(),
    terms: z.string().trim().max(5000).nullable().optional(),
    paymentInstructions: z.string().trim().max(5000).nullable().optional(),

    // Items
    items: z
      .array(invoiceLineItemSchema)
      .min(1, "Invoice must contain at least one line item"),
  })
  .refine(
    (data) => {
      // Must have either customerId or buyerName
      const hasCustomerId = data.customerId !== undefined && data.customerId !== null && data.customerId.length > 0;
      const hasBuyerName = data.buyerName !== undefined && data.buyerName !== null && data.buyerName.length > 0;
      return hasCustomerId || hasBuyerName;
    },
    {
      message: "Invoice must have either a customerId or an explicit buyerName",
      path: ["buyerName"],
    }
  );

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ============================================================
// Update Draft Invoice
// PATCH /api/v1/invoices/:invoiceId
// ============================================================

export const updateInvoiceDraftSchema = z.object({
  customerId: z.string().uuid("Invalid customerId UUID").nullable().optional(),
  documentType: z
    .nativeEnum(InvoiceDocumentType, {
      message: "Invalid document type",
    })
    .optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  currencyCode: z
    .string()
    .trim()
    .length(3, "Currency code must be 3 characters")
    .toUpperCase()
    .optional(),
  exchangeRate: z.number().positive().nullable().optional(),

  // Buyer details
  buyerName: z.string().trim().min(1).max(255).optional(),
  buyerEmail: z.string().trim().email("Invalid buyer email").nullable().optional(),
  buyerPhone: z.string().trim().max(30).nullable().optional(),
  buyerGstin: z.string().trim().max(15).nullable().optional(),
  buyerPan: z.string().trim().max(10).nullable().optional(),
  buyerAddressSnapshot: z.record(z.string(), z.unknown()).optional(),
  shippingAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  placeOfSupplyStateCode: z.string().trim().max(10).nullable().optional(),
  isReverseCharge: z.boolean().optional(),

  // Financial charges & adjustments
  shippingAmount: z.number().min(0, "Shipping cannot be negative").optional(),
  otherCharges: z.number().min(0, "Other charges cannot be negative").optional(),
  roundingAdjustment: z.number().optional(),

  // Text & Notes
  notes: z.string().trim().max(5000).nullable().optional(),
  terms: z.string().trim().max(5000).nullable().optional(),
  paymentInstructions: z.string().trim().max(5000).nullable().optional(),

  // Items (if updating line items, provide new full set of items)
  items: z
    .array(invoiceLineItemSchema)
    .min(1, "Invoice must contain at least one line item")
    .optional(),
});

export type UpdateInvoiceDraftInput = z.infer<typeof updateInvoiceDraftSchema>;

// ============================================================
// List Invoices Query
// GET /api/v1/invoices
// ============================================================

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20)
    .optional(),
  search: z.string().trim().max(255).optional(),
  status: z
    .nativeEnum(InvoiceStatus, {
      message: "Invalid invoice status",
    })
    .optional(),
  customerId: z.string().uuid("Invalid customerId UUID").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z
    .enum(["createdAt", "issueDate", "dueDate", "totalAmount", "invoiceNumber"], {
      message: "sort must be one of: createdAt, issueDate, dueDate, totalAmount, invoiceNumber",
    })
    .optional()
    .default("createdAt"),
  order: z
    .enum(["asc", "desc"], {
      message: "order must be 'asc' or 'desc'",
    })
    .optional()
    .default("desc"),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// ============================================================
// Route Param Schema
// ============================================================

export const invoiceIdParamSchema = z.object({
  invoiceId: z.string().uuid("invoiceId must be a valid UUID"),
});

export type InvoiceIdParam = z.infer<typeof invoiceIdParamSchema>;

// ============================================================
// Lifecycle Action Schemas
// ============================================================

export const sendInvoiceSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .email("Invalid recipient email")
    .optional(),
  subject: z.string().trim().max(255).optional(),
  message: z.string().trim().max(5000).optional(),
});

export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

