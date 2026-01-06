"use client";

export type AuthProvider = "credentials" | "google";

export type StoredUser = {
  provider: AuthProvider;
  email: string;
  name?: string;
  username?: string;
  phone?: string;
  photoDataUrl?: string;
  pictureUrl?: string;
  password?: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredSession = {
  provider: AuthProvider;
  email: string;
  loggedInAt: number;
};

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/shared/constants/auth";

const USER_KEY = "nexus_user";
const SESSION_KEY = "nexus_session";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  return safeParse<StoredUser>(localStorage.getItem(USER_KEY));
}

export function setStoredUser(user: StoredUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  return safeParse<StoredSession>(localStorage.getItem(SESSION_KEY));
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((c) => c.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq >= 0 ? part.slice(0, eq) : part;
    if (k === name) {
      return eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : "";
    }
  }
  return null;
}

export function hasAuthCookie(): boolean {
  return Boolean(getCookieValue(AUTH_COOKIE_NAME) || getCookieValue(LEGACY_AUTH_COOKIE_NAME));
}

export function syncSessionCookie() {
  if (typeof window === "undefined") return;
  const session = getStoredSession();
  const cookie = hasAuthCookie();

  if (session && !cookie) {
    document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; samesite=lax`;
  }

  if (!session && cookie) {
    document.cookie =
      `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
    document.cookie =
      `${LEGACY_AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
  }
}

export function setStoredSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; samesite=lax`;
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
  document.cookie = `${LEGACY_AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}



