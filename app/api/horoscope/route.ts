import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { getHoroscopeSlug } from '@/lib/profile-insights';

const horoscopeSigns = new Set(['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

  const sign = getHoroscopeSlug(request.nextUrl.searchParams.get('sign') ?? '');
  if (!horoscopeSigns.has(sign)) return NextResponse.json({ error: 'A valid zodiac sign is required.' }, { status: 400 });
  const language = request.nextUrl.searchParams.get('language') ?? 'en';
  if (!['en', 'es', 'fr', 'de', 'pt'].includes(language)) return NextResponse.json({ error: 'A supported language is required.' }, { status: 400 });

  try {
    const response = await fetch(`https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Horoscope provider returned ${response.status}.`);
    const result = await response.json();
    const horoscope = result?.data?.horoscope;
    if (typeof horoscope !== 'string' || !horoscope.trim()) throw new Error('Horoscope provider returned no text.');
    const sentences = horoscope.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    let summary = sentences.slice(0, 2).join(' ').trim().slice(0, 360);
    if (language !== 'en') {
      try {
        const translationUrl = new URL('https://api.mymemory.translated.net/get');
        translationUrl.search = new URLSearchParams({ q: summary, langpair: `en|${language}` }).toString();
        const translationResponse = await fetch(translationUrl, { signal: AbortSignal.timeout(4_000), next: { revalidate: 86400 } });
        if (translationResponse.ok) {
          const translation = await translationResponse.json();
          const translatedText = typeof translation?.responseData?.translatedText === 'string'
            ? translation.responseData.translatedText
            : '';
          if (translatedText) summary = translatedText.slice(0, 360);
        }
      } catch {
        // Keep the source horoscope if optional translation is unavailable.
      }
    }
    return NextResponse.json({ sign, date: result.data.date, horoscope: summary });
  } catch (error) {
    console.error('GET /api/horoscope failed:', error);
    return NextResponse.json({ error: 'Today’s horoscope is temporarily unavailable.' }, { status: 503 });
  }
}