import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@/lib/supabase/server';
import { researchRow } from '@/lib/osprey/researchRow';
import { generateEnrichedWorkbook } from '@/lib/osprey/generateEnrichedFile';
import { sendOspreyCompleteEmail } from '@/lib/resend/sendOspreyComplete';
import type { OspreyJob, OspreyResult, OspreyEffortTier } from '@/types';

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

  // Fetch job
  const { data: jobRaw, error: jobErr } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (jobErr || !jobRaw) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const job = jobRaw as OspreyJob;

  if (job.status !== 'trial_complete' && job.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'Job must be in trial_complete or cancelled status to start a run.' },
      { status: 409 },
    );
  }

  // Credit check: for a fresh run charge all non-trial rows; for a restart charge only uncompleted rows
  const requiredCredits = job.status === 'cancelled'
    ? Math.max(0, job.total_rows - (job.rows_completed ?? 0))
    : job.total_rows - Math.min(3, job.total_rows);

  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = (credits as { balance: number } | null)?.balance ?? 0;
  if (balance < requiredCredits) {
    return NextResponse.json(
      {
        error: `Insufficient credits. This run requires ${requiredCredits} credits but you have ${balance}.`,
        creditsRequired: requiredCredits,
        creditsAvailable: balance,
      },
      { status: 402 },
    );
  }

  // Atomic status transition: generate a unique run_id and write it together with
  // status: 'processing'. The .in() filter means if another request already started
  // a run (or the status changed), this update affects 0 rows and we return 409.
  const newRunId = crypto.randomUUID();
  const { data: updated } = await supabase
    .from('osprey_jobs')
    .update({ status: 'processing', run_id: newRunId })
    .in('status', ['trial_complete', 'cancelled'])
    .eq('id', id)
    .select('id');

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Job is already running or is no longer in a restartable state.' },
      { status: 409 },
    );
  }

  waitUntil(processFullRun(id, user.id, user.email ?? '', newRunId));

  return NextResponse.json({ ok: true }, { status: 202 });
}

