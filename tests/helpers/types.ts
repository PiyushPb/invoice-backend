export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  status?: string;
  timestamp?: string;
  uptime?: number;
  services?: Record<string, unknown>;
  previewToken?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface BusinessSummary {
  id: string;
  name: string;
  businessType: string;
  countryCode: string;
  currencyCode: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionSummary {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface RegisterResponseData {
  user: UserSummary;
  business: BusinessSummary;
  tokens: AuthTokens;
  session: SessionSummary;
}

export interface LoginResponseData {
  user: UserSummary;
  business: BusinessSummary | null;
  businesses: BusinessSummary[];
  tokens: AuthTokens;
  session: SessionSummary;
}

export interface RefreshResponseData {
  tokens: AuthTokens;
  session: SessionSummary;
}

export interface SessionsListData {
  totalActive: number;
  maxAllowed: number;
  sessions: SessionSummary[];
}

export interface MeResponseData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    preferences: Record<string, unknown> | null;
  };
  business: {
    id: string;
    name: string;
    legalName: string | null;
    tradeName: string | null;
    businessType: string;
    industry: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    logoUrl: string | null;
    countryCode: string;
    currencyCode: string;
    timezone: string;
    status: string;
    settings: Record<string, unknown> | null;
    taxProfile: Record<string, unknown> | null;
  } | null;
  role: string | null;
  subscription: {
    id: string;
    status: string;
    planCode: string;
    planName: string;
    price: number;
    currencyCode: string;
    billingInterval: string;
    isFree: boolean;
  } | null;
  entitlements: Array<{
    feature: string;
    limit: number | null;
    isUnlimited: boolean;
    isEnabled: boolean;
  }>;
  usage: Array<{
    metric: string;
    used: number;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
}

export interface UpdatedProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  updatedAt: string;
}

export interface PreferencesData {
  language: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  emailNotifications: boolean;
  paymentNotifications: boolean;
  marketingEmails: boolean;
  updatedAt: string;
}

export interface DeleteAccountData {
  status: string;
  deletedAt: string;
  retentionPeriodDays: number;
}

export interface BusinessDetailData {
  id: string;
  name: string;
  legalName: string | null;
  tradeName: string | null;
  businessType: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  currentMember: {
    role: string;
    status: string;
    joinedAt: string | null;
    invitedAt: string | null;
  };
  settings: {
    id: string;
    invoicePrefix: string;
    invoiceStartNumber: string;
    defaultDueDays: number;
    defaultNotes: string | null;
    defaultTerms: string | null;
    defaultCurrency: string;
    defaultTaxInclusive: boolean;
    showLogo: boolean;
    showSignature: boolean;
    showBankDetails: boolean;
    showPaymentDetails: boolean;
    invoiceTemplate: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  taxProfile: {
    id: string;
    taxCountry: string;
    taxRegistered: boolean;
    gstin: string | null;
    gstRegistrationType: string | null;
    gstRegistrationDate: string | null;
    pan: string | null;
    tan: string | null;
    taxpayerName: string | null;
    defaultTaxMode: string;
    defaultTaxRate: number | null;
    placeOfSupplyStateCode: string | null;
    reverseChargeEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  addresses: Array<{
    id: string;
    type: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    city: string;
    district: string | null;
    state: string;
    stateCode: string | null;
    postalCode: string;
    country: string;
    countryCode: string;
    isPrimary: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  bankAccounts: Array<{
    id: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branchName: string | null;
    accountType: string;
    upiId: string | null;
    isPrimary: boolean;
    showOnInvoice: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  subscription: {
    id: string;
    status: string;
    planCode: string;
    planName: string;
    description: string | null;
    price: number;
    currencyCode: string;
    billingInterval: string;
    isFree: boolean;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  counts: {
    members: number;
    customers: number;
    products: number;
    invoices: number;
  };
}

export interface BusinessMemberRecord {
  id: string;
  businessId: string;
  userId: string;
  role: string;
  status: string;
  invitedAt: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
  };
}

export interface InviteMemberData {
  id: string;
  businessId: string;
  userId: string;
  email: string;
  role: string;
  status: string;
  invitedAt: string | null;
  invitedById: string | null;
}

export interface BusinessAddressRecord {
  id: string;
  type: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  stateCode: string | null;
  postalCode: string;
  country: string;
  countryCode: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessTaxProfileRecord {
  id: string;
  businessId: string;
  taxCountry: string;
  taxRegistered: boolean;
  gstRegistered?: boolean;
  gstin: string | null;
  gstRegistrationType: string | null;
  gstRegistrationDate: string | null;
  pan: string | null;
  tan: string | null;
  taxpayerName: string | null;
  defaultTaxMode: string;
  taxMode?: string;
  defaultTaxRate: number | null;
  placeOfSupplyStateCode: string | null;
  placeOfSupply?: string | null;
  reverseChargeEnabled: boolean;
  reverseCharge?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessBankAccountRecord {
  id: string;
  businessId: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string | null;
  accountType: string;
  upiId: string | null;
  upiQrPayload?: string | null;
  isPrimary: boolean;
  showOnInvoice: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessSettingsRecord {
  id: string;
  businessId: string;
  invoicePrefix: string;
  invoiceStartNumber: string;
  defaultInvoiceNumber: string;
  defaultDueDays: number;
  defaultNotes: string | null;
  defaultTerms: string | null;
  defaultCurrency: string;
  defaultTaxInclusive: boolean;
  defaultTaxMode: string;
  showLogo: boolean;
  showSignature: boolean;
  showBankDetails: boolean;
  showPaymentDetails: boolean;
  invoiceTemplate: string;
  createdAt: string;
  updatedAt: string;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: ApiResponse<T>;
  headers: Record<string, string>;
}




