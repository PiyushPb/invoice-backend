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

export interface HttpResponse<T = unknown> {
  status: number;
  data: ApiResponse<T>;
  headers: Record<string, string>;
}
