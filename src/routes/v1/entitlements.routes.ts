import { Router } from "express";
import { UsageController } from "../../controllers/usage.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// All entitlement endpoints require authentication
router.use(authenticate);

// GET /api/v1/entitlements
router.get("/", UsageController.getEntitlements);

export default router;
