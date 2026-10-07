import { z } from "zod";

/**
 * Validation schema for updating user personal profile (PATCH /api/v1/me)
 * Restricts updates to firstName, lastName, and phone.
 * Explicitly guards against changing email, role, status, or password via this endpoint.
 */
export const updateProfileSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "First name cannot be empty")
      .max(100, "First name must not exceed 100 characters")
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(1, "Last name cannot be empty")
      .max(100, "Last name must not exceed 100 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number must not exceed 30 characters")
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.phone !== undefined,
    {
      message: "At least one field (firstName, lastName, or phone) must be provided to update profile",
    }
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Validation schema for updating user localization and notification preferences (PATCH /api/v1/me/preferences)
 */
export const updatePreferencesSchema = z
  .object({
    language: z
      .string()
      .trim()
      .min(2, "Language must be at least 2 characters")
      .max(10, "Language must not exceed 10 characters")
      .optional(),
    timezone: z
      .string()
      .trim()
      .min(1, "Timezone cannot be empty")
      .max(50, "Timezone must not exceed 50 characters")
      .optional(),
    dateFormat: z
      .string()
      .trim()
      .min(1, "Date format cannot be empty")
      .max(30, "Date format must not exceed 30 characters")
      .optional(),
    numberFormat: z
      .string()
      .trim()
      .min(1, "Number format cannot be empty")
      .max(30, "Number format must not exceed 30 characters")
      .optional(),
    emailNotifications: z.boolean().optional(),
    paymentNotifications: z.boolean().optional(),
    marketingEmails: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.language !== undefined ||
      data.timezone !== undefined ||
      data.dateFormat !== undefined ||
      data.numberFormat !== undefined ||
      data.emailNotifications !== undefined ||
      data.paymentNotifications !== undefined ||
      data.marketingEmails !== undefined,
    {
      message: "At least one preference setting must be provided to update preferences",
    }
  );

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/**
 * Validation schema for controlled account deletion (DELETE /api/v1/me)
 * Requires password confirmation to prevent accidental or malicious CSRF deactivation.
 */
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1, "Password is required to confirm account deletion"),
    reason: z
      .string()
      .trim()
      .max(500, "Reason must not exceed 500 characters")
      .optional(),
  })
  .strict();

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
