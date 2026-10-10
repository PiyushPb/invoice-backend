import { Prisma } from "../generated/prisma/client.js";
import {
  BusinessMemberStatus,
  BusinessStatus,
  DiscountType,
  InvoiceEventType,
  InvoiceStatus,
} from "../generated/prisma/enums.js";
import { prisma } from "../config/prisma.js";
import { PlanPolicyService } from "./plan-policy.service.js";
import { PlanFeatureKey } from "../config/plans.config.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../utils/errors.js";
import type {
  CancelInvoiceInput,
  CreateInvoiceInput,
  InvoiceLineItemInput,
  ListInvoicesQuery,
  SendInvoiceInput,
  UpdateInvoiceDraftInput,
  VoidInvoiceInput,
} from "../validators/invoice.validator.js";

// ============================================================
// Constants & Helper Mappings
// ============================================================

const SORT_COLUMN_MAP: Record<
  NonNullable<ListInvoicesQuery["sort"]>,
  keyof Prisma.InvoiceOrderByWithRelationInput
> = {
  createdAt: "createdAt",
  issueDate: "issueDate",
  dueDate: "dueDate",
  totalAmount: "totalAmount",
  invoiceNumber: "invoiceNumber",
};

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Rounds a number to 4 decimal places for currency precision.
 */
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Derives the financial year string for a given date in YYYY-YY format.
 * (e.g., April 2026 -> "2026-27", Jan 2026 -> "2025-26")
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
  if (month >= 3) {
    const nextYearShort = String((year + 1) % 100).padStart(2, "0");
    return `${year}-${nextYearShort}`;
  } else {
    const prevYear = year - 1;
    const yearShort = String(year % 100).padStart(2, "0");
    return `${prevYear}-${yearShort}`;
  }
}

/**
 * Escapes text for PDF literal strings.
 */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Builds a valid, lightweight PDF 1.4 binary buffer.
 */
export function buildSimplePdf(lines: string[]): Buffer {
  const contentStream = [
    "BT",
    "/F1 14 Tf",
    "50 750 Td",
    `(${escapePdfText(lines[0] ?? "INVOICE")}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1).flatMap((line) => [
      "0 -18 Td",
      `(${escapePdfText(line)}) Tj`,
    ]),
    "ET",
  ].join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`
  );
  objects.push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream)} >>\nstream\n${contentStream}\nendstream\nendobj`
  );
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
  );

  let offset = 9; // length of "%PDF-1.4\n"
  const xrefEntries = ["0000000000 65535 f "];
  let body = "%PDF-1.4\n";

  for (let i = 0; i < objects.length; i++) {
    xrefEntries.push(String(offset).padStart(10, "0") + " 00000 n ");
    body += objects[i] + "\n";
    offset = Buffer.byteLength(body);
  }

  const xrefOffset = offset;
  body += `xref\n0 ${xrefEntries.length}\n` + xrefEntries.join("\n") + "\n";
  body += `trailer\n<< /Size ${xrefEntries.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body);
}


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
 * Computes line-item financials and aggregates invoice totals.
 */
