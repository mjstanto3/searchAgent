'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { X, ThumbsDown } from 'lucide-react';

const REASONS = [
  { id: 'hallucination', label: 'Hallucination', description: "Can't verify this — seems made up" },
  { id: 'off-topic', label: 'Off-topic', description: 'Not relevant to my research' },
  { id: 'too-generic', label: 'Too generic', description: 'Too broad, not specific or actionable' },
  { id: 'outdated', label: 'Outdated', description: 'Old news, not recent enough' },
  { id: 'wrong-market', label: 'Wrong market', description: 'Wrong industry or geography' },
  { id: 'already-knew', label: 'Already knew this', description: 'Not new information' },
] as const;

interface DownvoteModalProps {
  open: boolean;
  finding: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function DownvoteModal({ open, finding, onConfirm, onCancel }: DownvoteModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  function handleConfirm() {
    const reason = custom.trim() || selected;
    if (reason) onConfirm(reason);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setSelected(null);
      setCustom('');
      onCancel();
    }
  }

  const canConfirm = !!selected || !!custom.trim();

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50">
                <ThumbsDown className="h-4 w-4 text-red-500" />
              </div>
              <Dialog.Title className="text-sm font-semibold text-slate-900">
                Why wasn&apos;t this finding helpful?
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <p className="mb-4 line-clamp-2 rounded-md bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
            &ldquo;{finding}&rdquo;
          </p>

          <div className="mb-4 grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelected(r.id === selected ? null : r.id); setCustom(''); }}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  selected === r.id
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="block font-medium">{r.label}</span>
                <span className="block text-[11px] opacity-70">{r.description}</span>
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Or describe the issue…"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
            maxLength={200}
            className="mb-4 w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-md px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="rounded-md bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Submit feedback
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
