import { Prisma } from "../generated/prisma/client.js";
import {
  BusinessMemberStatus,
  BusinessStatus,
  ProductStatus,
} from "../generated/prisma/enums.js";
import { prisma } from "../config/prisma.js";
import { PlanPolicyService } from "./plan-policy.service.js";
import { PlanFeatureKey } from "../config/plans.config.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "../validators/product.validator.js";

// ============================================================
// Constants
// ============================================================

const SORT_COLUMN_MAP: Record<
  NonNullable<ListProductsQuery["sort"]>,
  keyof Prisma.ProductOrderByWithRelationInput
> = {
  name: "name",
  unitPrice: "unitPrice",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

// ============================================================
// Internal helpers
// ============================================================

/**
 * Resolves the active business membership for a user.
 * Throws NotFoundError when no active membership is found.
 */
async function resolveActiveMembership(userId: string) {
  const membership = await prisma.businessMember.findFirst({
    where: {
      userId,
      status: BusinessMemberStatus.ACTIVE,
      business: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      businessId: true,
      role: true,
    },
  });

  if (membership === null) {
    throw new NotFoundError("No active business found for this user");
  }

  return membership;
}

/**
 * Ensures the product belongs to the given business.
 * Throws NotFoundError when the product does not exist or
 * does not belong to the business.
 */
async function resolveProduct(
  businessId: string,
  productId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;

  const product = await client.product.findFirst({
    where: { id: productId, businessId },
  });

  if (product === null) {
    throw new NotFoundError("Product not found");
  }

  return product;
}

// ============================================================
// ProductService
// ============================================================

export class ProductService {
  /**
   * Creates a new product/service for the user's active business.
   * Enforces PRODUCTS_ACTIVE plan quota inside a serialized
   * transaction with a row-level lock on the Business row to
   * prevent concurrent quota bypass.
   */
  public static async createProduct(
    userId: string,
    input: CreateProductInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    return prisma.$transaction(async (tx) => {
      // Lock the business row to prevent concurrent over-quota inserts
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const activeCount = await tx.product.count({
        where: { businessId, status: ProductStatus.ACTIVE },
      });

      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.PRODUCTS_ACTIVE,
        activeCount,
        "Your plan does not allow adding more products. Please upgrade to add unlimited products.",
        tx
      );

      return tx.product.create({
        data: {
          businessId,
          type: input.type,
          name: input.name,
          description: input.description,
          sku: input.sku,
          hsnCode: input.hsnCode,
          sacCode: input.sacCode,
          unit: input.unit ?? "unit",
          defaultQuantity: input.defaultQuantity ?? 1,
          unitPrice: input.unitPrice,
          currencyCode: input.currencyCode ?? "INR",
          defaultDiscountType: input.defaultDiscountType ?? "PERCENTAGE",
          defaultDiscountValue: input.defaultDiscountValue ?? 0,
          defaultTaxRate: input.defaultTaxRate,
          isTaxable: input.isTaxable ?? true,
        },
      });
    });
  }

  /**
   * Returns a paginated, filtered, and sorted list of products
   * belonging to the user's active business.
   */
  public static async listProducts(userId: string, query: ListProductsQuery) {
    const { businessId } = await resolveActiveMembership(userId);

    const { search, type, status, sort, order } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const statusFilter: ProductStatus | undefined =
      status === "active"
        ? ProductStatus.ACTIVE
        : status === "archived"
          ? ProductStatus.ARCHIVED
          : undefined;

    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(statusFilter !== undefined && { status: statusFilter }),
      ...(type !== undefined && { type }),
      ...(search !== undefined && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { hsnCode: { contains: search, mode: "insensitive" } },
          { sacCode: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const orderByField = SORT_COLUMN_MAP[sort ?? "createdAt"];
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [orderByField]: order ?? "desc",
    };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns a single product by ID, verifying business ownership.
   */
  public static async getProduct(userId: string, productId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    return resolveProduct(businessId, productId);
  }

  /**
   * Updates mutable fields on an existing product.
   */
  public static async updateProduct(
    userId: string,
    productId: string,
    input: UpdateProductInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveProduct(businessId, productId);

    return prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.hsnCode !== undefined && { hsnCode: input.hsnCode }),
        ...(input.sacCode !== undefined && { sacCode: input.sacCode }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.defaultQuantity !== undefined && {
          defaultQuantity: input.defaultQuantity,
        }),
        ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
        ...(input.currencyCode !== undefined && {
          currencyCode: input.currencyCode,
        }),
        ...(input.defaultDiscountType !== undefined && {
          defaultDiscountType: input.defaultDiscountType,
        }),
        ...(input.defaultDiscountValue !== undefined && {
          defaultDiscountValue: input.defaultDiscountValue,
        }),
        ...(input.defaultTaxRate !== undefined && {
          defaultTaxRate: input.defaultTaxRate,
        }),
        ...(input.isTaxable !== undefined && { isTaxable: input.isTaxable }),
      },
    });
  }

  /**
   * Soft-archives a product. It will no longer appear in the
   * active product list but its historical invoice references are preserved.
   */
  public static async archiveProduct(userId: string, productId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    const product = await resolveProduct(businessId, productId);

    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictError("Product is already archived");
    }

    return prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  /**
   * Restores a previously archived product back to ACTIVE status.
   * Re-enforces PRODUCTS_ACTIVE quota; the plan may no longer have capacity.
   */
  public static async restoreProduct(userId: string, productId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    const product = await resolveProduct(businessId, productId);

    if (product.status === ProductStatus.ACTIVE) {
      throw new ConflictError("Product is already active");
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const activeCount = await tx.product.count({
        where: { businessId, status: ProductStatus.ACTIVE },
      });

      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.PRODUCTS_ACTIVE,
        activeCount,
        "Your plan limit for active products has been reached. Archive another product or upgrade your plan.",
        tx
      );

      return tx.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE },
      });
    });
  }

  /**
   * Hard-deletes a product ONLY when no invoice line items reference it.
   *
   * Design: InvoiceItem.productId is nullable (onDelete: SetNull in schema).
   * We count referencing InvoiceItems and block deletion when any exist,
   * advising archiving instead. This protects invoice audit history.
   *
   * Restricted to OWNER and ADMIN roles.
   */
  public static async deleteProduct(userId: string, productId: string) {
    const { businessId, role } = await resolveActiveMembership(userId);

    if (role !== "OWNER" && role !== "ADMIN") {
      throw new ForbiddenError(
        "Only business owners and administrators can permanently delete products"
      );
    }

    await resolveProduct(businessId, productId);

    const invoiceItemCount = await prisma.invoiceItem.count({
      where: { productId },
    });

    if (invoiceItemCount > 0) {
      throw new ConflictError(
        `Cannot delete a product referenced by ${invoiceItemCount} invoice line item(s). Archive the product instead to preserve invoice history.`
      );
    }

    await prisma.product.delete({ where: { id: productId } });
  }
}
