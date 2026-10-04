import { prisma } from "../config/prisma.js";

export interface HealthCheckResult {
  isHealthy: boolean;
  databaseStatus: "healthy" | "unreachable";
  uptimeSeconds: number;
}

export class HealthService {
  public static async checkHealth(): Promise<HealthCheckResult> {
    let databaseStatus: "healthy" | "unreachable" = "unreachable";
    let isHealthy = false;

    try {
      // Simple lightweight query to verify connectivity without leaking schema or table information
      await prisma.$queryRaw`SELECT 1`;
      databaseStatus = "healthy";
      isHealthy = true;
    } catch {
      // Error is caught and kept internal to avoid exposing sensitive connection or stack trace info
      databaseStatus = "unreachable";
      isHealthy = false;
    }

    return {
      isHealthy,
      databaseStatus,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
