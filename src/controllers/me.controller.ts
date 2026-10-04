import type { Request, Response, NextFunction } from "express";
import { MeService } from "../services/me.service.js";

export class MeController {
  /**
   * Return comprehensive user, business, role, subscription, entitlements, and usage context
   */
  public static async getMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Allow client to request a specific workspace context via header or token
      const targetBusinessId =
        (req.headers["x-business-id"] as string | undefined) ||
        req.user?.businessId;

      const result = await MeService.getMe(userId, targetBusinessId);

      res.status(200).json({
        success: true,
        message: "Workspace profile retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
