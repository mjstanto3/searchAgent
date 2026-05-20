import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeInput } from '@/lib/sanitize';

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

  const { data: job, error } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  // Fetch results if trial_complete, complete, processing, or cancelled
  let results = null;
  if (job.status === 'trial_complete' || job.status === 'complete' ||
      job.status === 'processing' || job.status === 'cancelled') {
    const { data } = await supabase
      .from('osprey_results')
      .select('*')
      .eq('job_id', id)
      .order('row_index', { ascending: true });
    results = data ?? [];
  }

  return NextResponse.json({ job, results });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job } = await supabase
    .from('osprey_jobs')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  if (['complete', 'failed', 'cancelled'].includes(job.status)) {
    return NextResponse.json({ error: 'Job cannot be cancelled in its current state.' }, { status: 409 });
  }

  const { error: cancelError } = await supabase
    .from('osprey_jobs')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (cancelError) {
    return NextResponse.json({ error: 'Failed to cancel job.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  // Sanitize text fields
  const update: Record<string, unknown> = {};

  if (body.clarifying_answers !== undefined) {
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.clarifying_answers as Record<string, string>)) {
      answers[sanitizeInput(k, 500)] = sanitizeInput(String(v), 2000);
    }
    update.clarifying_answers = answers;
  }

  if (body.research_questions !== undefined) {
    update.research_questions = (body.research_questions as string[])
      .slice(0, 5)
      .map((q: string) => sanitizeInput(q, 500))
      .filter(Boolean);
  }

  if (body.suggested_sources !== undefined) {
    update.suggested_sources = (body.suggested_sources as string[])
      .slice(0, 10)
      .map((s: string) => sanitizeInput(s, 200))
      .filter(Boolean);
  }

  if (body.effort_tier !== undefined) {
    const tier = body.effort_tier;
    if (!['low', 'medium', 'large'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid effort tier.' }, { status: 400 });
    }
    update.effort_tier = tier;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('osprey_jobs')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update job.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
