/**
 * Inbox Automation Runner
 * Professional, scalable, clean architecture for inbox automation.
 *
 * Rules:
 * 1. Bot NEVER sends welcome - admin does
 * 2. Bot only responds to NEW member messages (< 60s old)
 * 3. One response per inbound
 * 4. Bootstrap silently (no spam on page load)
 * 5. State machine: awaiting_choice → awaiting_confirmation → complete
 */

import { skoolSendMessage, type SkoolConnectorSession } from "@/features/conversations/lib/skool-chat";
import {
  getInboxAutomationState,
  setInboxAutomationState,
  type InboxAutomationState,
} from "@/shared/stores/inboxAutomationStore";
import {
  PATH_MESSAGES,
  PATH4_MESSAGES,
  INVALID_CHOICE_RESPONSE,
  parseChoice,
  personalize,
} from "@/features/conversations/lib/automation-masters-dm";

type Message = {
  id: string;
  role: "member" | "nexus";
  text: string | null;
  at: number;
};

type RunnerContext = {
  instanceId: string;
  channelId: string;
  thread: Message[];
  memberName: string;
  connector: SkoolConnectorSession;
  onSendMessage: (text: string) => Promise<void>;
};

const RECENT_MESSAGE_WINDOW_MS = 60_000; // 60 seconds
const THROTTLE_MS = 800;

