import { z } from "zod";
import {
  AccountType,
  BusinessAddressType,
  BusinessMemberRole,
  BusinessType,
  GstRegistrationType,
  TaxMode,
} from "../generated/prisma/enums.js";

/**
 * Validation schema for updating business profile (PATCH /api/v1/business)
 */
export const updateBusinessSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Business name cannot be empty")
      .max(255, "Business name cannot exceed 255 characters")
      .optional(),
    legalName: z
      .string()
      .trim()
      .max(255, "Legal name cannot exceed 255 characters")
      .nullable()
      .optional(),
    tradeName: z
      .string()
      .trim()
      .max(255, "Trade name cannot exceed 255 characters")
      .nullable()
      .optional(),
    businessType: z
      .nativeEnum(BusinessType, {
        message: "Invalid business type",
      })
      .optional(),
    industry: z
      .string()
      .trim()
      .max(150, "Industry cannot exceed 150 characters")
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .email("Invalid email format")
      .max(320, "Email cannot exceed 320 characters")
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Phone cannot exceed 30 characters")
      .nullable()
      .optional(),
    website: z
      .string()
      .trim()
      .max(500, "Website cannot exceed 500 characters")
      .nullable()
      .optional(),
    logoUrl: z
      .string()
      .trim()
      .nullable()
      .optional(),
    countryCode: z
      .string()
      .trim()
      .length(2, "Country code must be 2 characters (e.g. IN)")
      .toUpperCase()
      .optional(),
    currencyCode: z
      .string()
      .trim()
      .length(3, "Currency code must be 3 characters (e.g. INR)")
      .toUpperCase()
      .optional(),
    timezone: z
      .string()
      .trim()
      .max(50, "Timezone cannot exceed 50 characters")
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update business details",
  });

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

/**
 * Validation schema for memberId route parameter
 */
export const memberIdParamSchema = z
  .object({
    memberId: z.string().uuid("Invalid member ID format. Must be a valid UUID."),
  })
  .strict();

export type MemberIdParam = z.infer<typeof memberIdParamSchema>;

/**
 * Validation schema for updating member role (PATCH /api/v1/business/members/:memberId)
 */
export const updateMemberRoleSchema = z
  .object({
    role: z.enum(
      [
        BusinessMemberRole.ADMIN,
        BusinessMemberRole.ACCOUNTANT,
        BusinessMemberRole.MEMBER,
        BusinessMemberRole.VIEWER,
      ],
      {
        message: "Role must be ADMIN, ACCOUNTANT, MEMBER, or VIEWER",
      }
    ),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/**
 * Validation schema for inviting a new member (POST /api/v1/business/members/invite)
 * OWNER cannot be invited. Roles allowed: ADMIN, ACCOUNTANT, MEMBER, VIEWER.
 */
export const inviteMemberSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("A valid email address is required")
      .max(320, "Email cannot exceed 320 characters"),
    role: z.enum(
      [
        BusinessMemberRole.ADMIN,
        BusinessMemberRole.ACCOUNTANT,
        BusinessMemberRole.MEMBER,
        BusinessMemberRole.VIEWER,
      ],
      {
        message: "Role must be ADMIN, ACCOUNTANT, MEMBER, or VIEWER",
      }
    ),
  })
  .strict();

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Validation schema for addressId route parameter
 */
export const addressIdParamSchema = z
  .object({
    addressId: z
      .string()
      .uuid("Invalid address ID format. Must be a valid UUID."),
  })
  .strict();

export type AddressIdParam = z.infer<typeof addressIdParamSchema>;

/**
 * Validation schema for creating business address (POST /api/v1/business/addresses)
 */
