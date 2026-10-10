import type { Request, Response, NextFunction } from "express";
import { InvoiceService } from "../services/invoice.service.js";
import type {
  CreateInvoiceInput,
  CreateInvoicePaymentInput,
  InvoiceIdParam,
  InvoicePaymentIdParam,
  ListInvoicesQuery,
  RefundPaymentInput,
  UpdateInvoiceDraftInput,
  UpdateInvoicePaymentInput,
} from "../validators/invoice.validator.js";

export class InvoiceController {
  /**
   * GET /api/v1/invoices
   * Returns a paginated, filterable, and sortable list of invoices.
   */
  public static async listInvoices(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = req.query as unknown as ListInvoicesQuery;

      const result = await InvoiceService.listInvoices(userId, query);

      res.status(200).json({
        success: true,
        message: "Invoices retrieved successfully",
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/invoices/:invoiceId
   * Returns a single invoice by ID with line items, customer, and payments.
   */
  public static async getInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const invoice = await InvoiceService.getInvoice(userId, invoiceId);

      res.status(200).json({
        success: true,
        message: "Invoice retrieved successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices
   * Creates a new invoice. Enforces 50-lifetime-invoice quota.
   */
  public static async createInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateInvoiceInput;

      const invoice = await InvoiceService.createInvoice(userId, input);

      res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/invoices/:invoiceId
   * Updates an existing draft invoice. Rejects modification if not DRAFT.
   */
  public static async updateDraft(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;
      const input = req.body as UpdateInvoiceDraftInput;

      const invoice = await InvoiceService.updateDraft(
        userId,
        invoiceId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Draft invoice updated successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/invoices/:invoiceId
   * Deletes a draft invoice. Strictly guards against deleting issued invoices.
   */
  public static async deleteDraft(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      await InvoiceService.deleteDraft(userId, invoiceId);

      res.status(200).json({
        success: true,
        message: "Draft invoice deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/issue
   * Issues a draft invoice, locks sequence, calculates totals, and creates event.
   */
  public static async issueInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const invoice = await InvoiceService.issueInvoice(userId, invoiceId);

      res.status(200).json({
        success: true,
        message: "Invoice issued successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/send
   * Dispatches the invoice to the customer.
   */
  public static async sendInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;
      const input = req.body;

      const invoice = await InvoiceService.sendInvoice(
        userId,
        invoiceId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Invoice sent successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/pdf
   * Generates or records PDF generation for an invoice.
   */
  public static async generatePdf(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const result = await InvoiceService.generatePdf(userId, invoiceId);

      res.status(200).json({
        success: true,
        message: "PDF generated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/invoices/:invoiceId/pdf
   * Downloads/streams the invoice PDF document.
   */
  public static async getPdf(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const { pdfBuffer, filename } = await InvoiceService.getPdf(
        userId,
        invoiceId
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${filename}"`
      );
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/cancel
   * Cancels an invoice.
   */
  public static async cancelInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;
      const input = req.body;

      const invoice = await InvoiceService.cancelInvoice(
        userId,
        invoiceId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Invoice cancelled successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/void
   * Voids an invoice for audit compliance.
   */
  public static async voidInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;
      const input = req.body;

      const invoice = await InvoiceService.voidInvoice(
        userId,
        invoiceId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Invoice voided successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/duplicate
   * Duplicates an existing invoice into a brand new draft with a fresh number.
   */
  public static async duplicateInvoice(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const invoice = await InvoiceService.duplicateInvoice(
        userId,
        invoiceId
      );

      res.status(201).json({
        success: true,
        message: "Invoice duplicated successfully",
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/invoices/:invoiceId/events
   * Returns the audit event history for an invoice.
   */
  public static async getInvoiceEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const events = await InvoiceService.getInvoiceEvents(
        userId,
        invoiceId
      );

      res.status(200).json({
        success: true,
        message: "Invoice events retrieved successfully",
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // Invoice Payments
  // ============================================================

  /**
   * GET /api/v1/invoices/:invoiceId/payments
   * Returns list of payments recorded against the invoice.
   */
  public static async listPayments(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;

      const payments = await InvoiceService.listPayments(userId, invoiceId);

      res.status(200).json({
        success: true,
        message: "Invoice payments retrieved successfully",
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/payments
   * Records a payment against an invoice.
   */
  public static async recordPayment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId } = req.params as unknown as InvoiceIdParam;
      const input = req.body as CreateInvoicePaymentInput;

      const result = await InvoiceService.recordPayment(
        userId,
        invoiceId,
        input
      );

      res.status(201).json({
        success: true,
        message: "Payment recorded successfully",
        data: {
          payment: result.payment,
          invoiceSummary: result.invoiceSummary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/invoices/:invoiceId/payments/:paymentId
   * Updates an existing completed payment.
   */
  public static async updatePayment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId, paymentId } =
        req.params as unknown as InvoicePaymentIdParam;
      const input = req.body as UpdateInvoicePaymentInput;

      const payment = await InvoiceService.updatePayment(
        userId,
        invoiceId,
        paymentId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Payment updated successfully",
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/invoices/:invoiceId/payments/:paymentId/refund
   * Refunds/reverses a payment.
   */
  public static async refundPayment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId, paymentId } =
        req.params as unknown as InvoicePaymentIdParam;
      const input = req.body as RefundPaymentInput;

      const payment = await InvoiceService.refundPayment(
        userId,
        invoiceId,
        paymentId,
        input
      );

      res.status(200).json({
        success: true,
        message: "Payment refunded successfully",
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/invoices/:invoiceId/payments/:paymentId
   * Reverses the payment (financial audit trail preserved, not destroyed).
   */
  public static async deletePayment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { invoiceId, paymentId } =
        req.params as unknown as InvoicePaymentIdParam;

      const payment = await InvoiceService.deletePayment(
        userId,
        invoiceId,
        paymentId
      );

      res.status(200).json({
        success: true,
        message:
          "Payment reversed and marked as refunded (financial audit trail preserved)",
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }
}


