import { uploadTooLargeMessage } from '@/lib/client-image';

export async function uploadSubmittedTicketFiles(ticketId: string, files: Array<{ file: File; uploadId: string }>, accessToken: string) {
  const warnings: string[] = [];
  for (const { file, uploadId } of files) {
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('uploadId', uploadId);
      const response = await fetch(`/api/tickets/${ticketId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      if (response.status === 413) throw new Error(uploadTooLargeMessage(file));
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Could not upload ${file.name}.`);
      }
    } catch (error) {
      console.error('Ticket saved but attachment upload failed:', error);
      warnings.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
    }
  }
  return warnings.length ? `Your ticket was saved, but some attachments could not be uploaded. ${warnings.join(' ')} Open the ticket to retry those uploads; do not submit another ticket.` : null;
}
