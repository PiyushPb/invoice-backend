import type { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service.js";
import type { DashboardStatsQuery } from "../validators/dashboard.validator.js";

export class DashboardController {
  /**
   * GET /api/v1/dashboard
   * Returns dashboard overview metrics:
   * total, draft, paid, unpaid, overdue invoices,
   * total revenue, total outstanding,
   * recent invoices and recent payments.
   */
  public static async getOverview(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const targetBusinessId =
        (req.headers["x-business-id"] as string | undefined) ??
        req.user?.businessId;

      const data = await DashboardService.getOverview(userId, targetBusinessId);

      res.status(200).json({
        success: true,
        message: "Dashboard overview retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/stats
   * Returns statistics and analytics over a period or date range:
   * ?period=30d
   * or:
   * ?from=2026-09-01&to=2026-10-01
   */
  public static async getStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const targetBusinessId =
        (req.headers["x-business-id"] as string | undefined) ??
        req.user?.businessId;
      const query = req.query as unknown as DashboardStatsQuery;

      const data = await DashboardService.getStats(userId, query, targetBusinessId);

      res.status(200).json({
        success: true,
        message: "Dashboard statistics retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
