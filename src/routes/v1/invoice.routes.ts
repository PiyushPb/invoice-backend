import { Router } from "express";
import { InvoiceController } from "../../controllers/invoice.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.js";
import {
  cancelInvoiceSchema,
  createInvoiceSchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  sendInvoiceSchema,
  updateInvoiceDraftSchema,
  voidInvoiceSchema,
} from "../../validators/invoice.validator.js";

const router = Router();

// All invoice routes require JWT authentication
router.use(authenticate);

// ============================================================
// Core Invoices CRUD
// ============================================================

// GET /api/v1/invoices
router.get(
  "/",
  validateQuery(listInvoicesQuerySchema),
  InvoiceController.listInvoices
);

// GET /api/v1/invoices/:invoiceId
router.get(
  "/:invoiceId",
  validateParams(invoiceIdParamSchema),
  InvoiceController.getInvoice
);

// POST /api/v1/invoices
router.post(
  "/",
  validateBody(createInvoiceSchema),
  InvoiceController.createInvoice
);

// PATCH /api/v1/invoices/:invoiceId
router.patch(
  "/:invoiceId",
  validateParams(invoiceIdParamSchema),
  validateBody(updateInvoiceDraftSchema),
  InvoiceController.updateDraft
);

// DELETE /api/v1/invoices/:invoiceId
router.delete(
  "/:invoiceId",
  validateParams(invoiceIdParamSchema),
  InvoiceController.deleteDraft
);

// ============================================================
// Invoice Lifecycle Actions
// ============================================================

// POST /api/v1/invoices/:invoiceId/issue
router.post(
  "/:invoiceId/issue",
  validateParams(invoiceIdParamSchema),
  InvoiceController.issueInvoice
);

// POST /api/v1/invoices/:invoiceId/send
router.post(
  "/:invoiceId/send",
  validateParams(invoiceIdParamSchema),
  validateBody(sendInvoiceSchema),
  InvoiceController.sendInvoice
);

// POST /api/v1/invoices/:invoiceId/pdf
router.post(
  "/:invoiceId/pdf",
  validateParams(invoiceIdParamSchema),
  InvoiceController.generatePdf
);

// GET /api/v1/invoices/:invoiceId/pdf
router.get(
  "/:invoiceId/pdf",
  validateParams(invoiceIdParamSchema),
  InvoiceController.getPdf
);

// POST /api/v1/invoices/:invoiceId/cancel
router.post(
  "/:invoiceId/cancel",
  validateParams(invoiceIdParamSchema),
  validateBody(cancelInvoiceSchema),
  InvoiceController.cancelInvoice
);

// POST /api/v1/invoices/:invoiceId/void
router.post(
  "/:invoiceId/void",
  validateParams(invoiceIdParamSchema),
  validateBody(voidInvoiceSchema),
  InvoiceController.voidInvoice
);

// POST /api/v1/invoices/:invoiceId/duplicate
router.post(
  "/:invoiceId/duplicate",
  validateParams(invoiceIdParamSchema),
  InvoiceController.duplicateInvoice
);

// GET /api/v1/invoices/:invoiceId/events
router.get(
  "/:invoiceId/events",
  validateParams(invoiceIdParamSchema),
  InvoiceController.getInvoiceEvents
);

export default router;

