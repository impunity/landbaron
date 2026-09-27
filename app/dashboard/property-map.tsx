'use client';

type PropertyMapProps = {
  address: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

// Works without a Google Maps API key. If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set,
// the official Embed API is used instead. Stored coordinates make the satellite and
// Street View links exact; otherwise they fall back to address lookup.
export function PropertyMap({ address, city, state, postalCode, latitude, longitude }: PropertyMapProps) {
  const fullAddress = [address, city, state, postalCode].filter(Boolean).join(', ').trim();
  const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';

  if (!fullAddress && !hasCoordinates) {
    return null;
  }

  const coordinates = hasCoordinates ? `${latitude},${longitude}` : '';
  const query = encodeURIComponent(hasCoordinates ? coordinates : fullAddress);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const embedSrc = apiKey
    ? hasCoordinates
      ? `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${coordinates}&zoom=19&maptype=satellite`
      : `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${query}&zoom=18&maptype=satellite`
    : `https://maps.google.com/maps?q=${query}&z=${hasCoordinates ? 19 : 18}&output=embed`;
  const satelliteUrl = `https://maps.google.com/maps?q=${query}&t=k`;
  const streetViewUrl = hasCoordinates
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinates}`
    : `https://www.google.com/maps?q=${query}&layer=c`;

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <a
        href={satelliteUrl}
        target="_blank"
        rel="noreferrer"
        title="Open satellite view in Google Maps"
        className="group relative block h-56 w-full bg-slate-100"
      >
        <iframe
          src={embedSrc}
          title={`Map of ${fullAddress || coordinates}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="pointer-events-none h-full w-full border-0"
        />
        <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm transition group-hover:bg-slate-900">
          Open satellite view
        </span>
      </a>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
        <p className="text-xs text-slate-500">{fullAddress || coordinates}</p>
        <a
          href={streetViewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-800"
        >
          Street View
        </a>
      </div>
    </div>
  );
}
