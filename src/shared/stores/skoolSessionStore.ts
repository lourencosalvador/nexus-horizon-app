export type SkoolSession = {
  /** e.g. https://www.skool.com */
  baseUrl: string;
  /** e.g. https://api2.skool.com (Skool internal API host) */
  apiBaseUrl?: string;
  /**
   * Encrypted Cookie header value (AES-GCM), generated server-side.
   * The browser should not persist plaintext cookies.
   */
  encryptedCookie?: string;
  /**
   * Legacy/dev-only: raw Cookie header value copied from the browser.
   * Prefer `encryptedCookie`.
   */
  cookie?: string;
  createdAt: number;
};

const KEY = "nexus_skool_sessions_v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readAll(): Record<string, SkoolSession> {
  if (typeof window === "undefined") return {};
  const raw = safeParse<Record<string, SkoolSession>>(window.localStorage.getItem(KEY));
  return raw && typeof raw === "object" ? raw : {};
}

function writeAll(next: Record<string, SkoolSession>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function getSkoolSession(instanceId: string): SkoolSession | null {
  const all = readAll();
  return all[instanceId] ?? null;
}

export function setSkoolSession(instanceId: string, session: SkoolSession) {
  const all = readAll();
  all[instanceId] = session;
  writeAll(all);
}

export function clearSkoolSession(instanceId: string) {
  const all = readAll();
  delete all[instanceId];
  writeAll(all);
}


