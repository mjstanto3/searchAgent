export type MonitorFrequency = 'daily' | 'weekly' | 'biweekly';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  topic: string;
  sources?: string[];
  keywords?: string[];
  document_path?: string;
  document_name?: string;
  frequency: MonitorFrequency;
  max_results: number;
  is_active: boolean;
  next_run_at?: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

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
}

export interface MonitorFormData {
  name: string;
  topic: string;
  sources: string[];
  keywords: string[];
  document?: File;
  frequency: MonitorFrequency;
  max_results: number;
}

export interface CreditBundle {
  id: string;
  name: string;
  credits: number;
  price: number; // in USD cents
  priceId: string; // Stripe price ID
}
