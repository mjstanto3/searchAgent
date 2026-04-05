import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAgentRole } from '@/lib/anthropic/generateAgentRole';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: monitor, error: fetchError } = await supabase
    .from('monitors')
    .select('id, user_id, topic, context')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !monitor) {
    return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
  }

  let agent_role: string;
  try {
    agent_role = await generateAgentRole(monitor.topic);
  } catch (err) {
    console.error('Failed to generate agent role:', err);
    return NextResponse.json({ error: 'Role generation failed' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('monitors')
    .update({ agent_role, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, agent_role });
}
