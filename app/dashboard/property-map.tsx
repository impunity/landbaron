'use client';

type PropertyMapProps = {
  address: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

// Works without a Google Maps API key. If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set,
// the official Embed API is used instead.
export function PropertyMap({ address, city, state, postalCode }: PropertyMapProps) {
  const fullAddress = [address, city, state, postalCode].filter(Boolean).join(', ').trim();

  if (!fullAddress) {
    return null;
  }

  const query = encodeURIComponent(fullAddress);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const embedSrc = apiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${query}&zoom=18&maptype=satellite`
    : `https://maps.google.com/maps?q=${query}&z=18&output=embed`;
  const satelliteUrl = `https://maps.google.com/maps?q=${query}&t=k`;
  const streetViewUrl = `https://www.google.com/maps?q=${query}&layer=c`;

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
          title={`Map of ${fullAddress}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="pointer-events-none h-full w-full border-0"
        />
        <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm transition group-hover:bg-slate-900">
          Open satellite view
        </span>
      </a>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
        <p className="text-xs text-slate-500">{fullAddress}</p>
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
