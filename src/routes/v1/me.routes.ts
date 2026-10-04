import { Router } from "express";
import { MeController } from "../../controllers/me.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// GET /api/v1/me
router.get("/", authenticate, MeController.getMe);

export default router;
