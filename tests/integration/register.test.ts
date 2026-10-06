import { describe, it, expect } from "vitest";
import { api } from "../helpers/client.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
  DEFAULT_PASSWORD,
} from "../helpers/test-data.js";
import type { RegisterResponseData } from "../helpers/types.js";

describe("Register API (/api/v1/auth/register)", () => {
  describe("Success Scenarios", () => {
    it("POST /api/v1/auth/register should successfully register a new user and create an initial business workspace", async () => {
      const payload = generateValidRegisterPayload({
        firstName: "Alexander",
        lastName: "Hamilton",
        email: generateUniqueEmail("alex"),
        business: {
          name: "Treasury Solutions LLP",
          businessType: "LLP",
          countryCode: "IN",
          currencyCode: "INR",
        },
      });

      const res = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        payload,
        {
          "user-agent": "Vitest-TestClient/1.0",
        }
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Registration successful");

      const data = res.data.data!;
      expect(data).toBeDefined();

      // User assertions
      expect(data.user.id).toBeDefined();
      expect(data.user.email).toBe(payload.email.toLowerCase());
      expect(data.user.firstName).toBe("Alexander");
      expect(data.user.lastName).toBe("Hamilton");
      expect(data.user.status).toBe("ACTIVE");
      expect(data.user.createdAt).toBeDefined();

      // Business workspace assertions
      expect(data.business.id).toBeDefined();
      expect(data.business.name).toBe("Treasury Solutions LLP");
      expect(data.business.businessType).toBe("LLP");
      expect(data.business.countryCode).toBe("IN");
      expect(data.business.currencyCode).toBe("INR");
      expect(data.business.role).toBe("OWNER");

      // Auth tokens assertions
      expect(data.tokens.accessToken).toBeTypeOf("string");
      expect(data.tokens.refreshToken).toBeTypeOf("string");
      expect(data.tokens.accessToken.length).toBeGreaterThan(20);

      // Session assertions
      expect(data.session.id).toBeDefined();
      expect(data.session.expiresAt).toBeDefined();
    });
  });

  describe("Validation Failure Scenarios (400 Bad Request)", () => {
    it("should fail when firstName is missing or empty", async () => {
      const payload = generateValidRegisterPayload({ firstName: "" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Validation failed");
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "firstName",
          }),
        ])
      );
    });

    it("should fail when lastName is missing or empty", async () => {
      const payload = generateValidRegisterPayload({ lastName: "" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Validation failed");
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "lastName",
          }),
        ])
      );
    });

    it("should fail when email format is invalid", async () => {
      const invalidEmails = ["not-an-email", "user@", "@domain.com", "user@."];
      for (const email of invalidEmails) {
        const payload = generateValidRegisterPayload({ email });
        const res = await api.post("/api/v1/auth/register", payload);

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: "email",
            }),
          ])
        );
      }
    });

    it("should fail when password is less than 8 characters", async () => {
      const payload = generateValidRegisterPayload({ password: "Ab1!" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
            message: expect.stringContaining("at least 8 characters"),
          }),
        ])
      );
    });

    it("should fail when password does not have an uppercase letter", async () => {
      const payload = generateValidRegisterPayload({ password: "password123!" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
            message: expect.stringContaining("uppercase letter"),
          }),
        ])
      );
    });

    it("should fail when password does not have a lowercase letter", async () => {
      const payload = generateValidRegisterPayload({ password: "PASSWORD123!" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
            message: expect.stringContaining("lowercase letter"),
          }),
        ])
      );
    });

    it("should fail when password does not have a number", async () => {
      const payload = generateValidRegisterPayload({ password: "Password!Secret" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
            message: expect.stringContaining("number"),
          }),
        ])
      );
    });

    it("should fail when password does not have a special character", async () => {
      const payload = generateValidRegisterPayload({ password: "Password12345" });
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "password",
            message: expect.stringContaining("special character"),
          }),
        ])
      );
    });

    it("should fail when business name is missing or empty", async () => {
      const payload = generateValidRegisterPayload();
      payload.business.name = "";
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "business.name",
          }),
        ])
      );
    });

    it("should fail when businessType is an invalid enum value", async () => {
      const payload = generateValidRegisterPayload();
      // @ts-expect-error Intentionally invalid enum
      payload.business.businessType = "SUPER_ENTERPRISE";
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "business.businessType",
          }),
        ])
      );
    });

    it("should fail when countryCode is not 2 characters", async () => {
      const payload = generateValidRegisterPayload();
      payload.business.countryCode = "IND";
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "business.countryCode",
          }),
        ])
      );
    });

    it("should fail when currencyCode is not 3 characters", async () => {
      const payload = generateValidRegisterPayload();
      payload.business.currencyCode = "IN";
      const res = await api.post("/api/v1/auth/register", payload);

      expect(res.status).toBe(400);
      expect(res.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "business.currencyCode",
          }),
        ])
      );
    });
  });

  describe("Conflict Scenarios (409 Conflict)", () => {
    it("should return 409 Conflict when attempting to register an existing email", async () => {
      const email = generateUniqueEmail("existing");
      const firstPayload = generateValidRegisterPayload({ email });

      // First registration should succeed
      const firstRes = await api.post("/api/v1/auth/register", firstPayload);
      expect(firstRes.status).toBe(201);

      // Second registration with same email should return 409
      const secondPayload = generateValidRegisterPayload({ email });
      const secondRes = await api.post("/api/v1/auth/register", secondPayload);

      expect(secondRes.status).toBe(409);
      expect(secondRes.data.success).toBe(false);
      expect(secondRes.data.message).toBe("An account with this email already exists");
    });

    it("should treat email case-insensitively and return 409 Conflict", async () => {
      const baseEmail = `case_${Date.now()}@example.com`;
      const lowercaseEmail = baseEmail.toLowerCase();
      const uppercaseEmail = baseEmail.toUpperCase();

      const res1 = await api.post(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email: lowercaseEmail })
      );
      expect(res1.status).toBe(201);

      const res2 = await api.post(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email: uppercaseEmail })
      );
      expect(res2.status).toBe(409);
      expect(res2.data.message).toBe("An account with this email already exists");
    });
  });
});
