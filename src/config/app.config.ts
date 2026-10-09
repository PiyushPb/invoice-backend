import "dotenv/config";

function getEnvString(key: string, defaultValue: string): string {
  const val = process.env[key];
  if (val !== undefined && val.trim().length > 0) {
    return val.trim();
  }
  return defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val !== undefined && val.trim().length > 0) {
    const parsed = Number(val);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

export const appConfig = {
  port: getEnvNumber("PORT", 3000),
  nodeEnv: getEnvString("NODE_ENV", "development"),
  databaseUrl: getEnvString("DATABASE_URL", ""),
  jwt: {
    secret: getEnvString("JWT_SECRET", "super_secret_jwt_key_default"),
    accessSecret: getEnvString(
      "JWT_ACCESS_SECRET",
      getEnvString("JWT_SECRET", "super_secret_access_jwt_key_default")
    ),
    accessExpiresIn: getEnvString("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshSecret: getEnvString(
      "JWT_REFRESH_SECRET",
      "super_secret_refresh_jwt_key_default"
    ),
    refreshExpiresIn: getEnvString("JWT_REFRESH_EXPIRES_IN", "7d"),
  },
  businessDefaults: {
    currency: "INR",
    countryCode: "IN",
    country: "India",
    dueDays: 7,
    invoicePrefix: "INV",
    template: "DEFAULT",
    showLogo: true,
    showSignature: false,
    showBankDetails: true,
    showPaymentDetails: true,
  },
} as const;
