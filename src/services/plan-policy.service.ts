import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { SubscriptionStatus } from "../generated/prisma/enums.js";
import {
  DEFAULT_PLANS,
  getDefaultPlanDefinition,
  PlanFeatureKey,
  type FeatureEntitlement,
  type PlanFeatureKeyType,
} from "../config/plans.config.js";

export class PlanPolicyService {
  /**
   * Resolves the effective feature entitlement for a business based on its active plan.
   * Priority:
   * 1. Dynamic database PlanEntitlement record linked to the active plan.
   * 2. Fallback to Centralized Plan Catalog (plans.config.ts) by plan code.
   * 3. Fallback to FREE plan default if no subscription/plan exists.
   */
  public static async getFeatureEntitlement(
    businessId: string,
    feature: PlanFeatureKeyType,
    tx?: Prisma.TransactionClient
  ): Promise<FeatureEntitlement> {
    const client = tx ?? prisma;

    const activeSub = await client.subscription.findFirst({
      where: {
        businessId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        plan: {
          include: {
            entitlements: true,
          },
        },
      },
    });

    const plan = activeSub?.plan ?? null;
    let planCode = plan?.code ?? "FREE";
    if (plan !== null && !plan.isFree && !(planCode.toUpperCase() in DEFAULT_PLANS)) {
      planCode = "PRO";
    }
    const defaultPlan = getDefaultPlanDefinition(planCode);

    // If no plan found in database, return central default for FREE
    if (plan === null) {
      return defaultPlan.features[feature];
    }

    // Check if the feature is explicitly defined in DB entitlements
    const dbEntitlement = plan.entitlements.find((e) => e.feature === feature);
    if (dbEntitlement !== undefined) {
      let resolvedLimit = Infinity;
      if (!dbEntitlement.isUnlimited && dbEntitlement.limitValue !== null) {
        resolvedLimit = Number(dbEntitlement.limitValue);
      }

      return {
        limit: resolvedLimit,
        isUnlimited: dbEntitlement.isUnlimited,
        isEnabled: dbEntitlement.isEnabled,
      };
    }

    // Fall back to centralized plan definition catalog
    const fallbackFeature = defaultPlan.features[feature];
    if (fallbackFeature !== undefined) {
      return fallbackFeature;
    }

    return {
      limit: Infinity,
      isUnlimited: true,
      isEnabled: true,
    };
  }

  /**
   * Checks whether a business is currently allowed to add another unit of a feature.
   */
  public static async assertFeatureQuota(
    businessId: string,
    feature: PlanFeatureKeyType,
    currentCount: number,
    upgradeMessage: string,
    tx?: Prisma.TransactionClient
  ): Promise<FeatureEntitlement> {
    const entitlement = await PlanPolicyService.getFeatureEntitlement(
      businessId,
      feature,
      tx
    );

    if (!entitlement.isEnabled) {
      throw new Error(upgradeMessage);
    }

    if (!entitlement.isUnlimited && currentCount >= entitlement.limit) {
      throw new Error(upgradeMessage);
    }

    return entitlement;
  }

  /**
   * Helper to check whether a specific feature is enabled for the business.
   */
  public static async isFeatureEnabled(
    businessId: string,
    feature: PlanFeatureKeyType,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    const entitlement = await PlanPolicyService.getFeatureEntitlement(
      businessId,
      feature,
      tx
    );
    return entitlement.isEnabled;
  }
}
