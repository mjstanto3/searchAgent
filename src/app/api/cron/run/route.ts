import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runMonitor, type PreviousRunContext } from '@/lib/anthropic/runMonitor';
import { generateSuggestions } from '@/lib/anthropic/generateSuggestions';
import { sendBriefEmail } from '@/lib/resend/sendBrief';
import { calculateRunCost } from '@/lib/stripe/client';
import { getNextRunDate } from '@/lib/utils';
import type { Monitor } from '@/types';

// Service-role client bypasses RLS for cron operations
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  // Protect the cron endpoint with a secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const now = new Date();

  // Find all active monitors due to run
  const { data: monitors, error } = await supabase
    .from('monitors')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now.toISOString())
    .limit(50); // Process at most 50 at a time per cron tick

  if (error) {
    console.error('Failed to fetch due monitors:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { processed: 0, failed: 0, skipped: 0 };

  for (const monitor of monitors as Monitor[]) {
    let run: { id: string; monitor_id: string; user_id: string; email_sent: boolean; created_at: string; status: string } | null = null;
    try {
      // Fetch user info for email
      const { data: userRow } = await supabase
        .from('users')
        .select('email')
        .eq('id', monitor.user_id)
        .single();

      // Check user credits
      const { data: credits } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', monitor.user_id)
        .single();

      const balance = credits?.balance ?? 0;
      const runCost = calculateRunCost(monitor.max_results, !!monitor.document_path);

      if (balance < runCost) {
        results.skipped++;
        continue;
      }

      // Create run record
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .insert({
          monitor_id: monitor.id,
          user_id: monitor.user_id,
          status: 'running',
        })
        .select()
        .single();

      if (runErr || !runData) {
        results.failed++;
        continue;
      }
      run = runData;

      // Load document context if any
      let documentContext: string | undefined;
      if (monitor.document_path) {
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(monitor.document_path);
        if (fileData) {
          documentContext = (await fileData.text()).slice(0, 8000);
        }
      }

      // Fetch last 3 completed runs with feedback for learning context
      // Also fetch found_urls from runs within the date window for deduplication
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - (monitor.date_window_days ?? 30));

      const { data: pastRuns } = await supabase
        .from('runs')
        .select('user_feedback, finding_ratings, found_urls, completed_at')
        .eq('monitor_id', monitor.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10);

      const previousRuns: PreviousRunContext[] = (pastRuns ?? []).slice(0, 3).map((r) => ({
        feedback: r.user_feedback ?? undefined,
        findingRatings: r.finding_ratings ?? undefined,
      }));

      // Build seenUrls from completed runs within the current window
      const seenUrls = new Set<string>();
      for (const r of pastRuns ?? []) {
        if (!r.completed_at) continue;
        if (new Date(r.completed_at) >= windowStart && Array.isArray(r.found_urls)) {
          for (const url of r.found_urls) seenUrls.add(url);
        }
      }

      // Run the AI
      const brief = await runMonitor(monitor, documentContext, previousRuns, seenUrls);

      // Decrement credits
      await supabase.rpc('decrement_credits', {
        p_user_id: monitor.user_id,
        p_amount: runCost,
        p_description: `Scheduled run: ${monitor.name}`,
      });

      // Update run
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
        .eq('id', run!.id);
      if (updateErr) console.error(`Failed to mark run ${run!.id} completed:`, updateErr);

      // Generate suggestions non-blocking
      generateSuggestions(monitor, brief.markdown).then(async (suggestions) => {
        if (suggestions.length > 0) {
          await supabase.from('runs').update({ suggestions }).eq('id', run!.id);
        }
      }).catch((err) => console.error(`Suggestions failed for run ${run!.id}:`, err));

      // Update monitor
      await supabase
        .from('monitors')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: getNextRunDate(monitor.frequency).toISOString(),
        })
        .eq('id', monitor.id);

      // Send email
      if (userRow?.email) {
        try {
          await sendBriefEmail(userRow.email, monitor, {
            ...run!,
            brief_html: brief.html,
            brief_markdown: brief.markdown,
            status: 'completed',
          });
          await supabase.from('runs').update({ email_sent: true }).eq('id', run!.id);
        } catch (emailErr) {
          console.error(`Email failed for monitor ${monitor.id}:`, emailErr);
        }
      }

      results.processed++;
    } catch (err) {
      console.error(`Error processing monitor ${monitor.id}:`, err);
      results.failed++;
      // Mark the run as failed so it doesn't stay stuck at 'running'
      if (run?.id) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await supabase
          .from('runs')
          .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
          .eq('id', run.id);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    ...results,
  });
}
