/**
 * delete-account Edge Function
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Required by App Store Review Guideline 5.1.1(v): apps that support account
 * creation must let users initiate account deletion from within the app.
 *
 * FLOW:
 * 1. Authenticate the caller from their JWT (Authorization: Bearer <token>).
 * 2. Using the service role, delete their Storage objects (not cascaded by DB FKs).
 * 3. Delete access_grants where they are the RECIPIENT of other users' documents
 *    (these reference the user only by email, so FK cascade won't remove them).
 * 4. Delete the auth.users row. All owned rows (profiles, documents, document_keys,
 *    folders, access_grants they granted, analytics, security_events, watermark
 *    hashes, comments) cascade automatically via ON DELETE CASCADE.
 *
 * The client can NOT do this with the anon key — deleting an auth user requires
 * the service role, which must never ship in the app. Hence this function.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return Response.json(
      { success: false, error: 'method_not_allowed' },
      { status: 405, headers: corsHeaders }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json(
      { success: false, error: 'unauthorized', message: 'Authorization header required' },
      { status: 401, headers: corsHeaders }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('EDGE_SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('EDGE_SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('EDGE_SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json(
      { success: false, error: 'server_configuration_error' },
      { status: 500, headers: corsHeaders }
    )
  }

  try {
    // 1. Identify the caller from their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return Response.json(
        { success: false, error: 'invalid_session' },
        { status: 401, headers: corsHeaders }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const email = (user.email || '').toLowerCase()

    // 2. Remove Storage objects for the user's documents (FKs don't cascade Storage).
    const { data: docs } = await admin
      .from('documents')
      .select('file_path')
      .eq('owner_id', user.id)

    const paths = (docs || []).map((d: { file_path: string }) => d.file_path).filter(Boolean)
    if (paths.length > 0) {
      const { error: storageErr } = await admin.storage.from('documents').remove(paths)
      if (storageErr) {
        // Non-fatal: log and continue with account deletion.
        console.warn('[delete-account] Storage cleanup warning:', storageErr.message)
      }
    }

    // 3. Delete grants where this user is the recipient of OTHER users' documents.
    if (email) {
      await admin.from('access_grants').delete().eq('recipient_email', email)
      // Best-effort cleanup of watermark registry entries naming this recipient.
      await admin.from('document_watermark_hashes').delete().eq('recipient_email', email)
    }

    // 4. Delete the auth user — cascades all owned rows via ON DELETE CASCADE.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error('[delete-account] deleteUser failed:', delErr.message)
      return Response.json(
        { success: false, error: 'deletion_failed', message: delErr.message },
        { status: 500, headers: corsHeaders }
      )
    }

    console.log('[delete-account] Deleted account:', user.id)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err) {
    console.error('[delete-account] Unexpected error:', err)
    return Response.json(
      { success: false, error: 'internal_error' },
      { status: 500, headers: corsHeaders }
    )
  }
})
