import { Router } from "express";
import { DashboardController } from "../../controllers/dashboard.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateQuery } from "../../middlewares/validate.js";
import { dashboardStatsQuerySchema } from "../../validators/dashboard.validator.js";

const router = Router();

// All dashboard endpoints require JWT authentication
router.use(authenticate);

// GET /api/v1/dashboard and GET /api/v1/dashboard/overview
router.get("/", DashboardController.getOverview);
router.get("/overview", DashboardController.getOverview);

// GET /api/v1/dashboard/stats
router.get(
  "/stats",
  validateQuery(dashboardStatsQuerySchema),
  DashboardController.getStats
);

export default router;
