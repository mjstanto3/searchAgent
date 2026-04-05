import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { RunButton } from '@/components/monitor/RunButton';
import type { Monitor, Credits } from '@/types';
import { Plus, Calendar, Zap } from 'lucide-react';

export default async function MagpiePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth is handled by the layout, but user could be null in edge cases
  if (!user) return null;

  const [{ data: monitors }, { data: credits }] = await Promise.all([
    supabase
      .from('monitors')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
  ]);

  const balance = (credits as Credits | null)?.balance ?? 0;
  const monitorList = (monitors as Monitor[]) ?? [];

  const frequencyLabel: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Magpie</h1>
          <p className="mt-1 text-sm text-slate-500">
            {monitorList.length} of 10 monitors used
          </p>
        </div>
        <Link href="/monitors/new">
          <Button className="gap-2" disabled={monitorList.length >= 10}>
            <Plus className="h-4 w-4" />
            New monitor
          </Button>
        </Link>
      </div>

      {monitorList.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <Zap className="h-7 w-7 text-indigo-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            No monitors yet
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            Create your first research monitor to start receiving AI-powered briefs.
          </p>
          <Link href="/monitors/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first monitor
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {monitorList.map((monitor) => (
            <Card key={monitor.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">
                    {monitor.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {monitor.topic}
                  </p>
                </div>
                <Badge variant={monitor.is_active ? 'success' : 'default'}>
                  {monitor.is_active ? 'Active' : 'Paused'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {frequencyLabel[monitor.frequency]}
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  Max {monitor.max_results} results
                </span>
                {monitor.last_run_at && (
                  <span>
                    Last run:{' '}
                    {new Date(monitor.last_run_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                <Link href={`/monitors/${monitor.id}`} className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full">
                    View details
                  </Button>
                </Link>
                <RunButton
                  monitorId={monitor.id}
                  disabled={balance <= 0}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {balance <= 5 && (
        <div className="mt-8 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Low credits</p>
              <p className="mt-0.5 text-sm text-yellow-700">
                You have {balance} credits remaining.{' '}
                <Link
                  href="/magpie/credits"
                  className="underline hover:no-underline"
                >
                  Purchase more
                </Link>{' '}
                to keep your monitors running.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
