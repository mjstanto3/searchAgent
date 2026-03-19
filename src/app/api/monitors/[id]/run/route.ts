import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runMonitor } from '@/lib/anthropic/runMonitor';
import { sendBriefEmail } from '@/lib/resend/sendBrief';
import { calculateRunCost } from '@/lib/stripe/client';
import { checkRateLimit, getNextRunDate } from '@/lib/utils';
import type { Monitor, Credits } from '@/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate-limit: max 10 manual runs per hour per user
  const rl = checkRateLimit(`run:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429 },
    );
  }

  // Fetch monitor (RLS ensures user can only access their own)
  const { data: monitor, error: monitorError } = await supabase
    .from('monitors')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (monitorError || !monitor) {
    return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
  }

  const m = monitor as Monitor;

  // Check credits server-side before running
  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = (credits as Credits | null)?.balance ?? 0;
  const runCost = calculateRunCost(m.max_results, !!m.document_path);

  if (balance < runCost) {
    return NextResponse.json(
      {
        error: `Insufficient credits. This run costs ${runCost} credits but you have ${balance}.`,
      },
      { status: 402 },
    );
  }

  // Create a pending run record
  const { data: run, error: runInsertError } = await supabase
    .from('runs')
    .insert({
      monitor_id: m.id,
      user_id: user.id,
      status: 'running',
    })
    .select()
    .single();

  if (runInsertError || !run) {
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
  }

  try {
    // Download document context if available
    let documentContext: string | undefined;
    if (m.document_path) {
      const { data: fileData } = await supabase.storage
        .from('documents')
        .download(m.document_path);
      if (fileData) {
        documentContext = await fileData.text();
        // Truncate to prevent excessive context
        documentContext = documentContext.slice(0, 8000);
      }
    }

    // Run the Anthropic API call (server-side only)
    const brief = await runMonitor(m, documentContext);

    // Decrement credits atomically via Supabase RPC
    const { error: creditError } = await supabase.rpc('decrement_credits', {
      p_user_id: user.id,
      p_amount: brief.creditsUsed,
      p_description: `Monitor run: ${m.name}`,
    });

    if (creditError) {
      console.error('Credit decrement failed:', creditError);
    }

    // Update run record
    await supabase
      .from('runs')
      .update({
        status: 'completed',
        brief_markdown: brief.markdown,
        brief_html: brief.html,
        credits_used: brief.creditsUsed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    // Update monitor timestamps
    await supabase
      .from('monitors')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: getNextRunDate(m.frequency).toISOString(),
      })
      .eq('id', m.id);

    // Send email brief
    if (user.email) {
      try {
        await sendBriefEmail(user.email, m, {
          ...run,
          brief_html: brief.html,
          brief_markdown: brief.markdown,
          status: 'completed',
        });
        await supabase.from('runs').update({ email_sent: true }).eq('id', run.id);
      } catch (emailErr) {
        console.error('Email delivery failed:', emailErr);
      }
    }

    return NextResponse.json({ success: true, runId: run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