export const createAddressSchema = z
  .object({
    type: z.nativeEnum(BusinessAddressType, {
      message:
        "Address type must be REGISTERED, BILLING, SHIPPING, or OFFICE",
    }),
    addressLine1: z
      .string()
      .trim()
      .min(1, "Address line 1 is required")
      .max(255, "Address line 1 cannot exceed 255 characters"),
    addressLine2: z
      .string()
      .trim()
      .max(255, "Address line 2 cannot exceed 255 characters")
      .nullable()
      .optional(),
    landmark: z
      .string()
      .trim()
      .max(255, "Landmark cannot exceed 255 characters")
      .nullable()
      .optional(),
    city: z
      .string()
      .trim()
      .min(1, "City is required")
      .max(100, "City cannot exceed 100 characters"),
    district: z
      .string()
      .trim()
      .max(100, "District cannot exceed 100 characters")
      .nullable()
      .optional(),
    state: z
      .string()
      .trim()
      .min(1, "State is required")
      .max(100, "State cannot exceed 100 characters"),
    stateCode: z
      .string()
      .trim()
      .max(10, "State code cannot exceed 10 characters")
      .nullable()
      .optional(),
    postalCode: z
      .string()
      .trim()
      .min(1, "Postal code is required")
      .max(20, "Postal code cannot exceed 20 characters"),
    country: z
      .string()
      .trim()
      .max(100, "Country cannot exceed 100 characters")
      .default("India")
      .optional(),
    countryCode: z
      .string()
      .trim()
      .length(2, "Country code must be 2 characters (e.g. IN)")
      .toUpperCase()
      .default("IN")
      .optional(),
    isPrimary: z.boolean().default(false).optional(),
  })
  .strict();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

/**
 * Validation schema for updating business address (PATCH /api/v1/business/addresses/:addressId)
 */
export const updateAddressSchema = z
  .object({
    type: z.nativeEnum(BusinessAddressType).optional(),
    addressLine1: z
      .string()
      .trim()
      .min(1, "Address line 1 cannot be empty")
      .max(255, "Address line 1 cannot exceed 255 characters")
      .optional(),
    addressLine2: z
      .string()
      .trim()
      .max(255, "Address line 2 cannot exceed 255 characters")
      .nullable()
      .optional(),
    landmark: z
      .string()
      .trim()
      .max(255, "Landmark cannot exceed 255 characters")
      .nullable()
      .optional(),
    city: z
      .string()
      .trim()
      .min(1, "City cannot be empty")
      .max(100, "City cannot exceed 100 characters")
      .optional(),
    district: z
      .string()
      .trim()
      .max(100, "District cannot exceed 100 characters")
      .nullable()
      .optional(),
    state: z
      .string()
      .trim()
      .min(1, "State cannot be empty")
      .max(100, "State cannot exceed 100 characters")
      .optional(),
    stateCode: z
      .string()
      .trim()
      .max(10, "State code cannot exceed 10 characters")
      .nullable()
      .optional(),
    postalCode: z
      .string()
      .trim()
      .min(1, "Postal code cannot be empty")
      .max(20, "Postal code cannot exceed 20 characters")
      .optional(),
    country: z
      .string()
      .trim()
      .max(100, "Country cannot exceed 100 characters")
      .optional(),
    countryCode: z
      .string()
      .trim()
      .length(2, "Country code must be 2 characters (e.g. IN)")
      .toUpperCase()
      .optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update address details",
  });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

/**
 * Validation schema for updating business tax profile (PATCH /api/v1/business/tax-profile)
 */
export const updateTaxProfileSchema = z
  .object({
    taxCountry: z
      .string()
      .trim()
      .length(2, "Country code must be 2 characters (e.g. IN)")
      .toUpperCase()
      .optional(),
    taxRegistered: z.boolean().optional(),
    gstRegistered: z.boolean().optional(),
    gstin: z
      .union([
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/,
            "Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)"
          ),
        z.null(),
      ])
      .optional(),
    gstRegistrationType: z
      .union([
        z.nativeEnum(GstRegistrationType, {
          message:
            "GST registration type must be REGULAR, COMPOSITION, UNREGISTERED, or OTHER",
        }),
        z.null(),
      ])
      .optional(),
    gstRegistrationDate: z
      .union([
        z.string().datetime(),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        z.date(),
        z.null(),
      ])
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return val;
        return new Date(val);
      }),
    pan: z
      .union([
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format (e.g. ABCDE1234F)"),
        z.null(),
      ])
      .optional(),
    tan: z
      .union([
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, "Invalid TAN format (e.g. ABCD12345E)"),
        z.null(),
      ])
      .optional(),
    taxpayerName: z
      .union([
        z
          .string()
          .trim()
          .min(1, "Taxpayer name cannot be empty")
          .max(255, "Taxpayer name cannot exceed 255 characters"),
        z.null(),
      ])
      .optional(),
    defaultTaxMode: z
      .nativeEnum(TaxMode, {
        message: "Tax mode must be TAX_EXCLUSIVE or TAX_INCLUSIVE",
      })
      .optional(),
    taxMode: z
      .nativeEnum(TaxMode, {
        message: "Tax mode must be TAX_EXCLUSIVE or TAX_INCLUSIVE",
      })
      .optional(),
    defaultTaxRate: z
      .union([
        z
          .number()
          .min(0, "Tax rate cannot be negative")
          .max(100, "Tax rate cannot exceed 100%"),
        z.null(),
      ])
      .optional(),
    placeOfSupplyStateCode: z
      .union([
        z
          .string()
          .trim()
          .min(1, "Place of supply cannot be empty")
          .max(10, "Place of supply state code cannot exceed 10 characters"),
        z.null(),
      ])
      .optional(),
    placeOfSupply: z
      .union([
        z
          .string()
          .trim()
          .min(1, "Place of supply cannot be empty")
          .max(10, "Place of supply cannot exceed 10 characters"),
        z.null(),
      ])
      .optional(),
    reverseChargeEnabled: z.boolean().optional(),
    reverseCharge: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update tax profile",
  });

