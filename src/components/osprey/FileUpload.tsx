'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const ACCEPTED = ['.csv', '.json', '.xls', '.xlsx'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 500;

interface FileUploadProps {
  onJobCreated?: (jobId: string) => void;
}

export function FileUpload({ onJobCreated }: FileUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function validateFile(f: File): string | null {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      return `Unsupported file type. Please upload a CSV, JSON, XLS, or XLSX file.`;
    }
    if (f.size > MAX_BYTES) {
      return `File is too large. Maximum size is 10 MB.`;
    }
    return null;
  }

  function handleSelect(f: File) {
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleSelect(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelect(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/osprey/jobs', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Upload failed. Please try again.');
        return;
      }

      if (onJobCreated) {
        onJobCreated(data.jobId);
      } else {
        router.push(`/osprey/jobs/${data.jobId}`);
      }
    } catch {
      setError('Upload failed. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Upload your list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV, JSON, XLS, or XLSX file. Max {MAX_ROWS} rows, 10 MB.
          Column 1 should be the primary research target (company, person, topic).
        </p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-16 transition-colors ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : file
            ? 'border-green-300 bg-green-50'
            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={onInputChange}
        />

        {file ? (
          <>
            <FileText className="mb-3 h-10 w-10 text-green-500" />
            <p className="font-medium text-slate-900">{file.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {(file.size / 1024).toFixed(1)} KB — click to change
            </p>
          </>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-slate-400" />
            <p className="font-medium text-slate-700">
              Drop your file here, or click to browse
            </p>
            <p className="mt-1 text-sm text-slate-400">
              CSV, JSON, XLS, XLSX up to 10 MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {file && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Analysing…' : 'Continue'}
          </Button>
        </div>
      )}
    </div>
  );
}
