import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UnsplashSearchResponse = {
  results: Array<{
    id: string;
    urls: {
      small?: string;
      small_s3?: string;
      raw?: string;
    };
  }>;
};

const PAGE_CACHE = new Map<string, { expiresAt: number; results: UnsplashSearchResponse["results"] }>();
const IMAGE_CACHE = new Map<string, { expiresAt: number; bytes: ArrayBuffer; contentType: string }>();

function safeInt(value: string, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
}

function svgFallback(seed: number, name: string) {
  const fg = "#0f172a";
  const bg1 = "#dbeafe";
  const bg2 = "#ffffff";
  const text = initials(name || "N");
  const hue = ((seed % 360) + 360) % 360;
  const accent = `hsl(${hue} 85% 60%)`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="r" cx="18%" cy="20%" r="80%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="96" height="96" rx="16" fill="url(#g)"/>
  <rect width="96" height="96" rx="16" fill="url(#r)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
        font-size="28" font-weight="800" fill="${fg}">${text}</text>
</svg>`;
}

async function getSearchResults(page: number, perPage: number, accessKey: string) {
  const cacheKey = `portrait:${page}:${perPage}`;
  const cached = PAGE_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.results;

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", "portrait face");
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Unsplash search failed: ${res.status}`);
  const json = (await res.json()) as UnsplashSearchResponse;
  const results = Array.isArray(json.results) ? json.results : [];

  PAGE_CACHE.set(cacheKey, { results, expiresAt: now + 1000 * 60 * 60 * 6 });
  return results;
}

function normalizeUnsplashUrl(u: string) {
  const url = new URL(u);
  url.searchParams.set("w", "96");
  url.searchParams.set("h", "96");
  url.searchParams.set("fit", "crop");
  url.searchParams.set("crop", "faces");
  url.searchParams.set("auto", "format");
  url.searchParams.set("q", "80");
  return url.toString();
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ seed: string; name: string }> }
) {
  const { seed: seedParam, name: rawName } = await ctx.params;
  const seed = safeInt(seedParam, 0);
  const name = decodeURIComponent(rawName ?? "");

  const accessKey = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_TOKEN;

  const cacheKey = `${seed}:${name}`;
  const cached = IMAGE_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return new NextResponse(cached.bytes, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  }

  if (!accessKey) {
    try {
      const img = (Math.abs(seed) % 70) + 1;
      const url = `https://i.pravatar.cc/96?img=${img}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Pravatar failed");

      const bytes = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "image/jpeg";

      IMAGE_CACHE.set(cacheKey, { bytes, contentType, expiresAt: now + 1000 * 60 * 60 * 24 });

      return new NextResponse(bytes, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      const svg = svgFallback(seed, name);
      const bytes = new TextEncoder().encode(svg).buffer;
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  }

  try {
    const perPage = 30;
    const page = (Math.abs(seed) % 10) + 1;
    const idx = Math.abs(seed) % perPage;
    const results = await getSearchResults(page, perPage, accessKey);

    const picked = results[idx % Math.max(1, results.length)];
    const rawUrl = picked?.urls?.small ?? picked?.urls?.small_s3 ?? picked?.urls?.raw;
    if (!rawUrl) throw new Error("No Unsplash URL");

    const imageUrl = normalizeUnsplashUrl(rawUrl);
    const imgRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const bytes = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    IMAGE_CACHE.set(cacheKey, { bytes, contentType, expiresAt: now + 1000 * 60 * 60 * 24 });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    const svg = svgFallback(seed, name);
    const bytes = new TextEncoder().encode(svg).buffer;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }
}



