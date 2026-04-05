'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { DownvoteModal } from './DownvoteModal';
import type { FindingRatingValue } from '@/types';

interface FindingRatingsProps {
  runId: string;
  briefMarkdown: string;
  initialRatings?: Record<string, FindingRatingValue>;
}

/** Extracts bullet points from the Key Findings section of the brief markdown. */
function extractFindings(markdown: string): string[] {
  const match = markdown.match(/##\s*Key Findings\s*\n([\s\S]*?)(?=\n##|\n#|$)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('- ') || line.trim().startsWith('* '))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

export function FindingRatings({ runId, briefMarkdown, initialRatings }: FindingRatingsProps) {
  const findings = extractFindings(briefMarkdown);
  const [ratings, setRatings] = useState<Record<string, FindingRatingValue>>(initialRatings ?? {});
  const [pending, setPending] = useState<string | null>(null);
  const [modalFinding, setModalFinding] = useState<string | null>(null);

  if (findings.length === 0) return null;

  async function saveRating(finding: string, rating: 'up' | 'down', reason?: string) {
    const key = finding.slice(0, 200);
    setPending(key);

    try {
      const res = await fetch(`/api/runs/${runId}/findings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding, rating, reason }),
      });

      const data = await res.json();
      if (res.ok) {
        setRatings(data.finding_ratings ?? {});
      }
    } finally {
      setPending(null);
    }
  }

  function handleThumbsUp(finding: string) {
    const key = finding.slice(0, 200);
    const current = ratings[key];
    // Toggle off if already upvoted
    if (current?.rating === 'up') {
      saveRating(finding, 'up'); // toggle logic handled server-side
    } else {
      saveRating(finding, 'up');
    }
  }

  function handleThumbsDown(finding: string) {
    const key = finding.slice(0, 200);
    const current = ratings[key];
    // Toggle off if already downvoted (no modal needed)
    if (current?.rating === 'down') {
      saveRating(finding, 'down');
    } else {
      // Open modal to capture reason
      setModalFinding(finding);
    }
  }

  function handleModalConfirm(reason: string) {
    if (modalFinding) {
      saveRating(modalFinding, 'down', reason);
      setModalFinding(null);
    }
  }

  return (
    <>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-medium text-slate-500">Rate each finding</p>
        <ul className="space-y-2">
          {findings.map((finding) => {
            const key = finding.slice(0, 200);
            const currentRating = ratings[key];
            const isLoading = pending === key;

            return (
              <li key={key} className="flex items-start gap-2">
                <div className="flex-1">
                  <span className="text-xs leading-relaxed text-slate-700">{finding}</span>
                  {currentRating?.rating === 'down' && currentRating.reason && (
                    <span className="mt-0.5 block text-[11px] text-red-500 opacity-80">
                      ↳ {currentRating.reason}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleThumbsUp(finding)}
                    disabled={isLoading}
                    title="Accurate / helpful"
                    className={`rounded p-1 transition-colors hover:bg-emerald-50 disabled:opacity-50 ${
                      currentRating?.rating === 'up'
                        ? 'text-emerald-600'
                        : 'text-slate-300 hover:text-emerald-500'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleThumbsDown(finding)}
                    disabled={isLoading}
                    title="Inaccurate / unhelpful"
                    className={`rounded p-1 transition-colors hover:bg-red-50 disabled:opacity-50 ${
                      currentRating?.rating === 'down'
                        ? 'text-red-500'
                        : 'text-slate-300 hover:text-red-400'
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <DownvoteModal
        open={modalFinding !== null}
        finding={modalFinding ?? ''}
        onConfirm={handleModalConfirm}
        onCancel={() => setModalFinding(null)}
      />
    </>
  );
}
