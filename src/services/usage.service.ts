import { prisma } from "../config/prisma.js";
import {
  BusinessMemberStatus,
  BusinessStatus,
  CustomerStatus,
  ProductStatus,
  SubscriptionStatus,
  UsageMetric,
} from "../generated/prisma/enums.js";
import {
  DEFAULT_PLANS,
  getDefaultPlanDefinition,
  PlanFeatureKey,
  type FeatureEntitlement,
  type PlanFeatureKeyType,
} from "../config/plans.config.js";
import { PlanPolicyService } from "./plan-policy.service.js";
import { NotFoundError } from "../utils/errors.js";

// ============================================================
// Types
// ============================================================

export interface UsageMetricItem {
  used: number;
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
}

export interface CurrentUsageResponse {
  invoices: UsageMetricItem;
  customers: UsageMetricItem;
  products: UsageMetricItem;
  bankAccounts: UsageMetricItem;
  teamMembers: UsageMetricItem;
}

export interface FeatureEntitlementItem {
  feature: PlanFeatureKeyType;
  limit: number | null;
  isUnlimited: boolean;
  isEnabled: boolean;
}

export interface EntitlementsResponse {
  plan: {
    code: string;
    name: string;
    isFree: boolean;
  };
  features: Record<PlanFeatureKeyType, FeatureEntitlementItem>;
  entitlements: FeatureEntitlementItem[];
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Resolves the active business membership for a user.
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
    },
  });

  if (membership === null) {
    throw new NotFoundError("No active business found for this user");
  }

  return membership;
}

function buildMetricItem(
  used: number,
  entitlement: FeatureEntitlement
): UsageMetricItem {
  if (entitlement.isUnlimited || entitlement.limit === Infinity) {
    return {
      used,
      limit: null,
      remaining: null,
      isUnlimited: true,
    };
  }

  const limit = entitlement.limit;
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    isUnlimited: false,
  };
}

// ============================================================
// UsageService
// ============================================================

export class UsageService {
  /**
   * GET /api/v1/usage
   * Computes the current real-time usage and remaining limits for:
   * - invoices
   * - customers
   * - products
   * - bankAccounts
   * - teamMembers
   */
  public static async getCurrentUsage(
    userId: string,
    targetBusinessId?: string
  ): Promise<CurrentUsageResponse> {
    const { businessId } = await resolveActiveMembership(
      userId,
      targetBusinessId
    );

    // Fetch live counts and entitlements in parallel
    const [
      invoiceCount,
      customerCount,
      productCount,
      bankAccountCount,
      teamMemberCount,
      invoiceEntitlement,
      customerEntitlement,
      productEntitlement,
      bankAccountEntitlement,
      teamInviteEntitlement,
    ] = await Promise.all([
      // Lifetime invoices created
      prisma.invoice.count({ where: { businessId } }),
      // Active customers
      prisma.customer.count({
        where: { businessId, status: CustomerStatus.ACTIVE },
      }),
      // Active products
      prisma.product.count({
        where: { businessId, status: ProductStatus.ACTIVE },
      }),
      // Configured bank accounts
      prisma.businessBankAccount.count({ where: { businessId } }),
      // Active team members
      prisma.businessMember.count({
        where: { businessId, status: BusinessMemberStatus.ACTIVE },
      }),
      // Feature entitlements
      PlanPolicyService.getFeatureEntitlement(
        businessId,
        PlanFeatureKey.INVOICES_LIFETIME
      ),
      PlanPolicyService.getFeatureEntitlement(
        businessId,
        PlanFeatureKey.CUSTOMERS_ACTIVE
      ),
      PlanPolicyService.getFeatureEntitlement(
        businessId,
        PlanFeatureKey.PRODUCTS_ACTIVE
      ),
      PlanPolicyService.getFeatureEntitlement(
        businessId,
        PlanFeatureKey.BANK_ACCOUNTS
      ),
      PlanPolicyService.getFeatureEntitlement(
        businessId,
        PlanFeatureKey.TEAM_INVITES
      ),
    ]);

    // Asynchronously keep UsageCounter table synchronized
    void Promise.all([
      prisma.usageCounter.upsert({
        where: {
          businessId_metric: {
            businessId,
            metric: UsageMetric.INVOICES_LIFETIME,
          },
        },
        update: { usedCount: BigInt(invoiceCount) },
        create: {
          businessId,
          metric: UsageMetric.INVOICES_LIFETIME,
          usedCount: BigInt(invoiceCount),
        },
      }),
      prisma.usageCounter.upsert({
        where: {
          businessId_metric: {
            businessId,
            metric: UsageMetric.CUSTOMERS_ACTIVE,
          },
        },
        update: { usedCount: BigInt(customerCount) },
        create: {
          businessId,
          metric: UsageMetric.CUSTOMERS_ACTIVE,
          usedCount: BigInt(customerCount),
        },
      }),
      prisma.usageCounter.upsert({
        where: {
          businessId_metric: {
            businessId,
            metric: UsageMetric.PRODUCTS_ACTIVE,
          },
        },
        update: { usedCount: BigInt(productCount) },
        create: {
          businessId,
          metric: UsageMetric.PRODUCTS_ACTIVE,
          usedCount: BigInt(productCount),
        },
      }),
    ]).catch(() => {
      // Ignore background counter sync failures so read calls never fail
    });

    return {
      invoices: buildMetricItem(invoiceCount, invoiceEntitlement),
      customers: buildMetricItem(customerCount, customerEntitlement),
      products: buildMetricItem(productCount, productEntitlement),
      bankAccounts: buildMetricItem(bankAccountCount, bankAccountEntitlement),
      teamMembers: buildMetricItem(teamMemberCount, teamInviteEntitlement),
    };
  }

