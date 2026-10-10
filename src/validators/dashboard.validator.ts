import { z } from "zod";

/**
 * Validator for GET /api/v1/dashboard/stats query parameters.
 * Supports:
 *   ?period=30d
 *   or:
 *   ?from=2026-09-01&to=2026-10-01
 */
export const dashboardStatsQuerySchema = z
  .object({
    period: z
      .string()
      .trim()
      .regex(
        /^(7d|14d|30d|60d|90d|180d|365d|1y|today|this_month|last_month|all)$/i,
        "period must be one of: 7d, 14d, 30d, 60d, 90d, 180d, 365d, 1y, today, this_month, last_month, all"
      )
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return data.from <= data.to;
      }
      return true;
    },
    {
      message: "'from' date must be earlier than or equal to 'to' date",
      path: ["from"],
    }
  );

export type DashboardStatsQuery = z.infer<typeof dashboardStatsQuerySchema>;
