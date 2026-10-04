import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";

export interface UserTokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role?: string;
  businessId?: string;
}

export type TokenPayloadInput = Record<string, unknown> & {
  userId: string;
  email: string;
};

/**
 * Sign a JWT token with custom secret and options
 */
export const signToken = (
  payload: object,
  secret: string = config.jwt.secret,
  options?: SignOptions
): string => {
  return jwt.sign(payload, secret, options);
};

/**
 * Verify and decode a JWT token using custom secret
 */
export const verifyToken = <T extends JwtPayload = UserTokenPayload>(
  token: string,
  secret: string = config.jwt.secret
): T => {
  return jwt.verify(token, secret) as T;
};

/**
 * Generate standard access token
 */
export const generateAccessToken = (
  payload: TokenPayloadInput,
  options?: SignOptions
): string => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as SignOptions["expiresIn"],
    ...options,
  });
};

/**
 * Verify an access token
 */
export const verifyAccessToken = <T extends JwtPayload = UserTokenPayload>(
  token: string
): T => {
  return jwt.verify(token, config.jwt.accessSecret) as T;
};

/**
 * Generate standard refresh token
 */
export const generateRefreshToken = (
  payload: TokenPayloadInput,
  options?: SignOptions
): string => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as SignOptions["expiresIn"],
    ...options,
  });
};

/**
 * Verify a refresh token
 */
export const verifyRefreshToken = <T extends JwtPayload = UserTokenPayload>(
  token: string
): T => {
  return jwt.verify(token, config.jwt.refreshSecret) as T;
};

/**
 * Generate both access and refresh tokens at once
 */
export const generateAuthTokens = (
  payload: TokenPayloadInput
): { accessToken: string; refreshToken: string } => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  return { accessToken, refreshToken };
};
