import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller.js";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";

const router = Router();

// ==========================================
// Public Authentication Routes
// ==========================================
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/logout", optionalAuthenticate, AuthController.logout);

// Email Verification
router.post("/verify-email", AuthController.verifyEmail);
router.post("/verify-email/resend", optionalAuthenticate, AuthController.resendVerification);

// Password Reset Flow
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

// ==========================================
// Protected Routes (Require Bearer Token)
// ==========================================
router.post("/logout-all", authenticate, AuthController.logoutAll);

// Session Management
router.get("/sessions", authenticate, AuthController.getSessions);
router.delete("/session/:sessionId", authenticate, AuthController.revokeSession);
router.delete("/sessions/:sessionId", authenticate, AuthController.revokeSession);

export default router;