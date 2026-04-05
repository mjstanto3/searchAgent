'use client';

import { useState } from 'react';
import type { RunSuggestion, SuggestionType } from '@/types';
import { Lightbulb, Plus, Check, Tag, Globe, Compass, Map } from 'lucide-react';

interface Props {
  runId: string;
  monitorId: string;
  suggestions: RunSuggestion[];
}

const TYPE_META: Record<
  SuggestionType,
  { label: string; icon: React.ReactNode; color: string; actionable: boolean }
> = {
  keyword: {
    label: 'Keyword',
    icon: <Tag className="h-3.5 w-3.5" />,
    color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    actionable: true,
  },
  source: {
    label: 'Source',
    icon: <Globe className="h-3.5 w-3.5" />,
    color: 'bg-teal-50 border-teal-200 text-teal-900',
    actionable: true,
  },
  topic_refinement: {
    label: 'Topic Refinement',
    icon: <Compass className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 border-amber-200 text-amber-900',
    actionable: false,
  },
  gap: {
    label: 'Coverage Gap',
    icon: <Map className="h-3.5 w-3.5" />,
    color: 'bg-slate-50 border-slate-200 text-slate-800',
    actionable: false,
  },
};

function SuggestionCard({
  suggestion,
  runId,
  onApplied,
}: {
  suggestion: RunSuggestion;
  runId: string;
  onApplied: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = TYPE_META[suggestion.type];

  async function handleApply() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: suggestion.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to apply');
      }
      onApplied(suggestion.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${meta.color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium opacity-70">
            {meta.icon}
            {meta.label}
          </div>
          <p className="text-sm font-medium">{suggestion.text}</p>
          <p className="mt-0.5 text-xs opacity-70">{suggestion.rationale}</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        {meta.actionable && (
          <button
            onClick={handleApply}
            disabled={loading || suggestion.applied}
            className={`mt-0.5 shrink-0 flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              suggestion.applied
                ? 'bg-green-100 text-green-700 cursor-default'
                : 'bg-white/70 hover:bg-white text-slate-700 border border-current/20 disabled:opacity-50'
            }`}
          >
            {suggestion.applied ? (
              <>
                <Check className="h-3 w-3" /> Added
              </>
            ) : loading ? (
              'Adding…'
            ) : (
              <>
                <Plus className="h-3 w-3" /> Add to monitor
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function RunSuggestions({ runId, suggestions: initialSuggestions }: Props) {
  const [suggestions, setSuggestions] = useState<RunSuggestion[]>(initialSuggestions ?? []);

  if (suggestions.length === 0) return null;

  function markApplied(id: string) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, applied: true } : s)));
  }

  const actionable = suggestions.filter((s) => TYPE_META[s.type].actionable);
  const insights = suggestions.filter((s) => !TYPE_META[s.type].actionable);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        Suggestions to improve future runs
      </div>

      <div className="space-y-2">
        {actionable.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} runId={runId} onApplied={markApplied} />
        ))}
        {insights.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} runId={runId} onApplied={markApplied} />
        ))}
      </div>
    </div>
  );
}
