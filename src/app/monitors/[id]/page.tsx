import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { RunButton } from '@/components/monitor/RunButton';
import { RunFeedback } from '@/components/monitor/RunFeedback';
import { FindingRatings } from '@/components/monitor/FindingRatings';
import { RunSuggestions } from '@/components/monitor/RunSuggestions';
import type { Monitor, Run, Credits } from '@/types';
import { ArrowLeft, Calendar, Zap, FileText, Clock, Pencil } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MonitorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const [
    { data: monitor },
    { data: runs },
    { data: credits },
  ] = await Promise.all([
    supabase
      .from('monitors')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('runs')
      .select('*')
      .eq('monitor_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
  ]);

  if (!monitor) notFound();

  const m = monitor as Monitor;
  const runList = (runs as Run[]) ?? [];
  const balance = (credits as Credits | null)?.balance ?? 0;

  const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    pending: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'error',
    'timed out': 'error',
  };

  const STALE_RUN_MS = 2 * 60 * 60 * 1000; // 2 hours

  /** Returns display label + variant key, treating stale "running" as "timed out". */
  function runDisplayStatus(run: Run): string {
    if (
      run.status === 'running' &&
      Date.now() - new Date(run.created_at).getTime() > STALE_RUN_MS
    ) {
      return 'timed out';
    }
    return run.status;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar email={user.email} credits={balance} />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/magpie"
            className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{m.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{m.topic}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/monitors/${id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <Badge variant={m.is_active ? 'success' : 'default'}>
                {m.is_active ? 'Active' : 'Paused'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Calendar className="h-4 w-4" />
              Frequency
            </div>
            <p className="mt-1 text-lg font-semibold capitalize text-slate-900">
              {m.frequency}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Zap className="h-4 w-4" />
              Max results
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {m.max_results}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              Next run
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {m.next_run_at
                ? new Date(m.next_run_at).toLocaleDateString()
                : 'Not scheduled'}
            </p>
          </Card>
        </div>

        {m.keywords && m.keywords.length > 0 && (
          <Card className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {m.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-slate-100 px-3 py-0.5 text-sm text-slate-700"
                >
                  {k}
                </span>
              ))}
            </div>
          </Card>
        )}

        {m.sources && m.sources.length > 0 && (
          <Card className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Priority sources
            </p>
            <div className="flex flex-wrap gap-2">
              {m.sources.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-indigo-50 px-3 py-0.5 text-sm text-indigo-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}

        {m.document_name && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="font-medium">Uploaded document:</span>
              {m.document_name}
            </div>
          </Card>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Run history</h2>
          <RunButton
            monitorId={m.id}
            disabled={balance <= 0}
            size="sm"
          />
        </div>

        {runList.length === 0 ? (
          <Card className="py-10 text-center">
            <p className="text-sm text-slate-500">No runs yet. Trigger a manual run or wait for the scheduled delivery.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {runList.map((run) => (
              <Card key={run.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusVariant[runDisplayStatus(run)] ?? 'default'}>
                      {runDisplayStatus(run)}
                    </Badge>
                    {run.quality_score != null && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          run.quality_score >= 4
                            ? 'bg-green-100 text-green-700'
                            : run.quality_score >= 3
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                        title="Internal quality score (1–5)"
                      >
                        ★ {run.quality_score}/5
                      </span>
                    )}
                    {run.retried_search && (
                      <span
                        className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                        title="A second search was run to fill result gaps"
                      >
                        ↻ Retried
                      </span>
                    )}
                    {run.removed_findings != null && run.removed_findings > 0 && (
                      <span
                        className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        title="Findings removed during URL validation or quality evaluation"
                      >
                        {run.removed_findings} removed
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                {run.credits_used !== undefined && run.credits_used !== null && (
                  <p className="text-xs text-slate-500">
                    Credits used: {run.credits_used}
                  </p>
                )}
                {run.error_message && (
                  <p className="text-sm text-red-600">{run.error_message}</p>
                )}
                {run.brief_html && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-500">
                      View brief
                    </summary>
                    <div
                      className="prose prose-sm mt-3 max-w-none rounded-lg bg-slate-50 p-4"
                      dangerouslySetInnerHTML={{ __html: run.brief_html }}
                    />
                    {run.brief_markdown && (
                      <FindingRatings
                        runId={run.id}
                        briefMarkdown={run.brief_markdown}
                        initialRatings={run.finding_ratings}
                      />
                    )}
                  </details>
                )}
                {run.status === 'completed' && (
                  <RunFeedback
                    runId={run.id}
                    initialFeedback={run.user_feedback}
                  />
                )}
                {run.status === 'completed' && run.suggestions && run.suggestions.length > 0 && (
                  <RunSuggestions
                    runId={run.id}
                    monitorId={m.id}
                    suggestions={run.suggestions}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
