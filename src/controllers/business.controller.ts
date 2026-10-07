import type { Request, Response, NextFunction } from "express";
import { BusinessService } from "../services/business.service.js";

export class BusinessController {
  /**
   * GET /api/v1/business
   * Retrieve business details for the logged-in individual.
   * Strictly resolves the business associated with the authenticated user.
   */
  public static async getBusiness(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getBusinessDetail(userId);

      res.status(200).json({
        success: true,
        message: "Business details retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
