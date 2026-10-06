export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  business: {
    name: string;
    businessType: string;
    countryCode: string;
    currencyCode: string;
  };
}

let counter = 0;

/**
 * Generates a unique email with timestamp and counter to avoid collisions across runs
 */
export function generateUniqueEmail(prefix = "test"): string {
  counter += 1;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}_${timestamp}_${counter}_${random}@example.com`.toLowerCase();
}

/**
 * Standard password guaranteed to meet all complexity constraints:
 * - >= 8 chars
 * - >= 1 uppercase
 * - >= 1 lowercase
 * - >= 1 digit
 * - >= 1 special character
 */
export const DEFAULT_PASSWORD = "StrongP@ssw0rd!2026";

/**
 * Generates a completely valid registration payload
 */
export function generateValidRegisterPayload(
  overrides: Partial<RegisterPayload> = {}
): RegisterPayload {
  const email = overrides.email || generateUniqueEmail("user");
  return {
    firstName: "Test",
    lastName: "Tester",
    email,
    password: DEFAULT_PASSWORD,
    business: {
      name: "Test Corp Private Limited",
      businessType: "INDIVIDUAL",
      countryCode: "IN",
      currencyCode: "INR",
      ...(overrides.business || {}),
    },
    ...overrides,
  };
}

export const VALID_BUSINESS_TYPES = [
  "INDIVIDUAL",
  "SOLE_PROPRIETORSHIP",
  "PARTNERSHIP",
  "LLP",
  "PRIVATE_LIMITED",
  "PUBLIC_LIMITED",
  "TRUST",
  "SOCIETY",
  "OTHER",
] as const;
