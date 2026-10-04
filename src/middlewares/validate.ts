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
