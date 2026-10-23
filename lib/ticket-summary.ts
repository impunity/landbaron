export const MAX_TICKET_SUMMARY_LENGTH = 255;

export function validateTicketSummary(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'Summary is required.';
  if (value.length > MAX_TICKET_SUMMARY_LENGTH) {
    return `Summary must be ${MAX_TICKET_SUMMARY_LENGTH} characters or fewer.`;
  }
  return null;
}
