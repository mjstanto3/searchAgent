export type MonitorFrequency = 'daily' | 'weekly' | 'biweekly';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SuggestionType = 'keyword' | 'source' | 'topic_refinement' | 'gap';

export interface RunSuggestion {
  id: string;
  type: SuggestionType;
  /** The keyword phrase, domain, or insight text */
  text: string;
  /** Short explanation of why this was suggested */
  rationale: string;
  /** true once the user has applied it to the monitor */
  applied?: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Credits {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  stripe_payment_id?: string;
  created_at: string;
}

export interface Monitor {
  id: string;
  user_id: string;
  name: string;
  /** Short, focused research question or topic (e.g. "AI funding rounds in developer tooling") */
  topic: string;
  /** Optional additional background context, constraints, or prior knowledge (up to 5000 chars) */
  context?: string;
  sources?: string[];
  keywords?: string[];
  document_path?: string;
  document_name?: string;
  frequency: MonitorFrequency;
  max_results: number;
  /** Rolling lookback window in days for each search (e.g. 7, 14, 30, 90, 365) */
  date_window_days: number;
  is_active: boolean;
  next_run_at?: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
  /** Claude-generated expert persona for this topic, cached on monitor creation */
  agent_role?: string;
}

export type FindingRatingValue = { rating: 'up' | 'down'; reason?: string };

export interface Run {
  id: string;
  monitor_id: string;
  user_id: string;
  status: RunStatus;
  brief_html?: string;
  brief_markdown?: string;
  credits_used?: number;
  error_message?: string;
  email_sent: boolean;
  created_at: string;
  completed_at?: string;
  user_feedback?: string;
  finding_ratings?: Record<string, FindingRatingValue>;
  /** 1–5 quality score from the internal evaluation pass */
  quality_score?: number;
  /** true if a second search was triggered due to insufficient initial results */
  retried_search?: boolean;
  /** number of findings dropped during URL validation or quality evaluation */
  removed_findings?: number;
  /** AI-generated suggestions to improve future searches */
  suggestions?: RunSuggestion[];
  /** URLs of all verified/low-confidence findings — used for cross-run deduplication */
  found_urls?: string[];
}

export interface MonitorFormData {
  name: string;
  topic: string;
  context: string;
  sources: string[];
  keywords: string[];
  document?: File;
  frequency: MonitorFrequency;
  max_results: number;
  date_window_days: number;
}

export interface CreditBundle {
  id: string;
  name: string;
  credits: number;
  price: number; // in USD cents
  priceId: string; // Stripe price ID
}
