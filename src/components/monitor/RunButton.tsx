'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface RunButtonProps {
  monitorId: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

type RunState = 'idle' | 'loading' | 'polling' | 'slow' | 'success' | 'error';

const POLL_INTERVAL_MS = 15_000;       // 15 seconds between polls
const SLOW_THRESHOLD_MS = 30 * 60_000; // 30 minutes → enter "slow" state
const FINAL_CHECK_MS = 60 * 60_000;    // 60 minutes after slow → one final check

export function RunButton({ monitorId, disabled = false, size = 'sm' }: RunButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<RunState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const runIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(pollTimerRef.current ?? undefined);
      clearTimeout(slowTimerRef.current ?? undefined);
      clearTimeout(finalCheckTimerRef.current ?? undefined);
    };
  }, []);

  function clearAllTimers() {
    clearTimeout(pollTimerRef.current ?? undefined);
    clearTimeout(slowTimerRef.current ?? undefined);
    clearTimeout(finalCheckTimerRef.current ?? undefined);
  }

  async function checkRunStatus(runId: string): Promise<'running' | 'completed' | 'failed'> {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return 'running'; // treat fetch errors as still-running
      const data = await res.json();
      return data.status === 'completed' ? 'completed'
        : data.status === 'failed' ? 'failed'
        : 'running';
    } catch {
      return 'running';
    }
  }

  function schedulePoll(runId: string) {
    pollTimerRef.current = setTimeout(async () => {
      const status = await checkRunStatus(runId);
      if (status === 'completed') {
        clearAllTimers();
        setState('success');
        router.refresh();
      } else if (status === 'failed') {
        clearAllTimers();
        setErrorMsg('The run failed. Check your monitor settings and try again.');
        setState('error');
      } else {
        schedulePoll(runId); // still running — schedule next poll
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleRun() {
    setState('loading');
    setErrorMsg('');
    clearAllTimers();

    try {
      const res = await fetch(`/api/monitors/${monitorId}/run`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Run failed');
      }

      const runId: string = data.runId;
      runIdRef.current = runId;
      setState('polling');

      // Start polling every 15 seconds
      schedulePoll(runId);

      // At 30 minutes: enter "slow" state, stop regular polling
      slowTimerRef.current = setTimeout(() => {
        clearTimeout(pollTimerRef.current ?? undefined);
        setState('slow');

        // One final check 60 minutes later (90 min total)
        finalCheckTimerRef.current = setTimeout(async () => {
          const status = await checkRunStatus(runId);
          if (status === 'completed') {
            setState('success');
            router.refresh();
          }
          // If still running or failed, leave "slow" state — user already got the warning
        }, FINAL_CHECK_MS);
      }, SLOW_THRESHOLD_MS);

    } catch (err) {
      clearAllTimers();
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMsg(message);
      setState('error');
      setTimeout(() => setState('idle'), 8000);
    }
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Brief ready!
        </div>
        <p className="text-xs text-slate-500 pl-5.5">Check your inbox for the email brief.</p>
      </div>
    );
  }

  if (state === 'polling') {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Run in progress…
        </div>
        <p className="text-xs text-slate-500 pl-5.5">A brief will be emailed when complete. This may take a few minutes.</p>
      </div>
    );
  }

  if (state === 'slow') {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
          <Clock className="h-4 w-4 shrink-0" />
          Taking longer than expected
        </div>
        <p className="text-xs text-slate-500 pl-5.5">You&apos;ll still receive an email if the run completes.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={size === 'sm' ? 'ghost' : 'primary'}
      size={size}
      className="gap-1.5"
      disabled={disabled || state === 'loading'}
      onClick={handleRun}
      title={disabled ? 'Insufficient credits' : 'Run now'}
    >
      {state === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Zap className="h-3.5 w-3.5" />
      )}
      {state === 'loading' ? 'Starting…' : 'Run now'}
    </Button>
  );
}