function computeInvoiceFinancials(
  items: InvoiceLineItemInput[],
  sellerStateCode: string | null,
  placeOfSupplyStateCode: string | null,
  shippingAmountInput: number = 0,
  otherChargesInput: number = 0,
  roundingAdjustmentInput: number = 0
) {
  const isIntraState =
    sellerStateCode !== null &&
    placeOfSupplyStateCode !== null &&
    sellerStateCode === placeOfSupplyStateCode;

  let subtotal = 0;
  let discountTotal = 0;
  let taxableAmountTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let cessTotal = 0;

  const computedItems = items.map((item, index) => {
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    const gross = quantity * unitPrice;

    // Discount
    const discountType = item.discountType ?? DiscountType.PERCENTAGE;
    const discountValue = item.discountValue ?? 0;
    let discountAmount = 0;
    if (discountType === DiscountType.PERCENTAGE) {
      discountAmount = round4((gross * discountValue) / 100);
    } else {
      discountAmount = Math.min(gross, discountValue);
    }

    const taxableAmount = Math.max(0, round4(gross - discountAmount));

    // GST Tax
    const taxRate = item.taxRate ?? 0;
    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (taxRate > 0) {
      if (isIntraState) {
        cgstRate = round4(taxRate / 2);
        sgstRate = round4(taxRate / 2);
        cgstAmount = round4((taxableAmount * cgstRate) / 100);
        sgstAmount = round4((taxableAmount * sgstRate) / 100);
      } else {
        igstRate = taxRate;
        igstAmount = round4((taxableAmount * igstRate) / 100);
      }
    }

    // Cess
    const cessRate = item.cessRate ?? 0;
    const cessAmount = cessRate > 0 ? round4((taxableAmount * cessRate) / 100) : 0;

    const lineTotal = round4(
      taxableAmount + cgstAmount + sgstAmount + igstAmount + cessAmount
    );

    subtotal += gross;
    discountTotal += discountAmount;
    taxableAmountTotal += taxableAmount;
    cgstTotal += cgstAmount;
    sgstTotal += sgstAmount;
    igstTotal += igstAmount;
    cessTotal += cessAmount;

    return {
      productId: item.productId ?? null,
      type: item.type,
      description: item.description,
      sku: item.sku ?? null,
      hsnCode: item.hsnCode ?? null,
      sacCode: item.sacCode ?? null,
      unit: item.unit ?? "unit",
      quantity,
      unitPrice,
      discountType,
      discountValue,
      discountAmount,
      taxableAmount,
      taxRate,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      cessRate,
      cessAmount,
      lineTotal,
      sortOrder: item.sortOrder ?? index,
    };
  });

  const taxAmountTotal = round4(cgstTotal + sgstTotal + igstTotal + cessTotal);
  const totalAmount = round4(
    taxableAmountTotal +
      taxAmountTotal +
      shippingAmountInput +
      otherChargesInput +
      roundingAdjustmentInput
  );

  return {
    computedItems,
    totals: {
      subtotal: round4(subtotal),
      discountTotal: round4(discountTotal),
      taxableAmount: round4(taxableAmountTotal),
      cgstAmount: round4(cgstTotal),
      sgstAmount: round4(sgstTotal),
      igstAmount: round4(igstTotal),
      cessAmount: round4(cessTotal),
      taxAmount: taxAmountTotal,
      shippingAmount: shippingAmountInput,
      otherCharges: otherChargesInput,
      roundingAdjustment: roundingAdjustmentInput,
      totalAmount,
      amountDue: totalAmount,
    },
  };
}

// ============================================================
// InvoiceService
// ============================================================

