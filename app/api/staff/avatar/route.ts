import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

const getAvatarPath = (email: string) => {
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '-');
  return `staff-avatars/${sanitized}-${Date.now()}.png`;
};

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 },
      );
    }

    const userRole = request.headers.get('x-user-role')?.trim().toLowerCase();
    const userEmail = request.headers.get('x-user-email')?.trim().toLowerCase();
    const formData = await request.formData();
    const file = formData.get('file');
    const targetEmail = String(formData.get('email') ?? '').trim().toLowerCase();

    if (!targetEmail) {
      return NextResponse.json({ error: 'Staff email is required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No avatar was uploaded.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'file must be under 8mb' }, { status: 400 });
    }

    const canManageAvatar = userRole === 'owner' || userEmail === targetEmail;
    if (!canManageAvatar) {
      return NextResponse.json(
        { error: 'Only the owner or the staff member can update this avatar.' },
        { status: 403 },
      );
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() || 'png' : 'png';
    const filePath = `staff-avatars/${targetEmail.replace(/[^a-z0-9@._-]/g, '-')}-${Date.now()}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('staff-avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('staff-avatars')
      .getPublicUrl(uploadData.path);

    const avatarUrl = publicUrlData.publicUrl;

    const { data: staffRecord, error: staffError } = await supabaseAdmin
      .from('staff_members')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('email', targetEmail)
      .select();

    if (staffError) {
      throw staffError;
    }

    if (!staffRecord || staffRecord.length === 0) {
      const { data: createdStaff, error: createError } = await supabaseAdmin
        .from('staff_members')
        .upsert(
          {
            name: targetEmail.split('@')[0] || targetEmail,
            email: targetEmail,
            role: 'Maintenance',
            avatar_url: avatarUrl,
          },
          { onConflict: 'email' },
        )
        .select();

      if (createError) {
        throw createError;
      }

      return NextResponse.json({ ok: true, avatar_url: createdStaff?.[0]?.avatar_url ?? avatarUrl });
    }

    return NextResponse.json({ ok: true, avatar_url: staffRecord[0].avatar_url ?? avatarUrl });
  } catch (error) {
    console.error('POST /api/staff/avatar failed:', error);

    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Avatar upload failed.';

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
