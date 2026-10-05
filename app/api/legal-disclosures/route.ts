import { NextRequest, NextResponse } from 'next/server';

import { getRequestOrganizationId } from '@/lib/organization-context';
import { getAuthenticatedRequestUser } from '@/lib/request-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'legal-disclosures';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DOCUMENT_TYPES: Record<string, { contentType: string; signature: number[] }> = {
  pdf: { contentType: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  doc: { contentType: 'application/msword', signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: [0x50, 0x4b] },
};

function isMissingTable(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ documents: [] });

    const documentId = request.nextUrl.searchParams.get('id');
    if (documentId) {
      const { data: document, error } = await supabaseAdmin.from('legal_disclosures')
        .select('id, organization_id, file_name, storage_path').eq('id', documentId).eq('organization_id', organizationId).maybeSingle();
      if (error) throw error;
      if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET)
        .createSignedUrl(document.storage_path, 60, { download: document.file_name });
      if (signedError) throw signedError;
      return NextResponse.json({ url: signed.signedUrl });
    }

    const { data, error } = await supabaseAdmin.from('legal_disclosures')
      .select('id, file_name, description, content_type, file_size, uploaded_by, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: 'Apply supabase/legal-disclosures.sql to enable Legal Disclosures.' }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ documents: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET legal disclosures failed:', error);
    return NextResponse.json({ error: 'Legal disclosures could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json({ error: 'Only owners and managers can upload legal disclosures.' }, { status: 403 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found.' }, { status: 403 });

    const form = await request.formData();
    const file = form.get('file');
    const description = typeof form.get('description') === 'string' ? String(form.get('description')).trim() : '';
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a document to upload.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Documents must be 25 MB or smaller.' }, { status: 400 });
    if (description.length > 2000) return NextResponse.json({ error: 'Descriptions must be 2,000 characters or fewer.' }, { status: 400 });

    const fileName = file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim() ?? '';
    if (!fileName || fileName.length > 255) return NextResponse.json({ error: 'The filename must be between 1 and 255 characters.' }, { status: 400 });
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    const documentType = DOCUMENT_TYPES[extension];
    if (!documentType || (file.type && file.type !== documentType.contentType && file.type !== 'application/octet-stream')) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX documents are supported.' }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.slice(0, documentType.signature.length).arrayBuffer());
    if (!documentType.signature.every((byte, index) => bytes[index] === byte)) {
      return NextResponse.json({ error: 'The file contents do not match its document type.' }, { status: 400 });
    }

    const storagePath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
    const { data: uploaded, error: uploadError } = await supabaseAdmin.storage.from(BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: documentType.contentType });
    if (uploadError) {
      if (uploadError.message.toLowerCase().includes('bucket')) return NextResponse.json({ error: 'Run supabase/legal-disclosures.sql to create the private document bucket.' }, { status: 503 });
      throw uploadError;
    }

    const { data: document, error: insertError } = await supabaseAdmin.from('legal_disclosures').insert({
      organization_id: organizationId,
      file_name: fileName,
      description,
      storage_path: uploaded.path,
      content_type: documentType.contentType,
      file_size: file.size,
      uploaded_by: user.id,
    }).select('id, file_name, description, content_type, file_size, uploaded_by, created_at').single();
    if (insertError) {
      await supabaseAdmin.storage.from(BUCKET).remove([uploaded.path]);
      if (isMissingTable(insertError)) return NextResponse.json({ error: 'Apply supabase/legal-disclosures.sql to enable Legal Disclosures.' }, { status: 503 });
      throw insertError;
    }
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('POST legal disclosure failed:', error);
    return NextResponse.json({ error: 'Legal disclosure could not be uploaded.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json({ error: 'Only owners and managers can edit legal disclosures.' }, { status: 403 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found.' }, { status: 403 });
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    if (!id || description === null || description.length > 2000) return NextResponse.json({ error: 'Enter a valid description (2,000 characters maximum).' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('legal_disclosures').update({ description })
      .eq('id', id).eq('organization_id', organizationId)
      .select('id, file_name, description, content_type, file_size, uploaded_by, created_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    return NextResponse.json({ document: data });
  } catch (error) {
    console.error('PATCH legal disclosure failed:', error);
    return NextResponse.json({ error: 'Legal disclosure description could not be saved.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    const user = await getAuthenticatedRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json({ error: 'Only owners and managers can delete legal disclosures.' }, { status: 403 });
    const organizationId = await getRequestOrganizationId(user);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found.' }, { status: 403 });
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
    const { data: document, error: lookupError } = await supabaseAdmin.from('legal_disclosures')
      .select('id, storage_path').eq('id', id).eq('organization_id', organizationId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    const { error: deleteError } = await supabaseAdmin.from('legal_disclosures').delete().eq('id', id).eq('organization_id', organizationId);
    if (deleteError) throw deleteError;
    const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove([document.storage_path]);
    if (storageError) console.error('Deleted legal disclosure file could not be removed from storage:', storageError);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE legal disclosure failed:', error);
    return NextResponse.json({ error: 'Legal disclosure could not be deleted.' }, { status: 500 });
  }
}
