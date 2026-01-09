export type SkoolApiPostsConfig = {
  groupId: string;
  sessionId: string;
  updatedAt: number;
};

const KEY = "nexus_skoolapi_posts_config_v1";

type AllConfigs = Record<string, SkoolApiPostsConfig | undefined>;

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getSkoolApiPostsConfig(instanceId: string | null): SkoolApiPostsConfig | null {
  if (typeof window === "undefined") return null;
  if (!instanceId) return null;
  const raw = safeParse<AllConfigs>(window.localStorage.getItem(KEY));
  const cfg = raw?.[instanceId];
  return cfg && cfg.groupId && cfg.sessionId ? cfg : null;
}

export function setSkoolApiPostsConfig(instanceId: string, cfg: { groupId: string; sessionId: string } | null) {
  if (typeof window === "undefined") return;
  const raw = safeParse<AllConfigs>(window.localStorage.getItem(KEY)) ?? {};
  if (!cfg) {
    delete raw[instanceId];
    window.localStorage.setItem(KEY, JSON.stringify(raw));
    return;
  }
  raw[instanceId] = {
    groupId: cfg.groupId.trim(),
    sessionId: cfg.sessionId.trim(),
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(KEY, JSON.stringify(raw));
}


