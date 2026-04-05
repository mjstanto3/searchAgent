import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseFileBuffer } from '@/lib/osprey/parseFile';
import { assessDataset } from '@/lib/osprey/assessDataset';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_CONCURRENT_JOBS = 3;
const ACCEPTED_TYPES = ['csv', 'json', 'xls', 'xlsx'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: max 3 concurrent active jobs
  const { count: activeCount } = await supabase
    .from('osprey_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['pending', 'processing', 'trial_complete']);

  if ((activeCount ?? 0) >= MAX_CONCURRENT_JOBS) {
    return NextResponse.json(
      { error: 'You have reached the maximum of 3 active jobs. Complete or delete an existing job first.' },
      { status: 429 },
    );
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  // Validate file type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPTED_TYPES.includes(ext)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload CSV, JSON, XLS, or XLSX.' },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 10 MB.' },
      { status: 400 },
    );
  }

  // Read buffer and parse
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let parsed;
  try {
    parsed = parseFileBuffer(buffer, file.name);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (parsed.rowCount === 0) {
    return NextResponse.json({ error: 'The file contains no data rows.' }, { status: 400 });
  }

  if (parsed.rowCount > MAX_ROWS) {
    return NextResponse.json(
      { error: `File has ${parsed.rowCount} rows. Maximum is ${MAX_ROWS}.` },
      { status: 400 },
    );
  }

  // Upload original file to Supabase storage
  const storagePath = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('osprey-files')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload failed:', uploadError);
    return NextResponse.json(
      { error: 'Failed to store file. Please try again.' },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from('osprey-files')
    .getPublicUrl(storagePath);

  // Call Anthropic to assess dataset
  let assessment;
  try {
    assessment = await assessDataset(parsed);
  } catch (err) {
    console.error('Dataset assessment failed:', err);
    // Non-fatal — continue with empty assessment
    assessment = { summary: '', clarifyingQuestions: [] };
  }

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from('osprey_jobs')
    .insert({
      user_id: user.id,
      status: 'pending',
      original_file_url: urlData.publicUrl,
      original_file_name: file.name,
      parsed_data: parsed.rows,
      llm_assessment: assessment.summary,
      clarifying_questions: assessment.clarifyingQuestions,
      total_rows: parsed.rowCount,
      effort_tier: 'medium',
    })
    .select('id')
    .single();

  if (jobError || !job) {
    console.error('Job creation failed:', jobError);
    return NextResponse.json(
      { error: 'Failed to create job. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
