export function getTicketConversationError(error: unknown, action: 'load' | 'save') {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (typeof code === 'string' && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) {
    return 'Conversation database schema is missing or out of date. Run the updated supabase/ticket-conversations-and-resolvers.sql, then reload. It upgrades existing message tables without deleting messages.';
  }
  if (code === '42501') {
    return 'Conversation database access was denied. Check the server service-role configuration and ticket_messages permissions.';
  }
  return action === 'load'
    ? 'Conversation could not be loaded. Please reload and try again. If this continues, contact your administrator.'
    : 'Message could not be saved. Please try again. If this continues, contact your administrator.';
}
