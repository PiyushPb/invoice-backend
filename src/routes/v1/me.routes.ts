import { Router } from "express";
import { MeController } from "../../controllers/me.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.js";
import {
  deleteAccountSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from "../../validators/me.validator.js";

const router = Router();

// All current user routes require JWT authentication
router.use(authenticate);

// GET /api/v1/me - Get full workspace and user profile context
router.get("/", MeController.getMe);

// PATCH /api/v1/me - Update personal profile (firstName, lastName, phone)
router.patch(
  "/",
  validateBody(updateProfileSchema),
  MeController.updateProfile
);

// GET /api/v1/me/preferences - Get localized and notification preferences
router.get("/preferences", MeController.getPreferences);

// PATCH /api/v1/me/preferences - Update localized and notification preferences
router.patch(
  "/preferences",
  validateBody(updatePreferencesSchema),
  MeController.updatePreferences
);

// DELETE /api/v1/me - Controlled account deactivation / soft delete
router.delete(
  "/",
  validateBody(deleteAccountSchema),
  MeController.deleteAccount
);

export default router;
