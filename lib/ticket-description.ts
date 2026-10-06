export type TicketDescriptionParts = {
  email: string;
  address: string;
  assignment: string;
  body: string;
  attachments: string[];
  notes: string;
};

const ATTACHMENT_LINE = /^(?:Photo|Video):\s*/i;
const ATTACHMENT_URL = /(https?:\/\/[^\s)]+)\s*$/i;

const normalizeBlock = (lines: string[]) => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

const getAttachmentKey = (line: string) => line.match(ATTACHMENT_URL)?.[1].replace(/[.,;!?]+$/, '') ?? line;

/**
 * Splits a stored ticket description into its structured pieces. Metadata and
 * attachment lines are recognised wherever they appear, so earlier descriptions
 * whose attachments ended up inside the owner-notes block are repaired on the next save.
 */
export const parseTicketDescription = (description?: string | null): TicketDescriptionParts => {
  const parts: TicketDescriptionParts = { email: '', address: '', assignment: '', body: '', attachments: [], notes: '' };
  const bodyLines: string[] = [];
  const noteLines: string[] = [];
  const attachmentKeys = new Set<string>();
  let inNotes = false;

  for (const rawLine of (description ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();

    if (ATTACHMENT_LINE.test(line)) {
      const key = getAttachmentKey(line);
      if (!attachmentKeys.has(key)) {
        attachmentKeys.add(key);
        parts.attachments.push(line);
      }
      continue;
    }

    const notesMatch = line.match(/^Owner notes:\s*(.*)$/i);
    if (notesMatch) {
      inNotes = true;
      if (notesMatch[1]) noteLines.push(notesMatch[1]);
      continue;
    }

    if (inNotes) {
      noteLines.push(rawLine.trimEnd());
      continue;
    }

    const metaMatch = line.match(/^(Email|Address|Assigned to):\s*(.*)$/i);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (key === 'email' && !parts.email) parts.email = value;
      else if (key === 'address' && !parts.address) parts.address = value;
      else if (key === 'assigned to') parts.assignment = value;
      continue;
    }

    bodyLines.push(rawLine.trimEnd());
  }

  parts.body = normalizeBlock(bodyLines);
  parts.notes = normalizeBlock(noteLines);
  return parts;
};

export const buildTicketDescription = (parts: TicketDescriptionParts) => {
  const header = [
    parts.email.trim() && `Email: ${parts.email.trim()}`,
    parts.address.trim() && `Address: ${parts.address.trim()}`,
    parts.assignment.trim() && `Assigned to: ${parts.assignment.trim()}`,
  ].filter(Boolean).join('\n');

  const sections = [
    header,
    parts.body.trim(),
    parts.attachments.join('\n'),
    parts.notes.trim() && `Owner notes:\n${parts.notes.trim()}`,
  ].filter(Boolean);

  return sections.join('\n\n') || null;
};

export const MAX_TICKET_DESCRIPTION_LENGTH = 5000;

export const deriveTicketTitle = (body: string) => {
  const trimmed = body.trim();
  return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
};

// Matches the title formats the dashboard and tenant portal generate at ticket creation.
export const isDerivedTicketTitle = (title: string | null | undefined, body: string) => {
  const current = (title ?? '').trim();
  return current === deriveTicketTitle(body) || current === body.trim().slice(0, 50).trim();
};
