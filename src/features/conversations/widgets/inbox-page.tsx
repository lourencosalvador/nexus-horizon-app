"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Filter,
  Inbox,
  MessageSquareText,
  Mic,
  MoreVertical,
  PencilLine,
  Pin,
  Plus,
  Paperclip,
  Phone,
  Search,
  Send,
  Square,
  Tag,
  Trash2,
  X,
  Check,
  CheckCheck,
  UserRound,
  MailPlus,
  Folder,
  Ban,
  FileText,
  Download,
  CircleDot,
} from "lucide-react";

import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Textarea } from "@/shared/ui/textarea";
import { getActiveInstanceId } from "@/shared/stores/instanceStore";
import { getSkoolSession } from "@/shared/stores/skoolSessionStore";
import { getStoredUser } from "@/shared/stores/userStore";
import { setInboxUnread } from "@/shared/stores/inboxUnreadStore";
import {
  skoolGetMessages,
  skoolDisplayName,
  skoolGetUser,
  skoolInferMyUserId,
  skoolListChannels,
  skoolMarkRead,
  skoolSendMessage,
  type SkoolChatChannel,
} from "@/features/conversations/lib/skool-chat";

type AuthUser = { email?: string; user_metadata?: { name?: string } };

function displayName(user: AuthUser | null) {
  return user?.user_metadata?.name || user?.email || "";
}

type ConversationStatus = "open" | "attention" | "resolved";

type Conversation = {
  id: string;
  name: string;
  handle: string;
  lastMessage: string;
  lastAt: number;
  unread: number;
  status: ConversationStatus;
  tags: string[];
  avatarUrl: string;
  online: boolean;
};

type InboxState = {
  conversations: Conversation[];
  selectedId: string | null;
};

const STORAGE_KEY = "nexus_demo_inbox_v1";
const MESSAGES_KEY = "nexus_demo_messages_v1";
const TAGS_KEY = "nexus_demo_tags_v1";
const PINS_KEY = "nexus_demo_pins_v1";

type TagColor = "orange" | "pink" | "yellow" | "green" | "purple" | "blue" | "red" | "slate";

type TagItem = {
  id: string;
  name: string;
  color: TagColor;
};

type Delivery = "sent" | "delivered" | "read";

type Attachment = {
  kind: "image" | "file" | "audio";
  name: string;
  size: number;
  mime: string;
  dataUrl?: string;
};

type Message = {
  id: string;
  conversationId: string;
  role: "member" | "nexus";
  text: string;
  at: number;
  delivery?: Delivery;
  attachment?: Attachment;
  replyToId?: string;
};

type FiltersState = {
  unreadOnly: boolean;
  tags: string[];
};

