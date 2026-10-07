import { prisma } from "../config/prisma.js";
import {
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  SubscriptionStatus,
  UserStatus,
} from "../generated/prisma/enums.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";
import { comparePassword } from "../utils/password.utils.js";
import type {
  DeleteAccountInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from "../validators/me.validator.js";

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

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

export interface UpdatedProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  updatedAt: Date;
}

export interface UserPreferencesResponse {
  language: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  emailNotifications: boolean;
  paymentNotifications: boolean;
  marketingEmails: boolean;
  updatedAt: Date;
}

export interface DeleteAccountResponse {
  status: string;
  deletedAt: Date;
  retentionPeriodDays: number;
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
        preferences: user.profile || {
          language: "en-IN",
          timezone: "Asia/Kolkata",
          dateFormat: "DD/MM/YYYY",
          numberFormat: "en-IN",
          emailNotifications: true,
          paymentNotifications: true,
          marketingEmails: false,
        },
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

  /**
   * Update personal profile (PATCH /api/v1/me)
   * Updates firstName, lastName, phone with validation and audit logging
   */
  public static async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    context?: RequestContext
  ): Promise<UpdatedProfileResponse> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    const dataToUpdate: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
    } = {};

    if (input.firstName !== undefined) dataToUpdate.firstName = input.firstName;
    if (input.lastName !== undefined) dataToUpdate.lastName = input.lastName;
    if (input.phone !== undefined) dataToUpdate.phone = input.phone;

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: "USER_PROFILE_UPDATED",
          entityType: "User",
          entityId: userId,
          oldValues: {
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
          },
          newValues: dataToUpdate,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      }),
    ]);

    return updatedUser;
  }

  /**
   * Retrieve user localized & notification preferences (GET /api/v1/me/preferences)
   * Gracefully auto-creates standard defaults if not present
   */
  public static async getPreferences(
    userId: string
  ): Promise<UserPreferencesResponse> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    // Upsert ensures legacy or newly provisioned users always get a solid preferences record
    const preferences = await prisma.userPreferences.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        language: "en-IN",
        timezone: "Asia/Kolkata",
        dateFormat: "DD/MM/YYYY",
        numberFormat: "en-IN",
        emailNotifications: true,
        paymentNotifications: true,
        marketingEmails: false,
      },
      select: {
        language: true,
        timezone: true,
        dateFormat: true,
        numberFormat: true,
        emailNotifications: true,
        paymentNotifications: true,
        marketingEmails: true,
        updatedAt: true,
      },
    });

    return preferences;
  }

  /**
   * Update user preferences (PATCH /api/v1/me/preferences)
   */
  public static async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    context?: RequestContext
  ): Promise<UserPreferencesResponse> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    const [updatedPreferences] = await prisma.$transaction([
      prisma.userPreferences.upsert({
        where: { userId },
        update: input,
        create: {
          userId,
          language: input.language ?? "en-IN",
          timezone: input.timezone ?? "Asia/Kolkata",
          dateFormat: input.dateFormat ?? "DD/MM/YYYY",
          numberFormat: input.numberFormat ?? "en-IN",
          emailNotifications: input.emailNotifications ?? true,
          paymentNotifications: input.paymentNotifications ?? true,
          marketingEmails: input.marketingEmails ?? false,
        },
        select: {
          language: true,
          timezone: true,
          dateFormat: true,
          numberFormat: true,
          emailNotifications: true,
          paymentNotifications: true,
          marketingEmails: true,
          updatedAt: true,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: "USER_PREFERENCES_UPDATED",
          entityType: "UserPreferences",
          entityId: userId,
          newValues: input,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      }),
    ]);

    return updatedPreferences;
  }

  /**
   * Carefully controlled account deactivation / soft delete (DELETE /api/v1/me)
   * - Enforces password re-verification
   * - Enforces sole-owner multi-tenant protection (cannot orphan teams)
   * - Archives personal workspaces and cancels subscriptions
   * - Sets user status to DELETED and timestamps deletedAt
   * - Immediately revokes all active user sessions
   * - Creates immutable audit log entry
   */
  public static async deleteAccount(
    userId: string,
    input: DeleteAccountInput,
    context?: RequestContext
  ): Promise<DeleteAccountResponse> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        businessMemberships: {
          where: {
            status: BusinessMemberStatus.ACTIVE,
          },
          include: {
            business: {
              include: {
                members: {
                  where: {
                    status: BusinessMemberStatus.ACTIVE,
                  },
                  select: {
                    id: true,
                    userId: true,
                    role: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found or account is already deleted");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Account is suspended. Please contact support."
      );
    }

    // 1. Password Verification Guard
    if (!user.passwordHash) {
      throw new BadRequestError(
        "Password is not configured for this account. Please contact support."
      );
    }

    const isPasswordValid = await comparePassword(
      input.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError(
        "Incorrect password. Account deletion cannot proceed."
      );
    }

    // 2. Sole-Owner Guardrail:
    // If user is OWNER of an active organization that has OTHER active team members,
    // they must transfer ownership or remove members first to prevent orphan workspaces.
    const businessesToArchive: string[] = [];
    const membershipsToRemove: string[] = [];

    for (const membership of user.businessMemberships) {
      const biz = membership.business;
      if (biz.status === BusinessStatus.ACTIVE && !biz.deletedAt) {
        if (membership.role === BusinessMemberRole.OWNER) {
          const otherActiveMembers = biz.members.filter(
            (m) => m.userId !== userId
          );
          if (otherActiveMembers.length > 0) {
            throw new BadRequestError(
              `Cannot delete account: You are the sole owner of organization "${biz.name}" which has ${otherActiveMembers.length} active team member(s). Please transfer ownership to another team member or remove them before deleting your account.`
            );
          }
          // User is the sole member of this business -> schedule business for archival
          businessesToArchive.push(biz.id);
        } else {
          // User is a member/admin in an organization owned by someone else
          membershipsToRemove.push(membership.id);
        }
      }
    }

    const now = new Date();

    // 3. Transactional, controlled deactivation
    await prisma.$transaction(async (tx) => {
      // A. Archive user's personal businesses (where they were sole owner)
      if (businessesToArchive.length > 0) {
        await tx.business.updateMany({
          where: { id: { in: businessesToArchive } },
          data: {
            status: BusinessStatus.ARCHIVED,
            deletedAt: now,
          },
        });

        // Cancel any active subscriptions on archived businesses
        await tx.subscription.updateMany({
          where: {
            businessId: { in: businessesToArchive },
            status: SubscriptionStatus.ACTIVE,
          },
          data: {
            cancelAtPeriodEnd: true,
          },
        });
      }

      // B. Remove user from memberships in other organizations
      if (membershipsToRemove.length > 0) {
        await tx.businessMember.updateMany({
          where: { id: { in: membershipsToRemove } },
          data: {
            status: BusinessMemberStatus.REMOVED,
          },
        });
      }

      // C. Soft-delete the user
      await tx.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.DELETED,
          deletedAt: now,
        },
      });

      // D. Revoke all active sessions immediately
      await tx.userSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      // E. Invalidate any pending password reset or verification tokens
      await tx.passwordReset.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailVerification.deleteMany({
        where: { userId, verifiedAt: null },
      });

      // E. Write immutable audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: "USER_ACCOUNT_DELETED",
          entityType: "User",
          entityId: userId,
          oldValues: {
            email: user.email,
            status: user.status,
            ownedBusinessesArchived: businessesToArchive,
          },
          newValues: {
            status: UserStatus.DELETED,
            deletedAt: now,
            reason: input.reason || null,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    });

    return {
      status: "DELETED",
      deletedAt: now,
      retentionPeriodDays: 30,
    };
  }
}
