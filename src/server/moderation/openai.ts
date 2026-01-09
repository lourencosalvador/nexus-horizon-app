import { z } from "zod";
import type { AiResult, HeuristicsResult, PostInput } from "./types";

const AiSchema = z.object({
  decision: z.enum(["approved", "needs_review", "blocked"]),
  confidence: z.number().min(0).max(1),
  intent: z.enum(["spam", "disguised_offer", "legit", "jobs_legit", "unclear"]),
  rationale: z.array(z.string()).max(10),
});

function getEnv() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXUS_OPENAI_API_KEY;
  const model = process.env.NEXUS_OPENAI_MODEL || "gpt-4o-mini";
  return { apiKey, model };
}

export async function classifyWithOpenAI(args: {
  post: PostInput;
  heuristics: HeuristicsResult;
  isJobsContext: boolean;
}): Promise<{ ai: AiResult; model: string }> {
  const { apiKey, model } = getEnv();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY (or NEXUS_OPENAI_API_KEY).");
  }

  const { post, heuristics, isJobsContext } = args;
  const content = `${post.title ? `TITLE:\n${post.title}\n\n` : ""}CONTENT:\n${post.content}`.trim();

  const system = [
    "You are a content moderation classifier for a Skool community.",
    "Return ONLY valid JSON, no markdown, no extra keys.",
    "Goal: classify whether the post is legitimate, disguised offer, or spam.",
    "Decisions:",
    "- approved: clearly legitimate and safe",
    "- needs_review: uncertain or policy-sensitive; do not block",
    "- blocked: only when high certainty of spam/scam/disguised sales",
    "Special note: In a 'Jobs' category, DM/comment language is common and can be legitimate.",
    "If isJobsContext=true, never output 'blocked' unless extremely certain; prefer 'needs_review'.",
  ].join(" ");

  const user = {
    post_id: post.id,
    group_id: post.group_id ?? null,
    category_id: post.category_id ?? null,
    category_name: post.category_name ?? null,
    isJobsContext,
    author: post.author ?? null,
    heuristics,
    content,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            "Classify the following JSON. Return ONLY JSON with keys: decision, confidence, intent, rationale.\n\n" +
            JSON.stringify(user),
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as any;
  const raw = json?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("OpenAI returned empty content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Sometimes the model returns whitespace + JSON; try a minimal extraction.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } else {
      throw new Error("OpenAI returned non-JSON content.");
    }
  }

  const ai = AiSchema.parse(parsed);
  return { ai, model };
}


