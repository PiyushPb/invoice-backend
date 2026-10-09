import { describe, expect, it } from "vitest";
import {
  generateUpiQrPayload,
  isValidUpiId,
  normalizeUpiId,
  UPI_ID_REGEX,
} from "../../src/utils/upi.util.js";

describe("UPI Utility & QR Payload Generator", () => {
  describe("isValidUpiId", () => {
    it("should accept valid UPI IDs across popular Indian banks and PSPs", () => {
      const validIds = [
        "merchant@okhdfcbank",
        "john.doe@okaxis",
        "9876543210@paytm",
        "user_name@icici",
        "business-sales@sbi",
        "store.123@ybl",
        "rahul@upi",
        "tech-solutions@barodampay",
        "support@ibl",
      ];

      for (const id of validIds) {
        expect(isValidUpiId(id)).toBe(true);
      }
    });

    it("should reject invalid UPI ID formats", () => {
      const invalidIds = [
        "",
        "   ",
        "invalidvpa", // No @
        "@okhdfcbank", // No handle before @
        "user@", // No handle after @
        "user@@paytm", // Double @
        "a@b", // Too short
        "user@bank@extra", // Multiple @
        "user name@hdfc", // Spaces
        "user!#$@bank", // Special characters not allowed
      ];

      for (const id of invalidIds) {
        expect(isValidUpiId(id)).toBe(false);
      }
    });
  });

  describe("normalizeUpiId", () => {
    it("should trim and lowercase UPI IDs", () => {
      expect(normalizeUpiId("  AcmeCorp@HDFCbank  ")).toBe("acmecorp@hdfcbank");
      expect(normalizeUpiId("9876543210@PAYTM")).toBe("9876543210@paytm");
    });

    it("should return null for empty or nullish inputs", () => {
      expect(normalizeUpiId("")).toBeNull();
      expect(normalizeUpiId("   ")).toBeNull();
      expect(normalizeUpiId(null)).toBeNull();
      expect(normalizeUpiId(undefined)).toBeNull();
    });
  });

  describe("generateUpiQrPayload", () => {
    it("should generate a valid NPCI base UPI URI", () => {
      const payload = generateUpiQrPayload({
        upiId: "acme@hdfcbank",
        payeeName: "Acme Global Solutions Pvt Ltd",
      });

      expect(payload).toBe(
        "upi://pay?pa=acme@hdfcbank&pn=Acme%20Global%20Solutions%20Pvt%20Ltd&cu=INR"
      );
    });

    it("should correctly encode amount formatted to two decimal places", () => {
      const payload = generateUpiQrPayload({
        upiId: "billing@icici",
        payeeName: "Star Tech",
        amount: 1500,
      });

      expect(payload).toBe(
        "upi://pay?pa=billing@icici&pn=Star%20Tech&cu=INR&am=1500.00"
      );
    });

    it("should include transaction note, reference, and custom currency if supplied", () => {
      const payload = generateUpiQrPayload({
        upiId: "billing@icici",
        payeeName: "Star Tech",
        amount: 2499.75,
        transactionNote: "Payment for Invoice #1024",
        transactionRef: "INV1024",
        merchantCode: "5411",
      });

      expect(payload).toBe(
        "upi://pay?pa=billing@icici&pn=Star%20Tech&cu=INR&am=2499.75&tn=Payment%20for%20Invoice%20%231024&tr=INV1024&mc=5411"
      );
    });

    it("should throw an error if upiId or payeeName is missing", () => {
      expect(() =>
        generateUpiQrPayload({
          upiId: "",
          payeeName: "Acme",
        })
      ).toThrow("A valid upiId is required");

      expect(() =>
        generateUpiQrPayload({
          upiId: "acme@hdfcbank",
          payeeName: "",
        })
      ).toThrow("A valid payeeName is required");
    });
  });
});
