"use client";

import { useEffect, useMemo, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import { ArrowUpRight, ChevronRight, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis } from "recharts";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/shared/ui/chart";
import { cn } from "@/lib/utils";
import {
  getActiveInstanceId,
  getStoredInstances,
  setActiveInstanceId,
  setStoredInstances,
  type WorkspaceInstance,
} from "@/shared/stores/instanceStore";
import { getStoredUsage } from "@/shared/stores/usageStore";
import { getSkoolApiPostsConfig } from "@/shared/stores/skoolApiPostsConfigStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";

type ModerationItem = {
  id: string;
  author: string;
  where: string;
  age: string;
  title: string;
  excerpt: string;
  tag: string;
};

type ModerationMetricsResponse =
  | {
      ok: true;
      flagged: { series: Array<{ month: string; posts: number; comments: number }> };
      analyzed: { series: Array<{ month: string; posts: number; comments: number; total: number }> };
      note?: string;
    }
  | { ok: false; error: string; issues?: unknown };

type ModerationDbItem = {
  entity_type: "post";
  entity_id: string;
  category_name: string | null;
  decision: "approved" | "needs_review" | "blocked";
  confidence: number | null;
  updated_at: string | null;
  raw?: {
    post?: {
      title?: string | null;
      content?: string | null;
      created_at?: string | null;
      author?: { username?: string | null; first_name?: string | null; last_name?: string | null; metadata?: any } | null;
      user?: { username?: string | null; name?: string | null; first_name?: string | null; last_name?: string | null; metadata?: any } | null;
    };
  } | null;
};

type ModerationListResponse =
  | { ok: true; items: ModerationDbItem[]; count?: number | null; limit: number; offset: number }
  | { ok: false; error: string; issues?: unknown };

async function inferGroupSlugFromSkool(encryptedCookie: string): Promise<string | null> {
  const candidates = [
    "/self/notifications?limit=30&type=all",
    "/self/chat-channels?offset=0&limit=30&last=true&unread-only=false",
  ];

  const isGroupSlug = (s: string) => {
    const v = s.trim().toLowerCase();
    if (!v) return false;
    if (["settings", "discovery", "login", "signin", "signup"].includes(v)) return false;
    if (v.startsWith("@")) return false;
    return /^[a-z0-9][a-z0-9-]{1,80}$/.test(v);
  };

  for (const path of candidates) {
    const r = await fetch("/api/integrations/skool/internal/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: "https://api2.skool.com",
        encryptedCookie,
        path,
        method: "GET",
      }),
    });
    const data = (await r.json().catch(() => null)) as any;
    if (!r.ok || data?.ok === false) continue;
    const messages: any[] = Array.isArray(data?.json?.messages) ? data.json.messages : [];
    for (const m of messages) {
      const raw = m?.metadata?.data;
      if (typeof raw !== "string") continue;
      try {
        const meta = JSON.parse(raw) as any;
        const hasGroup = typeof meta?.group_id === "string" || typeof meta?.group_display_name === "string";
        if (!hasGroup) continue;
        const linkAs = typeof meta?.link_as === "string" ? meta.link_as : null;
        if (!linkAs || !linkAs.startsWith("/")) continue;
        const seg = linkAs.split("?")[0].split("/").filter(Boolean)[0] ?? "";
        if (isGroupSlug(seg)) return seg;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function seedFromString(input: string) {
  let s = 0;
  for (let i = 0; i < input.length; i++) s = (s + input.charCodeAt(i) * (i + 1)) % 1000000;
  return s;
}

function avatarUrlFromSeed(seed: number, name: string) {
  const safeName = encodeURIComponent(name || "Nexus");
  return `/api/unsplash/avatar/${seed}/${safeName}`;
}

function formatCompact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function buildDemoBoard(seed: number): ModerationItem[] {
  const items: ModerationItem[] = [
    {
      id: `m_${seed}_1`,
      author: "Chad Samuel",
      where: "General",
      age: "4 days ago",
      title: "Stop Leaking Sales in 2026: Build a Full-Funnel Paid Ads Strategy That Actually Converts",
      excerpt:
        "If you're pouring money into ads but sales feel stuck, your funnel is probably the culprit. Most businesses crush bottom-of-funnel (BOFU) retargeting…",
      tag: "self advertisement",
    },
    {
      id: `m_${seed}_2`,
      author: "Hasnain Nisar",
      where: "General discussion",
      age: "5 days ago",
      title: "Try the Lovable Pro plan for FREE using this promo code",
      excerpt:
        "Perfect time to build and kick off 2026 strong—no need to pay for Cursor or other tools. Sharing this with all my developers and followers. Comment…",
      tag: "self advertisement",
    },
    {
      id: `m_${seed}_3`,
      author: "Eli Bekhor",
      where: "General discussion",
      age: "7 days ago",
      title: "NEED AI AUTOMATION EXPERTS",
      excerpt:
        "Join our FREE AI automation group to network, ask questions, and share workflows: https://chat.whatsapp.com/…",
      tag: "self advertisement",
    },
  ];
  return items;
}

function timeAgo(isoOrNull: string | null | undefined) {
  const iso = isoOrNull ?? undefined;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} ago`;
  if (h >= 1) return `${h} hour${h === 1 ? "" : "s"} ago`;
  if (m >= 1) return `${m} min${m === 1 ? "" : "s"} ago`;
  return `${s}s ago`;
}

function displayAuthorFromRaw(item: ModerationDbItem) {
  const post: any = item.raw?.post ?? null;
  const a = post?.author ?? null;
  const first = (a?.first_name ?? "").trim();
  const last = (a?.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full || (a?.username ?? "").trim()) return full || (a?.username ?? "").trim() || "Member";

  // Fallback to `user` only if we don't have a usable author (some payloads use `user` for the viewer).
  const u = post?.user ?? null;
  const uf = (u?.first_name ?? "").trim();
  const ul = (u?.last_name ?? "").trim();
  const ufull = `${uf} ${ul}`.trim();
  return ufull || (u?.name ?? "").trim() || (u?.username ?? "").trim() || "Member";
}

function avatarSrcFromRaw(item: ModerationDbItem): string | null {
  const post: any = item.raw?.post ?? null;
  if (!post) return null;
  const candidates: any[] = [post.author, post.user].filter(Boolean);
  for (const c of candidates) {
    const meta = c?.metadata ?? null;
    const src = (meta?.picture_profile ?? meta?.picture_bubble ?? "").trim?.() ?? "";
    if (src) return src;
  }
  return null;
}

function buildFlaggedChartFallback(seed: number) {
  const months = ["Oct", "Nov", "Dec"];
  return months.map((m, i) => ({
    month: m,
    comments: 0 + ((seed + i * 17) % 3),
    posts: 0 + ((seed + i * 23) % 4),
  }));
}

function buildAnalyzedChartFallback(seed: number) {
  const months = ["Oct", "Nov", "Dec"];
  return months.map((m, i) => {
    const comments = 0 + ((seed + i * 19) % 5);
    const posts = 0 + ((seed + i * 29) % 7);
    return { month: m, comments, posts, total: comments + posts };
  });
}

export default function DashboardHome() {
  const [userEmail, setUserEmail] = useState<string>("nexus");
  const [userName, setUserName] = useState<string | null>(null);
  const [instances, setInstances] = useState<WorkspaceInstance[]>(() => getStoredInstances());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveInstanceId());
  const [usage] = useState<number>(() => getStoredUsage());
  const activeCfg = getSkoolApiPostsConfig(activeId);
  const skoolSession = activeId ? getSkoolSession(activeId) : null;

  const ease = useMemo(() => cubicBezier(0.22, 1, 0.36, 1), []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user: { email?: string; user_metadata?: { name?: string } } | null }) => {
        queueMicrotask(() => {
          setUserEmail(data.user?.email ?? "nexus");
          setUserName(data.user?.user_metadata?.name ?? null);
        });
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const seed = useMemo(() => seedFromString(userEmail), [userEmail]);

  const queryClient = useQueryClient();
  const moderationQueueQuery = useQuery({
    queryKey: ["moderation", "overview", "needs_review"],
    queryFn: async () => {
      const res = await fetch("/api/moderation/items/list?entity_type=post&decision=needs_review&limit=3&offset=0", {
        method: "GET",
      });
      const data = (await res.json().catch(() => ({}))) as ModerationListResponse;
      if (!res.ok || (data as any).ok === false) {
        throw new Error((data as any).error || "Failed to load moderation items.");
      }
      return data as Extract<ModerationListResponse, { ok: true }>;
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const board = useMemo(() => buildDemoBoard(seed), [seed]); // kept for fallback/skeleton only

  const metricsQuery = useQuery({
    queryKey: ["moderation", "metrics", "months", 3],
    queryFn: async () => {
      const res = await fetch("/api/moderation/metrics?months=3", { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as ModerationMetricsResponse;
      if (!res.ok || (data as any).ok === false) throw new Error((data as any).error || "Failed to load metrics.");
      return data as Extract<ModerationMetricsResponse, { ok: true }>;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const flagged = useMemo(
    () => metricsQuery.data?.flagged?.series ?? buildFlaggedChartFallback(seed),
    [metricsQuery.data?.flagged?.series, seed]
  );
  const analyzed = useMemo(
    () => metricsQuery.data?.analyzed?.series ?? buildAnalyzedChartFallback(seed),
    [metricsQuery.data?.analyzed?.series, seed]
  );

  const primary = useMemo(
    () => instances.find((i) => i.id === activeId) ?? instances[0] ?? null,
    [activeId, instances]
  );
  const hasInstance = instances.length > 0;

  const toggleInstanceStatus = () => {
    if (!primary) return;
    setInstances((prev) => {
      const updated = prev.map((i) =>
        i.id === primary.id
          ? { ...i, status: (i.status === "running" ? "paused" : "running") as WorkspaceInstance["status"] }
          : i
      );
      setStoredInstances(updated);
      return updated;
    });
    toast.success(primary.status === "running" ? "Instance paused." : "Instance resumed.");
  };

  const deleteInstance = () => {
    if (!primary) return;
    setInstances((prev) => {
      const next = prev.filter((i) => i.id !== primary.id);
      const nextActive = next[0]?.id ?? null;
      setActiveId(nextActive);
      setActiveInstanceId(nextActive);
      setStoredInstances(next);
      return next;
    });
    toast.warning("Instance removed.");
  };

  const purgeBots = () => {
    toast.success("Purge queued. No bots found (demo).");
  };

  const container = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease, staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-500">Dashboard &nbsp;›&nbsp; Home</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => (window.location.href = "/connect-instance")}>
            Switch instance
          </Button>
          <Button size="sm" className="cursor-pointer" onClick={() => (window.location.href = "/dashboard/conversations/inbox")}>
            Go to Inbox
            <ArrowUpRight size={14} />
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-zinc-950 via-zinc-900 to-blue-950 p-6 text-white shadow-[0_14px_40px_rgba(0,0,0,0.12)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">Overview</div>
            <div className="mt-2 text-2xl font-extrabold tracking-tight">
              Welcome back{userName ? `, ${userName}` : ""}.
                </div>
            <div className="mt-1 text-sm text-white/70">
              Active instance: <span className="font-semibold text-white">{primary?.name ?? "—"}</span>{" "}
              <span className="text-white/50">({primary?.url ?? "—"})</span>
              </div>
              </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
              Usage: <span className="text-white">{formatCompact(usage)}</span>
            </span>
            <span className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
              primary?.status === "running"
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-amber-400/25 bg-amber-400/10 text-amber-200"
            )}>
              {primary?.status === "running" ? "RUNNING" : "PAUSED"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => (window.location.href = "/connect-instance")}
            >
              Manage instances
              <ArrowUpRight size={14} />
                </Button>
              </div>
                </div>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-extrabold">Moderation Board</CardTitle>
                  <CardDescription>High-signal posts that need review.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => void moderationQueueQuery.refetch()}
                    disabled={moderationQueueQuery.isFetching}
                  >
                    {moderationQueueQuery.isFetching ? "Refreshing…" : "Refresh"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={async () => {
                      try {
                        const urlSlug = primary?.url?.includes("skool.com/")
                          ? primary.url.split("skool.com/").pop()?.trim() ?? null
                          : null;
                        const inferred =
                          !urlSlug && skoolSession?.encryptedCookie ? await inferGroupSlugFromSkool(skoolSession.encryptedCookie) : null;
                        const slug = (urlSlug || inferred || "").trim() || null;

                        if (skoolSession?.encryptedCookie && slug) {
                          // Persist URL so future syncs don't need inference.
                          if (primary?.id) {
                            const instances = getStoredInstances();
                            const nextUrl = `https://www.skool.com/${slug}`;
                            const updated = instances.map((i) => (i.id === primary.id ? { ...i, url: nextUrl } : i));
                            setStoredInstances(updated);
                          }

                          const r = await fetch("/api/moderation/sync/skool/posts", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            // Pull more history to avoid only getting the most recent admin announcements.
                            body: JSON.stringify({ encryptedCookie: skoolSession.encryptedCookie, group: slug, limit: 80 }),
                          });
                          if (!r.ok) {
                            const j = await r.json().catch(() => null);
                            throw new Error((j as any)?.error || `Sync failed (${r.status}).`);
                          }
                          return;
                        }

                        // Only fall back to SkoolAPI if it's actually configured.
                        if (activeCfg?.groupId && activeCfg?.sessionId) {
                          const qp = new URLSearchParams();
                          qp.set("group_id", activeCfg.groupId);
                          qp.set("session_id", activeCfg.sessionId);
                          const url = `/api/moderation/sync/posts?${qp.toString()}`;
                          const r = await fetch(url, { method: "POST" });
                          if (!r.ok) {
                            const j = await r.json().catch(() => null);
                            throw new Error((j as any)?.error || `Sync failed (${r.status}).`);
                          }
                          return;
                        }

                        toast.error("Missing Skool session for this instance. Reconnect using Advanced cookie mode.");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Sync failed.");
                      } finally {
                        void queryClient.invalidateQueries({ queryKey: ["moderation"] });
                      }
                    }}
                  >
                    Sync
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => (window.location.href = "/dashboard/moderation/posts")}
                  >
                    Open queue
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {moderationQueueQuery.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-900">
                  {(moderationQueueQuery.error as Error)?.message || "Failed to load moderation board."}
                </div>
              ) : moderationQueueQuery.isLoading ? (
                <div className="space-y-3">
                  {board.slice(0, 3).map((p, idx) => (
                    <div key={p.id} className="animate-pulse rounded-2xl border border-zinc-200 bg-white px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-2xl bg-zinc-200" />
                          <div className="min-w-0">
                            <div className="h-4 w-32 rounded bg-zinc-200" />
                            <div className="mt-2 h-3 w-44 rounded bg-zinc-200" />
                          </div>
                        </div>
                        <div className="h-5 w-5 rounded bg-zinc-200" />
                      </div>
                      <div className="mt-4 h-5 w-3/4 rounded bg-zinc-200" />
                      <div className="mt-3 h-4 w-full rounded bg-zinc-200" />
                    </div>
                  ))}
                </div>
              ) : (moderationQueueQuery.data?.items?.length ?? 0) > 0 ? (
                moderationQueueQuery.data!.items.map((it, idx) => {
                  const author = displayAuthorFromRaw(it);
                  const where = (it.category_name ?? "").trim() || "Community";
                  const age = timeAgo(it.raw?.post?.created_at ?? it.updated_at ?? null) ?? "—";
                  const rawPost = it.raw?.post ?? null;
                  const title = ((rawPost as any)?.metadata?.title ?? rawPost?.title ?? "").trim() || "Post";
                  const contentRaw = ((rawPost as any)?.metadata?.content ?? rawPost?.content ?? "").trim();
                  const excerpt = (contentRaw || "").slice(0, 160);
                  const avSeed = seed + idx * 77;
                  const avatarSrc = avatarSrcFromRaw(it) || avatarUrlFromSeed(avSeed, author);
                  const tag = "needs review";

                return (
                  <motion.div
                      key={it.entity_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 + idx * 0.04, duration: 0.22, ease }}
                    className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition-colors hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                          <Avatar name={author} src={avatarSrc} online={false} size="md" />
                        <div className="min-w-0">
                            <div className="text-sm font-extrabold text-zinc-900">{author}</div>
                          <div className="mt-0.5 text-xs font-semibold text-zinc-500">
                              {age} in {where}
                          </div>
                        </div>
                      </div>
                      <ShieldAlert size={18} className="text-amber-600" />
                    </div>

                      <div className="mt-4 text-xl font-extrabold text-zinc-900 leading-snug">{title}</div>
                      <div className="mt-3 text-sm text-zinc-600 leading-relaxed">
                        {excerpt ? `${excerpt}${contentRaw.length > excerpt.length ? "…" : ""}` : "No content available."}
                      </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-extrabold text-white">
                          {tag}
                      </span>
                      <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="cursor-pointer"
                            onClick={() => {
                              void fetch("/api/moderation/items/set", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ entityType: "post", entityId: it.entity_id, decision: "approved" }),
                              }).finally(() => void queryClient.invalidateQueries({ queryKey: ["moderation"] }));
                            }}
                          >
                          Approve
                        </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="cursor-pointer"
                            onClick={() => {
                              void fetch("/api/moderation/items/set", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ entityType: "post", entityId: it.entity_id, decision: "blocked" }),
                              }).finally(() => void queryClient.invalidateQueries({ queryKey: ["moderation"] }));
                            }}
                          >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
                })
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 text-center">
                  <div className="text-sm font-semibold text-zinc-900">No posts need review</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-500">
                    Click Sync to ingest recent posts, or wait for webhooks.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold">Flagged posts and comments</CardTitle>
              <CardDescription>Total number of flagged posts and comments from your instances.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  comments: { label: "Comments", color: "#2563eb" },
                  posts: { label: "Posts", color: "#60a5fa" },
                }}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={flagged} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(24,24,27,0.06)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="comments" fill="var(--chart-comments)" radius={[10, 10, 4, 4]} />
                    <Bar dataKey="posts" fill="var(--chart-posts)" radius={[10, 10, 4, 4]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold">Total analyzed</CardTitle>
              <CardDescription>Total number of posts and comments analyzed by your instances.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ total: { label: "Total", color: "#2563eb" } }}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={analyzed} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(24,24,27,0.06)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="var(--chart-total)"
                      strokeWidth={2.5}
                      fill="var(--chart-total)"
                      fillOpacity={0.14}
                      dot={false}
                      isAnimationActive
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-extrabold">{primary?.name ?? "Free Community"}</CardTitle>
                  <CardDescription>{primary?.url ?? "skool.com/automation-masters"}</CardDescription>
                </div>
                <Badge variant={primary?.status === "running" ? "blue" : "amber"}>
                  {primary?.status === "running" ? "RUNNING" : "PAUSED"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" className="cursor-pointer flex-1" onClick={toggleInstanceStatus} disabled={!primary}>
                  {primary?.status === "running" ? "Pause" : "Resume"}
                </Button>
                <Button variant="destructive" className="cursor-pointer flex-1" onClick={deleteInstance} disabled={!primary}>
                  Delete
                  <Trash2 size={16} />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-extrabold">Spam Detection</CardTitle>
                  <CardDescription>Any spam detected members will show up here…</CardDescription>
                </div>
                <Sparkles size={18} className="text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="cursor-pointer w-full" onClick={purgeBots} disabled={!hasInstance}>
                Purge bots
                <ArrowUpRight size={14} />
              </Button>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </motion.div>
  );
}

