import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { FileUpload } from '@/components/osprey/FileUpload';
import type { OspreyJob } from '@/types';
import { Plus } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Setup',
  processing: 'Running',
  trial_complete: 'Trial done',
  complete: 'Complete',
  failed: 'Failed',
};

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  pending: 'default',
  processing: 'warning',
  trial_complete: 'warning',
  complete: 'success',
  failed: 'error',
};

export default async function OspreyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: jobs } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const jobList = (jobs as OspreyJob[]) ?? [];

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Osprey</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload a list and let AI enrich every row with targeted research.
          </p>
        </div>
      </div>

      {jobList.length === 0 ? (
        <div className="mx-auto max-w-2xl">
          <FileUpload />
        </div>
      ) : (
        <div className="space-y-8">
          {/* New job upload */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              New job
            </h2>
            <div className="max-w-2xl">
              <FileUpload />
            </div>
          </div>

          {/* Job history */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Job history
            </h2>
            <div className="space-y-3">
              {jobList.map((job) => (
                <Link key={job.id} href={`/osprey/jobs/${job.id}`}>
                  <Card className="flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {job.original_file_name ?? 'Untitled job'}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {job.rows_completed} / {job.total_rows} rows ·{' '}
                        {job.credits_used} credits used ·{' '}
                        {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[job.status] ?? 'default'}>
                      {STATUS_LABELS[job.status] ?? job.status}
                    </Badge>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

