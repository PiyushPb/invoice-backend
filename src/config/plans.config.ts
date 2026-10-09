export const PlanFeatureKey = {
  BANK_ACCOUNTS: "BANK_ACCOUNTS",
  UPI_IDS: "UPI_IDS",
  TEAM_INVITES: "TEAM_INVITES",
  INVOICES_LIFETIME: "INVOICES_LIFETIME",
  CUSTOMERS_ACTIVE: "CUSTOMERS_ACTIVE",
  PRODUCTS_ACTIVE: "PRODUCTS_ACTIVE",
} as const;

export type PlanFeatureKeyType =
  (typeof PlanFeatureKey)[keyof typeof PlanFeatureKey];

export interface FeatureEntitlement {
  limit: number;
  isUnlimited: boolean;
  isEnabled: boolean;
}

export interface PlanDefinition {
  code: string;
  name: string;
  isFree: boolean;
  features: Record<PlanFeatureKeyType, FeatureEntitlement>;
}

export const DEFAULT_PLANS: Record<string, PlanDefinition> = {
  FREE: {
    code: "FREE",
    name: "Free Starter Plan",
    isFree: true,
    features: {
      BANK_ACCOUNTS: { limit: 1, isUnlimited: false, isEnabled: true },
      UPI_IDS: { limit: 1, isUnlimited: false, isEnabled: true },
      TEAM_INVITES: { limit: 0, isUnlimited: false, isEnabled: false },
      INVOICES_LIFETIME: { limit: 50, isUnlimited: false, isEnabled: true },
      CUSTOMERS_ACTIVE: { limit: 20, isUnlimited: false, isEnabled: true },
      PRODUCTS_ACTIVE: { limit: 20, isUnlimited: false, isEnabled: true },
    },
  },
  PRO: {
    code: "PRO",
    name: "Professional Plan",
    isFree: false,
    features: {
      BANK_ACCOUNTS: { limit: Infinity, isUnlimited: true, isEnabled: true },
      UPI_IDS: { limit: Infinity, isUnlimited: true, isEnabled: true },
      TEAM_INVITES: { limit: Infinity, isUnlimited: true, isEnabled: true },
      INVOICES_LIFETIME: { limit: Infinity, isUnlimited: true, isEnabled: true },
      CUSTOMERS_ACTIVE: { limit: Infinity, isUnlimited: true, isEnabled: true },
      PRODUCTS_ACTIVE: { limit: Infinity, isUnlimited: true, isEnabled: true },
    },
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    name: "Enterprise Plan",
    isFree: false,
    features: {
      BANK_ACCOUNTS: { limit: Infinity, isUnlimited: true, isEnabled: true },
      UPI_IDS: { limit: Infinity, isUnlimited: true, isEnabled: true },
      TEAM_INVITES: { limit: Infinity, isUnlimited: true, isEnabled: true },
      INVOICES_LIFETIME: { limit: Infinity, isUnlimited: true, isEnabled: true },
      CUSTOMERS_ACTIVE: { limit: Infinity, isUnlimited: true, isEnabled: true },
      PRODUCTS_ACTIVE: { limit: Infinity, isUnlimited: true, isEnabled: true },
    },
  },
} as const;

/**
 * Returns the default fallback plan definition for a plan code.
 * Defaults to FREE plan if code is unknown.
 */
export function getDefaultPlanDefinition(
  planCode: string | null | undefined
): PlanDefinition {
  const normalized = (planCode ?? "FREE").trim().toUpperCase();
  const matched = DEFAULT_PLANS[normalized];
  if (matched !== undefined) {
    return matched;
  }
  return DEFAULT_PLANS["FREE"] as PlanDefinition;
}
