import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decryptString } from "../../_crypto";

export const runtime = "nodejs";

const BodySchema = z.object({
  encryptedCookie: z.string().min(10),
});

type Group = { id: string; name: string; displayName?: string; totalMembers?: number };

function extractBuildId(html: string): string | null {
  // Look for buildId in __NEXT_DATA__ or inline JSON.
  const m1 = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (m1?.[1]) return m1[1];
  const m2 = html.match(/buildId"\s*:\s*"([^"]+)"/);
  if (m2?.[1]) return m2[1];
  return null;
}

function coerceGroups(json: any): Group[] {
  const out: Group[] = [];

  const allGroups = json?.pageProps?.self?.allGroups;
  if (Array.isArray(allGroups)) {
    for (const g of allGroups) {
      const grp = g?.group ?? g;
      const id = typeof grp?.id === "string" ? grp.id : null;
      const name = typeof grp?.name === "string" ? grp.name : null;
      const displayName = typeof grp?.metadata?.displayName === "string" ? grp.metadata.displayName : undefined;
      const totalMembers = typeof grp?.metadata?.totalMembers === "number" ? grp.metadata.totalMembers : undefined;
      if (id && name) out.push({ id, name, displayName, totalMembers });
    }
  }

  // Fallback: discovery list (public groups)
  const groups = json?.pageProps?.groups;
  if (out.length === 0 && Array.isArray(groups)) {
    for (const g of groups) {
      const grp = g?.group ?? g;
      const id = typeof grp?.id === "string" ? grp.id : null;
      const name = typeof grp?.name === "string" ? grp.name : null;
      const displayName = typeof grp?.metadata?.displayName === "string" ? grp.metadata.displayName : undefined;
      const totalMembers = typeof grp?.metadata?.totalMembers === "number" ? grp.metadata.totalMembers : undefined;
      if (id && name) out.push({ id, name, displayName, totalMembers });
    }
  }

  // Dedup by id
  const seen = new Set<string>();
  return out.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

export async function POST(req: NextRequest) {
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

  // 1) Fetch /discovery HTML to find buildId.
  let html = "";
  try {
    const res = await fetch("https://www.skool.com/discovery", {
      method: "GET",
      headers: {
        cookie,
        "user-agent": "Mozilla/5.0 (Nexus; Groups List)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://www.skool.com/",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Failed to fetch discovery page (${res.status}).`, status: res.status, textPreview: text.slice(0, 2000) },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to fetch discovery page." },
      { status: 502 }
    );
  }

  const buildId = extractBuildId(html);
  if (!buildId) {
    return NextResponse.json({ ok: false, error: "Could not detect Skool buildId." }, { status: 502 });
  }

  // 2) Fetch Next data JSON: /_next/data/<buildId>/discovery.json
  try {
    const dataRes = await fetch(`https://www.skool.com/_next/data/${encodeURIComponent(buildId)}/discovery.json`, {
      method: "GET",
      headers: {
        cookie,
        "user-agent": "Mozilla/5.0 (Nexus; Groups List)",
        accept: "application/json",
        "x-nextjs-data": "1",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://www.skool.com/discovery",
      },
      cache: "no-store",
      redirect: "follow",
    });
    const json = await dataRes.json().catch(() => null);
    if (!dataRes.ok || !json) {
      return NextResponse.json({ ok: false, error: `Failed to fetch discovery data (${dataRes.status}).` }, { status: 502 });
    }

    const groups = coerceGroups(json);
    return NextResponse.json({ ok: true, groups });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 502 });
  }
}