async function processFullRun(jobId: string, userId: string, userEmail: string, runId: string) {
  const { createClient: createServer } = await import('@/lib/supabase/server');
  const supabase = await createServer();

  const { data: jobRaw } = await supabase
    .from('osprey_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!jobRaw) return;

  const job = jobRaw as OspreyJob;
  const parsedData = (job.parsed_data as Record<string, string>[]) ?? [];
  const headers = Object.keys(parsedData[0] ?? {});
  const primaryColumn = headers[0] ?? 'Target';
  const effortTier = (job.effort_tier as OspreyEffortTier) ?? 'medium';
  const clarifyingAnswers = (job.clarifying_answers as Record<string, string>) ?? {};
  const researchQuestions = (job.research_questions as string[]) ?? [];
  const suggestedSources = (job.suggested_sources as string[]) ?? [];

  // Fetch already-completed rows (trial rows + any rows from a prior partial run)
  const { data: existingResults } = await supabase
    .from('osprey_results')
    .select('row_index')
    .eq('job_id', jobId);

  const completedIndices = new Set((existingResults ?? []).map((r) => r.row_index));

  let totalCreditsUsed = job.credits_used ?? 0;
  let rowsCompleted = job.rows_completed ?? 0;

  // Process remaining rows (skip already completed)
  for (let i = 0; i < parsedData.length; i++) {
    if (completedIndices.has(i)) continue;

    // Cancel/zombie check before each row
    const { data: check } = await supabase
      .from('osprey_jobs')
      .select('status, run_id')
      .eq('id', jobId)
      .single();
    if (check?.status === 'cancelled') return;
    if (check?.run_id !== runId) return; // a newer run has started — exit as zombie

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
        job_id: jobId,
        user_id: userId,
        row_index: i,
        research_target: primaryValue,
        answers: result.answers,
        status: 'complete',
        credits_used: 1,
      });

      const { error: deductErr } = await supabase.rpc('decrement_credits', {
        p_user_id: userId,
        p_amount: 1,
        p_description: `Osprey row ${i + 1}: ${primaryValue}`,
      });
      if (deductErr) console.error(`[osprey:run] credit deduction failed row ${i + 1}:`, deductErr);

      totalCreditsUsed += 1;
      rowsCompleted += 1;
    } else {
      await supabase.from('osprey_results').upsert({
        job_id: jobId,
        user_id: userId,
        row_index: i,
        research_target: primaryValue,
        answers: null,
        status: 'failed',
        credits_used: 0,
        error_message: error ?? 'Research failed',
      }, { onConflict: 'job_id,row_index' });
    }

    // Update progress after each row
    await supabase
      .from('osprey_jobs')
      .update({ rows_completed: rowsCompleted, credits_used: totalCreditsUsed })
      .eq('id', jobId);
  }

  // Cancel/zombie check before cleanup pass
  const { data: cancelCheck } = await supabase
    .from('osprey_jobs')
    .select('status, run_id')
    .eq('id', jobId)
    .single();
  if (cancelCheck?.status === 'cancelled') return;
  if (cancelCheck?.run_id !== runId) return;

  // Cleanup pass: retry all failed rows one more time
  const { data: failedRows } = await supabase
    .from('osprey_results')
    .select('*')
    .eq('job_id', jobId)
    .eq('status', 'failed');

  for (const failed of failedRows ?? []) {
    // Cancel/zombie check before each retry row
    const { data: retryCheck } = await supabase
      .from('osprey_jobs')
      .select('status, run_id')
      .eq('id', jobId)
      .single();
    if (retryCheck?.status === 'cancelled') return;
    if (retryCheck?.run_id !== runId) return;

    const row = parsedData[failed.row_index];
    if (!row) continue;

    const primaryValue = row[primaryColumn] ?? '';
    const contextColumns: Record<string, string> = {};
    for (const [col, val] of Object.entries(row)) {
      if (col !== primaryColumn) contextColumns[col] = val;
    }

    const { result } = await researchRow({
      primaryColumn,
      primaryValue,
      contextColumns,
      clarifyingAnswers,
      researchQuestions,
      suggestedSources,
      effortTier,
    });

    if (result) {
      await supabase
        .from('osprey_results')
        .update({
          answers: result.answers,
          status: 'complete',
          credits_used: 1,
          error_message: null,
        })
        .eq('id', failed.id);

      const { error: retryDeductErr } = await supabase.rpc('decrement_credits', {
        p_user_id: userId,
        p_amount: 1,
        p_description: `Osprey retry row ${failed.row_index + 1}: ${primaryValue}`,
      });
      if (retryDeductErr) console.error(`[osprey:run] credit deduction failed retry row ${failed.row_index + 1}:`, retryDeductErr);

      totalCreditsUsed += 1;
      rowsCompleted += 1;

      await supabase
        .from('osprey_jobs')
        .update({ rows_completed: rowsCompleted, credits_used: totalCreditsUsed })
        .eq('id', jobId);
    }
  }

  // Fetch all final results for file generation
  const { data: allResults } = await supabase
    .from('osprey_results')
    .select('*')
    .eq('job_id', jobId)
    .order('row_index', { ascending: true });

  // Generate enriched XLSX
  let enrichedFileUrl: string | undefined;
  let downloadUrl: string | undefined;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const workbookBuffer = generateEnrichedWorkbook({
      originalRows: parsedData,
      headers,
      researchQuestions,
      results: (allResults as OspreyResult[]) ?? [],
    });

    const enrichedPath = `${userId}/${jobId}-enriched.xlsx`;
    await supabase.storage
      .from('osprey-files')
      .upload(enrichedPath, workbookBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    const { data: signedData } = await supabase.storage
      .from('osprey-files')
      .createSignedUrl(enrichedPath, 7 * 24 * 60 * 60);

    enrichedFileUrl = enrichedPath;
    downloadUrl = signedData?.signedUrl;
  } catch (err) {
    console.error('Failed to generate enriched file:', err);
  }

  // Mark job complete — guarded: only updates if still processing (not cancelled or superseded)
  await supabase
    .from('osprey_jobs')
    .update({
      status: rowsCompleted > 0 ? 'complete' : 'failed',
      enriched_file_url: enrichedFileUrl,
      rows_completed: rowsCompleted,
      credits_used: totalCreditsUsed,
      completed_at: new Date().toISOString(),
      error_message: rowsCompleted === 0 ? 'No rows could be researched successfully.' : null,
    })
    .eq('id', jobId)
    .eq('status', 'processing');

  // Send completion email
  if (downloadUrl && userEmail) {
    try {
      await sendOspreyCompleteEmail({
        to: userEmail,
        jobId,
        originalFileName: (job.original_file_name as string) ?? 'enriched-data.xlsx',
        totalRows: job.total_rows,
        rowsCompleted,
        questionsAnswered: researchQuestions.length,
        creditsUsed: totalCreditsUsed,
        downloadUrl,
        downloadExpiresAt: expiresAt.toLocaleDateString(),
      });
    } catch (err) {
      console.error('Failed to send completion email:', err);
    }
  }
}