export type UpdateTaxProfileInput = z.infer<typeof updateTaxProfileSchema>;

/**
 * Validation schema for accountId route parameter
 */
export const accountIdParamSchema = z
  .object({
    accountId: z
      .string()
      .uuid("Invalid account ID format. Must be a valid UUID."),
  })
  .strict();

export type AccountIdParam = z.infer<typeof accountIdParamSchema>;

/**
 * Validation schema for adding a bank account (POST /api/v1/business/bank-accounts)
 */
export const createBankAccountSchema = z
  .object({
    accountName: z
      .string()
      .trim()
      .min(1, "Account name is required")
      .max(255, "Account name cannot exceed 255 characters"),
    bankName: z
      .string()
      .trim()
      .min(1, "Bank name is required")
      .max(255, "Bank name cannot exceed 255 characters"),
    accountNumber: z
      .string()
      .trim()
      .min(1, "Account number is required")
      .max(100, "Account number cannot exceed 100 characters"),
    ifscCode: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, "IFSC code must be at least 4 characters")
      .max(20, "IFSC code cannot exceed 20 characters")
      .regex(/^[A-Z0-9]+$/, "IFSC code must contain only alphanumeric characters"),
    branchName: z
      .union([
        z.string().trim().max(255, "Branch name cannot exceed 255 characters"),
        z.null(),
      ])
      .optional(),
    accountType: z.nativeEnum(AccountType, {
      message: "Account type must be SAVINGS, CURRENT, or OTHER",
    }),
    upiId: z
      .union([
        z.string().trim().max(255, "UPI ID cannot exceed 255 characters"),
        z.null(),
      ])
      .optional(),
    isPrimary: z.boolean().optional(),
    showOnInvoice: z.boolean().default(true).optional(),
  })
  .strict();

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

/**
 * Validation schema for updating a bank account (PATCH /api/v1/business/bank-accounts/:accountId)
 */
export const updateBankAccountSchema = z
  .object({
    accountName: z
      .string()
      .trim()
      .min(1, "Account name cannot be empty")
      .max(255, "Account name cannot exceed 255 characters")
      .optional(),
    bankName: z
      .string()
      .trim()
      .min(1, "Bank name cannot be empty")
      .max(255, "Bank name cannot exceed 255 characters")
      .optional(),
    accountNumber: z
      .string()
      .trim()
      .min(1, "Account number cannot be empty")
      .max(100, "Account number cannot exceed 100 characters")
      .optional(),
    ifscCode: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, "IFSC code must be at least 4 characters")
      .max(20, "IFSC code cannot exceed 20 characters")
      .regex(/^[A-Z0-9]+$/, "IFSC code must contain only alphanumeric characters")
      .optional(),
    branchName: z
      .union([
        z.string().trim().max(255, "Branch name cannot exceed 255 characters"),
        z.null(),
      ])
      .optional(),
    accountType: z
      .nativeEnum(AccountType, {
        message: "Account type must be SAVINGS, CURRENT, or OTHER",
      })
      .optional(),
    upiId: z
      .union([
        z.string().trim().max(255, "UPI ID cannot exceed 255 characters"),
        z.null(),
      ])
      .optional(),
    isPrimary: z.boolean().optional(),
    showOnInvoice: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update bank account",
  });

export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
