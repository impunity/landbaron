import type { UserRole } from '@/lib/auth';

export function getTicketAttachmentObject(url: string, ticketId: string) {
  let segments: string[];

  try {
    segments = new URL(url).pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (segments.some((segment) => segment.includes('/') || segment.includes('\\') || segment === '.' || segment === '..')) {
    return null;
  }

  const prefix = ['storage', 'v1', 'object', 'public', 'ticket-photos', 'ticket-attachments', ticketId];
  if (prefix.some((segment, index) => segments[index] !== segment)) {
    return null;
  }

  const objectSegments = segments.slice(prefix.length);
  if (objectSegments.length === 1 && objectSegments[0]) {
    return { path: segments.slice(5).join('/'), uploaderId: null };
  }
  if (objectSegments.length === 2 && objectSegments[0] && objectSegments[1]) {
    return { path: segments.slice(5).join('/'), uploaderId: objectSegments[0] };
  }

  return null;
}

export function canRemoveTicketAttachment(
  role: UserRole,
  userId: string,
  ticketCreatorId: string | null | undefined,
  uploaderId: string | null,
) {
  if (role === 'owner' || role === 'manager') return true;
  if (role !== 'tenant' && role !== 'maintenance' && role !== 'contractor') return false;
  return uploaderId ? uploaderId === userId : ticketCreatorId === userId;
}
