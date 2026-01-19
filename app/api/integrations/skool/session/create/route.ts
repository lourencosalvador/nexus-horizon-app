import { NextResponse, type NextRequest } from "next/server";
import { encryptString } from "../../_crypto";

export const runtime = "nodejs";

type CreateSessionBody = {
  baseUrl?: string;
  email?: string;
  password?: string;
  cookie?: string;
};

function normalizeBaseUrl(input: string | undefined) {
  const v = (input ?? "").trim();
  if (!v) return "https://www.skool.com";
  if (v.startsWith("http://") || v.startsWith("https://")) return v.replace(/\/+$/g, "");
  return `https://${v}`.replace(/\/+$/g, "");
}

function buildCookieHeader(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

const API2_WARMUP_PATH = "/self/chat-channels?offset=0&limit=1&last=true&unread-only=false";
const API2_BASE = "https://api2.skool.com";

function hasCookie(cookieHeader: string, name: string) {
  return new RegExp(`(^|;\\s*)${name}=`).test(cookieHeader);
}

function mergeCookies(a: Array<{ name: string; value: string }>, b: Array<{ name: string; value: string }>) {
  const map = new Map<string, string>();
  for (const c of a) map.set(c.name, c.value);
  for (const c of b) map.set(c.name, c.value);
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs ?? 2500);
  try {
    return await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function runSeleniumLogin(baseUrl: string, email: string, password: string) {
  const { Builder, By, until } = await import("selenium-webdriver");
  const chrome = (await import("selenium-webdriver/chrome")).default;

  // Prefer explicit remote URL (Vultr always-on selenium), fallback to existing hub URL.
  // Example: http://155.138.200.11:4444/wd/hub
  const hubRaw = process.env.SELENIUM_REMOTE_URL || process.env.SELENIUM_HUB_URL || "http://selenium:4444/wd/hub";
  function hubCandidates(raw: string): string[] {
    const v = String(raw || "").trim().replace(/\/+$/g, "");
    if (!v) return ["http://selenium:4444/wd/hub"];
    if (v.endsWith("/wd/hub")) return [v, v.replace(/\/wd\/hub$/g, "")].filter(Boolean);
    return [v, `${v}/wd/hub`];
  }

  let driver: import("selenium-webdriver").WebDriver | null = null;
  let lastErr: unknown = null;
  try {
    const options = new chrome.Options()
      .addArguments("--no-sandbox")
      .addArguments("--disable-dev-shm-usage")
      .addArguments("--disable-gpu")
      .addArguments("--window-size=1280,720")
      // Required per spec
      .addArguments("--headless=new")
      // Reduce automation fingerprints (best-effort; WAF may still trigger).
      .addArguments("--disable-blink-features=AutomationControlled")
      .addArguments("--lang=en-US")
      .addArguments("--disable-infobars");

    // We intentionally always quit the remote driver in finally.

    // Preflight: detect which hub URL is alive by probing /status (Selenium 4) on the base.
    // NOTE: Some deployments expose /wd/hub, some expose root. Render often returns 404 on "/" which is OK.
    const candidates = hubCandidates(hubRaw);
    const scored: Array<{ hub: string; ok: boolean; status?: number }> = [];

    for (const hub of candidates) {
      const base = hub.replace(/\/wd\/hub$/g, "");
      try {
        const r = await fetchWithTimeout(`${base}/status`, { method: "GET", timeoutMs: 2500 });
        scored.push({ hub, ok: r.ok, status: r.status });
      } catch {
        scored.push({ hub, ok: false });
      }
    }

    if (!scored.some((s) => s.ok)) {
      // Render free services can hibernate. Fail fast so the UI can show a friendly retry message.
      throw new HttpError(
        503,
        "Selenium hub is not ready yet (cold start/hibernation). Please wait ~60s and try again."
      );
    }

    // Prefer candidates that respond 200 on /status; otherwise just try in order.
    const ordered = [...candidates].sort((a, b) => {
      const sa = scored.find((x) => x.hub === a);
      const sb = scored.find((x) => x.hub === b);
      return Number(sb?.ok) - Number(sa?.ok);
    });

    // Some Selenium deployments expect /wd/hub, others expect root (/).
    // Try both automatically so Render/standalone images work out-of-the-box.
    for (const hub of ordered) {
      try {
        driver = await new Builder().forBrowser("chrome").setChromeOptions(options).usingServer(hub).build();
        // Keep the whole flow bounded; we want the UI to fail fast instead of waiting minutes.
        await driver.manage().setTimeouts({ pageLoad: 20_000, script: 20_000, implicit: 0 }).catch(() => undefined);
        break;
      } catch (e) {
        lastErr = e;
        driver = null;
      }
    }
    if (!driver) throw lastErr ?? new Error("Could not connect to Selenium hub.");
    await driver.get(baseUrl);

    // Navigate to a likely login page if needed.
    const current = await driver.getCurrentUrl();
    if (!current.includes("login") && !current.includes("signin")) {
      for (const u of [`${baseUrl}/login`, `${baseUrl}/signin`]) {
        try {
          await driver.get(u);
          break;
        } catch {
          // ignore
        }
      }
    }

    // Heuristic selectors for login.
    const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="email"]';
    const passSel = 'input[type="password"], input[name="password"], input[autocomplete="current-password"]';
    await driver.wait(until.elementLocated(By.css(emailSel)), 15_000);
    const emailEl = await driver.findElement(By.css(emailSel));
    await emailEl.clear();
    await emailEl.sendKeys(email);

    await driver.wait(until.elementLocated(By.css(passSel)), 15_000);
    const passEl = await driver.findElement(By.css(passSel));
    await passEl.clear();
    await passEl.sendKeys(password);

    // Submit via form submit or Enter.
    try {
      const submitSel =
        'button[type="submit"], input[type="submit"], button:contains("Sign in"), button:contains("Log in"), button:contains("Continue")';
      // NOTE: CSS :contains isn't standard; we rely on Enter fallback below.
      void submitSel;
    } catch {
      // ignore
    }
    await passEl.sendKeys("\n");

    // Wait a bit for redirects/cookies.
    await driver.sleep(1500);

    const webCookies = await driver.manage().getCookies();

    // Warm up api2 host to pick up WAF/session-related cookies.
    try {
      await driver.get(`${API2_BASE}${API2_WARMUP_PATH}`);
      await driver.sleep(800);
    } catch {
      // ignore
    }
    const apiCookies = await driver.manage().getCookies();

    const merged = mergeCookies(
      webCookies.map((c: { name: string; value: string }) => ({ name: c.name, value: c.value })),
      apiCookies.map((c: { name: string; value: string }) => ({ name: c.name, value: c.value }))
    );
    const cookieHeader = buildCookieHeader(merged);
    return { cookieHeader };
  } finally {
    if (driver) {
      await driver.quit().catch(() => undefined);
    }
  }
}

export async function POST(req: NextRequest) {
  let body: CreateSessionBody | null = null;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json({ ok: false, success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const baseUrl = normalizeBaseUrl(body.baseUrl);

  const rawCookie = (body.cookie ?? "").trim();
  if (rawCookie) {
    if (rawCookie.length < 20) {
      return NextResponse.json(
        { ok: false, success: false, connector: "cookie", error: "Cookie header is too short." },
        { status: 400 }
      );
    }
    if (!hasCookie(rawCookie, "auth_token")) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          connector: "cookie",
          error:
            "Cookie header is missing auth_token. Make sure you're logged in on Skool, then copy the Cookie request header from DevTools.",
        },
        { status: 401 }
      );
    }
    const encryptedCookie = encryptString(rawCookie);
    return NextResponse.json({
      ok: true,
      success: true,
      baseUrl,
      connector: "cookie",
      encryptedCookie,
      createdAt: Date.now(),
      note: "Cookie was encrypted server-side. No password was used or stored.",
    });
  }

  const email = (body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email.includes("@") || password.length < 3) {
    return NextResponse.json({ ok: false, success: false, error: "Invalid email or password." }, { status: 400 });
  }

  // IMPORTANT: In serverless environments, browser automation is often blocked or heavyweight.
  // Keep email/password as an optional connector behind an explicit flag.
  const allowPasswordLogin = String(process.env.ENABLE_SKOOL_PASSWORD_LOGIN || "").toLowerCase() === "true";
  if (!allowPasswordLogin) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        connector: "password",
        error:
          "Password login is disabled in this environment. Use Cookie mode, or set ENABLE_SKOOL_PASSWORD_LOGIN=true (and USE_SELENIUM_GRID=true) to enable password login.",
      },
      { status: 400 }
    );
  }

  // IMPORTANT: We do not store the password. We only use it to establish a session and extract cookies.
  // This is a best-effort headless flow and may break if Skool changes their login UI.
  // Prefer Selenium when an URL is configured (remote Vultr or internal hub).
  const hasRemoteUrl = Boolean(String(process.env.SELENIUM_REMOTE_URL || "").trim());
  const hasHubUrl = Boolean(String(process.env.SELENIUM_HUB_URL || "").trim());
  const useSelenium = String(process.env.USE_SELENIUM_GRID || "").toLowerCase() === "true" || hasRemoteUrl || hasHubUrl;
  const connector = useSelenium ? "selenium" : "playwright";

  try {
    let cookieHeader = "";
    if (useSelenium) {
      // Bound end-to-end time for better UX (frontend has 40s max).
      const r = await Promise.race([
        runSeleniumLogin(baseUrl, email, password),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new HttpError(504, "Selenium login timed out. Please try again.")), 35_000)
        ),
      ]);
      cookieHeader = r.cookieHeader;
    } else {
      // Playwright is optional. If it's not installed (or browsers aren't available), we return a helpful error.
      let chromium: { launch: (opts: { headless: boolean }) => Promise<unknown> };
      try {
        const pw = (await import("playwright")) as unknown as {
          chromium: { launch: (opts: { headless: boolean }) => Promise<unknown> };
        };
        chromium = pw.chromium;
      } catch {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            connector: "playwright",
            error:
              "Playwright is not available in this deployment. Use Cookie mode, or enable Selenium Grid (USE_SELENIUM_GRID=true + SELENIUM_HUB_URL).",
          },
          { status: 400 }
        );
      }

      type PWCookie = { name: string; value: string };
      type PWElementHandle = { click: () => Promise<void> };
      type PWKeyboard = { press: (key: string) => Promise<void> };
      type PWPage = {
        goto: (url: string, opts: { waitUntil: "domcontentloaded" | "networkidle"; timeout: number }) => Promise<void>;
        url: () => string;
        waitForSelector: (selector: string, opts: { timeout: number }) => Promise<void>;
        fill: (selector: string, value: string) => Promise<void>;
        $: (selector: string) => Promise<PWElementHandle | null>;
        waitForLoadState: (state: "networkidle", opts: { timeout: number }) => Promise<void>;
        focus: (selector: string) => Promise<void>;
        keyboard: PWKeyboard;
        waitForTimeout: (ms: number) => Promise<void>;
      };
      type PWContext = {
        newPage: () => Promise<PWPage>;
        cookies: () => Promise<PWCookie[]>;
        close: () => Promise<void>;
      };
      type PWBrowser = {
        newContext: (opts: { userAgent: string }) => Promise<PWContext>;
        close: () => Promise<void>;
      };

      const browser = (await chromium.launch({ headless: true })) as unknown as PWBrowser;
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Nexus; Skool Connector)",
      });
      const page = await context.newPage();
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

        const candidates = [`${baseUrl}/login`, `${baseUrl}/signin`];
        for (const url of candidates) {
          if (page.url().includes("login") || page.url().includes("signin")) break;
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
          } catch {
            // ignore
          }
        }

        const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="email"]';
        const passSel = 'input[type="password"], input[name="password"], input[autocomplete="current-password"]';
        await page.waitForSelector(emailSel, { timeout: 25_000 });
        await page.fill(emailSel, email);
        await page.waitForSelector(passSel, { timeout: 25_000 });
        await page.fill(passSel, password);

        const submitSel =
          'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")';
        const submit = await page.$(submitSel);
        if (submit) {
          await Promise.all([
            page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined),
            submit.click().catch(() => undefined),
          ]);
        } else {
          await page.focus(passSel);
          await Promise.all([
            page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined),
            page.keyboard.press("Enter").catch(() => undefined),
          ]);
        }

        await page.waitForTimeout(1200);
        // Warm up api2 host to pick up WAF/session-related cookies.
        try {
          await page.goto(`${API2_BASE}${API2_WARMUP_PATH}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForTimeout(600);
        } catch {
          // ignore
        }

        const cookies = await context.cookies();
        cookieHeader = buildCookieHeader(cookies);
      } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    }

    if (!cookieHeader || cookieHeader.length < 20) {
      return NextResponse.json(
        { ok: false, success: false, connector, error: "Login did not produce a valid session cookie." },
        { status: 401 }
      );
    }

    // Skool internal API expects an auth_token cookie (and often aws-waf-token).
    // If we don't see auth_token here, the automation likely didn't complete login (or was blocked by WAF).
    if (!hasCookie(cookieHeader, "auth_token")) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          connector,
          error:
            "Login did not yield an auth_token cookie. Skool may have blocked automation (WAF/captcha) or the login flow changed. Try the quick verification step.",
        },
        { status: 401 }
      );
    }

    const encryptedCookie = encryptString(cookieHeader);
    return NextResponse.json({
      ok: true,
      success: true,
      baseUrl,
      connector,
      encryptedCookie,
      createdAt: Date.now(),
      note: "Password was not stored. Only an encrypted session token is returned.",
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, success: false, connector, error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { ok: false, success: false, connector, error: e instanceof Error ? e.message : "Session creation failed." },
      { status: 500 }
    );
  }
}


