import { describe, it, expect } from "vitest";
import { api, authHeader } from "../helpers/client.js";
import { queryDb } from "../helpers/db.js";
import {
  generateUniqueEmail,
  generateValidRegisterPayload,
} from "../helpers/test-data.js";
import type {
  BusinessAddressRecord,
  BusinessBankAccountRecord,
  BusinessDetailData,
  BusinessMemberRecord,
  BusinessSettingsRecord,
  BusinessTaxProfileRecord,
  InviteMemberData,
  RegisterResponseData,
} from "../helpers/types.js";

describe("Business API (/api/v1/business)", () => {
  describe("GET /api/v1/business - Get Business Details of Logged-in Individual", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await api.get("/api/v1/business");

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toMatch(/token/i);
    });

    it("should return comprehensive business details strictly for the logged-in user", async () => {
      const email = generateUniqueEmail("biz_detail_strict");
      const regPayload = generateValidRegisterPayload({
        email,
        firstName: "Alice",
        lastName: "Smith",
        business: {
          name: "Apex Global Solutions Pvt Ltd",
          businessType: "PRIVATE_LIMITED",
          countryCode: "IN",
          currencyCode: "INR",
        },
      });

      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        regPayload
      );
      expect(regRes.status).toBe(201);
      const accessToken = regRes.data.data!.tokens.accessToken;
      const registeredBiz = regRes.data.data!.business;

      const res = await api.get<BusinessDetailData>(
        "/api/v1/business",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Business details retrieved successfully");

      const biz = res.data.data!;
      expect(biz).toBeDefined();

      // Core business properties
      expect(biz.id).toBe(registeredBiz.id);
      expect(biz.name).toBe("Apex Global Solutions Pvt Ltd");
      expect(biz.businessType).toBe("PRIVATE_LIMITED");
      expect(biz.countryCode).toBe("IN");
      expect(biz.currencyCode).toBe("INR");
      expect(biz.status).toBe("ACTIVE");
      expect(biz.createdAt).toBeDefined();
      expect(biz.updatedAt).toBeDefined();

      // Current member identity & role
      expect(biz.currentMember).toBeDefined();
      expect(biz.currentMember.role).toBe("OWNER");
      expect(biz.currentMember.status).toBe("ACTIVE");
      expect(biz.currentMember.joinedAt).toBeDefined();

      // Settings (safe BigInt serialization)
      expect(biz.settings).toBeDefined();
      expect(biz.settings?.invoicePrefix).toBe("INV");
      expect(biz.settings?.invoiceStartNumber).toBe("1");
      expect(typeof biz.settings?.invoiceStartNumber).toBe("string");
      expect(biz.settings?.defaultDueDays).toBe(7);

      // Tax profile
      expect(biz.taxProfile).toBeDefined();
      expect(biz.taxProfile?.taxCountry).toBe("IN");
      expect(biz.taxProfile?.taxRegistered).toBe(false);

      // Arrays & Subscription
      expect(Array.isArray(biz.addresses)).toBe(true);
      expect(Array.isArray(biz.bankAccounts)).toBe(true);
      expect(biz.subscription?.planCode).toBe("FREE");

      // Counts
      expect(biz.counts.members).toBeGreaterThanOrEqual(1);
    });
  });

  describe("PATCH /api/v1/business - Update Business Details", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await api.patch("/api/v1/business", {
        name: "Unauthorized Update",
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should reject empty update payload with 400 Bad Request", async () => {
      const email = generateUniqueEmail("biz_update_empty");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/business",
        {},
        authHeader(accessToken)
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should successfully update business properties and return updated details", async () => {
      const email = generateUniqueEmail("biz_update_success");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const updatePayload = {
        name: "Apex Worldwide Solutions",
        legalName: "Apex Worldwide Solutions Private Limited",
        tradeName: "Apex World",
        industry: "Information Technology",
        phone: "+919876543210",
        website: "https://apexworldwide.example.com",
        timezone: "Asia/Kolkata",
      };

      const res = await api.patch<BusinessDetailData>(
        "/api/v1/business",
        updatePayload,
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Business details updated successfully");

      const biz = res.data.data!;
      expect(biz.name).toBe("Apex Worldwide Solutions");
      expect(biz.legalName).toBe("Apex Worldwide Solutions Private Limited");
      expect(biz.tradeName).toBe("Apex World");
      expect(biz.industry).toBe("Information Technology");
      expect(biz.phone).toBe("+919876543210");
      expect(biz.website).toBe("https://apexworldwide.example.com");
      expect(biz.timezone).toBe("Asia/Kolkata");
    });
  });

  describe("GET /api/v1/business/members - Get Business Members", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await api.get("/api/v1/business/members");

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should return the list of members for the business", async () => {
      const email = generateUniqueEmail("biz_members_list");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({
          email,
          firstName: "Owner",
          lastName: "User",
        })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const userId = regRes.data.data!.user.id;

      const res = await api.get<BusinessMemberRecord[]>(
        "/api/v1/business/members",
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Business members retrieved successfully");

      const members = res.data.data!;
      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThanOrEqual(1);

      const ownerMember = members.find((m) => m.userId === userId);
      expect(ownerMember).toBeDefined();
      expect(ownerMember?.role).toBe("OWNER");
      expect(ownerMember?.status).toBe("ACTIVE");
      expect(ownerMember?.user.email).toBe(email.toLowerCase());
      expect(ownerMember?.user.firstName).toBe("Owner");
    });
  });

  describe("POST /api/v1/business/members/invite - Invite Member (Tier Restrictions)", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await api.post("/api/v1/business/members/invite", {
        email: "invited@example.com",
        role: "MEMBER",
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should reject invalid email or uninvitable OWNER role with 400 Bad Request", async () => {
      const email = generateUniqueEmail("biz_invite_val");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      // 1. Invalid email
      const res1 = await api.post(
        "/api/v1/business/members/invite",
        { email: "not-an-email", role: "MEMBER" },
        authHeader(accessToken)
      );
      expect(res1.status).toBe(400);

      // 2. Cannot invite with OWNER role
      const res2 = await api.post(
        "/api/v1/business/members/invite",
        { email: "someone@example.com", role: "OWNER" },
        authHeader(accessToken)
      );
      expect(res2.status).toBe(400);
    });

    it("should strictly reject invitation on the Free plan with 403 Forbidden", async () => {
      const email = generateUniqueEmail("biz_invite_free");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const res = await api.post(
        "/api/v1/business/members/invite",
        {
          email: "teammate@example.com",
          role: "MEMBER",
        },
        authHeader(accessToken)
      );

      // Verified: Not allowed to free tier people!
      expect(res.status).toBe(403);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toMatch(/free plan/i);
    });

    it("should successfully invite a member when business is on a paid plan", async () => {
      const email = generateUniqueEmail("biz_invite_paid");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      // Ensure a paid plan exists in the database
      const [proPlan] = await queryDb<{ id: string }>(
        `INSERT INTO "Plan" ("id", "code", "name", "price", "currencyCode", "billingInterval", "isFree", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'PRO_TEST_1', 'Pro Plan Test 1', 999.00, 'INR', 'MONTHLY', false, true, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET "isFree" = false
         RETURNING "id"`
      );

      // Upgrade business subscription to the paid plan
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1, "status" = 'ACTIVE' WHERE "businessId" = $2`,
        [proPlan!.id, businessId]
      );

      const inviteEmail = generateUniqueEmail("invited_colleague");
      const res = await api.post<InviteMemberData>(
        "/api/v1/business/members/invite",
        {
          email: inviteEmail,
          role: "ADMIN",
        },
        authHeader(accessToken)
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Member invited successfully");

      const invite = res.data.data!;
      expect(invite.email).toBe(inviteEmail.toLowerCase());
      expect(invite.role).toBe("ADMIN");
      expect(invite.status).toBe("INVITED");
      expect(invite.invitedAt).toBeDefined();

      // Second attempt with same email should reject with 409 Conflict
      const duplicateRes = await api.post(
        "/api/v1/business/members/invite",
        {
          email: inviteEmail,
          role: "MEMBER",
        },
        authHeader(accessToken)
      );
      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.data.success).toBe(false);

      // Verify member is listed in GET /api/v1/business/members
      const membersRes = await api.get<BusinessMemberRecord[]>(
        "/api/v1/business/members",
        authHeader(accessToken)
      );
      expect(membersRes.status).toBe(200);
      const invitedFound = membersRes.data.data!.find(
        (m) => m.user.email === inviteEmail.toLowerCase()
      );
      expect(invitedFound).toBeDefined();
      expect(invitedFound?.role).toBe("ADMIN");
      expect(invitedFound?.status).toBe("INVITED");
    });
  });

  describe("PATCH /api/v1/business/members/:memberId - Update Member Role", () => {
    it("should reject modifying owner role with 403 Forbidden", async () => {
      const email = generateUniqueEmail("biz_role_owner");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const membersRes = await api.get<BusinessMemberRecord[]>(
        "/api/v1/business/members",
        authHeader(accessToken)
      );
      const ownerMember = membersRes.data.data![0]!;

      const res = await api.patch(
        `/api/v1/business/members/${ownerMember.id}`,
        { role: "ADMIN" },
        authHeader(accessToken)
      );

      expect(res.status).toBe(403);
      expect(res.data.success).toBe(false);
    });

    it("should update a team member's role successfully", async () => {
      const email = generateUniqueEmail("biz_role_update");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      // Add paid plan
      const [proPlan] = await queryDb<{ id: string }>(
        `INSERT INTO "Plan" ("id", "code", "name", "price", "currencyCode", "billingInterval", "isFree", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'PRO_TEST_2', 'Pro Plan Test 2', 999.00, 'INR', 'MONTHLY', false, true, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET "isFree" = false
         RETURNING "id"`
      );
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1 WHERE "businessId" = $2`,
        [proPlan!.id, businessId]
      );

      // Invite a member
      const colleagueEmail = generateUniqueEmail("role_colleague");
      const inviteRes = await api.post<InviteMemberData>(
        "/api/v1/business/members/invite",
        { email: colleagueEmail, role: "VIEWER" },
        authHeader(accessToken)
      );
      const memberId = inviteRes.data.data!.id;

      // Update role from VIEWER to ACCOUNTANT
      const res = await api.patch<BusinessMemberRecord>(
        `/api/v1/business/members/${memberId}`,
        { role: "ACCOUNTANT" },
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data!.role).toBe("ACCOUNTANT");
    });
  });

  describe("DELETE /api/v1/business/members/:memberId - Remove Member", () => {
    it("should reject removing the owner with 403 Forbidden", async () => {
      const email = generateUniqueEmail("biz_rem_owner");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      const membersRes = await api.get<BusinessMemberRecord[]>(
        "/api/v1/business/members",
        authHeader(accessToken)
      );
      const ownerMember = membersRes.data.data![0]!;

      const res = await api.delete(
        `/api/v1/business/members/${ownerMember.id}`,
        authHeader(accessToken)
      );

      expect(res.status).toBe(403);
      expect(res.data.success).toBe(false);
    });

    it("should successfully mark a member as REMOVED", async () => {
      const email = generateUniqueEmail("biz_rem_member");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      // Add paid plan
      const [proPlan] = await queryDb<{ id: string }>(
        `INSERT INTO "Plan" ("id", "code", "name", "price", "currencyCode", "billingInterval", "isFree", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'PRO_TEST_3', 'Pro Plan Test 3', 999.00, 'INR', 'MONTHLY', false, true, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET "isFree" = false
         RETURNING "id"`
      );
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1 WHERE "businessId" = $2`,
        [proPlan!.id, businessId]
      );

      // Invite a member
      const colleagueEmail = generateUniqueEmail("rem_colleague");
      const inviteRes = await api.post<InviteMemberData>(
        "/api/v1/business/members/invite",
        { email: colleagueEmail, role: "MEMBER" },
        authHeader(accessToken)
      );
      const memberId = inviteRes.data.data!.id;

      // Delete member
      const res = await api.delete(
        `/api/v1/business/members/${memberId}`,
        authHeader(accessToken)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Member removed successfully");

      // Verify member is excluded from active members list
      const membersRes = await api.get<BusinessMemberRecord[]>(
        "/api/v1/business/members",
        authHeader(accessToken)
      );
      const found = membersRes.data.data!.find((m) => m.id === memberId);
      expect(found).toBeUndefined();
    });
  });

  describe("Business Addresses CRUD (/api/v1/business/addresses)", () => {
    it("should reject unauthenticated address operations with 401 Unauthorized", async () => {
      const resGet = await api.get("/api/v1/business/addresses");
      expect(resGet.status).toBe(401);

      const resPost = await api.post("/api/v1/business/addresses", {});
      expect(resPost.status).toBe(401);
    });

    it("should perform full address lifecycle: create, list, update, and delete", async () => {
      const email = generateUniqueEmail("biz_address_crud");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const accessToken = regRes.data.data!.tokens.accessToken;

      // 1. Create registered address
      const createPayload = {
        type: "REGISTERED",
        addressLine1: "123 Tech Park, Tower A",
        addressLine2: "Outer Ring Road",
        city: "Bengaluru",
        state: "Karnataka",
        stateCode: "KA",
        postalCode: "560103",
        country: "India",
        countryCode: "IN",
        isPrimary: true,
      };

      const createRes = await api.post<BusinessAddressRecord>(
        "/api/v1/business/addresses",
        createPayload,
        authHeader(accessToken)
      );

      expect(createRes.status).toBe(201);
      expect(createRes.data.success).toBe(true);
      const createdAddress = createRes.data.data!;
      expect(createdAddress.addressLine1).toBe("123 Tech Park, Tower A");
      expect(createdAddress.city).toBe("Bengaluru");
      expect(createdAddress.isPrimary).toBe(true);

      const addressId = createdAddress.id;

      // 2. List addresses
      const listRes = await api.get<BusinessAddressRecord[]>(
        "/api/v1/business/addresses",
        authHeader(accessToken)
      );

      expect(listRes.status).toBe(200);
      expect(listRes.data.success).toBe(true);
      expect(listRes.data.data!.length).toBeGreaterThanOrEqual(1);
      expect(listRes.data.data!.some((a) => a.id === addressId)).toBe(true);

      // 3. Update address
      const updateRes = await api.patch<BusinessAddressRecord>(
        `/api/v1/business/addresses/${addressId}`,
        {
          addressLine2: "Level 4, Outer Ring Road",
          landmark: "Near Bellandur Flyover",
        },
        authHeader(accessToken)
      );

      expect(updateRes.status).toBe(200);
      expect(updateRes.data.success).toBe(true);
      expect(updateRes.data.data!.addressLine2).toBe("Level 4, Outer Ring Road");
      expect(updateRes.data.data!.landmark).toBe("Near Bellandur Flyover");

      // 4. Delete address
      const deleteRes = await api.delete(
        `/api/v1/business/addresses/${addressId}`,
        authHeader(accessToken)
      );

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.data.success).toBe(true);
      expect(deleteRes.data.message).toBe("Address deleted successfully");

      // Verify deleted from list
      const listAfterDelete = await api.get<BusinessAddressRecord[]>(
        "/api/v1/business/addresses",
        authHeader(accessToken)
      );
      expect(listAfterDelete.data.data!.some((a) => a.id === addressId)).toBe(
        false
      );
    });
  });

  describe("Tax Profile API (/api/v1/business/tax-profile)", () => {
    it("should reject unauthenticated request with 401 Unauthorized for GET /tax-profile", async () => {
      const res = await api.get("/api/v1/business/tax-profile");
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should reject unauthenticated request with 401 Unauthorized for PATCH /tax-profile", async () => {
      const res = await api.patch("/api/v1/business/tax-profile", {
        taxRegistered: true,
      });
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should retrieve default tax profile for authenticated user", async () => {
      const email = generateUniqueEmail("tax_get");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.get<BusinessTaxProfileRecord>(
        "/api/v1/business/tax-profile",
        authHeader(token)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Tax profile retrieved successfully");
      const profile = res.data.data!;
      expect(profile.taxCountry).toBe("IN");
      expect(profile.taxRegistered).toBe(false);
      expect(profile.defaultTaxMode).toBe("TAX_EXCLUSIVE");
      expect(profile.gstin).toBeNull();
      expect(profile.pan).toBeNull();
    });

    it("should reject PATCH /tax-profile with empty body (400 ValidationError)", async () => {
      const email = generateUniqueEmail("tax_empty");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/business/tax-profile",
        {},
        authHeader(token)
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should reject invalid GSTIN format with 400", async () => {
      const email = generateUniqueEmail("tax_bad_gstin");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/business/tax-profile",
        { gstin: "INVALID_GSTIN_123" },
        authHeader(token)
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    });

    it("should update tax profile with standard fields and auto-derive PAN from GSTIN", async () => {
      const email = generateUniqueEmail("tax_update_std");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const validGstin = "29ABCDE1234F1Z5";
      const res = await api.patch<BusinessTaxProfileRecord>(
        "/api/v1/business/tax-profile",
        {
          taxRegistered: true,
          gstin: validGstin,
          gstRegistrationType: "REGULAR",
          tan: "ABCD12345E",
          taxpayerName: "Apex Taxpayer LLC",
          defaultTaxRate: 18,
          defaultTaxMode: "TAX_INCLUSIVE",
          placeOfSupplyStateCode: "KA",
          reverseChargeEnabled: true,
        },
        authHeader(token)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Tax profile updated successfully");
      const updated = res.data.data!;
      expect(updated.taxRegistered).toBe(true);
      expect(updated.gstin).toBe(validGstin);
      expect(updated.pan).toBe("ABCDE1234F"); // auto-derived digits 3-12
      expect(updated.tan).toBe("ABCD12345E");
      expect(updated.taxpayerName).toBe("Apex Taxpayer LLC");
      expect(updated.defaultTaxRate).toBe(18);
      expect(updated.defaultTaxMode).toBe("TAX_INCLUSIVE");
      expect(updated.placeOfSupplyStateCode).toBe("KA");
      expect(updated.reverseChargeEnabled).toBe(true);

      // Verify GET returns updated data
      const getRes = await api.get<BusinessTaxProfileRecord>(
        "/api/v1/business/tax-profile",
        authHeader(token)
      );
      expect(getRes.status).toBe(200);
      expect(getRes.data.data!.gstin).toBe(validGstin);
      expect(getRes.data.data!.pan).toBe("ABCDE1234F");
      expect(getRes.data.data!.defaultTaxRate).toBe(18);
    });

    it("should update tax profile using prompt alias field names (gstRegistered, taxMode, placeOfSupply, reverseCharge)", async () => {
      const email = generateUniqueEmail("tax_update_alias");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.patch<BusinessTaxProfileRecord>(
        "/api/v1/business/tax-profile",
        {
          gstRegistered: false,
          taxMode: "TAX_EXCLUSIVE",
          placeOfSupply: "MH",
          reverseCharge: false,
          defaultTaxRate: 0,
        },
        authHeader(token)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const updated = res.data.data!;
      expect(updated.taxRegistered).toBe(false);
      expect(updated.gstRegistered).toBe(false);
      expect(updated.defaultTaxMode).toBe("TAX_EXCLUSIVE");
      expect(updated.taxMode).toBe("TAX_EXCLUSIVE");
      expect(updated.placeOfSupplyStateCode).toBe("MH");
      expect(updated.placeOfSupply).toBe("MH");
      expect(updated.reverseChargeEnabled).toBe(false);
      expect(updated.reverseCharge).toBe(false);
      expect(updated.defaultTaxRate).toBe(0); // 0% tax rate preserved
    });
  });

  describe("Bank Accounts API (/api/v1/business/bank-accounts)", () => {
    it("should reject unauthenticated requests with 401", async () => {
      const getRes = await api.get("/api/v1/business/bank-accounts");
      expect(getRes.status).toBe(401);

      const postRes = await api.post("/api/v1/business/bank-accounts", {});
      expect(postRes.status).toBe(401);

      const patchRes = await api.patch(
        "/api/v1/business/bank-accounts/00000000-0000-0000-0000-000000000000",
        {}
      );
      expect(patchRes.status).toBe(401);

      const deleteRes = await api.delete(
        "/api/v1/business/bank-accounts/00000000-0000-0000-0000-000000000000"
      );
      expect(deleteRes.status).toBe(401);
    });

    it("should enforce Free tier limit of 1 bank account (reject 2nd bank account with 403 Forbidden)", async () => {
      const email = generateUniqueEmail("bank_free_limit");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // 1. Add first bank account (Free tier allows 1 bank account)
      const firstRes = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Primary Business Account",
          bankName: "HDFC Bank",
          accountNumber: "50200099887766",
          ifscCode: "HDFC0001234",
          accountType: "CURRENT",
          upiId: "primary@hdfcbank",
        },
        authHeader(token)
      );
      expect(firstRes.status).toBe(201);
      expect(firstRes.data.success).toBe(true);

      // 2. Attempting to add a 2nd bank account on Free plan must be rejected with 403
      const secondRes = await api.post(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Secondary Account",
          bankName: "ICICI Bank",
          accountNumber: "000105998877",
          ifscCode: "ICIC0000001",
          accountType: "SAVINGS",
        },
        authHeader(token)
      );
      expect(secondRes.status).toBe(403);
      expect(secondRes.data.success).toBe(false);
      expect(secondRes.data.message).toMatch(/free plan.*1 bank account/i);
    });

    it("should allow Free tier user to update their single bank account and UPI ID", async () => {
      const email = generateUniqueEmail("bank_free_update");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // 1. Add first bank account without UPI ID
      const createRes = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Single Account",
          bankName: "State Bank of India",
          accountNumber: "20100012345678",
          ifscCode: "SBIN0001234",
          accountType: "CURRENT",
        },
        authHeader(token)
      );
      expect(createRes.status).toBe(201);
      const accountId = createRes.data.data!.id;

      // 2. Update the account to add UPI ID
      const updateRes = await api.patch<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${accountId}`,
        {
          upiId: "business@sbi",
        },
        authHeader(token)
      );
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.data!.upiId).toBe("business@sbi");

      // 3. Update the account to change UPI ID
      const updateAgain = await api.patch<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${accountId}`,
        {
          upiId: "updated@sbi",
        },
        authHeader(token)
      );
      expect(updateAgain.status).toBe(200);
      expect(updateAgain.data.data!.upiId).toBe("updated@sbi");
    });

    it("should enforce Free tier limit of 1 UPI ID across business (reject 2nd UPI ID with 403 Forbidden)", async () => {
      const email = generateUniqueEmail("bank_upi_limit");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      // Upgrade to paid plan temporarily to create 2 bank accounts
      const [proPlan] = await queryDb<{ id: string }>(
        `INSERT INTO "Plan" ("id", "code", "name", "price", "currencyCode", "billingInterval", "isFree", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'PRO_TEST_UPI', 'Pro Plan Test UPI', 999.00, 'INR', 'MONTHLY', false, true, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET "isFree" = false
         RETURNING "id"`
      );
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1, "status" = 'ACTIVE' WHERE "businessId" = $2`,
        [proPlan!.id, businessId]
      );

      // Create account 1 with UPI
      const acc1Res = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Account One",
          bankName: "HDFC Bank",
          accountNumber: "50200011111111",
          ifscCode: "HDFC0001234",
          accountType: "CURRENT",
          upiId: "upi1@hdfcbank",
        },
        authHeader(token)
      );
      expect(acc1Res.status).toBe(201);

      // Create account 2 without UPI
      const acc2Res = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Account Two",
          bankName: "ICICI Bank",
          accountNumber: "000105222222",
          ifscCode: "ICIC0000001",
          accountType: "SAVINGS",
        },
        authHeader(token)
      );
      expect(acc2Res.status).toBe(201);

      // Downgrade business back to Free plan
      const [freePlan] = await queryDb<{ id: string }>(
        `SELECT id FROM "Plan" WHERE code = 'FREE' LIMIT 1`
      );
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1, "status" = 'ACTIVE' WHERE "businessId" = $2`,
        [freePlan!.id, businessId]
      );

      // Attempting to set a second UPI ID on account 2 when account 1 already has one should fail with 403
      const patchRes = await api.patch(
        `/api/v1/business/bank-accounts/${acc2Res.data.data!.id}`,
        {
          upiId: "upi2@icici",
        },
        authHeader(token)
      );
      expect(patchRes.status).toBe(403);
      expect(patchRes.data.success).toBe(false);
      expect(patchRes.data.message).toMatch(/free plan.*1 upi id/i);
    });

    it("should handle full lifecycle: create, list, update, set-primary, and delete bank accounts", async () => {
      const email = generateUniqueEmail("bank_lifecycle");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;
      const businessId = regRes.data.data!.business.id;

      // Upgrade business to paid plan so it can support multiple bank accounts lifecycle
      const [proPlan] = await queryDb<{ id: string }>(
        `INSERT INTO "Plan" ("id", "code", "name", "price", "currencyCode", "billingInterval", "isFree", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'PRO_TEST_LIFECYCLE', 'Pro Plan Test Lifecycle', 999.00, 'INR', 'MONTHLY', false, true, NOW(), NOW())
         ON CONFLICT ("code") DO UPDATE SET "isFree" = false
         RETURNING "id"`
      );
      await queryDb(
        `UPDATE "Subscription" SET "planId" = $1, "status" = 'ACTIVE' WHERE "businessId" = $2`,
        [proPlan!.id, businessId]
      );

      // 1. Initial list should be empty
      const initialList = await api.get<BusinessBankAccountRecord[]>(
        "/api/v1/business/bank-accounts",
        authHeader(token)
      );
      expect(initialList.status).toBe(200);
      expect(initialList.data.data!).toHaveLength(0);

      // 2. Add first bank account -> should automatically become primary
      const createFirst = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Acme Operations",
          bankName: "HDFC Bank",
          accountNumber: "50200012345678",
          ifscCode: "HDFC0001234",
          branchName: "Koramangala",
          accountType: "CURRENT",
          upiId: "acme@hdfcbank",
        },
        authHeader(token)
      );
      expect(createFirst.status).toBe(201);
      expect(createFirst.data.success).toBe(true);
      const firstAcc = createFirst.data.data!;
      expect(firstAcc.accountName).toBe("Acme Operations");
      expect(firstAcc.bankName).toBe("HDFC Bank");
      expect(firstAcc.accountNumber).toBe("50200012345678");
      expect(firstAcc.ifscCode).toBe("HDFC0001234");
      expect(firstAcc.accountType).toBe("CURRENT");
      expect(firstAcc.upiId).toBe("acme@hdfcbank");
      expect(firstAcc.upiQrPayload).toBe(
        "upi://pay?pa=acme@hdfcbank&pn=Acme%20Operations&cu=INR"
      );
      expect(firstAcc.isPrimary).toBe(true); // First account is auto-primary
      expect(firstAcc.showOnInvoice).toBe(true);

      // 3. Add second bank account with isPrimary: true -> should demote first account
      const createSecond = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Acme Reserve",
          bankName: "ICICI Bank",
          accountNumber: "000105001234",
          ifscCode: "ICIC0000001",
          branchName: "MG Road",
          accountType: "SAVINGS",
          isPrimary: true,
        },
        authHeader(token)
      );
      expect(createSecond.status).toBe(201);
      const secondAcc = createSecond.data.data!;
      expect(secondAcc.isPrimary).toBe(true);

      // Verify list: second is primary, first is not primary
      const listAfterSecond = await api.get<BusinessBankAccountRecord[]>(
        "/api/v1/business/bank-accounts",
        authHeader(token)
      );
      expect(listAfterSecond.data.data!).toHaveLength(2);
      const listedFirst = listAfterSecond.data.data!.find((a) => a.id === firstAcc.id)!;
      const listedSecond = listAfterSecond.data.data!.find((a) => a.id === secondAcc.id)!;
      expect(listedSecond.isPrimary).toBe(true);
      expect(listedFirst.isPrimary).toBe(false);

      // 4. Update first account details
      const updateRes = await api.patch<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${firstAcc.id}`,
        {
          accountName: "Acme Primary Operations",
          branchName: "Indiranagar Branch",
        },
        authHeader(token)
      );
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.data!.accountName).toBe("Acme Primary Operations");
      expect(updateRes.data.data!.branchName).toBe("Indiranagar Branch");

      // 5. Set first account as primary via /set-primary
      const setPrimaryRes = await api.post<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${firstAcc.id}/set-primary`,
        {},
        authHeader(token)
      );
      expect(setPrimaryRes.status).toBe(200);
      expect(setPrimaryRes.data.message).toBe("Bank account set as primary successfully");
      expect(setPrimaryRes.data.data!.isPrimary).toBe(true);

      // Verify second account is no longer primary
      const listAfterSetPrimary = await api.get<BusinessBankAccountRecord[]>(
        "/api/v1/business/bank-accounts",
        authHeader(token)
      );
      const checkFirst = listAfterSetPrimary.data.data!.find((a) => a.id === firstAcc.id)!;
      const checkSecond = listAfterSetPrimary.data.data!.find((a) => a.id === secondAcc.id)!;
      expect(checkFirst.isPrimary).toBe(true);
      expect(checkSecond.isPrimary).toBe(false);

      // 6. Delete the primary account (first account) -> second account should be promoted to primary
      const deleteFirst = await api.delete(
        `/api/v1/business/bank-accounts/${firstAcc.id}`,
        authHeader(token)
      );
      expect(deleteFirst.status).toBe(200);
      expect(deleteFirst.data.message).toBe("Bank account deleted successfully");

      const listAfterDelete = await api.get<BusinessBankAccountRecord[]>(
        "/api/v1/business/bank-accounts",
        authHeader(token)
      );
      expect(listAfterDelete.data.data!).toHaveLength(1);
      expect(listAfterDelete.data.data![0].id).toBe(secondAcc.id);
      expect(listAfterDelete.data.data![0].isPrimary).toBe(true); // Promoted to primary

      // 7. Delete the remaining account
      const deleteSecond = await api.delete(
        `/api/v1/business/bank-accounts/${secondAcc.id}`,
        authHeader(token)
      );
      expect(deleteSecond.status).toBe(200);

      const finalList = await api.get<BusinessBankAccountRecord[]>(
        "/api/v1/business/bank-accounts",
        authHeader(token)
      );
      expect(finalList.data.data!).toHaveLength(0);
    });

    it("should return 404 for operations on non-existent bank account", async () => {
      const email = generateUniqueEmail("bank_404");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const patchRes = await api.patch(
        `/api/v1/business/bank-accounts/${fakeId}`,
        { accountName: "Fake" },
        authHeader(token)
      );
      expect(patchRes.status).toBe(404);

      const setPrimaryRes = await api.post(
        `/api/v1/business/bank-accounts/${fakeId}/set-primary`,
        {},
        authHeader(token)
      );
      expect(setPrimaryRes.status).toBe(404);

      const deleteRes = await api.delete(
        `/api/v1/business/bank-accounts/${fakeId}`,
        authHeader(token)
      );
      expect(deleteRes.status).toBe(404);
    });

    it("should reject bank account creation or update with invalid UPI ID format", async () => {
      const email = generateUniqueEmail("bank_upi_val");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // 1. Missing @ symbol
      const res1 = await api.post(
        "/api/v1/business/bank-accounts",
        {
          accountName: "UPI Test",
          bankName: "HDFC Bank",
          accountNumber: "1234567890",
          ifscCode: "HDFC0001234",
          accountType: "CURRENT",
          upiId: "invalidupiid",
        },
        authHeader(token)
      );
      expect(res1.status).toBe(400);

      // 2. Double @ symbol
      const res2 = await api.post(
        "/api/v1/business/bank-accounts",
        {
          accountName: "UPI Test",
          bankName: "HDFC Bank",
          accountNumber: "1234567890",
          ifscCode: "HDFC0001234",
          accountType: "CURRENT",
          upiId: "invalid@@bank",
        },
        authHeader(token)
      );
      expect(res2.status).toBe(400);

      // 3. Invalid characters
      const res3 = await api.post(
        "/api/v1/business/bank-accounts",
        {
          accountName: "UPI Test",
          bankName: "HDFC Bank",
          accountNumber: "1234567890",
          ifscCode: "HDFC0001234",
          accountType: "CURRENT",
          upiId: "invalid upi#1@bank",
        },
        authHeader(token)
      );
      expect(res3.status).toBe(400);
    });

    it("should support dynamic UPI QR payload generation via GET /bank-accounts/:accountId/upi-qr", async () => {
      const email = generateUniqueEmail("bank_upi_qr");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // 1. Create bank account with valid UPI ID
      const createRes = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Sunrise Enterprises Pvt Ltd",
          bankName: "Axis Bank",
          accountNumber: "912010012345678",
          ifscCode: "UTIB0000123",
          accountType: "CURRENT",
          upiId: "sunrise.pay@okaxis",
        },
        authHeader(token)
      );
      expect(createRes.status).toBe(201);
      const acc = createRes.data.data!;
      expect(acc.upiId).toBe("sunrise.pay@okaxis");
      expect(acc.upiQrPayload).toBe(
        "upi://pay?pa=sunrise.pay@okaxis&pn=Sunrise%20Enterprises%20Pvt%20Ltd&cu=INR"
      );

      // 2. Fetch default QR payload via endpoint
      const qrRes1 = await api.get<{
        accountId: string;
        accountName: string;
        upiId: string;
        payeeName: string;
        amount: number | null;
        currency: string;
        transactionNote: string | null;
        qrPayload: string;
      }>(
        `/api/v1/business/bank-accounts/${acc.id}/upi-qr`,
        authHeader(token)
      );
      expect(qrRes1.status).toBe(200);
      expect(qrRes1.data.success).toBe(true);
      expect(qrRes1.data.data!.upiId).toBe("sunrise.pay@okaxis");
      expect(qrRes1.data.data!.payeeName).toBe("Sunrise Enterprises Pvt Ltd");
      expect(qrRes1.data.data!.amount).toBeNull();
      expect(qrRes1.data.data!.currency).toBe("INR");
      expect(qrRes1.data.data!.qrPayload).toBe(
        "upi://pay?pa=sunrise.pay@okaxis&pn=Sunrise%20Enterprises%20Pvt%20Ltd&cu=INR"
      );

      // 3. Fetch dynamic QR payload with amount, note, and transaction ref
      const qrRes2 = await api.get<{
        amount: number;
        transactionNote: string;
        transactionRef: string;
        qrPayload: string;
      }>(
        `/api/v1/business/bank-accounts/${acc.id}/upi-qr?amount=2499.50&note=Invoice%20INV-2024-001&ref=TXN998877`,
        authHeader(token)
      );
      expect(qrRes2.status).toBe(200);
      expect(qrRes2.data.data!.amount).toBe(2499.5);
      expect(qrRes2.data.data!.transactionNote).toBe("Invoice INV-2024-001");
      expect(qrRes2.data.data!.transactionRef).toBe("TXN998877");
      expect(qrRes2.data.data!.qrPayload).toBe(
        "upi://pay?pa=sunrise.pay@okaxis&pn=Sunrise%20Enterprises%20Pvt%20Ltd&cu=INR&am=2499.50&tn=Invoice%20INV-2024-001&tr=TXN998877"
      );

      // 4. Create an account WITHOUT UPI ID (first delete previous account so Free tier 1-account limit allows it)
      await api.delete(
        `/api/v1/business/bank-accounts/${acc.id}`,
        authHeader(token)
      );

      const noUpiCreate = await api.post<BusinessBankAccountRecord>(
        "/api/v1/business/bank-accounts",
        {
          accountName: "Offline Savings Account",
          bankName: "SBI",
          accountNumber: "20001234567",
          ifscCode: "SBIN0001234",
          accountType: "SAVINGS",
        },
        authHeader(token)
      );
      expect(noUpiCreate.status).toBe(201);
      const noUpiAcc = noUpiCreate.data.data!;
      expect(noUpiAcc.upiId).toBeNull();
      expect(noUpiAcc.upiQrPayload).toBeNull();

      // 5. Calling upi-qr on account without UPI ID should return 400 Bad Request
      const qrNoUpiRes = await api.get(
        `/api/v1/business/bank-accounts/${noUpiAcc.id}/upi-qr`,
        authHeader(token)
      );
      expect(qrNoUpiRes.status).toBe(400);

      // 6. Update account to add UPI ID -> should now have upiQrPayload
      const addUpiUpdate = await api.patch<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${noUpiAcc.id}`,
        {
          upiId: "offline.biz@oksbi",
        },
        authHeader(token)
      );
      expect(addUpiUpdate.status).toBe(200);
      expect(addUpiUpdate.data.data!.upiId).toBe("offline.biz@oksbi");
      expect(addUpiUpdate.data.data!.upiQrPayload).toBe(
        "upi://pay?pa=offline.biz@oksbi&pn=Offline%20Savings%20Account&cu=INR"
      );

      // 7. Calling upi-qr now succeeds
      const qrNowWorks = await api.get(
        `/api/v1/business/bank-accounts/${noUpiAcc.id}/upi-qr`,
        authHeader(token)
      );
      expect(qrNowWorks.status).toBe(200);

      // 8. Update account to clear UPI ID (null) -> upiQrPayload should become null
      const clearUpiUpdate = await api.patch<BusinessBankAccountRecord>(
        `/api/v1/business/bank-accounts/${noUpiAcc.id}`,
        {
          upiId: null,
        },
        authHeader(token)
      );
      expect(clearUpiUpdate.status).toBe(200);
      expect(clearUpiUpdate.data.data!.upiId).toBeNull();
      expect(clearUpiUpdate.data.data!.upiQrPayload).toBeNull();
    });
  });

  describe("Business Settings API (/api/v1/business/settings)", () => {
    it("should reject unauthenticated request for GET /settings with 401 Unauthorized", async () => {
      const res = await api.get("/api/v1/business/settings");

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toMatch(/token/i);
    });

    it("should retrieve default business settings for newly registered business", async () => {
      const email = generateUniqueEmail("biz_settings_get");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.get<BusinessSettingsRecord>(
        "/api/v1/business/settings",
        authHeader(token)
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toBe("Business settings retrieved successfully");

      const settings = res.data.data!;
      expect(settings).toBeDefined();
      expect(settings.invoicePrefix).toBe("INV");
      expect(settings.invoiceStartNumber).toBe("1");
      expect(settings.defaultInvoiceNumber).toBe("1");
      expect(settings.defaultDueDays).toBe(7);
      expect(settings.defaultNotes).toBeNull();
      expect(settings.defaultTerms).toBeNull();
      expect(settings.invoiceTemplate).toBe("DEFAULT");
      expect(settings.defaultTaxMode).toBe("TAX_EXCLUSIVE");
      expect(settings.defaultTaxInclusive).toBe(false);
      expect(settings.showLogo).toBe(true);
      expect(settings.showBankDetails).toBe(true);
      expect(settings.showPaymentDetails).toBe(true);
      expect(settings.showSignature).toBe(false);
    });

    it("should reject unauthenticated request for PATCH /settings with 401 Unauthorized", async () => {
      const res = await api.patch("/api/v1/business/settings", {
        invoicePrefix: "NEW",
      });

      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    it("should reject PATCH /settings with empty body with 400 Bad Request", async () => {
      const email = generateUniqueEmail("biz_settings_empty");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const res = await api.patch(
        "/api/v1/business/settings",
        {},
        authHeader(token)
      );

      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe("Validation failed");
    });

    it("should reject invalid values with 400 Bad Request (negative due days, empty prefix, invalid tax mode)", async () => {
      const email = generateUniqueEmail("biz_settings_invalid");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // 1. Negative due days
      const res1 = await api.patch(
        "/api/v1/business/settings",
        { defaultDueDays: -5 },
        authHeader(token)
      );
      expect(res1.status).toBe(400);
      expect(res1.data.success).toBe(false);

      // 2. Empty invoice prefix
      const res2 = await api.patch(
        "/api/v1/business/settings",
        { invoicePrefix: "" },
        authHeader(token)
      );
      expect(res2.status).toBe(400);
      expect(res2.data.success).toBe(false);

      // 3. Invalid tax mode
      const res3 = await api.patch(
        "/api/v1/business/settings",
        { defaultTaxMode: "SUPER_TAX" },
        authHeader(token)
      );
      expect(res3.status).toBe(400);
      expect(res3.data.success).toBe(false);
    });

    it("should update all requested business settings fields and verify persistence", async () => {
      const email = generateUniqueEmail("biz_settings_full_update");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      const updatePayload = {
        invoicePrefix: "ACME-INV",
        defaultInvoiceNumber: "5001",
        defaultDueDays: 14,
        defaultNotes: "Thank you for partnering with ACME Corp.",
        defaultTerms: "Strict 14-day payment cycle. 2% interest on overdue balances.",
        invoiceTemplate: "MINIMAL",
        defaultTaxMode: "TAX_INCLUSIVE",
        showLogo: false,
        showBankDetails: false,
        showSignature: false,
      };

      const patchRes = await api.patch<BusinessSettingsRecord>(
        "/api/v1/business/settings",
        updatePayload,
        authHeader(token)
      );

      expect(patchRes.status).toBe(200);
      expect(patchRes.data.success).toBe(true);
      expect(patchRes.data.message).toBe("Business settings updated successfully");

      const updated = patchRes.data.data!;
      expect(updated.invoicePrefix).toBe("ACME-INV");
      expect(updated.invoiceStartNumber).toBe("5001");
      expect(updated.defaultInvoiceNumber).toBe("5001");
      expect(updated.defaultDueDays).toBe(14);
      expect(updated.defaultNotes).toBe("Thank you for partnering with ACME Corp.");
      expect(updated.defaultTerms).toBe("Strict 14-day payment cycle. 2% interest on overdue balances.");
      expect(updated.invoiceTemplate).toBe("MINIMAL");
      expect(updated.defaultTaxMode).toBe("TAX_INCLUSIVE");
      expect(updated.defaultTaxInclusive).toBe(true);
      expect(updated.showLogo).toBe(false);
      expect(updated.showBankDetails).toBe(false);
      expect(updated.showPaymentDetails).toBe(false);
      expect(updated.showSignature).toBe(false);

      // Verify GET returns the exact persisted settings
      const getRes = await api.get<BusinessSettingsRecord>(
        "/api/v1/business/settings",
        authHeader(token)
      );
      expect(getRes.status).toBe(200);
      expect(getRes.data.data!.invoicePrefix).toBe("ACME-INV");
      expect(getRes.data.data!.defaultInvoiceNumber).toBe("5001");
      expect(getRes.data.data!.defaultDueDays).toBe(14);
      expect(getRes.data.data!.defaultNotes).toBe("Thank you for partnering with ACME Corp.");
      expect(getRes.data.data!.defaultTerms).toBe("Strict 14-day payment cycle. 2% interest on overdue balances.");
      expect(getRes.data.data!.invoiceTemplate).toBe("MINIMAL");
      expect(getRes.data.data!.defaultTaxMode).toBe("TAX_INCLUSIVE");
      expect(getRes.data.data!.defaultTaxInclusive).toBe(true);
      expect(getRes.data.data!.showLogo).toBe(false);
      expect(getRes.data.data!.showBankDetails).toBe(false);
      expect(getRes.data.data!.showSignature).toBe(false);
    });

    it("should allow partial update of settings without changing other fields", async () => {
      const email = generateUniqueEmail("biz_settings_partial");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

      // Update only notes and showLogo
      const patchRes = await api.patch<BusinessSettingsRecord>(
        "/api/v1/business/settings",
        {
          defaultNotes: "Special custom note",
          showLogo: false,
        },
        authHeader(token)
      );

      expect(patchRes.status).toBe(200);
      expect(patchRes.data.data!.defaultNotes).toBe("Special custom note");
      expect(patchRes.data.data!.showLogo).toBe(false);
      // Other fields should retain defaults
      expect(patchRes.data.data!.invoicePrefix).toBe("INV");
      expect(patchRes.data.data!.defaultDueDays).toBe(7);
      expect(patchRes.data.data!.showSignature).toBe(false);
    });

    it("should reject non-admin members from updating settings with 403 Forbidden", async () => {
      const memberEmail = generateUniqueEmail("biz_settings_member");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email: memberEmail })
      );
      const memberToken = regRes.data.data!.tokens.accessToken;
      const memberUserId = regRes.data.data!.user.id;

      // Update member's membership role to MEMBER (from default OWNER)
      await queryDb(
        `UPDATE "BusinessMember" SET "role" = 'MEMBER' WHERE "userId" = $1`,
        [memberUserId]
      );

      // Member can GET settings
      const getRes = await api.get(
        "/api/v1/business/settings",
        authHeader(memberToken)
      );
      expect(getRes.status).toBe(200);

      // Member CANNOT PATCH settings (requires OWNER or ADMIN)
      const patchRes = await api.patch(
        "/api/v1/business/settings",
        { invoicePrefix: "HACKED" },
        authHeader(memberToken)
      );
      expect(patchRes.status).toBe(403);
      expect(patchRes.data.success).toBe(false);
      expect(patchRes.data.message).toMatch(/owners and administrators/i);
    });
  });
});

