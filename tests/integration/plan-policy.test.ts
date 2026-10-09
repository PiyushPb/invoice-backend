import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANS,
  getDefaultPlanDefinition,
  PlanFeatureKey,
} from "../../src/config/plans.config.js";
import { appConfig } from "../../src/config/app.config.js";

describe("Centralized Plan & App Configuration Engine", () => {
  describe("plans.config.ts", () => {
    it("should provide exact Free plan defaults (1 bank account, 1 upi id, no team invites)", () => {
      const freePlan = DEFAULT_PLANS["FREE"];
      expect(freePlan).toBeDefined();
      expect(freePlan.isFree).toBe(true);

      // Bank account quota
      expect(freePlan.features.BANK_ACCOUNTS.limit).toBe(1);
      expect(freePlan.features.BANK_ACCOUNTS.isUnlimited).toBe(false);
      expect(freePlan.features.BANK_ACCOUNTS.isEnabled).toBe(true);

      // UPI ID quota
      expect(freePlan.features.UPI_IDS.limit).toBe(1);
      expect(freePlan.features.UPI_IDS.isUnlimited).toBe(false);
      expect(freePlan.features.UPI_IDS.isEnabled).toBe(true);

      // Team invites disabled on Free tier
      expect(freePlan.features.TEAM_INVITES.isEnabled).toBe(false);
      expect(freePlan.features.TEAM_INVITES.limit).toBe(0);

      // Invoices and customers quotas
      expect(freePlan.features.INVOICES_LIFETIME.limit).toBe(50);
      expect(freePlan.features.CUSTOMERS_ACTIVE.limit).toBe(20);
      expect(freePlan.features.PRODUCTS_ACTIVE.limit).toBe(20);
    });

    it("should provide unlimited capabilities for PRO plan", () => {
      const proPlan = DEFAULT_PLANS["PRO"];
      expect(proPlan).toBeDefined();
      expect(proPlan.isFree).toBe(false);
      expect(proPlan.features.BANK_ACCOUNTS.isUnlimited).toBe(true);
      expect(proPlan.features.UPI_IDS.isUnlimited).toBe(true);
      expect(proPlan.features.TEAM_INVITES.isEnabled).toBe(true);
      expect(proPlan.features.TEAM_INVITES.isUnlimited).toBe(true);
    });

    it("should resolve fallback plan definition dynamically without throwing", () => {
      expect(getDefaultPlanDefinition("FREE").code).toBe("FREE");
      expect(getDefaultPlanDefinition("PRO").code).toBe("PRO");
      expect(getDefaultPlanDefinition("ENTERPRISE").code).toBe("ENTERPRISE");

      // Unknown or nullish plan codes cleanly fall back to FREE tier
      expect(getDefaultPlanDefinition(null).code).toBe("FREE");
      expect(getDefaultPlanDefinition(undefined).code).toBe("FREE");
      expect(getDefaultPlanDefinition("NON_EXISTENT_PLAN").code).toBe("FREE");
    });

    it("should have all standardized PlanFeatureKey entries", () => {
      expect(PlanFeatureKey.BANK_ACCOUNTS).toBe("BANK_ACCOUNTS");
      expect(PlanFeatureKey.UPI_IDS).toBe("UPI_IDS");
      expect(PlanFeatureKey.TEAM_INVITES).toBe("TEAM_INVITES");
      expect(PlanFeatureKey.INVOICES_LIFETIME).toBe("INVOICES_LIFETIME");
      expect(PlanFeatureKey.CUSTOMERS_ACTIVE).toBe("CUSTOMERS_ACTIVE");
      expect(PlanFeatureKey.PRODUCTS_ACTIVE).toBe("PRODUCTS_ACTIVE");
    });
  });

  describe("app.config.ts", () => {
    it("should export typed default business settings without loose fallbacks", () => {
      expect(appConfig.businessDefaults.currency).toBe("INR");
      expect(appConfig.businessDefaults.countryCode).toBe("IN");
      expect(appConfig.businessDefaults.country).toBe("India");
      expect(appConfig.businessDefaults.dueDays).toBe(7);
      expect(appConfig.businessDefaults.invoicePrefix).toBe("INV");
      expect(appConfig.businessDefaults.showBankDetails).toBe(true);
      expect(appConfig.businessDefaults.showPaymentDetails).toBe(true);
    });

    it("should export secure JWT default configuration", () => {
      expect(typeof appConfig.jwt.secret).toBe("string");
      expect(typeof appConfig.jwt.accessExpiresIn).toBe("string");
      expect(typeof appConfig.jwt.refreshExpiresIn).toBe("string");
    });
  });
});
