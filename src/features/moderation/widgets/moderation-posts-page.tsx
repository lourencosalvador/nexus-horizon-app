"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
import { getActiveInstance, getActiveInstanceId, getStoredInstances, setStoredInstances } from "@/shared/stores/instanceStore";
import { getSkoolApiPostsConfig } from "@/shared/stores/skoolApiPostsConfigStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";
import { extractSkoolGroupSlug } from "@/shared/utils/skool";

type ModerationResult = {
  decision: "approved" | "needs_review" | "blocked";
  confidence: number;
  reasons: string[];
  signals: string[];
  layer: "heuristics_only" | "heuristics_plus_ai";
  isJobsContext: boolean;
  model?: string;
};

type ModerationItem = {
  entity_type: "post";
  entity_id: string;
  group_id: string | null;
  category_id: string | null;
  category_name: string | null;
  decision: "approved" | "needs_review" | "blocked";
  confidence: number | null;
  reasons: string[] | null;
  signals: string[] | null;
  layer: "heuristics_only" | "heuristics_plus_ai" | null;
  is_jobs_context: boolean | null;
  model: string | null;
  updated_at: string | null;
  raw?: {
    post?: {
      id?: string | null;
      name?: string | null;
      title?: string | null;
      content?: string | null;
      metadata?: { title?: string | null; content?: string | null } | null;
      created_at?: string | null;
      author?: { username?: string | null; first_name?: string | null; last_name?: string | null } | null;
      user?: {
        username?: string | null;
        name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        metadata?: { picture_profile?: string | null; picture_bubble?: string | null } | null;
      } | null;
    };
  } | null;
};

type ListResponse =
  | { ok: true; items: ModerationItem[]; count?: number | null; limit: number; offset: number }
  | { ok: false; error: string; issues?: unknown };

function displayAuthorFromRaw(item: ModerationItem) {
  const a = item.raw?.post?.author ?? null;
  const first = (a?.first_name ?? "").trim();
  const last = (a?.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full || (a?.username ?? "").trim()) return full || (a?.username ?? "").trim() || "Member";

  // NOTE: In some Skool payloads, `post.user` is the *viewer/current user* rather than the post author.
  // So we only fall back to `user` if we don't have a usable `author` object.
  const u = item.raw?.post?.user ?? null;
  if (u) {
    const uf = (u.first_name ?? "").trim();
    const ul = (u.last_name ?? "").trim();
    const ufull = `${uf} ${ul}`.trim();
    return ufull || (u.name ?? "").trim() || (u.username ?? "").trim() || "Member";
  }

  return "Member";
}

