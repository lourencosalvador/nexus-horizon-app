import { NextResponse, type NextRequest } from "next/server";
import { chromium } from "playwright";
import { encryptString } from "../../_crypto";
import { Builder, By, until, type WebDriver } from "selenium-webdriver";

type CreateSessionBody = {
  baseUrl?: string;
  email: string;
  password: string;
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

async function runSeleniumLogin(baseUrl: string, email: string, password: string) {
  const hub = process.env.SELENIUM_HUB_URL || "http://selenium:4444/wd/hub";
  let driver: WebDriver | null = null;
  try {
    driver = await new Builder().forBrowser("chrome").usingServer(hub).build();
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
    await driver.wait(until.elementLocated(By.css(emailSel)), 25_000);
    const emailEl = await driver.findElement(By.css(emailSel));
    await emailEl.clear();
    await emailEl.sendKeys(email);

    await driver.wait(until.elementLocated(By.css(passSel)), 25_000);
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
      webCookies.map((c) => ({ name: c.name, value: c.value })),
      apiCookies.map((c) => ({ name: c.name, value: c.value }))
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
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email.includes("@") || password.length < 3) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 400 });
  }

  const baseUrl = normalizeBaseUrl(body.baseUrl);

  // IMPORTANT: We do not store the password. We only use it to establish a session and extract cookies.
  // This is a best-effort headless flow and may break if Skool changes their login UI.
  const useSelenium = String(process.env.USE_SELENIUM_GRID || "").toLowerCase() === "true";
  const connector = useSelenium ? "selenium" : "playwright";

  try {
    let cookieHeader = "";
    if (useSelenium) {
      const r = await runSeleniumLogin(baseUrl, email, password);
      cookieHeader = r.cookieHeader;
    } else {
      const browser = await chromium.launch({ headless: true });
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
        { ok: false, connector, error: "Login did not produce a valid session cookie." },
        { status: 401 }
      );
    }

    // Skool internal API expects an auth_token cookie (and often aws-waf-token).
    // If we don't see auth_token here, the automation likely didn't complete login (or was blocked by WAF).
    if (!hasCookie(cookieHeader, "auth_token")) {
      return NextResponse.json(
        {
          ok: false,
          connector,
          error:
            "Login did not yield an auth_token cookie. Skool may have blocked automation (WAF/captcha) or the login flow changed. Try Advanced cookie mode.",
        },
        { status: 401 }
      );
    }

    const encryptedCookie = encryptString(cookieHeader);
    return NextResponse.json({
      ok: true,
      baseUrl,
      connector,
      encryptedCookie,
      createdAt: Date.now(),
      note: "Password was not stored. Only an encrypted session token is returned.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, connector, error: e instanceof Error ? e.message : "Session creation failed." },
      { status: 500 }
    );
  }
}


