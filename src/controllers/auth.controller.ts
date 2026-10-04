import type { Request, Response, NextFunction } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validators/auth.validator.js";
import { AuthService } from "../services/auth.service.js";
import { SessionService } from "../services/session.service.js";
import { parseDeviceInfo } from "../utils/device.utils.js";
import { NotFoundError } from "../utils/errors.js";

export class AuthController {
  /**
   * Handle user registration and initial business workspace setup with active session
   */
  public static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedData = registerSchema.parse(req.body);
      const deviceInfo = parseDeviceInfo(req);

      const result = await AuthService.register(validatedData, deviceInfo);

      res.status(201).json({
        success: true,
        message: "Registration successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle user authentication with email and password, creating session with MAX 5 eviction
   */
  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);
      const deviceInfo = parseDeviceInfo(req);

      const result = await AuthService.login(validatedData, deviceInfo);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rotate refresh token and obtain new access and refresh token pair
   */
  public static async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      const deviceInfo = parseDeviceInfo(req);

      const result = await AuthService.refreshToken(refreshToken, deviceInfo);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user by revoking current session
   */
  public static async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = logoutSchema.parse(req.body);
      const userId = req.user?.userId;

      await AuthService.logout(refreshToken, userId);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user from all devices by revoking all active sessions
   */
  public static async logoutAll(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const revokedCount = await AuthService.logoutAll(userId);

      res.status(200).json({
        success: true,
        message: "Logged out from all devices successfully",
        data: {
          revokedSessionsCount: revokedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify user email address with token
   */
  public static async verifyEmail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token } = verifyEmailSchema.parse(req.body);
      await AuthService.verifyEmail(token);

      res.status(200).json({
        success: true,
        message: "Email address verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend email verification token
   */
  public static async resendVerification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const email = req.body.email || req.user?.email;
      const { email: validatedEmail } = resendVerificationSchema.parse({ email });

      const result = await AuthService.resendVerification(validatedEmail);

      res.status(200).json({
        success: true,
        message: result.message,
        ...(result.previewToken ? { previewToken: result.previewToken } : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send password reset token to user email
   */
  public static async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const result = await AuthService.forgotPassword(email);

      res.status(200).json({
        success: true,
        message: result.message,
        ...(result.previewToken ? { previewToken: result.previewToken } : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset user password using token
   */
  public static async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);
      await AuthService.resetPassword(token, newPassword);

      res.status(200).json({
        success: true,
        message:
          "Password has been reset successfully. Please log in with your new password.",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Return authenticated user profile and permissions
   */
  public static async getMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await AuthService.getMe(userId);

      res.status(200).json({
        success: true,
        message: "User profile retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Return active sessions for the current user (max 5)
   */
  public static async getSessions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const sessions = await SessionService.getUserActiveSessions(userId);

      res.status(200).json({
        success: true,
        message: "Active sessions retrieved successfully",
        data: {
          totalActive: sessions.length,
          maxAllowed: SessionService.MAX_ACTIVE_SESSIONS,
          sessions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke a specific user session by session ID
   */
  public static async revokeSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const sessionId = req.params["sessionId"] as string;

      const revoked = await SessionService.revokeSession(userId, sessionId);
      if (!revoked) {
        throw new NotFoundError("Session not found or already revoked");
      }

      res.status(200).json({
        success: true,
        message: "Session revoked successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
