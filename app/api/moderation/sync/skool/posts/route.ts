import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decryptString } from "../../../../integrations/skool/_crypto";
import { analyzePost } from "@/server/moderation/pipeline";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

const BodySchema = z.object({
  encryptedCookie: z.string().min(10),
  group: z.string().min(2), // slug like "automation-masters"
  // Default to "newest" to avoid edge-cases where "newest-cm" yields a biased subset (e.g. announcements/admin-heavy).
  sort: z.enum(["newest-cm", "activity", "newest"]).optional().default("newest"),
  // This endpoint can be used to backfill. Keep reasonable caps to avoid huge runs.
  limit: z.number().int().min(1).max(200).optional().default(50),
  // Safety valve: hard cap for how many pages we try on list endpoints.
  maxPages: z.number().int().min(1).max(30).optional().default(10),
});

const SKOOL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractBuildId(html: string): string | null {
  // Most reliable: parse the build manifest script src
  // Example: /_next/static/<buildId>/_buildManifest.js
  const m0 = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/i);
  if (m0?.[1]) return m0[1];
  const m1 = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (m1?.[1]) return m1[1];
  const m2 = html.match(/buildId"\s*:\s*"([^"]+)"/);
  if (m2?.[1]) return m2[1];
  return null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetries(url: string, init: RequestInit, opts?: { retries?: number; backoffMs?: number }) {
  const retries = opts?.retries ?? 2;
  const backoffMs = opts?.backoffMs ?? 250;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

function extractNextDataJson(html: string): any | null {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectPostRefsFromHtml(html: string, group: string, refs: Map<string, PostRef>, postObjects?: Map<string, PostTreePost>) {
  // 1) Parse __NEXT_DATA__ if present
  const nd = extractNextDataJson(html);
  if (nd) {
    if (postObjects) collectPostObjectsFromPostTrees(nd, postObjects);
    collectPostRefsFromPostTrees(nd, refs);
    collectPostRefsFromCommonArrays(nd, refs);
    // Some link_as fields are embedded in JSON too
    collectPostRefsFromLinks(nd, group, refs);
  }

  // 2) Regex scan for hrefs like: "/automation-masters/some-post-slug?p=70ba1de8"
  // This is robust even when the JSON endpoints don't exist.
  const g = escapeRegExp(group);
  const re = new RegExp(`\\/${g}\\/([^"?#/]+)\\?[^"\\n]*\\bp=([0-9a-f]{6,32})`, "ig");
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const slug = (m[1] ?? "").trim();
    const pid = (m[2] ?? "").trim();
    if (!slug || !pid) continue;
    if (!isSlug(slug)) continue;
    if (!isHexId6to32(pid)) continue;
    const fullId = isHex32(pid) ? pid : null;
    const key = fullId ?? slug ?? pid;
    if (!refs.has(key)) refs.set(key, { id: fullId, slug });
  }
}

function isSlug(s: string): boolean {
  if (!s || s.length < 6 || s.length > 140) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(s)) return false;
  return true;
}

type PostRef = { slug: string | null; id: string | null };

function isHex32(s: string): boolean {
  return /^[0-9a-f]{32}$/i.test(s);
}

function isHexId6to32(s: string): boolean {
  return /^[0-9a-f]{6,32}$/i.test(s);
}

function parsePostRefsFromNotifications(json: any, group: string): Map<string, PostRef> {
  const out = new Map<string, PostRef>();
  const messages: any[] = Array.isArray(json?.messages) ? json.messages : [];
  for (const m of messages) {
    const raw = m?.metadata?.data;
    if (typeof raw !== "string") continue;
    try {
      const meta = JSON.parse(raw) as any;
      const linkAs = typeof meta?.link_as === "string" ? meta.link_as : null;
      const postId = typeof meta?.post_id === "string" ? meta.post_id : null;
      if (!linkAs || !postId || !isHexId6to32(postId)) continue;
      if (!linkAs.startsWith("/")) continue;
      const segs = linkAs.split("?")[0].split("/").filter(Boolean);
      if (segs.length < 2) continue;
      if (segs[0] !== group) continue;
      const maybeSlug = segs[1];
      // post_id is usually 32-hex, but we've seen shorter ids in URLs; keep it as a "post param".
      out.set(postId, { id: isHex32(postId) ? postId : null, slug: isSlug(maybeSlug) ? maybeSlug : null });
    } catch {
      // ignore
    }
  }
  return out;
}

function mergeRefsInto(target: Map<string, PostRef>, src: Map<string, PostRef>) {
  for (const [id, ref] of src.entries()) {
    if (!target.has(id)) target.set(id, ref);
  }
}

function collectPostRefsFromLinks(obj: unknown, group: string, out: Map<string, PostRef>, depth = 0) {
  if (depth > 10) return;
  if (!obj) return;

  if (Array.isArray(obj)) {
    for (const v of obj) collectPostRefsFromLinks(v, group, out, depth + 1);
    return;
  }

  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;

  for (const [k, v] of Object.entries(rec)) {
    const key = k.toLowerCase();
    if (typeof v === "string") {
      const s = v.trim();
      // Prefer Skool link fields: they include the real post id as ?p=<id>
      if ((key.includes("link_as") || key.includes("link_href")) && s.startsWith("/")) {
        try {
          const u = new URL(`https://www.skool.com${s}`);
          const pathname = u.pathname;
          const segs = pathname.split("/").filter(Boolean);
          if (segs.length >= 2) {
            const maybeGroup = segs[0];
            const maybeSlug = segs[1];
            const pid = u.searchParams.get("p");
            // IMPORTANT: Skool uses shortened ids in URLs (e.g. p=70ba1de8). We'll accept that and
            // resolve the full id via post-detail by slug.
            if (maybeGroup === group && pid && isHexId6to32(pid)) {
              const slug = isSlug(maybeSlug) ? maybeSlug : null;
              const fullId = isHex32(pid) ? pid : null;
              const key = fullId ?? slug ?? pid;
              out.set(key, { id: fullId, slug });
            }
          }
        } catch {
          // ignore
        }
      }
      continue;
    }
    collectPostRefsFromLinks(v, group, out, depth + 1);
  }
}

function collectPostRefsFromPostTrees(obj: unknown, out: Map<string, PostRef>, depth = 0) {
  if (depth > 10) return;
  if (!obj) return;

  if (Array.isArray(obj)) {
    for (const v of obj) collectPostRefsFromPostTrees(v, out, depth + 1);
    return;
  }

  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;

  // Common Skool shape: { post_tree: { post: { id, name, metadata: { content } } } }
  const pt = rec["post_tree"] as any;
  const post = pt?.post as any;
  const id = typeof post?.id === "string" ? post.id : null;
  const name = typeof post?.name === "string" ? post.name : null;
  if (id && isHex32(id)) {
    out.set(id, { id, slug: name && isSlug(name) ? name : null });
  }

  for (const v of Object.values(rec)) {
    collectPostRefsFromPostTrees(v, out, depth + 1);
  }
}

type PostTreePost = any;

function collectPostObjectsFromPostTrees(obj: unknown, out: Map<string, PostTreePost>, depth = 0) {
  if (depth > 10) return;
  if (!obj) return;

  if (Array.isArray(obj)) {
    for (const v of obj) collectPostObjectsFromPostTrees(v, out, depth + 1);
    return;
  }

  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;

  const pt = rec["post_tree"] as any;
  const post = pt?.post as any;
  const id = typeof post?.id === "string" ? post.id : null;
  if (id && isHex32(id)) {
    out.set(id, post);
  }

  for (const v of Object.values(rec)) {
    collectPostObjectsFromPostTrees(v, out, depth + 1);
  }
}

function collectPostRefsFromCommonArrays(obj: unknown, out: Map<string, PostRef>, depth = 0) {
  if (depth > 10) return;
  if (!obj) return;

  if (Array.isArray(obj)) {
    for (const v of obj) collectPostRefsFromCommonArrays(v, out, depth + 1);
    return;
  }

  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;

  // Look for common list containers where post objects may appear without a `post_tree` wrapper.
  const candidates = [
    rec["posts"],
    rec["items"],
    rec["feed"],
    (rec["data"] as any)?.posts,
    (rec["data"] as any)?.items,
    (rec["pageProps"] as any)?.posts,
    (rec["pageProps"] as any)?.items,
  ];
  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    for (const p of c as any[]) {
      const id = typeof p?.id === "string" ? p.id : typeof p?.post?.id === "string" ? p.post.id : null;
      const name = typeof p?.name === "string" ? p.name : typeof p?.post?.name === "string" ? p.post.name : null;
      if (id && isHex32(id)) out.set(id, { id, slug: name && isSlug(name) ? name : null });
    }
  }

  for (const v of Object.values(rec)) {
    collectPostRefsFromCommonArrays(v, out, depth + 1);
  }
}

async function api2GetJson(cookie: string, waf: string | null, url: string, referer: string) {
  const res = await fetchWithRetries(
    url,
    {
    method: "GET",
    headers: {
      cookie,
      ...(waf ? { "x-aws-waf-token": waf } : {}),
      origin: "https://www.skool.com",
      referer,
      accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": SKOOL_UA,
    },
    cache: "no-store",
    redirect: "follow",
    },
    { retries: 2, backoffMs: 250 }
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, textPreview: text.slice(0, 1200) };
}

function coerceGroupId(json: any): string | null {
  const candidates = [
    json?.id,
    json?.group?.id,
    json?.data?.id,
    json?.data?.group?.id,
    json?.pageProps?.group?.id,
    json?.pageProps?.groupId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && isHex32(c)) return c;
  }
  return null;
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

function extractContentFromUnknown(p: any): string {
  const direct = String(
    p?.content ??
      p?.text ??
      p?.description ??
      p?.body ??
      p?.data?.content ??
      p?.data?.text ??
      p?.data?.body ??
      p?.metadata?.content ??
      p?.metadata?.text ??
      p?.metadata?.description ??
      ""
  ).trim();
  if (direct) return direct;

  const md = p?.metadata;
  const mdData = md?.data;
  if (typeof mdData === "string" && mdData.trim()) {
    try {
      const parsed = JSON.parse(mdData) as any;
      const nested = String(parsed?.content ?? parsed?.text ?? parsed?.description ?? parsed?.body ?? "").trim();
      if (nested) return nested;
    } catch {
      // ignore
    }
  }

  return "";
}

function resolveAuthorFromPost(p: any): any | null {
  if (!p || typeof p !== "object") return null;

  // Best case: Skool provides the actual author explicitly.
  const direct = p?.author;
  if (direct && typeof direct === "object") return direct;

  // Heuristic: in some Skool payloads, `user` is the *logged-in* user (often the admin),
  // while the real author id exists in another field. If they disagree, don't trust `user`.
  const createdBy =
    p?.created_by ??
    p?.createdBy ??
    p?.user_id ??
    p?.userId ??
    p?.author_id ??
    p?.authorId ??
    null;
  const createdById = typeof createdBy === "string" || typeof createdBy === "number" ? String(createdBy) : null;

  const user = p?.user;
  if (user && typeof user === "object") {
    const userId = user?.id != null ? String(user.id) : null;
    if (createdById && userId && userId !== createdById) return null;
    return user;
  }

  return null;
}

function summarizeStrings(obj: unknown, opts?: { maxDepth?: number; maxItems?: number }) {
  const maxDepth = opts?.maxDepth ?? 4;
  const maxItems = opts?.maxItems ?? 12;
  const out: Array<{ path: string; len: number; preview: string }> = [];

  const visit = (v: unknown, path: string, depth: number) => {
    if (out.length >= maxItems) return;
    if (depth > maxDepth) return;
    if (v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length >= 20) {
        out.push({ path, len: s.length, preview: s.slice(0, 140) });
      }
      return;
    }
    if (typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (let i = 0; i < Math.min(v.length, 10); i++) {
        visit(v[i], `${path}[${i}]`, depth + 1);
        if (out.length >= maxItems) return;
      }
      return;
    }
    const rec = v as Record<string, unknown>;
    for (const [k, vv] of Object.entries(rec)) {
      visit(vv, path ? `${path}.${k}` : k, depth + 1);
      if (out.length >= maxItems) return;
    }
  };

  visit(obj, "", 0);
  return out;
}

