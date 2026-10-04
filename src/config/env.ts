import "dotenv/config";

export const config = {
  port: Number(process.env["PORT"]) || 3000,
  nodeEnv: process.env["NODE_ENV"] || "development",
  databaseUrl: process.env["DATABASE_URL"] || "",
  jwt: {
    secret: process.env["JWT_SECRET"] || "super_secret_jwt_key_default",
    accessSecret: process.env["JWT_ACCESS_SECRET"] || process.env["JWT_SECRET"] || "super_secret_access_jwt_key_default",
    accessExpiresIn: process.env["JWT_ACCESS_EXPIRES_IN"] || "15m",
    refreshSecret: process.env["JWT_REFRESH_SECRET"] || "super_secret_refresh_jwt_key_default",
    refreshExpiresIn: process.env["JWT_REFRESH_EXPIRES_IN"] || "7d",
  },
};
