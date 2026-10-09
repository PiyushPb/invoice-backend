import { Prisma } from "../generated/prisma/client.js";
import {
  BusinessMemberStatus,
  BusinessStatus,
  CustomerStatus,
  InvoiceStatus,
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
  CreateCustomerInput,
  CreateCustomerAddressInput,
  CustomerInvoiceHistoryQuery,
  ListCustomersQuery,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from "../validators/customer.validator.js";

// ============================================================
// Constants
// ============================================================

/**
 * The sort column map translates public-facing sort keys to
 * actual Prisma orderBy field names.
 */
const SORT_COLUMN_MAP: Record<
  NonNullable<ListCustomersQuery["sort"]>,
  keyof Prisma.CustomerOrderByWithRelationInput
> = {
  name: "displayName",
  email: "email",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

/**
 * Invoice statuses that represent open / unpaid invoices.
 * Used to calculate outstanding amounts in the customer summary.
 */
const OUTSTANDING_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

/**
 * Invoice statuses that are excluded from financial summaries.
 * Draft, cancelled, and void invoices do not affect totals.
 */
const EXCLUDED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.CANCELLED,
  InvoiceStatus.VOID,
];

// ============================================================
// Internal helpers
// ============================================================

/**
 * Resolves the active business membership for a user.
 * Throws NotFoundError when no active membership is found.
 * All CustomerService public methods call this first.
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
 * Ensures the customer belongs to the given business.
 * Throws NotFoundError when the customer does not exist or
 * does not belong to the business.
 */
async function resolveCustomer(
  businessId: string,
  customerId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;

  const customer = await client.customer.findFirst({
    where: { id: customerId, businessId },
    include: { addresses: true },
  });

  if (customer === null) {
    throw new NotFoundError("Customer not found");
  }

  return customer;
}

// ============================================================
// CustomerService
// ============================================================

export class CustomerService {
  // ----------------------------------------------------------
  // Customer CRUD
  // ----------------------------------------------------------

  /**
   * Creates a new customer for the user's active business.
   * Enforces CUSTOMERS_ACTIVE plan quota inside a serialized
   * transaction with a row-level lock on the Business row to
   * prevent concurrent quota bypass.
   */
  public static async createCustomer(
    userId: string,
    input: CreateCustomerInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    return prisma.$transaction(async (tx) => {
      // Lock the business row to prevent concurrent over-quota inserts
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const activeCount = await tx.customer.count({
        where: { businessId, status: CustomerStatus.ACTIVE },
      });

      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.CUSTOMERS_ACTIVE,
        activeCount,
        "Your plan does not allow adding more customers. Please upgrade to add unlimited customers.",
        tx
      );

      return tx.customer.create({
        data: {
          businessId,
          customerType: input.customerType,
          displayName: input.displayName,
          legalName: input.legalName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          alternatePhone: input.alternatePhone,
          gstin: input.gstin,
          pan: input.pan,
          uin: input.uin,
          placeOfSupplyStateCode: input.placeOfSupplyStateCode,
          paymentTermsDays: input.paymentTermsDays,
          notes: input.notes,
        },
        include: { addresses: true },
      });
    });
  }

  /**
   * Returns a paginated, filtered, and sorted list of customers
   * belonging to the user's active business.
   */
  public static async listCustomers(
    userId: string,
    query: ListCustomersQuery
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    const { search, status, sort, order } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const statusFilter: CustomerStatus | undefined =
      status === "active"
        ? CustomerStatus.ACTIVE
        : status === "archived"
          ? CustomerStatus.ARCHIVED
          : undefined;

    const where: Prisma.CustomerWhereInput = {
      businessId,
      ...(statusFilter !== undefined && { status: statusFilter }),
      ...(search !== undefined && {
        OR: [
          { displayName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { gstin: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const orderByField = SORT_COLUMN_MAP[sort ?? "createdAt"];
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {
      [orderByField]: order ?? "desc",
    };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { addresses: true },
      }),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns a single customer with their addresses.
   */
  public static async getCustomer(userId: string, customerId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    return resolveCustomer(businessId, customerId);
  }

  /**
   * Updates mutable fields on an existing customer.
   */
  public static async updateCustomer(
    userId: string,
    customerId: string,
    input: UpdateCustomerInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    return prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.customerType !== undefined && {
          customerType: input.customerType,
        }),
        ...(input.displayName !== undefined && {
          displayName: input.displayName,
        }),
        ...(input.legalName !== undefined && { legalName: input.legalName }),
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.alternatePhone !== undefined && {
          alternatePhone: input.alternatePhone,
        }),
        ...(input.gstin !== undefined && { gstin: input.gstin }),
        ...(input.pan !== undefined && { pan: input.pan }),
        ...(input.uin !== undefined && { uin: input.uin }),
        ...(input.placeOfSupplyStateCode !== undefined && {
          placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        }),
        ...(input.paymentTermsDays !== undefined && {
          paymentTermsDays: input.paymentTermsDays,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { addresses: true },
    });
  }

  /**
   * Soft-archives a customer. Their invoice history is preserved.
   * Archived customers cannot receive new invoices.
   */
  public static async archiveCustomer(userId: string, customerId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    const customer = await resolveCustomer(businessId, customerId);

    if (customer.status === CustomerStatus.ARCHIVED) {
      throw new ConflictError("Customer is already archived");
    }

    return prisma.customer.update({
      where: { id: customerId },
      data: { status: CustomerStatus.ARCHIVED },
      include: { addresses: true },
    });
  }

  /**
   * Restores a previously archived customer back to ACTIVE status.
   * Re-enforces CUSTOMERS_ACTIVE quota; the plan may no longer have capacity.
   */
  public static async restoreCustomer(userId: string, customerId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    const customer = await resolveCustomer(businessId, customerId);

    if (customer.status === CustomerStatus.ACTIVE) {
      throw new ConflictError("Customer is already active");
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const activeCount = await tx.customer.count({
        where: { businessId, status: CustomerStatus.ACTIVE },
      });

      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.CUSTOMERS_ACTIVE,
        activeCount,
        "Your plan limit for active customers has been reached. Archive another customer or upgrade your plan.",
        tx
      );

      return tx.customer.update({
        where: { id: customerId },
        data: { status: CustomerStatus.ACTIVE },
        include: { addresses: true },
      });
    });
  }

  /**
   * Hard-deletes a customer ONLY when no financial documents reference them.
   *
   * Design: Invoice.customerId is nullable (onDelete: SetNull in the schema).
   * We count referencing invoices and block deletion if any exist, advising
   * archiving instead. This protects audit trail and financial integrity.
   */
  public static async deleteCustomer(userId: string, customerId: string) {
    const { businessId, role } = await resolveActiveMembership(userId);

    // Only OWNER / ADMIN can permanently delete customers
    if (
      role !== "OWNER" &&
      role !== "ADMIN"
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can permanently delete customers"
      );
    }

    await resolveCustomer(businessId, customerId);

    const invoiceCount = await prisma.invoice.count({
      where: { customerId, businessId },
    });

    if (invoiceCount > 0) {
      throw new ConflictError(
        `Cannot delete a customer with ${invoiceCount} associated invoice(s). Archive the customer instead to preserve financial history.`
      );
    }

    await prisma.customer.delete({ where: { id: customerId } });
  }

  // ----------------------------------------------------------
  // Customer Address CRUD
  // ----------------------------------------------------------

  /**
   * Adds an address to an existing customer.
   * If isPrimary is true the previous primary of the same type is demoted.
   */
  public static async createAddress(
    userId: string,
    customerId: string,
    input: CreateCustomerAddressInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    return prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await tx.customerAddress.updateMany({
          where: { customerId, type: input.type, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          customerId,
          type: input.type,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          district: input.district,
          state: input.state,
          stateCode: input.stateCode,
          postalCode: input.postalCode,
          country: input.country ?? "India",
          countryCode: input.countryCode ?? "IN",
          isPrimary: input.isPrimary ?? false,
        },
      });
    });
  }

  /**
   * Updates fields on an existing customer address.
   * If isPrimary is true the other primary of the same type is demoted.
   */
  public static async updateAddress(
    userId: string,
    customerId: string,
    addressId: string,
    input: UpdateCustomerAddressInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    const address = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });

    if (address === null) {
      throw new NotFoundError("Address not found");
    }

    return prisma.$transaction(async (tx) => {
      const effectiveType = input.type ?? address.type;

      if (input.isPrimary === true) {
        await tx.customerAddress.updateMany({
          where: {
            customerId,
            type: effectiveType,
            isPrimary: true,
            id: { not: addressId },
          },
          data: { isPrimary: false },
        });
      }

      return tx.customerAddress.update({
        where: { id: addressId },
        data: {
          ...(input.type !== undefined && { type: input.type }),
          ...(input.addressLine1 !== undefined && {
            addressLine1: input.addressLine1,
          }),
          ...(input.addressLine2 !== undefined && {
            addressLine2: input.addressLine2,
          }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.district !== undefined && { district: input.district }),
          ...(input.state !== undefined && { state: input.state }),
          ...(input.stateCode !== undefined && { stateCode: input.stateCode }),
          ...(input.postalCode !== undefined && {
            postalCode: input.postalCode,
          }),
          ...(input.country !== undefined && { country: input.country }),
          ...(input.countryCode !== undefined && {
            countryCode: input.countryCode,
          }),
          ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
        },
      });
    });
  }

  /**
   * Removes an address from a customer.
   */
  public static async deleteAddress(
    userId: string,
    customerId: string,
    addressId: string
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    const address = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });

    if (address === null) {
      throw new NotFoundError("Address not found");
    }

    await prisma.customerAddress.delete({ where: { id: addressId } });
  }

  // ----------------------------------------------------------
  // Customer Invoice History
  // ----------------------------------------------------------

  /**
   * Returns a paginated list of invoices linked to the customer.
   * Excludes draft, cancelled, and void invoices. Ordered by
   * issueDate descending.
   */
  public static async getInvoiceHistory(
    userId: string,
    customerId: string,
    query: CustomerInvoiceHistoryQuery
  ) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      businessId,
      customerId,
      status: { notIn: EXCLUDED_STATUSES },
    };

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { issueDate: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          documentType: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
          currencyCode: true,
        },
      }),
    ]);

    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ----------------------------------------------------------
  // Customer Summary
  // ----------------------------------------------------------

  /**
   * Computes financial summary metrics for a customer:
   *  - totalInvoices    : count of all invoices (including draft/cancelled for full history)
   *  - totalBilled      : sum of totalAmount on all non-excluded invoices
   *  - totalPaid        : sum of amountPaid on all non-excluded invoices
   *  - totalOutstanding : sum of amountDue on OUTSTANDING_STATUSES invoices
   *  - overdueAmount    : sum of amountDue on OVERDUE invoices specifically
   *
   * All monetary values are returned as strings to preserve Decimal precision.
   */
  public static async getSummary(userId: string, customerId: string) {
    const { businessId } = await resolveActiveMembership(userId);
    await resolveCustomer(businessId, customerId);

    const [billedAgg, outstandingAgg, overdueAgg, totalInvoices] =
      await Promise.all([
        // Billed & paid totals: all non-excluded invoices
        prisma.invoice.aggregate({
          where: {
            businessId,
            customerId,
            status: { notIn: EXCLUDED_STATUSES },
          },
          _sum: { totalAmount: true, amountPaid: true },
        }),

        // Outstanding: invoices in open/unpaid states
        prisma.invoice.aggregate({
          where: {
            businessId,
            customerId,
            status: { in: OUTSTANDING_STATUSES },
          },
          _sum: { amountDue: true },
        }),

        // Overdue amount specifically
        prisma.invoice.aggregate({
          where: {
            businessId,
            customerId,
            status: InvoiceStatus.OVERDUE,
          },
          _sum: { amountDue: true },
        }),

        // All-time invoice count (including cancelled/void for history)
        prisma.invoice.count({
          where: { businessId, customerId },
        }),
      ]);

    return {
      totalInvoices,
      totalBilled: (billedAgg._sum.totalAmount ?? 0).toString(),
      totalPaid: (billedAgg._sum.amountPaid ?? 0).toString(),
      totalOutstanding: (outstandingAgg._sum.amountDue ?? 0).toString(),
      overdueAmount: (overdueAgg._sum.amountDue ?? 0).toString(),
    };
  }
}
