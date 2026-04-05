'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { getNextRunDate } from '@/lib/utils';
import type { MonitorFormData, MonitorFrequency } from '@/types';
import { CheckCircle2, ArrowLeft, ArrowRight, Upload, X } from 'lucide-react';

const STEPS = [
  { number: 1, title: 'Topic', description: 'What should we monitor?' },
  { number: 2, title: 'Sources', description: 'Where should we look?' },
  { number: 3, title: 'Focus areas', description: 'What matters most?' },
  { number: 4, title: 'Context', description: 'Upload supporting docs' },
  { number: 5, title: 'Schedule', description: 'When to deliver?' },
];

const FREQUENCY_OPTIONS: { value: MonitorFrequency; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Every day at 8 AM' },
  { value: 'weekly', label: 'Weekly', description: 'Every Monday at 8 AM' },
  { value: 'biweekly', label: 'Biweekly', description: 'Every other Monday' },
];

const MAX_RESULTS_OPTIONS = [5, 10, 20, 30];

const DATE_WINDOW_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 7,   label: '7 days',   description: 'Last week' },
  { value: 14,  label: '14 days',  description: 'Last 2 weeks' },
  { value: 30,  label: '30 days',  description: 'Last month' },
  { value: 90,  label: '90 days',  description: 'Last quarter' },
  { value: 365, label: '1 year',   description: 'Last 12 months' },
];

interface MonitorFormProps {
  userId: string;
}

