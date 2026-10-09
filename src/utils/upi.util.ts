/**
 * Options for generating a standardized NPCI UPI payment deep link / QR code payload.
 */
export interface UpiQrPayloadOptions {
  /** Payee Virtual Payment Address (UPI ID), e.g. "business@okhdfcbank" */
  upiId: string;
  /** Payee business or account holder name, e.g. "Acme Corp Pvt Ltd" */
  payeeName: string;
  /** Optional transaction amount in INR */
  amount?: number | string | null;
  /** Optional currency code, defaults to "INR" */
  currency?: string;
  /** Optional transaction note / description, e.g. "Invoice #INV-2024-001" */
  transactionNote?: string | null;
  /** Optional transaction reference ID */
  transactionRef?: string | null;
  /** Optional 4-digit Merchant Category Code */
  merchantCode?: string | null;
}

/**
 * Standard NPCI UPI VPA Regex:
 * Format: username@bank
 * Username: 2-100 characters consisting of alphanumeric, dots, hyphens, and underscores.
 * Bank/PSP Handle: 2-64 characters consisting of alphanumeric.
 */
export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9]{2,64}$/;

/**
 * Validates whether the given string is a valid Indian UPI ID (VPA).
 */
export function isValidUpiId(upiId: string): boolean {
  if (!upiId || typeof upiId !== "string") {
    return false;
  }
  return UPI_ID_REGEX.test(upiId.trim());
}

/**
 * Normalizes a UPI ID: trims leading/trailing whitespace and converts to lowercase.
 * Returns null if the value is empty, whitespace, or null/undefined.
 */
export function normalizeUpiId(upiId: string | null | undefined): string | null {
  if (!upiId || typeof upiId !== "string") {
    return null;
  }
  const trimmed = upiId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.toLowerCase();
}

/**
 * Generates an NPCI-compliant `upi://pay` URI string suitable for rendering as a QR code
 * or using as an intent link in Indian payment applications (Google Pay, PhonePe, Paytm, BHIM, etc.).
 */
export function generateUpiQrPayload(options: UpiQrPayloadOptions): string {
  const {
    upiId,
    payeeName,
    amount,
    currency = "INR",
    transactionNote,
    transactionRef,
    merchantCode,
  } = options;

  const normalizedUpiId = normalizeUpiId(upiId);
  if (!normalizedUpiId) {
    throw new Error("A valid upiId is required to generate a UPI QR payload");
  }

  const trimmedPayeeName = payeeName ? payeeName.trim() : "";
  if (!trimmedPayeeName) {
    throw new Error("A valid payeeName is required to generate a UPI QR payload");
  }

  const resolvedCurrency =
    currency.trim().length > 0 ? currency.trim().toUpperCase() : "INR";

  const queryParams: string[] = [
    `pa=${normalizedUpiId}`,
    `pn=${encodeURIComponent(trimmedPayeeName)}`,
    `cu=${encodeURIComponent(resolvedCurrency)}`,
  ];

  if (amount !== undefined && amount !== null && amount !== "") {
    const numAmount = typeof amount === "number" ? amount : parseFloat(amount);
    if (!isNaN(numAmount) && numAmount > 0) {
      queryParams.push(`am=${encodeURIComponent(numAmount.toFixed(2))}`);
    }
  }

  if (transactionNote && transactionNote.trim().length > 0) {
    queryParams.push(`tn=${encodeURIComponent(transactionNote.trim())}`);
  }

  if (transactionRef && transactionRef.trim().length > 0) {
    queryParams.push(`tr=${encodeURIComponent(transactionRef.trim())}`);
  }

  if (merchantCode && merchantCode.trim().length > 0) {
    queryParams.push(`mc=${encodeURIComponent(merchantCode.trim())}`);
  }

  return `upi://pay?${queryParams.join("&")}`;
}
