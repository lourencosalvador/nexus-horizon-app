"use client";

import { useMemo, useState } from "react";
import { PlugZap, ShieldCheck, ShieldX, TestTubeDiagonal } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { getActiveInstance, getActiveInstanceId } from "@/shared/stores/instanceStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";
import { cn } from "@/lib/utils";

type VerifyResponse = {
  ok: boolean;
  baseUrl?: string;
  status?: number;
  looksLoggedIn?: boolean | null;
  api2Status?: number | null;
  api2LoggedIn?: boolean | null;
  note?: string;
  error?: string;
};

type InternalRequestResponse = {
  ok: boolean;
  status?: number;
  contentType?: string | null;
  json?: unknown;
  textPreview?: string;
  error?: string;
};

type SkoolChatMessage = {
  id: string;
  metadata?: { content?: string; src?: string; dst?: string };
  created_at?: string;
  updated_at?: string;
  channel_id?: string;
};

type SkoolChatChannel = {
  id: string;
  metadata?: { num_unread?: number; last_read?: string };
  created_at?: string;
  updated_at?: string;
  last_message_id?: string;
  last_message_at?: string;
  user_ids?: string[];
  user?: { id: string; name?: string; metadata?: { online?: number; picture_profile?: string; picture_bubble?: string } };
  last_message?: SkoolChatMessage;
};

type SkoolChatChannelsResponse = { channels: SkoolChatChannel[] };
type SkoolChatMessagesResponse = {
  messages: SkoolChatMessage[];
  has_more_before?: boolean;
  has_more_after?: boolean;
  channel?: SkoolChatChannel;
};

