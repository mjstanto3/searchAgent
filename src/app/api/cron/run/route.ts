import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runMonitor } from '@/lib/anthropic/runMonitor';
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
      const { data: run, error: runErr } = await supabase
        .from('runs')
        .insert({
          monitor_id: monitor.id,
          user_id: monitor.user_id,
          status: 'running',
        })
        .select()
        .single();

      if (runErr || !run) {
        results.failed++;
        continue;
      }

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

      // Run the AI
      const brief = await runMonitor(monitor, documentContext);

      // Decrement credits
      await supabase.rpc('decrement_credits', {
        p_user_id: monitor.user_id,
        p_amount: brief.creditsUsed,
        p_description: `Scheduled run: ${monitor.name}`,
      });

      // Update run
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
            ...run,
            brief_html: brief.html,
            brief_markdown: brief.markdown,
            status: 'completed',
          });
          await supabase.from('runs').update({ email_sent: true }).eq('id', run.id);
        } catch (emailErr) {
          console.error(`Email failed for monitor ${monitor.id}:`, emailErr);
        }
      }

      results.processed++;
    } catch (err) {
      console.error(`Error processing monitor ${monitor.id}:`, err);
      results.failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    ...results,
  });
}
