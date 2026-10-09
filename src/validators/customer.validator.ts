import { z } from "zod";
import { CustomerAddressType, CustomerType } from "../generated/prisma/enums.js";

// ============================================================
// Shared field definitions (reused across create / update)
// ============================================================

const displayNameField = z
  .string()
  .trim()
  .min(1, "Display name cannot be empty")
  .max(255, "Display name cannot exceed 255 characters");

const legalNameField = z
  .string()
  .trim()
  .max(255, "Legal name cannot exceed 255 characters")
  .nullable()
  .optional();

const firstNameField = z
  .string()
  .trim()
  .max(100, "First name cannot exceed 100 characters")
  .nullable()
  .optional();

const lastNameField = z
  .string()
  .trim()
  .max(100, "Last name cannot exceed 100 characters")
  .nullable()
  .optional();

const emailField = z
  .string()
  .trim()
  .email("Invalid email format")
  .max(320, "Email cannot exceed 320 characters")
  .nullable()
  .optional();

const phoneField = z
  .string()
  .trim()
  .max(30, "Phone cannot exceed 30 characters")
  .nullable()
  .optional();

const gstinField = z
  .string()
  .trim()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    "Invalid GSTIN format"
  )
  .nullable()
  .optional();

const panField = z
  .string()
  .trim()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format")
  .nullable()
  .optional();

const notesField = z
  .string()
  .trim()
  .max(2000, "Notes cannot exceed 2000 characters")
  .nullable()
  .optional();

// ============================================================
// Address sub-schema (reused in create/update customer body
// and standalone address endpoints)
// ============================================================

const addressBodyShape = {
  type: z.nativeEnum(CustomerAddressType, {
    message: "Invalid address type; must be BILLING or SHIPPING",
  }),
  addressLine1: z
    .string()
    .trim()
    .min(1, "Address line 1 cannot be empty")
    .max(255, "Address line 1 cannot exceed 255 characters"),
  addressLine2: z
    .string()
    .trim()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .nullable()
    .optional(),
  city: z
    .string()
    .trim()
    .min(1, "City cannot be empty")
    .max(100, "City cannot exceed 100 characters"),
  district: z
    .string()
    .trim()
    .max(100, "District cannot exceed 100 characters")
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .min(1, "State cannot be empty")
    .max(100, "State cannot exceed 100 characters"),
  stateCode: z
    .string()
    .trim()
    .max(10, "State code cannot exceed 10 characters")
    .nullable()
    .optional(),
  postalCode: z
    .string()
    .trim()
    .min(1, "Postal code cannot be empty")
    .max(20, "Postal code cannot exceed 20 characters"),
  country: z
    .string()
    .trim()
    .max(100, "Country cannot exceed 100 characters")
    .optional(),
  countryCode: z
    .string()
    .trim()
    .length(2, "Country code must be exactly 2 characters")
    .toUpperCase()
    .optional(),
  isPrimary: z.boolean().optional(),
};

// ============================================================
// Create Customer
// POST /api/v1/customers
// ============================================================

export const createCustomerSchema = z.object({
  customerType: z.nativeEnum(CustomerType, {
    message: "Invalid customer type; must be INDIVIDUAL or BUSINESS",
  }),
  displayName: displayNameField,
  legalName: legalNameField,
  firstName: firstNameField,
  lastName: lastNameField,
  email: emailField,
  phone: phoneField,
  alternatePhone: phoneField,
  gstin: gstinField,
  pan: panField,
  uin: z
    .string()
    .trim()
    .max(50, "UIN cannot exceed 50 characters")
    .nullable()
    .optional(),
  placeOfSupplyStateCode: z
    .string()
    .trim()
    .max(10, "State code cannot exceed 10 characters")
    .nullable()
    .optional(),
  paymentTermsDays: z
    .number()
    .int("Payment terms must be a whole number of days")
    .min(0, "Payment terms cannot be negative")
    .max(365, "Payment terms cannot exceed 365 days")
    .nullable()
    .optional(),
  notes: notesField,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ============================================================
// Update Customer
// PATCH /api/v1/customers/:customerId
// ============================================================

export const updateCustomerSchema = createCustomerSchema.partial();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ============================================================
// List Customers query
// GET /api/v1/customers
// ============================================================

export const listCustomersQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, "Page must be at least 1")
    .default(1)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20)
    .optional(),
  search: z.string().trim().max(255).optional(),
  status: z
    .enum(["active", "archived"], {
      message: "Status must be 'active' or 'archived'",
    })
    .optional(),
  sort: z
    .enum(["name", "email", "createdAt", "updatedAt"], {
      message: "sort must be one of: name, email, createdAt, updatedAt",
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

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

// ============================================================
// Route param schemas
// ============================================================

export const customerIdParamSchema = z.object({
  customerId: z.string().uuid("customerId must be a valid UUID"),
});

export const addressIdParamSchema = z.object({
  customerId: z.string().uuid("customerId must be a valid UUID"),
  addressId: z.string().uuid("addressId must be a valid UUID"),
});

export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
export type CustomerAddressIdParam = z.infer<typeof addressIdParamSchema>;

// ============================================================
// Create CustomerAddress
// POST /api/v1/customers/:customerId/addresses
// ============================================================

export const createCustomerAddressSchema = z.object(addressBodyShape);

export type CreateCustomerAddressInput = z.infer<
  typeof createCustomerAddressSchema
>;

// ============================================================
// Update CustomerAddress
// PATCH /api/v1/customers/:customerId/addresses/:addressId
// ============================================================

export const updateCustomerAddressSchema = z
  .object({
    ...addressBodyShape,
    type: z
      .nativeEnum(CustomerAddressType, {
        message: "Invalid address type; must be BILLING or SHIPPING",
      })
      .optional(),
    addressLine1: z
      .string()
      .trim()
      .min(1, "Address line 1 cannot be empty")
      .max(255, "Address line 1 cannot exceed 255 characters")
      .optional(),
    city: z
      .string()
      .trim()
      .min(1, "City cannot be empty")
      .max(100, "City cannot exceed 100 characters")
      .optional(),
    state: z
      .string()
      .trim()
      .min(1, "State cannot be empty")
      .max(100, "State cannot exceed 100 characters")
      .optional(),
    postalCode: z
      .string()
      .trim()
      .min(1, "Postal code cannot be empty")
      .max(20, "Postal code cannot exceed 20 characters")
      .optional(),
  })
  .partial();

export type UpdateCustomerAddressInput = z.infer<
  typeof updateCustomerAddressSchema
>;

// ============================================================
// Customer Invoice History query
// GET /api/v1/customers/:customerId/invoices
// ============================================================

export const customerInvoiceHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type CustomerInvoiceHistoryQuery = z.infer<
  typeof customerInvoiceHistoryQuerySchema
>;
