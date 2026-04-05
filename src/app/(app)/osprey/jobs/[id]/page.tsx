import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SetupForm } from '@/components/osprey/SetupForm';
import { TrialResults } from '@/components/osprey/TrialResults';
import { ProgressUI } from '@/components/osprey/ProgressUI';
import { ArrowLeft } from 'lucide-react';
import type { OspreyJob, OspreyResult } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OspreyJobPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: jobRaw, error } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !jobRaw) notFound();

  const job = jobRaw as OspreyJob;

  let results: OspreyResult[] = [];
  if (['trial_complete', 'complete', 'processing'].includes(job.status)) {
    const { data } = await supabase
      .from('osprey_results')
      .select('*')
      .eq('job_id', id)
      .order('row_index', { ascending: true });
    results = (data as OspreyResult[]) ?? [];
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <Link
          href="/osprey"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Osprey
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          {job.original_file_name ?? 'Research job'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {job.total_rows} rows · created {new Date(job.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Render the right step based on job status */}
      {(job.status === 'pending' || !job.research_questions) && (
        <SetupForm job={job} />
      )}

      {job.status === 'trial_complete' && (
        <TrialResults job={job} results={results} />
      )}

      {(job.status === 'processing' || job.status === 'complete' || job.status === 'failed') && (
        <ProgressUI job={job} />
      )}
    </div>
  );
}