export default function SkoolIntegrationPage() {
  const activeId = getActiveInstanceId();
  const active = getActiveInstance();
  const session = activeId ? getSkoolSession(activeId) : null;

  const [verifyState, setVerifyState] = useState<{
    status: "idle" | "loading" | "ok" | "error";
    message?: string;
    data?: VerifyResponse;
  }>({ status: "idle" });

  const [testPath, setTestPath] = useState<string>("/self/chat-channels?offset=0&limit=30&last=true&unread-only=false");
  const [testState, setTestState] = useState<{
    status: "idle" | "loading" | "ok" | "error";
    message?: string;
    data?: InternalRequestResponse;
  }>({ status: "idle" });

  const [channelsState, setChannelsState] = useState<{
    status: "idle" | "loading" | "ok" | "error";
    message?: string;
    channels?: SkoolChatChannel[];
  }>({ status: "idle" });
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messagesState, setMessagesState] = useState<{
    status: "idle" | "loading" | "ok" | "error";
    message?: string;
    data?: SkoolChatMessagesResponse;
  }>({ status: "idle" });
  const [sendDraft, setSendDraft] = useState("");
  const [sendState, setSendState] = useState<{ status: "idle" | "loading" | "ok" | "error"; message?: string }>({
    status: "idle",
  });
  const [readState, setReadState] = useState<{ status: "idle" | "loading" | "ok" | "error"; message?: string }>({
    status: "idle",
  });

  const hasEncrypted = Boolean(session?.encryptedCookie);
  const hasLegacyCookie = Boolean(session?.cookie);

  const canVerify = Boolean(activeId && session && (hasEncrypted || hasLegacyCookie));

  const connectionBadge = useMemo(() => {
    if (!activeId) return { variant: "amber" as const, label: "No active instance" };
    if (!session) return { variant: "amber" as const, label: "Not connected" };
    if (hasEncrypted) return { variant: "green" as const, label: "Session connected" };
    if (hasLegacyCookie) return { variant: "amber" as const, label: "Connected (legacy cookie)" };
    return { variant: "amber" as const, label: "Not connected" };
  }, [activeId, session, hasEncrypted, hasLegacyCookie]);

  const verify = async () => {
    if (!activeId || !session) return;
    setVerifyState({ status: "loading", message: "Verifying…" });
    try {
      const res = await fetch("/api/integrations/skool/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: session.baseUrl,
          encryptedCookie: session.encryptedCookie,
          cookie: session.encryptedCookie ? undefined : session.cookie,
        }),
      });
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok || data.ok === false) {
        setVerifyState({ status: "error", message: data.error || "Verify failed.", data });
        return;
      }
      setVerifyState({ status: "ok", message: "Verified.", data });
    } catch {
      setVerifyState({ status: "error", message: "Network error." });
    }
  };

  const internalRequest = async (pathOrUrl: string, opts?: { method?: "GET" | "POST"; jsonBody?: unknown }) => {
    if (!activeId || !session || !session.encryptedCookie) {
      throw new Error("No encrypted session found. Reconnect the instance first.");
    }
    const raw = pathOrUrl.trim();
    const apiBaseUrl = session.apiBaseUrl ?? "https://api2.skool.com";
    const res = await fetch("/api/integrations/skool/internal/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: apiBaseUrl,
        encryptedCookie: session.encryptedCookie,
        path: raw,
        method: opts?.method ?? "GET",
        jsonBody: opts?.jsonBody,
      }),
    });
    const data = (await res.json()) as InternalRequestResponse;
    if (!res.ok || data.ok === false) {
      const hint =
        res.status === 401
          ? "Unauthorized (401). Your stored session likely doesn’t include a valid auth_token / WAF token for api2.skool.com. Reconnect the instance (or use Advanced cookie mode)."
          : null;
      throw new Error(data.error || hint || "Request failed.");
    }
    return data;
  };

  const runInternalTest = async () => {
    if (!activeId || !session || !session.encryptedCookie) {
      setTestState({ status: "error", message: "No encrypted session found. Reconnect the instance first." });
      return;
    }
    const raw = testPath.trim();
    let p = raw;
    // Allow pasting the full URL from DevTools.
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const u = new URL(raw);
        p = `${u.pathname}${u.search}`;
        setTestPath(p);
      } catch {
        // fall through to validation below
      }
    }
    if (!p.startsWith("/")) {
      setTestState({ status: "error", message: "Paste a path starting with '/' (or a full https:// URL)." });
      return;
    }
    setTestState({ status: "loading", message: "Requesting…" });
    try {
      const data = await internalRequest(p, { method: "GET" });
      setTestState({ status: "ok", message: "OK", data });
    } catch (e) {
      setTestState({ status: "error", message: e instanceof Error ? e.message : "Network error." });
    }
  };

  const loadChannels = async () => {
    setChannelsState({ status: "loading", message: "Loading channels…" });
    setMessagesState({ status: "idle" });
    try {
      const r = await internalRequest("/self/chat-channels?offset=0&limit=30&last=true&unread-only=false", { method: "GET" });
      const json = r.json as SkoolChatChannelsResponse | undefined;
      const channels = Array.isArray(json?.channels) ? json.channels : [];
      if (channels.length === 0) {
        setChannelsState({ status: "error", message: "No channels returned (unexpected response)." });
        return;
      }
      setChannelsState({ status: "ok", message: `Loaded ${channels.length} channels.`, channels });
      setSelectedChannelId((prev) => prev ?? channels[0]?.id ?? null);
    } catch (e) {
      setChannelsState({ status: "error", message: e instanceof Error ? e.message : "Failed to load channels." });
    }
  };

  const loadMessages = async (channel: SkoolChatChannel) => {
    setSelectedChannelId(channel.id);
    setMessagesState({ status: "loading", message: "Loading messages…" });
    setSendState({ status: "idle" });
    setReadState({ status: "idle" });
    try {
      const anchor = channel.last_message_id || channel.metadata?.last_read;
      if (!anchor) {
        setMessagesState({ status: "error", message: "Channel has no anchor message id (last_message_id/last_read)." });
        return;
      }
      const r = await internalRequest(`/channels/${channel.id}/messages?before=50&after=0&msg=${encodeURIComponent(anchor)}`, { method: "GET" });
      const json = r.json as SkoolChatMessagesResponse | undefined;
      const messages = Array.isArray(json?.messages) ? json?.messages : [];
      setMessagesState({ status: "ok", message: `Loaded ${messages.length} messages.`, data: json });
    } catch (e) {
      setMessagesState({ status: "error", message: e instanceof Error ? e.message : "Failed to load messages." });
    }
  };

  const sendMessage = async () => {
    const channelId = selectedChannelId;
    const content = sendDraft.trim();
    if (!channelId) {
      setSendState({ status: "error", message: "Select a channel first." });
      return;
    }
    if (!content) {
      setSendState({ status: "error", message: "Type a message first." });
      return;
    }
    setSendState({ status: "loading", message: "Sending…" });
    try {
      const r = await internalRequest(`/channels/${channelId}/messages?ct=wdm`, {
        method: "POST",
        jsonBody: { content, attachments: [] },
      });
      const created = r.json as SkoolChatMessage | undefined;
      setSendDraft("");
      setSendState({ status: "ok", message: created?.id ? `Sent (id: ${created.id}).` : "Sent." });

      // Refresh messages to include the newly sent one (best-effort).
      const channel = channelsState.channels?.find((c) => c.id === channelId);
      if (channel) {
        await loadMessages(channel);
      }
    } catch (e) {
      setSendState({ status: "error", message: e instanceof Error ? e.message : "Failed to send." });
    }
  };

  const markRead = async () => {
    const channelId = selectedChannelId;
    const last = messagesState.data?.messages?.[0]?.id;
    if (!channelId) {
      setReadState({ status: "error", message: "Select a channel first." });
      return;
    }
    if (!last) {
      setReadState({ status: "error", message: "No messages loaded yet." });
      return;
    }
    setReadState({ status: "loading", message: "Marking as read…" });
    try {
      await internalRequest(`/channels/${channelId}/read`, {
        method: "POST",
        jsonBody: { last_read: last, unread: false, num_unread: 0 },
      });
      setReadState({ status: "ok", message: "Marked as read." });
      // Refresh channels list to update unread badge.
      await loadChannels();
    } catch (e) {
      setReadState({ status: "error", message: e instanceof Error ? e.message : "Failed to mark read." });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Skool</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Connect and validate sessions, then test internal endpoints for the connector.
          </p>
        </div>
        <Badge variant={connectionBadge.variant}>{connectionBadge.label}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap size={16} />
              Connection
            </CardTitle>
            <CardDescription>Active instance + stored session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Active instance</div>
                <Badge variant={active ? "blue" : "amber"}>{active ? "READY" : "MISSING"}</Badge>
              </div>
              <div className="mt-2 text-sm text-zinc-700">
                {active ? (
                  <>
                    <div className="font-semibold">{active.name}</div>
                    <div className="text-xs font-semibold text-zinc-500">{active.url}</div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-zinc-500">Select an instance in Setup first.</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Session</div>
                {session ? (
                  <Badge variant={hasEncrypted ? "green" : "amber"}>{hasEncrypted ? "ENCRYPTED" : "LEGACY"}</Badge>
                ) : (
                  <Badge variant="amber">NONE</Badge>
                )}
              </div>
              <div className="mt-2 text-xs font-semibold text-zinc-500">
                Base URL: <span className="text-zinc-700">{session?.baseUrl ?? "—"}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-500">
                Stored at:{" "}
                <span className="text-zinc-700">
                  {session?.createdAt ? new Date(session.createdAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="mt-3">
                <Button className="cursor-pointer w-full" onClick={verify} disabled={!canVerify || verifyState.status === "loading"}>
                  {verifyState.status === "loading" ? "Verifying…" : "Verify session"}
                </Button>
              </div>
              {verifyState.status !== "idle" && (
                <div
                  className={cn(
                    "mt-3 rounded-2xl border px-4 py-3 text-sm",
                    verifyState.status === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : verifyState.status === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {verifyState.status === "ok" ? (
                      <ShieldCheck size={16} className="mt-0.5" />
                    ) : (
                      <ShieldX size={16} className="mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold">{verifyState.message}</div>
                      {verifyState.data?.looksLoggedIn !== undefined && (
                        <div className="mt-1 text-xs font-semibold opacity-80">
                          looksLoggedIn: {String(verifyState.data.looksLoggedIn)}
                        </div>
                      )}
                      {verifyState.data?.api2Status !== undefined && (
                        <div className="mt-1 text-xs font-semibold opacity-80">
                          api2Status: {String(verifyState.data.api2Status)} • api2LoggedIn: {String(verifyState.data.api2LoggedIn)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTubeDiagonal size={16} />
              Test internal endpoint
            </CardTitle>
            <CardDescription>
              Use this to replay internal Skool frontend requests (read-only). Start by pasting the path from DevTools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-zinc-900">Request path</div>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  placeholder="/self/chat-channels?offset=0&limit=30&last=true&unread-only=false"
                />
                <Button
                  className="cursor-pointer"
                  onClick={runInternalTest}
                  disabled={testState.status === "loading" || !session?.encryptedCookie}
                >
                  {testState.status === "loading" ? "Testing…" : "Test"}
                </Button>
              </div>
              <div className="mt-2 text-xs font-semibold text-zinc-500">
                Tip: Skool chat uses <span className="text-zinc-700">api2.skool.com</span>. Paste only the path (starting with /).
              </div>
            </div>

            {testState.status !== "idle" && (
              <div
                className={cn(
                  "rounded-2xl border px-4 py-4",
                  testState.status === "ok"
                    ? "border-emerald-200 bg-emerald-50"
                    : testState.status === "error"
                    ? "border-red-200 bg-red-50"
                    : "border-zinc-200 bg-zinc-50"
                )}
              >
                <div className={cn("text-sm font-semibold", testState.status === "error" ? "text-red-900" : "text-zinc-900")}>
                  {testState.message}
                </div>
                <div className="mt-2 text-xs font-semibold text-zinc-600">
                  Status: <span className="text-zinc-900">{testState.data?.status ?? "—"}</span>
                  <span className="mx-2">•</span>
                  Content-Type: <span className="text-zinc-900">{testState.data?.contentType ?? "—"}</span>
                </div>

                {testState.data?.json !== undefined && (
                  <>
                    <Separator className="my-3" />
                    <pre className="max-h-[340px] overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-[12px] text-zinc-900">
                      {JSON.stringify(testState.data.json, null, 2)}
                    </pre>
                  </>
                )}

                {testState.data?.json === undefined && testState.data?.textPreview && (
                  <>
                    <Separator className="my-3" />
                    <pre className="max-h-[340px] overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-[12px] text-zinc-900">
                      {testState.data.textPreview}
                    </pre>
                  </>
                )}
              </div>
            )}

            <Separator className="my-2" />

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Chat explorer (read-only)</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-500">
                    Load chat channels, then click one to fetch messages. This uses the encrypted session via server proxy.
                  </div>
                </div>
                <Button className="cursor-pointer" variant="outline" onClick={loadChannels} disabled={!session?.encryptedCookie || channelsState.status === "loading"}>
                  {channelsState.status === "loading" ? "Loading…" : "Load channels"}
                </Button>
              </div>

              {channelsState.status !== "idle" && (
                <div
                  className={cn(
                    "mt-3 rounded-2xl border px-4 py-3 text-sm",
                    channelsState.status === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : channelsState.status === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700"
                  )}
                >
                  <div className="font-semibold">{channelsState.message}</div>
                </div>
              )}

              {channelsState.channels?.length ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <div className="max-h-[340px] overflow-auto rounded-2xl border border-zinc-200 bg-white">
                      {channelsState.channels.map((c) => {
                        const name = c.user?.name || "Unknown";
                        const unread = c.metadata?.num_unread ?? 0;
                        const last = c.last_message?.metadata?.content || "";
                        const selected = c.id === selectedChannelId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void loadMessages(c)}
                            className={cn(
                              "w-full cursor-pointer border-b border-zinc-100 px-3 py-3 text-left hover:bg-zinc-50",
                              selected ? "bg-zinc-50" : "bg-white"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold text-zinc-900">{name}</div>
                                <div className="mt-1 truncate text-xs font-semibold text-zinc-500">{last || "—"}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                {unread > 0 ? <Badge variant="amber">{unread}</Badge> : <Badge variant="slate">0</Badge>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    {messagesState.status !== "idle" && (
                      <div
                        className={cn(
                          "rounded-2xl border px-4 py-4",
                          messagesState.status === "ok"
                            ? "border-emerald-200 bg-emerald-50"
                            : messagesState.status === "error"
                            ? "border-red-200 bg-red-50"
                            : "border-zinc-200 bg-zinc-50"
                        )}
                      >
                        <div className={cn("text-sm font-semibold", messagesState.status === "error" ? "text-red-900" : "text-zinc-900")}>
                          {messagesState.message}
                        </div>
                        {messagesState.data?.messages?.length ? (
                          <>
                            <Separator className="my-3" />
                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-xs font-semibold text-zinc-600">
                                Selected channel: <span className="text-zinc-900">{selectedChannelId ?? "—"}</span>
                              </div>
                              <Button
                                className="cursor-pointer"
                                variant="outline"
                                onClick={() => void markRead()}
                                disabled={readState.status === "loading" || !selectedChannelId}
                              >
                                {readState.status === "loading" ? "Marking…" : "Mark as read"}
                              </Button>
                            </div>

                            {readState.status !== "idle" ? (
                              <div
                                className={cn(
                                  "mb-3 rounded-2xl border px-3 py-2 text-sm",
                                  readState.status === "ok"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : readState.status === "error"
                                    ? "border-red-200 bg-red-50 text-red-900"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700"
                                )}
                              >
                                <div className="font-semibold">{readState.message}</div>
                              </div>
                            ) : null}

                            <div className="mb-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                              <div className="text-sm font-semibold text-zinc-900">Send message</div>
                              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <Input
                                  value={sendDraft}
                                  onChange={(e) => setSendDraft(e.target.value)}
                                  placeholder='e.g. "1. Getting clients"'
                                />
                                <Button className="cursor-pointer" onClick={() => void sendMessage()} disabled={sendState.status === "loading" || !selectedChannelId}>
                                  {sendState.status === "loading" ? "Sending…" : "Send"}
                                </Button>
                              </div>
                              {sendState.status !== "idle" ? (
                                <div
                                  className={cn(
                                    "mt-3 rounded-2xl border px-3 py-2 text-sm",
                                    sendState.status === "ok"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                      : sendState.status === "error"
                                      ? "border-red-200 bg-red-50 text-red-900"
                                      : "border-zinc-200 bg-zinc-50 text-zinc-700"
                                  )}
                                >
                                  <div className="font-semibold">{sendState.message}</div>
                                </div>
                              ) : null}
                            </div>

                            <pre className="max-h-[340px] overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-[12px] text-zinc-900">
                              {JSON.stringify(messagesState.data.messages, null, 2)}
                            </pre>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


