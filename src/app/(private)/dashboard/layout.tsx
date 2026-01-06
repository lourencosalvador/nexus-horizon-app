"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
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
              >
                <Bell size={18} className="group-hover:scale-110 transition-transform" />
                <div className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500 border-2 border-[#111111]" />
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
              >
                <Bell size={18} className="group-hover:scale-110 transition-transform" />
                <div className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500 border-2 border-[#111111]" />
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
                          {sidebarCollapsed && item.badge && !isActive && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-white" />
                          )}
                        </div>
                        {!sidebarCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                      </div>
                      {!sidebarCollapsed && item.badge && !isActive && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
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
