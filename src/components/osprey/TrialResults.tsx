'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { OspreyJob, OspreyResult, OspreyAnswer } from '@/types';

interface TrialResultsProps {
  job: OspreyJob;
  results: OspreyResult[];
}

function AnswerCell({ answer }: { answer: OspreyAnswer }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = answer.answer.length > 200;

  return (
    <div>
      <p
        className={`text-sm text-slate-700 ${!expanded && isLong ? 'line-clamp-3' : ''}`}
      >
        {answer.answer || <span className="italic text-slate-400">No answer found</span>}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Show more</>
          )}
        </button>
      )}
      {answer.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {answer.sources.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 hover:underline"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {new URL(url).hostname}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrialResults({ job, results }: TrialResultsProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const researchQuestions = (job.research_questions as string[]) ?? [];
  const completedResults = results.filter((r) => r.status === 'complete');
  const failedResults = results.filter((r) => r.status === 'failed');

  const remainingRows = job.total_rows - Math.min(3, job.total_rows);
  const estimatedFullCredits = job.total_rows; // 1 credit per row
  const estimatedSeconds = remainingRows * 8;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  async function handleFullRun() {
    setError(null);
    setStarting(true);

    const res = await fetch(`/api/osprey/jobs/${job.id}/run`, {
      method: 'POST',
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Failed to start full run.');
      setStarting(false);
      return;
    }

    router.refresh();
  }

  function handleUpdateSettings() {
    // Revert job status to pending to go back to setup form
    fetch(`/api/osprey/jobs/${job.id}/reset`, { method: 'POST' }).finally(() => {
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Trial results</h2>
        <p className="mt-1 text-sm text-slate-500">
          Showing enriched data for the first {Math.min(3, job.total_rows)} rows.
        </p>
      </div>

      {failedResults.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {failedResults.length} row{failedResults.length > 1 ? 's' : ''} failed to research.
          The full run will retry failed rows automatically.
        </div>
      )}

      {/* One card per research question */}
      {researchQuestions.map((question, qi) => (
        <Card key={qi}>
          <h3 className="mb-4 font-semibold text-slate-900">{question}</h3>
          <div className="divide-y divide-slate-100">
            {completedResults.map((result) => {
              const answer = result.answers?.[qi];
              return (
                <div key={result.id} className="grid grid-cols-[200px_1fr] gap-4 py-3">
                  <p className="text-sm font-medium text-slate-800 truncate pr-2">
                    {result.research_target}
                  </p>
                  {answer ? (
                    <AnswerCell answer={answer} />
                  ) : (
                    <p className="text-sm italic text-slate-400">No data</p>
                  )}
                </div>
              );
            })}
            {completedResults.length === 0 && (
              <p className="py-3 text-sm italic text-slate-400">No completed rows</p>
            )}
          </div>
        </Card>
      ))}

      {/* Cost summary */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 space-y-1">
        <p>Credits used on trial: <span className="font-medium text-slate-800">{job.credits_used}</span></p>
        <p>Estimated credits for full run: <span className="font-medium text-slate-800">{estimatedFullCredits}</span></p>
        {remainingRows > 0 && (
          <p>Estimated time: <span className="font-medium text-slate-800">~{estimatedMinutes} min</span> ({remainingRows} remaining rows)</p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={handleUpdateSettings}>
          Update Settings
        </Button>
        <Button onClick={handleFullRun} disabled={starting}>
          {starting ? 'Starting…' : 'Continue Full Run'}
        </Button>
      </div>
    </div>
  );
}
