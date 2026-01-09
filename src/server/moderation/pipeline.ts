import type { ModerationResult, PostInput } from "./types";
import { analyzeHeuristics } from "./heuristics";
import { classifyWithOpenAI } from "./openai";

function parseCsvEnv(name: string): string[] {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isJobs(post: PostInput): boolean {
  const ids = parseCsvEnv("NEXUS_MODERATION_JOBS_CATEGORY_IDS");
  const names = parseCsvEnv("NEXUS_MODERATION_JOBS_CATEGORY_NAMES");
  const byId = post.category_id ? ids.includes(post.category_id) : false;
  const n = (post.category_name ?? "").toLowerCase();
  const byName =
    (n && (n === "jobs" || n.includes("jobs") || n.includes("job"))) ||
    (post.category_name ? names.some((x) => x.toLowerCase() === n) : false);
  return byId || byName;
}

function canUseAi(): boolean {
  const flag = (process.env.NEXUS_MODERATION_USE_AI ?? "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  // Only use AI if key exists.
  return Boolean(process.env.OPENAI_API_KEY || process.env.NEXUS_OPENAI_API_KEY);
}

export async function analyzePost(post: PostInput): Promise<ModerationResult> {
  const heuristics = analyzeHeuristics(post);
  const isJobsContext = isJobs(post);

  // Fast path: no signals => approved.
  if (heuristics.signals.length === 0) {
    return {
      decision: "approved",
      confidence: 0.7,
      reasons: [],
      signals: [],
      layer: "heuristics_only",
      isJobsContext,
    };
  }

  // If AI is not configured, default to review (never block from heuristics).
  if (!canUseAi()) {
    return {
      decision: "needs_review",
      confidence: Math.min(0.8, 0.45 + heuristics.score / 200),
      reasons: heuristics.reasons,
      signals: heuristics.signals,
      layer: "heuristics_only",
      isJobsContext,
    };
  }

  const { ai, model } = await classifyWithOpenAI({ post, heuristics, isJobsContext });

  // Enforce Jobs behavior: never auto-block.
  if (isJobsContext && ai.decision === "blocked") {
    return {
      decision: "needs_review",
      confidence: Math.min(0.95, ai.confidence),
      reasons: [
        ...ai.rationale,
        "Jobs context: auto-block is disabled; sent to manual review.",
      ],
      signals: heuristics.signals,
      layer: "heuristics_plus_ai",
      isJobsContext,
      model,
    };
  }

  // Only block when confidence is high.
  if (ai.decision === "blocked" && ai.confidence < 0.9) {
    return {
      decision: "needs_review",
      confidence: ai.confidence,
      reasons: [...ai.rationale, "AI confidence below block threshold; sent to review."],
      signals: heuristics.signals,
      layer: "heuristics_plus_ai",
      isJobsContext,
      model,
    };
  }

  return {
    decision: ai.decision,
    confidence: ai.confidence,
    reasons: ai.rationale.length ? ai.rationale : heuristics.reasons,
    signals: heuristics.signals,
    layer: "heuristics_plus_ai",
    isJobsContext,
    model,
  };
}


