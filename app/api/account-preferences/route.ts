import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const defaultPreferences = { temperature_unit: 'fahrenheit', language: 'en', birthdate: null, gender: null, avatar_url: null };

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const { data, error } = await supabaseAdmin.from('user_preferences')
      .select('temperature_unit, language, birthdate, gender, avatar_url').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ? { ...defaultPreferences, ...data } : defaultPreferences);
  } catch (error) {
    console.error('GET /api/account-preferences failed:', error);
    return NextResponse.json({ error: 'Account preferences could not be loaded.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const body = await request.json();
    if (body.temperature_unit !== 'fahrenheit' && body.temperature_unit !== 'celsius') {
      return NextResponse.json({ error: 'Choose Fahrenheit or Celsius.' }, { status: 400 });
    }
    if (!['en', 'es', 'fr', 'de', 'pt'].includes(body.language)) {
      return NextResponse.json({ error: 'Choose a supported language.' }, { status: 400 });
    }
    if (body.gender !== null && !['female', 'male', 'non_binary'].includes(body.gender)) {
      return NextResponse.json({ error: 'Choose a listed gender or leave it blank.' }, { status: 400 });
    }
    const birthdate = body.birthdate === '' ? null : body.birthdate;
    if (birthdate !== null && (typeof birthdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate))) {
      return NextResponse.json({ error: 'Enter a valid birthday.' }, { status: 400 });
    }
    if (typeof birthdate === 'string') {
      const date = new Date(`${birthdate}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthdate) {
        return NextResponse.json({ error: 'Enter a valid birthday.' }, { status: 400 });
      }
      if (birthdate > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: 'Birthday cannot be in the future.' }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin.from('user_preferences').upsert({
      user_id: user.id,
      temperature_unit: body.temperature_unit,
      language: body.language,
      birthdate,
      gender: body.gender,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('temperature_unit, language, birthdate, gender, avatar_url').single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('PUT /api/account-preferences failed:', error);
    return NextResponse.json({ error: 'Account preferences could not be saved.' }, { status: 500 });
  }
}
