"use client";

import { useSyncExternalStore } from "react";

const KEY = "nexus_inbox_unread_v1";
const EVENT = "nexus_inbox_unread_change";

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function getInboxUnread(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(KEY);
  return safeNumber(raw ?? 0);
}

export function setInboxUnread(count: number) {
  if (typeof window === "undefined") return;
  const next = safeNumber(count);
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

export function useInboxUnread(): number {
  return useSyncExternalStore(subscribe, getInboxUnread, () => 0);
}


