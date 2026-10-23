'use client';

import { MAX_TICKET_SUMMARY_LENGTH } from '@/lib/ticket-summary';

export function TicketSummaryField({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor="ticket-summary" className="mb-1 block text-sm font-medium text-slate-700">Summary</label>
      <input id="ticket-summary" name="summary" type="text" required maxLength={MAX_TICKET_SUMMARY_LENGTH}
        value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
        aria-describedby="ticket-summary-count"
        placeholder="Briefly describe the repair needed"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:opacity-60" />
      <p id="ticket-summary-count" className="mt-1 text-right text-xs tabular-nums text-slate-500">
        <span>{MAX_TICKET_SUMMARY_LENGTH - value.length}</span> <span>characters remaining</span>
      </p>
    </div>
  );
}