export async function runInboxAutomation(ctx: RunnerContext): Promise<void> {
  const { instanceId, channelId, thread, memberName, connector, onSendMessage } = ctx;
  const now = Date.now();
  const vars = { name: memberName || "there" };

  const state = getInboxAutomationState(instanceId, channelId);

  console.log("[Automation] Run started", {
    channelId,
    threadLength: thread.length,
    state: {
      initialized: state.initialized,
      welcomeSent: state.welcomeSent,
      stage: state.stage,
      path: state.path,
      pathStep: state.pathStep,
      pendingHuman: state.pendingHuman,
    },
  });

  // STEP 1: Bootstrap (silent initialization)
  if (!state.initialized) {
    const lastInbound = [...thread].reverse().find((m) => m.role === "member");
    console.log("[Automation] Bootstrap: initializing silently", {
      lastInboundId: lastInbound?.id,
      lastInboundAt: lastInbound?.at,
    });
    setInboxAutomationState(instanceId, channelId, {
      ...state,
      initialized: true,
      initializedAt: now,
      lastProcessedInboundId: lastInbound?.id ?? null,
    });
    console.log("[Automation] Bootstrap complete (no messages sent)");
    return;
  }

  // STEP 2: Detect welcome from admin
  const lastWelcome = [...thread]
    .reverse()
    .find((m) => m.role === "nexus" && isWelcomePrompt(m.text ?? ""));

  if (lastWelcome && state.welcomeMessageId !== lastWelcome.id) {
    console.log("[Automation] New welcome detected", {
      welcomeId: lastWelcome.id,
      welcomeAt: lastWelcome.at,
    });
    setInboxAutomationState(instanceId, channelId, {
      ...state,
      welcomeSent: true,
      welcomeMessageId: lastWelcome.id,
      welcomeMessageAt: lastWelcome.at ?? now,
      stage: "awaiting_choice",
      path: null,
      pathStep: 0,
      pendingHuman: false,
      lastProcessedInboundId: null,
    });
    console.log("[Automation] Welcome marked (awaiting member choice)");
    return;
  }

  // STEP 3: Find last inbound (member message)
  const lastInbound = [...thread].reverse().find((m) => m.role === "member");
  if (!lastInbound) {
    console.log("[Automation] No inbound message found");
    return;
  }

  // STEP 4: Timestamp guard (only process recent messages)
  const messageAge = now - (lastInbound.at ?? now);
  if (messageAge > RECENT_MESSAGE_WINDOW_MS) {
    console.log("[Automation] Inbound message too old", {
      messageAge,
      threshold: RECENT_MESSAGE_WINDOW_MS,
      inboundId: lastInbound.id,
      inboundAt: lastInbound.at,
    });
    return;
  }

  // STEP 5: Check if already processed
  if (state.lastProcessedInboundId === lastInbound.id) {
    console.log("[Automation] Message already processed", { inboundId: lastInbound.id });
    return;
  }

  // STEP 6: Check pending human
  if (state.pendingHuman) {
    const choice = parseChoice(lastInbound.text ?? "");
    if (choice) {
      console.log("[Automation] Valid choice after pendingHuman, resuming");
      setInboxAutomationState(instanceId, channelId, { ...state, pendingHuman: false });
    } else {
      console.log("[Automation] Still pendingHuman, skipping");
      return;
    }
  }

  // STEP 7: Check if welcome was sent
  if (!state.welcomeSent || !state.welcomeMessageAt) {
    console.log("[Automation] Welcome not sent yet");
    return;
  }

  // STEP 8: Throttle (don't spam)
  if (state.lastAutoSentAt && now - state.lastAutoSentAt < THROTTLE_MS) {
    console.log("[Automation] Throttled", {
      lastSent: state.lastAutoSentAt,
      now,
      diff: now - state.lastAutoSentAt,
    });
    return;
  }

  // STEP 9: Route based on stage
  const choice = parseChoice(lastInbound.text ?? "");

  console.log("[Automation] Processing inbound", {
    inboundId: lastInbound.id,
    inboundText: lastInbound.text?.slice(0, 50),
    inboundAt: lastInbound.at,
    messageAge,
    stage: state.stage,
    choice,
  });

  try {
    if (state.stage === "awaiting_choice") {
      if (!choice) {
        console.log("[Automation] Invalid choice, sending generic response");
        await onSendMessage(personalize(INVALID_CHOICE_RESPONSE, vars));
        setInboxAutomationState(instanceId, channelId, {
          ...state,
          pendingHuman: true,
          lastProcessedInboundId: lastInbound.id,
          lastAutoSentAt: now,
        });
        return;
      }

      console.log("[Automation] Valid choice detected", { choice });

      if (choice === 4) {
        // Path 4: ask for goal
        await onSendMessage(personalize(PATH4_MESSAGES[0]!, vars));
        setInboxAutomationState(instanceId, channelId, {
          ...state,
          stage: "awaiting_other_goal_text",
          path: 4,
          pathStep: 0,
          lastProcessedInboundId: lastInbound.id,
          lastAutoSentAt: now,
        });
        return;
      }

      // Path 1-3: send offer
      const offer = PATH_MESSAGES[choice]?.[0];
      if (!offer) {
        console.error("[Automation] No offer for path", { choice });
        return;
      }

      await onSendMessage(personalize(offer, vars));
      setInboxAutomationState(instanceId, channelId, {
        ...state,
        stage: "awaiting_path_confirm",
        path: choice,
        pathStep: 0,
        lastProcessedInboundId: lastInbound.id,
        lastAutoSentAt: now,
      });
      return;
    }

    if (state.stage === "awaiting_path_confirm") {
      const text = (lastInbound.text ?? "").trim().toLowerCase();
      const isYes = /^(yes|yeah|yep|sure|ok|okay|send|please|pls|👍)/.test(text);
      const isNo = /^(no|nope|not now|later|skip|nah|👎)/.test(text);

      if (isNo) {
        console.log("[Automation] User declined offer");
        await onSendMessage("No problem! Let me know if you change your mind. 😊");
        setInboxAutomationState(instanceId, channelId, {
          ...state,
          stage: "awaiting_choice",
          path: null,
          pathStep: 0,
          lastProcessedInboundId: lastInbound.id,
          lastAutoSentAt: now,
        });
        return;
      }

      if (!isYes) {
        console.log("[Automation] Unclear response, sending generic");
        await onSendMessage(personalize(INVALID_CHOICE_RESPONSE, vars));
        setInboxAutomationState(instanceId, channelId, {
          ...state,
          pendingHuman: true,
          lastProcessedInboundId: lastInbound.id,
          lastAutoSentAt: now,
        });
        return;
      }

      // Send resource
      console.log("[Automation] User accepted, sending resource", { path: state.path });
      const messages = state.path ? PATH_MESSAGES[state.path as 1 | 2 | 3] : null;
      const resource = messages?.[1];
      if (!resource) {
        console.error("[Automation] No resource for path", { path: state.path });
        return;
      }

      await onSendMessage(personalize(resource, vars));
      setInboxAutomationState(instanceId, channelId, {
        ...state,
        stage: "awaiting_choice",
        path: null,
        pathStep: 0,
        lastProcessedInboundId: lastInbound.id,
        lastAutoSentAt: now,
      });
      return;
    }

    if (state.stage === "awaiting_other_goal_text") {
      // Path 4: received goal text, now ask for 1 or 2
      await onSendMessage(personalize(PATH4_MESSAGES[1]!, vars));
      setInboxAutomationState(instanceId, channelId, {
        ...state,
        stage: "awaiting_other_goal_choice",
        pathStep: 1,
        lastProcessedInboundId: lastInbound.id,
        lastAutoSentAt: now,
      });
      return;
    }

    if (state.stage === "awaiting_other_goal_choice") {
      const text = (lastInbound.text ?? "").trim();
      if (text !== "1" && text !== "2") {
        console.log("[Automation] Invalid path4 choice");
        await onSendMessage(personalize(INVALID_CHOICE_RESPONSE, vars));
        setInboxAutomationState(instanceId, channelId, {
          ...state,
          pendingHuman: true,
          lastProcessedInboundId: lastInbound.id,
          lastAutoSentAt: now,
        });
        return;
      }

      const nextPath = text === "1" ? 1 : 2;
      const offer = PATH_MESSAGES[nextPath]?.[0];
      if (!offer) return;

      await onSendMessage(personalize(offer, vars));
      setInboxAutomationState(instanceId, channelId, {
        ...state,
        stage: "awaiting_path_confirm",
        path: nextPath,
        pathStep: 0,
        lastProcessedInboundId: lastInbound.id,
        lastAutoSentAt: now,
      });
      return;
    }
  } catch (error) {
    console.error("[Automation] Error during run", error);
    setInboxAutomationState(instanceId, channelId, {
      ...state,
      pendingHuman: true,
      lastProcessedInboundId: lastInbound.id,
    });
  }
}

function isWelcomePrompt(text: string): boolean {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ");
  if (!t.trim()) return false;

  const hasWelcome = t.includes("welcome") || t.includes("hey");
  const hasQuickQuestion =
    t.includes("quick question") || /what['']?s\s+the\s+one\s+thing\s+you['']?re\s+stuck/.test(t);
  const hasReplyWithNumber = /reply\s+with\s+(the\s+)?number/.test(t);
  const hasOption1 = /\b1[.\)]/.test(t) || /1️/.test(t);
  const hasOption2 = /\b2[.\)]/.test(t) || /2️/.test(t);
  const hasOption3 = /\b3[.\)]/.test(t) || /3️/.test(t);
  const hasOption4 = /\b4[.\)]/.test(t) || /4️/.test(t);
  const hasOptions = hasOption1 && hasOption2 && hasOption3 && hasOption4;

  const score = (hasWelcome ? 1 : 0) + (hasQuickQuestion ? 1 : 0) + (hasReplyWithNumber ? 1 : 0) + (hasOptions ? 2 : 0);
  return score >= 3;
}
