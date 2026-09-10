import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      tickets: data ?? [],
      count: data?.length ?? 0,
    });
  } catch (error) {
    console.error('GET /api/tickets failed:', error);
    return NextResponse.json(
      { error: 'Unable to load tickets right now.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, status, priority } = await request.json();

    if (!title || !description || !status || !priority) {
      return NextResponse.json(
        { error: 'Title, description, status, and priority are required.' },
        { status: 400 },
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            'Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and reopen the app.',
        },
        { status: 500 },
      );
    }

    const { error } = await supabaseAdmin.from('tickets').insert([
      {
        title,
        description,
        status,
        priority,
      },
    ]);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/tickets failed:', error);
    return NextResponse.json(
      {
        error:
          'Ticket could not be submitted. This usually means the tickets table has an RLS policy or a schema constraint that still needs to be updated in Supabase.',
      },
      { status: 500 },
    );
  }
}
