import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAgentRole } from '@/lib/anthropic/generateAgentRole';
import type { MonitorFrequency } from '@/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch existing monitor to verify ownership and get current document path + topic
  const { data: existing, error: fetchError } = await supabase
    .from('monitors')
    .select('id, user_id, document_path, topic, context')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
  }

  // Parse multipart form data
  const formData = await request.formData();

  const name = (formData.get('name') as string | null)?.trim();
  const topic = (formData.get('topic') as string | null)?.trim();
  const context = (formData.get('context') as string | null)?.trim() || null;
  const frequency = formData.get('frequency') as MonitorFrequency | null;
  const maxResultsRaw = formData.get('max_results') as string | null;
  const dateWindowRaw = formData.get('date_window_days') as string | null;
  const keywordsRaw = formData.get('keywords') as string | null;
  const sourcesRaw = formData.get('sources') as string | null;
  const removeDocument = formData.get('removeDocument') === 'true';
  const documentFile = formData.get('document') as File | null;

  if (!name || !topic) {
    return NextResponse.json({ error: 'Name and topic are required' }, { status: 400 });
  }

  const max_results = maxResultsRaw ? parseInt(maxResultsRaw, 10) : undefined;
  if (max_results !== undefined && (isNaN(max_results) || max_results < 1 || max_results > 50)) {
    return NextResponse.json({ error: 'max_results must be between 1 and 50' }, { status: 400 });
  }

  const date_window_days = dateWindowRaw ? parseInt(dateWindowRaw, 10) : undefined;
  if (date_window_days !== undefined && (isNaN(date_window_days) || date_window_days < 1 || date_window_days > 365)) {
    return NextResponse.json({ error: 'date_window_days must be between 1 and 365' }, { status: 400 });
  }

  let keywords: string[] | undefined;
  let sources: string[] | undefined;
  try {
    if (keywordsRaw) keywords = JSON.parse(keywordsRaw);
    if (sourcesRaw) sources = JSON.parse(sourcesRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid keywords or sources format' }, { status: 400 });
  }

  // ── Document handling ─────────────────────────────────────────────────────

  let documentPath: string | null | undefined = undefined; // undefined = no change
  let documentName: string | null | undefined = undefined;

  if (removeDocument) {
    // Delete old file from storage if it exists
    if (existing.document_path) {
      await supabase.storage.from('documents').remove([existing.document_path]);
    }
    documentPath = null;
    documentName = null;
  } else if (documentFile && documentFile.size > 0) {
    // Upload new document
    const ext = documentFile.name.split('.').pop();
    const newPath = `${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(newPath, documentFile, { upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: `Document upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Delete old file if there was one
    if (existing.document_path) {
      await supabase.storage.from('documents').remove([existing.document_path]);
    }

    documentPath = newPath;
    documentName = documentFile.name;
  }

  // ── Build update payload ──────────────────────────────────────────────────

  const topicChanged = topic !== existing.topic;
  const contextChanged = context !== (existing.context ?? null);

  const update: Record<string, unknown> = {
    name,
    topic,
    context: context ?? null,
    updated_at: new Date().toISOString(),
  };

  // Regenerate agent role if topic or context changed
  if (topicChanged || contextChanged) {
    try {
      update.agent_role = await generateAgentRole(topic);
    } catch {
      // non-fatal — existing role or default will be used
    }
  }

  if (frequency) update.frequency = frequency;
  if (max_results !== undefined) update.max_results = max_results;
  if (date_window_days !== undefined) update.date_window_days = date_window_days;
  if (keywords !== undefined) update.keywords = keywords;
  if (sources !== undefined) update.sources = sources;
  if (documentPath !== undefined) update.document_path = documentPath;
  if (documentName !== undefined) update.document_name = documentName;

  const { data: updated, error: updateError } = await supabase
    .from('monitors')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, monitor: updated });
}