export async function POST(req: NextRequest) {
  // Require an authenticated user.
  const authRes = NextResponse.json({ ok: false });
  try {
    const supabaseAuth = createSupabaseRouteClient(req, authRes);
    const { data, error } = await supabaseAuth.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload.", issues: parsed.error.issues }, { status: 422 });
  }

  let cookie: string;
  try {
    cookie = decryptString(parsed.data.encryptedCookie);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Invalid encryptedCookie." }, { status: 400 });
  }

  const group = parsed.data.group.trim();
  const limit = parsed.data.limit;
  const sort = parsed.data.sort;
  const maxPages = parsed.data.maxPages;

  const waf = getCookieValue(cookie, "aws-waf-token");

  // 0) Notifications are a *fallback seed* (they can be biased to admin/announcement activity).
  // We keep them separate so they don't dominate the first `limit` items.
  const refs = new Map<string, PostRef>();
  const notifRefs = new Map<string, PostRef>();
  let seedLabelId: string | null = null;
  let seedGroupId: string | null = null;
  const notifDebug: {
    status: number | null;
    textPreview?: string;
    triedLimits?: number[];
    messageCount: number;
    withMetaData: number;
    withLinkAs: number;
    withPostId: number;
    sampleLinkAs: string[];
    pages?: number;
    lastCursor?: string | null;
    hasMore?: boolean | null;
  } = { status: null, triedLimits: [], messageCount: 0, withMetaData: 0, withLinkAs: 0, withPostId: 0, sampleLinkAs: [] };
  try {
    // This endpoint is picky about allowed limit values.
    const candidateLimits = [30, 20, 10].filter((n) => n <= 50);
    for (const nLimit of candidateLimits) {
      notifDebug.triedLimits?.push(nLimit);
      let cursor: string | null = null;
      let pages = 0;
      let hasMore: boolean | null = null;

      // Paginate notifications until we collect enough unique post ids (or no more pages).
      while (pages < 6 && notifRefs.size < limit) {
        const qp = new URLSearchParams();
        qp.set("limit", String(nLimit));
        qp.set("type", "all");
        if (cursor) qp.set("cursor", cursor);
        const url = `https://api2.skool.com/self/notifications?${qp.toString()}`;

        const nRes = await fetchWithRetries(
          url,
          {
            method: "GET",
            headers: {
              cookie,
              ...(waf ? { "x-aws-waf-token": waf } : {}),
              origin: "https://www.skool.com",
              referer: "https://www.skool.com/",
              accept: "application/json, text/plain;q=0.9, */*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              "user-agent": SKOOL_UA,
            },
            cache: "no-store",
            redirect: "follow",
          },
          { retries: 2, backoffMs: 250 }
        );

        notifDebug.status = nRes.status;
        if (!nRes.ok) {
          const t = await nRes.text().catch(() => "");
          notifDebug.textPreview = t.slice(0, 2000);
          break; // invalid limit or blocked; try next nLimit
        }

        const nJson = await nRes.json().catch(() => null);
        if (!nJson) break;

        const msgs: any[] = Array.isArray(nJson?.messages) ? nJson.messages : [];
        notifDebug.messageCount += msgs.length;
        for (const m of msgs) {
          const raw = m?.metadata?.data;
          if (typeof raw !== "string") continue;
          notifDebug.withMetaData++;
          try {
            const meta = JSON.parse(raw) as any;
            const linkAs = typeof meta?.link_as === "string" ? meta.link_as : null;
            const postId = typeof meta?.post_id === "string" ? meta.post_id : null;
            if (linkAs) {
              notifDebug.withLinkAs++;
              if (notifDebug.sampleLinkAs.length < 3) notifDebug.sampleLinkAs.push(linkAs);
            }
            if (postId && isHex32(postId)) notifDebug.withPostId++;
          } catch {
            // ignore
          }
        }

        const pageRefs = parsePostRefsFromNotifications(nJson, group);
        mergeRefsInto(notifRefs, pageRefs);

        pages++;
        hasMore = typeof nJson?.has_more === "boolean" ? nJson.has_more : null;
        cursor = typeof nJson?.cursor === "string" ? nJson.cursor : null;
        if (!hasMore || !cursor) break;
      }

      notifDebug.pages = pages;
      notifDebug.lastCursor = cursor;
      notifDebug.hasMore = hasMore;

      if (notifRefs.size > 0) break;
    }
  } catch {
    // ignore; we'll fall back to next data
  }

  // If we found at least one post via notifications, fetch its post-detail to discover label_id (used for debugging)
  // and group_id (for persistence).
  if (notifRefs.size > 0) {
    try {
      const first = Array.from(notifRefs.values())[0];
      const postParam = first?.id ?? first?.slug ?? null;
      if (postParam) {
        const detailUrl = `https://api2.skool.com/groups/${encodeURIComponent(group)}/post-detail?post=${encodeURIComponent(
          postParam
        )}&with-comments=false`;
        const res = await fetchWithRetries(
          detailUrl,
          {
            method: "GET",
            headers: {
              cookie,
              ...(waf ? { "x-aws-waf-token": waf } : {}),
              origin: "https://www.skool.com",
              referer: `https://www.skool.com/${group}`,
              accept: "application/json, text/plain;q=0.9, */*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              "user-agent": SKOOL_UA,
            },
            cache: "no-store",
            redirect: "follow",
          },
          { retries: 2, backoffMs: 250 }
        );
        const json = await res.json().catch(() => null);
        const candidate = (json?.post ?? json?.data?.post ?? json) as any;
        const postObj = candidate?.post_tree?.post ?? candidate?.post ?? candidate;
        const labelId = typeof postObj?.label_id === "string" ? postObj.label_id : null;
        const groupId = typeof postObj?.group_id === "string" ? postObj.group_id : null;
        if (labelId && isHex32(labelId)) seedLabelId = labelId;
        if (groupId && isHex32(groupId)) seedGroupId = groupId;
      }
    } catch {
      // ignore
    }
  }

  // 0b) If notifications are sparse, try to list posts from api2 feed endpoints.
  // This avoids relying on "recent notifications" which often yields only 1 post.
  const api2Debug: { groupId: string | null; attempts: Array<{ url: string; status: number; ok: boolean }> } = {
    groupId: null,
    attempts: [],
  };
  const api2PostObjects = new Map<string, PostTreePost>();

  let discoveredGroupId: string | null = null;
  try {
    const groupCandidates = [
      `https://api2.skool.com/groups/${encodeURIComponent(group)}`,
      `https://api2.skool.com/groups/${encodeURIComponent(group)}/about`,
      `https://api2.skool.com/groups/${encodeURIComponent(group)}/info`,
    ];
    for (const u of groupCandidates) {
      const r = await api2GetJson(cookie, waf, u, "https://www.skool.com/");
      api2Debug.attempts.push({ url: u, status: r.status, ok: r.ok });
      if (r.ok && r.json) {
        discoveredGroupId = coerceGroupId(r.json);
        if (discoveredGroupId) break;
      }
    }
  } catch {
    // ignore
  }
  api2Debug.groupId = discoveredGroupId;

  try {
    const pageSize = Math.min(20, Math.max(5, limit));
    const target = Math.min(limit, 200);

    const buildUrl = (base: string, qp: Record<string, string | number | null | undefined>) => {
      const u = new URL(base);
      for (const [k, v] of Object.entries(qp)) {
        if (v === null || v === undefined || v === "") continue;
        u.searchParams.set(k, String(v));
      }
      return u.toString();
    };

    // Try multiple endpoint families; for each, paginate offset until we stop getting new post ids.
    const endpointFamilies: Array<{ name: string; makeBase: () => string[] }> = [
      {
        name: "groupId",
        makeBase: () =>
          discoveredGroupId
            ? [
                `https://api2.skool.com/groups/${discoveredGroupId}/posts`,
                `https://api2.skool.com/groups/${discoveredGroupId}/feed`,
              ]
            : [],
      },
      {
        name: "groupSlug",
        makeBase: () => [`https://api2.skool.com/groups/${encodeURIComponent(group)}/posts`, `https://api2.skool.com/groups/${encodeURIComponent(group)}/feed`],
      },
      {
        name: "label",
        makeBase: () =>
          seedLabelId
            ? [`https://api2.skool.com/labels/${seedLabelId}/posts`, `https://api2.skool.com/labels/${seedLabelId}/feed`]
            : [],
      },
    ];

    for (const fam of endpointFamilies) {
      const bases = fam.makeBase();
      for (const base of bases) {
        let offset = 0;
        let stagnantPages = 0;
        for (let page = 0; page < maxPages && refs.size < target; page++) {
          const before = refs.size;
          const url = buildUrl(base, { limit: pageSize, offset, sort });
          const r = await api2GetJson(cookie, waf, url, `https://www.skool.com/${group}`);
          api2Debug.attempts.push({ url, status: r.status, ok: r.ok });
          if (!r.ok || !r.json) break;

          collectPostRefsFromPostTrees(r.json, refs);
          collectPostObjectsFromPostTrees(r.json, api2PostObjects);

          const arrs = [r.json?.posts, r.json?.items, r.json?.post_trees, r.json?.data?.posts, r.json?.data?.items];
          for (const a of arrs) {
            if (!Array.isArray(a)) continue;
            for (const p of a) {
              const id = typeof p?.id === "string" ? p.id : typeof p?.post?.id === "string" ? p.post.id : null;
              const name = typeof p?.name === "string" ? p.name : typeof p?.post?.name === "string" ? p.post.name : null;
              if (id && isHex32(id)) refs.set(id, { id, slug: name && isSlug(name) ? name : null });
            }
          }

          const after = refs.size;
          if (after <= before) stagnantPages++;
          else stagnantPages = 0;

          // Heuristic: if we stop getting new ids for 2 pages, we're probably done for this endpoint.
          if (stagnantPages >= 2) break;

          offset += pageSize;
        }

        if (refs.size >= Math.min(target, 50)) break;
      }
      if (refs.size >= Math.min(target, 50)) break;
    }
  } catch {
    // ignore
  }

  // 1) Fetch group HTML (prefer posts page) to get buildId + __NEXT_DATA__ (often contains post_tree objects).
  let html = "";
  let nextData: any | null = null;
  let htmlUrlUsed: string | null = null;
  try {
    const candidates = [
      `https://www.skool.com/${encodeURIComponent(group)}/-/posts`,
      `https://www.skool.com/${encodeURIComponent(group)}?s=${encodeURIComponent(sort)}&fl=`,
    ];

    let lastStatus = 0;
    let lastText = "";
    for (const u of candidates) {
      const res = await fetchWithRetries(
        u,
        {
          method: "GET",
          headers: {
            cookie,
            "user-agent": SKOOL_UA,
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en-US,en;q=0.9",
            referer: "https://www.skool.com/",
          },
          cache: "no-store",
          redirect: "follow",
        },
        { retries: 2, backoffMs: 300 }
      );
      lastStatus = res.status;
      lastText = await res.text().catch(() => "");
      if (res.ok && lastText) {
        html = lastText;
        htmlUrlUsed = u;
        nextData = extractNextDataJson(html);
        break;
      }
    }

    if (!html) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch group page (${lastStatus}).`,
          status: lastStatus,
          textPreview: lastText.slice(0, 2000),
        },
        { status: 502 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `fetch failed for group posts: ${e.message}` : "fetch failed for group posts." },
      { status: 502 }
    );
  }

  // Prefer extracting actual post objects from __NEXT_DATA__ (already authenticated).
  const postObjects = new Map<string, PostTreePost>();
  if (nextData) collectPostObjectsFromPostTrees(nextData, postObjects);

  const buildId = extractBuildId(html);
  if (!buildId) {
    return NextResponse.json({ ok: false, error: "Could not detect Skool buildId." }, { status: 502 });
  }

  // 1b) HTML scan pagination: when Skool doesn't expose stable JSON routes, we can still discover post slugs/ids
  // from the rendered feed pages. This usually yields the "full" feed (not only admin-heavy notifications).
  const htmlScanDebug: { tried: Array<{ url: string; status: number; ok: boolean; newIds: number }> } = { tried: [] };
  try {
    const listTarget = Math.min(limit, 200);
    const base = `https://www.skool.com/${encodeURIComponent(group)}`;
    // Seed from the first HTML we already fetched.
    const beforeSeed = refs.size;
    collectPostRefsFromHtml(html, group, refs, postObjects);
    const seedNew = refs.size - beforeSeed;
    if (seedNew > 0 && htmlUrlUsed) htmlScanDebug.tried.push({ url: htmlUrlUsed, status: 200, ok: true, newIds: seedNew });

    let stagnant = 0;
    for (let page = 2; page <= maxPages && refs.size < listTarget; page++) {
      const before = refs.size;
      const candidates: string[] = [];
      // Different Skool deployments use different pagination params; we try a few.
      candidates.push(`${base}?s=${encodeURIComponent(sort)}&fl=&p=${page}`);
      candidates.push(`${base}?s=${encodeURIComponent(sort)}&fl=&page=${page}`);
      candidates.push(`${base}?p=${page}`);
      candidates.push(`${base}?page=${page}`);

      let anyOk = false;
      for (const u of candidates) {
        const res = await fetchWithRetries(
          u,
          {
            method: "GET",
            headers: {
              cookie,
              "user-agent": SKOOL_UA,
              accept: "text/html,application/xhtml+xml",
              "accept-language": "en-US,en;q=0.9",
              referer: htmlUrlUsed ?? base,
            },
            cache: "no-store",
            redirect: "follow",
          },
          { retries: 1, backoffMs: 250 }
        );
        const text = await res.text().catch(() => "");
        if (!res.ok || !text) {
          htmlScanDebug.tried.push({ url: u, status: res.status, ok: false, newIds: 0 });
          continue;
        }
        anyOk = true;
        const beforeU = refs.size;
        collectPostRefsFromHtml(text, group, refs, postObjects);
        const newIds = refs.size - beforeU;
        htmlScanDebug.tried.push({ url: u, status: res.status, ok: true, newIds });
        // If this URL variant yielded new ids, no need to try other variants for the same page.
        if (newIds > 0) break;
      }

      if (!anyOk) break;
      if (refs.size <= before) stagnant++;
      else stagnant = 0;
      if (stagnant >= 2) break;
    }
  } catch {
    // ignore: we still have notifications + next-data fallback below
  }

  // 2) Fetch Next data JSON lists, paginating by `p` (same idea as the members page approach).
  // Primary: /<group>/-/posts.json (stable route); fallback: /<group>.json
  const nextDataDebug: { tried: Array<{ url: string; status: number; ok: boolean; newIds: number }> } = { tried: [] };

  const fetchNextData = async (url: string) => {
    const res = await fetchWithRetries(
      url,
      {
        method: "GET",
        headers: {
          cookie,
          "user-agent": SKOOL_UA,
          accept: "application/json",
          "x-nextjs-data": "1",
          "accept-language": "en-US,en;q=0.9",
          referer: htmlUrlUsed ?? `https://www.skool.com/${group}/-/posts`,
        },
        cache: "no-store",
        redirect: "follow",
      },
      { retries: 2, backoffMs: 300 }
    );
    const json = await res.json().catch(() => null);
    return { res, json };
  };

  const listTarget = Math.min(limit, 200);
  for (let page = 1; page <= maxPages && refs.size < listTarget; page++) {
    const before = refs.size;

    const urls: string[] = [];
    {
      const u = new URL(`https://www.skool.com/_next/data/${encodeURIComponent(buildId)}/${encodeURIComponent(group)}/-/posts.json`);
      u.searchParams.set("p", String(page));
      u.searchParams.set("s", sort);
      u.searchParams.set("fl", "");
      u.searchParams.set("group", group);
      urls.push(u.toString());
    }
    {
      const u = new URL(`https://www.skool.com/_next/data/${encodeURIComponent(buildId)}/${encodeURIComponent(group)}.json`);
      u.searchParams.set("p", String(page));
      u.searchParams.set("s", sort);
      u.searchParams.set("fl", "");
      u.searchParams.set("group", group);
      urls.push(u.toString());
    }

    let anyOk = false;
    for (const u of urls) {
      const { res, json } = await fetchNextData(u);
      if (!res.ok || !json) {
        nextDataDebug.tried.push({ url: u, status: res.status, ok: res.ok, newIds: 0 });
        continue;
      }

      anyOk = true;
      const tempRefs = new Map<string, PostRef>();
      collectPostRefsFromPostTrees(json, tempRefs);
      collectPostRefsFromLinks(json, group, tempRefs);
      collectPostRefsFromCommonArrays(json, tempRefs);

      const newIds = Array.from(tempRefs.keys()).filter((k) => !refs.has(k)).length;
      nextDataDebug.tried.push({ url: u, status: res.status, ok: res.ok, newIds });

      // Merge objects + refs
      collectPostObjectsFromPostTrees(json, postObjects);
      for (const [k, v] of tempRefs.entries()) refs.set(k, v);
    }

    if (!anyOk) break;
    if (refs.size <= before) break;
  }

  // Merge any post objects gathered from api2 feed attempts.
  for (const [id, post] of api2PostObjects.entries()) {
    if (!postObjects.has(id)) postObjects.set(id, post);
  }

  // Merge notification refs last so they don't dominate the first `limit` items.
  mergeRefsInto(refs, notifRefs);

  const postRefs = Array.from(refs.values()).slice(0, limit);
  if (postRefs.length === 0) {
    return NextResponse.json({
      ok: true,
      group,
      buildId,
      detected: 0,
      synced: 0,
      note: "No post ids detected (checked next-data + notifications).",
      debug: {
        nextData: nextDataDebug,
        notifications: notifDebug,
        api2: api2Debug,
      },
    });
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    supabase = null;
  }

  const results: Array<{
    post: { id: string | null; slug: string | null };
    ok: boolean;
    decision?: string;
    error?: string;
    tried?: string[];
    debug?: unknown;
  }> = [];
  let synced = 0;
  let flagged = 0;
  let approved = 0;
  let blocked = 0;

  const seenEntityIds = new Set<string>();
  for (const ref of postRefs) {
    try {
      const tried: string[] = [];
      const fetchDetail = async (postParam: string) => {
        tried.push(postParam);
        const detailPath = `/groups/${encodeURIComponent(group)}/post-detail?post=${encodeURIComponent(postParam)}&with-comments=false`;
        const detailRes = await fetch(`https://api2.skool.com${detailPath}`, {
          method: "GET",
          headers: {
            cookie,
            ...(waf ? { "x-aws-waf-token": waf } : {}),
            origin: "https://www.skool.com",
            referer: `https://www.skool.com/${group}`,
            accept: "application/json, text/plain;q=0.9, */*;q=0.8",
            "user-agent": SKOOL_UA,
          },
          cache: "no-store",
          redirect: "follow",
        });
        const detailJson = await detailRes.json().catch(() => null);
        return { detailRes, detailJson };
      };

      // Fast path: if we have a post object from __NEXT_DATA__, use it directly (no extra network).
      let detailRes: Response | null = null;
      let detailJson: any = null;
      let p: any = null;
      let content = "";

      const applyDetail = (json: any) => {
        const candidate = (json?.post ?? json?.data?.post ?? json) as any;
        // Skool often nests as { post_tree: { post: {...} } }
        const postObj =
          candidate?.post_tree?.post && typeof candidate.post_tree.post === "object"
            ? candidate.post_tree.post
            : candidate?.post && typeof candidate.post === "object"
            ? candidate.post
            : candidate;
        const c = extractContentFromUnknown(postObj);
        return { postObj, c };
      };

      if (ref.id && postObjects.has(ref.id)) {
        p = postObjects.get(ref.id);
        content = extractContentFromUnknown(p);
        if (!content && typeof p?.metadata?.content === "string") content = String(p.metadata.content).trim();
        // No need to fill tried here; we didn't call post-detail.
      } else {
      if (ref.slug) {
        const r1 = await fetchDetail(ref.slug);
        detailRes = r1.detailRes;
        detailJson = r1.detailJson;
        if (detailRes.ok && detailJson) {
          const r = applyDetail(detailJson);
          p = r.postObj;
          content = r.c;
        }
      }

      // If slug fetch didn't work OR it worked but content is missing, try by id too.
      if (ref.id && (!detailRes || !detailRes.ok || !detailJson || !content)) {
        const r2 = await fetchDetail(ref.id);
        detailRes = r2.detailRes;
        detailJson = r2.detailJson;
        if (detailRes.ok && detailJson) {
          const r = applyDetail(detailJson);
          p = r.postObj;
          content = r.c;
        }
      }

      if (!detailRes || !detailRes.ok || !detailJson) {
        results.push({
          post: { id: ref.id, slug: ref.slug },
          ok: false,
          tried,
          error: `post-detail failed (${detailRes ? detailRes.status : "no_response"}).`,
        });
        continue;
      }
      }

      if (!content) {
        results.push({
          post: { id: ref.id, slug: ref.slug },
          ok: false,
          tried,
          error: "Missing post content.",
          debug: {
            postKeys: p && typeof p === "object" ? Object.keys(p).slice(0, 50) : null,
            stringFields: summarizeStrings(p),
            metadataDataPreview:
              typeof p?.metadata?.data === "string" ? String(p.metadata.data).slice(0, 500) : null,
          },
        });
        continue;
      }

      const resolvedEntityId = typeof p?.id === "string" && isHex32(p.id) ? p.id : (ref.id ?? ref.slug ?? "unknown");
      if (seenEntityIds.has(resolvedEntityId)) {
        // avoid duplicates when we had both id + slug refs
        continue;
      }
      seenEntityIds.add(resolvedEntityId);

      const title = typeof p?.title === "string" ? p.title : typeof p?.name === "string" ? p.name : null;
      const titleFromMeta = typeof p?.metadata?.title === "string" ? p.metadata.title : null;
      const categoryName =
        typeof p?.category?.name === "string"
          ? p.category.name
          : typeof p?.category_name === "string"
          ? p.category_name
          : null;
      const categoryId = typeof p?.category?.id === "string" ? p.category.id : typeof p?.category_id === "string" ? p.category_id : null;
      const createdAt = typeof p?.created_at === "string" ? p.created_at : typeof p?.createdAt === "string" ? p.createdAt : null;
      const authorObj = resolveAuthorFromPost(p);
      const groupId = typeof p?.group_id === "string" ? p.group_id : null;

      const analyzed = await analyzePost({
        id: resolvedEntityId,
        group_id: groupId ?? seedGroupId,
        category_id: categoryId ?? null,
        category_name: categoryName ?? null,
        title: titleFromMeta ?? title ?? null,
        content,
        created_at: createdAt ?? null,
        author: authorObj
          ? {
              id: String(authorObj?.id ?? "unknown"),
              username: authorObj?.username ?? null,
              first_name: authorObj?.first_name ?? authorObj?.firstName ?? null,
              last_name: authorObj?.last_name ?? authorObj?.lastName ?? null,
            }
          : null,
      });

      synced++;
      if (analyzed.decision === "needs_review") flagged++;
      else if (analyzed.decision === "approved") approved++;
      else if (analyzed.decision === "blocked") blocked++;

      if (supabase) {
        const row = {
          entity_type: "post",
          entity_id: resolvedEntityId,
          group_id: groupId ?? seedGroupId,
          category_id: categoryId ?? null,
          category_name: categoryName ?? null,
          decision: analyzed.decision,
          confidence: analyzed.confidence,
          reasons: analyzed.reasons,
          signals: analyzed.signals,
          layer: analyzed.layer,
          is_jobs_context: analyzed.isJobsContext,
          model: analyzed.model ?? null,
          raw: { post: p, result: analyzed },
          updated_at: new Date().toISOString(),
        };
        await supabase.from("moderation_items").upsert(row as any, { onConflict: "entity_type,entity_id" });
      }

      results.push({ post: { id: resolvedEntityId, slug: ref.slug }, ok: true, tried, decision: analyzed.decision });
    } catch (e) {
      results.push({ post: { id: ref.id, slug: ref.slug }, ok: false, error: e instanceof Error ? e.message : "Failed." });
    }
  }

  return NextResponse.json({
    ok: true,
    group,
    buildId,
    detected: postRefs.length,
    synced,
    flagged,
    approved,
    blocked,
    persisted: Boolean(supabase),
    results,
    debug: {
      htmlScan: htmlScanDebug,
      nextData: nextDataDebug,
      api2: api2Debug,
      notifications: notifDebug,
    },
  });
}


