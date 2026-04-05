import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { runId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: run, error } = await supabase
    .from('runs')
    .select('id, status, quality_score, error_message')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: run.status,
    quality_score: run.quality_score ?? null,
    error_message: run.error_message ?? null,
  });
}
