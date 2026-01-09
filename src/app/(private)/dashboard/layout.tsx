"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Inbox,
  LogOut,
  PlugZap,
  ScrollText,
  ShieldCheck,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserRoundSearch,
  Workflow,
  MessageSquareText,
} from "lucide-react";

type NavItem = {
  name: string;
  href: string;
  badge?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};
import { hasInstances } from "@/shared/stores/instanceStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { useInboxUnread } from "@/shared/stores/inboxUnreadStore";
import { setInboxUnread } from "@/shared/stores/inboxUnreadStore";
import { useQuery } from "@tanstack/react-query";
import { getActiveInstanceId } from "@/shared/stores/instanceStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";
import { skoolDisplayName, skoolListChannels, type SkoolChatChannel } from "@/features/conversations/lib/skool-chat";
import { skoolListNotifications, parseSkoolNotificationData } from "@/features/notifications/lib/skool-notifications";
import { setNotificationsLastSeen, useNotificationsLastSeen } from "@/shared/stores/notificationsSeenStore";

type AuthUser = {
  email?: string;
  user_metadata?: { name?: string };
};

function displayName(user: AuthUser | null) {
  return user?.user_metadata?.name || user?.email || "User";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const inboxUnread = useInboxUnread();
  const notificationsLastSeen = useNotificationsLastSeen();
  const activeInstanceId = getActiveInstanceId();
  const skoolSession = activeInstanceId ? getSkoolSession(activeInstanceId) : null;
  const skoolConnector = skoolSession?.encryptedCookie
    ? { encryptedCookie: skoolSession.encryptedCookie, apiBaseUrl: skoolSession.apiBaseUrl }
    : null;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toastStack, setToastStack] = useState<
    Array<{ id: string; kind: "message" | "notification"; title: string; body: string; imageUrl?: string; ts: number }>
  >([]);
  const didInitNotificationsRef = useRef(false);
  const didInitChannelsRef = useRef(false);
  const prevNotifIdsRef = useRef<Set<string>>(new Set());
  const prevUnreadByChannelRef = useRef<Record<string, number>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("nexus_sidebar_collapsed_v1") === "1";
  });

  const menuGroups: NavGroup[] = [
    {
      title: "Dashboard",
      items: [
        { name: "Overview", icon: Activity, href: "/dashboard" },
        { name: "Activity Feed", icon: Sparkles, href: "/dashboard/activity" },
        { name: "Alerts", icon: AlertTriangle, href: "/dashboard/alerts", badge: true },
      ],
    },
    {
      title: "Conversations",
      items: [
        { name: "Inbox", icon: Inbox, href: "/dashboard/conversations/inbox", badge: true },
        { name: "Automation Trace", icon: ScrollText, href: "/dashboard/conversations/trace" },
      ],
    },
    {
      title: "Automations",
      items: [
        { name: "Flows", icon: Workflow, href: "/dashboard/automations/flows" },
        { name: "Rules", icon: SlidersHorizontal, href: "/dashboard/automations/rules" },
        { name: "Simulator", icon: GitBranch, href: "/dashboard/automations/simulator" },
      ],
    },
    {
      title: "Audit & Logs",
      items: [
        { name: "Decisions", icon: ScrollText, href: "/dashboard/audit/decisions" },
        { name: "Messages", icon: MessageSquareText, href: "/dashboard/audit/messages" },
        { name: "State Changes", icon: Activity, href: "/dashboard/audit/state-changes" },
      ],
    },
    {
      title: "Moderation",
      items: [{ name: "Posts", icon: ShieldCheck, href: "/dashboard/moderation/posts" }],
    },
    {
      title: "Integrations",
      items: [{ name: "Skool", icon: PlugZap, href: "/dashboard/integrations/skool" }],
    },
    {
      title: "Settings",
      items: [
        { name: "Team & Roles", icon: UserRoundSearch, href: "/dashboard/settings/team" },
        { name: "Permissions", icon: SlidersHorizontal, href: "/dashboard/settings/permissions" },
        { name: "Notifications", icon: Bell, href: "/dashboard/settings/notifications" },
        { name: "Workspace", icon: Settings, href: "/dashboard/settings" },
      ],
    },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user: AuthUser | null }) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  const skoolChannelsQuery = useQuery({
    queryKey: ["skool", "sidebar-channels", activeInstanceId, skoolConnector?.encryptedCookie],
    enabled: Boolean(skoolConnector),
    refetchInterval: skoolConnector ? 15_000 : false,
    queryFn: async () => {
      if (!skoolConnector) return [] as SkoolChatChannel[];
      return await skoolListChannels(skoolConnector);
    },
  });

  const skoolNotificationsQuery = useQuery({
    queryKey: ["skool", "notifications", activeInstanceId, skoolConnector?.encryptedCookie],
    enabled: Boolean(skoolConnector),
    refetchInterval: skoolConnector ? 15_000 : false,
    queryFn: async () => {
      if (!skoolConnector) return { messages: [] as any[] };
      return await skoolListNotifications(skoolConnector, { limit: 30, type: "all" });
    },
  });

  const parsedNotifications = (() => {
    const msgs = (skoolNotificationsQuery.data as any)?.messages as Array<any> | undefined;
    const list = Array.isArray(msgs) ? msgs : [];
    return list
      .map((m) => {
        const createdAt = m?.created_at ? Date.parse(String(m.created_at)) : 0;
        const data = parseSkoolNotificationData(m?.metadata?.data);
        return {
          id: String(m?.id ?? ""),
          createdAt: Number.isFinite(createdAt) ? createdAt : 0,
          unread: Boolean(m?.unread) || Boolean(m?.metadata?.unread),
          type: Number(m?.metadata?.type ?? 0) || 0,
          data,
        };
      })
      .filter((x) => x.id)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  })();

  const notificationsUnread = parsedNotifications.some((n) => (n.createdAt || 0) > notificationsLastSeen);

  useEffect(() => {
    if (!notificationsOpen) return;
    setNotificationsLastSeen(Date.now());
  }, [notificationsOpen]);

  const pushToast = (t: { id: string; kind: "message" | "notification"; title: string; body: string; imageUrl?: string; ts: number }) => {
    setToastStack((prev) => [t, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setToastStack((prev) => prev.filter((x) => x.id !== t.id));
    }, 6000);
  };

  useEffect(() => {
    if (!skoolConnector) return;
    if (skoolNotificationsQuery.isLoading) return;
    if (!didInitNotificationsRef.current) {
      didInitNotificationsRef.current = true;
      prevNotifIdsRef.current = new Set(parsedNotifications.map((n) => n.id));
      return;
    }
    for (const n of parsedNotifications) {
      if (prevNotifIdsRef.current.has(n.id)) continue;
      prevNotifIdsRef.current.add(n.id);
      pushToast({
        id: `notif_${n.id}`,
        kind: "notification",
        title: "Notification",
        body: n.data?.text ?? "New activity",
        imageUrl: n.data?.image_url,
        ts: n.createdAt || Date.now(),
      });
      break;
    }
  }, [skoolConnector?.encryptedCookie, skoolNotificationsQuery.isLoading, parsedNotifications]);

  useEffect(() => {
    if (!skoolConnector) return;
    if (skoolChannelsQuery.isLoading) return;
    const channels = (skoolChannelsQuery.data ?? []) as SkoolChatChannel[];
    if (!didInitChannelsRef.current) {
      didInitChannelsRef.current = true;
      const snapshot: Record<string, number> = {};
      for (const c of channels) snapshot[c.id] = Number(c.metadata?.num_unread ?? 0) || 0;
      prevUnreadByChannelRef.current = snapshot;
      return;
    }
    const prev = prevUnreadByChannelRef.current;
    const next: Record<string, number> = {};
    for (const c of channels) {
      const unread = Number(c.metadata?.num_unread ?? 0) || 0;
      next[c.id] = unread;
      const before = prev[c.id] ?? 0;
      if (unread > before) {
        pushToast({
          id: `msg_${c.id}_${Date.now()}`,
          kind: "message",
          title: skoolDisplayName(c),
          body: c.last_message?.metadata?.content?.trim() || "New message",
          imageUrl: c.user?.metadata?.picture_profile,
          ts: Date.now(),
        });
        break;
      }
    }
    prevUnreadByChannelRef.current = next;
  }, [skoolConnector?.encryptedCookie, skoolChannelsQuery.isLoading, skoolChannelsQuery.data]);

  useEffect(() => {
    // Keep Inbox dot updated even when user never visits the Inbox page.
    if (skoolConnector) {
      const channels = (skoolChannelsQuery.data ?? []) as SkoolChatChannel[];
      const total = channels.reduce((acc, c) => acc + (Number(c.metadata?.num_unread ?? 0) || 0), 0);
      setInboxUnread(total);
      return;
    }

    // Demo fallback: poll localStorage unread counts (best-effort).
    const readDemoUnread = () => {
      try {
        const raw = window.localStorage.getItem("nexus_demo_inbox_v1");
        if (!raw) return 0;
        const data = JSON.parse(raw) as { conversations?: Array<{ unread?: number }> };
        const list = Array.isArray(data?.conversations) ? data.conversations : [];
        return list.reduce((acc, c) => acc + (Number(c.unread ?? 0) || 0), 0);
      } catch {
        return 0;
      }
    };

    const sync = () => setInboxUnread(readDemoUnread());
    sync();
    const t = window.setInterval(sync, 5000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexus_demo_inbox_v1") sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("storage", onStorage);
    };
  }, [activeInstanceId, skoolConnector?.encryptedCookie, skoolChannelsQuery.data]);

  useEffect(() => {
    if (loading) return;
    if (!hasInstances()) {
      router.replace("/connect-instance");
    }
  }, [loading, pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("nexus_sidebar_collapsed_v1", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    fetch("/api/auth/signout", { method: "POST" }).finally(() => {
      router.push("/auth/signin");
    });
  };

  const handleNavigate = (href: string) => {
    if (!href || href === pathname) return;
    startTransition(() => {
      router.push(href);
    });
  };

  if (loading) return null;
  if (!hasInstances()) return null;

  const pictureSrc = undefined;

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans text-zinc-900">
      <aside
        className={`flex flex-col bg-[#111111] text-zinc-400 border-r border-zinc-800/50 shadow-2xl transition-all duration-300 ease-out ${
          sidebarCollapsed ? "w-20" : "w-72"
        }`}
      >
        <div className={`${sidebarCollapsed ? "px-4 py-8" : "px-6 py-10"}`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-zinc-800 ring-2 ring-zinc-900 shadow-xl">
                {pictureSrc ? (
                  <Image src={pictureSrc} alt="Profile" fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white font-bold bg-gradient-to-br from-blue-500 to-blue-700">
                    {displayName(user).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="rounded-xl bg-zinc-800/50 p-2.5 text-white hover:bg-zinc-800 transition-all border border-zinc-700/30"
                aria-label="Expand sidebar"
                title="Expand"
              >
                <ChevronRight size={18} />
              </button>

              <button
                className="relative rounded-xl bg-zinc-800/50 p-2.5 text-white hover:bg-zinc-800 transition-all border border-zinc-700/30 group"
                aria-label="Notifications"
                title="Notifications"
                type="button"
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell size={18} className="group-hover:scale-110 transition-transform" />
                {notificationsUnread && (
                  <div className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-orange-500 border-2 border-[#111111]" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-zinc-800 ring-2 ring-zinc-900 shadow-xl">
                {pictureSrc ? (
                  <Image src={pictureSrc} alt="Profile" fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white font-bold bg-gradient-to-br from-blue-500 to-blue-700">
                    {displayName(user).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="truncate text-sm font-bold text-white tracking-tight">{displayName(user)}</span>
                <span className="truncate text-[11px] font-medium text-zinc-500">
                  {user?.email ? user.email : "Community Member"}
                </span>
              </div>

              <button
                className="relative rounded-xl bg-zinc-800/50 p-2.5 text-white hover:bg-zinc-800 transition-all border border-zinc-700/30 group"
                aria-label="Notifications"
                type="button"
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell size={18} className="group-hover:scale-110 transition-transform" />
                {notificationsUnread && (
                  <div className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-orange-500 border-2 border-[#111111]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="rounded-xl bg-zinc-800/50 p-2.5 text-white hover:bg-zinc-800 transition-all border border-zinc-700/30"
                aria-label="Collapse sidebar"
                title="Collapse"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
          )}
        </div>

        <div className={`${sidebarCollapsed ? "px-4" : "px-6"} mb-6`} />

        <nav
          className={`flex-1 overflow-y-auto overflow-x-visible custom-scrollbar ${sidebarCollapsed ? "px-2" : "px-4"}`}
        >
          <TooltipProvider delayDuration={80}>
          {menuGroups.map((group, idx) => (
            <div key={idx} className={idx > 0 ? "mt-8" : ""}>
              {!sidebarCollapsed && (
                <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{group.title}</p>
              )}
              <div className="mt-4 space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const showInboxDot = item.href === "/dashboard/conversations/inbox" && inboxUnread > 0 && !isActive;
                  const showDot = (item.badge && !isActive) || showInboxDot;
                  const shouldRenderDot = item.href === "/dashboard/conversations/inbox" ? showInboxDot : item.badge && !isActive;
                  const button = (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleNavigate(item.href)}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`group relative flex w-full cursor-pointer items-center rounded-xl border border-transparent px-3 py-3 text-left transition-all ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : "hover:border-blue-600 hover:bg-blue-600/10 hover:text-white"
                      } ${sidebarCollapsed ? "justify-center" : "justify-between"}`}
                    >
                      <div className={`flex items-center ${sidebarCollapsed ? "gap-0" : "gap-3"}`}>
                        <div className="relative">
                          <item.icon size={20} className={isActive ? "text-white" : "text-zinc-500 group-hover:text-white"} />
                          {sidebarCollapsed && shouldRenderDot && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-white" />
                          )}
                        </div>
                        {!sidebarCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                      </div>
                      {!sidebarCollapsed && shouldRenderDot && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  );

                  if (!sidebarCollapsed) return button;

                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
          </TooltipProvider>
        </nav>

        <div className="p-4 border-t border-zinc-800/50">
          <button
            onClick={handleLogout}
            className={`flex w-full items-center rounded-xl px-3 py-3 text-zinc-500 transition-all hover:bg-red-500/10 hover:text-red-500 group ${
              sidebarCollapsed ? "justify-center" : "gap-3"
            }`}
          >
            <LogOut size={20} className="text-zinc-500 group-hover:text-red-500" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto bg-[#F2F4F7]">
        <div className="p-8">
          {children}
        </div>

        <div className="fixed bottom-6 right-6 z-[60] w-[380px] max-w-[calc(100vw-48px)] space-y-3 pointer-events-none">
          <AnimatePresence>
            {toastStack.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, x: 12 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: 12, x: 12 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="pointer-events-auto"
              >
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-left shadow-2xl hover:bg-zinc-50"
                  onClick={() => {
                    if (t.kind === "notification") setNotificationsOpen(true);
                    if (t.kind === "message") router.push("/dashboard/conversations/inbox");
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-zinc-200">
                          {t.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-extrabold text-zinc-900">{t.kind === "message" ? "M" : "N"}</span>
                          )}
                        </div>
                        <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-600">{t.kind === "message" ? "New message" : "Notification"}</div>
                        <div className="mt-1 truncate text-sm font-extrabold text-zinc-900">{t.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-700">{t.body}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-bold text-zinc-500">
                      {new Date(t.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {notificationsOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close notifications"
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setNotificationsOpen(false)}
              />
              <motion.aside
                className="fixed right-6 top-6 z-50 w-[520px] max-w-[calc(100vw-48px)] rounded-3xl border border-zinc-200 bg-white shadow-2xl"
                initial={{ opacity: 0, x: 24, y: 8 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: 24, y: 8 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
              >
                <div className="flex items-center justify-between gap-3 px-6 py-5">
                  <div>
                    <div className="text-xl font-extrabold text-zinc-900">Notifications</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-500">Latest updates from Skool and Nexus.</div>
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    aria-label="Close"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="px-6 pb-5">
                  <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-1">
                    {["All", "Reminders", "Device Status", "New Device"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={t === "All"
                          ? "cursor-pointer rounded-full bg-black px-4 py-2 text-xs font-bold text-white"
                          : "cursor-pointer rounded-full px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50"}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-[72vh] overflow-auto px-4 pb-6">
                  {skoolNotificationsQuery.isLoading ? (
                    <div className="px-4 pb-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                        <div className="h-4 w-40 rounded bg-zinc-100 animate-pulse" />
                        <div className="mt-3 h-4 w-full rounded bg-zinc-100 animate-pulse" />
                      </div>
                    </div>
                  ) : parsedNotifications.length === 0 ? (
                    <div className="px-4 pb-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                        <div className="text-sm font-semibold text-zinc-900">No notifications</div>
                        <div className="mt-1 text-xs text-zinc-500">You’re all caught up.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 px-4 pb-4">
                      {parsedNotifications.map((n) => {
                        const title = n.data?.action ? n.data.action.replace(/-/g, " ") : "Skool";
                        const text = n.data?.text ?? "New activity";
                        const time = n.createdAt ? new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
                        const isNew = (n.createdAt || 0) > notificationsLastSeen;
                        const imageUrl = n.data?.image_url;
                        return (
                          <div key={n.id} className="rounded-3xl bg-zinc-100/70 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="relative">
                                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-zinc-200">
                                    {imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="text-xs font-extrabold text-zinc-900">N</span>
                                    )}
                                  </div>
                                  {isNew && <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-zinc-100/70" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-zinc-700">{title}</div>
                                  <div className="mt-1 truncate text-sm font-extrabold text-zinc-900">{text}</div>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs font-bold text-zinc-500">{time}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {isNavigating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-sm cursor-wait">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white/80 px-8 py-6 shadow-xl">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-blue-600" />
              <p className="text-sm font-medium text-zinc-600">Loading…</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
