'use client';

import { useEffect, useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, Download, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OspreyJob } from '@/types';

interface ProgressUIProps {
  job: OspreyJob;
}

export function ProgressUI({ job: initialJob }: ProgressUIProps) {
  const [job, setJob] = useState<OspreyJob>(initialJob);
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pollJob() {
    try {
      const res = await fetch(`/api/osprey/jobs/${job.id}`);
      if (!res.ok) return;
      const data = await res.json();
      const updated: OspreyJob = data.job;
      setJob(updated);

      // Get the most recently completed result's target
      if (data.results && data.results.length > 0) {
        const completed = [...data.results]
          .filter((r: { status: string }) => r.status === 'complete')
          .sort((a: { row_index: number }, b: { row_index: number }) => b.row_index - a.row_index);
        if (completed[0]) setCurrentTarget(completed[0].research_target);
      }

      // Get signed download URL when complete
      if (updated.status === 'complete' && !downloadUrl) {
        const urlRes = await fetch(`/api/osprey/jobs/${job.id}/download`);
        if (urlRes.ok) {
          const urlData = await urlRes.json();
          setDownloadUrl(urlData.url);
        }
      }

      if (updated.status === 'complete' || updated.status === 'failed' || updated.status === 'cancelled') {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {
      // Silent — keep polling
    }
  }

  async function restartJob() {
    setRestarting(true);
    setRestartError(null);
    try {
      const res = await fetch(`/api/osprey/jobs/${job.id}/run`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Restart failed');
      }
      setJob((prev) => ({ ...prev, status: 'processing' }));
      // Clear any stale interval before starting a fresh one
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(pollJob, 5000);
      pollJob();
      // restarting stays true — once status flips to processing, this branch no longer renders
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Restart failed. Please try again.');
      setRestarting(false);
    }
  }

  async function cancelJob() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/osprey/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Cancel failed');
      }
      setJob((prev) => ({ ...prev, status: 'cancelled' }));
      if (intervalRef.current) clearInterval(intervalRef.current);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancel failed. Please try again.');
      setCancelling(false);
    }
  }

  useEffect(() => {
    if (job.status === 'processing') {
      intervalRef.current = setInterval(pollJob, 5000);
      pollJob();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = job.total_rows > 0
    ? Math.round((job.rows_completed / job.total_rows) * 100)
    : 0;

  if (job.status === 'complete') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <div>
            <p className="font-semibold text-green-900">Research complete</p>
            <p className="mt-0.5 text-sm text-green-700">
              {job.rows_completed} of {job.total_rows} rows enriched · {job.credits_used} credits used
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-center">
          <p className="mb-4 text-sm text-slate-500">
            A download link has been sent to your email. You can also download directly below.
          </p>
          {downloadUrl ? (
            <a href={downloadUrl} download>
              <Button className="gap-2">
                <Download className="h-4 w-4" />
                Download Enriched File
              </Button>
            </a>
          ) : (
            <Button disabled className="gap-2">
              <Download className="h-4 w-4" />
              Preparing download…
            </Button>
          )}
          <p className="mt-3 text-xs text-slate-400">Download link expires in 7 days</p>
        </div>
      </div>
    );
  }

  if (job.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
          <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-800">Run cancelled</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {job.rows_completed > 0
                ? `${job.rows_completed} of ${job.total_rows} row${job.total_rows !== 1 ? 's' : ''} completed · ${job.credits_used} credit${job.credits_used !== 1 ? 's' : ''} used.`
                : 'No rows were completed.'}
            </p>
          </div>
        </div>
        {job.rows_completed < job.total_rows && (
          <div className="flex flex-col items-end gap-1">
            <Button onClick={restartJob} disabled={restarting}>
              {restarting ? 'Restarting…' : `Resume — ${job.total_rows - job.rows_completed} rows remaining`}
            </Button>
            {restartError && (
              <p className="text-xs text-red-600">{restartError}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">Research failed</p>
            <p className="mt-0.5 text-sm text-red-700">
              {job.error_message ?? 'An unexpected error occurred.'}
              {job.rows_completed > 0 && (
                <> {job.rows_completed} row{job.rows_completed !== 1 ? 's' : ''} were completed and you were charged {job.credits_used} credit{job.credits_used !== 1 ? 's' : ''}.</>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Processing state
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Running research…</h2>
        <p className="mt-1 text-sm text-slate-500">
          You can leave this page — your research will continue in the background.
          We&apos;ll send you an email when it&apos;s done.
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {job.rows_completed} / {job.total_rows}
            {currentTarget && (
              <span className="ml-2 font-normal text-slate-500">
                — Current topic: <span className="font-medium">{currentTarget}</span>
              </span>
            )}
          </span>
          <span className="text-slate-500">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            Researching…
          </div>
          {cancelError && (
            <p className="text-xs text-red-600">{cancelError}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={cancelJob}
          disabled={cancelling}
          className="text-slate-500 hover:text-red-600"
        >
          <XCircle className="mr-1.5 h-4 w-4" />
          {cancelling ? 'Cancelling…' : 'Cancel run'}
        </Button>
      </div>
    </div>
  );
}
