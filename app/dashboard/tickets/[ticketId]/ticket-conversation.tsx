'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export type TicketMessage = {
  id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export function TicketConversation({ ticketId, messages, legacyNotes, loadError, onMessage }: {
  ticketId: string;
  messages: TicketMessage[];
  legacyNotes: string[];
  loadError: string | null;
  onMessage: (message: TicketMessage) => void;
}) {
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<TicketMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body, parent_id: replyTo?.id ?? null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Message could not be saved.');
      onMessage(result.message);
      setBody('');
      setReplyTo(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Message could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const renderMessages = (parentId: string | null, depth = 0): React.ReactNode => (
    messages.filter((message) => message.parent_id === parentId).map((message) => (
      <div key={message.id} className={depth > 0 ? 'mt-3 border-l-2 border-slate-200 pl-3' : 'mt-4'}>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">{message.author_name}</p>
          <time className="text-xs text-slate-500" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
          <button type="button" onClick={() => setReplyTo(message)} disabled={saving || Boolean(loadError)} className="mt-2 text-xs font-medium text-teal-700 underline disabled:opacity-60">Reply</button>
        </div>
        <div className={depth >= 3 ? '-ml-3' : ''}>{renderMessages(message.id, depth + 1)}</div>
      </div>
    ))
  );

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="font-semibold">Conversation</h2>
      <p className="mt-1 text-xs text-slate-500">Visible to the tenant who filed this ticket and all staff.</p>
      {legacyNotes.map((note, index) => (
        <div key={index} className="mt-4 rounded-xl bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Previous owner notes (retained)</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{note}</p>
        </div>
      ))}
      {renderMessages(null)}
      {!messages.length && !legacyNotes.length && !loadError && <p className="mt-4 text-sm text-slate-500">Start the conversation about this repair.</p>}
      {(loadError || error) && <p role="alert" className="mt-3 text-sm text-rose-700">{loadError || error}</p>}
      <form onSubmit={submit} className="mt-4">
        {replyTo && <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-600"><span>Replying to {replyTo.author_name}</span><button type="button" onClick={() => setReplyTo(null)} disabled={saving} className="underline">Cancel reply</button></div>}
        <label htmlFor="ticket-message" className="text-sm font-medium">{replyTo ? 'Your reply' : 'New message'}</label>
        <textarea id="ticket-message" rows={3} maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={saving || Boolean(loadError)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={saving || !body.trim() || Boolean(loadError)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Sending...' : 'Send message'}</button>
      </form>
    </section>
  );
}
