import type { Request, Response, NextFunction } from "express";
import { UsageService } from "../services/usage.service.js";

export class UsageController {
  /**
   * GET /api/v1/usage
   * Returns current resource consumption and remaining quota limits.
   */
  public static async getCurrentUsage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const targetBusinessId =
        (req.headers["x-business-id"] as string | undefined) ??
        req.user?.businessId;

      const data = await UsageService.getCurrentUsage(
        userId,
        targetBusinessId
      );

      res.status(200).json({
        success: true,
        message: "Current usage retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/entitlements
   * Returns feature capability entitlements for the active plan.
   */
  public static async getEntitlements(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const targetBusinessId =
        (req.headers["x-business-id"] as string | undefined) ??
        req.user?.businessId;

      const data = await UsageService.getEntitlements(
        userId,
        targetBusinessId
      );

      res.status(200).json({
        success: true,
        message: "Feature entitlements retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
