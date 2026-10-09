import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
    return;
  }

  // 2. Body Parser JSON Syntax Errors (Malformed request JSON)
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status: number }).status === 400
  ) {
    res.status(400).json({
      success: false,
      message: "Malformed JSON payload in request body",
    });
    return;
  }

  // 3. Operational Application Errors (e.g. ConflictError, NotFoundError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // 4. Prisma Database Operational Errors
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const prismaError = err as { code: string; meta?: Record<string, unknown> };

    if (prismaError.code === "P2002") {
      const target = Array.isArray(prismaError.meta?.target)
        ? (prismaError.meta.target as string[]).join(", ")
        : ((prismaError.meta?.target as string | undefined) ?? "field");
      res.status(409).json({
        success: false,
        message: `A record with this ${target} already exists`,
      });
      return;
    }

    if (prismaError.code === "P2025") {
      res.status(404).json({
        success: false,
        message: "The requested record was not found",
      });
      return;
    }

    if (prismaError.code === "P2003") {
      res.status(400).json({
        success: false,
        message: "Referenced resource does not exist or relation constraint failed",
      });
      return;
    }
  }

  // 5. Unhandled Internal Errors
  console.error("[Internal Error]:", err);

  res.status(500).json({
    success: false,
    message: "An internal server error occurred",
  });
}
