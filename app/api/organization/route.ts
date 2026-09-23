import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role === 'tenant') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { data: ownedOrganization } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .or(`owner_user_id.eq.${user.id},owner_email.ilike.${user.email}`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: organization, error } = ownedOrganization
      ? { data: ownedOrganization, error: null }
      : await supabaseAdmin
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ organization: organization ?? null });
  } catch (error) {
    console.error('GET /api/organization failed:', error);
    return NextResponse.json({ error: 'Unable to load organization details.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can edit organization details.' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const stringFields = [
      'name',
      'address',
      'city',
      'state',
      'postal_code',
      'contact_email',
      'contact_phone',
      'tax_id',
      'website_url',
    ] as const;

    for (const field of stringFields) {
      if (typeof body[field] === 'string') {
        updates[field] = body[field].trim() || null;
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .or(`owner_user_id.eq.${user.id},owner_email.ilike.${user.email}`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: fallback } = existing ? { data: null } : await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const organizationToUpdate = existing ?? fallback;

    if (!organizationToUpdate) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    updates.owner_email = user.email;
    updates.owner_user_id = user.id;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', organizationToUpdate.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const { error: ownerError } = await supabaseAdmin
      .from('staff_members')
      .upsert(
        {
          organization_id: data.id,
          name: data.name,
          email: user.email,
          role: 'Owner',
        },
        { onConflict: 'email' },
      );

    if (ownerError) {
      throw ownerError;
    }

    return NextResponse.json({ ok: true, organization: data });
  } catch (error) {
    console.error('PATCH /api/organization failed:', error);
    return NextResponse.json({ error: 'Organization could not be updated.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
    }

    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    }

    const { data: existingOrganization } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .or(`owner_user_id.eq.${user.id},owner_email.ilike.${user.email}`)
      .limit(1)
      .maybeSingle();

    if (existingOrganization) {
      const { error: repairError } = await supabaseAdmin
        .from('staff_members')
        .upsert(
          {
            organization_id: existingOrganization.id,
            name: existingOrganization.name,
            email: user.email,
            role: 'Owner',
          },
          { onConflict: 'email' },
        );

      if (repairError) throw repairError;
      return NextResponse.json({ ok: true, organization: existingOrganization, repaired: true });
    }

    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .ilike('email', user.email)
      .limit(1)
      .maybeSingle();
    const { data: existingStaff } = await supabaseAdmin
      .from('staff_members')
      .select('id')
      .ilike('email', user.email)
      .limit(1)
      .maybeSingle();

    if (existingTenant || existingStaff || user.role !== 'tenant') {
      return NextResponse.json({ error: 'This account already has an organization or access.' }, { status: 409 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert([{
        name,
        owner_email: user.email,
        owner_user_id: user.id,
        address: typeof body.address === 'string' ? body.address.trim() || null : null,
        city: typeof body.city === 'string' ? body.city.trim() || null : null,
        state: typeof body.state === 'string' ? body.state.trim() || null : null,
        postal_code: typeof body.postal_code === 'string' ? body.postal_code.trim() || null : null,
        contact_email: typeof body.contact_email === 'string' ? body.contact_email.trim() || user.email : user.email,
        contact_phone: typeof body.contact_phone === 'string' ? body.contact_phone.trim() || null : null,
        tax_id: typeof body.tax_id === 'string' ? body.tax_id.trim() || null : null,
        website_url: typeof body.website_url === 'string' ? body.website_url.trim() || null : null,
        invite_code: crypto.randomBytes(6).toString('hex').toUpperCase(),
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    const { error: ownerError } = await supabaseAdmin
      .from('staff_members')
      .upsert(
        {
          organization_id: data.id,
          name,
          email: user.email,
          role: 'Owner',
        },
        { onConflict: 'email' },
      );

    if (ownerError) {
      throw ownerError;
    }

    return NextResponse.json({ ok: true, organization: data });
  } catch (error) {
    console.error('POST /api/organization failed:', error);
    return NextResponse.json({ error: 'Organization could not be created.' }, { status: 500 });
  }
}
