import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Monitor, Run, Credits } from '@/types';
import { ArrowLeft, Calendar, Zap, FileText, Clock } from 'lucide-react';

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
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar email={user.email} credits={balance} />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
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
            <div className="flex gap-2">
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
          <form action={`/api/monitors/${m.id}/run`} method="POST">
            <Button
              type="submit"
              size="sm"
              className="gap-1.5"
              disabled={balance <= 0}
            >
              <Zap className="h-3.5 w-3.5" />
              Run now
            </Button>
          </form>
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
                  <Badge variant={statusVariant[run.status] ?? 'default'}>
                    {run.status}
                  </Badge>
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
                {run.brief_markdown && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-500">
                      View brief
                    </summary>
                    <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-slate-700 text-xs leading-relaxed">
                      {run.brief_markdown}
                    </div>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
