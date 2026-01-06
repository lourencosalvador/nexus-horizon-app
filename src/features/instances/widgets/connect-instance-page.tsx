"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import logo from "@/app/assets/image/logo.png";
import {
  getActiveInstanceId,
  getStoredInstances,
  setStoredInstances,
  setActiveInstanceId,
  type WorkspaceInstance,
} from "@/shared/stores/instanceStore";
import { getStoredUsage, setStoredUsage } from "@/shared/stores/usageStore";
import { setSkoolSession } from "@/shared/stores/skoolSessionStore";

const DEFAULT_SKOOL_BASE_URL = "https://www.skool.com";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatCompact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default function ConnectInstancePage() {
  const router = useRouter();
  const [instances, setInstances] = useState<WorkspaceInstance[]>(() => getStoredInstances());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveInstanceId());
  const [testMode, setTestMode] = useState<boolean>(() => getStoredInstances()[0]?.testMode ?? false);
  const [usage, setUsage] = useState<number>(() => getStoredUsage());
  const [flashVerify, setFlashVerify] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cookie, setCookie] = useState("");
  const [useAdvancedCookie, setUseAdvancedCookie] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyRef = useRef<HTMLDivElement | null>(null);
  const instancesRef = useRef<HTMLDivElement | null>(null);
  const cookieRef = useRef<HTMLTextAreaElement | null>(null);

  const handleLogout = () => {
    fetch("/api/auth/signout", { method: "POST" }).finally(() => {
      router.replace("/auth/signin");
    });
  };

  const usageMax = 5000;
  const usagePct = clamp((usage / usageMax) * 100, 0, 100);

  const hasInstance = instances.length > 0;

  const primary = useMemo(() => instances[0] ?? null, [instances]);

  const canGoDashboard = Boolean(activeId);

  const onVerify = async () => {
    const b = DEFAULT_SKOOL_BASE_URL;
    if (isVerifying) return;
    setIsVerifying(true);

    let looksLoggedIn: boolean | null = null;
    let encryptedCookie: string | null = null;
    try {
      if (useAdvancedCookie) {
        const c = cookie.trim();
        if (c.length < 10) {
          toast.error("Paste your Skool Cookie header first.");
          cookieRef.current?.focus();
          setIsVerifying(false);
          return;
        }
        const res = await fetch("/api/integrations/skool/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: b, cookie: c }),
        });
        const data = (await res.json()) as { ok?: boolean; looksLoggedIn?: boolean | null; error?: string };
        if (!res.ok || data.ok === false) {
          toast.error(data.error || "Could not verify session.");
          setIsVerifying(false);
          return;
        }
        looksLoggedIn = typeof data.looksLoggedIn === "boolean" ? data.looksLoggedIn : null;
        // We keep raw cookie only for advanced/dev mode.
      } else {
        const e = email.trim();
        const p = password;
        if (!e.includes("@") || p.length < 3) {
          toast.error("Enter a valid Skool email and password.");
          setIsVerifying(false);
          return;
        }
        const res = await fetch("/api/integrations/skool/session/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: b, email: e, password: p }),
        });
        const data = (await res.json()) as { ok?: boolean; encryptedCookie?: string; connector?: string; error?: string };
        if (!res.ok || data.ok === false || !data.encryptedCookie) {
          toast.error(`${data.error || "Could not create session."}${data.connector ? ` (connector: ${data.connector})` : ""}`);
          setIsVerifying(false);
          return;
        }
        encryptedCookie = data.encryptedCookie;
        // Optional: best-effort verify using encrypted cookie to detect obvious failures.
        const v = await fetch("/api/integrations/skool/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: b, encryptedCookie }),
        });
        const vd = (await v.json()) as { ok?: boolean; looksLoggedIn?: boolean | null };
        looksLoggedIn = typeof vd.looksLoggedIn === "boolean" ? vd.looksLoggedIn : null;
      }
    } catch {
      toast.error("Could not verify session (network error).");
      setIsVerifying(false);
      return;
    }

    const now = Date.now();
    // We’ll discover the actual community/group later via the connector.
    const url = "skool.com";
    const communityName = "Skool Community";
    const next: WorkspaceInstance = {
      id: `inst_${now}`,
      name: communityName,
      url,
      status: "running",
      createdAt: now,
      testMode,
    };

    setInstances((prev) => {
      const updated = [next, ...prev];
      setStoredInstances(updated);
      return updated;
    });
    setStoredUsage(420);
    setUsage(420);
    setSkoolSession(next.id, {
      baseUrl: b,
      apiBaseUrl: "https://api2.skool.com",
      encryptedCookie: encryptedCookie ?? undefined,
      cookie: useAdvancedCookie ? cookie.trim() : undefined,
      createdAt: now,
    });
    if (looksLoggedIn === false) {
      toast.warning("Session saved, but it doesn’t look logged in. We’ll validate internal endpoints next.");
    } else {
      toast.success("Instance connected. Select it to continue.");
    }
    setIsVerifying(false);
    window.setTimeout(() => {
      instancesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const selectInstance = (id: string) => {
    setActiveInstanceId(id);
    setActiveId(id);
    router.replace("/dashboard");
  };

  return (
    <div className="min-h-screen w-full relative">
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(125% 125% at 50% 10%, #fff 40%, #2563eb 100%)",
        }}
      />

      <header className="fixed inset-x-0 top-0 z-50 h-16 border-zinc-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center relative">
            <Image src={logo} alt="Logo" width={78} height={78} priority />
            <span className="absolute top-7 left-14 text-2xl font-semibold tracking-tight text-black">exus</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/contact-us"
              className="hidden sm:inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Contact us
            </Link>
            <Button variant="destructive" size="sm" className="cursor-pointer" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-10 min-h-screen px-6 pb-10 pt-40">
        <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-500">Setup &nbsp;›&nbsp; Instance</div>
            <div className="mt-2 text-2xl font-extrabold text-zinc-900 tracking-tight">Connect an instance</div>
            <div className="mt-1 text-sm text-zinc-600">Verify your Skool account to start moderating.</div>
          </div>
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={() => router.replace("/dashboard")}
            disabled={!canGoDashboard}
          >
            Go to Dashboard
            <ArrowUpRight size={14} />
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-4">
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-extrabold">Enterprise Plan Usage</CardTitle>
                    <CardDescription>Track consumption across your instances.</CardDescription>
                  </div>
                  <Badge variant="blue">
                    {formatCompact(usage)} / {formatCompact(usageMax)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                  <span>0</span>
                  <span>{usageMax}</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${usagePct}%` }} />
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900">Test mode</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        If enabled, your instances will also moderate posts and comments from admins and moderators.
                      </div>
                    </div>
                    <Switch
                      checked={testMode}
                      onCheckedChange={(v) => {
                        setTestMode(v);
                        setInstances((prev) => {
                          const updated = prev.map((i) => (i.id === primary?.id ? { ...i, testMode: v } : i));
                          setStoredInstances(updated);
                          return updated;
                        });
                        toast.success(v ? "Test mode enabled." : "Test mode disabled.");
                      }}
                      aria-label="Test mode"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              ref={verifyRef}
              className={flashVerify ? "ring-2 ring-blue-600/35 ring-offset-2 ring-offset-white" : undefined}
            >
              <CardHeader>
                <CardTitle className="text-base font-extrabold">Verify your Skool account</CardTitle>
                <CardDescription>
                  Connect your Skool community to create your first instance. We do not store your password.
              </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!useAdvancedCookie ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Skool Email</div>
                      <div className="mt-2">
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@myaccount.com" />
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Skool Password</div>
                      <div className="mt-2">
                        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="My Password" type="password" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900">Cookie header (Advanced)</div>
                      <span className="text-xs font-semibold text-zinc-500">DevTools → Network → Request Headers → Cookie</span>
                    </div>
                    <div className="mt-2">
                      <Textarea
                        ref={cookieRef}
                        value={cookie}
                        onChange={(e) => setCookie(e.target.value)}
                        placeholder="Paste the full Cookie header value here…"
                        className="min-h-[120px] font-mono text-[12px]"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="cursor-pointer text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                  onClick={() => setUseAdvancedCookie((v) => !v)}
                >
                  {useAdvancedCookie ? "Use email + password instead" : "Advanced: connect via Cookie header"}
                </button>

                <Button className="cursor-pointer w-full" onClick={() => void onVerify()} disabled={isVerifying}>
                  {isVerifying ? "Verifying…" : "Verify account & connect"}
                  <ArrowUpRight size={16} />
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <Card ref={instancesRef}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-extrabold">Instances</CardTitle>
                    <CardDescription>Select an instance to continue to the dashboard.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      setFlashVerify(true);
                      window.setTimeout(() => setFlashVerify(false), 900);

                      verifyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.setTimeout(() => cookieRef.current?.focus(), 200);
                    }}
                  >
                    Create instance
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!hasInstance ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-zinc-900">No instance connected</div>
                    <div className="mt-1 text-xs text-zinc-500">Verify your account to start moderating.</div>
                  </div>
                ) : (
                  instances.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => selectInstance(i.id)}
                      className="group w-full cursor-pointer rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-100 text-zinc-900 font-extrabold">
                            {i.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-extrabold text-zinc-900">{i.name}</div>
                            <div className="truncate text-xs font-semibold text-zinc-500">{i.url}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={i.status === "running" ? "blue" : "amber"}>{i.status === "running" ? "RUNNING" : "PAUSED"}</Badge>
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 group-hover:bg-zinc-50">
                            <ExternalLink size={16} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
              <div className="text-sm font-extrabold text-zinc-900">Tip</div>
              <div className="mt-1 text-xs text-zinc-500">
                After selecting an instance, you’ll land on the dashboard overview. You can come back here anytime to switch instances.
              </div>
              <Separator className="my-4" />
              <Button variant="outline" className="cursor-pointer w-full" onClick={() => toast.info("Demo-only for now.")}>
                Learn more
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}