function avatarSrcFromRaw(item: ModerationItem): string | undefined {
  const post: any = item.raw?.post ?? null;
  if (!post) return undefined;

  // Prefer avatar from `author` if present, then `user`.
  const candidates: any[] = [post.author, post.user].filter(Boolean);
  for (const c of candidates) {
    const meta = c?.metadata ?? null;
    const src = (meta?.picture_profile ?? meta?.picture_bubble ?? "").trim?.() ?? "";
    if (src) return src;
  }
  return undefined;
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

async function inferGroupSlugFromSkool(session: { encryptedCookie: string }): Promise<string | null> {
  // Try notifications first (this is what we saw in your payload: { messages: [...] }).
  const candidates = [
    "/self/notifications?limit=30&type=all",
    // Fallback: chat channels (doesn't always include a group link, but cheap to try)
    "/self/chat-channels?offset=0&limit=30&last=true&unread-only=false",
  ];

  const isGroupSlug = (s: string) => {
    const v = s.trim().toLowerCase();
    if (!v) return false;
    // reject obvious non-group pages
    if (["settings", "discovery", "login", "signin", "signup"].includes(v)) return false;
    if (v.startsWith("@")) return false;
    // allow common slugs (letters/numbers/hyphen). keep it permissive but safe.
    return /^[a-z0-9][a-z0-9-]{1,80}$/.test(v);
  };

  for (const path of candidates) {
    const r = await fetch("/api/integrations/skool/internal/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: "https://api2.skool.com",
        encryptedCookie: session.encryptedCookie,
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
        // Strong signal that this is a group-related notification
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

export default function ModerationPostsPage() {
  const active = getActiveInstance();
  const activeInstanceId = active?.id ?? getActiveInstanceId();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "needs_review" | "approved" | "blocked">("all");
  const PAGE_SIZE = 20;
  const offset = (page - 1) * PAGE_SIZE;
  const decisionParam = filter === "all" ? "" : `&decision=${encodeURIComponent(filter)}`;
  const [syncing, setSyncing] = useState(false);
  const cfg = activeInstanceId ? getSkoolApiPostsConfig(activeInstanceId) : null;
  const skoolSession = activeInstanceId ? getSkoolSession(activeInstanceId) : null;
  const groupSlug = extractSkoolGroupSlug(active?.url);

  const listQuery = useQuery({
    queryKey: ["moderation", "items", "post", filter, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/moderation/items/list?entity_type=post${decisionParam}&limit=${PAGE_SIZE}&offset=${offset}`,
        { method: "GET" }
      );
      const data = (await res.json().catch(() => ({}))) as ListResponse;
      if (!res.ok || (data as any).ok === false) {
        throw new Error((data as any).error || "Failed to load moderation queue.");
      }
      return data as Extract<ListResponse, { ok: true }>;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const items = listQuery.data?.items ?? [];
  const count = listQuery.data?.count ?? null;
  const totalPages = typeof count === "number" && count > 0 ? Math.ceil(count / PAGE_SIZE) : null;

  const emptyTitle =
    filter === "needs_review"
      ? "No posts need review"
      : filter === "approved"
      ? "No approved posts"
      : filter === "blocked"
      ? "No blocked posts"
      : "No moderation items yet";
  const emptyBody =
    filter === "needs_review"
      ? "When something is flagged, it will show up here."
      : filter === "approved"
      ? "Approved items will appear here."
      : filter === "blocked"
      ? "Blocked items will appear here."
      : "Run a sync to ingest the latest posts, or wait for webhooks to populate the queue.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Posts</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Review queue for posts flagged by the system{active?.name ? ` (instance: ${active.name})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="cursor-pointer"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw size={16} className={cn("mr-2", listQuery.isFetching ? "animate-spin" : "")} />
            {listQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            className="cursor-pointer"
            variant="outline"
            onClick={async () => {
              if (syncing) return;
              setSyncing(true);
              try {
                if (skoolSession?.encryptedCookie) {
                  const slug = groupSlug ?? (await inferGroupSlugFromSkool({ encryptedCookie: skoolSession.encryptedCookie }));
                  if (!slug) {
                    toast.error(
                      "Could not detect your community slug. Set the Community URL on Connect instance, or open Skool once to generate recent activity."
                    );
                    return;
                  }

                  if (activeInstanceId) {
                    const instances = getStoredInstances();
                    const nextUrl = `https://www.skool.com/${slug}`;
                    const updated = instances.map((i) => (i.id === activeInstanceId ? { ...i, url: nextUrl } : i));
                    setStoredInstances(updated);
                  }

                  const res = await fetch("/api/moderation/sync/skool/posts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Pull more history to avoid only getting a biased subset of admin announcements.
                    body: JSON.stringify({ encryptedCookie: skoolSession.encryptedCookie, group: slug, limit: 200, maxPages: 20, sort: "newest" }),
                  });
                  if (!res.ok) {
                    const j = await res.json().catch(() => null);
                    throw new Error((j as any)?.error || `Sync failed (${res.status}).`);
                  }
                } else {
                  // Don't fall back to SkoolAPI unless it's actually configured.
                  if (cfg?.groupId && cfg?.sessionId) {
                    const qp = new URLSearchParams();
                    qp.set("group_id", cfg.groupId);
                    qp.set("session_id", cfg.sessionId);
                    const url = `/api/moderation/sync/posts?${qp.toString()}`;
                    const res = await fetch(url, { method: "POST" });
                    if (!res.ok) {
                      const j = await res.json().catch(() => null);
                      throw new Error((j as any)?.error || `Sync failed (${res.status}).`);
                    }
                  } else {
                    toast.error("Sessão Skool não encontrada nesta instância. Vai em “Connect instance” para reconectar.");
                  }
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Sync failed.");
              } finally {
                setSyncing(false);
                void queryClient.invalidateQueries({ queryKey: ["moderation"] });
              }
            }}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync latest posts"}
          </Button>
          <Badge variant="default">Moderation</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "needs_review", "approved", "blocked"] as const).map((k) => {
          const label =
            k === "all"
              ? "All"
              : k === "needs_review"
              ? "Needs review"
              : k === "approved"
              ? "Approved"
              : "Blocked";
          const isActive = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPage(1);
                setFilter(k);
              }}
              className={cn(
                "cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition border",
                isActive
                  ? "bg-black text-white border-black"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              )}
            >
              {label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="default">Page {page}{totalPages ? ` / ${totalPages}` : ""}</Badge>
          <Button
            className="cursor-pointer"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={listQuery.isFetching || page <= 1}
          >
            Previous
          </Button>
          <Button
            className="cursor-pointer"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={listQuery.isFetching || (totalPages ? page >= totalPages : false)}
          >
            Next
          </Button>
        </div>
      </div>

      {listQuery.isError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm font-semibold text-red-900">
          {(listQuery.error as Error)?.message || "Failed to load moderation queue."}
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-3xl border border-zinc-200 bg-white px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-zinc-200" />
                  <div>
                    <div className="h-4 w-40 rounded bg-zinc-200" />
                    <div className="mt-2 h-3 w-56 rounded bg-zinc-200" />
                  </div>
                </div>
                <div className="h-8 w-24 rounded-full bg-zinc-200" />
              </div>
              <div className="mt-5 h-6 w-2/3 rounded bg-zinc-200" />
              <div className="mt-3 h-4 w-5/6 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
      ) : items.length ? (
        <div className="space-y-4">
          {items.map((it) => {
            const r: ModerationResult | null =
              it.decision && it.confidence !== null
                ? {
                    decision: it.decision,
                    confidence: it.confidence ?? 0,
                    reasons: it.reasons ?? [],
                    signals: it.signals ?? [],
                    layer: (it.layer ?? "heuristics_only") as ModerationResult["layer"],
                    isJobsContext: Boolean(it.is_jobs_context),
                    model: it.model ?? undefined,
                  }
                : null;

            const decision = it.decision ?? "needs_review";
            const badgeVariant = decision === "approved" ? "green" : decision === "blocked" ? "red" : "amber";
            const icon =
              decision === "approved" ? (
                <ShieldCheck size={18} className="text-emerald-600" />
              ) : decision === "blocked" ? (
                <ShieldX size={18} className="text-red-600" />
              ) : (
                <ShieldAlert size={18} className="text-orange-600" />
              );

            const rawPost = it.raw?.post ?? null;
            const title = (rawPost?.metadata?.title ?? rawPost?.title ?? "").trim() || "Post";
            const contentRaw = (rawPost?.metadata?.content ?? rawPost?.content ?? "").trim();
            const content = contentRaw || "No content available.";
            const when = timeAgo(it.raw?.post?.created_at ?? it.updated_at ?? null);
            const category = (it.category_name ?? "").trim() || null;
            const author = displayAuthorFromRaw(it);
            const avatarSrc = avatarSrcFromRaw(it);

            const groupSlugForLink = active?.url?.includes("skool.com/")
              ? active.url.split("skool.com/").pop()?.trim() ?? null
              : null;
            const postSlugForLink = (rawPost?.name ?? "").trim() || null;
            const postUrl =
              groupSlugForLink && postSlugForLink
                ? `https://www.skool.com/${groupSlugForLink}/${postSlugForLink}?p=${encodeURIComponent(it.entity_id)}`
                : null;
            return (
              <div key={it.entity_id} className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4 min-w-0">
                    <Avatar name={author} src={avatarSrc} size="lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-base font-extrabold text-zinc-900">{author}</div>
                        <div className="text-xs font-semibold text-zinc-500">{when ? `• ${when}` : null}</div>
                        <div className="text-xs font-semibold text-zinc-500">{category ? `• in ${category}` : null}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-extrabold tracking-tight text-zinc-900">{title}</div>
                        {postUrl ? (
                          <Link
                            href={postUrl}
                            target="_blank"
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            <ExternalLink size={14} />
                            Open in Skool
                          </Link>
                        ) : null}
                      </div>
                      <div className="mt-3 line-clamp-4 text-sm text-zinc-700">{content}</div>
                      <div className="mt-5 inline-flex items-center rounded-full bg-zinc-900 px-4 py-2 text-xs font-extrabold text-white">
                        {decision === "needs_review" ? "Needs review" : decision}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2">
                      {icon}
                      <Badge variant={badgeVariant as any}>{decision}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        className="cursor-pointer"
                        variant="outline"
                        onClick={() => {
                          void fetch("/api/moderation/items/set", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ entityType: "post", entityId: it.entity_id, decision: "approved" }),
                          }).finally(() => void queryClient.invalidateQueries({ queryKey: ["moderation", "items"] }));
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        className="cursor-pointer"
                        variant="destructive"
                        onClick={() => {
                          void fetch("/api/moderation/items/set", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ entityType: "post", entityId: it.entity_id, decision: "blocked" }),
                          }).finally(() => void queryClient.invalidateQueries({ queryKey: ["moderation", "items"] }));
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>

                {r?.signals?.length ? (
                  <>
                    <Separator className="my-5" />
                    <details className="group">
                      <summary className="cursor-pointer select-none text-sm font-extrabold text-zinc-900">
                        Why this was flagged
                        <span className="ml-2 text-xs font-semibold text-zinc-500">
                          (confidence {Math.round((r.confidence ?? 0) * 100)}%)
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2">
                        {r.reasons?.length ? (
                          <ul className="list-disc pl-5 text-sm text-zinc-700">
                            {r.reasons.slice(0, 6).map((rr) => (
                              <li key={rr}>{rr}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="text-xs font-semibold text-zinc-500">
                          Signals: <span className="font-semibold text-zinc-700">{r.signals.join(", ")}</span>
                        </div>
                    </div>
                    </details>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white px-6 py-10 text-center">
          <div className="text-lg font-extrabold text-zinc-900">{emptyTitle}</div>
          <div className="mt-2 text-sm font-semibold text-zinc-600">{emptyBody}</div>
        </div>
      )}

      <Separator className="my-2" />
    </div>
  );
}


