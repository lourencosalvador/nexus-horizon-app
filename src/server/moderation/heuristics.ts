import type { HeuristicsResult, PostInput } from "./types";

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/gi;

const SHORTENER_HOSTS = [
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "rebrand.ly",
  "cutt.ly",
  "lnk.bio",
  "linktr.ee",
  "buff.ly",
  "shorturl.at",
];

const DM_CTA = [
  /\bdm\s+me\b/i,
  /\bmessage\s+me\b/i,
  /\bpm\s+me\b/i,
  /\binbox\s+me\b/i,
  /\bfala\s+comigo\s+no\s+privado\b/i,
  /\bme\s+chama\s+no\s+dm\b/i,
  /\bme\s+manda\s+msg\b/i,
  /\bchama\s+no\s+privado\b/i,
];

const COMMENT_CTA = [
  /\bcomment\s+["'“”]?([a-z0-9_ -]{1,20})["'“”]?\b/i,
  /\bcomment\s+below\b/i,
  /\bcomenta\s+["'“”]?([a-z0-9_ -]{1,20})["'“”]?\b/i,
  /\bcomente\s+["'“”]?([a-z0-9_ -]{1,20})["'“”]?\b/i,
  /\bdeixa\s+um\s+coment[aá]rio\b/i,
];

const OFFER_KEYWORDS = [
  /\bfree\s+call\b/i,
  /\bbook\s+a\s+call\b/i,
  /\bdiscovery\s+call\b/i,
  /\blimited\s+spots\b/i,
  /\bspots\s+left\b/i,
  /\bdiscount\b/i,
  /\boffer\b/i,
  /\bsale\b/i,
  /\bpromo\b/i,
  /\bpromotion\b/i,
  /\bpromo[cç][aã]o\b/i,
  /\bdesconto\b/i,
  /\bvenda\b/i,
  /\bcomprar\b/i,
  /\bcheckout\b/i,
  /\bpayment\b/i,
  /\bstripe\b/i,
];

const OUTSIDE_PLATFORM = [
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /\bdiscord\b/i,
  /\bfacebook\b/i,
  /\binstagram\b/i,
  /\blinked[in]*\b/i,
];

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function countLinks(text: string) {
  const urls = (text.match(URL_RE) ?? []).map((u) => u.trim());
  // Bare domains can over-match normal words; keep only those with a dot and a TLD.
  const bare = (text.match(BARE_DOMAIN_RE) ?? [])
    .map((d) => d.trim())
    .filter((d) => d.includes(".") && !d.endsWith("."));
  const all = uniq([...urls, ...bare]);
  return { all, count: all.length };
}

function hasShortener(link: string) {
  try {
    const u = new URL(link.startsWith("http") ? link : `https://${link}`);
    return SHORTENER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function analyzeHeuristics(post: PostInput): HeuristicsResult {
  const text = `${post.title ?? ""}\n${post.content ?? ""}`.trim();
  const reasons: string[] = [];
  let score = 0;
  const signals: string[] = [];

  const { all: links, count: linkCount } = countLinks(text);
  if (linkCount > 0) {
    signals.push("external_link");
    reasons.push(`Contains ${linkCount} link(s).`);
    score += Math.min(35, 12 + linkCount * 6);
  }
  if (linkCount >= 3) {
    signals.push("many_links");
    reasons.push("Contains many links.");
    score += 10;
  }
  if (links.some((l) => hasShortener(l))) {
    signals.push("short_link");
    reasons.push("Contains link shortener.");
    score += 12;
  }

  if (DM_CTA.some((re) => re.test(text))) {
    signals.push("dm_cta");
    reasons.push("Contains DM/private-message call-to-action.");
    score += 18;
  }
  if (COMMENT_CTA.some((re) => re.test(text))) {
    signals.push("comment_cta");
    reasons.push("Contains comment-based call-to-action (e.g., 'comment X').");
    score += 14;
  }
  if (OFFER_KEYWORDS.some((re) => re.test(text))) {
    signals.push("keyword_offer");
    reasons.push("Contains conversion/offer keywords.");
    score += 14;
  }
  if (OUTSIDE_PLATFORM.some((re) => re.test(text))) {
    signals.push("keyword_outside_platform");
    reasons.push("Mentions off-platform contact channels (e.g., WhatsApp/Instagram).");
    score += 8;
  }

  // Clamp 0..100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    signals: uniq(signals) as any,
    reasons: uniq(reasons),
    linkCount,
  };
}


