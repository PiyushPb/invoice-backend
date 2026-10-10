import {
  BusinessMemberStatus,
  BusinessStatus,
  InvoiceStatus,
  PaymentStatus,
} from "../generated/prisma/enums.js";
import { prisma } from "../config/prisma.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";
import type { DashboardStatsQuery } from "../validators/dashboard.validator.js";

// ============================================================
// Constants & Helper Mappings
// ============================================================

const OUTSTANDING_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const EXCLUDED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.CANCELLED,
  InvoiceStatus.VOID,
];

/**
 * Rounds a number to 4 decimal places for currency precision.
 */
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Resolves the active business membership for a user.
 * Supports optional explicit targetBusinessId (from x-business-id header or token).
 */
async function resolveActiveMembership(
  userId: string,
  targetBusinessId?: string
) {
  const isTargetUuid =
    typeof targetBusinessId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      targetBusinessId
    );

  const membership = await prisma.businessMember.findFirst({
    where: {
      userId,
      ...(isTargetUuid ? { businessId: targetBusinessId } : {}),
      status: BusinessMemberStatus.ACTIVE,
      business: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      businessId: true,
      role: true,
      business: {
        select: {
          currencyCode: true,
        },
      },
    },
  });

  if (membership === null) {
    throw new NotFoundError("No active business found for this user");
  }

  return membership;
}

/**
 * Parses and normalizes date boundaries in UTC.
 */
function parseDateBoundary(dateInput: Date | string, isEndOfDay: boolean): Date {
  const d =
    typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput.getTime());
  if (isNaN(d.getTime())) {
    throw new BadRequestError("Invalid date format provided");
  }

  if (isEndOfDay) {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
    );
  } else {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
    );
  }
}

/**
 * Resolves period parameters into concrete UTC fromDate and toDate objects.
 */
function resolvePeriodDates(
  period?: string,
  from?: Date,
  to?: Date
): { fromDate: Date; toDate: Date; periodLabel: string; totalDays: number } {
  const now = new Date();

  if (from || to) {
    const fromDate = from
      ? parseDateBoundary(from, false)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? parseDateBoundary(to, true) : parseDateBoundary(now, true);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    return { fromDate, toDate, periodLabel: "custom", totalDays };
  }

  const normalized = (period ?? "30d").toLowerCase().trim();
  const toDate = parseDateBoundary(now, true);

  if (normalized === "today") {
    const fromDate = parseDateBoundary(now, false);
    return { fromDate, toDate, periodLabel: "today", totalDays: 1 };
  }

  if (normalized === "this_month") {
    const fromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    const totalDays = Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    return { fromDate, toDate, periodLabel: "this_month", totalDays };
  }

  if (normalized === "last_month") {
    const fromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
    );
    const lastDayOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)
    );
    const totalDays = Math.max(
      1,
      Math.ceil((lastDayOfMonth.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    return {
      fromDate,
      toDate: lastDayOfMonth,
      periodLabel: "last_month",
      totalDays,
    };
  }

  if (normalized === "all") {
    const fromDate = new Date(0);
    const totalDays = Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    return { fromDate, toDate, periodLabel: "all", totalDays };
  }

  const match = normalized.match(/^(\d+)([dmy])$/);
  if (match) {
    const val = parseInt(match[1]!, 10);
    const unit = match[2]!;
    let days = 30;
    if (unit === "d") days = val;
    else if (unit === "m") days = val * 30;
    else if (unit === "y") days = val * 365;

    const fromDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (days - 1),
        0,
        0,
        0,
        0
      )
    );
    return { fromDate, toDate, periodLabel: normalized, totalDays: days };
  }

  // Fallback default: 30d
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0, 0)
  );
  return { fromDate, toDate, periodLabel: "30d", totalDays: 30 };
}

// ============================================================
// DashboardService
// ============================================================

export class DashboardService {
  /**
   * GET /api/v1/dashboard
   * Returns a complete high-level dashboard overview:
   * - Total invoices
   * - Draft invoices
   * - Paid invoices
   * - Unpaid invoices
   * - Overdue invoices
   * - Total revenue (collected)
   * - Total outstanding
   * - Total billed
   * - Recent invoices (latest 5)
   * - Recent payments (latest 5)
   */
  public static async getOverview(
    userId: string,
    targetBusinessId?: string
  ) {
    const membership = await resolveActiveMembership(userId, targetBusinessId);
    const businessId = membership.businessId;
    const currencyCode = membership.business.currencyCode ?? "INR";

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );

