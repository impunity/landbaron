'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Heart, ThumbsDown, ThumbsUp } from 'lucide-react';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatTimestamp, useTimeFormat } from '@/lib/time-format';
import { Breadcrumbs } from '../../../breadcrumbs';
import { DashboardNavButtons } from '../../../nav-buttons';

type AnnouncementReply = {
  id: string;
  author_name: string;
  author_email: string;
  body: string;
  created_at: string;
  mentions?: Array<{ id: string; name: string }>;
};

type MentionCandidate = { id: string; name: string; role: string };

const reactionOptions = [
  { key: 'up', label: 'Thumbs up', icon: ThumbsUp },
  { key: 'down', label: 'Thumbs down', icon: ThumbsDown },
  { key: 'heart', label: 'Heart', icon: Heart },
  { key: 'hundred', label: '100%', text: '💯' },
  { key: 'shrug', label: 'Shrug', text: '🤷' },
] as const;

type Announcement = {
  id: string;
  author_name: string;
  author_email: string;
  body: string;
  image_urls: string[];
  created_at: string;
  reactions: Record<string, number>;
  my_reaction: string | null;
  property_announcement_replies: AnnouncementReply[];
};

type AnnouncementPageData = {
  property: { id: string; name: string; address: string };
  announcements: Announcement[];
};

const renderReplyBody = (reply: AnnouncementReply) => {
  const names = (reply.mentions ?? []).map((person) => `@${person.name}`).sort((a, b) => b.length - a.length);
  if (!names.length) return reply.body;

  const parts: React.ReactNode[] = [];
  let start = 0;
  while (start < reply.body.length) {
    const matches = names.map((name) => ({ name, index: reply.body.indexOf(name, start) })).filter((match) => match.index >= 0);
    if (!matches.length) break;
    const match = matches.sort((a, b) => a.index - b.index || b.name.length - a.name.length)[0];
    parts.push(reply.body.slice(start, match.index));
    parts.push(<span key={`${reply.id}-${match.index}`} className="font-semibold text-emerald-800">{match.name}</span>);
    start = match.index + match.name.length;
  }
  parts.push(reply.body.slice(start));
  return parts;
};

const getEmailNotice = (label: 'Announcement' | 'Reply', notifications?: {
  attempted?: number;
  accepted?: number;
  failed?: number;
  ownerAttempted?: boolean;
  ownerAccepted?: boolean;
  error?: boolean;
}) => {
  if (notifications?.error) {
    return `${label} posted, but the email result could not be confirmed. Check the deployment logs.`;
  }
  if (!notifications || notifications.attempted === 0) {
    return `${label} posted, but no tenant or staff email recipients were found.`;
  }

  const ownerStatus = notifications.ownerAttempted
    ? notifications.ownerAccepted ? 'Owner email accepted by Resend' : 'Owner email was not accepted by Resend'
    : 'No owner email address is configured for this organization';
  const summary = `${notifications.accepted ?? 0} of ${notifications.attempted} emails accepted by Resend. ${ownerStatus}.`;
  return notifications.failed
    ? `${label} posted. ${summary} Check Resend → Emails for the rejection or delivery details.`
    : `${label} posted. ${summary} Check Resend → Emails to confirm delivery.`;
};

