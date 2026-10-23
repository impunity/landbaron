export type ResolutionTicket = {
  status: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
};

export function buildTicketLeaderboard(tickets: ResolutionTicket[]) {
  const resolvers = new Map<string, { id: string; name: string; count: number; totalDays: number }>();
  let totalResolved = 0;
  let unattributed = 0;
  for (const ticket of tickets) {
    const status = ticket.status?.toLowerCase();
    if (status !== 'resolved' && !(status === 'archived' && ticket.resolved_at)) continue;
    totalResolved += 1;
    if (!ticket.resolved_by) {
      unattributed += 1;
      continue;
    }
    const age = (Date.parse(ticket.resolved_at ?? '') - Date.parse(ticket.created_at)) / 86_400_000;
    if (!Number.isFinite(age) || age < 0) throw new Error('A resolved ticket has invalid resolution dates.');
    const resolver = resolvers.get(ticket.resolved_by) ?? {
      id: ticket.resolved_by, name: ticket.resolved_by_name || 'Former member', count: 0, totalDays: 0,
    };
    resolver.count += 1;
    resolver.totalDays += age;
    resolvers.set(resolver.id, resolver);
  }
  const rows = [...resolvers.values()].map((resolver) => ({
    id: resolver.id,
    name: resolver.name,
    resolved_count: resolver.count,
    percentage: resolver.count / totalResolved * 100,
    average_days: resolver.totalDays / resolver.count,
  })).sort((a, b) => b.resolved_count - a.resolved_count || a.average_days - b.average_days || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { rows, total_resolved: totalResolved, unattributed };
}
