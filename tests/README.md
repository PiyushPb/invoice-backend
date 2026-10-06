# Standalone Black-Box HTTP API Test Suite

This directory contains an end-to-end, decoupled HTTP integration test suite for the **invoice-backend** REST API.

## Design Highlights
- **100% Decoupled**: Tests make external HTTP requests directly to the API surface. They do not import from `src/` or depend on internal Prisma models.
- **Configurable Target**: Runs against `http://localhost:3000` by default or any remote/staging server specified via `TEST_BASE_URL` or `BASE_URL`.
- **Exhaustive Angle & State Coverage**: Validates success cases, failure cases, validation rejections (400), authentication & authorization guards (401), account status restrictions (403), resource conflicts (409), session LRU eviction (Max 5 active sessions), token refresh rotation, and replay prevention.
- **Safe & Collision-Free**: Generates unique, non-colliding test fixtures per run.

---

## Directory Structure

```
tests/
├── helpers/
│   ├── client.ts              # Configured Axios HTTP client with BASE_URL & header helpers
│   ├── test-data.ts           # Deterministic data generators (emails, passwords, businesses)
│   └── types.ts               # TypeScript response contracts
├── integration/
│   ├── health.test.ts         # Health check & database connection probe
│   ├── register.test.ts       # Registration flow, schema validation, 409 conflict detection
│   ├── login.test.ts          # Login credentials, invalid credentials, max 5 session cap
│   ├── token.test.ts          # Token refresh rotation, replay attack prevention, auth guards
│   ├── session.test.ts        # Session list, single session revocation, logout-all
│   ├── password.test.ts       # Forgot password, reset password flow, post-reset session invalidation
│   ├── email-verify.test.ts   # Email verification & resend verification flows
│   ├── me.test.ts             # Workspace profile, entitlements, multi-workspace switching
│   └── middleware.test.ts     # Global 404 handler, CORS, x-powered-by suppression, malformed JSON
├── vitest.config.ts           # Vitest configuration for the standalone test runner
└── README.md                  # This file
```

---

## How to Run Tests

### 1. Ensure the Backend Server is Running
In one terminal window, start the backend server:
```bash
pnpm dev
```
*(By default, the server listens on `http://localhost:3000`)*

### 2. Run the Full Test Suite
In another terminal window:
```bash
pnpm test
```

### 3. Run Tests in Watch Mode (During Development)
```bash
pnpm test:watch
```

### 4. Run a Specific Test File
```bash
npx vitest run tests/integration/register.test.ts --config tests/vitest.config.mts
```

### 5. Run Against a Custom Base URL
You can point the test suite to any port or remote deployment:
```bash
TEST_BASE_URL="http://localhost:5000" pnpm test
```
or
```bash
BASE_URL="https://api-staging.yourdomain.com" pnpm test
```
