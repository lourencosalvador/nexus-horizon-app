export type ModerationDecision = "approved" | "needs_review" | "blocked";

export type PostAuthor = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type PostInput = {
  id: string;
  group_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  title?: string | null;
  content: string;
  author?: PostAuthor | null;
  created_at?: string | null;
};

export type HeuristicSignal =
  | "external_link"
  | "short_link"
  | "dm_cta"
  | "comment_cta"
  | "keyword_offer"
  | "keyword_outside_platform"
  | "many_links";

export type HeuristicsResult = {
  score: number; // 0..100
  signals: HeuristicSignal[];
  reasons: string[];
  linkCount: number;
};

export type AiResult = {
  decision: ModerationDecision;
  confidence: number; // 0..1
  intent: "spam" | "disguised_offer" | "legit" | "jobs_legit" | "unclear";
  rationale: string[];
};

export type ModerationResult = {
  decision: ModerationDecision;
  confidence: number; // 0..1
  reasons: string[];
  signals: HeuristicSignal[];
  layer: "heuristics_only" | "heuristics_plus_ai";
  isJobsContext: boolean;
  model?: string;
};


