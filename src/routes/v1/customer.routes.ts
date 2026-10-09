import { Router } from "express";
import { CustomerController } from "../../controllers/customer.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.js";
import {
  addressIdParamSchema,
  createCustomerAddressSchema,
  createCustomerSchema,
  customerIdParamSchema,
  customerInvoiceHistoryQuerySchema,
  listCustomersQuerySchema,
  updateCustomerAddressSchema,
  updateCustomerSchema,
} from "../../validators/customer.validator.js";

const router = Router();

// All customer routes require JWT authentication
router.use(authenticate);

// ============================================================
// Customers
// ============================================================

// POST /api/v1/customers
router.post(
  "/",
  validateBody(createCustomerSchema),
  CustomerController.createCustomer
);

// GET /api/v1/customers
router.get(
  "/",
  validateQuery(listCustomersQuerySchema),
  CustomerController.listCustomers
);

// GET /api/v1/customers/:customerId
router.get(
  "/:customerId",
  validateParams(customerIdParamSchema),
  CustomerController.getCustomer
);

// PATCH /api/v1/customers/:customerId
router.patch(
  "/:customerId",
  validateParams(customerIdParamSchema),
  validateBody(updateCustomerSchema),
  CustomerController.updateCustomer
);

// POST /api/v1/customers/:customerId/archive
router.post(
  "/:customerId/archive",
  validateParams(customerIdParamSchema),
  CustomerController.archiveCustomer
);

// POST /api/v1/customers/:customerId/restore
router.post(
  "/:customerId/restore",
  validateParams(customerIdParamSchema),
  CustomerController.restoreCustomer
);

// DELETE /api/v1/customers/:customerId
router.delete(
  "/:customerId",
  validateParams(customerIdParamSchema),
  CustomerController.deleteCustomer
);

// ============================================================
// Customer Addresses
// ============================================================

// POST /api/v1/customers/:customerId/addresses
router.post(
  "/:customerId/addresses",
  validateParams(customerIdParamSchema),
  validateBody(createCustomerAddressSchema),
  CustomerController.createAddress
);

// PATCH /api/v1/customers/:customerId/addresses/:addressId
router.patch(
  "/:customerId/addresses/:addressId",
  validateParams(addressIdParamSchema),
  validateBody(updateCustomerAddressSchema),
  CustomerController.updateAddress
);

// DELETE /api/v1/customers/:customerId/addresses/:addressId
router.delete(
  "/:customerId/addresses/:addressId",
  validateParams(addressIdParamSchema),
  CustomerController.deleteAddress
);

// ============================================================
// Customer Invoice History & Summary
// ============================================================

// GET /api/v1/customers/:customerId/invoices
router.get(
  "/:customerId/invoices",
  validateParams(customerIdParamSchema),
  validateQuery(customerInvoiceHistoryQuerySchema),
  CustomerController.getInvoiceHistory
);

// GET /api/v1/customers/:customerId/summary
router.get(
  "/:customerId/summary",
  validateParams(customerIdParamSchema),
  CustomerController.getSummary
);

export default router;
