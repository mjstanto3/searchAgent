import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ runId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { runId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : null;

  if (!feedback) {
    return NextResponse.json({ error: 'feedback is required' }, { status: 400 });
  }

  // RLS ensures user can only update their own runs
  const { error } = await supabase
    .from('runs')
    .update({ user_feedback: feedback })
    .eq('id', runId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
