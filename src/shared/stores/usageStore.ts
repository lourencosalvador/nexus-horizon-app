const KEY = "nexus_demo_usage_v1";

function safeNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getStoredUsage(): number {
  if (typeof window === "undefined") return 0;
  const raw = safeNumber(window.localStorage.getItem(KEY));
  return typeof raw === "number" ? raw : 0;
}

export function setStoredUsage(usage: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(usage));
}


