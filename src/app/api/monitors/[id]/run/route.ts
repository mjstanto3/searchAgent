import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@/lib/supabase/server';
import { runMonitor, type PreviousRunContext } from '@/lib/anthropic/runMonitor';
import { generateSuggestions } from '@/lib/anthropic/generateSuggestions';
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

  // All validation passed — return immediately and process in the background
  const processRun = async () => {
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

      // Fetch last 3 completed runs with feedback to build learning context
      // Also fetch found_urls from runs within the date window for deduplication
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - (m.date_window_days ?? 30));

      const { data: pastRuns } = await supabase
        .from('runs')
        .select('user_feedback, finding_ratings, found_urls, completed_at')
        .eq('monitor_id', m.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10);

      const previousRuns: PreviousRunContext[] = (pastRuns ?? []).slice(0, 3).map((r) => ({
        feedback: r.user_feedback ?? undefined,
        findingRatings: r.finding_ratings ?? undefined,
      }));

      // Build seenUrls from all completed runs within the current window
      const seenUrls = new Set<string>();
      for (const r of pastRuns ?? []) {
        if (!r.completed_at) continue;
        if (new Date(r.completed_at) >= windowStart && Array.isArray(r.found_urls)) {
          for (const url of r.found_urls) seenUrls.add(url);
        }
      }

      // Run the Anthropic API call (server-side only)
      const brief = await runMonitor(m, documentContext, previousRuns, seenUrls);

      // Decrement credits atomically via Supabase RPC
      const { error: creditError } = await supabase.rpc('decrement_credits', {
        p_user_id: user.id,
        p_amount: runCost,
        p_description: `Monitor run: ${m.name}`,
      });

      if (creditError) {
        console.error('Credit decrement failed:', creditError);
      }

      // Update run record
      const { error: updateErr } = await supabase
        .from('runs')
        .update({
          status: 'completed',
          brief_markdown: brief.markdown,
          brief_html: brief.html,
          credits_used: runCost,
          quality_score: brief.qualityScore > 0 ? brief.qualityScore : null,
          retried_search: brief.retriedSearch,
          removed_findings: brief.removedFindings,
          found_urls: brief.foundUrls.length > 0 ? brief.foundUrls : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);
      if (updateErr) console.error(`Failed to mark run ${run.id} completed:`, updateErr);

      // Generate research suggestions in the background (non-blocking)
      generateSuggestions(m, brief.markdown).then(async (suggestions) => {
        if (suggestions.length > 0) {
          await supabase.from('runs').update({ suggestions }).eq('id', run.id);
        }
      }).catch((err) => console.error('Suggestion generation failed:', err));

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
    }
  };

  waitUntil(processRun());
  return NextResponse.json({ success: true, runId: run.id }, { status: 202 });
}