    const [
      statusGroups,
      overdueCount,
      overdueAgg,
      recentInvoicesRaw,
      recentPaymentsRaw,
    ] = await Promise.all([
      // Status aggregation for counts and amounts
      prisma.invoice.groupBy({
        by: ["status"],
        where: { businessId },
        _count: { id: true },
        _sum: { totalAmount: true, amountPaid: true, amountDue: true },
      }),

      // Overdue invoices count: status OVERDUE or open status with dueDate in past
      prisma.invoice.count({
        where: {
          businessId,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            {
              status: {
                in: [
                  InvoiceStatus.ISSUED,
                  InvoiceStatus.SENT,
                  InvoiceStatus.VIEWED,
                  InvoiceStatus.PARTIALLY_PAID,
                ],
              },
              dueDate: { lt: todayStart },
            },
          ],
        },
      }),

      // Overdue balance aggregate
      prisma.invoice.aggregate({
        where: {
          businessId,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            {
              status: {
                in: [
                  InvoiceStatus.ISSUED,
                  InvoiceStatus.SENT,
                  InvoiceStatus.VIEWED,
                  InvoiceStatus.PARTIALLY_PAID,
                ],
              },
              dueDate: { lt: todayStart },
            },
          ],
        },
        _sum: { amountDue: true },
      }),

      // 5 most recent invoices
      prisma.invoice.findMany({
        where: { businessId },
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),

      // 5 most recent payments
      prisma.invoicePayment.findMany({
        where: { businessId },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        take: 5,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              buyerName: true,
              status: true,
              totalAmount: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    let totalInvoices = 0;
    let draftInvoices = 0;
    let paidInvoices = 0;
    let unpaidInvoices = 0;
    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalBilled = 0;

    const byStatus: Record<
      string,
      { count: number; totalAmount: number; amountPaid: number; amountDue: number }
    > = {};

    for (const group of statusGroups) {
      const count = group._count.id;
      const amount = Number(group._sum.totalAmount ?? 0);
      const paid = Number(group._sum.amountPaid ?? 0);
      const due = Number(group._sum.amountDue ?? 0);

      totalInvoices += count;

      byStatus[group.status] = {
        count,
        totalAmount: round4(amount),
        amountPaid: round4(paid),
        amountDue: round4(due),
      };

      if (group.status === InvoiceStatus.DRAFT) {
        draftInvoices += count;
      } else if (group.status === InvoiceStatus.PAID) {
        paidInvoices += count;
      }

      if (OUTSTANDING_STATUSES.includes(group.status)) {
        unpaidInvoices += count;
        totalOutstanding += due;
      }

      if (!EXCLUDED_STATUSES.includes(group.status)) {
        totalRevenue += paid;
        totalBilled += amount;
      }
    }

    const overdueInvoices = overdueCount;
    const overdueAmount = round4(Number(overdueAgg._sum.amountDue ?? 0));

    const recentInvoices = recentInvoicesRaw.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      documentType: inv.documentType,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currencyCode: inv.currencyCode,
      totalAmount: round4(Number(inv.totalAmount)),
      amountPaid: round4(Number(inv.amountPaid)),
      amountDue: round4(Number(inv.amountDue)),
      buyerName: inv.buyerName,
      buyerEmail: inv.buyerEmail,
      customer: inv.customer
        ? {
            id: inv.customer.id,
            displayName: inv.customer.displayName,
            email: inv.customer.email,
          }
        : null,
      createdAt: inv.createdAt,
    }));

    const recentPayments = recentPaymentsRaw.map((pay) => ({
      id: pay.id,
      invoiceId: pay.invoiceId,
      amount: round4(Number(pay.amount)),
      paymentDate: pay.paymentDate,
      paymentMethod: pay.paymentMethod,
      referenceNumber: pay.referenceNumber,
      notes: pay.notes,
      status: pay.status,
      invoice: {
        id: pay.invoice.id,
        invoiceNumber: pay.invoice.invoiceNumber,
        buyerName: pay.invoice.buyerName,
        status: pay.invoice.status,
        totalAmount: round4(Number(pay.invoice.totalAmount)),
      },
      createdBy: pay.createdBy
        ? {
            id: pay.createdBy.id,
            firstName: pay.createdBy.firstName,
            lastName: pay.createdBy.lastName,
            email: pay.createdBy.email,
          }
        : null,
      createdAt: pay.createdAt,
    }));

