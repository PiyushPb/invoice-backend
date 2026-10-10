import { Router } from "express";
import { UsageController } from "../../controllers/usage.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// All usage endpoints require authentication
router.use(authenticate);

// GET /api/v1/usage
router.get("/", UsageController.getCurrentUsage);

// GET /api/v1/usage/entitlements
router.get("/entitlements", UsageController.getEntitlements);

export default router;
