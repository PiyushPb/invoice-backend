import type { Request, Response, NextFunction } from "express";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";
import { AuthService } from "../services/auth.service.js";

export class AuthController {
  /**
   * Handle user registration and initial business workspace setup
   */
  public static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedData = registerSchema.parse(req.body);
      const result = await AuthService.register(validatedData);

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
   * Handle user authentication with email and password
   */
  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);

      const metadata = {
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"] || null,
      };

      const result = await AuthService.login(validatedData, metadata);

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
}
