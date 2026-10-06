import axios, { type AxiosRequestConfig, type AxiosResponse, isAxiosError } from "axios";
import type { HttpResponse } from "./types.js";

// Note: Vite automatically sets process.env.BASE_URL = "/" by default, so we ignore "/"
export const BASE_URL =
  process.env["TEST_BASE_URL"] ||
  process.env["API_URL"] ||
  (process.env["BASE_URL"] && process.env["BASE_URL"] !== "/"
    ? process.env["BASE_URL"]
    : "http://localhost:3000");

export const API_PREFIX = "/api/v1";

/**
 * Executes an HTTP call and returns status code, response data, and headers.
 * Catches AxiosError so assertions can cleanly inspect 4xx and 5xx responses.
 */
export async function executeRequest<T = unknown>(
  config: AxiosRequestConfig
): Promise<HttpResponse<T>> {
  const fullUrl = config.url?.startsWith("http")
    ? config.url
    : `${BASE_URL}${config.url}`;

  try {
    const response: AxiosResponse = await axios({
      ...config,
      url: fullUrl,
      validateStatus: () => true, // Treat all HTTP statuses as successful resolutions so we can inspect error responses
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, string>,
    };
  } catch (error: unknown) {
    if (isAxiosError(error) && error.response) {
      return {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers as Record<string, string>,
      };
    }
    throw error;
  }
}

export const api = {
  get: <T = unknown>(
    endpoint: string,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse<T>> => {
    return executeRequest<T>({
      method: "GET",
      url: endpoint.startsWith("/") ? endpoint : `${API_PREFIX}/${endpoint}`,
      headers,
    });
  },

  post: <T = unknown>(
    endpoint: string,
    data?: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse<T>> => {
    return executeRequest<T>({
      method: "POST",
      url: endpoint.startsWith("/") ? endpoint : `${API_PREFIX}/${endpoint}`,
      data,
      headers,
    });
  },

  delete: <T = unknown>(
    endpoint: string,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse<T>> => {
    return executeRequest<T>({
      method: "DELETE",
      url: endpoint.startsWith("/") ? endpoint : `${API_PREFIX}/${endpoint}`,
      headers,
    });
  },

  raw: executeRequest,
};

/**
 * Creates Bearer Authorization header object
 */
export function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}