const DEFAULT_FILTERS: FiltersState = {
  unreadOnly: false,
  tags: [],
};

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "now";
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatBytes(bytes: number) {
  const b = Math.max(0, bytes);
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(fixed)} ${units[i]}`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const same =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (same) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function seedFromEmail(email: string) {
  let s = 0;
  for (let i = 0; i < email.length; i++) s = (s + email.charCodeAt(i) * (i + 1)) % 100000;
  return s;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]) {
  return arr[Math.floor(rng() * arr.length)];
}

function makeHandle(name: string) {
  return (
    "@" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 18)
  );
}

function avatarUrlFromSeed(seed: number, name: string) {
  const safeName = encodeURIComponent(name || "Nexus");
  return `/api/unsplash/avatar/${seed}/${safeName}`;
}

function tagColorClasses(color: TagColor) {
  if (color === "orange") return { chip: "bg-orange-500 text-white", dot: "bg-orange-500" };
  if (color === "pink") return { chip: "bg-pink-500 text-white", dot: "bg-pink-500" };
  if (color === "yellow") return { chip: "bg-yellow-500 text-white", dot: "bg-yellow-500" };
  if (color === "green") return { chip: "bg-emerald-600 text-white", dot: "bg-emerald-600" };
  if (color === "purple") return { chip: "bg-purple-600 text-white", dot: "bg-purple-600" };
  if (color === "blue") return { chip: "bg-blue-600 text-white", dot: "bg-blue-600" };
  if (color === "red") return { chip: "bg-red-600 text-white", dot: "bg-red-600" };
  return { chip: "bg-zinc-700 text-white", dot: "bg-zinc-700" };
}

function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 28);
}

function tagIdFromName(name: string) {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return n || `tag_${Date.now()}`;
}

function pickTagColor(seed: number): TagColor {
  const colors: TagColor[] = ["orange", "pink", "yellow", "green", "purple", "blue", "red", "slate"];
  return colors[Math.abs(seed) % colors.length];
}

function migrateInboxState(input: InboxState, seed: number): InboxState {
  const conversations = (input.conversations ?? []).map((c, idx) => {
    const avatarUrl =
      typeof (c as Record<string, unknown>).avatarUrl === "string"
        ? String((c as Record<string, unknown>).avatarUrl).trim()
        : "";
    const hasQuery = avatarUrl.includes("?seed=") || avatarUrl.includes("/api/unsplash/avatar?");
    const online =
      typeof (c as Record<string, unknown>).online === "boolean"
        ? Boolean((c as Record<string, unknown>).online)
        : (seed + idx) % 3 !== 0;
    return {
      ...c,
      avatarUrl: !avatarUrl || hasQuery ? avatarUrlFromSeed(seed + idx + 1, c.name) : avatarUrl,
      online,
    };
  });

  const selectedId =
    input.selectedId && conversations.some((c) => c.id === input.selectedId)
      ? input.selectedId
      : conversations[0]?.id ?? null;

  return { conversations, selectedId };
}

function buildConversations(seed: number): Conversation[] {
  const rng = mulberry32(seed);
  const names = [
    "Edgar Cardoso",
    "Sofia Martins",
    "Duarte Silva",
    "Inês Rocha",
    "Marta Lopes",
    "Tiago Ferreira",
    "Bruno Costa",
    "Carla Santos",
    "Rita Almeida",
    "João Pereira",
    "Ana Ribeiro",
    "Diogo Fernandes",
    "Beatriz Oliveira",
    "Nuno Carvalho",
    "Mariana Sousa",
    "Pedro Gomes",
    "Catarina Pinto",
  ];

  const snippets = [
    "Can we automate this workflow for new members?",
    "I’m getting an error when I try to join the event.",
    "Thanks! That solved it.",
    "We should escalate this conversation to a human.",
    "Any updates on the integration?",
    "Can you share the steps you took?",
    "This looks suspicious, can you check?",
    "I need help updating my profile details.",
    "Where can I find the onboarding guide?",
    "The message template is not applying correctly.",
    "Can we tag this as VIP?",
  ];

  const now = Date.now();
  const result: Conversation[] = [];
  const count = 14;

  for (let i = 0; i < count; i++) {
    const name = pick(rng, names);
    const statusRoll = rng();
    const status: ConversationStatus =
      statusRoll < 0.18 ? "attention" : statusRoll < 0.88 ? "open" : "resolved";
    const unread = status === "resolved" ? 0 : Math.floor(rng() * 5);
    const tags: Conversation["tags"] = [];
    if (rng() < 0.24) tags.push("Automated");
    if (rng() < 0.14) tags.push("Escalated");
    if (rng() < 0.1) tags.push("VIP");

    const lastAt = now - Math.floor(rng() * 1000 * 60 * 60 * 36);

    result.push({
      id: `c_${seed}_${i}`,
      name,
      handle: makeHandle(name),
      lastMessage: pick(rng, snippets),
      lastAt,
      unread,
      status,
      tags,
      avatarUrl: avatarUrlFromSeed(seed + i + 1, name),
      online: rng() < 0.55 && status !== "resolved",
    });
  }

  return result.sort((a, b) => b.lastAt - a.lastAt);
}

function statusBadgeVariant(status: ConversationStatus) {
  if (status === "attention") return "amber";
  if (status === "resolved") return "green";
  return "blue";
}

function statusLabel(status: ConversationStatus) {
  if (status === "attention") return "Needs attention";
  if (status === "resolved") return "Resolved";
  return "Open";
}

function tagVariant(tag: Conversation["tags"][number]) {
  if (tag === "Escalated") return "red";
  if (tag === "VIP") return "blue";
  return "default";
}

function buildInitialMessages(conversation: Conversation): Message[] {
  const base = conversation.lastAt;
  return [
    {
      id: `${conversation.id}_m1`,
      conversationId: conversation.id,
      role: "member",
      text: conversation.lastMessage,
      at: base,
    },
    {
      id: `${conversation.id}_m2`,
      conversationId: conversation.id,
      role: "nexus",
      text: "Got it — I’m checking this now. One moment.",
      at: base + 1000 * 60 * 2,
      delivery: "read",
    },
    {
      id: `${conversation.id}_m3`,
      conversationId: conversation.id,
      role: "member",
      text: "Perfect. Thank you.",
      at: base + 1000 * 60 * 6,
    },
  ];
}

export default function InboxPage() {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const tagsRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const createTagRef = useRef<HTMLDivElement | null>(null);
  const createTagNameRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pinnedRef = useRef<HTMLDivElement | null>(null);
  const activeInstanceId = getActiveInstanceId();
  const skoolSession = activeInstanceId ? getSkoolSession(activeInstanceId) : null;
  const skoolConnector = useMemo(() => {
    if (!skoolSession?.encryptedCookie) return null;
    return { encryptedCookie: skoolSession.encryptedCookie, apiBaseUrl: skoolSession.apiBaseUrl };
  }, [skoolSession?.encryptedCookie, skoolSession?.apiBaseUrl]);
  const isSkoolMode = Boolean(skoolConnector);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<InboxState>({ conversations: [], selectedId: null });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationStatus | "all">("all");
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
  const [tagMenuForId, setTagMenuForId] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tags, setTags] = useState<TagItem[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [composer, setComposer] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});

  const quickRepliesRef = useRef<HTMLDivElement | null>(null);
  const templatesRef = useRef<HTMLDivElement | null>(null);
  const shortcutsRef = useRef<HTMLDivElement | null>(null);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<TagColor>("blue");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [pinnedByConversation, setPinnedByConversation] = useState<Record<string, string[]>>({});
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const skoolChannelsQuery = useQuery({
    queryKey: ["skool", "chat-channels", activeInstanceId, skoolConnector?.encryptedCookie],
    enabled: Boolean(skoolConnector),
    refetchInterval: isSkoolMode ? 15_000 : false,
    queryFn: async () => {
      if (!skoolConnector) return [];
      return await skoolListChannels(skoolConnector);
    },
  });

  const selectedSkoolChannel = useMemo(() => {
    const channels = skoolChannelsQuery.data ?? [];
    if (!channels.length) return null;
    const id = state.selectedId ?? channels[0]?.id ?? null;
    return channels.find((c) => c.id === id) ?? channels[0] ?? null;
  }, [skoolChannelsQuery.data, state.selectedId]);

  const skoolMessagesQuery = useQuery({
    queryKey: ["skool", "chat-messages", activeInstanceId, skoolConnector?.encryptedCookie, selectedSkoolChannel?.id],
    enabled: Boolean(
      skoolConnector &&
        selectedSkoolChannel?.id &&
        (selectedSkoolChannel?.last_message_id || selectedSkoolChannel?.metadata?.last_read)
    ),
    refetchInterval: isSkoolMode && selectedSkoolChannel?.id ? 15_000 : false,
    queryFn: async () => {
      if (!skoolConnector || !selectedSkoolChannel) return { messages: [] as any[] };
      const anchor = selectedSkoolChannel.last_message_id || selectedSkoolChannel.metadata?.last_read;
      if (!anchor) return { messages: [] as any[] };
      return await skoolGetMessages(skoolConnector, selectedSkoolChannel.id, anchor, { before: 50, after: 50 });
    },
  });

  const skoolLoadingList = isSkoolMode && skoolChannelsQuery.isLoading;
  const skoolLoadingMessages = isSkoolMode && skoolMessagesQuery.isLoading;
  const operator = useMemo(() => getStoredUser(), []);
  const skoolMeQuery = useQuery({
    queryKey: ["skool", "me", activeInstanceId, skoolConnector?.encryptedCookie, selectedSkoolChannel?.id],
    enabled: Boolean(skoolConnector && selectedSkoolChannel?.id),
    queryFn: async () => {
      if (!skoolConnector || !selectedSkoolChannel) return null;
      const myId = skoolInferMyUserId(selectedSkoolChannel);
      if (!myId) return null;
      return await skoolGetUser(skoolConnector, myId);
    },
    staleTime: 5 * 60_000,
  });

  const operatorName =
    (skoolMeQuery.data
      ? `${(skoolMeQuery.data.first_name ?? "").trim()} ${(skoolMeQuery.data.last_name ?? "").trim()}`.trim() ||
        skoolMeQuery.data.name
      : null) ||
    operator?.name ||
    displayName(user) ||
    "Nexus";

  const operatorAvatarUrl =
    skoolMeQuery.data?.metadata?.picture_profile ||
    operator?.pictureUrl ||
    operator?.photoDataUrl ||
    "";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user: AuthUser | null }) => {
        queueMicrotask(() => setUser(data.user));
      })
      .catch(() => {
        // ignore
      });

    const seed = seedFromEmail("nexus");
    const storedTags = safeParse<TagItem[]>(localStorage.getItem(TAGS_KEY));
    if (storedTags?.length) {
      setTags(storedTags);
    } else {
      const seeded: TagItem[] = [
        { id: "old-active-member", name: "Old-Active Member", color: "pink" },
        { id: "new-tag", name: "New Tag", color: "orange" },
        { id: "new-member", name: "New Member", color: "yellow" },
        { id: "question-asked", name: "Question-Asked", color: "green" },
        { id: "call-required", name: "Call-Required", color: "purple" },
        { id: "potential-lead", name: "Potential Lead", color: "yellow" },
        { id: "account-suspended", name: "Account Suspended", color: "blue" },
        { id: "not-active", name: "Not active", color: "green" },
        { id: "active-member", name: "Active Member", color: "blue" },
        { id: "automated", name: "Automated", color: "slate" },
        { id: "escalated", name: "Escalated", color: "red" },
        { id: "vip", name: "VIP", color: "purple" },
      ];
      localStorage.setItem(TAGS_KEY, JSON.stringify(seeded));
      setTags(seeded);
    }

    if (isSkoolMode) {
      setState({ conversations: [], selectedId: null });
      setMessagesMap({});
      // We keep tags/pins local (CRM behavior), but we don't seed demo conversations/messages.
      const storedPins = safeParse<Record<string, string[]>>(localStorage.getItem(PINS_KEY));
      setPinnedByConversation(storedPins ?? {});
      return;
    }

    const saved = safeParse<InboxState>(localStorage.getItem(STORAGE_KEY));
    if (saved?.conversations?.length) {
      const migrated = migrateInboxState(saved, seed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      setState(migrated);
    } else {
      const conversations = buildConversations(seed);
      const next: InboxState = { conversations, selectedId: conversations[0]?.id ?? null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
    }

    const storedMessages = safeParse<Record<string, Message[]>>(localStorage.getItem(MESSAGES_KEY));
    setMessagesMap(storedMessages ?? {});

    const storedPins = safeParse<Record<string, string[]>>(localStorage.getItem(PINS_KEY));
    setPinnedByConversation(storedPins ?? {});
  }, [isSkoolMode]);

  useEffect(() => {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }, [tags]);

  useEffect(() => {
    if (!state.conversations.length) return;
    if (isSkoolMode) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (isSkoolMode) return;
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messagesMap));
  }, [messagesMap]);

  useEffect(() => {
    localStorage.setItem(PINS_KEY, JSON.stringify(pinnedByConversation));
  }, [pinnedByConversation]);

  useEffect(() => {
    // Global unread dot (sidebar): keep it in sync for both demo + Skool modes.
    const total = state.conversations.reduce((acc, c) => acc + (c.unread > 0 ? c.unread : 0), 0);
    setInboxUnread(total);
  }, [state.conversations]);

  useEffect(() => {
    if (!isSkoolMode) return;
    const channels = skoolChannelsQuery.data ?? [];
    const mapped = channels.map((c: SkoolChatChannel) => {
      const name = skoolDisplayName(c);
      const lastMessage = c.last_message?.metadata?.content ?? "";
      const lastAtRaw =
        (c.last_message_at ? Date.parse(c.last_message_at) : NaN) ||
        (c.last_message?.created_at ? Date.parse(c.last_message.created_at) : NaN);
      const lastAt = Number.isFinite(lastAtRaw) ? lastAtRaw : Date.now();
      const unread = Number(c.metadata?.num_unread ?? 0) || 0;
      const online = Boolean((c.user?.metadata?.online ?? 0) === 1);
      return {
        id: c.id,
        name,
        handle: makeHandle(name),
        lastMessage,
        lastAt,
        unread,
        status: "open" as ConversationStatus,
        tags: [],
        avatarUrl: c.user?.metadata?.picture_profile ?? avatarUrlFromSeed(seedFromEmail(c.id), name),
        online,
      } satisfies Conversation;
    });

    setState((prev) => {
      const selectedId =
        prev.selectedId && mapped.some((x) => x.id === prev.selectedId) ? prev.selectedId : mapped[0]?.id ?? null;
      return { conversations: mapped, selectedId };
    });
  }, [isSkoolMode, skoolChannelsQuery.data]);

  useEffect(() => {
    if (!isSkoolMode) return;
    if (!selectedSkoolChannel) return;
    const data = skoolMessagesQuery.data as any;
    const list = Array.isArray(data?.messages) ? (data.messages as any[]) : [];
    const myId = skoolInferMyUserId(selectedSkoolChannel);
    const mapped: Message[] = list
      .map((m: any) => {
        const ts = m?.created_at ? Date.parse(String(m.created_at)) : Date.now();
        const src = m?.metadata?.src ? String(m.metadata.src) : "";
        return {
          id: String(m.id ?? ""),
          conversationId: selectedSkoolChannel.id,
          role: myId && src === myId ? ("nexus" as const) : ("member" as const),
          text: String(m?.metadata?.content ?? ""),
          at: Number.isFinite(ts) ? ts : Date.now(),
          delivery: "delivered" as Delivery,
        } satisfies Message;
      })
      .filter((m) => Boolean(m.id));
    mapped.sort((a, b) => a.at - b.at);
    setMessagesMap((prev) => ({ ...prev, [selectedSkoolChannel.id]: mapped }));
  }, [isSkoolMode, selectedSkoolChannel?.id, skoolMessagesQuery.data]);

  useEffect(() => {
    if (!filtersMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = filtersRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setFiltersMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [filtersMenuOpen]);

  useEffect(() => {
    if (!tagMenuForId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTagMenuForId(null);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-tag-menu-root]")) return;
      setTagMenuForId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [tagMenuForId]);

  useEffect(() => {
    if (!tagsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTagsOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = tagsRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setTagsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [tagsOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = moreRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!quickRepliesOpen && !templatesOpen && !shortcutsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQuickRepliesOpen(false);
        setTemplatesOpen(false);
        setShortcutsOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (quickRepliesRef.current && quickRepliesRef.current.contains(t)) return;
      if (templatesRef.current && templatesRef.current.contains(t)) return;
      if (shortcutsRef.current && shortcutsRef.current.contains(t)) return;
      setQuickRepliesOpen(false);
      setTemplatesOpen(false);
      setShortcutsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [quickRepliesOpen, templatesOpen, shortcutsOpen]);

  useEffect(() => {
    if (!createTagOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateTagOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = createTagRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setCreateTagOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    window.setTimeout(() => createTagNameRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [createTagOpen]);

  useEffect(() => {
    if (!pinnedOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = pinnedRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setPinnedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [pinnedOpen]);

  const selected = useMemo(
    () => state.conversations.find((c) => c.id === state.selectedId) ?? null,
    [state.conversations, state.selectedId]
  );

  const selectedMessages = useMemo(() => {
    if (!selected) return [];
    return messagesMap[selected.id] ?? buildInitialMessages(selected);
  }, [messagesMap, selected]);

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of selectedMessages) map.set(m.id, m);
    return map;
  }, [selectedMessages]);

  const pinnedIds = useMemo(() => {
    if (!selected) return [];
    return pinnedByConversation[selected.id] ?? [];
  }, [pinnedByConversation, selected?.id]);

  const pinnedMessages = useMemo(() => {
    return pinnedIds.map((id) => messageById.get(id)).filter(Boolean) as Message[];
  }, [messageById, pinnedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.conversations.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (filters.unreadOnly && c.unread <= 0) return false;
      if (filters.tags.length > 0) {
        const hasAny = filters.tags.some((t) => c.tags.includes(t));
        if (!hasAny) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [state.conversations, query, filter, filters]);

  const counts = useMemo(() => {
    const base = { all: 0, open: 0, attention: 0, resolved: 0 };
    for (const c of state.conversations) {
      base.all++;
      base[c.status]++;
    }
    return base;
  }, [state.conversations]);

  const selectConversation = (id: string) => {
    setState((prev) => {
      const next = prev.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c));
      return { ...prev, conversations: next, selectedId: id };
    });
    if (isSkoolMode && skoolConnector) {
      const channel = (skoolChannelsQuery.data ?? []).find((c) => c.id === id) ?? null;
      const anchor = channel?.last_message_id || channel?.metadata?.last_read || null;
      if (anchor) {
        void skoolMarkRead(skoolConnector, id, anchor).then(
          () => void skoolChannelsQuery.refetch(),
          () => undefined
        );
      }
    }
  };

  const markResolved = (id: string) => {
    setState((prev) => {
      const next = prev.conversations.map((c) =>
        c.id === id ? { ...c, status: "resolved" as ConversationStatus, unread: 0 } : c
      );
      return { ...prev, conversations: next };
    });
  };

  const ease = useMemo(() => cubicBezier(0.22, 1, 0.36, 1), []);

  const ensureThread = (conv: Conversation) => {
    setMessagesMap((prev) => {
      if (prev[conv.id]?.length) return prev;
      const next = { ...prev, [conv.id]: buildInitialMessages(conv) };
      return next;
    });
  };

  useEffect(() => {
    if (!selected) return;
    ensureThread(selected);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!selected.online) return;
    setMessagesMap((prev) => {
      const thread = prev[selected.id] ?? buildInitialMessages(selected);
      const updated = thread.map((m) =>
        m.role === "nexus" ? { ...m, delivery: "read" as Delivery } : m
      );
      return { ...prev, [selected.id]: updated };
    });
  }, [selected?.id]);

  const toggleConversationTag = (conversationId: string, tag: string) => {
    setState((prev) => {
      const conversations = prev.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const has = c.tags.includes(tag);
        const tags = has ? c.tags.filter((t) => t !== tag) : [...c.tags, tag];
        return { ...c, tags };
      });
      return { ...prev, conversations };
    });
  };

  const ensureTag = (name: string, opts?: { color?: TagColor }) => {
    const clean = normalizeTagName(name);
    if (!clean) return null;
    const existing = tags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    const seed = seedFromEmail(`${user?.email ?? "nexus"}:${clean}`);
    const item: TagItem = { id: tagIdFromName(clean), name: clean, color: opts?.color ?? pickTagColor(seed) };
    setTags((prev) => [item, ...prev]);
    return item;
  };

  const getTagItem = (name: string) => {
    return tags.find((t) => t.name === name) ?? tags.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;
  };

  const sendMessage = () => {
    if (!selected) return;
    if (isSending) return;
    const text = composer.trim();
    const attachment = pendingAttachment;
    if (!text && !attachment) return;
    if (isSkoolMode) {
      if (!skoolConnector) {
        toast.error("Skool session not found. Reconnect the instance.");
        return;
      }
      if (attachment) {
        toast.error("Attachments aren’t supported for Skool yet. Send text only.");
        return;
      }
      const channelId = selected.id;
      const optimisticId = `skool_local_${Date.now()}`;
      const now = Date.now();
      const optimistic: Message = {
        id: optimisticId,
        conversationId: channelId,
        role: "nexus",
        text,
        at: now,
        delivery: "sent",
      };

      setComposer("");
      setPendingAttachment(null);
      setReplyToId(null);
      setIsSending(true);

      // Optimistic UI: append immediately (no loading flicker).
      setMessagesMap((prev) => {
        const thread = prev[channelId] ?? [];
        return { ...prev, [channelId]: [...thread, optimistic] };
      });
      setState((prev) => {
        const conversations = prev.conversations.map((c) =>
          c.id === channelId ? { ...c, lastMessage: text, lastAt: now, unread: 0 } : c
        );
        return { ...prev, conversations };
      });

      void (async () => {
        try {
          const created = await skoolSendMessage(skoolConnector, channelId, text);
          // Replace temp id with the real id (best-effort).
          setMessagesMap((prev) => {
            const thread = prev[channelId] ?? [];
            const next = thread.map((m) =>
              m.id === optimisticId ? { ...m, id: created.id, delivery: "delivered" as Delivery } : m
            );
            return { ...prev, [channelId]: next };
          });
          // Silent refresh (UI keeps previous data; no skeleton on fetching).
          void skoolChannelsQuery.refetch();
          void skoolMessagesQuery.refetch();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to send message.");
          // Rollback optimistic message.
          setMessagesMap((prev) => {
            const thread = prev[channelId] ?? [];
            return { ...prev, [channelId]: thread.filter((m) => m.id !== optimisticId) };
          });
          setComposer(text);
        } finally {
          setIsSending(false);
        }
      })();
      return;
    }
    const now = Date.now();
    const msg: Message = {
      id: `${selected.id}_${now}`,
      conversationId: selected.id,
      role: "nexus",
      text,
      at: now,
      delivery: "sent",
      attachment: attachment ?? undefined,
      replyToId: replyToId ?? undefined,
    };

    setComposer("");
    setPendingAttachment(null);
    setReplyToId(null);

    setMessagesMap((prev) => {
      const thread = prev[selected.id] ?? buildInitialMessages(selected);
      return { ...prev, [selected.id]: [...thread, msg] };
    });

    setState((prev) => {
      const lastMessage =
        text ||
        (attachment?.kind === "image"
          ? "Sent an image"
          : attachment
          ? "Sent a file"
          : "");
      const conversations = prev.conversations.map((c) =>
        c.id === selected.id
          ? {
              ...c,
              lastMessage,
              lastAt: now,
              unread: 0,
              status: c.status === "resolved" ? "open" : c.status,
            }
          : c
      );
      return { ...prev, conversations };
    });

    window.setTimeout(() => {
      setMessagesMap((prev) => {
        const thread = prev[selected.id];
        if (!thread) return prev;
        const next = thread.map((m) =>
          m.id === msg.id ? { ...m, delivery: "delivered" as Delivery } : m
        );
        return { ...prev, [selected.id]: next };
      });
    }, 450);

    window.setTimeout(() => {
      setMessagesMap((prev) => {
        const thread = prev[selected.id];
        if (!thread) return prev;
        if (!selected.online) return prev;
        const next = thread.map((m) => (m.id === msg.id ? { ...m, delivery: "read" as Delivery } : m));
        return { ...prev, [selected.id]: next };
      });
    }, 1200);
  };

  const insertToComposer = (text: string, mode: "replace" | "append" = "replace") => {
    const v = text ?? "";
    setComposer((prev) => {
      const next = mode === "append" && prev.trim().length ? `${prev.trimEnd()}\n${v}` : v;
      return next;
    });
    queueMicrotask(() => composerRef.current?.focus());
  };

  const startReply = (messageId: string) => {
    if (!selected) return;
    setReplyToId(messageId);
    queueMicrotask(() => composerRef.current?.focus());
  };

  const startEdit = (m: Message) => {
    if (isSkoolMode) {
      toast.error("Editing messages isn’t supported for Skool.");
      return;
    }
    if (m.role !== "nexus") {
      toast.error("Only Nexus messages can be edited.");
      return;
    }
    setEditingId(m.id);
    setEditDraft(m.text ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = (messageId: string) => {
    if (!selected) return;
    const nextText = editDraft.trim();
    if (!nextText) {
      toast.error("Message cannot be empty.");
      return;
    }

    setMessagesMap((prev) => {
      const thread = prev[selected.id] ?? buildInitialMessages(selected);
      const next = thread.map((m) => (m.id === messageId ? { ...m, text: nextText } : m));
      return { ...prev, [selected.id]: next };
    });

    // No toast: result is visible inline.
    cancelEdit();
  };

  const deleteMessage = (messageId: string) => {
    if (!selected) return;
    if (isSkoolMode) {
      toast.error("Deleting messages isn’t supported for Skool.");
      return;
    }
    setMessagesMap((prev) => {
      const thread = prev[selected.id] ?? buildInitialMessages(selected);
      const next = thread.filter((m) => m.id !== messageId);
      return { ...prev, [selected.id]: next };
    });
    setPinnedByConversation((prev) => {
      const list = prev[selected.id] ?? [];
      const next = list.filter((id) => id !== messageId);
      return { ...prev, [selected.id]: next };
    });
    if (replyToId === messageId) setReplyToId(null);
    if (editingId === messageId) cancelEdit();
    // No toast: result is visible in the thread.
  };

  const copyMessage = async (m: Message) => {
    const text = m.text?.trim();
    if (!text) {
      toast.error("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      // No toast: keep quiet to avoid noise.
    } catch {
      toast.error("Copy failed.");
    }
  };

  const togglePin = (messageId: string) => {
    if (!selected) return;
    setPinnedByConversation((prev) => {
      const list = prev[selected.id] ?? [];
      const has = list.includes(messageId);
      const next = has ? list.filter((id) => id !== messageId) : [messageId, ...list].slice(0, 25);
      return { ...prev, [selected.id]: next };
    });
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const replyTarget = useMemo(() => {
    if (!replyToId) return null;
    return messageById.get(replyToId) ?? null;
  }, [messageById, replyToId]);

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // ignore
    }
  };

  const cleanupRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
    setIsRecording(false);
    recorderRef.current = null;
    recordingChunksRef.current = [];
    const stream = recordingStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    recordingStreamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording isn’t supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];

      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        try {
          // We don't send audio files to Skool for now.
          // MVP: record locally, then insert a transcription placeholder into the composer.
          const seconds = recordingSeconds;
          const transcript = `Voice note (transcription): (demo) ${seconds}s recording.`;
          insertToComposer(transcript, "append");
        } catch {
          toast.error("Could not prepare the voice message.");
        } finally {
          cleanupRecording();
        }
      };

      rec.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => Math.min(300, s + 1));
      }, 1000);
      // No toast: UI/tooltip reflects recording state.
    } catch {
      toast.error("Microphone permission denied or unavailable.");
      cleanupRecording();
    }
  };

  const openCreateTag = (prefillName: string) => {
    const clean = normalizeTagName(prefillName);
    setCreateTagName(clean);
    const seed = seedFromEmail(`${user?.email ?? "nexus"}:${clean || "tag"}`);
    setCreateTagColor(pickTagColor(seed));
    setCreateTagOpen(true);
  };

  const confirmCreateTag = () => {
    if (!selected) {
      toast.error("Select a conversation first.");
      return;
    }
    const clean = normalizeTagName(createTagName);
    if (!clean) {
      toast.error("Please enter a tag name.");
      return;
    }
    const created = ensureTag(clean, { color: createTagColor });
    if (!created) return;
    toggleConversationTag(selected.id, created.name);
    setCreateTagOpen(false);
    // No toast: tag chip appears immediately.
  };

  const pushAutomationNote = (text: string) => {
    if (!selected) {
      toast.error("Select a conversation first.");
      return;
    }
    const now = Date.now();
    const msg: Message = {
      id: `${selected.id}_auto_${now}`,
      conversationId: selected.id,
      role: "nexus",
      text,
      at: now,
      delivery: "delivered",
    };
    setMessagesMap((prev) => {
      const thread = prev[selected.id] ?? buildInitialMessages(selected);
      return { ...prev, [selected.id]: [...thread, msg] };
    });
    setState((prev) => {
      const conversations = prev.conversations.map((c) =>
        c.id === selected.id ? { ...c, lastMessage: text, lastAt: now, unread: 0, status: c.status === "resolved" ? "open" : c.status } : c
      );
      return { ...prev, conversations };
    });
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 10);
  };

  const createConversation = () => {
    const name = newName.trim();
    const message = newMessage.trim();
    if (!name || !message) return;

    const now = Date.now();
    const id = `c_local_${now}`;
    const seed = seedFromEmail(`${user?.email ?? "nexus"}:${id}:${name}`);
    const nextConv: Conversation = {
      id,
      name,
      handle: makeHandle(name),
      lastMessage: message,
      lastAt: now,
      unread: 1,
      status: "open",
      tags: [],
      avatarUrl: avatarUrlFromSeed(seed, name),
      online: true,
    };

    setState((prev) => {
      const conversations = [nextConv, ...prev.conversations];
      return { ...prev, conversations, selectedId: nextConv.id };
    });
    setMessagesMap((prev) => {
      const first: Message = {
        id: `${id}_m1`,
        conversationId: id,
        role: "member",
        text: message,
        at: now,
      };
      const reply: Message = {
        id: `${id}_m2`,
        conversationId: id,
        role: "nexus",
        text: "Thanks — I’ll handle this and keep you updated.",
        at: now + 1000 * 35,
        delivery: "read",
      };
      return { ...prev, [id]: [first, reply] };
    });
    setNewName("");
    setNewMessage("");
    setNewOpen(false);
  };

  const container = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease, staggerChildren: 0.04 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
  };

  const activeFilterCount = useMemo(() => {
    return (filters.unreadOnly ? 1 : 0) + (filters.tags.length > 0 ? 1 : 0);
  }, [filters]);

  const unreadTotal = useMemo(() => {
    return state.conversations.reduce((acc, c) => acc + (c.unread > 0 ? c.unread : 0), 0);
  }, [state.conversations]);

  const renderedMessages = useMemo(() => {
    if (!selected) return [];
    const thread = selectedMessages.slice().sort((a, b) => a.at - b.at);
    const out: Array<{ kind: "day"; key: string; label: string } | { kind: "msg"; msg: Message }> = [];
    let lastDay = "";
    for (const m of thread) {
      const dk = dayKey(m.at);
      if (dk !== lastDay) {
        lastDay = dk;
        out.push({ kind: "day", key: dk, label: dayLabel(m.at) });
      }
      out.push({ kind: "msg", msg: m });
    }
    return out;
  }, [selected, selectedMessages]);

  const pickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const maxBytes = isImage ? 2_500_000 : 3_500_000;

    if (file.size > maxBytes) {
      toast.error(isImage ? "Image is too large for demo preview." : "File is too large for demo preview.");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      setPendingAttachment({
        kind: isImage ? "image" : "file",
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        dataUrl,
      });
    } catch {
      toast.error("Could not read the selected file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex h-[calc(100dvh-64px)] flex-col gap-4 overflow-hidden"
    >
      <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Inbox</h1>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-blue-600/10 px-3 py-1 text-xs font-extrabold text-blue-700">
                {unreadTotal} new
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            {displayName(user) ? `${displayName(user)},` : ""} prioritize the conversations that need a human touch.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[320px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search conversations..."
              className="pl-9"
            />
          </div>
                  <div ref={filtersRef} className="relative" aria-label="Filters menu">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setFiltersMenuOpen((v) => !v)}
              aria-expanded={filtersMenuOpen}
            >
              <Filter size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {filtersMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[320px] rounded-2xl border border-zinc-200 bg-white shadow-xl">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-900">Filters</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Refine what shows up in the list.</div>
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setFiltersMenuOpen(false)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <Separator />
                <div className="px-4 py-4 space-y-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Unread only</div>
                      <div className="mt-0.5 text-xs text-zinc-500">Show conversations that need attention.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.unreadOnly}
                      onChange={(e) => setFilters((p) => ({ ...p, unreadOnly: e.target.checked }))}
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </label>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="text-sm font-semibold text-zinc-900">Tags</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((t) => {
                        const on = filters.tags.includes(t.name);
                        const c = tagColorClasses(t.color);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setFilters((p) => ({
                                ...p,
                                tags: on ? p.tags.filter((x) => x !== t.name) : [...p.tags, t.name],
                              }))
                            }
                            className={cn(
                              "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                              on
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                  >
                    Reset
                  </Button>
                  <Button className="cursor-pointer" onClick={() => setFiltersMenuOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
          <Button className="cursor-pointer" onClick={() => setNewOpen(true)}>
            <MessageSquareText size={16} />
            New conversation
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="flex flex-wrap gap-2">
        {(
          [
            { key: "all" as const, label: "All", count: counts.all },
            { key: "open" as const, label: "Open", count: counts.open },
            { key: "attention" as const, label: "Needs attention", count: counts.attention },
            { key: "resolved" as const, label: "Resolved", count: counts.resolved },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === t.key
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                filter === t.key ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </motion.div>

      <motion.div variants={item} className="grid flex-1 min-h-0 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4 flex h-full min-h-0 flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Inbox size={16} className="text-zinc-900" />
                  Conversations
                </CardTitle>
                <CardDescription>Scroll here without moving the page.</CardDescription>
              </div>
              <Badge variant="default">{filtered.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <div className="h-full overflow-y-auto overscroll-contain">
              {isSkoolMode && skoolChannelsQuery.isError ? (
                <div className="px-5 pb-5">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-red-900">Could not load Skool channels</div>
                    <div className="mt-1 text-xs text-red-900/70">{String(skoolChannelsQuery.error?.message || "")}</div>
                  </div>
                </div>
              ) : skoolLoadingList ? (
                <div className="px-5 pb-5">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                    <div className="text-sm font-semibold text-zinc-900">Loading conversations…</div>
                    <div className="mt-4 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-xl bg-zinc-100 animate-pulse" />
                          <div className="min-w-0 flex-1">
                            <div className="h-4 w-40 rounded bg-zinc-100 animate-pulse" />
                            <div className="mt-2 h-3 w-24 rounded bg-zinc-100 animate-pulse" />
                            <div className="mt-3 h-4 w-full rounded bg-zinc-100 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 pb-5">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-zinc-900">No matches</div>
                    <div className="mt-1 text-xs text-zinc-500">Try a different search or filter.</div>
                  </div>
                </div>
              ) : (
                filtered.map((c, idx) => {
                  const isActive = c.id === state.selectedId;
                  const tagCount = c.tags.length;
                  return (
                    <motion.div
                      key={c.id}
                      onClick={() => selectConversation(c.id)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 + idx * 0.02, duration: 0.25 }}
                      className={cn(
                        "w-full cursor-pointer text-left px-5 py-4 transition-colors",
                        isActive ? "bg-blue-50/60" : "hover:bg-zinc-50"
                      )}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectConversation(c.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5">
                            <Avatar name={c.name} src={c.avatarUrl} online={c.online} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold text-zinc-900">
                                {c.name}
                              </div>
                              {c.unread > 0 && (
                                <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                  {c.unread}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-zinc-500">{c.handle}</div>
                            <div className="mt-2 truncate text-sm text-zinc-700">{c.lastMessage}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant={statusBadgeVariant(c.status)}>{statusLabel(c.status)}</Badge>

                              <div data-tag-menu-root className="relative">
                                <button
                                  type="button"
                                  className={cn(
                                    "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                    "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTagMenuForId((v) => (v === c.id ? null : c.id));
                                  }}
                                  aria-label="Tags"
                                >
                                  <Tag size={14} />
                                  {tagCount > 0 && (
                                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                                      {tagCount}
                                    </span>
                                  )}
                                </button>

                                {tagMenuForId === c.id && (
                                  <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[220px] rounded-2xl border border-zinc-200 bg-white shadow-xl">
                                    <div className="px-3 py-3">
                                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                                        Tags
                                      </div>
                                      <div className="mt-3 space-y-1.5">
                                        {(["Automated", "Escalated", "VIP"] as const).map((t) => {
                                          const on = c.tags.includes(t);
                                          return (
                                            <button
                                              key={t}
                                              type="button"
                                              className={cn(
                                                "cursor-pointer flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                                                on
                                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                              )}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleConversationTag(c.id, t);
                                              }}
                                            >
                                              <span className="flex items-center gap-2">
                                                <span
                                                  className={cn(
                                                    "h-2.5 w-2.5 rounded-full",
                                                    t === "Escalated"
                                                      ? "bg-red-500"
                                                      : t === "VIP"
                                                      ? "bg-blue-600"
                                                      : "bg-zinc-400"
                                                  )}
                                                />
                                                {t}
                                              </span>
                                              {on && <CheckCircle2 size={16} className="text-blue-700" />}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-zinc-500">
                          {timeAgo(c.lastAt)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 flex h-full min-h-0 flex-col overflow-visible">
          <CardHeader className="shrink-0 border-b border-zinc-200/70">
            {!selected ? (
              <div>
                <CardTitle>Conversation</CardTitle>
                <CardDescription>Select a thread on the left to start.</CardDescription>
              </div>
            ) : (
                <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={selected.name} src={selected.avatarUrl} online={selected.online} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-lg font-extrabold text-zinc-900">{selected.name}</div>
                      <Badge variant={statusBadgeVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">{selected.online ? "Online" : "Offline"}</div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {selected.tags.map((t) => {
                          const item = getTagItem(t);
                          const c = tagColorClasses(item?.color ?? "slate");
                          return (
                            <span
                              key={t}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold shadow-sm",
                                c.chip
                              )}
                              title={t}
                            >
                              <span className={cn("h-2.5 w-2.5 rounded-full bg-white/30")} />
                              <span className="truncate max-w-[180px]">{t}</span>
                            </span>
                          );
                        })}

                        <div ref={tagsRef} className="relative">
                          <button
                            type="button"
                            className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50"
                            aria-label="Add tag"
                            aria-expanded={tagsOpen}
                            onClick={() => {
                              setTagsOpen((v) => !v);
                              setTagQuery("");
                            }}
                          >
                            <Plus size={16} />
                          </button>

                          {tagsOpen && (
                            <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[320px] rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                              <div className="p-3">
                                <Input
                                  value={tagQuery}
                                  onChange={(e) => setTagQuery(e.target.value)}
                                  placeholder="Search or create tag..."
                                />
                              </div>
                              <Separator />
                              <div className="max-h-[320px] overflow-y-auto p-2">
                                {(() => {
                                  const q = tagQuery.trim().toLowerCase();
                                  const list = q
                                    ? tags.filter((t) => t.name.toLowerCase().includes(q))
                                    : tags;

                                  const exact = q
                                    ? tags.some((t) => t.name.toLowerCase() === q)
                                    : true;

                                  const items: Array<
                                    | { kind: "create"; name: string }
                                    | { kind: "tag"; tag: TagItem }
                                  > = [];

                                  if (q && !exact) items.push({ kind: "create", name: normalizeTagName(tagQuery) });
                                  for (const t of list) items.push({ kind: "tag", tag: t });

                                  if (!items.length) {
                                    return (
                                      <div className="px-3 py-6 text-center">
                                        <div className="text-sm font-semibold text-zinc-900">No results</div>
                                        <div className="mt-1 text-xs text-zinc-500">Try a different query.</div>
                                      </div>
                                    );
                                  }

                                  return items.map((it) => {
                                    if (it.kind === "create") {
                                      const name = it.name;
                                      if (!name) return null;
                                      return (
                                        <button
                                          key={`create:${name}`}
                                          type="button"
                                          className="cursor-pointer flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                                          onClick={() => {
                                            setTagsOpen(false);
                                            openCreateTag(name);
                                          }}
                                        >
                                          <span className="flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-200 bg-white">
                                              <Plus size={14} />
                                            </span>
                                            Create “{name}”
                                          </span>
                                        </button>
                                      );
                                    }

                                    const t = it.tag;
                                    const on = selected.tags.includes(t.name);
                                    const c = tagColorClasses(t.color);
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        className="cursor-pointer flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                                        onClick={() => toggleConversationTag(selected.id, t.name)}
                                      >
                                        <span className="flex min-w-0 items-center gap-3">
                                          <span className={cn("h-3.5 w-3.5 rounded-full", c.dot)} />
                                          <span className="truncate text-sm font-semibold text-zinc-900">{t.name}</span>
                                        </span>
                                        {on && <Check size={16} className="text-zinc-900" />}
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                  <button
                    type="button"
                          disabled
                          className="cursor-not-allowed rounded-xl border border-zinc-200 bg-white p-2 text-zinc-400 opacity-70"
                          aria-label="Call (not available)"
                  >
                    <Phone size={16} />
                  </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="center">
                        Calls aren’t integrated yet.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div ref={moreRef} className="relative">
                    <button
                      type="button"
                      className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                      aria-label="More"
                      aria-expanded={moreOpen}
                      onClick={() => {
                        setMoreOpen((v) => !v);
                        setMoveOpen(false);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {moreOpen && (
                      <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[240px] rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                        <div className="p-2">
                          <button
                            type="button"
                            className="cursor-pointer flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setMoreOpen(false);
                              toast.info("Profile view isn’t available yet.");
                            }}
                          >
                            <UserRound size={16} className="text-zinc-700" />
                            View Profile
                          </button>

                          <button
                            type="button"
                            className="cursor-pointer flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setState((prev) => {
                                const conversations = prev.conversations.map((c) =>
                                  c.id === selected.id ? { ...c, unread: Math.max(1, c.unread || 0) } : c
                                );
                                return { ...prev, conversations };
                              });
                              setMoreOpen(false);
                            }}
                          >
                            <MailPlus size={16} className="text-zinc-700" />
                            Mark as unread
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              className="cursor-pointer flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => setMoveOpen((v) => !v)}
                            >
                              <span className="flex items-center gap-3">
                                <Folder size={16} className="text-zinc-700" />
                                Move to folder
                              </span>
                              <ChevronRight size={16} className="text-zinc-500" />
                            </button>

                            {moveOpen && (
                              <div className="absolute right-[calc(100%+10px)] top-0 z-50 w-[200px] rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                                <div className="p-2">
                                  {["Inbox", "Archive", "Spam"].map((folder) => (
                                    <button
                                      key={folder}
                                      type="button"
                                      className="cursor-pointer flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                                      onClick={() => {
                                        setMoveOpen(false);
                                        setMoreOpen(false);
                                        // No toast: keep quiet to avoid noise.
                                      }}
                                    >
                                      <span>{folder}</span>
                                      <CircleDot size={14} className="text-zinc-400" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <Separator className="my-2" />

                          <button
                            type="button"
                            className="cursor-pointer flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setState((prev) => {
                                const conversations = prev.conversations.filter((c) => c.id !== selected.id);
                                const selectedId =
                                  prev.selectedId === selected.id ? conversations[0]?.id ?? null : prev.selectedId;
                                return { ...prev, conversations, selectedId };
                              });
                              setMoreOpen(false);
                              toast.info("User blocked.");
                            }}
                          >
                            <Ban size={16} className="text-red-600" />
                            Block user
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-1 min-h-0 p-0">
            {!selected ? (
              <div className="flex h-full items-center justify-center px-5">
                <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center">
                  <div className="text-sm font-semibold text-zinc-900">Select a conversation</div>
                  <div className="mt-1 text-xs text-zinc-500">Pick a thread from the list to start replying.</div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                {pinnedIds.length > 0 && (
                  <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
                        <Pin size={14} className="text-zinc-700" />
                        {pinnedIds.length} pinned
                      </div>
                      <div ref={pinnedRef} className="relative">
                        <button
                          type="button"
                          className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => setPinnedOpen((v) => !v)}
                          aria-expanded={pinnedOpen}
                        >
                          View
                        </button>
                        {pinnedOpen && (
                          <div className="absolute right-0 bottom-full mb-2.5 z-50 w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                            <div className="px-4 py-3">
                              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pinned messages</div>
                              <div className="mt-1 text-xs text-zinc-500">Click one to jump.</div>
                            </div>
                            <Separator />
                            <div className="max-h-[260px] overflow-y-auto p-2">
                              {pinnedMessages.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  className="cursor-pointer flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                                  onClick={() => {
                                    setPinnedOpen(false);
                                    scrollToMessage(m.id);
                                  }}
                                >
                                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700">
                                    <Pin size={14} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-zinc-900">
                                      {m.text || (m.attachment ? m.attachment.name : "Message")}
                                    </span>
                                    <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                                      {m.role === "nexus" ? "Nexus" : "Member"}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#F7F8FA] px-5 py-5 space-y-3">
                  {isSkoolMode && skoolMessagesQuery.isError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                      <div className="text-sm font-semibold text-red-900">Could not load messages</div>
                      <div className="mt-1 text-xs font-semibold text-red-900/70">
                        {String(skoolMessagesQuery.error?.message || "")}
                      </div>
                    </div>
                  ) : skoolLoadingMessages ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                          <div
                            className={cn(
                              "rounded-2xl bg-white border border-zinc-200 px-4 py-3 shadow-sm",
                              i % 2 === 0 ? "w-[72%]" : "w-[62%]"
                            )}
                          >
                            <div className="h-4 w-[80%] rounded bg-zinc-100 animate-pulse" />
                            <div className="mt-2 h-4 w-[55%] rounded bg-zinc-100 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderedMessages.map((item) => {
                    if (item.kind === "day") {
                      return (
                        <div key={item.key} className="py-2">
                          <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-zinc-200" />
                            <div className="text-xs font-semibold text-zinc-500">{item.label}</div>
                            <div className="h-px flex-1 bg-zinc-200" />
                          </div>
                        </div>
                      );
                    }

                    const m = item.msg;
                    const isNexus = m.role === "nexus";
                    const delivery = m.delivery ?? "sent";
                    const showChecks = isNexus;
                    const isPinned = pinnedIds.includes(m.id);
                    const isEditing = editingId === m.id;
                    const replied = m.replyToId ? messageById.get(m.replyToId) ?? null : null;

                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease }}
                        className={cn("group flex items-end gap-3", isNexus ? "justify-end" : "justify-start")}
                      >
                        {!isNexus && (
                          <Avatar
                            name={selected.name}
                            src={selected.avatarUrl}
                            online={selected.online}
                            size="sm"
                            showOnline={false}
                          />
                        )}

                        <div
                          ref={(el) => {
                            messageRefs.current[m.id] = el;
                          }}
                          className={cn("relative max-w-[72%]")}
                        >
                          <div
                            className={cn(
                              "absolute -top-3 z-20 opacity-0 transition-opacity group-hover:opacity-100",
                              isNexus ? "right-0" : "left-0"
                            )}
                          >
                            <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white/95 px-1 py-1 shadow-lg backdrop-blur">
                              <button
                                type="button"
                                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-50"
                                aria-label="Reply"
                                title="Reply"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startReply(m.id);
                                }}
                              >
                                <CornerDownLeft size={16} />
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-50"
                                aria-label={isPinned ? "Unpin" : "Pin"}
                                title={isPinned ? "Unpin" : "Pin"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(m.id);
                                }}
                              >
                                <Pin size={16} className={isPinned ? "text-blue-600" : undefined} />
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-50"
                                aria-label="Copy"
                                title="Copy"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyMessage(m);
                                }}
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-50"
                                aria-label="Edit"
                                title="Edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(m);
                                }}
                              >
                                <PencilLine size={16} />
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                                aria-label="Delete"
                                title="Delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMessage(m.id);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                              isNexus
                                ? "bg-blue-600 text-white"
                                : "border border-zinc-200 bg-white text-zinc-800"
                            )}
                          >
                            <div className="space-y-2">
                              {replied && (
                                <div
                                  className={cn(
                                    "rounded-xl border px-3 py-2 text-xs font-semibold",
                                    isNexus ? "border-white/25 bg-white/10 text-white/90" : "border-zinc-200 bg-zinc-50 text-zinc-700"
                                  )}
                                >
                                  <div className={cn("text-[11px] font-bold uppercase tracking-widest", isNexus ? "text-white/70" : "text-zinc-500")}>
                                    Replying to {replied.role === "nexus" ? "Nexus" : "Member"}
                                  </div>
                                  <div className="mt-1 line-clamp-2">{replied.text || (replied.attachment ? replied.attachment.name : "")}</div>
                                </div>
                              )}
                              {m.attachment && (
                                <div
                                  className={cn(
                                    "rounded-2xl border border-white/25 bg-white/10 p-3",
                                    !isNexus ? "border-zinc-200 bg-white" : ""
                                  )}
                                >
                                  {m.attachment.kind === "image" ? (
                                    <a
                                      href={m.attachment.dataUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="cursor-pointer block"
                                      aria-label="Open image"
                                    >
                                      <img
                                        src={m.attachment.dataUrl}
                                        alt={m.attachment.name}
                                        className={cn(
                                          "h-40 w-40 rounded-2xl object-cover",
                                          isNexus ? "ring-1 ring-white/20" : "border border-zinc-200"
                                        )}
                                      />
                                    </a>
                                  ) : m.attachment.kind === "audio" ? (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                          <div
                                            className={cn(
                                              "flex h-10 w-10 items-center justify-center rounded-xl",
                                              isNexus ? "bg-white/15" : "bg-zinc-100"
                                            )}
                                          >
                                            <Mic size={18} className={cn(isNexus ? "text-white" : "text-zinc-900")} />
                                          </div>
                                          <div className="min-w-0">
                                            <div className={cn("truncate text-sm font-semibold", isNexus ? "text-white" : "text-zinc-900")}>
                                              Voice message
                                            </div>
                                            <div className={cn("text-xs font-semibold", isNexus ? "text-white/70" : "text-zinc-500")}>
                                              {formatBytes(m.attachment.size)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {m.attachment.dataUrl ? (
                                        <audio controls src={m.attachment.dataUrl} className={cn("w-full", isNexus ? "opacity-95" : "")} />
                                      ) : (
                                        <div className={cn("text-xs font-semibold", isNexus ? "text-white/70" : "text-zinc-500")}>
                                          Audio unavailable.
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <div
                                          className={cn(
                                            "flex h-10 w-10 items-center justify-center rounded-xl",
                                            isNexus ? "bg-white/15" : "bg-zinc-100"
                                          )}
                                        >
                                          <FileText size={18} className={cn(isNexus ? "text-white" : "text-zinc-900")} />
                                        </div>
                                        <div className="min-w-0">
                                          <div className={cn("truncate text-sm font-semibold", isNexus ? "text-white" : "text-zinc-900")}>
                                            {m.attachment.name}
                                          </div>
                                          <div className={cn("text-xs font-semibold", isNexus ? "text-white/70" : "text-zinc-500")}>
                                            {formatBytes(m.attachment.size)}
                                          </div>
                                        </div>
                                      </div>
                                      {m.attachment.dataUrl && (
                                        <a
                                          href={m.attachment.dataUrl}
                                          download={m.attachment.name}
                                          className={cn(
                                            "cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                                            isNexus
                                              ? "border-white/25 bg-white/10 hover:bg-white/15"
                                              : "border-zinc-200 bg-white hover:bg-zinc-50"
                                          )}
                                          aria-label="Download file"
                                        >
                                          <Download size={16} className={cn(isNexus ? "text-white" : "text-zinc-700")} />
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {isEditing ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    className={cn(
                                      "min-h-[72px] resize-none",
                                      isNexus
                                        ? "border-white/25 bg-white/10 text-white placeholder:text-white/60"
                                        : "border-zinc-200 bg-white text-zinc-900"
                                    )}
                                    placeholder="Edit message..."
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn("cursor-pointer", isNexus ? "border-white/25 bg-white/10 text-white hover:bg-white/15" : "")}
                                      onClick={cancelEdit}
                                    >
                                      Cancel
                                    </Button>
                                    <Button size="sm" className="cursor-pointer" onClick={() => saveEdit(m.id)} disabled={!editDraft.trim()}>
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : m.text ? (
                                <div className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className={cn("mt-1 flex items-center gap-2 text-[11px] font-semibold", isNexus ? "justify-end text-zinc-500" : "justify-start text-zinc-500")}>
                            <span>{formatTime(m.at)}</span>
                            {isPinned && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                <Pin size={12} />
                                pinned
                              </span>
                            )}
                            {showChecks && (
                              <span className="inline-flex items-center gap-1">
                                {delivery === "sent" && <Check size={14} className="text-zinc-400" />}
                                {delivery === "delivered" && <CheckCheck size={14} className="text-zinc-400" />}
                                {delivery === "read" && <CheckCheck size={14} className="text-blue-600" />}
                              </span>
                            )}
                          </div>
                        </div>

                        {isNexus && (
                          <div className="shrink-0">
                            <Avatar
                              name={operatorName}
                              src={operatorAvatarUrl || undefined}
                              online={false}
                              size="sm"
                              showOnline={false}
                            />
                          </div>
                        )}
                      </motion.div>
                    );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                <Separator />

                <div className="shrink-0 bg-white px-5 py-4">
                  {replyTarget && (
                    <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                          Replying to {replyTarget.role === "nexus" ? "Nexus" : "Member"}
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-zinc-900">
                          {replyTarget.text || (replyTarget.attachment ? replyTarget.attachment.name : "Message")}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        aria-label="Clear reply"
                        onClick={() => setReplyToId(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
                    aria-label="Attach file"
                  />

                  {pendingAttachment && (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {pendingAttachment.kind === "image" ? (
                          <img
                            src={pendingAttachment.dataUrl}
                            alt={pendingAttachment.name}
                            className="h-12 w-12 shrink-0 rounded-xl object-cover border border-zinc-200 bg-white"
                          />
                        ) : pendingAttachment.kind === "audio" ? (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                            <Mic size={18} className="text-zinc-900" />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                            <FileText size={18} className="text-zinc-900" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {pendingAttachment.kind === "audio" ? "Voice message" : pendingAttachment.name}
                          </div>
                          <div className="mt-0.5 text-xs font-semibold text-zinc-500">
                            {formatBytes(pendingAttachment.size)}
                          </div>
                          {pendingAttachment.kind === "audio" && pendingAttachment.dataUrl ? (
                            <div className="mt-2">
                              <audio controls src={pendingAttachment.dataUrl} className="w-[240px] max-w-full" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        aria-label="Remove attachment"
                        onClick={() => setPendingAttachment(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div ref={quickRepliesRef} className="relative">
                      <button
                        type="button"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          setQuickRepliesOpen((v) => !v);
                          setTemplatesOpen(false);
                          setShortcutsOpen(false);
                        }}
                        aria-expanded={quickRepliesOpen}
                      >
                        <MessageSquareText size={16} className="text-zinc-700" />
                        Quick replies
                      </button>
                      {quickRepliesOpen && (
                        <div className="absolute left-0 bottom-full mb-2.5 z-50 w-[320px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                          <div className="px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Quick replies</div>
                            <div className="mt-1 text-xs text-zinc-500">Click to insert into the composer.</div>
                          </div>
                          <Separator />
                          <div className="p-2">
                            {[
                              "Perfect — thanks. I’ll check this now.",
                              "Can you share a screenshot / the exact error?",
                              "Got it. I’ll fix it and keep you posted.",
                              "Quick check: did this start today or has it been happening for a while?",
                              "Understood. I’m escalating this and will be right back.",
                            ].map((t) => (
                              <button
                                key={t}
                                type="button"
                                className="cursor-pointer flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                                onClick={() => {
                                  insertToComposer(t, "replace");
                                  setQuickRepliesOpen(false);
                                  // No toast: composer changes immediately.
                                }}
                              >
                                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700">
                                  <MessageSquareText size={14} />
                                </span>
                                <span className="text-sm font-semibold text-zinc-900">{t}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div ref={templatesRef} className="relative">
                      <button
                        type="button"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          setTemplatesOpen((v) => !v);
                          setQuickRepliesOpen(false);
                          setShortcutsOpen(false);
                        }}
                        aria-expanded={templatesOpen}
                      >
                        <FileText size={16} className="text-zinc-700" />
                        Templates
                      </button>
                      {templatesOpen && (
                        <div className="absolute left-0 bottom-full mb-2.5 z-50 w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                          <div className="px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Templates</div>
                            <div className="mt-1 text-xs text-zinc-500">Ready-to-send responses (demo).</div>
                          </div>
                          <Separator />
                          <div className="p-2">
                            {[
                              {
                                title: "Onboarding — welcome + next steps",
                                body:
                                  "Welcome! To help you faster, pick an option:\n1) Start onboarding\n2) Technical support\n3) Talk to a human",
                              },
                              {
                                title: "Support — request the minimum details",
                                body:
                                  "To diagnose, please share:\n- Which step were you on?\n- The exact error message\n- Mobile or desktop?\n\nThen I’ll guide you.",
                              },
                              {
                                title: "Closing — resolved",
                                body:
                                  "Great. If this happens again, please send:\n- a screenshot of the error\n- the approximate time\n\nI’ll mark this as resolved for now.",
                              },
                            ].map((tpl) => (
                              <button
                                key={tpl.title}
                                type="button"
                                className="cursor-pointer flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                                onClick={() => {
                                  insertToComposer(tpl.body, "replace");
                                  setTemplatesOpen(false);
                                  // No toast: composer changes immediately.
                                }}
                              >
                                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700">
                                  <FileText size={14} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-zinc-900">{tpl.title}</span>
                                  <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-500">{tpl.body}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div ref={shortcutsRef} className="relative">
                      <button
                        type="button"
                        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          setShortcutsOpen((v) => !v);
                          setQuickRepliesOpen(false);
                          setTemplatesOpen(false);
                        }}
                        aria-expanded={shortcutsOpen}
                      >
                        <CircleDot size={16} className="text-zinc-700" />
                        Automation shortcuts
                      </button>
                      {shortcutsOpen && (
                        <div className="absolute left-0 bottom-full mb-2.5 z-50 w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                          <div className="px-4 py-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Automation shortcuts</div>
                            <div className="mt-1 text-xs text-zinc-500">Quick actions (demo) for the selected conversation.</div>
                          </div>
                          <Separator />
                          <div className="p-2">
                            {[
                              {
                                title: "Mark as resolved",
                                desc: "Moves the status to resolved and clears unread.",
                                run: () => {
                                  if (!selected) return toast.error("Select a conversation first.");
                                  markResolved(selected.id);
                                  setShortcutsOpen(false);
                                  // No toast: status badge updates immediately.
                                },
                              },
                              {
                                title: "Apply tag: VIP",
                                desc: "Flags priority routing.",
                                run: () => {
                                  if (!selected) return toast.error("Select a conversation first.");
                                  toggleConversationTag(selected.id, "VIP");
                                  setShortcutsOpen(false);
                                  // No toast: tag chip updates immediately.
                                },
                              },
                              {
                                title: "Apply tag: Escalated",
                                desc: "Simulates a human handoff.",
                                run: () => {
                                  if (!selected) return toast.error("Select a conversation first.");
                                  toggleConversationTag(selected.id, "Escalated");
                                  setShortcutsOpen(false);
                                  // No toast: tag chip updates immediately.
                                },
                              },
                              {
                                title: "Trigger: Onboarding",
                                desc: "Adds an automation update into the chat.",
                                run: () => {
                                  pushAutomationNote("Workflow triggered: Onboarding");
                                  setShortcutsOpen(false);
                                  // No toast: message appears in the thread.
                                },
                              },
                              {
                                title: "Insert: next best action",
                                desc: "Operator suggestion (demo).",
                                run: () => {
                                  if (!selected) return toast.error("Select a conversation first.");
                                  insertToComposer("Suggestion: ask for a screenshot + confirm device (mobile/desktop).", "replace");
                                  setShortcutsOpen(false);
                                  // No toast: composer changes immediately.
                                },
                              },
                            ].map((a) => (
                              <button
                                key={a.title}
                                type="button"
                                className="cursor-pointer flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50"
                                onClick={a.run}
                              >
                                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700">
                                  <CircleDot size={14} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-zinc-900">{a.title}</span>
                                  <span className="mt-0.5 block text-xs font-semibold text-zinc-500">{a.desc}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                    <Textarea
                      ref={composerRef}
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder="Type a message..."
                      className="min-h-[48px] resize-none border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0"
                        onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (e.shiftKey) return;
                        e.preventDefault();
                        sendMessage();
                        }}
                      aria-label="Message"
                    />

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-50"
                          aria-label="Attach"
                          onClick={pickFile}
                        >
                          <Paperclip size={18} />
                        </button>
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  "cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                                  isRecording ? "bg-red-50 text-red-700 hover:bg-red-100" : "text-zinc-600 hover:bg-zinc-50"
                                )}
                                aria-label={isRecording ? "Stop recording" : "Record voice message"}
                                onClick={() => (isRecording ? void stopRecording() : void startRecording())}
                                disabled={Boolean(pendingAttachment)}
                              >
                                {isRecording ? <Square size={18} /> : <Mic size={18} />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center">
                              {pendingAttachment
                                ? "Remove the current attachment to record."
                                : isRecording
                                ? `Recording… ${recordingSeconds}s`
                                : "Record a voice message"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <button
                          type="button"
                          className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-50"
                          aria-label="More actions"
                          onClick={() => toast.info("More actions aren’t available yet.")}
                        >
                          <MoreVertical size={18} />
                        </button>
                      </div>

                      <Button
                        className="cursor-pointer rounded-xl px-5"
                        onClick={sendMessage}
                        disabled={isSending || isRecording || (!composer.trim() && !pendingAttachment)}
                        aria-label="Send"
                      >
                        {isSending ? (
                          <>
                            Sending
                            <span className="ml-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                          </>
                        ) : (
                          "Send"
                        )}
                        <Send size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {createTagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-pointer"
            onClick={() => setCreateTagOpen(false)}
            aria-label="Close create tag"
          />
          <motion.div
            ref={createTagRef}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 px-6 py-5">
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-zinc-900">Create new tag</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Add a custom tag with your preferred name and appearance.
                </div>
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                onClick={() => setCreateTagOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <Separator />

            <div className="px-6 py-6 space-y-6">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Name</div>
                <div className="mt-2">
                  <Input
                    ref={createTagNameRef}
                    value={createTagName}
                    onChange={(e) => setCreateTagName(e.target.value)}
                    placeholder="e.g. VIP"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmCreateTag();
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Appearance</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["slate", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as TagColor[]).map(
                    (c) => {
                      const cls = tagColorClasses(c);
                      const active = createTagColor === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCreateTagColor(c)}
                          className={cn(
                            "cursor-pointer h-10 w-10 rounded-full border transition-all p-1",
                            active ? "border-zinc-900 ring-2 ring-blue-600/25" : "border-zinc-200 hover:border-zinc-300"
                          )}
                          aria-label={`Select ${c} color`}
                          title={c}
                        >
                          <span className={cn("block h-full w-full rounded-full", cls.dot)} />
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3 px-6 py-5">
              <Button variant="outline" className="cursor-pointer w-full" onClick={() => setCreateTagOpen(false)}>
                Cancel
              </Button>
              <Button className="cursor-pointer w-full" onClick={confirmCreateTag} disabled={!createTagName.trim()}>
                Confirm
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-pointer"
            onClick={() => setNewOpen(false)}
            aria-label="Close new conversation"
          />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-sm font-bold text-zinc-900">New conversation</div>
                <div className="mt-0.5 text-xs text-zinc-500">Create a new thread (demo).</div>
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                onClick={() => setNewOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <Separator />
            <div className="px-5 py-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Name</div>
                <div className="mt-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Sofia Martins"
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">First message</div>
                <div className="mt-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Write a message..."
                  />
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-end gap-3 px-5 py-4">
              <Button variant="outline" className="cursor-pointer" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button
                className="cursor-pointer"
                onClick={createConversation}
                disabled={!newName.trim() || !newMessage.trim()}
              >
                Create
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