export class InvoiceService {
  /**
   * Returns a paginated, filtered, and sorted list of invoices.
   */
  public static async listInvoices(userId: string, query: ListInvoicesQuery) {
    const { businessId } = await resolveActiveMembership(userId);

    const { search, status, customerId, from, to, sort, order } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      businessId,
      ...(status !== undefined && { status }),
      ...(customerId !== undefined && { customerId }),
      ...((from !== undefined || to !== undefined) && {
        issueDate: {
          ...(from !== undefined && { gte: from }),
          ...(to !== undefined && { lte: to }),
        },
      }),
      ...(search !== undefined && {
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { buyerName: { contains: search, mode: "insensitive" } },
          { buyerEmail: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const orderByField = SORT_COLUMN_MAP[sort ?? "createdAt"];
    const orderBy: Prisma.InvoiceOrderByWithRelationInput = {
      [orderByField]: order ?? "desc",
    };

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              email: true,
              phone: true,
            },
          },
          items: {
            orderBy: { sortOrder: "asc" },
          },
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

  /**
   * Retrieves a single invoice by ID, verifying tenant business ownership.
   */
  public static async getInvoice(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        customer: true,
        items: {
          orderBy: { sortOrder: "asc" },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
        },
        events: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    return invoice;
  }

  /**
   * Creates a new invoice.
   *
   * Enforces:
   * 1. 50 lifetime invoice limit for Free tier with SELECT ... FOR UPDATE row-level lock.
   * 2. Auto-generated sequence numbering per financial year (or validated custom invoiceNumber).
   * 3. Freezes seller snapshot and buyer snapshot at creation time for audit compliance.
   * 4. Calculates GST breakdown and line item totals.
   */
  public static async createInvoice(
    userId: string,
    input: CreateInvoiceInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    return prisma.$transaction(async (tx) => {
      // Row-level lock to prevent concurrent quota bypass
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const lifetimeCount = await tx.invoice.count({ where: { businessId } });

      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.INVOICES_LIFETIME,
        lifetimeCount,
        "Your plan limit for invoices (50) has been reached. Please upgrade to create unlimited invoices.",
        tx
      );

      // Fetch business seller snapshot data
      const business = await tx.business.findUnique({
        where: { id: businessId },
        include: {
          taxProfile: true,
          addresses: { where: { isPrimary: true } },
          settings: true,
        },
      });

      if (business === null) {
        throw new NotFoundError("Business profile not found");
      }

      const primarySellerAddress = business.addresses[0] ?? null;
      const sellerStateCode =
        business.taxProfile?.placeOfSupplyStateCode ??
        primarySellerAddress?.stateCode ??
        null;

      const sellerName = business.legalName ?? business.name;
      const sellerTaxName =
        business.taxProfile?.taxpayerName ?? business.legalName ?? business.name;
      const sellerGstin = business.taxProfile?.gstin ?? null;
      const sellerPan = business.taxProfile?.pan ?? null;

      const sellerAddressSnapshot: Prisma.InputJsonValue = {
        addressLine1: primarySellerAddress?.addressLine1 ?? "",
        addressLine2: primarySellerAddress?.addressLine2 ?? null,
        city: primarySellerAddress?.city ?? "",
        state: primarySellerAddress?.state ?? "",
        stateCode: primarySellerAddress?.stateCode ?? null,
        postalCode: primarySellerAddress?.postalCode ?? "",
        country: primarySellerAddress?.country ?? "India",
        countryCode: primarySellerAddress?.countryCode ?? "IN",
      };

      // Resolve buyer data & snapshots
      let buyerName = input.buyerName ?? "";
      let buyerEmail = input.buyerEmail ?? null;
      let buyerPhone = input.buyerPhone ?? null;
      let buyerGstin = input.buyerGstin ?? null;
      let buyerPan = input.buyerPan ?? null;
      let buyerAddressSnapshot: Prisma.InputJsonValue =
        (input.buyerAddressSnapshot as Prisma.InputJsonValue) ?? {};
      let shippingAddressSnapshot: Prisma.InputJsonValue | null =
        (input.shippingAddressSnapshot as Prisma.InputJsonValue) ?? null;
      let placeOfSupplyStateCode = input.placeOfSupplyStateCode ?? sellerStateCode;

      if (input.customerId !== undefined && input.customerId !== null) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, businessId },
          include: { addresses: true },
        });

        if (customer === null) {
          throw new NotFoundError("Customer not found");
        }

        const billingAddr =
          customer.addresses.find((a) => a.type === "BILLING" && a.isPrimary) ??
          customer.addresses.find((a) => a.type === "BILLING") ??
          customer.addresses[0] ??
          null;

        const shippingAddr =
          customer.addresses.find((a) => a.type === "SHIPPING" && a.isPrimary) ??
          customer.addresses.find((a) => a.type === "SHIPPING") ??
          billingAddr;

        if (buyerName.length === 0) {
          buyerName = customer.legalName ?? customer.displayName;
        }
        if (buyerEmail === null) {
          buyerEmail = customer.email;
        }
        if (buyerPhone === null) {
          buyerPhone = customer.phone;
        }
        if (buyerGstin === null) {
          buyerGstin = customer.gstin;
        }
        if (buyerPan === null) {
          buyerPan = customer.pan;
        }
        if (input.placeOfSupplyStateCode === undefined) {
          placeOfSupplyStateCode =
            customer.placeOfSupplyStateCode ??
            billingAddr?.stateCode ??
            sellerStateCode;
        }

        if (input.buyerAddressSnapshot === undefined && billingAddr !== null) {
          buyerAddressSnapshot = {
            addressLine1: billingAddr.addressLine1,
            addressLine2: billingAddr.addressLine2,
            city: billingAddr.city,
            state: billingAddr.state,
            stateCode: billingAddr.stateCode,
            postalCode: billingAddr.postalCode,
            country: billingAddr.country,
            countryCode: billingAddr.countryCode,
          };
        }

        if (
          input.shippingAddressSnapshot === undefined &&
          shippingAddr !== null
        ) {
          shippingAddressSnapshot = {
            addressLine1: shippingAddr.addressLine1,
            addressLine2: shippingAddr.addressLine2,
            city: shippingAddr.city,
            state: shippingAddr.state,
            stateCode: shippingAddr.stateCode,
            postalCode: shippingAddr.postalCode,
            country: shippingAddr.country,
            countryCode: shippingAddr.countryCode,
          };
        }
      }

      // Dates
      const issueDate = input.issueDate ?? new Date();
      const defaultDueDays = business.settings?.defaultDueDays ?? 7;
      const dueDate =
        input.dueDate !== undefined
          ? input.dueDate
          : new Date(issueDate.getTime() + defaultDueDays * 86400000);

      // Numbering & sequence
      const financialYear = getFinancialYear(issueDate);
      let invoiceNumber: string;

