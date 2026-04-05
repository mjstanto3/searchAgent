import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job } = await supabase
    .from('osprey_jobs')
    .select('enriched_file_url, status, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  if (job.status !== 'complete') return NextResponse.json({ error: 'Job not complete.' }, { status: 409 });
  if (!job.enriched_file_url) return NextResponse.json({ error: 'Enriched file not available.' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from('osprey-files')
    .createSignedUrl(job.enriched_file_url, 7 * 24 * 60 * 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL.' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
