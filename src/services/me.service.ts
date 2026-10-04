import { prisma } from "../config/prisma.js";
import {
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  SubscriptionStatus,
  UserStatus,
} from "../generated/prisma/enums.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";

export interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  preferences: {
    language: string;
    timezone: string;
    dateFormat: string;
    numberFormat: string;
    emailNotifications: boolean;
    paymentNotifications: boolean;
    marketingEmails: boolean;
  } | null;
}

export interface BusinessResponse {
  id: string;
  name: string;
  legalName: string | null;
  tradeName: string | null;
  businessType: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  status: string;
  settings: {
    invoicePrefix: string;
    invoiceStartNumber: string;
    defaultDueDays: number;
    defaultCurrency: string;
    defaultTaxInclusive: boolean;
    showLogo: boolean;
    showBankDetails: boolean;
    showPaymentDetails: boolean;
  } | null;
  taxProfile: {
    taxCountry: string;
    taxRegistered: boolean;
    defaultTaxMode: string;
    gstin: string | null;
    pan: string | null;
  } | null;
}

export interface SubscriptionResponse {
  id: string;
  status: string;
  planCode: string;
  planName: string;
  description: string | null;
  price: number;
  currencyCode: string;
  billingInterval: string;
  isFree: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface EntitlementResponse {
  feature: string;
  limit: number | null;
  isUnlimited: boolean;
  isEnabled: boolean;
}

export interface UsageResponse {
  metric: string;
  used: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface MeResponseData {
  user: UserProfileResponse;
  business: BusinessResponse | null;
  role: string | null;
  subscription: SubscriptionResponse | null;
  entitlements: EntitlementResponse[];
  usage: UsageResponse[];
}

export class MeService {
  /**
   * High-performance workspace profile query
   * Executes optimized, parallel indexed queries to resolve full workspace context
   */
  public static async getMe(
    userId: string,
    targetBusinessId?: string
  ): Promise<MeResponseData> {
    const isTargetUuid =
      targetBusinessId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        targetBusinessId
      );

    // Parallel execution: fetch user profile & active business membership concurrently
    const [user, membership] = await Promise.all([
      // 1. User & Preferences
      prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          profile: {
            select: {
              language: true,
              timezone: true,
              dateFormat: true,
              numberFormat: true,
              emailNotifications: true,
              paymentNotifications: true,
              marketingEmails: true,
            },
          },
        },
      }),

      // 2. Active Business Membership + Settings + Active Subscription + Entitlements + Usage
      prisma.businessMember.findFirst({
        where: {
          userId,
          ...(isTargetUuid ? { businessId: targetBusinessId } : {}),
          status: BusinessMemberStatus.ACTIVE,
          business: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
          },
        },
        include: {
          business: {
            include: {
              settings: true,
              taxProfile: true,
              plans: {
                where: {
                  status: SubscriptionStatus.ACTIVE,
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
                include: {
                  plan: {
                    include: {
                      entitlements: true,
                    },
                  },
                },
              },
              usageCounters: true,
            },
          },
        },
        orderBy: [
          // Prioritize OWNER, then ADMIN, then oldest membership
          { role: "asc" },
          { joinedAt: "asc" },
        ],
      }),
    ]);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    const business = membership?.business || null;
    const activeSub = business?.plans?.[0] || null;
    const plan = activeSub?.plan || null;

    // Transform entitlements with BigInt -> Number safe conversion
    const entitlements: EntitlementResponse[] = plan?.entitlements
      ? plan.entitlements.map((e) => ({
          feature: e.feature,
          limit: e.isUnlimited
            ? null
            : e.limitValue !== null
            ? Number(e.limitValue)
            : null,
          isUnlimited: e.isUnlimited,
          isEnabled: e.isEnabled,
        }))
      : [];

    // Transform usage counters with BigInt -> Number safe conversion
    const usage: UsageResponse[] = business?.usageCounters
      ? business.usageCounters.map((u) => ({
          metric: u.metric,
          used: Number(u.usedCount),
          periodStart: u.periodStart,
          periodEnd: u.periodEnd,
        }))
      : [];

    // Format subscription
    const subscription: SubscriptionResponse | null =
      activeSub && plan
        ? {
            id: activeSub.id,
            status: activeSub.status,
            planCode: plan.code,
            planName: plan.name,
            description: plan.description,
            price: Number(plan.price),
            currencyCode: plan.currencyCode,
            billingInterval: plan.billingInterval,
            isFree: plan.isFree,
            currentPeriodStart: activeSub.currentPeriodStart,
            currentPeriodEnd: activeSub.currentPeriodEnd,
            cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
          }
        : null;

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        preferences: user.profile,
      },
      business: business
        ? {
            id: business.id,
            name: business.name,
            legalName: business.legalName,
            tradeName: business.tradeName,
            businessType: business.businessType,
            industry: business.industry,
            email: business.email,
            phone: business.phone,
            website: business.website,
            logoUrl: business.logoUrl,
            countryCode: business.countryCode,
            currencyCode: business.currencyCode,
            timezone: business.timezone,
            status: business.status,
            settings: business.settings
              ? {
                  invoicePrefix: business.settings.invoicePrefix,
                  invoiceStartNumber:
                    business.settings.invoiceStartNumber.toString(),
                  defaultDueDays: business.settings.defaultDueDays,
                  defaultCurrency: business.settings.defaultCurrency,
                  defaultTaxInclusive: business.settings.defaultTaxInclusive,
                  showLogo: business.settings.showLogo,
                  showBankDetails: business.settings.showBankDetails,
                  showPaymentDetails: business.settings.showPaymentDetails,
                }
              : null,
            taxProfile: business.taxProfile
              ? {
                  taxCountry: business.taxProfile.taxCountry,
                  taxRegistered: business.taxProfile.taxRegistered,
                  defaultTaxMode: business.taxProfile.defaultTaxMode,
                  gstin: business.taxProfile.gstin,
                  pan: business.taxProfile.pan,
                }
              : null,
          }
        : null,
      role: membership?.role || null,
      subscription,
      entitlements,
      usage,
    };
  }
}
