function isSkoolGroupSlug(s: string): boolean {
  const v = s.trim().toLowerCase();
  if (!v) return false;
  if (["settings", "discovery", "login", "signin", "signup"].includes(v)) return false;
  if (v.startsWith("@")) return false;
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(v);
}

export function extractSkoolGroupSlug(inputUrl: string | null | undefined): string | null {
  const raw = (inputUrl ?? "").trim();
  if (!raw) return null;

  // Accept both full URLs and raw slugs.
  if (!raw.includes("/") && isSkoolGroupSlug(raw)) return raw;

  try {
    const u = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(`https://${raw}`);
    // Only support skool.com hosts.
    if (!u.hostname.includes("skool.com")) return null;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return null;

    // Typical:
    // - /automation-masters
    // - /automation-masters/-/posts
    // - /automation-masters/-/members
    const slug = segs[0] ?? "";
    return isSkoolGroupSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

