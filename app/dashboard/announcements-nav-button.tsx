'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

type AnnouncementProperty = { id: string; name: string; address: string };

export function AnnouncementsNavButton({ propertyId: currentPropertyId }: { propertyId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [properties, setProperties] = useState<AnnouncementProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const openAnnouncements = async () => {
    const propertyId = currentPropertyId || pathname?.match(/^\/dashboard\/properties\/([^/]+)(?:\/|$)/)?.[1];
    if (propertyId) {
      router.push(`/dashboard/properties/${propertyId}/announcements`);
      return;
    }

    setShowPropertyPicker(true);
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch('/api/announcements/properties', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Properties could not be loaded.');
      setProperties(result.properties ?? []);
    } catch (error) {
      setPropertiesError(error instanceof Error ? error.message : 'Properties could not be loaded.');
    } finally {
      setPropertiesLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void openAnnouncements()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Announcements/Discussions</button>
      {showPropertyPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPropertyPicker(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="announcement-property-title" onKeyDown={(event) => { if (event.key === 'Escape') setShowPropertyPicker(false); }} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="announcement-property-title" className="text-lg font-semibold text-slate-900">Choose a property</h2>
              <button type="button" autoFocus onClick={() => setShowPropertyPicker(false)} aria-label="Close" className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100">×</button>
            </div>
            <p className="mt-1 text-sm text-slate-600">Which property&apos;s announcements and discussions would you like to see?</p>
            {propertiesLoading ? <p className="mt-5 text-sm text-slate-500">Loading properties...</p> : propertiesError ? (
              <div className="mt-5 text-sm text-rose-700" role="alert">{propertiesError}<button type="button" onClick={() => void openAnnouncements()} className="ml-2 underline">Retry</button></div>
            ) : properties.length === 0 ? <p className="mt-5 text-sm text-slate-500">No accessible properties found.</p> : (
              <div className="mt-4 max-h-80 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200">
                {properties.map((property) => (
                  <button key={property.id} type="button" onClick={() => { setShowPropertyPicker(false); router.push(`/dashboard/properties/${property.id}/announcements`); }} className="block w-full px-2 py-3 text-left hover:bg-slate-50">
                    <span className="block text-sm font-semibold text-slate-900">{property.name}</span>
                    <span className="block text-xs text-slate-500">{property.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}