      if (input.invoiceNumber !== undefined && input.invoiceNumber.trim().length > 0) {
        invoiceNumber = input.invoiceNumber.trim();
        const existing = await tx.invoice.findUnique({
          where: {
            businessId_invoiceNumber: {
              businessId,
              invoiceNumber,
            },
          },
        });
        if (existing !== null) {
          throw new ConflictError(
            `Invoice number '${invoiceNumber}' already exists for this business`
          );
        }
      } else {
        const prefix = business.settings?.invoicePrefix ?? "INV";
        const startNumber = business.settings?.invoiceStartNumber
          ? BigInt(business.settings.invoiceStartNumber)
          : BigInt(1);

        const seq = await tx.invoiceSequence.upsert({
          where: {
            businessId_financialYear_prefix: {
              businessId,
              financialYear,
              prefix,
            },
          },
          create: {
            businessId,
            financialYear,
            prefix,
            nextNumber: startNumber + BigInt(1),
          },
          update: {
            nextNumber: {
              increment: BigInt(1),
            },
          },
        });

        const assignedNumber = Number(seq.nextNumber - BigInt(1));
        invoiceNumber = `${prefix}/${financialYear}/${String(assignedNumber).padStart(4, "0")}`;
      }

      // Compute item financials and totals
      const { computedItems, totals } = computeInvoiceFinancials(
        input.items,
        sellerStateCode,
        placeOfSupplyStateCode,
        input.shippingAmount ?? 0,
        input.otherCharges ?? 0,
        input.roundingAdjustment ?? 0
      );

      const invoice = await tx.invoice.create({
        data: {
          businessId,
          createdById: userId,
          customerId: input.customerId ?? null,
          invoiceNumber,
          financialYear,
          documentType: input.documentType,
          status: InvoiceStatus.DRAFT,
          issueDate,
          dueDate,
          currencyCode: input.currencyCode ?? business.currencyCode ?? "INR",
          exchangeRate: input.exchangeRate ?? null,

          // Seller snapshot
          sellerName,
          sellerTaxName,
          sellerGstin,
          sellerPan,
          sellerAddressSnapshot,

          // Buyer snapshot
          buyerName,
          buyerEmail,
          buyerPhone,
          buyerGstin,
          buyerPan,
          buyerAddressSnapshot,
          shippingAddressSnapshot: shippingAddressSnapshot ?? Prisma.DbNull,
          placeOfSupplyStateCode,
          isReverseCharge: input.isReverseCharge ?? false,

          // Financials
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          cessAmount: totals.cessAmount,
          taxAmount: totals.taxAmount,
          shippingAmount: totals.shippingAmount,
          otherCharges: totals.otherCharges,
          roundingAdjustment: totals.roundingAdjustment,
          totalAmount: totals.totalAmount,
          amountPaid: 0,
          amountDue: totals.amountDue,

          // Text & notes
          notes: input.notes ?? business.settings?.defaultNotes ?? null,
          terms: input.terms ?? business.settings?.defaultTerms ?? null,
          paymentInstructions: input.paymentInstructions ?? null,

          items: {
            create: computedItems,
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
          },
          customer: true,
        },
      });

