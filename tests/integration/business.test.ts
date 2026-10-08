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

    it("should handle full lifecycle: create, list, update, set-primary, and delete bank accounts", async () => {
      const email = generateUniqueEmail("bank_lifecycle");
      const regRes = await api.post<RegisterResponseData>(
        "/api/v1/auth/register",
        generateValidRegisterPayload({ email })
      );
      const token = regRes.data.data!.tokens.accessToken;

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
  });
});