    return {
      currencyCode,
      totalInvoices,
      draftInvoices,
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      totalRevenue: round4(totalRevenue),
      totalOutstanding: round4(totalOutstanding),
      totalBilled: round4(totalBilled),
      totalPaid: round4(totalRevenue),
      overdueAmount,
      recentInvoices,
      recentPayments,
      byStatus,
    };
  }

  /**
   * GET /api/v1/dashboard/stats
   * Returns statistics and analytics over a specified period or custom date range:
   * Supports:
   *   ?period=30d
   *   or:
   *   ?from=2026-09-01&to=2026-10-01
   */
  public static async getStats(
    userId: string,
    query: DashboardStatsQuery,
    targetBusinessId?: string
  ) {
    const membership = await resolveActiveMembership(userId, targetBusinessId);
    const businessId = membership.businessId;
    const currencyCode = membership.business.currencyCode ?? "INR";

    const { fromDate, toDate, periodLabel, totalDays } = resolvePeriodDates(
      query.period,
      query.from,
      query.to
    );

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );

    // Run parallel queries scoped to date boundaries
    const [
      invoicesInPeriod,
      paymentsInPeriod,
      overdueCount,
      overdueAgg,
      paymentsByMethod,
    ] = await Promise.all([
      // Invoices issued within this period
      prisma.invoice.findMany({
        where: {
          businessId,
          issueDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
          customerId: true,
          buyerName: true,
        },
      }),

      // Payments recorded within this period
      prisma.invoicePayment.findMany({
        where: {
          businessId,
          status: PaymentStatus.COMPLETED,
          paymentDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
        },
      }),

      // Overdue invoices among those issued in this period
      prisma.invoice.count({
        where: {
          businessId,
          issueDate: {
            gte: fromDate,
            lte: toDate,
          },
          OR: [
            { status: InvoiceStatus.OVERDUE },
            {
              status: {
                in: [
                  InvoiceStatus.ISSUED,
                  InvoiceStatus.SENT,
                  InvoiceStatus.VIEWED,
                  InvoiceStatus.PARTIALLY_PAID,
                ],
              },
              dueDate: { lt: todayStart },
            },
          ],
        },
      }),

      // Overdue amount among those issued in this period
      prisma.invoice.aggregate({
        where: {
          businessId,
          issueDate: {
            gte: fromDate,
            lte: toDate,
          },
          OR: [
            { status: InvoiceStatus.OVERDUE },
            {
              status: {
                in: [
                  InvoiceStatus.ISSUED,
                  InvoiceStatus.SENT,
                  InvoiceStatus.VIEWED,
                  InvoiceStatus.PARTIALLY_PAID,
                ],
              },
              dueDate: { lt: todayStart },
            },
          ],
        },
        _sum: { amountDue: true },
      }),

      // Group payments by method in this period
      prisma.invoicePayment.groupBy({
        by: ["paymentMethod"],
        where: {
          businessId,
          status: PaymentStatus.COMPLETED,
          paymentDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    let totalInvoices = 0;
    let draftInvoices = 0;
    let paidInvoices = 0;
    let unpaidInvoices = 0;
    let totalBilled = 0;
    let totalOutstanding = 0;

    const byStatus: Record<
      string,
      { count: number; totalAmount: number; amountPaid: number; amountDue: number }
    > = {};

    // Customer aggregation for top customers in period
    const customerMap = new Map<
      string,
      { name: string; invoiceCount: number; billedAmount: number; paidAmount: number }
    >();

    for (const inv of invoicesInPeriod) {
      totalInvoices += 1;
      const amount = Number(inv.totalAmount);
      const paid = Number(inv.amountPaid);
      const due = Number(inv.amountDue);

      if (!byStatus[inv.status]) {
        byStatus[inv.status] = { count: 0, totalAmount: 0, amountPaid: 0, amountDue: 0 };
      }
      const st = byStatus[inv.status]!;
      st.count += 1;
      st.totalAmount = round4(st.totalAmount + amount);
      st.amountPaid = round4(st.amountPaid + paid);
      st.amountDue = round4(st.amountDue + due);

      if (inv.status === InvoiceStatus.DRAFT) {
        draftInvoices += 1;
      } else if (inv.status === InvoiceStatus.PAID) {
        paidInvoices += 1;
      }

      if (OUTSTANDING_STATUSES.includes(inv.status)) {
        unpaidInvoices += 1;
        totalOutstanding += due;
      }

      if (!EXCLUDED_STATUSES.includes(inv.status)) {
        totalBilled += amount;
      }

      const custKey = inv.customerId ?? inv.buyerName;
      const existing = customerMap.get(custKey) ?? {
        name: inv.buyerName,
        invoiceCount: 0,
        billedAmount: 0,
        paidAmount: 0,
      };
      existing.invoiceCount += 1;
      existing.billedAmount += amount;
      existing.paidAmount += paid;
      customerMap.set(custKey, existing);
    }

    // Revenue collected in this period from completed payments
    let totalRevenue = 0;
    for (const pay of paymentsInPeriod) {
      totalRevenue += Number(pay.amount);
    }

    const overdueInvoices = overdueCount;
    const overdueAmount = round4(Number(overdueAgg._sum.amountDue ?? 0));

    // Construct continuous timeline series for charts
    const useMonthlyBuckets = totalDays > 90;
    const seriesMap = new Map<
      string,
      {
        date: string;
        revenue: number;
        billed: number;
        invoiceCount: number;
        paymentCount: number;
      }
    >();

    const curr = new Date(fromDate.getTime());
    while (curr <= toDate) {
      const key = useMonthlyBuckets
        ? `${curr.getUTCFullYear()}-${String(curr.getUTCMonth() + 1).padStart(2, "0")}`
        : curr.toISOString().slice(0, 10);

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          date: key,
          revenue: 0,
          billed: 0,
          invoiceCount: 0,
          paymentCount: 0,
        });
      }

      if (useMonthlyBuckets) {
        curr.setUTCMonth(curr.getUTCMonth() + 1);
      } else {
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }

    // Populate timeline with invoices
    for (const inv of invoicesInPeriod) {
      const key = useMonthlyBuckets
        ? `${inv.issueDate.getUTCFullYear()}-${String(
            inv.issueDate.getUTCMonth() + 1
          ).padStart(2, "0")}`
        : inv.issueDate.toISOString().slice(0, 10);

      const bucket = seriesMap.get(key);
      if (bucket) {
        bucket.invoiceCount += 1;
        if (!EXCLUDED_STATUSES.includes(inv.status)) {
          bucket.billed = round4(bucket.billed + Number(inv.totalAmount));
        }
      }
    }

    // Populate timeline with payments
    for (const pay of paymentsInPeriod) {
      const key = useMonthlyBuckets
        ? `${pay.paymentDate.getUTCFullYear()}-${String(
            pay.paymentDate.getUTCMonth() + 1
          ).padStart(2, "0")}`
        : pay.paymentDate.toISOString().slice(0, 10);

      const bucket = seriesMap.get(key);
      if (bucket) {
        bucket.paymentCount += 1;
        bucket.revenue = round4(bucket.revenue + Number(pay.amount));
      }
    }

    const series = Array.from(seriesMap.values());

    // Payment methods breakdown
    const paymentMethods = paymentsByMethod.map((pm) => ({
      method: pm.paymentMethod,
      count: pm._count.id,
      totalAmount: round4(Number(pm._sum.amount ?? 0)),
    }));

    // Top 5 customers by billed amount in period
    const topCustomers = Array.from(customerMap.entries())
      .map(([key, data]) => ({
        id: key,
        name: data.name,
        invoiceCount: data.invoiceCount,
        billedAmount: round4(data.billedAmount),
        paidAmount: round4(data.paidAmount),
      }))
      .sort((a, b) => b.billedAmount - a.billedAmount)
      .slice(0, 5);

    const summary = {
      totalInvoices,
      draftInvoices,
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      totalRevenue: round4(totalRevenue),
      totalOutstanding: round4(totalOutstanding),
      totalBilled: round4(totalBilled),
      totalPaid: round4(totalRevenue),
      overdueAmount,
      paymentCount: paymentsInPeriod.length,
    };

    return {
      currencyCode,
      period: {
        period: periodLabel,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
        days: totalDays,
      },
      ...summary,
      summary,
      byStatus,
      series,
      paymentMethods,
      topCustomers,
    };
  }
}
