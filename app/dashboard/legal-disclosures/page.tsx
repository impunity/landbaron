'use client';

import { useEffect, useState } from 'react';
import { File, FileText, FileUp, Download } from 'lucide-react';

import { fetchUserRole, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatTimestamp, useTimeFormat } from '@/lib/time-format';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';

type LegalDocument = {
  id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

const inputClass = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium';

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LegalDisclosuresPage() {
  const timeFormat = useTimeFormat();
  const [role, setRole] = useState<UserRole | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadDocuments(token: string) {
    const response = await fetch('/api/legal-disclosures', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Legal disclosures could not be loaded.');
    setDocuments(result.documents ?? []);
  }

  useEffect(() => {
    void (async () => {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) {
          window.location.replace('/login');
          return;
        }
        setRole(await fetchUserRole(session.user.email, supabase));
        await loadDocuments(session.access_token);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Legal disclosures could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file || (role !== 'owner' && role !== 'manager')) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/legal-disclosures', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Legal disclosure could not be uploaded.');
      setDocuments((current) => [result.document, ...current]);
      setFile(null);
      const input = document.getElementById('legal-disclosure-file');
      if (input instanceof HTMLInputElement) input.value = '';
      setNotice('Document uploaded.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Legal disclosure could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(documentId: string) {
    setDownloadingId(documentId);
    setError('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/legal-disclosures?id=${encodeURIComponent(documentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== 'string') throw new Error(result.error || 'Document download could not be started.');
      window.location.assign(result.url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Document download could not be started.');
    } finally {
      setDownloadingId('');
    }
  }

  const canUpload = role === 'owner' || role === 'manager';

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Legal Disclosures', href: '/dashboard/legal-disclosures' }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">Legal Disclosures</h1><p className="mt-1 text-sm text-slate-600">State-required disclosures and property documents</p></div>
        </div>
        {role && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons current="legal-disclosures" role={role} /></div>}
        {error && <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="mt-5 text-sm text-emerald-700">{notice}</p>}

        {canUpload && <form onSubmit={(event) => void uploadDocument(event)} className="mt-6 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold">Upload a disclosure</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label htmlFor="legal-disclosure-file" className="min-w-0 flex-1 text-xs font-semibold text-slate-600">PDF, DOC, or DOCX · Max 25 MB<input id="legal-disclosure-file" className={`${inputClass} mt-1`} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={uploading} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
            <button type="submit" disabled={!file || uploading} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><FileUp size={16} aria-hidden="true" />{uploading ? 'Uploading...' : 'Upload'}</button>
          </div>
        </form>}

        <section aria-label="Legal disclosure documents" className="mt-6 border-y border-slate-300 bg-white px-5 sm:px-6">
          {loading ? <p className="py-6 text-sm text-slate-500">Loading documents...</p> : documents.length === 0 ? <p className="py-6 text-sm text-slate-500">No documents have been uploaded yet.</p> : <ul className="divide-y divide-slate-200">
            {documents.map((document) => {
              const isPdf = document.content_type === 'application/pdf' || document.file_name.toLowerCase().endsWith('.pdf');
              const Icon = isPdf ? FileText : File;
              return <li key={document.id} className="flex min-w-0 items-center gap-3 py-4">
                <div className={`grid size-10 shrink-0 place-items-center rounded-md ${isPdf ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}><Icon size={21} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{document.file_name}</p><p className="mt-1 text-xs text-slate-500">{isPdf ? 'PDF' : document.file_name.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX'} · {formatFileSize(document.file_size)} · {formatTimestamp(document.created_at, timeFormat)}</p></div>
                <button type="button" onClick={() => void downloadDocument(document.id)} disabled={downloadingId === document.id} aria-label={`Download ${document.file_name}`} title="Download" className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={16} aria-hidden="true" /></button>
              </li>;
            })}
          </ul>}
        </section>
      </div>
    </main>
  );
}
