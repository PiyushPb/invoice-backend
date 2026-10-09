import type { Request, Response, NextFunction } from "express";
import { CustomerService } from "../services/customer.service.js";
import type {
  CreateCustomerAddressInput,
  CreateCustomerInput,
  CustomerAddressIdParam,
  CustomerIdParam,
  CustomerInvoiceHistoryQuery,
  ListCustomersQuery,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from "../validators/customer.validator.js";

export class CustomerController {
  // ----------------------------------------------------------
  // Customer CRUD
  // ----------------------------------------------------------

  /**
   * POST /api/v1/customers
   * Creates a new customer. Enforces CUSTOMERS_ACTIVE plan quota.
   */
  public static async createCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateCustomerInput;

      const customer = await CustomerService.createCustomer(userId, input);

      res.status(201).json({
        success: true,
        message: "Customer created successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/customers
   * Returns a paginated, filterable, sortable list of customers.
   */
  public static async listCustomers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = req.query as unknown as ListCustomersQuery;

      const result = await CustomerService.listCustomers(userId, query);

      res.status(200).json({
        success: true,
        message: "Customers retrieved successfully",
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/customers/:customerId
   * Returns a single customer with their addresses.
   */
  public static async getCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;

      const customer = await CustomerService.getCustomer(userId, customerId);

      res.status(200).json({
        success: true,
        message: "Customer retrieved successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/customers/:customerId
   * Updates mutable fields on an existing customer.
   */
  public static async updateCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;
      const input = req.body as UpdateCustomerInput;

      const customer = await CustomerService.updateCustomer(
        userId,
        customerId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Customer updated successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/customers/:customerId/archive
   * Soft-archives the customer. Invoice history is preserved.
   */
  public static async archiveCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;

      const customer = await CustomerService.archiveCustomer(
        userId,
        customerId
      );

      res.status(200).json({
        success: true,
        message: "Customer archived successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/customers/:customerId/restore
   * Restores an archived customer back to ACTIVE status.
   * Re-enforces CUSTOMERS_ACTIVE quota.
   */
  public static async restoreCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;

      const customer = await CustomerService.restoreCustomer(
        userId,
        customerId
      );

      res.status(200).json({
        success: true,
        message: "Customer restored successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/customers/:customerId
   * Hard-deletes a customer only when no invoices reference them.
   * Returns 409 with a descriptive message if invoices exist.
   * Requires OWNER or ADMIN role.
   */
  public static async deleteCustomer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;

      await CustomerService.deleteCustomer(userId, customerId);

      res.status(200).json({
        success: true,
        message: "Customer permanently deleted",
      });
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // Customer Addresses
  // ----------------------------------------------------------

  /**
   * POST /api/v1/customers/:customerId/addresses
   */
  public static async createAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;
      const input = req.body as CreateCustomerAddressInput;

      const address = await CustomerService.createAddress(
        userId,
        customerId,
        input
      );

      res.status(201).json({
        success: true,
        message: "Address added successfully",
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/customers/:customerId/addresses/:addressId
   */
  public static async updateAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId, addressId } =
        req.params as unknown as CustomerAddressIdParam;
      const input = req.body as UpdateCustomerAddressInput;

      const address = await CustomerService.updateAddress(
        userId,
        customerId,
        addressId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Address updated successfully",
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/customers/:customerId/addresses/:addressId
   */
  public static async deleteAddress(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId, addressId } =
        req.params as unknown as CustomerAddressIdParam;

      await CustomerService.deleteAddress(userId, customerId, addressId);

      res.status(200).json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // Customer Invoice History
  // ----------------------------------------------------------

  /**
   * GET /api/v1/customers/:customerId/invoices
   */
  public static async getInvoiceHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;
      const query = req.query as unknown as CustomerInvoiceHistoryQuery;

      const result = await CustomerService.getInvoiceHistory(
        userId,
        customerId,
        query
      );

      res.status(200).json({
        success: true,
        message: "Customer invoice history retrieved successfully",
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // Customer Summary
  // ----------------------------------------------------------

  /**
   * GET /api/v1/customers/:customerId/summary
   */
  public static async getSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { customerId } = req.params as unknown as CustomerIdParam;

      const summary = await CustomerService.getSummary(userId, customerId);

      res.status(200).json({
        success: true,
        message: "Customer summary retrieved successfully",
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }
}
