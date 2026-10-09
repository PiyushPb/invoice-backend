import { z } from "zod";
import { DiscountType, ProductType } from "../generated/prisma/enums.js";

// ============================================================
// Shared field definitions
// ============================================================

const nameField = z
  .string()
  .trim()
  .min(1, "Product name cannot be empty")
  .max(255, "Product name cannot exceed 255 characters");

const descriptionField = z
  .string()
  .trim()
  .max(5000, "Description cannot exceed 5000 characters")
  .nullable()
  .optional();

const skuField = z
  .string()
  .trim()
  .max(100, "SKU cannot exceed 100 characters")
  .nullable()
  .optional();

const hsnCodeField = z
  .string()
  .trim()
  .max(20, "HSN code cannot exceed 20 characters")
  .nullable()
  .optional();

const sacCodeField = z
  .string()
  .trim()
  .max(20, "SAC code cannot exceed 20 characters")
  .nullable()
  .optional();

const unitField = z
  .string()
  .trim()
  .min(1, "Unit cannot be empty")
  .max(50, "Unit cannot exceed 50 characters")
  .optional();

const unitPriceField = z
  .number({ message: "Unit price must be a number" })
  .min(0, "Unit price cannot be negative")
  .max(9_999_999_999_999_999, "Unit price exceeds maximum value");

const defaultQuantityField = z
  .number({ message: "Default quantity must be a number" })
  .positive("Default quantity must be greater than zero")
  .max(9_999_999_999_999_999, "Default quantity exceeds maximum value")
  .optional();

const defaultDiscountValueField = z
  .number({ message: "Discount value must be a number" })
  .min(0, "Discount value cannot be negative")
  .max(9_999_999_999_999_999, "Discount value exceeds maximum value")
  .optional();

const defaultTaxRateField = z
  .number({ message: "Tax rate must be a number" })
  .min(0, "Tax rate cannot be negative")
  .max(100, "Tax rate cannot exceed 100%")
  .nullable()
  .optional();

// ============================================================
// Create Product
// POST /api/v1/products
// ============================================================

export const createProductSchema = z.object({
  type: z.nativeEnum(ProductType, {
    message: "Invalid product type; must be PRODUCT or SERVICE",
  }),
  name: nameField,
  description: descriptionField,
  sku: skuField,
  hsnCode: hsnCodeField,
  sacCode: sacCodeField,
  unit: unitField,
  defaultQuantity: defaultQuantityField,
  unitPrice: unitPriceField,
  currencyCode: z
    .string()
    .trim()
    .length(3, "Currency code must be exactly 3 characters")
    .toUpperCase()
    .optional(),
  defaultDiscountType: z
    .nativeEnum(DiscountType, {
      message: "Discount type must be PERCENTAGE or FIXED",
    })
    .optional(),
  defaultDiscountValue: defaultDiscountValueField,
  defaultTaxRate: defaultTaxRateField,
  isTaxable: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ============================================================
// Update Product
// PATCH /api/v1/products/:productId
// ============================================================

export const updateProductSchema = createProductSchema
  .omit({ type: true })
  .extend({
    type: z
      .nativeEnum(ProductType, {
        message: "Invalid product type; must be PRODUCT or SERVICE",
      })
      .optional(),
    unitPrice: unitPriceField.optional(),
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ============================================================
// List Products query
// GET /api/v1/products
// ============================================================

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20)
    .optional(),
  search: z.string().trim().max(255).optional(),
  type: z
    .nativeEnum(ProductType, {
      message: "type must be PRODUCT or SERVICE",
    })
    .optional(),
  status: z
    .enum(["active", "archived"], {
      message: "status must be 'active' or 'archived'",
    })
    .optional(),
  sort: z
    .enum(["name", "unitPrice", "createdAt", "updatedAt"], {
      message: "sort must be one of: name, unitPrice, createdAt, updatedAt",
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

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// ============================================================
// Route param schema
// ============================================================

export const productIdParamSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;
