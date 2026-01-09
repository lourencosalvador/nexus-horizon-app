"use client";

import { useSyncExternalStore } from "react";

const KEY = "nexus_notifications_last_seen_v1";
const EVENT = "nexus_notifications_seen_change";

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function getNotificationsLastSeen(): number {
  if (typeof window === "undefined") return 0;
  return safeNumber(window.localStorage.getItem(KEY) ?? 0);
}

export function setNotificationsLastSeen(ts: number) {
  if (typeof window === "undefined") return;
  const next = safeNumber(ts);
  window.localStorage.setItem(KEY, String(next));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onCustom);
  };
}

export function useNotificationsLastSeen(): number {
  return useSyncExternalStore(subscribe, getNotificationsLastSeen, () => 0);
}


