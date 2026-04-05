import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FindingRatingValue } from '@/types';

interface Params {
  params: Promise<{ runId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { runId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Expect { finding: string, rating: "up" | "down", reason?: string }
  const { finding, rating, reason } = body;

  if (typeof finding !== 'string' || !finding.trim()) {
    return NextResponse.json({ error: 'finding is required' }, { status: 400 });
  }
  if (rating !== 'up' && rating !== 'down') {
    return NextResponse.json({ error: 'rating must be "up" or "down"' }, { status: 400 });
  }

  // Fetch existing ratings to merge
  const { data: run, error: fetchError } = await supabase
    .from('runs')
    .select('finding_ratings')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const existing: Record<string, FindingRatingValue> = run.finding_ratings ?? {};
  const key = finding.trim().slice(0, 200);

  const current = existing[key];
  // Toggle off if same rating clicked again with no reason
  if (current?.rating === rating && !reason) {
    delete existing[key];
  } else {
    existing[key] = {
      rating,
      ...(reason && typeof reason === 'string' ? { reason: reason.trim().slice(0, 200) } : {}),
    };
  }

  const { error: updateError } = await supabase
    .from('runs')
    .update({ finding_ratings: existing })
    .eq('id', runId)
    .eq('user_id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, finding_ratings: existing });
}
