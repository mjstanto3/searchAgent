'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Upload, X, FileText, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { Monitor, MonitorFrequency } from '@/types';

const FREQUENCY_OPTIONS: { value: MonitorFrequency; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Every day at 8 AM' },
  { value: 'weekly', label: 'Weekly', description: 'Every Monday at 8 AM' },
  { value: 'biweekly', label: 'Biweekly', description: 'Every other Monday' },
];

const MAX_RESULTS_OPTIONS = [5, 10, 20, 30];

const DATE_WINDOW_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 7,   label: '7 days',  description: 'Last week' },
  { value: 14,  label: '14 days', description: 'Last 2 weeks' },
  { value: 30,  label: '30 days', description: 'Last month' },
  { value: 90,  label: '90 days', description: 'Last quarter' },
  { value: 365, label: '1 year',  description: 'Last 12 months' },
];

const ACCEPTED_TYPES = ['application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface EditMonitorFormProps {
  monitor: Monitor;
}

export function EditMonitorForm({ monitor }: EditMonitorFormProps) {
  const router = useRouter();

  const [name, setName] = useState(monitor.name);
  const [topic, setTopic] = useState(monitor.topic);
  const [context, setContext] = useState(monitor.context ?? '');
  const [frequency, setFrequency] = useState<MonitorFrequency>(monitor.frequency);
  const [maxResults, setMaxResults] = useState(monitor.max_results);
  const [dateWindowDays, setDateWindowDays] = useState(monitor.date_window_days ?? 30);
  const [keywords, setKeywords] = useState<string[]>(monitor.keywords ?? []);
  const [sources, setSources] = useState<string[]>(monitor.sources ?? []);

  const [keywordInput, setKeywordInput] = useState('');
  const [sourceInput, setSourceInput] = useState('');

  // Document state
  const [currentDocName] = useState(monitor.document_name ?? null);
  const [removeDocument, setRemoveDocument] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Agent role state ────────────────────────────────────────────────────
  const [agentRole, setAgentRole] = useState(monitor.agent_role ?? '');
  const [roleExpanded, setRoleExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerateRole() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/regenerate-role`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to regenerate role');
      setAgentRole(json.agent_role);
      setRoleExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate role');
    } finally {
      setRegenerating(false);
    }
  }

  // ── Tag helpers ─────────────────────────────────────────────────────────

  function addKeyword() {
    const val = keywordInput.trim();
    if (val && !keywords.includes(val)) setKeywords([...keywords, val]);
    setKeywordInput('');
  }

  function addSource() {
    const val = sourceInput.trim();
    if (val && !sources.includes(val)) setSources([...sources, val]);
    setSourceInput('');
  }

  // ── Document handlers ───────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only PDF, TXT, DOC, or DOCX files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File must be under 5 MB.');
      return;
    }
    setError('');
    setNewFile(file);
    setRemoveDocument(false); // uploading new supersedes remove
  }

  function handleRemoveDoc() {
    setRemoveDocument(true);
    setNewFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleCancelNewFile() {
    setNewFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!topic.trim()) { setError('Topic is required.'); return; }

    setSaving(true);
    setError('');

    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('topic', topic.trim());
      fd.append('context', context.trim());
      fd.append('frequency', frequency);
      fd.append('max_results', String(maxResults));
      fd.append('date_window_days', String(dateWindowDays));
      fd.append('keywords', JSON.stringify(keywords));
      fd.append('sources', JSON.stringify(sources));
      fd.append('removeDocument', String(removeDocument));
      if (newFile) fd.append('document', newFile);

      const res = await fetch(`/api/monitors/${monitor.id}`, {
        method: 'PATCH',
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save changes.');
      }

      router.push(`/monitors/${monitor.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hasCurrentDoc = currentDocName && !removeDocument && !newFile;

  return (
    <div className="mx-auto max-w-2xl space-y-8">

      {/* Name */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Monitor name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AI market trends"
          maxLength={100}
        />
      </section>

      {/* Topic + Context */}
      <section className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Research topic or question</label>
          <p className="text-xs text-slate-500">
            A concise, focused question or topic. This drives the AI agent persona and search strategy.
          </p>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. What are the latest funding rounds in AI infrastructure?"
            rows={3}
            maxLength={500}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Additional context <span className="font-normal text-slate-400">(optional)</span></label>
          <p className="text-xs text-slate-500">
            Background info, constraints, specific competitors, geographic focus, or anything else that narrows the search. Up to 5,000 characters.
          </p>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Include background info, constraints, prior knowledge, specific competitors, geographic focus, time ranges..."
            rows={6}
            maxLength={5000}
          />
        </div>
      </section>

      {/* Agent role */}
      <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">AI agent persona</p>
            <p className="text-xs text-slate-500">
              {agentRole
                ? 'Customized persona used as the AI system prompt for this monitor.'
                : 'No persona generated yet — will use the default research analyst role.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleRegenerateRole}
              disabled={regenerating}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Generating…' : 'Regenerate'}
            </Button>
            {agentRole && (
              <button
                type="button"
                onClick={() => setRoleExpanded((v) => !v)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={roleExpanded ? 'Collapse' : 'Expand'}
              >
                {roleExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
        {agentRole && roleExpanded && (
          <p className="mt-2 text-sm text-slate-600 leading-relaxed border-t border-slate-200 pt-3">
            {agentRole}
          </p>
        )}
      </section>

      {/* Sources */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Priority sources</label>
        <p className="text-xs text-slate-500">
          Domains or URLs to prioritise (optional).
        </p>
        <div className="flex gap-2">
          <Input
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSource(); } }}
            placeholder="e.g. techcrunch.com"
          />
          <Button type="button" variant="secondary" onClick={addSource}>Add</Button>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {sources.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
              >
                {s}
                <button
                  type="button"
                  onClick={() => setSources(sources.filter((x) => x !== s))}
                  className="ml-1 text-indigo-400 hover:text-indigo-600"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Keywords */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Focus keywords</label>
        <p className="text-xs text-slate-500">
          Terms that guide what to look for (optional).
        </p>
        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="e.g. Series A, LLM, open source"
          />
          <Button type="button" variant="secondary" onClick={addKeyword}>Add</Button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {k}
                <button
                  type="button"
                  onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                  className="ml-1 text-slate-400 hover:text-slate-600"
                  aria-label={`Remove ${k}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Document */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Context document</label>
        <p className="text-xs text-slate-500">
          Optional PDF, TXT, DOC, or DOCX up to 5 MB. Used as background context for each brief.
        </p>

        {hasCurrentDoc && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="flex-1 truncate text-sm text-slate-700">{currentDocName}</span>
            <button
              type="button"
              onClick={handleRemoveDoc}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        )}

        {removeDocument && !newFile && (
          <p className="text-sm text-amber-600">
            Document will be removed on save.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => setRemoveDocument(false)}
            >
              Undo
            </button>
          </p>
        )}

        {newFile && (
          <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-indigo-400" />
            <span className="flex-1 truncate text-sm text-indigo-700">{newFile.name}</span>
            <button
              type="button"
              onClick={handleCancelNewFile}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!newFile && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
            <Upload className="h-4 w-4" />
            {hasCurrentDoc ? 'Replace document' : 'Upload document'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        )}
      </section>

      {/* Frequency */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Delivery frequency</label>
        <div className="grid grid-cols-3 gap-3">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFrequency(opt.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                frequency === opt.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Max results */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Max results per brief</label>
        <div className="flex gap-3">
          {MAX_RESULTS_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMaxResults(n)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                maxResults === n
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* Date window */}
      <section className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Search date window</label>
        <p className="text-xs text-slate-500">
          Rolling lookback from the date of each run.
        </p>
        <div className="flex flex-wrap gap-2">
          {DATE_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDateWindowDays(opt.value)}
              className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                dateWindowDays === opt.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-slate-500">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/monitors/${monitor.id}`)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
