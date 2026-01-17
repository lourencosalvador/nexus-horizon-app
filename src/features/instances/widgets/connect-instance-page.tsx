"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
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
const CONNECT_TIMEOUT_MS = 40_000;
const RETRY_BASE_DELAY_MS = 1800;
const RETRY_MAX_DELAY_MS = 6500;

class TimeoutError extends Error {
  name = "TimeoutError";
  constructor(message: string) {
    super(message);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatCompact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}): Promise<{
  res: Response;
  data: T;
}> {
  const { timeoutMs, ...rest } = init;

  const controller = new AbortController();
  const existingSignal = rest.signal as AbortSignal | undefined;
  const onAbort = () => controller.abort();
  if (existingSignal) existingSignal.addEventListener("abort", onAbort, { once: true });

  const timeout = window.setTimeout(() => controller.abort(), timeoutMs ?? CONNECT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(input, { ...rest, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError("Request timed out.");
    throw e;
  } finally {
    window.clearTimeout(timeout);
    if (existingSignal) existingSignal.removeEventListener("abort", onAbort);
  }

  const data = (await res.json().catch(() => ({}))) as T;
  return { res, data };
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
  const [showAdvancedCookie, setShowAdvancedCookie] = useState(false);
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

    const startedAt = Date.now();
    const timeLeft = () => Math.max(2500, CONNECT_TIMEOUT_MS - (Date.now() - startedAt));

    let looksLoggedIn: boolean | null = null;
    let encryptedCookie: string | null = null;
    let detectedGroup: { id: string; name: string; displayName?: string } | null = null;
    try {
      const cookieValue = cookie.trim();
      const useCookie = cookieValue.length > 0;
      if (useCookie) {
        const c = cookieValue;
        if (c.length < 10) {
          toast.error("Paste your Skool Cookie header first.");
          cookieRef.current?.focus();
          setIsVerifying(false);
          return;
        }
        // Cookie UI is hidden for now; keep backend support as a fallback.
        // Encrypt cookie server-side so the rest of the app can call Skool internal endpoints.
        const { res: encRes, data: encData } = await fetchJson<{ ok?: boolean; encryptedCookie?: string; error?: string }>(
          "/api/integrations/skool/session/create",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseUrl: b, cookie: c }),
            timeoutMs: timeLeft(),
          }
        );
        if (!encRes.ok || encData.ok === false || !encData.encryptedCookie) {
          toast.error(encData.error || "Could not encrypt cookie.");
          setIsVerifying(false);
          return;
        }
        encryptedCookie = encData.encryptedCookie;

        const { res, data } = await fetchJson<{ ok?: boolean; looksLoggedIn?: boolean | null; error?: string }>(
          "/api/integrations/skool/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseUrl: b, encryptedCookie }),
            timeoutMs: timeLeft(),
          }
        );
        if (!res.ok || data.ok === false) {
          toast.error(data.error || "Could not verify session.");
          setIsVerifying(false);
          return;
        }
        looksLoggedIn = typeof data.looksLoggedIn === "boolean" ? data.looksLoggedIn : null;
      } else {
        const e = email.trim();
        const p = password;
        if (!e.includes("@") || p.length < 3) {
          toast.error("Enter a valid Skool email and password.");
          setIsVerifying(false);
          return;
        }
        let lastConnector: string | undefined;
        let attempt = 0;
        let coldStartToastShown = false;
        while (true) {
          attempt += 1;
          try {
            const { res: connectorRes, data: connectorData } = await fetchJson<{
              ok?: boolean;
              encryptedCookie?: string;
              connector?: string;
              error?: string;
            }>("/api/integrations/skool/session/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ baseUrl: b, email: e, password: p }),
              timeoutMs: timeLeft(),
            });

            lastConnector = connectorData.connector;

            if (connectorRes.ok && connectorData.ok !== false && connectorData.encryptedCookie) {
              encryptedCookie = connectorData.encryptedCookie;
              break;
            }

            const msg = connectorData.error || `Could not create Skool connector session (HTTP ${connectorRes.status}).`;
            const retryable =
              connectorRes.status === 503 ||
              connectorRes.status === 502 ||
              connectorRes.status === 504 ||
              /selenium.*(not\s*ready|unreachable|wake|hibernat|cold\s*start)/i.test(msg);

            if (!retryable || timeLeft() < 6000) {
              toast.error(`${msg}${lastConnector ? ` (connector: ${lastConnector})` : ""}`);
              setIsVerifying(false);
              return;
            }

            if (!coldStartToastShown) {
              coldStartToastShown = true;
              toast.info("Connector is waking up (Render cold start). Retrying…");
            }

            const delay = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS + attempt * 450);
            await sleep(Math.min(delay, timeLeft() - 2000));
          } catch (err) {
            const retryable = err instanceof TimeoutError;
            if (!retryable || timeLeft() < 6000) {
              if (err instanceof TimeoutError) {
                toast.error(
                  `Connection timed out after ~40s.${lastConnector ? ` (connector: ${lastConnector})` : ""} If the connector is sleeping, wait ~60s and try again.`
                );
              } else {
                toast.error("Could not verify session (network error).");
              }
              setIsVerifying(false);
              return;
            }

            if (!coldStartToastShown) {
              coldStartToastShown = true;
              toast.info("Connector is waking up (Render cold start). Retrying…");
            }

            const delay = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS + attempt * 450);
            await sleep(Math.min(delay, timeLeft() - 2000));
          }
        }
      }

      // Discover groups (best-effort) so we can auto-name the instance without asking for URLs.
      if (encryptedCookie) {
        try {
          const { res: gRes, data: gData } = await fetchJson<{
            ok?: boolean;
            groups?: Array<{ id: string; name: string; displayName?: string }>;
          }>("/api/integrations/skool/groups/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ encryptedCookie }),
            timeoutMs: timeLeft(),
          });
          const groups = Array.isArray(gData.groups) ? gData.groups : [];
          if (gRes.ok && gData.ok !== false && groups.length > 0) {
            detectedGroup = groups[0] ?? null;
          }
        } catch {
          // ignore
        }

        // Best-effort verify using encrypted cookie (non-blocking if unknown).
        try {
          const { data: vd } = await fetchJson<{ ok?: boolean; looksLoggedIn?: boolean | null }>(
            "/api/integrations/skool/verify",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ baseUrl: b, encryptedCookie }),
              timeoutMs: timeLeft(),
            }
          );
          looksLoggedIn = typeof vd.looksLoggedIn === "boolean" ? vd.looksLoggedIn : looksLoggedIn;
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        toast.error("Connection timed out after ~40s. If the connector is sleeping, wait ~60s and try again.");
      } else {
        toast.error("Could not verify session (network error).");
      }
      setIsVerifying(false);
      return;
    }

    const now = Date.now();
    const groupSlug = (detectedGroup?.name || "").trim();
    const url = groupSlug ? `https://www.skool.com/${groupSlug}` : "https://www.skool.com";
    const communityName = detectedGroup?.displayName ?? groupSlug ?? "Skool Community";
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
      cookie: undefined,
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

      <header className="fixed inset-x-0 top-0 z-50 h-16 border-zinc-200 bg-white/70 backdrop-blur supports-backdrop-filter:bg-white/60">
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
                <CardTitle className="text-base font-extrabold">Connect to Skool</CardTitle>
                <CardDescription>
                  Create an instance using email + password or a Cookie header. We never store your password—only an encrypted session cookie.
              </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900">Having trouble?</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      If Skool blocks automated login (WAF/captcha), use a Cookie header instead.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      setShowAdvancedCookie((v) => !v);
                      window.setTimeout(() => cookieRef.current?.focus(), 100);
                    }}
                  >
                    {showAdvancedCookie ? "Hide advanced" : "Use cookie header"}
                  </Button>
                </div>

                {showAdvancedCookie ? (
                  <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-900">Cookie header (Advanced)</div>
                      <div className="text-[11px] font-semibold text-zinc-500">We store only an encrypted session cookie.</div>
                    </div>
                    <Textarea
                      ref={cookieRef}
                      value={cookie}
                      onChange={(e) => setCookie(e.target.value)}
                      placeholder="Paste the full Cookie request header from your browser DevTools…"
                      className="min-h-[92px] font-mono text-xs"
                    />
                    <div className="text-[11px] text-zinc-500">
                      Tip: Open `www.skool.com` while logged in → DevTools → Network → any request → Headers → Request Headers → Copy <b>Cookie</b>.
                    </div>
                  </div>
                ) : null}

                <Button className="cursor-pointer w-full" onClick={() => void onVerify()} disabled={isVerifying}>
                  {isVerifying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      Verify account & connect
                  <ArrowUpRight size={16} />
                    </>
                  )}
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


