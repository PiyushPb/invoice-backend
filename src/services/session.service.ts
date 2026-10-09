import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import type { DeviceInfo } from "../utils/device.utils.js";
import { config } from "../config/env.js";

export interface SessionSummary {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export class SessionService {
  public static readonly MAX_ACTIVE_SESSIONS = 5;

  /**
   * Parse refresh token expiration config string (e.g. "7d", "24h") into a future Date
   */
  public static calculateExpiryDate(): Date {
    const defaultDays = 7;
    const configValue = config.jwt.refreshExpiresIn ?? "7d";

    const match = configValue.match(/^(\d+)([dhms]?)$/);
    if (!match) {
      return new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2] !== undefined && match[2].length > 0 ? match[2] : "d";

    let multiplier = 24 * 60 * 60 * 1000; // default days
    if (unit === "h") multiplier = 60 * 60 * 1000;
    else if (unit === "m") multiplier = 60 * 1000;
    else if (unit === "s") multiplier = 1000;

    return new Date(Date.now() + value * multiplier);
  }

  /**
   * Create a new session for a user while enforcing MAX 5 active sessions
   * Uses LRU / FIFO eviction: if user has >= 5 active sessions, evicts the oldest active session(s)
   */
  public static async createSession(
    userId: string,
    refreshToken: string,
    deviceInfo: DeviceInfo,
    txClient?: any
  ): Promise<SessionSummary> {
    const runInTx = async (tx: any) => {
      const now = new Date();
      const expiresAt = SessionService.calculateExpiryDate();
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      // 1. Mark expired sessions as revoked so they don't count against limit
      await tx.userSession.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { lte: now },
        },
        data: {
          revokedAt: now,
        },
      });

      // 2. Fetch all currently active sessions (oldest first by lastUsedAt)
      const activeSessions = await tx.userSession.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: {
          lastUsedAt: "asc",
        },
        select: {
          id: true,
        },
      });

      // 3. Enforce MAX 5 active sessions (LRU eviction)
      if (activeSessions.length >= SessionService.MAX_ACTIVE_SESSIONS) {
        const evictCount =
          activeSessions.length - SessionService.MAX_ACTIVE_SESSIONS + 1;
        const sessionsToEvict = activeSessions
          .slice(0, evictCount)
          .map((s: { id: string }) => s.id);

        await tx.userSession.updateMany({
          where: {
            id: { in: sessionsToEvict },
          },
          data: {
            revokedAt: now,
          },
        });
      }

      // 4. Create the new active session
      const created = await tx.userSession.create({
        data: {
          userId,
          tokenHash,
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent,
          expiresAt,
          lastUsedAt: now,
        },
      });

      return {
        id: created.id,
        deviceName: created.deviceName,
        deviceType: created.deviceType,
        ipAddress: created.ipAddress,
        lastUsedAt: created.lastUsedAt,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
      };
    };

    if (txClient) {
      return runInTx(txClient);
    }

    return prisma.$transaction(runInTx);
  }

  /**
   * Get all active sessions for a user
   */
  public static async getUserActiveSessions(
    userId: string
  ): Promise<SessionSummary[]> {
    const now = new Date();
    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: {
        lastUsedAt: "desc",
      },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions;
  }

  /**
   * Revoke a specific session
   */
  public static async revokeSession(
    userId: string,
    sessionId: string
  ): Promise<boolean> {
    const result = await prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Revoke all active sessions for a user (optionally keeping one session)
   */
  public static async revokeAllSessions(
    userId: string,
    exceptSessionId?: string
  ): Promise<number> {
    const where: any = {
      userId,
      revokedAt: null,
    };

    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }

    const result = await prisma.userSession.updateMany({
      where,
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Rotate a session token (replace old refresh token with new refresh token)
   */
  public static async rotateSession(
    oldRefreshToken: string,
    newRefreshToken: string,
    deviceInfo?: DeviceInfo
  ): Promise<SessionSummary | null> {
    const now = new Date();
    const oldHash = crypto
      .createHash("sha256")
      .update(oldRefreshToken)
      .digest("hex");

    const session = await prisma.userSession.findFirst({
      where: {
        tokenHash: oldHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!session) return null;

    const newHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");
    const newExpiresAt = SessionService.calculateExpiryDate();

    const updated = await prisma.userSession.update({
      where: { id: session.id },
      data: {
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        lastUsedAt: now,
        ...(deviceInfo?.ipAddress ? { ipAddress: deviceInfo.ipAddress } : {}),
        ...(deviceInfo?.userAgent ? { userAgent: deviceInfo.userAgent } : {}),
        ...(deviceInfo?.deviceName ? { deviceName: deviceInfo.deviceName } : {}),
      },
    });

    return {
      id: updated.id,
      deviceName: updated.deviceName,
      deviceType: updated.deviceType,
      ipAddress: updated.ipAddress,
      lastUsedAt: updated.lastUsedAt,
      createdAt: updated.createdAt,
      expiresAt: updated.expiresAt,
    };
  }

  /**
   * Revoke session by refresh token
   */
  public static async revokeSessionByRefreshToken(
    refreshToken: string
  ): Promise<boolean> {
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const result = await prisma.userSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count > 0;
  }
}