export function MonitorForm({ userId }: MonitorFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<MonitorFormData>({
    name: '',
    topic: '',
    context: '',
    sources: [],
    keywords: [],
    frequency: 'weekly',
    max_results: 10,
    date_window_days: 30,
  });

  const [sourceInput, setSourceInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  function addTag(
    field: 'sources' | 'keywords',
    value: string,
    setter: (v: string) => void,
  ) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!formData[field].includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        [field]: [...prev[field], trimmed],
      }));
    }
    setter('');
  }

  function removeTag(field: 'sources' | 'keywords', value: string) {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((v) => v !== value),
    }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB.');
      return;
    }
    const allowed = ['application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, TXT, DOC, or DOCX files are allowed.');
      return;
    }
    setError('');
    setUploadedFile(file);
    setFormData((prev) => ({ ...prev, document: file }));
  }

  function isStepValid(): boolean {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0 && formData.topic.trim().length > 0;
      case 2:
      case 3:
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');

    try {
      let documentPath: string | undefined;
      let documentName: string | undefined;

      if (uploadedFile) {
        const ext = uploadedFile.name.split('.').pop();
        const filePath = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, uploadedFile, { upsert: false });

        if (uploadError) {
          throw new Error(`Document upload failed: ${uploadError.message}`);
        }
        documentPath = filePath;
        documentName = uploadedFile.name;
      }

      const nextRunAt = getNextRunDate(formData.frequency);

      const { data: insertData, error: insertError } = await supabase.from('monitors').insert({
        user_id: userId,
        name: formData.name.trim(),
        topic: formData.topic.trim(),
        context: formData.context.trim() || null,
        sources: formData.sources,
        keywords: formData.keywords,
        document_path: documentPath,
        document_name: documentName,
        frequency: formData.frequency,
        max_results: formData.max_results,
        date_window_days: formData.date_window_days,
        is_active: true,
        next_run_at: nextRunAt.toISOString(),
      }).select('id').single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Fire-and-forget: generate the agent role in the background.
      // The user is redirected immediately; role will be ready before the first run.
      if (insertData?.id) {
        fetch(`/api/monitors/${insertData.id}/regenerate-role`, { method: 'POST' }).catch(() => {
          // non-fatal — runs will fall back to the default role
        });
      }

      router.push('/magpie');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((s) => (
          <div key={s.number} className="flex flex-1 flex-col items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                s.number < step
                  ? 'bg-indigo-600 text-white'
                  : s.number === step
                  ? 'border-2 border-indigo-600 bg-white text-indigo-600'
                  : 'border-2 border-slate-200 bg-white text-slate-400'
              }`}
            >
              {s.number < step ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                s.number
              )}
            </div>
            <span className="mt-1 hidden text-xs text-slate-500 sm:block">
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">
            Step {step} of {STEPS.length}
          </p>
          <h2 className="text-xl font-bold text-slate-900">
            {STEPS[step - 1].description}
          </h2>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Input
              label="Monitor name"
              placeholder="e.g. Competitor watch – Acme Corp"
              value={formData.name}
              onChange={(e) =>
                setFormData((p) => ({ ...p, name: e.target.value }))
              }
              hint="A short label for your own reference."
            />
            <Textarea
              label="Research topic or question"
              placeholder="e.g. What are Acme Corp's latest product launches and pricing changes?"
              value={formData.topic}
              onChange={(e) =>
                setFormData((p) => ({ ...p, topic: e.target.value }))
              }
              rows={3}
              maxLength={500}
              hint="A concise, focused question or topic. This drives the AI agent persona and search strategy."
            />
            <Textarea
              label="Additional context (optional)"
              placeholder="Include background info, constraints, prior knowledge, specific competitors, geographic focus, time ranges, or anything else that helps narrow the search..."
              value={formData.context}
              onChange={(e) =>
                setFormData((p) => ({ ...p, context: e.target.value }))
              }
              rows={6}
              maxLength={5000}
              hint="Up to 5,000 characters. This context is injected directly into every search prompt."
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Add specific websites or domains to prioritize (optional). Leave empty to let the AI decide.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. techcrunch.com"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('sources', sourceInput, setSourceInput);
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={() => addTag('sources', sourceInput, setSourceInput)}
              >
                Add
              </Button>
            </div>
            {formData.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.sources.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                  >
                    {s}
                    <button onClick={() => removeTag('sources', s)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Add keywords or focus areas to sharpen the AI&apos;s search (optional).
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. pricing, enterprise, Series B"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('keywords', keywordInput, setKeywordInput);
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={() => addTag('keywords', keywordInput, setKeywordInput)}
              >
                Add
              </Button>
            </div>
            {formData.keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.keywords.map((k) => (
                  <span
                    key={k}
                    className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {k}
                    <button onClick={() => removeTag('keywords', k)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Upload a document to give the AI additional context (optional). Great for company briefs, job descriptions, or research notes.
            </p>
            <label
              htmlFor="doc-upload"
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <Upload className="h-8 w-8 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {uploadedFile ? uploadedFile.name : 'Click to upload'}
                </p>
                <p className="text-xs text-slate-500">PDF, TXT, DOC, DOCX up to 5 MB</p>
              </div>
              <input
                id="doc-upload"
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {uploadedFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUploadedFile(null);
                  setFormData((p) => ({ ...p, document: undefined }));
                }}
                className="text-red-600 hover:text-red-700"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Remove file
              </Button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium text-slate-700">
                Delivery frequency
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setFormData((p) => ({ ...p, frequency: opt.value }))
                    }
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      formData.frequency === opt.value
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-700">
                Max results per brief
              </p>
              <div className="flex gap-3">
                {MAX_RESULTS_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setFormData((p) => ({ ...p, max_results: n }))
                    }
                    className={`flex h-12 w-16 items-center justify-center rounded-xl border font-semibold transition-colors ${
                      formData.max_results === n
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-700">
                Search date window
              </p>
              <p className="mb-3 text-xs text-slate-500">
                How far back should each run look? This is a rolling window from the date of each run.
              </p>
              <div className="flex flex-wrap gap-2">
                {DATE_WINDOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setFormData((p) => ({ ...p, date_window_days: opt.value }))
                    }
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      formData.date_window_days === opt.value
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Summary</p>
              <ul className="mt-2 space-y-1">
                <li>Monitor: <strong>{formData.name}</strong></li>
                <li>Topic: <em>{formData.topic}</em></li>
                <li>Frequency: <strong>{formData.frequency}</strong></li>
                <li>Max results: <strong>{formData.max_results}</strong></li>
                <li>Date window: <strong>Last {formData.date_window_days} days</strong></li>
                {formData.sources.length > 0 && (
                  <li>Sources: {formData.sources.join(', ')}</li>
                )}
                {formData.keywords.length > 0 && (
                  <li>Keywords: {formData.keywords.join(', ')}</li>
                )}
                {uploadedFile && <li>Document: {uploadedFile.name}</li>}
              </ul>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {step < STEPS.length ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!isStepValid()}
              className="gap-1.5"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              loading={saving}
              className="gap-1.5"
            >
              Create monitor
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
