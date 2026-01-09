import type { SkoolConnectorSession } from "@/features/conversations/lib/skool-chat";

type InternalRequestResponse = {
  ok: boolean;
  status?: number;
  contentType?: string | null;
  json?: unknown;
  error?: string;
};

async function internalGet(session: SkoolConnectorSession, path: string) {
  const apiBaseUrl = session.apiBaseUrl ?? "https://api2.skool.com";
  const res = await fetch("/api/integrations/skool/internal/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: apiBaseUrl,
      encryptedCookie: session.encryptedCookie,
      path,
      method: "GET",
    }),
  });
  const data = (await res.json()) as InternalRequestResponse;
  if (!res.ok || data.ok === false) throw new Error(data.error || "Notifications request failed.");
  if (typeof data.status === "number" && data.status >= 400) throw new Error(`Skool upstream error (${data.status})`);
  return data.json;
}

export type SkoolNotificationMessage = {
  id: string;
  metadata?: { data?: string; type?: number; unread?: number | boolean };
  created_at?: string;
  updated_at?: string;
  dst?: string;
  unread?: boolean;
};

export type SkoolNotificationsResponse = {
  messages: SkoolNotificationMessage[];
  has_more?: boolean;
  cursor?: string;
  type?: string;
};

export type SkoolNotificationData = {
  action?: string;
  text?: string;
  image_url?: string;
  link_href?: string;
  link_as?: string;
  src_user_id?: string;
};

export function parseSkoolNotificationData(raw: string | undefined): SkoolNotificationData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SkoolNotificationData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function skoolListNotifications(
  session: SkoolConnectorSession,
  opts?: { limit?: number; type?: "all" | string }
): Promise<SkoolNotificationsResponse> {
  const limit = opts?.limit ?? 30;
  const type = opts?.type ?? "all";
  const json = await internalGet(session, `/self/notifications?limit=${limit}&type=${encodeURIComponent(type)}`);
  return (json as SkoolNotificationsResponse) ?? { messages: [] };
}


