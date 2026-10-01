'use client';

import { useRouter } from 'next/navigation';

import { setTimeFormat, useTimeFormat, type TimeFormat } from '@/lib/time-format';

export default function SettingsPage() {
  const router = useRouter();
  const timeFormat = useTimeFormat();

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => router.back()} className="text-sm font-medium text-slate-600 hover:text-slate-900">Back</button>
        <h1 className="mt-4 text-2xl font-semibold">Settings</h1>
        <section className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold">Time display</h2>
          <p className="mt-1 text-sm text-slate-600">Choose how times appear on this device.</p>
          <fieldset className="mt-4 flex w-fit overflow-hidden rounded-md border border-slate-300" aria-label="Time format">
            {(['12', '24'] as TimeFormat[]).map((format) => (
              <button key={format} type="button" aria-pressed={timeFormat === format} onClick={() => setTimeFormat(format)} className={`px-4 py-2 text-sm font-medium ${timeFormat === format ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {format}-hour
              </button>
            ))}
          </fieldset>
        </section>
      </div>
    </main>
  );
}