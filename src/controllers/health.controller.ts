import type { Request, Response } from "express";
import { HealthService } from "../services/health.service.js";

export class HealthController {
  public static async getHealth(_req: Request, res: Response): Promise<void> {
    const health = await HealthService.checkHealth();

    const responsePayload = {
      success: health.isHealthy,
      status: health.isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: health.uptimeSeconds,
      services: {
        database: health.databaseStatus,
      },
    };

    const statusCode = health.isHealthy ? 200 : 503;
    res.status(statusCode).json(responsePayload);
  }
}
