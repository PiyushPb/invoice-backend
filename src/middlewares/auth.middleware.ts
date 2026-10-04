import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type UserTokenPayload } from "../utils/jwt.utils.js";
import { UnauthorizedError } from "../utils/errors.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
    }
  }
}

/**
 * Middleware to require and verify JWT Bearer access token
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authentication token is missing or malformed");
  }

  const token = authHeader.split(" ")[1]?.trim();
  if (!token) {
    throw new UnauthorizedError("Authentication token is missing");
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired authentication token");
  }
};

/**
 * Middleware that extracts and verifies JWT if present, without blocking unauthenticated requests
 */
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1]?.trim();
    if (token) {
      try {
        req.user = verifyAccessToken(token);
      } catch {
        // Token is invalid/expired; continue without user session
      }
    }
  }
  next();
};
