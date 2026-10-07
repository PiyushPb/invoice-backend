import { prisma } from "../config/prisma.js";
import {
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  SubscriptionStatus,
  UserStatus,
} from "../generated/prisma/enums.js";
import {
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";

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
  taxCountry: string;
  taxRegistered: boolean;
  gstin: string | null;
  gstRegistrationType: string | null;
  gstRegistrationDate: Date | null;
  pan: string | null;
  tan: string | null;
  taxpayerName: string | null;
  defaultTaxMode: string;
  defaultTaxRate: number | null;
  placeOfSupplyStateCode: string | null;
  reverseChargeEnabled: boolean;
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

export class BusinessService {
  /**
   * Retrieves full business details for the logged-in individual.
   *
   * Strictly queries the authenticated user's active business membership
   * in a single round-trip indexed operation.
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
        ? {
            id: business.taxProfile.id,
            taxCountry: business.taxProfile.taxCountry,
            taxRegistered: business.taxProfile.taxRegistered,
            gstin: business.taxProfile.gstin,
            gstRegistrationType: business.taxProfile.gstRegistrationType,
            gstRegistrationDate: business.taxProfile.gstRegistrationDate,
            pan: business.taxProfile.pan,
            tan: business.taxProfile.tan,
            taxpayerName: business.taxProfile.taxpayerName,
            defaultTaxMode: business.taxProfile.defaultTaxMode,
            defaultTaxRate:
              business.taxProfile.defaultTaxRate !== null
                ? Number(business.taxProfile.defaultTaxRate)
                : null,
            placeOfSupplyStateCode:
              business.taxProfile.placeOfSupplyStateCode,
            reverseChargeEnabled: business.taxProfile.reverseChargeEnabled,
            createdAt: business.taxProfile.createdAt,
            updatedAt: business.taxProfile.updatedAt,
          }
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

      bankAccounts: business.bankAccounts.map((bank) => ({
        id: bank.id,
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
      })),

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
}
