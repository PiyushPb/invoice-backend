import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { comparePassword, hashPassword } from "../utils/password.utils.js";
import { generateAuthTokens, verifyRefreshToken } from "../utils/jwt.utils.js";
import { config } from "../config/env.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";
import type { LoginInput, RegisterInput } from "../validators/auth.validator.js";
import type { DeviceInfo } from "../utils/device.utils.js";
import { SessionService, type SessionSummary } from "./session.service.js";
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
  session: SessionSummary;
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
  session: SessionSummary;
}

export class AuthService {
  public static async register(
    input: RegisterInput,
    deviceInfo: DeviceInfo
  ): Promise<RegisterResult> {
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

      // 9. Generate JWT Tokens
      const tokens = generateAuthTokens({
        userId: user.id,
        email: user.email,
        role: BusinessMemberRole.OWNER,
        businessId: business.id,
      });

      // 10. Create Session with LRU Max 5 constraint atomically
      const session = await SessionService.createSession(
        user.id,
        tokens.refreshToken,
        deviceInfo,
        tx
      );

      return { user, business, tokens, session };
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
      tokens: result.tokens,
      session: result.session,
    };
  }

  /**
   * Authenticate a user with email and password
   */
  public static async login(
    input: LoginInput,
    deviceInfo: DeviceInfo
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

    // Create session enforcing MAX 5 active sessions via LRU eviction
    const session = await SessionService.createSession(
      user.id,
      tokens.refreshToken,
      deviceInfo
    );

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
      session,
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

  /**
   * Rotate refresh token and issue new access token
   */
  public static async refreshToken(
    oldRefreshToken: string,
    deviceInfo: DeviceInfo
  ): Promise<{
    tokens: { accessToken: string; refreshToken: string };
    session: SessionSummary;
  }> {
    let payload;
    try {
      payload = verifyRefreshToken(oldRefreshToken);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        deletedAt: null,
      },
      include: {
        businessMemberships: {
          where: {
            status: BusinessMemberStatus.ACTIVE,
            business: {
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError("User account not found");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support."
      );
    }

    const activeMembership =
      user.businessMemberships.find((m) => m.role === BusinessMemberRole.OWNER) ||
      user.businessMemberships.find((m) => m.role === BusinessMemberRole.ADMIN) ||
      user.businessMemberships[0] ||
      null;

    const newTokens = generateAuthTokens({
      userId: user.id,
      email: user.email,
      role: activeMembership?.role,
      businessId: activeMembership?.businessId,
    });

    const updatedSession = await SessionService.rotateSession(
      oldRefreshToken,
      newTokens.refreshToken,
      deviceInfo
    );

    if (!updatedSession) {
      // Possible token replay: revoke all sessions for safety
      await SessionService.revokeAllSessions(user.id);
      throw new UnauthorizedError(
        "Session is invalid or already rotated. Please log in again."
      );
    }

    return {
      tokens: newTokens,
      session: updatedSession,
    };
  }

  /**
   * Logout user by revoking current session
   */
  public static async logout(
    refreshToken?: string,
    userId?: string
  ): Promise<boolean> {
    if (refreshToken) {
      return SessionService.revokeSessionByRefreshToken(refreshToken);
    }

    if (userId) {
      const activeSessions = await SessionService.getUserActiveSessions(userId);
      if (activeSessions.length > 0 && activeSessions[0]) {
        return SessionService.revokeSession(userId, activeSessions[0].id);
      }
    }

    return true;
  }

  /**
   * Logout user from all devices by revoking all active sessions
   */
  public static async logoutAll(userId: string): Promise<number> {
    return SessionService.revokeAllSessions(userId);
  }

  /**
   * Verify user email using token
   */
  public static async verifyEmail(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const verification = await prisma.emailVerification.findFirst({
      where: {
        tokenHash,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!verification) {
      throw new BadRequestError("Invalid or expired email verification token");
    }

    await prisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedAt: now },
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: { emailVerifiedAt: now },
      });
    });

    return true;
  }

  /**
   * Resend verification email token
   */
  public static async resendVerification(email: string): Promise<{
    message: string;
    previewToken?: string;
  }> {
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
      },
    });

    if (!user) {
      return {
        message:
          "If an account with this email exists, verification instructions have been sent.",
      };
    }

    if (user.emailVerifiedAt) {
      return {
        message: "Email is already verified.",
      };
    }

    // Invalidate existing pending tokens
    await prisma.emailVerification.deleteMany({
      where: {
        userId: user.id,
        verifiedAt: null,
      },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt,
      },
    });

    return {
      message: "Verification email sent successfully.",
      ...(config.nodeEnv !== "production" ? { previewToken: rawToken } : {}),
    };
  }

  /**
   * Generate password reset token
   */
  public static async forgotPassword(email: string): Promise<{
    message: string;
    previewToken?: string;
  }> {
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
      },
    });

    if (!user) {
      return {
        message:
          "If an account with that email exists, password reset instructions have been sent.",
      };
    }

    // Invalidate existing unused reset tokens
    await prisma.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      message: "Password reset instructions sent successfully.",
      ...(config.nodeEnv !== "production" ? { previewToken: rawToken } : {}),
    };
  }

  /**
   * Reset user password using token and revoke all existing sessions
   */
  public static async resetPassword(
    token: string,
    newPassword: string
  ): Promise<boolean> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!resetRecord) {
      throw new BadRequestError("Invalid or expired password reset token");
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: hashedPassword },
      });

      // Revoke all sessions on password reset for security
      await tx.userSession.updateMany({
        where: {
          userId: resetRecord.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
    });

    return true;
  }
}
