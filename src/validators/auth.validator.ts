import { z } from "zod";
import { BusinessType } from "../generated/prisma/enums.js";

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must not exceed 100 characters"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(320, "Email must not exceed 320 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  business: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Business name is required")
      .max(255, "Business name must not exceed 255 characters"),
    businessType: z
      .nativeEnum(BusinessType)
      .default(BusinessType.INDIVIDUAL),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Country code must be a 2-character ISO code (e.g. IN)")
      .default("IN"),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(3, "Currency code must be a 3-character ISO code (e.g. INR)")
      .default("INR"),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(320, "Email must not exceed 320 characters"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(320, "Email must not exceed 320 characters"),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(320, "Email must not exceed 320 characters"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Password reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const sessionIdParamSchema = z.object({
  sessionId: z
    .string()
    .uuid("Invalid session ID format. Must be a valid UUID."),
});
export type SessionIdParamInput = z.infer<typeof sessionIdParamSchema>;