export default function PropertyAnnouncementsPage() {
  const router = useRouter();
  const timeFormat = useTimeFormat();
  const params = useParams<{ propertyId: string }>();
  const propertyId = params?.propertyId;
  const [session, setSession] = useState<SessionUser | null>(null);
  const [data, setData] = useState<AnnouncementPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [postBody, setPostBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyMentions, setReplyMentions] = useState<Record<string, MentionCandidate[]>>({});
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError('Supabase is not configured for this environment yet.');
      setLoading(false);
      return;
    }

    const syncSession = async () => {
      const { data: authData } = await client.auth.getSession();
      const current = authData.session?.user;
      if (!current) {
        router.replace('/login');
        return;
      }
      const role = await fetchUserRole(current.email, client);
      setSession({
        id: current.id,
        name: current.user_metadata?.full_name || current.email || 'User',
        email: current.email || '',
        role,
      });
    };

    void syncSession();
    const { data: listener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const current = nextSession?.user;
      if (!current) {
        setSession(null);
        router.replace('/login');
        return;
      }
      const role = await fetchUserRole(current.email, client);
      setSession({ id: current.id, name: current.user_metadata?.full_name || current.email || 'User', email: current.email || '', role });
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  const loadAnnouncements = async () => {
    if (!propertyId) return;
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/properties/${propertyId}/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Announcements could not be loaded.');
      setData({ property: result.property, announcements: result.announcements ?? [] });
      const readResponse = await fetch('/api/announcements/unread', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, readAt: result.readThrough }),
      });
      if (readResponse.ok) window.dispatchEvent(new Event('landbaron-unread-changed'));
      const mentionsResponse = await fetch(`/api/properties/${propertyId}/announcements/mentions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mentionsResponse.ok) {
        const mentionsResult = await mentionsResponse.json();
        setMentionCandidates(mentionsResult.people ?? []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Announcements could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && propertyId) void loadAnnouncements();
  }, [session, propertyId]);

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected.slice(0, 5));
    event.target.value = '';
  };

  const handlePost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!propertyId || !postBody.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const formData = new FormData();
      formData.append('body', postBody.trim());
      files.forEach((file) => formData.append('images', file));
      const response = await fetch(`/api/properties/${propertyId}/announcements`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Announcement could not be submitted.');
      setNotice(getEmailNotice('Announcement', result.notifications));
      setPostBody('');
      setFiles([]);
      await loadAnnouncements();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Announcement could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (event: React.FormEvent, announcementId: string) => {
    event.preventDefault();
    const body = replyDrafts[announcementId]?.trim();
    if (!body) return;
    setReplyingTo(announcementId);
    setError(null);
    setNotice(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/announcements/${announcementId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body, mentionIds: (replyMentions[announcementId] ?? []).filter((person) => body.includes(`@${person.name}`)).map((person) => person.id) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Reply could not be submitted.');
      setReplyDrafts((current) => ({ ...current, [announcementId]: '' }));
      setReplyMentions((current) => ({ ...current, [announcementId]: [] }));
      setNotice(getEmailNotice('Reply', result.notifications));
      await loadAnnouncements();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Reply could not be submitted.');
    } finally {
      setReplyingTo(null);
    }
  };

  const handleDelete = async (announcementId: string) => {
    if (!window.confirm('Delete this announcement and all its replies?')) return;
    setDeletingId(announcementId);
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch(`/api/announcements/${announcementId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Announcement could not be deleted.');
      setData((current) => current ? { ...current, announcements: current.announcements.filter((item) => item.id !== announcementId) } : current);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Announcement could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = session?.role === 'owner' || session?.role === 'maintenance';

  const handleReaction = async (announcementId: string, reaction: string) => {
    setReactingTo(announcementId);
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch(`/api/announcements/${announcementId}/reactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reaction }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Reaction could not be saved.');
      await loadAnnouncements();
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : 'Reaction could not be saved.');
    } finally {
      setReactingTo(null);
    }
  };

  const getMentionQuery = (draft: string) => draft.match(/(?:^|\s)@([^@\n]*)$/)?.[1]?.toLowerCase() ?? null;

  const selectMention = (announcementId: string, person: MentionCandidate) => {
    setReplyDrafts((current) => ({
      ...current,
      [announcementId]: (current[announcementId] ?? '').replace(/(^|\s)@[^@\n]*$/, `$1@${person.name} `),
    }));
    setReplyMentions((current) => ({ ...current, [announcementId]: [...(current[announcementId] ?? []).filter((item) => item.id !== person.id), person] }));
  };

  if (loading) return <main className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading announcements...</div></main>;
  if (!session) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Breadcrumbs items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: data?.property.name || 'Property', href: `/dashboard/properties/${propertyId}` },
              { label: 'Announcements/Discussions', href: `/dashboard/properties/${propertyId}/announcements` },
            ]} />
            <h1 className="mt-2 text-2xl font-semibold">Announcements/Discussions</h1>
            <p className="mt-1 text-sm text-slate-600">{data?.property.name}{data?.property.address ? ` · ${data.property.address}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardNavButtons current="properties" role={session.role} propertyId={propertyId} />
          </div>
        </header>

        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

        <form onSubmit={handlePost} className="border-b border-slate-200 pb-6">
          <label htmlFor="announcement-body" className="mb-2 block text-sm font-semibold text-slate-800">New announcement</label>
          <textarea id="announcement-body" rows={4} maxLength={10000} required value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="Share an update for this property..." className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {files.length ? `${files.length} image${files.length === 1 ? '' : 's'} selected` : 'Attach images'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" multiple onChange={handleFiles} className="hidden" />
            </label>
            <button type="submit" disabled={submitting || !postBody.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit'}</button>
          </div>
          {files.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="max-w-full rounded-md bg-slate-200 px-2 py-1 text-xs text-slate-700">{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} className="ml-2 font-semibold text-rose-700">×</button></div>)}</div>}
          <p className="mt-2 text-xs text-slate-500">All posts and replies will be emailed to the tenants and staff associated with this property.</p>
          <p className="mt-1 text-[11px] text-slate-400">Up to 5 images, 4 MB total after conversion. JPG, PNG, WEBP, GIF, or HEIC.</p>
        </form>

        <section aria-label="Announcement posts" className="divide-y divide-slate-200">
          {!data?.announcements.length ? (
            <div className="py-14 text-center">
              <h2 className="text-base font-semibold text-slate-800">No announcements yet</h2>
              <p className="mt-1 text-sm text-slate-500">Property updates and replies will appear here.</p>
            </div>
          ) : data.announcements.map((announcement) => (
            <article key={announcement.id} className="py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{announcement.author_name}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{formatTimestamp(announcement.created_at, timeFormat)}</p>
                </div>
                {canDelete && <button type="button" onClick={() => void handleDelete(announcement.id)} disabled={deletingId === announcement.id} className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50" title="Delete announcement">{deletingId === announcement.id ? 'Deleting...' : 'Delete'}</button>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{announcement.body}</p>
              {announcement.image_urls?.length > 0 && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{announcement.image_urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={url} alt="Announcement attachment" className="max-h-72 w-full object-cover" /></a>)}</div>}

              <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Reactions">
                {reactionOptions.map((option) => {
                  const Icon = 'icon' in option ? option.icon : null;
                  const selected = announcement.my_reaction === option.key;
                  return (
                    <button key={option.key} type="button" title={option.label} aria-label={`${option.label}: ${announcement.reactions?.[option.key] ?? 0}`} aria-pressed={selected} disabled={reactingTo === announcement.id} onClick={() => void handleReaction(announcement.id, option.key)} className={`flex h-9 min-w-12 items-center justify-center gap-1 rounded-md border px-2 text-sm disabled:opacity-50 ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {Icon ? <Icon size={16} aria-hidden="true" /> : <span aria-hidden="true">{'text' in option ? option.text : ''}</span>}
                      <span>{announcement.reactions?.[option.key] ?? 0}</span>
                    </button>
                  );
                })}
              </div>

              {announcement.property_announcement_replies.length > 0 && <div className="mt-5 space-y-3 border-l-2 border-slate-200 pl-4">{announcement.property_announcement_replies.map((reply) => <div key={reply.id}><div className="flex flex-wrap items-baseline gap-x-2"><span className="text-xs font-semibold text-slate-800">{reply.author_name}</span><time className="text-[11px] text-slate-500">{formatTimestamp(reply.created_at, timeFormat)}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">{renderReplyBody(reply)}</p></div>)}</div>}

              <form onSubmit={(event) => void handleReply(event, announcement.id)} className="mt-5">
                <label className="sr-only" htmlFor={`reply-${announcement.id}`}>Write a reply</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea id={`reply-${announcement.id}`} rows={2} maxLength={5000} value={replyDrafts[announcement.id] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [announcement.id]: event.target.value }))} placeholder="Write a reply... use @ to mention someone" className="min-w-0 flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-600" />
                  <button type="submit" disabled={replyingTo === announcement.id || !replyDrafts[announcement.id]?.trim()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{replyingTo === announcement.id ? 'Sending...' : 'Reply'}</button>
                </div>
                {getMentionQuery(replyDrafts[announcement.id] ?? '') !== null && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white" role="listbox" aria-label="People to mention">
                    {mentionCandidates.filter((person) => person.name.toLowerCase().includes(getMentionQuery(replyDrafts[announcement.id] ?? '') ?? '')).slice(0, 8).map((person) => (
                      <button key={person.id} type="button" role="option" aria-selected={false} onClick={() => selectMention(announcement.id, person)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span>{person.name}</span><span className="text-xs text-slate-500">{person.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
