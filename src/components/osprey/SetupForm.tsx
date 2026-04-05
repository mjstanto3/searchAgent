'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OspreyJob, OspreyEffortTier } from '@/types';

const EFFORT_TIERS: { id: OspreyEffortTier; label: string; description: string; searches: number }[] = [
  { id: 'low', label: 'Low', description: '1 search / question', searches: 1 },
  { id: 'medium', label: 'Medium', description: '3 searches / question', searches: 3 },
  { id: 'large', label: 'Large', description: '5 searches / question', searches: 5 },
];

interface SetupFormProps {
  job: OspreyJob;
}

export function SetupForm({ job }: SetupFormProps) {
  const router = useRouter();

  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>(
    (job.clarifying_answers as Record<string, string>) ?? {},
  );
  const [researchQuestions, setResearchQuestions] = useState<string[]>(() => {
    const q = (job.research_questions as string[]) ?? [];
    return [...q, ...Array(5 - q.length).fill('')].slice(0, 5);
  });
  const [sources, setSources] = useState<string[]>(
    (job.suggested_sources as string[]) ?? [],
  );
  const [sourceInput, setSourceInput] = useState('');
  const [effortTier, setEffortTier] = useState<OspreyEffortTier>(job.effort_tier ?? 'medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clarifyingQuestions = (job.clarifying_questions as string[]) ?? [];

  const filledQuestions = researchQuestions.filter(Boolean).length;
  const selectedTier = EFFORT_TIERS.find((t) => t.id === effortTier)!;
  const creditsPerRow = 1; // 1 credit per row
  const estimatedTrialCost = 3 * creditsPerRow;

  const addSource = useCallback(() => {
    const s = sourceInput.trim();
    if (!s || sources.length >= 10) return;
    if (!sources.includes(s)) setSources((prev) => [...prev, s]);
    setSourceInput('');
  }, [sourceInput, sources]);

  function removeSource(s: string) {
    setSources((prev) => prev.filter((x) => x !== s));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const filledQs = researchQuestions.filter(Boolean);
    if (filledQs.length === 0) {
      setError('Please enter at least one research question.');
      return;
    }

    setSubmitting(true);

    // Save settings
    const patchRes = await fetch(`/api/osprey/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clarifying_answers: clarifyingAnswers,
        research_questions: filledQs,
        suggested_sources: sources,
        effort_tier: effortTier,
      }),
    });

    if (!patchRes.ok) {
      const d = await patchRes.json();
      setError(d.error ?? 'Failed to save settings.');
      setSubmitting(false);
      return;
    }

    // Trigger trial run
    const trialRes = await fetch(`/api/osprey/jobs/${job.id}/trial`, {
      method: 'POST',
    });

    if (!trialRes.ok) {
      const d = await trialRes.json();
      setError(d.error ?? 'Failed to start trial run.');
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8">
      {/* Dataset summary */}
      {job.llm_assessment && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">
            Dataset summary
          </p>
          <p className="text-sm text-slate-700">{job.llm_assessment}</p>
        </div>
      )}

      {/* Clarifying questions */}
      {clarifyingQuestions.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Clarifying questions</h3>
          {clarifyingQuestions.map((q, i) => (
            <div key={i}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {q}
              </label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Your answer (optional)"
                value={clarifyingAnswers[q] ?? ''}
                onChange={(e) =>
                  setClarifyingAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Research questions */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-slate-900">Research questions</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            What should Osprey find out about each row? Add up to 5 questions.
          </p>
        </div>
        {researchQuestions.map((q, i) => (
          <div key={i}>
            <label className="mb-1 block text-xs text-slate-500">
              Question {i + 1} {i === 0 && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder={i === 0 ? 'e.g. What does this company do?' : 'Optional'}
              value={q}
              onChange={(e) => {
                const updated = [...researchQuestions];
                updated[i] = e.target.value;
                setResearchQuestions(updated);
              }}
              maxLength={500}
            />
          </div>
        ))}
      </div>

      {/* Suggested sources */}
      <div>
        <h3 className="mb-1 font-semibold text-slate-900">Suggested sources</h3>
        <p className="mb-3 text-sm text-slate-500">
          Trade publications, websites, or domains to prioritize (up to 10). Press Enter to add.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. techcrunch.com"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addSource(); }
            }}
            maxLength={200}
            disabled={sources.length >= 10}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addSource}
            disabled={!sourceInput.trim() || sources.length >= 10}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((s) => (
              <span
                key={s}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSource(s)}
                  className="ml-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Effort tier */}
      <div>
        <h3 className="mb-1 font-semibold text-slate-900">Research effort</h3>
        <p className="mb-3 text-sm text-slate-500">
          Controls how many web searches are performed per question per row.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {EFFORT_TIERS.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setEffortTier(tier.id)}
              className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                effortTier === tier.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="font-semibold text-slate-900">{tier.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{tier.description}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Trial cost: <span className="font-medium text-slate-700">{estimatedTrialCost} credits</span> for 3 rows ·{' '}
          Full run: <span className="font-medium text-slate-700">{job.total_rows} credits</span> for all {job.total_rows} rows
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {selectedTier.searches} web search{selectedTier.searches !== 1 ? 'es' : ''} per question ·{' '}
          {filledQuestions} question{filledQuestions !== 1 ? 's' : ''} selected
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Starting trial…' : 'Run Trial (first 3 rows)'}
        </Button>
      </div>
    </form>
  );
}
