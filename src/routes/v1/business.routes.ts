import { Router } from "express";
import { BusinessController } from "../../controllers/business.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// All business routes require JWT authentication
router.use(authenticate);

// GET /api/v1/business - Get business details of the logged-in individual
router.get("/", BusinessController.getBusiness);

export default router;