      // Audit event
      await tx.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          businessId,
          eventType: InvoiceEventType.CREATED,
          actorUserId: userId,
          metadata: {
            invoiceNumber,
            totalAmount: totals.totalAmount,
          },
        },
      });

      return invoice;
    });
  }

  /**
   * Updates an existing DRAFT invoice.
   *
   * Strictly enforces draft immutability:
   * Throws ConflictError if the invoice has been issued, sent, paid, or cancelled.
   */
  public static async updateDraft(
    userId: string,
    invoiceId: string,
    input: UpdateInvoiceDraftInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { items: true },
    });

    if (existingInvoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    if (existingInvoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictError(
        `Only DRAFT invoices can be updated. Current status is '${existingInvoice.status}'. Issued financial documents cannot be edited.`
      );
    }

    return prisma.$transaction(async (tx) => {
      let totalsUpdate: Record<string, unknown> = {};

      if (input.items !== undefined && input.items.length > 0) {
        const sellerState =
          (existingInvoice.sellerAddressSnapshot as any)?.stateCode ?? null;
        const placeOfSupply =
          input.placeOfSupplyStateCode ??
          existingInvoice.placeOfSupplyStateCode ??
          null;

        const shippingAmount =
          input.shippingAmount ?? Number(existingInvoice.shippingAmount);
        const otherCharges =
          input.otherCharges ?? Number(existingInvoice.otherCharges);
        const roundingAdjustment =
          input.roundingAdjustment ?? Number(existingInvoice.roundingAdjustment);

        const { computedItems, totals } = computeInvoiceFinancials(
          input.items,
          sellerState,
          placeOfSupply,
          shippingAmount,
          otherCharges,
          roundingAdjustment
        );

        // Replace existing line items atomically
        await tx.invoiceItem.deleteMany({ where: { invoiceId } });
        await tx.invoiceItem.createMany({
          data: computedItems.map((item) => ({
            ...item,
            invoiceId,
          })),
        });

        totalsUpdate = {
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          cessAmount: totals.cessAmount,
          taxAmount: totals.taxAmount,
          shippingAmount: totals.shippingAmount,
          otherCharges: totals.otherCharges,
          roundingAdjustment: totals.roundingAdjustment,
          totalAmount: totals.totalAmount,
          amountDue: totals.amountDue,
        };
      } else if (
        input.shippingAmount !== undefined ||
        input.otherCharges !== undefined ||
        input.roundingAdjustment !== undefined
      ) {
        const shippingAmount =
          input.shippingAmount ?? Number(existingInvoice.shippingAmount);
        const otherCharges =
          input.otherCharges ?? Number(existingInvoice.otherCharges);
        const roundingAdjustment =
          input.roundingAdjustment ?? Number(existingInvoice.roundingAdjustment);

        const totalAmount = round4(
          Number(existingInvoice.taxableAmount) +
            Number(existingInvoice.taxAmount) +
            shippingAmount +
            otherCharges +
            roundingAdjustment
        );

        totalsUpdate = {
          shippingAmount,
          otherCharges,
          roundingAdjustment,
          totalAmount,
          amountDue: totalAmount,
        };
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          ...(input.documentType !== undefined && { documentType: input.documentType }),
          ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
          ...(input.exchangeRate !== undefined && { exchangeRate: input.exchangeRate }),
          ...(input.buyerName !== undefined && { buyerName: input.buyerName }),
          ...(input.buyerEmail !== undefined && { buyerEmail: input.buyerEmail }),
          ...(input.buyerPhone !== undefined && { buyerPhone: input.buyerPhone }),
          ...(input.buyerGstin !== undefined && { buyerGstin: input.buyerGstin }),
          ...(input.buyerPan !== undefined && { buyerPan: input.buyerPan }),
          ...(input.buyerAddressSnapshot !== undefined && {
            buyerAddressSnapshot: input.buyerAddressSnapshot as Prisma.InputJsonValue,
          }),
          ...(input.shippingAddressSnapshot !== undefined && {
            shippingAddressSnapshot:
              input.shippingAddressSnapshot === null
                ? Prisma.DbNull
                : (input.shippingAddressSnapshot as Prisma.InputJsonValue),
          }),
          ...(input.placeOfSupplyStateCode !== undefined && {
            placeOfSupplyStateCode: input.placeOfSupplyStateCode,
          }),
          ...(input.isReverseCharge !== undefined && {
            isReverseCharge: input.isReverseCharge,
          }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.terms !== undefined && { terms: input.terms }),
          ...(input.paymentInstructions !== undefined && {
            paymentInstructions: input.paymentInstructions,
          }),
          ...totalsUpdate,
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
          },
          customer: true,
        },
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId,
          businessId,
          eventType: InvoiceEventType.UPDATED,
          actorUserId: userId,
        },
      });

      return updatedInvoice;
    });
  }

  /**
   * Deletes a draft invoice.
   *
   * Strictly enforces immutability of issued financial documents:
   * Rejects deletion with ConflictError (409) if the invoice is not DRAFT,
   * or if any payment records exist.
   */
  public static async deleteDraft(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        payments: true,
      },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictError(
        `Cannot delete an issued financial document. Only DRAFT invoices can be deleted. Current status is '${invoice.status}'.`
      );
    }

    if (invoice.payments.length > 0) {
      throw new ConflictError(
        "Cannot delete invoice with existing payment records."
      );
    }

    await prisma.invoice.delete({
      where: { id: invoiceId },
    });
  }

  /**
   * Issues a DRAFT invoice as a legally binding document.
   *
   * 1. Validates invoice content (has line items, valid buyer name).
   * 2. Generates / locks sequential invoice number if not already official.
   * 3. Recalculates line item financials and invoice totals.
   * 4. Freezes fresh seller & buyer snapshot data.
   * 5. Sets status to ISSUED and sets issuedAt.
   * 6. Records an InvoiceEvent of type ISSUED.
   */
  public static async issueInvoice(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    return prisma.$transaction(async (tx) => {
      // Concurrency lock
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, businessId },
        include: {
          items: true,
          customer: { include: { addresses: true } },
          business: {
            include: {
              taxProfile: true,
              addresses: { where: { isPrimary: true } },
              settings: true,
            },
          },
        },
      });

      if (invoice === null) {
        throw new NotFoundError("Invoice not found");
      }

      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new ConflictError(
          `Only DRAFT invoices can be issued. Current status is '${invoice.status}'.`
        );
      }

      if (invoice.items.length === 0) {
        throw new BadRequestError("Cannot issue an invoice without any line items");
      }

      if (invoice.buyerName.trim().length === 0) {
        throw new BadRequestError("Cannot issue an invoice without a buyer name");
      }

      const business = invoice.business;
      const primarySellerAddress = business.addresses[0] ?? null;
      const sellerStateCode =
        business.taxProfile?.placeOfSupplyStateCode ??
        primarySellerAddress?.stateCode ??
        null;

      const sellerName = business.legalName ?? business.name;
      const sellerTaxName =
        business.taxProfile?.taxpayerName ?? business.legalName ?? business.name;
      const sellerGstin = business.taxProfile?.gstin ?? null;
      const sellerPan = business.taxProfile?.pan ?? null;

      const sellerAddressSnapshot: Prisma.InputJsonValue = {
        addressLine1: primarySellerAddress?.addressLine1 ?? "",
        addressLine2: primarySellerAddress?.addressLine2 ?? null,
        city: primarySellerAddress?.city ?? "",
        state: primarySellerAddress?.state ?? "",
        stateCode: primarySellerAddress?.stateCode ?? null,
        postalCode: primarySellerAddress?.postalCode ?? "",
        country: primarySellerAddress?.country ?? "India",
        countryCode: primarySellerAddress?.countryCode ?? "IN",
      };

      // Determine place of supply
      const placeOfSupplyStateCode =
        invoice.placeOfSupplyStateCode ?? sellerStateCode;

      // Check invoice number allocation:
      let finalInvoiceNumber = invoice.invoiceNumber;
      if (
        finalInvoiceNumber.startsWith("DRAFT-") ||
        finalInvoiceNumber.startsWith("TEMP-")
      ) {
        const financialYear = invoice.financialYear;
        const prefix = business.settings?.invoicePrefix ?? "INV";
        const startNumber = business.settings?.invoiceStartNumber
          ? BigInt(business.settings.invoiceStartNumber)
          : BigInt(1);

        const seq = await tx.invoiceSequence.upsert({
          where: {
            businessId_financialYear_prefix: {
              businessId,
              financialYear,
              prefix,
            },
          },
          create: {
            businessId,
            financialYear,
            prefix,
            nextNumber: startNumber + BigInt(1),
          },
          update: {
            nextNumber: {
              increment: BigInt(1),
            },
          },
        });

        const assignedNumber = Number(seq.nextNumber - BigInt(1));
        finalInvoiceNumber = `${prefix}/${financialYear}/${String(assignedNumber).padStart(4, "0")}`;
      }

      // Recompute line items and totals
      const itemsInput: InvoiceLineItemInput[] = invoice.items.map((item) => ({
        productId: item.productId,
        type: item.type,
        description: item.description,
        sku: item.sku,
        hsnCode: item.hsnCode,
        sacCode: item.sacCode,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountType: item.discountType,
        discountValue: Number(item.discountValue),
        taxRate: Number(item.taxRate),
        cessRate: Number(item.cessRate),
        sortOrder: item.sortOrder,
      }));

      const { computedItems, totals } = computeInvoiceFinancials(
        itemsInput,
        sellerStateCode,
        placeOfSupplyStateCode,
        Number(invoice.shippingAmount),
        Number(invoice.otherCharges),
        Number(invoice.roundingAdjustment)
      );

      // Replace line items with recomputed values
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoiceItem.createMany({
        data: computedItems.map((item) => ({
          ...item,
          invoiceId,
        })),
      });

      const issuedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.ISSUED,
          issuedAt: new Date(),
          invoiceNumber: finalInvoiceNumber,
          sellerName,
          sellerTaxName,
          sellerGstin,
          sellerPan,
          sellerAddressSnapshot,
          placeOfSupplyStateCode,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          cessAmount: totals.cessAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          amountDue: totals.amountDue,
        },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          customer: true,
        },
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId,
          businessId,
          eventType: InvoiceEventType.ISSUED,
          actorUserId: userId,
          metadata: {
            invoiceNumber: finalInvoiceNumber,
            totalAmount: totals.totalAmount,
            issuedAt: new Date(),
          },
        },
      });

      return issuedInvoice;
    });
  }

  /**
   * Dispatches/sends the invoice to the customer.
   */
  public static async sendInvoice(
    userId: string,
    invoiceId: string,
    input: SendInvoiceInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestError(
        "Cannot send a draft invoice. Please issue the invoice before sending."
      );
    }

    if (
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.VOID
    ) {
      throw new ConflictError("Cannot send a cancelled or void invoice.");
    }

    const recipientEmail = input.recipientEmail ?? invoice.buyerEmail;
    if (recipientEmail === null || recipientEmail.trim().length === 0) {
      throw new BadRequestError(
        "No recipient email specified for this invoice. Provide recipientEmail in request body or update invoice."
      );
    }

    const newStatus =
      invoice.status === InvoiceStatus.ISSUED
        ? InvoiceStatus.SENT
        : invoice.status;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        sentAt: new Date(),
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        customer: true,
      },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        businessId,
        eventType: InvoiceEventType.SENT,
        actorUserId: userId,
        metadata: {
          recipientEmail,
          subject: input.subject ?? `Invoice ${invoice.invoiceNumber}`,
          sentAt: new Date(),
        },
      },
    });

    return updatedInvoice;
  }

  /**
   * Generates or records PDF generation for an invoice.
   */
  public static async generatePdf(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    const pdfUrl = `/api/v1/invoices/${invoiceId}/pdf`;

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        businessId,
        eventType: InvoiceEventType.PDF_GENERATED,
        actorUserId: userId,
        metadata: { pdfUrl, generatedAt: new Date() },
      },
    });

    return { invoiceId, pdfUrl };
  }

  /**
   * Retrieves printable PDF binary buffer for an invoice.
   */
  public static async getPdf(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        customer: true,
      },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    const lines: string[] = [
      `TAX INVOICE: ${invoice.invoiceNumber}`,
      `Status: ${invoice.status} | Issue Date: ${invoice.issueDate.toISOString().slice(0, 10)}`,
      `Seller: ${invoice.sellerName} | GSTIN: ${invoice.sellerGstin ?? "N/A"}`,
      `Buyer: ${invoice.buyerName} | GSTIN: ${invoice.buyerGstin ?? "N/A"}`,
      "--------------------------------------------------",
      "ITEMS:",
      ...invoice.items.map(
        (item, idx) =>
          `${idx + 1}. ${item.description} (Qty: ${item.quantity} ${item.unit} @ ${item.unitPrice}) Total: ${item.lineTotal}`
      ),
      "--------------------------------------------------",
      `Subtotal: ${invoice.currencyCode} ${invoice.subtotal}`,
      `Tax: ${invoice.currencyCode} ${invoice.taxAmount} (CGST: ${invoice.cgstAmount}, SGST: ${invoice.sgstAmount}, IGST: ${invoice.igstAmount})`,
      `Total: ${invoice.currencyCode} ${invoice.totalAmount}`,
      `Amount Due: ${invoice.currencyCode} ${invoice.amountDue}`,
    ];

    const pdfBuffer = buildSimplePdf(lines);
    const sanitizedFilename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    return {
      pdfBuffer,
      filename: sanitizedFilename,
    };
  }

  /**
   * Cancels an issued or active invoice.
   */
  public static async cancelInvoice(
    userId: string,
    invoiceId: string,
    input: CancelInvoiceInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictError("Invoice is already cancelled.");
    }

    if (invoice.status === InvoiceStatus.VOID) {
      throw new ConflictError("Invoice is void and cannot be cancelled.");
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictError(
        "Paid invoices cannot be cancelled. Record a refund or issue a credit note instead."
      );
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        customer: true,
      },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        businessId,
        eventType: InvoiceEventType.CANCELLED,
        actorUserId: userId,
        metadata: {
          reason: input.reason ?? "Cancelled by user",
          cancelledAt: new Date(),
        },
      },
    });

    return updatedInvoice;
  }

  /**
   * Voids an invoice for audit compliance.
   */
  public static async voidInvoice(
    userId: string,
    invoiceId: string,
    input: VoidInvoiceInput
  ) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.VOID) {
      throw new ConflictError("Invoice is already void.");
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictError("Paid invoices cannot be voided.");
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.VOID,
        cancelledAt: new Date(),
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        customer: true,
      },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        businessId,
        eventType: InvoiceEventType.VOIDED,
        actorUserId: userId,
        metadata: {
          reason: input.reason ?? "Voided by user",
          voidedAt: new Date(),
        },
      },
    });

    return updatedInvoice;
  }

  /**
   * Duplicates an existing invoice into a brand new DRAFT invoice.
   * Generates a new invoice number and enforces plan quota limits.
   */
  public static async duplicateInvoice(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    return prisma.$transaction(async (tx) => {
      // Row-level lock for quota enforcement
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;

      const lifetimeCount = await tx.invoice.count({ where: { businessId } });
      await PlanPolicyService.assertFeatureQuota(
        businessId,
        PlanFeatureKey.INVOICES_LIFETIME,
        lifetimeCount,
        "Your plan limit for invoices (50) has been reached. Please upgrade to create unlimited invoices.",
        tx
      );

      const original = await tx.invoice.findFirst({
        where: { id: invoiceId, businessId },
        include: {
          items: true,
          business: { include: { settings: true } },
        },
      });

      if (original === null) {
        throw new NotFoundError("Invoice not found");
      }

      // Generate a brand new invoice number
      const now = new Date();
      const financialYear = getFinancialYear(now);
      const prefix = original.business.settings?.invoicePrefix ?? "INV";
      const startNumber = original.business.settings?.invoiceStartNumber
        ? BigInt(original.business.settings.invoiceStartNumber)
        : BigInt(1);

      const seq = await tx.invoiceSequence.upsert({
        where: {
          businessId_financialYear_prefix: {
            businessId,
            financialYear,
            prefix,
          },
        },
        create: {
          businessId,
          financialYear,
          prefix,
          nextNumber: startNumber + BigInt(1),
        },
        update: {
          nextNumber: {
            increment: BigInt(1),
          },
        },
      });

      const assignedNumber = Number(seq.nextNumber - BigInt(1));
      const newInvoiceNumber = `${prefix}/${financialYear}/${String(assignedNumber).padStart(4, "0")}`;

      const defaultDueDays = original.business.settings?.defaultDueDays ?? 7;
      const dueDate = new Date(now.getTime() + defaultDueDays * 86400000);

      const newInvoice = await tx.invoice.create({
        data: {
          businessId,
          createdById: userId,
          customerId: original.customerId,
          invoiceNumber: newInvoiceNumber,
          financialYear,
          documentType: original.documentType,
          status: InvoiceStatus.DRAFT,
          issueDate: now,
          dueDate,
          currencyCode: original.currencyCode,
          exchangeRate: original.exchangeRate,

          sellerName: original.sellerName,
          sellerTaxName: original.sellerTaxName,
          sellerGstin: original.sellerGstin,
          sellerPan: original.sellerPan,
          sellerAddressSnapshot: original.sellerAddressSnapshot as Prisma.InputJsonValue,

          buyerName: original.buyerName,
          buyerEmail: original.buyerEmail,
          buyerPhone: original.buyerPhone,
          buyerGstin: original.buyerGstin,
          buyerPan: original.buyerPan,
          buyerAddressSnapshot: original.buyerAddressSnapshot as Prisma.InputJsonValue,
          shippingAddressSnapshot:
            original.shippingAddressSnapshot === null
              ? Prisma.DbNull
              : (original.shippingAddressSnapshot as Prisma.InputJsonValue),
          placeOfSupplyStateCode: original.placeOfSupplyStateCode,
          isReverseCharge: original.isReverseCharge,

          subtotal: original.subtotal,
          discountTotal: original.discountTotal,
          taxableAmount: original.taxableAmount,
          cgstAmount: original.cgstAmount,
          sgstAmount: original.sgstAmount,
          igstAmount: original.igstAmount,
          cessAmount: original.cessAmount,
          taxAmount: original.taxAmount,
          shippingAmount: original.shippingAmount,
          otherCharges: original.otherCharges,
          roundingAdjustment: original.roundingAdjustment,
          totalAmount: original.totalAmount,
          amountPaid: 0,
          amountDue: original.totalAmount,

          notes: original.notes,
          terms: original.terms,
          paymentInstructions: original.paymentInstructions,

          items: {
            create: original.items.map((item) => ({
              productId: item.productId,
              type: item.type,
              description: item.description,
              sku: item.sku,
              hsnCode: item.hsnCode,
              sacCode: item.sacCode,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountType: item.discountType,
              discountValue: item.discountValue,
              discountAmount: item.discountAmount,
              taxableAmount: item.taxableAmount,
              taxRate: item.taxRate,
              cgstRate: item.cgstRate,
              cgstAmount: item.cgstAmount,
              sgstRate: item.sgstRate,
              sgstAmount: item.sgstAmount,
              igstRate: item.igstRate,
              igstAmount: item.igstAmount,
              cessRate: item.cessRate,
              cessAmount: item.cessAmount,
              lineTotal: item.lineTotal,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          customer: true,
        },
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId: newInvoice.id,
          businessId,
          eventType: InvoiceEventType.CREATED,
          actorUserId: userId,
          metadata: {
            duplicatedFrom: original.id,
            originalInvoiceNumber: original.invoiceNumber,
          },
        },
      });

      return newInvoice;
    });
  }

  /**
   * Returns audit event timeline for an invoice.
   */
  public static async getInvoiceEvents(userId: string, invoiceId: string) {
    const { businessId } = await resolveActiveMembership(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { id: true },
    });

    if (invoice === null) {
      throw new NotFoundError("Invoice not found");
    }

    return prisma.invoiceEvent.findMany({
      where: { invoiceId, businessId },
      orderBy: { createdAt: "asc" },
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}