  /**
   * GET /api/v1/entitlements
   * Returns informational plan entitlements for frontend capability gating.
   */
  public static async getEntitlements(
    userId: string,
    targetBusinessId?: string
  ): Promise<EntitlementsResponse> {
    const { businessId } = await resolveActiveMembership(
      userId,
      targetBusinessId
    );

    const activeSub = await prisma.subscription.findFirst({
      where: {
        businessId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        plan: true,
      },
    });

    const plan = activeSub?.plan ?? null;
    let planCode = plan?.code ?? "FREE";
    if (plan !== null && !plan.isFree && !(planCode.toUpperCase() in DEFAULT_PLANS)) {
      planCode = "PRO";
    }
    const defaultPlan = getDefaultPlanDefinition(planCode);

    const featureKeys: PlanFeatureKeyType[] = [
      PlanFeatureKey.INVOICES_LIFETIME,
      PlanFeatureKey.CUSTOMERS_ACTIVE,
      PlanFeatureKey.PRODUCTS_ACTIVE,
      PlanFeatureKey.BANK_ACCOUNTS,
      PlanFeatureKey.UPI_IDS,
      PlanFeatureKey.TEAM_INVITES,
    ];

    const entitlements = await Promise.all(
      featureKeys.map(async (feature) => {
        const ent = await PlanPolicyService.getFeatureEntitlement(
          businessId,
          feature
        );
        return {
          feature,
          limit: ent.isUnlimited || ent.limit === Infinity ? null : ent.limit,
          isUnlimited: ent.isUnlimited,
          isEnabled: ent.isEnabled,
        };
      })
    );

    const features = entitlements.reduce(
      (acc, item) => {
        acc[item.feature] = item;
        return acc;
      },
      {} as Record<PlanFeatureKeyType, FeatureEntitlementItem>
    );

    return {
      plan: {
        code: plan?.code ?? defaultPlan.code,
        name: plan?.name ?? defaultPlan.name,
        isFree: plan?.isFree ?? defaultPlan.isFree,
      },
      features,
      entitlements,
    };
  }
}
