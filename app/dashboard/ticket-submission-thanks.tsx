'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { getBookCoverUrl, type ReadingRecommendation } from '@/lib/reading-recommendations';

export type TicketSubmissionConfirmation = {
  ticketId: string;
  book: ReadingRecommendation;
  warning: string | null;
};

export function TicketSubmissionThanks({ confirmation, onContinue }: {
  confirmation: TicketSubmissionConfirmation;
  onContinue: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [coverError, setCoverError] = useState(false);
  const { book, warning } = confirmation;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus({ preventScroll: true });
    if (element) element.scrollTop = 0;
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="ticket-thanks-title" aria-describedby="ticket-thanks-description"
      onCancel={(event) => { event.preventDefault(); onContinue(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onContinue();
        }
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-black/50 sm:p-8">
      <h2 ref={heading} tabIndex={-1} id="ticket-thanks-title" className="text-3xl font-semibold outline-none">Thank you!</h2>
      <p id="ticket-thanks-description" className="mt-2 text-sm text-slate-600">Your maintenance ticket has been submitted.</p>
      {warning && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      <p className="mt-6 font-medium">For your reading consideration... </p>
      <a href={book.url} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-start gap-4 rounded-xl border border-slate-200 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700">
        {coverError ? <span role="status" className="flex h-36 w-24 shrink-0 items-center justify-center rounded bg-slate-100 p-2 text-center text-xs text-slate-500">Cover unavailable</span> : (
          <Image src={getBookCoverUrl(book)} alt={`${book.title} book cover`} width={96} height={144}
            unoptimized referrerPolicy="no-referrer" onError={() => setCoverError(true)}
            className="h-36 w-24 shrink-0 rounded object-contain" />
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{book.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{book.author}</p>
          <p className="mt-2 text-xs font-medium text-teal-800">{book.year} National Book Award winner · {book.category}</p>
          <p className="mt-2 text-sm text-slate-700">{book.summary}</p>
          <p className="mt-3 text-sm font-medium text-teal-800 underline">Read the full summary <span className="sr-only">(opens in a new tab)</span></p>
        </div>
      </a>
      <p className="mt-3 text-xs text-slate-500">A selection of past National Book Award winners. Covers from Open Library.</p>
      <button type="button" onClick={onContinue} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">Continue to ticket</button>
    </dialog>
  );
}
