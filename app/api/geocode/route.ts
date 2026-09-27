import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';

type GeocodeMatch = { latitude: number; longitude: number; label: string };

// Address ranges like "2454-2474 Adams Ave" are not in geocoder databases, so fall
// back to progressively looser forms until something matches.
const buildCandidates = (address: string) => {
  const candidates = [address];

  const firstOfRange = address.replace(/(\d+)\s*[-\u2013\u2014]\s*\d+/, '$1');
  if (firstOfRange !== address) {
    candidates.push(firstOfRange);
  }

  const withoutStreetNumber = firstOfRange.replace(/^\s*\d+\s*/, '');
  if (withoutStreetNumber && withoutStreetNumber !== firstOfRange) {
    candidates.push(withoutStreetNumber);
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
};

const geocodeWithGoogle = async (query: string, apiKey: string): Promise<GeocodeMatch | null> => {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`,
  );
  const result = await response.json();
  const location = result?.results?.[0]?.geometry?.location;

  return location
    ? { latitude: location.lat, longitude: location.lng, label: result.results[0].formatted_address ?? query }
    : null;
};

const geocodeWithNominatim = async (query: string): Promise<GeocodeMatch | null> => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': 'Landbaron Property Maintenance (https://landbaron.app)',
        'Accept-Language': 'en',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Geocoding service responded with ${response.status}`);
  }

  const matches = await response.json();
  const match = Array.isArray(matches) ? matches[0] : null;

  return match
    ? { latitude: Number(match.lat), longitude: Number(match.lon), label: match.display_name ?? query }
    : null;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user || user.role === 'tenant') {
      return NextResponse.json({ error: 'Staff access is required.' }, { status: 403 });
    }

    const address = request.nextUrl.searchParams.get('address')?.trim();
    if (!address) {
      return NextResponse.json({ error: 'An address is required.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const candidates = buildCandidates(address);

    for (const [index, candidate] of candidates.entries()) {
      // Nominatim asks for no more than one request per second.
      if (index > 0 && !apiKey) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const match = apiKey
        ? await geocodeWithGoogle(candidate, apiKey)
        : await geocodeWithNominatim(candidate);

      if (match) {
        return NextResponse.json({ ...match, matchedAddress: candidate, approximate: index > 0 });
      }
    }

    return NextResponse.json(
      { error: 'No match was found for that address. You can enter coordinates manually instead.' },
      { status: 404 },
    );
  } catch (error) {
    console.error('GET /api/geocode failed:', error);
    return NextResponse.json({ error: 'Address could not be looked up right now.' }, { status: 500 });
  }
}
