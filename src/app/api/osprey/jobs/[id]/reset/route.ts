import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only allow resetting jobs in trial_complete state
  const { data: job } = await supabase
    .from('osprey_jobs')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  if (job.status !== 'trial_complete') {
    return NextResponse.json({ error: 'Job cannot be reset.' }, { status: 409 });
  }

  // Delete trial results and reset status
  await supabase.from('osprey_results').delete().eq('job_id', id);
  await supabase
    .from('osprey_jobs')
    .update({ status: 'pending', rows_completed: 0, credits_used: 0 })
    .eq('id', id);

  return NextResponse.json({ ok: true });
}
