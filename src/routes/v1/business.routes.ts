import { Router } from "express";
import { BusinessController } from "../../controllers/business.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateBody, validateParams } from "../../middlewares/validate.js";
import {
  accountIdParamSchema,
  addressIdParamSchema,
  createAddressSchema,
  createBankAccountSchema,
  inviteMemberSchema,
  memberIdParamSchema,
  updateAddressSchema,
  updateBankAccountSchema,
  updateBusinessSchema,
  updateMemberRoleSchema,
  updateTaxProfileSchema,
} from "../../validators/business.validator.js";

const router = Router();

// All business routes require JWT authentication
router.use(authenticate);

// ============================================================
// Business Profile
// ============================================================

// GET /api/v1/business - Get business details of the logged-in individual
router.get("/", BusinessController.getBusiness);

// PATCH /api/v1/business - Update business details (OWNER / ADMIN only)
router.patch(
  "/",
  validateBody(updateBusinessSchema),
  BusinessController.updateBusiness
);

// ============================================================
// Business Members
// ============================================================

// GET /api/v1/business/members - Get all members of the business
router.get("/members", BusinessController.getMembers);

// POST /api/v1/business/members/invite - Invite a member (Paid plans only, OWNER / ADMIN only)
router.post(
  "/members/invite",
  validateBody(inviteMemberSchema),
  BusinessController.inviteMember
);

// PATCH /api/v1/business/members/:memberId - Update member role (OWNER / ADMIN only)
router.patch(
  "/members/:memberId",
  validateParams(memberIdParamSchema),
  validateBody(updateMemberRoleSchema),
  BusinessController.updateMemberRole
);

// DELETE /api/v1/business/members/:memberId - Remove member (OWNER / ADMIN only)
router.delete(
  "/members/:memberId",
  validateParams(memberIdParamSchema),
  BusinessController.removeMember
);

// ============================================================
// Business Addresses
// ============================================================

// GET /api/v1/business/addresses - List all business addresses
router.get("/addresses", BusinessController.getAddresses);

// POST /api/v1/business/addresses - Create business address (OWNER / ADMIN only)
router.post(
  "/addresses",
  validateBody(createAddressSchema),
  BusinessController.createAddress
);

// PATCH /api/v1/business/addresses/:addressId - Update business address (OWNER / ADMIN only)
router.patch(
  "/addresses/:addressId",
  validateParams(addressIdParamSchema),
  validateBody(updateAddressSchema),
  BusinessController.updateAddress
);

// DELETE /api/v1/business/addresses/:addressId - Delete business address (OWNER / ADMIN only)
router.delete(
  "/addresses/:addressId",
  validateParams(addressIdParamSchema),
  BusinessController.deleteAddress
);

// ============================================================
// Business Tax Profile
// ============================================================

// GET /api/v1/business/tax-profile - Get tax profile
router.get("/tax-profile", BusinessController.getTaxProfile);

// PATCH /api/v1/business/tax-profile - Update tax profile (OWNER / ADMIN only)
router.patch(
  "/tax-profile",
  validateBody(updateTaxProfileSchema),
  BusinessController.updateTaxProfile
);

// ============================================================
// Business Bank Accounts
// ============================================================

// GET /api/v1/business/bank-accounts - List all bank accounts
router.get("/bank-accounts", BusinessController.getBankAccounts);

// POST /api/v1/business/bank-accounts - Add bank account (OWNER / ADMIN only)
router.post(
  "/bank-accounts",
  validateBody(createBankAccountSchema),
  BusinessController.addBankAccount
);

// PATCH /api/v1/business/bank-accounts/:accountId - Update bank account (OWNER / ADMIN only)
router.patch(
  "/bank-accounts/:accountId",
  validateParams(accountIdParamSchema),
  validateBody(updateBankAccountSchema),
  BusinessController.updateBankAccount
);

// DELETE /api/v1/business/bank-accounts/:accountId - Delete bank account (OWNER / ADMIN only)
router.delete(
  "/bank-accounts/:accountId",
  validateParams(accountIdParamSchema),
  BusinessController.deleteBankAccount
);

// POST /api/v1/business/bank-accounts/:accountId/set-primary - Set primary account (OWNER / ADMIN only)
router.post(
  "/bank-accounts/:accountId/set-primary",
  validateParams(accountIdParamSchema),
  BusinessController.setPrimaryBankAccount
);

export default router;
