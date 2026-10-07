import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller.js";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../../validators/auth.validator.js";

const router = Router();

// ==========================================
// Public Authentication Routes
// ==========================================
router.post(
  "/register",
  validateBody(registerSchema),
  AuthController.register
);
router.post("/login", validateBody(loginSchema), AuthController.login);
router.post(
  "/refresh",
  validateBody(refreshTokenSchema),
  AuthController.refresh
);
router.post(
  "/logout",
  optionalAuthenticate,
  validateBody(logoutSchema),
  AuthController.logout
);

// Email Verification
router.post(
  "/verify-email",
  validateBody(verifyEmailSchema),
  AuthController.verifyEmail
);
router.post(
  "/verify-email/resend",
  optionalAuthenticate,
  AuthController.resendVerification
);

// Password Reset Flow
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  AuthController.forgotPassword
);
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  AuthController.resetPassword
);

// ==========================================
// Protected Routes (Require Bearer Token)
// ==========================================
router.post("/logout-all", authenticate, AuthController.logoutAll);

// Session Management
router.get("/sessions", authenticate, AuthController.getSessions);
router.delete("/session/:sessionId", authenticate, AuthController.revokeSession);
router.delete("/sessions/:sessionId", authenticate, AuthController.revokeSession);

export default router;