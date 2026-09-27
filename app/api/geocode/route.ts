import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';

// Uses Google's Geocoding API when a key is configured, otherwise falls back to
// OpenStreetMap's Nominatim, which is free but rate limited to ~1 request/second.
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

    if (apiKey) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
      );
      const result = await response.json();
      const location = result?.results?.[0]?.geometry?.location;

      if (!location) {
        return NextResponse.json({ error: 'No match was found for that address.' }, { status: 404 });
      }

      return NextResponse.json({
        latitude: location.lat,
        longitude: location.lng,
        label: result.results[0].formatted_address ?? address,
      });
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
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

    if (!match) {
      return NextResponse.json({ error: 'No match was found for that address.' }, { status: 404 });
    }

    return NextResponse.json({
      latitude: Number(match.lat),
      longitude: Number(match.lon),
      label: match.display_name ?? address,
    });
  } catch (error) {
    console.error('GET /api/geocode failed:', error);
    return NextResponse.json({ error: 'Address could not be looked up right now.' }, { status: 500 });
  }
}
