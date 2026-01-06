import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/shared/constants/auth";

type RefreshResponse = {
  token: string;
};

const TOKEN_STORAGE_KEY = "tx_access_token";
const REFRESH_STORAGE_KEY = "tx_refresh_token";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((c) => c.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq >= 0 ? part.slice(0, eq) : part;
    if (k === name) return eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : "";
  }
  return null;
}

function setAuthCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; samesite=lax`;
}

function clearAuthCookies() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
  document.cookie = `${LEGACY_AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_STORAGE_KEY);
}

function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  setAuthCookie();
}

function logoutLocal() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(REFRESH_STORAGE_KEY);
  }
  clearAuthCookies();
}

let refreshing: Promise<string> | null = null;

async function refreshToken(api: AxiosInstance): Promise<string> {
  const rt = getRefreshToken();
  if (!rt) throw new Error("Missing refresh token");

  const res = await api.post<RefreshResponse>("/auth/refresh", { refresh_token: rt });
  const next = res.data?.token;
  if (!next) throw new Error("Invalid refresh response");
  setAccessToken(next);
  return next;
}

export const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "x-region": "angola",
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  const hasCookie = Boolean(getCookieValue(AUTH_COOKIE_NAME) || getCookieValue(LEGACY_AUTH_COOKIE_NAME));

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  } else if (hasCookie) {
    config.headers = config.headers ?? {};
    config.headers["x-auth-cookie"] = "1";
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original) throw error;

    if (status !== 401 || original._retry) throw error;
    original._retry = true;

    try {
      refreshing = refreshing ?? refreshToken(api).finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      return api.request(original);
    } catch {
      logoutLocal();
      throw error;
    }
  }
);


