import type { Request, Response, NextFunction } from "express";
import { BusinessService } from "../services/business.service.js";
import type {
  CreateAddressInput,
  CreateBankAccountInput,
  InviteMemberInput,
  UpdateAddressInput,
  UpdateBankAccountInput,
  UpdateBusinessInput,
  UpdateMemberRoleInput,
  UpdateTaxProfileInput,
} from "../validators/business.validator.js";

export class BusinessController {
  /**
   * GET /api/v1/business
   * Retrieve business details for the logged-in individual.
   */
  public static async getBusiness(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getBusinessDetail(userId);

      res.status(200).json({
        success: true,
        message: "Business details retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/business
   * Update business details for the logged-in individual's active workspace.
   * Requires OWNER or ADMIN role.
   */
  public static async updateBusiness(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as UpdateBusinessInput;
      const result = await BusinessService.updateBusiness(userId, input);

      res.status(200).json({
        success: true,
        message: "Business details updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/business/members
   * List all members of the active business workspace.
   */
  public static async getMembers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getMembers(userId);

      res.status(200).json({
        success: true,
        message: "Business members retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/business/members/invite
   * Invite a new member to the business.
   * Requires OWNER or ADMIN role and non-free subscription tier.
   */
  public static async inviteMember(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as InviteMemberInput;
      const result = await BusinessService.inviteMember(userId, input);

      res.status(201).json({
        success: true,
        message: "Member invited successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/business/members/:memberId
   * Update a team member's role.
   * Requires OWNER or ADMIN role.
   */
  public static async updateMemberRole(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const memberId = req.params["memberId"] as string;
      const input = req.body as UpdateMemberRoleInput;
      const result = await BusinessService.updateMemberRole(
        userId,
        memberId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Member role updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/business/members/:memberId
   * Remove a member from the business.
   * Requires OWNER or ADMIN role.
   */
  public static async removeMember(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const memberId = req.params["memberId"] as string;
      const result = await BusinessService.removeMember(userId, memberId);

      res.status(200).json({
        success: true,
        message: "Member removed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/business/addresses
   * List all addresses of the business.
   */
  public static async getAddresses(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getAddresses(userId);

      res.status(200).json({
        success: true,
        message: "Business addresses retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/business/addresses
   * Create a new address for the business.
   * Requires OWNER or ADMIN role.
   */
  public static async createAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateAddressInput;
      const result = await BusinessService.createAddress(userId, input);

      res.status(201).json({
        success: true,
        message: "Address created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/business/addresses/:addressId
   * Update an existing business address.
   * Requires OWNER or ADMIN role.
   */
  public static async updateAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const addressId = req.params["addressId"] as string;
      const input = req.body as UpdateAddressInput;
      const result = await BusinessService.updateAddress(
        userId,
        addressId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Address updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/business/addresses/:addressId
   * Delete a business address.
   * Requires OWNER or ADMIN role.
   */
  public static async deleteAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const addressId = req.params["addressId"] as string;
      const result = await BusinessService.deleteAddress(userId, addressId);

      res.status(200).json({
        success: true,
        message: "Address deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // Business Tax Profile
  // ============================================================

  /**
   * GET /api/v1/business/tax-profile
   * Retrieve tax profile for the logged-in individual's business.
   */
  public static async getTaxProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getTaxProfile(userId);

      res.status(200).json({
        success: true,
        message: "Tax profile retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/business/tax-profile
   * Update tax profile for the logged-in individual's business.
   * Requires OWNER or ADMIN role.
   */
  public static async updateTaxProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as UpdateTaxProfileInput;
      const result = await BusinessService.updateTaxProfile(userId, input);

      res.status(200).json({
        success: true,
        message: "Tax profile updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // Business Bank Accounts
  // ============================================================

  /**
   * GET /api/v1/business/bank-accounts
   * List all bank accounts for the logged-in individual's business.
   */
  public static async getBankAccounts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await BusinessService.getBankAccounts(userId);

      res.status(200).json({
        success: true,
        message: "Bank accounts retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/business/bank-accounts
   * Add a new bank account.
   * Requires OWNER or ADMIN role.
   */
  public static async addBankAccount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateBankAccountInput;
      const result = await BusinessService.addBankAccount(userId, input);

      res.status(201).json({
        success: true,
        message: "Bank account added successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/business/bank-accounts/:accountId
   * Update an existing bank account.
   * Requires OWNER or ADMIN role.
   */
  public static async updateBankAccount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const accountId = req.params["accountId"] as string;
      const input = req.body as UpdateBankAccountInput;
      const result = await BusinessService.updateBankAccount(
        userId,
        accountId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Bank account updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/business/bank-accounts/:accountId
   * Delete a bank account.
   * Requires OWNER or ADMIN role.
   */
  public static async deleteBankAccount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const accountId = req.params["accountId"] as string;
      const result = await BusinessService.deleteBankAccount(userId, accountId);

      res.status(200).json({
        success: true,
        message: "Bank account deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/business/bank-accounts/:accountId/set-primary
   * Set a bank account as primary.
   * Requires OWNER or ADMIN role.
   */
  public static async setPrimaryBankAccount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const accountId = req.params["accountId"] as string;
      const result = await BusinessService.setPrimaryBankAccount(
        userId,
        accountId
      );

      res.status(200).json({
        success: true,
        message: "Bank account set as primary successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
