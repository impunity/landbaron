'use client';

import { useEffect, useState } from 'react';
import { Check, Download, File, FileText, FileUp, Pencil, Trash2, X } from 'lucide-react';

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
  description: string;
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
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [editingDescriptionId, setEditingDescriptionId] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescriptionId, setSavingDescriptionId] = useState('');
  const [deletingId, setDeletingId] = useState('');
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
      form.set('description', description);
      const response = await fetch('/api/legal-disclosures', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Legal disclosure could not be uploaded.');
      setDocuments((current) => [result.document, ...current]);
      setFile(null);
      setDescription('');
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

  async function saveDescription(documentId: string) {
    setSavingDescriptionId(documentId);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch('/api/legal-disclosures', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId, description: descriptionDraft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Description could not be saved.');
      setDocuments((current) => current.map((document) => document.id === documentId ? result.document : document));
      setEditingDescriptionId('');
      setNotice('Description saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Description could not be saved.');
    } finally {
      setSavingDescriptionId('');
    }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm('Delete this legal disclosure permanently?')) return;
    setDeletingId(documentId);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/legal-disclosures?id=${encodeURIComponent(documentId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Document could not be deleted.');
      setDocuments((current) => current.filter((document) => document.id !== documentId));
      setNotice('Document deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Document could not be deleted.');
    } finally {
      setDeletingId('');
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
            <label htmlFor="legal-disclosure-description" className="min-w-0 flex-[2] text-xs font-semibold text-slate-600">Description (optional)<input id="legal-disclosure-description" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" maxLength={2000} placeholder="Briefly describe this document" value={description} disabled={uploading} onChange={(event) => setDescription(event.target.value)} /></label>
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
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{document.file_name}</p><p className="mt-1 text-xs text-slate-500">{isPdf ? 'PDF' : document.file_name.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX'} · {formatFileSize(document.file_size)} · {formatTimestamp(document.created_at, timeFormat)}</p>{editingDescriptionId === document.id ? <div className="mt-2 flex flex-wrap items-start gap-2"><textarea aria-label={`Description for ${document.file_name}`} className="min-h-16 min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={2000} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} /><button type="button" title="Save description" aria-label="Save description" onClick={() => void saveDescription(document.id)} disabled={savingDescriptionId === document.id} className="grid size-9 place-items-center rounded-md border border-slate-300 disabled:opacity-50"><Check size={16} /></button><button type="button" title="Cancel editing" aria-label="Cancel editing" onClick={() => setEditingDescriptionId('')} disabled={savingDescriptionId === document.id} className="grid size-9 place-items-center rounded-md border border-slate-300 disabled:opacity-50"><X size={16} /></button></div> : document.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{document.description}</p> : canUpload && <p className="mt-2 text-xs text-slate-400">No description</p>}</div>
                  <div className="flex shrink-0 items-center gap-1">{canUpload && <><button type="button" title="Edit description" aria-label={`Edit description for ${document.file_name}`} onClick={() => { setDescriptionDraft(document.description ?? ''); setEditingDescriptionId(document.id); }} className="grid size-9 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"><Pencil size={15} /></button><button type="button" title="Delete document" aria-label={`Delete ${document.file_name}`} onClick={() => void deleteDocument(document.id)} disabled={deletingId === document.id} className="grid size-9 place-items-center rounded-md border border-slate-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button></>}<button type="button" onClick={() => void downloadDocument(document.id)} disabled={downloadingId === document.id} aria-label={`Download ${document.file_name}`} title="Download" className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={16} aria-hidden="true" /></button></div>
              </li>;
            })}
          </ul>}
        </section>
      </div>
    </main>
  );
}
