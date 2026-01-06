export type SkoolChatMessage = {
  id: string;
  metadata?: { content?: string; src?: string; dst?: string };
  created_at?: string;
  updated_at?: string;
  channel_id?: string;
};

export type SkoolChatChannel = {
  id: string;
  metadata?: { num_unread?: number; last_read?: string };
  created_at?: string;
  updated_at?: string;
  last_message_id?: string;
  last_message_at?: string;
  user_ids?: string[];
  user?: {
    id: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    metadata?: { online?: number; picture_profile?: string; picture_bubble?: string };
  };
  last_message?: SkoolChatMessage;
};

export type SkoolChatChannelsResponse = { channels: SkoolChatChannel[] };

export type SkoolChatMessagesResponse = {
  messages: SkoolChatMessage[];
  has_more_before?: boolean;
  has_more_after?: boolean;
  channel?: SkoolChatChannel;
};

type InternalRequestResponse = {
  ok: boolean;
  status?: number;
  contentType?: string | null;
  json?: unknown;
  textPreview?: string;
  error?: string;
};

export type SkoolConnectorSession = {
  encryptedCookie: string;
  apiBaseUrl?: string; // defaults to https://api2.skool.com
};

async function internalRequest(session: SkoolConnectorSession, path: string, opts?: { method?: "GET" | "POST"; jsonBody?: unknown }) {
  const apiBaseUrl = session.apiBaseUrl ?? "https://api2.skool.com";
  const res = await fetch("/api/integrations/skool/internal/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: apiBaseUrl,
      encryptedCookie: session.encryptedCookie,
      path,
      method: opts?.method ?? "GET",
      jsonBody: opts?.jsonBody,
    }),
  });
  const data = (await res.json()) as InternalRequestResponse;
  if (!res.ok || data.ok === false) {
    const hint =
      res.status === 401
        ? "Unauthorized (401). Reconnect the instance to refresh auth_token / aws-waf-token."
        : null;
    throw new Error(data.error || hint || "Skool request failed.");
  }
  return data;
}

export async function skoolListChannels(session: SkoolConnectorSession): Promise<SkoolChatChannel[]> {
  const r = await internalRequest(session, "/self/chat-channels?offset=0&limit=30&last=true&unread-only=false", { method: "GET" });
  const json = r.json as SkoolChatChannelsResponse | undefined;
  return Array.isArray(json?.channels) ? json.channels : [];
}

export async function skoolGetMessages(
  session: SkoolConnectorSession,
  channelId: string,
  anchorMessageId: string,
  opts?: { before?: number; after?: number }
): Promise<SkoolChatMessagesResponse> {
  const before = opts?.before ?? 50;
  const after = opts?.after ?? 0;
  const r = await internalRequest(
    session,
    `/channels/${channelId}/messages?before=${before}&after=${after}&msg=${encodeURIComponent(anchorMessageId)}`,
    { method: "GET" }
  );
  return (r.json as SkoolChatMessagesResponse | undefined) ?? { messages: [] };
}

export async function skoolSendMessage(session: SkoolConnectorSession, channelId: string, content: string): Promise<SkoolChatMessage> {
  const r = await internalRequest(session, `/channels/${channelId}/messages?ct=wdm`, {
    method: "POST",
    jsonBody: { content, attachments: [] },
  });
  return (r.json as SkoolChatMessage) ?? { id: "unknown" };
}

export async function skoolMarkRead(session: SkoolConnectorSession, channelId: string, lastReadMessageId: string) {
  await internalRequest(session, `/channels/${channelId}/read`, {
    method: "POST",
    jsonBody: { last_read: lastReadMessageId, unread: false, num_unread: 0 },
  });
}

export function skoolInferMyUserId(channel: SkoolChatChannel): string | null {
  const other = channel.user?.id;
  const ids = channel.user_ids ?? [];
  if (!other || ids.length < 2) return null;
  const me = ids.find((id) => id !== other) ?? null;
  return me;
}

export function skoolDisplayName(channel: SkoolChatChannel): string {
  const u = channel.user;
  const first = (u?.first_name ?? "").trim();
  const last = (u?.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || (u?.name ?? "Unknown");
}


