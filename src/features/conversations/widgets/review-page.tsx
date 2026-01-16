"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, MessageSquare, Search, UserRound, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getActiveInstanceId } from "@/shared/stores/instanceStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";
import { getPendingHumanChannels, setInboxAutomationState } from "@/shared/stores/inboxAutomationStore";
import { skoolListChannels, skoolDisplayName, type SkoolChatChannel } from "@/features/conversations/lib/skool-chat";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return `${s}s ago`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const activeInstanceId = getActiveInstanceId();
  const skoolSession = activeInstanceId ? getSkoolSession(activeInstanceId) : null;
  const skoolConnector = useMemo(() => {
    if (!skoolSession?.encryptedCookie) return null;
    return { encryptedCookie: skoolSession.encryptedCookie, apiBaseUrl: skoolSession.apiBaseUrl };
  }, [skoolSession?.encryptedCookie, skoolSession?.apiBaseUrl]);

  const skoolChannelsQuery = useQuery({
    queryKey: ["skool", "chat-channels", activeInstanceId, skoolConnector?.encryptedCookie],
    enabled: Boolean(skoolConnector),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!skoolConnector) return [];
      return await skoolListChannels(skoolConnector);
    },
  });

  const pendingItems = useMemo(() => {
    if (!activeInstanceId) return [];
    const pending = getPendingHumanChannels(activeInstanceId);
    const channels = skoolChannelsQuery.data ?? [];
    return pending.map((p) => {
      const channel = channels.find((c) => c.id === p.channelId);
      const name = channel ? skoolDisplayName(channel) : "Unknown";
      const avatarUrl = channel?.user?.metadata?.picture_profile ?? undefined;
      const lastMessage = channel?.last_message?.metadata?.content ?? "";
      const online = Boolean((channel?.user?.metadata?.online ?? 0) === 1);
      return {
        channelId: p.channelId,
        name,
        avatarUrl,
        lastMessage,
        online,
        state: p.state,
      };
    });
  }, [activeInstanceId, skoolChannelsQuery.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pendingItems;
    return pendingItems.filter((it) => it.name.toLowerCase().includes(q) || it.lastMessage.toLowerCase().includes(q));
  }, [pendingItems, query]);

  const markAsReviewed = (channelId: string) => {
    if (!activeInstanceId) return;
    const item = pendingItems.find((it) => it.channelId === channelId);
    if (!item) return;
    setInboxAutomationState(activeInstanceId, channelId, {
      ...item.state,
      pendingHuman: false,
      lastProcessedInboundId: null, // Allow bot to respond to next message
    });
    toast.success("Marked as reviewed. Automation will resume on next message.");
  };

  const goToChat = (channelId: string) => {
    router.push(`/dashboard/conversations/inbox?channel=${encodeURIComponent(channelId)}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Human Review</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Conversations flagged for manual review. Respond, mark as reviewed, or let automation resume.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="amber" className="text-sm">
            {filtered.length} pending
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-600" />
                Flagged Conversations
              </CardTitle>
              <CardDescription>These conversations need your attention before automation resumes.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search flagged conversations..." className="pl-9" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <div className="mt-4 text-base font-extrabold text-zinc-900">All caught up!</div>
              <div className="mt-1 text-sm text-zinc-500">No conversations need manual review right now.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((it) => (
                <motion.div
                  key={it.channelId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <Avatar name={it.name} src={it.avatarUrl} online={it.online} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-base font-extrabold text-zinc-900">{it.name}</div>
                          <Badge variant="amber" className="text-[10px]">
                            Review
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-sm text-zinc-600">{it.lastMessage || "No recent message"}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-500">
                          <span>Flagged {timeAgo(it.state.initializedAt)}</span>
                          {it.state.path && (
                            <>
                              <span>•</span>
                              <span>Path {it.state.path}</span>
                            </>
                          )}
                          {it.state.stage && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{it.state.stage.replace(/_/g, " ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => goToChat(it.channelId)}
                      >
                        <MessageSquare size={14} />
                        Open Chat
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="cursor-pointer bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => markAsReviewed(it.channelId)}
                      >
                        <CheckCircle2 size={14} />
                        Mark Reviewed
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
