import { prisma } from "../config/prisma.js";
import {
  AccountType,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  GstRegistrationType,
  SubscriptionStatus,
  TaxMode,
  UserStatus,
} from "../generated/prisma/enums.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import type {
  CreateAddressInput,
  CreateBankAccountInput,
  InviteMemberInput,
  UpdateAddressInput,
  UpdateBankAccountInput,
  UpdateBusinessInput,
  UpdateMemberRoleInput,
  UpdateTaxProfileInput,
} from "../validators/business.validator.js";

export interface BusinessAddressDetail {
  id: string;
  type: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  stateCode: string | null;
  postalCode: string;
  country: string;
  countryCode: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessBankAccountDetail {
  id: string;
  businessId: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string | null;
  accountType: string;
  upiId: string | null;
  isPrimary: boolean;
  showOnInvoice: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessSettingsDetail {
  id: string;
  invoicePrefix: string;
  invoiceStartNumber: string;
  defaultDueDays: number;
  defaultNotes: string | null;
  defaultTerms: string | null;
  defaultCurrency: string;
  defaultTaxInclusive: boolean;
  showLogo: boolean;
  showSignature: boolean;
  showBankDetails: boolean;
  showPaymentDetails: boolean;
  invoiceTemplate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessTaxProfileDetail {
  id: string;
  businessId: string;
  taxCountry: string;
  taxRegistered: boolean;
  gstRegistered: boolean;
  gstin: string | null;
  gstRegistrationType: string | null;
  gstRegistrationDate: Date | null;
  pan: string | null;
  tan: string | null;
  taxpayerName: string | null;
  defaultTaxMode: string;
  taxMode: string;
  defaultTaxRate: number | null;
  placeOfSupplyStateCode: string | null;
  placeOfSupply: string | null;
  reverseChargeEnabled: boolean;
  reverseCharge: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessSubscriptionDetail {
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

export interface BusinessMemberInfo {
  role: BusinessMemberRole;
  status: BusinessMemberStatus;
  joinedAt: Date | null;
  invitedAt: Date | null;
}

export interface BusinessCounts {
  members: number;
  customers: number;
  products: number;
  invoices: number;
}

export interface BusinessDetailResponse {
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
  createdAt: Date;
  updatedAt: Date;

  currentMember: BusinessMemberInfo;
  settings: BusinessSettingsDetail | null;
  taxProfile: BusinessTaxProfileDetail | null;
  addresses: BusinessAddressDetail[];
  bankAccounts: BusinessBankAccountDetail[];
  subscription: BusinessSubscriptionDetail | null;
  counts: BusinessCounts;
}

export interface MemberUserInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: Date;
}

export interface BusinessMemberListResponse {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessMemberRole;
  status: BusinessMemberStatus;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: MemberUserInfo;
}

export interface InviteMemberResponse {
  id: string;
  businessId: string;
  userId: string;
  email: string;
  role: BusinessMemberRole;
  status: BusinessMemberStatus;
  invitedAt: Date | null;
  invitedById: string | null;
}

export class BusinessService {
  /**
   * Retrieves full business details for the logged-in individual.
   * Strictly queries the authenticated user's active business membership.
   */
  public static async getBusinessDetail(
    userId: string
  ): Promise<BusinessDetailResponse> {
    const [user, membership] = await Promise.all([
      // 1. Verify user exists and is active
      prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
        },
      }),

      // 2. Fetch active business membership + full business graph
      prisma.businessMember.findFirst({
        where: {
          userId,
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
              addresses: {
                orderBy: [
                  { isPrimary: "desc" },
                  { createdAt: "asc" },
                ],
              },
              bankAccounts: {
                orderBy: [
                  { isPrimary: "desc" },
                  { createdAt: "asc" },
                ],
              },
              plans: {
                where: {
                  status: SubscriptionStatus.ACTIVE,
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
                include: {
                  plan: true,
                },
              },
              _count: {
                select: {
                  members: true,
                  customers: true,
                  products: true,
                  invoices: true,
                },
              },
            },
          },
        },
        orderBy: [
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    const { business } = membership;
    const activeSub = business.plans[0] ?? null;
    const plan = activeSub?.plan ?? null;

    return {
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
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,

      currentMember: {
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
        invitedAt: membership.invitedAt,
      },

      settings: business.settings
        ? {
            id: business.settings.id,
            invoicePrefix: business.settings.invoicePrefix,
            invoiceStartNumber:
              business.settings.invoiceStartNumber.toString(),
            defaultDueDays: business.settings.defaultDueDays,
            defaultNotes: business.settings.defaultNotes,
            defaultTerms: business.settings.defaultTerms,
            defaultCurrency: business.settings.defaultCurrency,
            defaultTaxInclusive: business.settings.defaultTaxInclusive,
            showLogo: business.settings.showLogo,
            showSignature: business.settings.showSignature,
            showBankDetails: business.settings.showBankDetails,
            showPaymentDetails: business.settings.showPaymentDetails,
            invoiceTemplate: business.settings.invoiceTemplate,
            createdAt: business.settings.createdAt,
            updatedAt: business.settings.updatedAt,
          }
        : null,

      taxProfile: business.taxProfile
        ? BusinessService.formatTaxProfile(business.taxProfile)
        : null,

      addresses: business.addresses.map((addr) => ({
        id: addr.id,
        type: addr.type,
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2,
        landmark: addr.landmark,
        city: addr.city,
        district: addr.district,
        state: addr.state,
        stateCode: addr.stateCode,
        postalCode: addr.postalCode,
        country: addr.country,
        countryCode: addr.countryCode,
        isPrimary: addr.isPrimary,
        createdAt: addr.createdAt,
        updatedAt: addr.updatedAt,
      })),

      bankAccounts: business.bankAccounts.map((bank) =>
        BusinessService.formatBankAccount(bank)
      ),

      subscription:
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
          : null,

      counts: {
        members: business._count.members,
        customers: business._count.customers,
        products: business._count.products,
        invoices: business._count.invoices,
      },
    };
  }

  /**
   * Updates business attributes for the authenticated user's workspace.
   * Restricted to OWNER and ADMIN roles.
   */
  public static async updateBusiness(
    userId: string,
    input: UpdateBusinessInput
  ): Promise<BusinessDetailResponse> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can update business details"
      );
    }

    await prisma.business.update({
      where: { id: membership.businessId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.legalName !== undefined && { legalName: input.legalName }),
        ...(input.tradeName !== undefined && { tradeName: input.tradeName }),
        ...(input.businessType !== undefined && {
          businessType: input.businessType,
        }),
        ...(input.industry !== undefined && { industry: input.industry }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.website !== undefined && { website: input.website }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.countryCode !== undefined && {
          countryCode: input.countryCode,
        }),
        ...(input.currencyCode !== undefined && {
          currencyCode: input.currencyCode,
        }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    });

    return this.getBusinessDetail(userId);
  }

  /**
   * Retrieves all members belonging to the authenticated user's active business.
   */
  public static async getMembers(
    userId: string
  ): Promise<BusinessMemberListResponse[]> {
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
      },
    });

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    const members = await prisma.businessMember.findMany({
      where: {
        businessId: membership.businessId,
        status: {
          not: BusinessMemberStatus.REMOVED,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    });

    return members.map((m) => ({
      id: m.id,
      businessId: m.businessId,
      userId: m.userId,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      user: {
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        phone: m.user.phone,
        status: m.user.status,
        createdAt: m.user.createdAt,
      },
    }));
  }

  /**
   * Updates a member's role.
   * Restricted to OWNER and ADMIN roles.
   */
  public static async updateMemberRole(
    userId: string,
    memberId: string,
    input: UpdateMemberRoleInput
  ): Promise<BusinessMemberListResponse> {
    const callerMembership = await prisma.businessMember.findFirst({
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

    if (!callerMembership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      callerMembership.role !== BusinessMemberRole.OWNER &&
      callerMembership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can manage member roles"
      );
    }

    const targetMember = await prisma.businessMember.findFirst({
      where: {
        id: memberId,
        businessId: callerMembership.businessId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError("Member not found in this business");
    }

    // Protection guards
    if (targetMember.role === BusinessMemberRole.OWNER) {
      throw new ForbiddenError(
        "The business owner's role cannot be modified. Ownership must be transferred."
      );
    }

    if (targetMember.userId === userId) {
      throw new ForbiddenError("You cannot modify your own role");
    }

    if (
      callerMembership.role === BusinessMemberRole.ADMIN &&
      targetMember.role === BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Administrators cannot modify roles of other administrators"
      );
    }

    const updated = await prisma.businessMember.update({
      where: { id: memberId },
      data: {
        role: input.role,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      businessId: updated.businessId,
      userId: updated.userId,
      role: updated.role,
      status: updated.status,
      invitedAt: updated.invitedAt,
      joinedAt: updated.joinedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      user: {
        id: updated.user.id,
        firstName: updated.user.firstName,
        lastName: updated.user.lastName,
        email: updated.user.email,
        phone: updated.user.phone,
        status: updated.user.status,
        createdAt: updated.user.createdAt,
      },
    };
  }

  /**
   * Removes a member from the business.
   * Restricted to OWNER and ADMIN roles.
   */
  public static async removeMember(
    userId: string,
    memberId: string
  ): Promise<{ id: string; status: BusinessMemberStatus }> {
    const callerMembership = await prisma.businessMember.findFirst({
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

    if (!callerMembership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      callerMembership.role !== BusinessMemberRole.OWNER &&
      callerMembership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can remove members"
      );
    }

    const targetMember = await prisma.businessMember.findFirst({
      where: {
        id: memberId,
        businessId: callerMembership.businessId,
      },
    });

    if (!targetMember) {
      throw new NotFoundError("Member not found in this business");
    }

    if (targetMember.role === BusinessMemberRole.OWNER) {
      throw new ForbiddenError("The business owner cannot be removed");
    }

    if (targetMember.userId === userId) {
      throw new ForbiddenError(
        "You cannot remove yourself from the business"
      );
    }

    if (
      callerMembership.role === BusinessMemberRole.ADMIN &&
      targetMember.role === BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Administrators cannot remove other administrators"
      );
    }

    const updated = await prisma.businessMember.update({
      where: { id: memberId },
      data: {
        status: BusinessMemberStatus.REMOVED,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  /**
   * Invites a new member to the business.
   *
   * Constraints:
   * 1. Requires OWNER or ADMIN role.
   * 2. Not permitted on the Free plan (requires paid subscription).
   * 3. Prevents duplicate active memberships and pending invites.
   */
  public static async inviteMember(
    userId: string,
    input: InviteMemberInput
  ): Promise<InviteMemberResponse> {
    const membership = await prisma.businessMember.findFirst({
      where: {
        userId,
        status: BusinessMemberStatus.ACTIVE,
        business: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
        },
      },
      include: {
        business: {
          include: {
            plans: {
              where: {
                status: SubscriptionStatus.ACTIVE,
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    // Role check: Only OWNER or ADMIN may invite members
    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can invite new members"
      );
    }

    // Tier check: Free tier businesses are not allowed to invite team members
    const activeSub = membership.business.plans[0] ?? null;
    const plan = activeSub?.plan ?? null;
    if (!plan || plan.isFree || plan.code.toUpperCase() === "FREE") {
      throw new ForbiddenError(
        "Team member invitation is not available on the Free plan. Please upgrade your subscription to collaborate with team members."
      );
    }

    const normalizedEmail = input.email.toLowerCase().trim();

    // Check if the user already exists in the system
    let targetUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (targetUser) {
      // Check existing membership in this business
      const existingMembership = await prisma.businessMember.findUnique({
        where: {
          businessId_userId: {
            businessId: membership.businessId,
            userId: targetUser.id,
          },
        },
      });

      if (existingMembership) {
        if (existingMembership.status === BusinessMemberStatus.ACTIVE) {
          throw new ConflictError(
            "User is already an active member of this business"
          );
        }
        if (existingMembership.status === BusinessMemberStatus.INVITED) {
          throw new ConflictError(
            "An invitation is already pending for this email address"
          );
        }

        // Reactivate suspended or removed membership with new invite
        const updated = await prisma.businessMember.update({
          where: { id: existingMembership.id },
          data: {
            role: input.role,
            status: BusinessMemberStatus.INVITED,
            invitedById: userId,
            invitedAt: new Date(),
          },
        });

        return {
          id: updated.id,
          businessId: updated.businessId,
          userId: targetUser.id,
          email: targetUser.email,
          role: updated.role,
          status: updated.status,
          invitedAt: updated.invitedAt,
          invitedById: updated.invitedById,
        };
      }
    } else {
      // Create user record for the invited member
      const emailPrefix = normalizedEmail.split("@")[0] || "Invited";
      targetUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1),
          lastName: "",
          status: UserStatus.ACTIVE,
        },
      });
    }

    // Create the business membership in INVITED state
    const newMembership = await prisma.businessMember.create({
      data: {
        businessId: membership.businessId,
        userId: targetUser.id,
        role: input.role,
        status: BusinessMemberStatus.INVITED,
        invitedById: userId,
        invitedAt: new Date(),
      },
    });

    return {
      id: newMembership.id,
      businessId: newMembership.businessId,
      userId: targetUser.id,
      email: targetUser.email,
      role: newMembership.role,
      status: newMembership.status,
      invitedAt: newMembership.invitedAt,
      invitedById: newMembership.invitedById,
    };
  }

  /**
   * Retrieves all addresses for the authenticated user's active business.
   */
  public static async getAddresses(
    userId: string
  ): Promise<BusinessAddressDetail[]> {
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
      },
    });

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    const addresses = await prisma.businessAddress.findMany({
      where: {
        businessId: membership.businessId,
      },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "asc" },
      ],
    });

    return addresses.map((addr) => ({
      id: addr.id,
      type: addr.type,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      landmark: addr.landmark,
      city: addr.city,
      district: addr.district,
      state: addr.state,
      stateCode: addr.stateCode,
      postalCode: addr.postalCode,
      country: addr.country,
      countryCode: addr.countryCode,
      isPrimary: addr.isPrimary,
      createdAt: addr.createdAt,
      updatedAt: addr.updatedAt,
    }));
  }

  /**
   * Creates a new business address.
   * Restricted to OWNER and ADMIN roles.
   */
  public static async createAddress(
    userId: string,
    input: CreateAddressInput
  ): Promise<BusinessAddressDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can create addresses"
      );
    }

    const address = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.businessAddress.count({
        where: { businessId: membership.businessId },
      });

      // If user marked as primary or this is the first address, ensure it's primary
      const isPrimary = input.isPrimary || existingCount === 0;

      if (isPrimary) {
        await tx.businessAddress.updateMany({
          where: { businessId: membership.businessId },
          data: { isPrimary: false },
        });
      }

      return tx.businessAddress.create({
        data: {
          businessId: membership.businessId,
          type: input.type,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          landmark: input.landmark,
          city: input.city,
          district: input.district,
          state: input.state,
          stateCode: input.stateCode,
          postalCode: input.postalCode,
          country: input.country || "India",
          countryCode: input.countryCode || "IN",
          isPrimary,
        },
      });
    });

    return {
      id: address.id,
      type: address.type,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      landmark: address.landmark,
      city: address.city,
      district: address.district,
      state: address.state,
      stateCode: address.stateCode,
      postalCode: address.postalCode,
      country: address.country,
      countryCode: address.countryCode,
      isPrimary: address.isPrimary,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }

  /**
   * Updates an existing business address.
   * Restricted to OWNER and ADMIN roles.
   */
  public static async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressInput
  ): Promise<BusinessAddressDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can update addresses"
      );
    }

    const existingAddress = await prisma.businessAddress.findFirst({
      where: {
        id: addressId,
        businessId: membership.businessId,
      },
    });

    if (!existingAddress) {
      throw new NotFoundError("Address not found in this business");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await tx.businessAddress.updateMany({
          where: {
            businessId: membership.businessId,
            id: { not: addressId },
          },
          data: { isPrimary: false },
        });
      }

      return tx.businessAddress.update({
        where: { id: addressId },
        data: {
          ...(input.type !== undefined && { type: input.type }),
          ...(input.addressLine1 !== undefined && {
            addressLine1: input.addressLine1,
          }),
          ...(input.addressLine2 !== undefined && {
            addressLine2: input.addressLine2,
          }),
          ...(input.landmark !== undefined && { landmark: input.landmark }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.district !== undefined && { district: input.district }),
          ...(input.state !== undefined && { state: input.state }),
          ...(input.stateCode !== undefined && { stateCode: input.stateCode }),
          ...(input.postalCode !== undefined && {
            postalCode: input.postalCode,
          }),
          ...(input.country !== undefined && { country: input.country }),
          ...(input.countryCode !== undefined && {
            countryCode: input.countryCode,
          }),
          ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
        },
      });
    });

    return {
      id: updated.id,
      type: updated.type,
      addressLine1: updated.addressLine1,
      addressLine2: updated.addressLine2,
      landmark: updated.landmark,
      city: updated.city,
      district: updated.district,
      state: updated.state,
      stateCode: updated.stateCode,
      postalCode: updated.postalCode,
      country: updated.country,
      countryCode: updated.countryCode,
      isPrimary: updated.isPrimary,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Deletes a business address.
   * If primary address is deleted and other addresses remain, promotes the oldest remaining to primary.
   */
  public static async deleteAddress(
    userId: string,
    addressId: string
  ): Promise<{ id: string }> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can delete addresses"
      );
    }

    const existingAddress = await prisma.businessAddress.findFirst({
      where: {
        id: addressId,
        businessId: membership.businessId,
      },
    });

    if (!existingAddress) {
      throw new NotFoundError("Address not found in this business");
    }

    await prisma.$transaction(async (tx) => {
      await tx.businessAddress.delete({
        where: { id: addressId },
      });

      // If deleted address was primary, make the oldest remaining address primary
      if (existingAddress.isPrimary) {
        const remaining = await tx.businessAddress.findFirst({
          where: { businessId: membership.businessId },
          orderBy: { createdAt: "asc" },
        });

        if (remaining) {
          await tx.businessAddress.update({
            where: { id: remaining.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return { id: addressId };
  }

  // ============================================================
  // Helpers & Formatters
  // ============================================================

  /**
   * Helper to format a BusinessTaxProfile record into BusinessTaxProfileDetail
   */
  public static formatTaxProfile(profile: {
    id: string;
    businessId: string;
    taxCountry: string;
    taxRegistered: boolean;
    gstin: string | null;
    gstRegistrationType: GstRegistrationType | null;
    gstRegistrationDate: Date | null;
    pan: string | null;
    tan: string | null;
    taxpayerName: string | null;
    defaultTaxMode: TaxMode;
    defaultTaxRate: unknown;
    placeOfSupplyStateCode: string | null;
    reverseChargeEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): BusinessTaxProfileDetail {
    const taxRate =
      profile.defaultTaxRate !== null && profile.defaultTaxRate !== undefined
        ? Number(profile.defaultTaxRate)
        : null;

    return {
      id: profile.id,
      businessId: profile.businessId,
      taxCountry: profile.taxCountry,
      taxRegistered: profile.taxRegistered,
      gstRegistered: profile.taxRegistered,
      gstin: profile.gstin,
      gstRegistrationType: profile.gstRegistrationType,
      gstRegistrationDate: profile.gstRegistrationDate,
      pan: profile.pan,
      tan: profile.tan,
      taxpayerName: profile.taxpayerName,
      defaultTaxMode: profile.defaultTaxMode,
      taxMode: profile.defaultTaxMode,
      defaultTaxRate: taxRate,
      placeOfSupplyStateCode: profile.placeOfSupplyStateCode,
      placeOfSupply: profile.placeOfSupplyStateCode,
      reverseChargeEnabled: profile.reverseChargeEnabled,
      reverseCharge: profile.reverseChargeEnabled,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Helper to format a BusinessBankAccount record into BusinessBankAccountDetail
   */
  public static formatBankAccount(bank: {
    id: string;
    businessId: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branchName: string | null;
    accountType: AccountType | string;
    upiId: string | null;
    isPrimary: boolean;
    showOnInvoice: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): BusinessBankAccountDetail {
    return {
      id: bank.id,
      businessId: bank.businessId,
      accountName: bank.accountName,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      ifscCode: bank.ifscCode,
      branchName: bank.branchName,
      accountType: bank.accountType,
      upiId: bank.upiId,
      isPrimary: bank.isPrimary,
      showOnInvoice: bank.showOnInvoice,
      createdAt: bank.createdAt,
      updatedAt: bank.updatedAt,
    };
  }

  // ============================================================
  // Business Tax Profile
  // ============================================================

  /**
   * GET /api/v1/business/tax-profile
   * Retrieve the business tax profile for the authenticated user's workspace.
   */
  public static async getTaxProfile(
    userId: string
  ): Promise<BusinessTaxProfileDetail> {
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
      },
    });

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    let taxProfile = await prisma.businessTaxProfile.findUnique({
      where: { businessId: membership.businessId },
    });

    if (!taxProfile) {
      const business = await prisma.business.findUnique({
        where: { id: membership.businessId },
        select: { countryCode: true },
      });

      taxProfile = await prisma.businessTaxProfile.create({
        data: {
          businessId: membership.businessId,
          taxCountry: business?.countryCode ?? "IN",
          taxRegistered: false,
          defaultTaxMode: TaxMode.TAX_EXCLUSIVE,
        },
      });
    }

    return BusinessService.formatTaxProfile(taxProfile);
  }

  /**
   * PATCH /api/v1/business/tax-profile
   * Update the business tax profile.
   * Requires OWNER or ADMIN role.
   */
  public static async updateTaxProfile(
    userId: string,
    input: UpdateTaxProfileInput
  ): Promise<BusinessTaxProfileDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can update tax profile"
      );
    }

    // Resolve field aliases cleanly without any || operators
    const taxRegistered =
      input.taxRegistered !== undefined
        ? input.taxRegistered
        : input.gstRegistered !== undefined
        ? input.gstRegistered
        : undefined;

    const defaultTaxMode =
      input.defaultTaxMode !== undefined
        ? input.defaultTaxMode
        : input.taxMode !== undefined
        ? input.taxMode
        : undefined;

    const placeOfSupplyStateCode =
      input.placeOfSupplyStateCode !== undefined
        ? input.placeOfSupplyStateCode
        : input.placeOfSupply !== undefined
        ? input.placeOfSupply
        : undefined;

    const reverseChargeEnabled =
      input.reverseChargeEnabled !== undefined
        ? input.reverseChargeEnabled
        : input.reverseCharge !== undefined
        ? input.reverseCharge
        : undefined;

    // If GSTIN is a valid 15-character string and PAN was not explicitly provided, derive PAN (chars 3 to 12)
    let derivedPan = input.pan;
    if (
      derivedPan === undefined &&
      input.gstin !== undefined &&
      input.gstin !== null &&
      input.gstin.length === 15
    ) {
      derivedPan = input.gstin.slice(2, 12);
    }

    // If GSTIN is provided and taxRegistered wasn't explicitly specified, set taxRegistered to true
    const effectiveTaxRegistered =
      taxRegistered !== undefined
        ? taxRegistered
        : input.gstin !== undefined && input.gstin !== null
        ? true
        : undefined;

    const updated = await prisma.businessTaxProfile.upsert({
      where: { businessId: membership.businessId },
      update: {
        ...(input.taxCountry !== undefined && { taxCountry: input.taxCountry }),
        ...(effectiveTaxRegistered !== undefined && {
          taxRegistered: effectiveTaxRegistered,
        }),
        ...(input.gstin !== undefined && { gstin: input.gstin }),
        ...(input.gstRegistrationType !== undefined && {
          gstRegistrationType: input.gstRegistrationType,
        }),
        ...(input.gstRegistrationDate !== undefined && {
          gstRegistrationDate: input.gstRegistrationDate,
        }),
        ...(derivedPan !== undefined && { pan: derivedPan }),
        ...(input.tan !== undefined && { tan: input.tan }),
        ...(input.taxpayerName !== undefined && {
          taxpayerName: input.taxpayerName,
        }),
        ...(defaultTaxMode !== undefined && { defaultTaxMode }),
        ...(input.defaultTaxRate !== undefined && {
          defaultTaxRate: input.defaultTaxRate,
        }),
        ...(placeOfSupplyStateCode !== undefined && {
          placeOfSupplyStateCode,
        }),
        ...(reverseChargeEnabled !== undefined && {
          reverseChargeEnabled,
        }),
      },
      create: {
        businessId: membership.businessId,
        taxCountry: input.taxCountry ?? "IN",
        taxRegistered: effectiveTaxRegistered ?? false,
        gstin: input.gstin ?? null,
        gstRegistrationType: input.gstRegistrationType ?? null,
        gstRegistrationDate: input.gstRegistrationDate ?? null,
        pan: derivedPan ?? null,
        tan: input.tan ?? null,
        taxpayerName: input.taxpayerName ?? null,
        defaultTaxMode: defaultTaxMode ?? TaxMode.TAX_EXCLUSIVE,
        defaultTaxRate: input.defaultTaxRate ?? null,
        placeOfSupplyStateCode: placeOfSupplyStateCode ?? null,
        reverseChargeEnabled: reverseChargeEnabled ?? false,
      },
    });

    return BusinessService.formatTaxProfile(updated);
  }

  // ============================================================
  // Business Bank Accounts
  // ============================================================

  /**
   * GET /api/v1/business/bank-accounts
   * List all bank accounts for the authenticated user's workspace.
   */
  public static async getBankAccounts(
    userId: string
  ): Promise<BusinessBankAccountDetail[]> {
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
      },
    });

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    const accounts = await prisma.businessBankAccount.findMany({
      where: { businessId: membership.businessId },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "asc" },
      ],
    });

    return accounts.map((bank) => BusinessService.formatBankAccount(bank));
  }

  /**
   * POST /api/v1/business/bank-accounts
   * Add a new bank account.
   * Requires OWNER or ADMIN role.
   */
  public static async addBankAccount(
    userId: string,
    input: CreateBankAccountInput
  ): Promise<BusinessBankAccountDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can add bank accounts"
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.businessBankAccount.count({
        where: { businessId: membership.businessId },
      });

      // If this is the very first account, force isPrimary to true.
      // Otherwise use input.isPrimary if specified, or default to false.
      const shouldBePrimary =
        existingCount === 0
          ? true
          : input.isPrimary !== undefined
          ? input.isPrimary
          : false;

      // If setting this account as primary, demote any existing primary accounts
      if (shouldBePrimary && existingCount > 0) {
        await tx.businessBankAccount.updateMany({
          where: { businessId: membership.businessId },
          data: { isPrimary: false },
        });
      }

      return tx.businessBankAccount.create({
        data: {
          businessId: membership.businessId,
          accountName: input.accountName,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          ifscCode: input.ifscCode,
          branchName: input.branchName ?? null,
          accountType: input.accountType,
          upiId: input.upiId ?? null,
          isPrimary: shouldBePrimary,
          showOnInvoice: input.showOnInvoice ?? true,
        },
      });
    });

    return BusinessService.formatBankAccount(created);
  }

  /**
   * PATCH /api/v1/business/bank-accounts/:accountId
   * Update an existing bank account.
   * Requires OWNER or ADMIN role.
   */
  public static async updateBankAccount(
    userId: string,
    accountId: string,
    input: UpdateBankAccountInput
  ): Promise<BusinessBankAccountDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can update bank accounts"
      );
    }

    const existing = await prisma.businessBankAccount.findFirst({
      where: {
        id: accountId,
        businessId: membership.businessId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Bank account not found in this business");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        // Demote all other accounts
        await tx.businessBankAccount.updateMany({
          where: {
            businessId: membership.businessId,
            id: { not: accountId },
          },
          data: { isPrimary: false },
        });
      } else if (input.isPrimary === false && existing.isPrimary) {
        // Current primary account is demoted: promote oldest remaining account if any
        const remaining = await tx.businessBankAccount.findFirst({
          where: {
            businessId: membership.businessId,
            id: { not: accountId },
          },
          orderBy: { createdAt: "asc" },
        });
        if (remaining) {
          await tx.businessBankAccount.update({
            where: { id: remaining.id },
            data: { isPrimary: true },
          });
        }
      }

      return tx.businessBankAccount.update({
        where: { id: accountId },
        data: {
          ...(input.accountName !== undefined && {
            accountName: input.accountName,
          }),
          ...(input.bankName !== undefined && { bankName: input.bankName }),
          ...(input.accountNumber !== undefined && {
            accountNumber: input.accountNumber,
          }),
          ...(input.ifscCode !== undefined && { ifscCode: input.ifscCode }),
          ...(input.branchName !== undefined && {
            branchName: input.branchName,
          }),
          ...(input.accountType !== undefined && {
            accountType: input.accountType,
          }),
          ...(input.upiId !== undefined && { upiId: input.upiId }),
          ...(input.isPrimary !== undefined && {
            isPrimary: input.isPrimary,
          }),
          ...(input.showOnInvoice !== undefined && {
            showOnInvoice: input.showOnInvoice,
          }),
        },
      });
    });

    return BusinessService.formatBankAccount(updated);
  }

  /**
   * DELETE /api/v1/business/bank-accounts/:accountId
   * Delete a bank account.
   * If primary account is deleted, promotes oldest remaining account to primary.
   * Requires OWNER or ADMIN role.
   */
  public static async deleteBankAccount(
    userId: string,
    accountId: string
  ): Promise<{ id: string }> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can delete bank accounts"
      );
    }

    const existing = await prisma.businessBankAccount.findFirst({
      where: {
        id: accountId,
        businessId: membership.businessId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Bank account not found in this business");
    }

    await prisma.$transaction(async (tx) => {
      await tx.businessBankAccount.delete({
        where: { id: accountId },
      });

      if (existing.isPrimary) {
        const remaining = await tx.businessBankAccount.findFirst({
          where: { businessId: membership.businessId },
          orderBy: { createdAt: "asc" },
        });

        if (remaining) {
          await tx.businessBankAccount.update({
            where: { id: remaining.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return { id: accountId };
  }

  /**
   * POST /api/v1/business/bank-accounts/:accountId/set-primary
   * Set a bank account as the primary account for the business.
   * Requires OWNER or ADMIN role.
   */
  public static async setPrimaryBankAccount(
    userId: string,
    accountId: string
  ): Promise<BusinessBankAccountDetail> {
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

    if (!membership) {
      throw new NotFoundError("No active business found for this user");
    }

    if (
      membership.role !== BusinessMemberRole.OWNER &&
      membership.role !== BusinessMemberRole.ADMIN
    ) {
      throw new ForbiddenError(
        "Only business owners and administrators can set primary bank account"
      );
    }

    const existing = await prisma.businessBankAccount.findFirst({
      where: {
        id: accountId,
        businessId: membership.businessId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Bank account not found in this business");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.businessBankAccount.updateMany({
        where: {
          businessId: membership.businessId,
          id: { not: accountId },
        },
        data: { isPrimary: false },
      });

      return tx.businessBankAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
      });
    });

    return BusinessService.formatBankAccount(updated);
  }
}
