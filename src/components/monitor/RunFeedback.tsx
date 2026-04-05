'use client';

import { useState } from 'react';
import { MessageSquare, CheckCircle, Loader2 } from 'lucide-react';

interface RunFeedbackProps {
  runId: string;
  initialFeedback?: string;
}

export function RunFeedback({ runId, initialFeedback }: RunFeedbackProps) {
  const [feedback, setFeedback] = useState(initialFeedback ?? '');
  const [saved, setSaved] = useState(!!initialFeedback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!feedback.trim()) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/runs/${runId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save');
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save feedback');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <MessageSquare className="h-3.5 w-3.5" />
        Tune this monitor
      </div>
      <textarea
        value={feedback}
        onChange={(e) => { setFeedback(e.target.value); setSaved(false); }}
        placeholder="How was this run? E.g. 'Too broad — focus on enterprise SaaS pricing only' or 'Great, keep finding competitor moves'"
        rows={2}
        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        maxLength={1000}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !feedback.trim() || saved}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save feedback'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="h-3.5 w-3.5" />
            Saved — will improve next run
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
