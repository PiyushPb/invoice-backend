import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// Public auth routes
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);

// Protected auth routes
router.get("/me", authenticate, AuthController.getMe);

export default router;