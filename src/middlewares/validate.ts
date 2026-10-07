import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/**
 * Reusable middleware to validate request body using a Zod schema
 */
export const validateBody =
  (schema: ZodSchema) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Reusable middleware to validate request route params using a Zod schema
 */
export const validateParams =
  (schema: ZodSchema) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.params);
      Object.defineProperty(req, "params", {
        value: parsed,
        writable: true,
        configurable: true,
      });
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Reusable middleware to validate request URL query parameters using a Zod schema
 */
export const validateQuery =
  (schema: ZodSchema) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.query);
      Object.defineProperty(req, "query", {
        value: parsed,
        writable: true,
        configurable: true,
      });
      next();
    } catch (error) {
      next(error);
    }
  };


