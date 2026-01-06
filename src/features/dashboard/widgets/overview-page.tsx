"use client";

import { useEffect, useMemo, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import { ArrowUpRight, ChevronRight, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis } from "recharts";
import { toast } from "sonner";

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

type ModerationItem = {
  id: string;
  author: string;
  where: string;
  age: string;
  title: string;
  excerpt: string;
  tag: string;
};

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

function buildFlaggedChart(seed: number) {
  const months = ["Oct", "Nov", "Dec"];
  return months.map((m, i) => ({
    month: m,
    comments: 6 + ((seed + i * 17) % 12),
    posts: 4 + ((seed + i * 23) % 10),
  }));
}

function buildAnalyzedChart(seed: number) {
  const months = ["Oct", "Nov", "Dec"];
  return months.map((m, i) => ({
    month: m,
    comments: 220 + ((seed + i * 19) % 140),
    posts: 110 + ((seed + i * 29) % 90),
    total: 330 + ((seed + i * 31) % 210),
  }));
}

export default function DashboardHome() {
  const [userEmail, setUserEmail] = useState<string>("nexus");
  const [userName, setUserName] = useState<string | null>(null);
  const [instances, setInstances] = useState<WorkspaceInstance[]>(() => getStoredInstances());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveInstanceId());
  const [usage] = useState<number>(() => getStoredUsage());

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

  const board = useMemo(() => buildDemoBoard(seed), [seed]);
  const flagged = useMemo(() => buildFlaggedChart(seed), [seed]);
  const analyzed = useMemo(() => buildAnalyzedChart(seed), [seed]);

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
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => toast.success("Cleared (demo).")}>
                    Clear All
                  </Button>
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => toast.warning("Board view is coming soon.")}>
                    Board View
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {board.map((p, idx) => {
                const avSeed = seed + idx * 77;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 + idx * 0.04, duration: 0.22, ease }}
                    className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition-colors hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Avatar name={p.author} src={avatarUrlFromSeed(avSeed, p.author)} online={false} size="md" />
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-zinc-900">{p.author}</div>
                          <div className="mt-0.5 text-xs font-semibold text-zinc-500">
                            {p.age} in {p.where}
                          </div>
                        </div>
                      </div>
                      <ShieldAlert size={18} className="text-amber-600" />
                    </div>

                    <div className="mt-4 text-xl font-extrabold text-zinc-900 leading-snug">{p.title}</div>
                    <div className="mt-3 text-sm text-zinc-600 leading-relaxed">{p.excerpt}</div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-extrabold text-white">
                        {p.tag}
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => toast.success("Approved (demo).")}>
                          Approve
                        </Button>
                        <Button variant="destructive" size="sm" className="cursor-pointer" onClick={() => toast.warning("Removed (demo).")}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
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

