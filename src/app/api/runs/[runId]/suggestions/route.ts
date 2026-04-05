import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { RunSuggestion } from '@/types';

interface Params {
  params: Promise<{ runId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { runId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { suggestionId } = body as { suggestionId: string };

  if (!suggestionId) {
    return NextResponse.json({ error: 'suggestionId is required' }, { status: 400 });
  }

  // Fetch run (RLS ensures user can only access their own)
  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('monitor_id, suggestions')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const suggestions: RunSuggestion[] = run.suggestions ?? [];
  const suggestion = suggestions.find((s) => s.id === suggestionId);

  if (!suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  if (suggestion.applied) {
    return NextResponse.json({ error: 'Already applied' }, { status: 409 });
  }

  // Apply keyword or source to the monitor
  if (suggestion.type === 'keyword' || suggestion.type === 'source') {
    const field = suggestion.type === 'keyword' ? 'keywords' : 'sources';

    const { data: monitor, error: monitorError } = await supabase
      .from('monitors')
      .select('keywords, sources')
      .eq('id', run.monitor_id)
      .eq('user_id', user.id)
      .single();

    if (monitorError || !monitor) {
      return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
    }

    const existing: string[] = (monitor as Record<string, string[]>)[field] ?? [];

    if (!existing.includes(suggestion.text)) {
      await supabase
        .from('monitors')
        .update({ [field]: [...existing, suggestion.text] })
        .eq('id', run.monitor_id);
    }
  }

  // Mark suggestion as applied in the run record
  const updatedSuggestions = suggestions.map((s) =>
    s.id === suggestionId ? { ...s, applied: true } : s,
  );

  await supabase.from('runs').update({ suggestions: updatedSuggestions }).eq('id', runId);

  return NextResponse.json({ ok: true });
}
