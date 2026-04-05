import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { researchRow } from '@/lib/osprey/researchRow';
import type { OspreyJob, OspreyEffortTier } from '@/types';

interface Params {
  params: Promise<{ id: string }>;
}

const TRIAL_ROWS = 3;

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch job
  const { data: jobRaw, error: jobErr } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (jobErr || !jobRaw) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const job = jobRaw as OspreyJob;

  if (!['pending', 'trial_complete'].includes(job.status)) {
    return NextResponse.json(
      { error: 'Job is not in a state that allows a trial run.' },
      { status: 409 },
    );
  }

  const researchQuestions = (job.research_questions as string[]) ?? [];
  if (researchQuestions.length === 0) {
    return NextResponse.json(
      { error: 'No research questions defined. Please complete the setup form first.' },
      { status: 400 },
    );
  }

  // Credit check: 1 credit per row for TRIAL_ROWS rows
  const trialCost = TRIAL_ROWS;
  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = (credits as { balance: number } | null)?.balance ?? 0;
  if (balance < trialCost) {
    return NextResponse.json(
      {
        error: `Insufficient credits. Trial run requires ${trialCost} credits but you have ${balance}.`,
        creditsRequired: trialCost,
        creditsAvailable: balance,
      },
      { status: 402 },
    );
  }

  // Mark job as processing, clear any old trial results
  await supabase
    .from('osprey_jobs')
    .update({ status: 'processing', rows_completed: 0, credits_used: 0 })
    .eq('id', id);

  // Delete old trial results if re-running
  await supabase
    .from('osprey_results')
    .delete()
    .eq('job_id', id)
    .lte('row_index', TRIAL_ROWS - 1);

  const parsedData = (job.parsed_data as Record<string, string>[]) ?? [];
  const primaryColumn = Object.keys(parsedData[0] ?? {})[0] ?? 'Target';
  const effortTier = (job.effort_tier as OspreyEffortTier) ?? 'medium';
  const clarifyingAnswers = (job.clarifying_answers as Record<string, string>) ?? {};
  const suggestedSources = (job.suggested_sources as string[]) ?? [];

  let totalCreditsUsed = 0;
  let rowsCompleted = 0;

  // Process first TRIAL_ROWS rows sequentially
  for (let i = 0; i < Math.min(TRIAL_ROWS, parsedData.length); i++) {
    const row = parsedData[i];
    const primaryValue = row[primaryColumn] ?? '';
    const contextColumns: Record<string, string> = {};
    for (const [col, val] of Object.entries(row)) {
      if (col !== primaryColumn) contextColumns[col] = val;
    }

    const { result, error } = await researchRow({
      primaryColumn,
      primaryValue,
      contextColumns,
      clarifyingAnswers,
      researchQuestions,
      suggestedSources,
      effortTier,
    });

    if (result) {
      await supabase.from('osprey_results').insert({
        job_id: id,
        user_id: user.id,
        row_index: i,
        research_target: primaryValue,
        answers: result.answers,
        status: 'complete',
        credits_used: 1,
      });

      // Decrement credit after successful row
      await supabase.rpc('decrement_credits', {
        p_user_id: user.id,
        p_amount: 1,
        p_description: `Osprey trial row ${i + 1}: ${primaryValue}`,
      });

      totalCreditsUsed += 1;
      rowsCompleted += 1;
    } else {
      await supabase.from('osprey_results').insert({
        job_id: id,
        user_id: user.id,
        row_index: i,
        research_target: primaryValue,
        answers: null,
        status: 'failed',
        credits_used: 0,
        error_message: error ?? 'Research failed',
      });
    }
  }

  // Update job status
  await supabase
    .from('osprey_jobs')
    .update({
      status: 'trial_complete',
      rows_completed: rowsCompleted,
      credits_used: totalCreditsUsed,
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, rowsCompleted, creditsUsed: totalCreditsUsed });
}
