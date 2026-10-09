import type { Request } from "express";
import { isIP } from "node:net";

export interface DeviceInfo {
  deviceName: string;
  deviceType: "DESKTOP" | "MOBILE" | "TABLET" | "API_CLIENT" | "UNKNOWN";
  userAgent: string | null;
  ipAddress: string | null;
}

/**
 * Extract and validate client IP address for PostgreSQL INET compatibility
 */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  let rawIp: string | undefined;

  if (typeof forwarded === "string") {
    rawIp = forwarded.split(",")[0]?.trim();
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    rawIp = forwarded[0].trim();
  } else if (typeof req.headers["x-real-ip"] === "string") {
    rawIp = req.headers["x-real-ip"].trim();
  } else if (req.ip) {
    rawIp = req.ip.trim();
  }

  if (!rawIp) return null;

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (rawIp.startsWith("::ffff:")) {
    rawIp = rawIp.replace("::ffff:", "");
  }

  // Validate format using Node's native network parser
  return isIP(rawIp) !== 0 ? rawIp : null;
}

/**
 * Parse client information, system/device name, and device type from HTTP request
 */
export function parseDeviceInfo(req: Request): DeviceInfo {
  const userAgent = req.headers["user-agent"] ?? null;
  const ipAddress = extractClientIp(req);

  // Allow explicit client override if provided by a frontend client or native app
  const customDeviceName = req.headers["x-device-name"] as string | undefined;
  if (customDeviceName && customDeviceName.trim().length > 0) {
    return {
      deviceName: customDeviceName.trim().slice(0, 255),
      deviceType: "DESKTOP",
      userAgent: userAgent ? userAgent.slice(0, 1000) : null,
      ipAddress,
    };
  }

  if (!userAgent) {
    return {
      deviceName: "Unknown Device",
      deviceType: "UNKNOWN",
      userAgent: null,
      ipAddress,
    };
  }

  const ua = userAgent;

  // Determine device type
  let deviceType: DeviceInfo["deviceType"] = "DESKTOP";
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "TABLET";
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile/i.test(ua)) {
    deviceType = "MOBILE";
  } else if (/curl|postman|bruno|httpie|insomnia|axios|node-fetch/i.test(ua)) {
    deviceType = "API_CLIENT";
  }

  // Determine operating system
  let os = "Unknown OS";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/windows nt 6\.3/i.test(ua)) os = "Windows 8.1";
  else if (/windows nt 6\.1/i.test(ua)) os = "Windows 7";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/iphone/i.test(ua)) os = "iOS (iPhone)";
  else if (/ipad/i.test(ua)) os = "iPadOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  // Determine client / browser
  let client = "Unknown Browser";
  if (/edg\//i.test(ua)) client = "Edge";
  else if (/opr\/|opera/i.test(ua)) client = "Opera";
  else if (/chrome|crios/i.test(ua)) client = "Chrome";
  else if (/firefox|fxios/i.test(ua)) client = "Firefox";
  else if (/safari/i.test(ua)) client = "Safari";
  else if (/bruno/i.test(ua)) client = "Bruno API Client";
  else if (/postman/i.test(ua)) client = "Postman";
  else if (/curl/i.test(ua)) client = "cURL";

  const deviceName = `${client} on ${os}`.slice(0, 255);

  return {
    deviceName,
    deviceType,
    userAgent: ua.slice(0, 1000),
    ipAddress,
  };
}
