import type { Request, Response, NextFunction } from "express";
import { MeService } from "../services/me.service.js";
import { parseDeviceInfo } from "../utils/device.utils.js";
import type {
  DeleteAccountInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from "../validators/me.validator.js";

export class MeController {
  /**
   * Return comprehensive user, business, role, subscription, entitlements, and usage context
   * GET /api/v1/me
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
        (req.headers["x-business-id"] as string | undefined) ??
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

  /**
   * Update personal profile (firstName, lastName, phone)
   * PATCH /api/v1/me
   */
  public static async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as UpdateProfileInput;
      const deviceInfo = parseDeviceInfo(req);

      const result = await MeService.updateProfile(userId, input, {
        ipAddress: deviceInfo.ipAddress ?? undefined,
        userAgent: deviceInfo.userAgent ?? undefined,
      });

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve localization and notification preferences
   * GET /api/v1/me/preferences
   */
  public static async getPreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;

      const result = await MeService.getPreferences(userId);

      res.status(200).json({
        success: true,
        message: "Preferences retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update localization and notification preferences
   * PATCH /api/v1/me/preferences
   */
  public static async updatePreferences(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as UpdatePreferencesInput;
      const deviceInfo = parseDeviceInfo(req);

      const result = await MeService.updatePreferences(userId, input, {
        ipAddress: deviceInfo.ipAddress ?? undefined,
        userAgent: deviceInfo.userAgent ?? undefined,
      });

      res.status(200).json({
        success: true,
        message: "Preferences updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Carefully controlled account deactivation / soft delete
   * DELETE /api/v1/me
   */
  public static async deleteAccount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as DeleteAccountInput;
      const deviceInfo = parseDeviceInfo(req);

      const result = await MeService.deleteAccount(userId, input, {
        ipAddress: deviceInfo.ipAddress ?? undefined,
        userAgent: deviceInfo.userAgent ?? undefined,
      });

      res.status(200).json({
        success: true,
        message:
          "Account has been successfully deactivated and scheduled for deletion",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
