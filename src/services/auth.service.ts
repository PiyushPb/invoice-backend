import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { comparePassword, hashPassword } from "../utils/password.utils.js";
import { generateAuthTokens } from "../utils/jwt.utils.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";
import type { LoginInput, RegisterInput } from "../validators/auth.validator.js";
import {
  BillingInterval,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  SubscriptionStatus,
  TaxMode,
  UsageMetric,
  UserStatus,
} from "../generated/prisma/enums.js";

export interface BusinessSummary {
  id: string;
  name: string;
  businessType: string;
  countryCode: string;
  currencyCode: string;
  role: string;
}

export interface RegisterResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: Date;
  };
  business: {
    id: string;
    name: string;
    businessType: string;
    countryCode: string;
    currencyCode: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface LoginMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  business: BusinessSummary | null;
  businesses: BusinessSummary[];
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

function sanitizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const clean = ip.startsWith("::ffff:") ? ip.replace("::ffff:", "") : ip;
  if (clean === "::1" || clean === "127.0.0.1") return clean;
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(clean);
  const isIpv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(clean);
  return isIpv4 || isIpv6 ? clean : null;
}

export class AuthService {
  public static async register(input: RegisterInput): Promise<RegisterResult> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError("An account with this email already exists");
    }

    const hashedPassword = await hashPassword(input.password);

    // Atomically create User, Preferences, Business, Member, Settings, TaxProfile, Subscription, and UsageCounters
    const result = await prisma.$transaction(async (tx) => {
      // 1. User
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: hashedPassword,
          firstName: input.firstName,
          lastName: input.lastName,
          status: UserStatus.ACTIVE,
        },
      });

      // 2. UserPreferences
      await tx.userPreferences.create({
        data: {
          userId: user.id,
          language: "en-IN",
          timezone: "Asia/Kolkata",
          dateFormat: "DD/MM/YYYY",
          numberFormat: "en-IN",
        },
      });

      // 3. Business
      const business = await tx.business.create({
        data: {
          name: input.business.name,
          businessType: input.business.businessType,
          countryCode: input.business.countryCode,
          currencyCode: input.business.currencyCode,
          status: BusinessStatus.ACTIVE,
        },
      });

      // 4. BusinessMember (Owner)
      await tx.businessMember.create({
        data: {
          businessId: business.id,
          userId: user.id,
          role: BusinessMemberRole.OWNER,
          status: BusinessMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      // 5. BusinessSettings
      await tx.businessSettings.create({
        data: {
          businessId: business.id,
          invoicePrefix: "INV",
          invoiceStartNumber: 1n,
          defaultDueDays: 7,
          defaultCurrency: business.currencyCode,
          defaultTaxInclusive: false,
          showLogo: true,
          showBankDetails: true,
          showPaymentDetails: true,
        },
      });

      // 6. BusinessTaxProfile
      await tx.businessTaxProfile.create({
        data: {
          businessId: business.id,
          taxCountry: business.countryCode,
          taxRegistered: false,
          defaultTaxMode: TaxMode.TAX_EXCLUSIVE,
        },
      });

      // 7. Subscription → FREE Plan
      const freePlan = await tx.plan.upsert({
        where: { code: "FREE" },
        update: {},
        create: {
          code: "FREE",
          name: "Free Plan",
          description: "Starter free plan",
          price: 0,
          currencyCode: business.currencyCode,
          billingInterval: BillingInterval.MONTHLY,
          isFree: true,
          isActive: true,
        },
      });

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setFullYear(periodStart.getFullYear() + 10); // 10 years active for free tier

      await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: freePlan.id,
          status: SubscriptionStatus.ACTIVE,
          provider: "SYSTEM",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      // 8. UsageCounters (Initialize all metrics for the business)
      await tx.usageCounter.createMany({
        data: [
          {
            businessId: business.id,
            metric: UsageMetric.INVOICES_LIFETIME,
            usedCount: 0n,
            periodStart,
          },
          {
            businessId: business.id,
            metric: UsageMetric.CUSTOMERS_ACTIVE,
            usedCount: 0n,
            periodStart,
          },
          {
            businessId: business.id,
            metric: UsageMetric.PRODUCTS_ACTIVE,
            usedCount: 0n,
            periodStart,
          },
        ],
      });

      return { user, business };
    });

    // Generate JWT Tokens
    const tokens = generateAuthTokens({
      userId: result.user.id,
      email: result.user.email,
      role: BusinessMemberRole.OWNER,
      businessId: result.business.id,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        status: result.user.status,
        createdAt: result.user.createdAt,
      },
      business: {
        id: result.business.id,
        name: result.business.name,
        businessType: result.business.businessType,
        countryCode: result.business.countryCode,
        currencyCode: result.business.currencyCode,
        role: BusinessMemberRole.OWNER,
      },
      tokens,
    };
  }

  /**
   * Authenticate a user with email and password
   */
  public static async login(
    input: LoginInput,
    metadata?: LoginMetadata
  ): Promise<LoginResult> {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
        deletedAt: null,
      },
      include: {
        profile: true,
        businessMemberships: {
          where: {
            status: BusinessMemberStatus.ACTIVE,
            business: {
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
            },
          },
          include: {
            business: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    // Protect against timing attacks / user enumeration with identical failure error
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Check account status
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Map active business memberships
    const availableBusinesses: BusinessSummary[] = user.businessMemberships.map(
      (membership) => ({
        id: membership.business.id,
        name: membership.business.name,
        businessType: membership.business.businessType,
        countryCode: membership.business.countryCode,
        currencyCode: membership.business.currencyCode,
        role: membership.role,
      })
    );

    // Resolve primary active business: prioritize OWNER role, then ADMIN, then first available
    const activeMembership =
      user.businessMemberships.find((m) => m.role === BusinessMemberRole.OWNER) ||
      user.businessMemberships.find((m) => m.role === BusinessMemberRole.ADMIN) ||
      user.businessMemberships[0] ||
      null;

    // Generate fresh JWT tokens
    const tokens = generateAuthTokens({
      userId: user.id,
      email: user.email,
      role: activeMembership?.role,
      businessId: activeMembership?.businessId,
    });

    const now = new Date();

    // Update user's last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    // Record session tracking (non-blocking)
    try {
      const tokenHash = crypto
        .createHash("sha256")
        .update(tokens.refreshToken)
        .digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const sanitizedIp = sanitizeIp(metadata?.ipAddress);

      await prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash,
          ipAddress: sanitizedIp,
          userAgent: metadata?.userAgent ? metadata.userAgent.slice(0, 1000) : null,
          deviceName: metadata?.deviceName || null,
          expiresAt,
        },
      });
    } catch (sessionErr) {
      console.warn("[AuthService] Warning: Failed to record user session:", sessionErr);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: now,
      },
      business: activeMembership
        ? {
            id: activeMembership.business.id,
            name: activeMembership.business.name,
            businessType: activeMembership.business.businessType,
            countryCode: activeMembership.business.countryCode,
            currencyCode: activeMembership.business.currencyCode,
            role: activeMembership.role,
          }
        : null,
      businesses: availableBusinesses,
      tokens,
    };
  }

  /**
   * Get authenticated user profile and memberships
   */
  public static async getMe(userId: string) {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        profile: true,
        businessMemberships: {
          where: {
            status: BusinessMemberStatus.ACTIVE,
            business: {
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
            },
          },
          include: {
            business: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
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

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        preferences: user.profile
          ? {
              language: user.profile.language,
              timezone: user.profile.timezone,
              dateFormat: user.profile.dateFormat,
              numberFormat: user.profile.numberFormat,
              emailNotifications: user.profile.emailNotifications,
              paymentNotifications: user.profile.paymentNotifications,
            }
          : null,
      },
      businesses: user.businessMemberships.map((m) => ({
        id: m.business.id,
        name: m.business.name,
        businessType: m.business.businessType,
        countryCode: m.business.countryCode,
        currencyCode: m.business.currencyCode,
        role: m.role,
      })),
    };
  }
}
