/**
 * notify-owner Edge Function
 *
 * Sends a real-time push notification to a document's OWNER when a recipient
 * opens the document or triggers a screenshot / screen-recording. This is the
 * server side of the "owner alerts" feature — it can't run purely on the
 * client because a local notification fires on the actor's device, not the
 * owner's, and looking up the owner's push token requires the service role.
 *
 * FLOW:
 * 1. Authenticate the caller from their JWT (Authorization: Bearer <token>).
 * 2. Look up the document + owner with the service role.
 * 3. Skip if the caller IS the owner (don't alert yourself about your own view).
 * 4. Authorize: the caller must have an active access_grant on the document
 *    (prevents anyone from spamming an owner with fake alerts).
 * 5. Read the owner's push_token; no-op if they have none / notifications off.
 * 6. Send the alert via the Expo push service. Bodies carry NO filename or
 *    email (they show on the lock screen) — only a generic message.
 *
 * Input JSON:  { documentId: string, eventType: 'view_start' | 'screenshot' | 'screen_recording' }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Lock-screen-safe copy: never include filename / email / recipient PII.
const MESSAGES: Record<string, { title: string; body: string }> = {
  view_start: {
    title: '👁️ Document Opened',
    body: 'One of your shared documents was just opened.',
  },
  screenshot: {
    title: '📸 Screenshot Alert',
    body: 'A screenshot attempt was detected on one of your shared documents.',
  },
  screen_recording: {
    title: '🎥 Screen Recording Alert',
    body: 'Screen recording was detected on one of your shared documents.',
  },
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: corsHeaders })

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ success: false, error: 'unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('EDGE_SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('EDGE_SUPABASE_ANON_KEY')
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('EDGE_SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: 'server_configuration_error' }, 500)
  }

  try {
    const { documentId, eventType } = await req.json().catch(() => ({}))
    if (!documentId || !eventType || !MESSAGES[eventType]) {
      return json({ success: false, error: 'invalid_params' }, 400)
    }

    // 1. Identify the caller.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ success: false, error: 'invalid_session' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 2. Look up the document + owner.
    const { data: doc } = await admin
      .from('documents')
      .select('id, owner_id')
      .eq('id', documentId)
      .maybeSingle()
    if (!doc) {
      return json({ success: false, error: 'document_not_found' }, 404)
    }

    // 3. Don't notify the owner about their own activity.
    if (doc.owner_id === user.id) {
      return json({ success: true, skipped: 'owner_is_caller' }, 200)
    }

    // 4. Authorize the caller — must have an active grant on this document.
    const callerEmail = (user.email || '').toLowerCase()
    const { data: grant } = await admin
      .from('access_grants')
      .select('id')
      .eq('document_id', documentId)
      .eq('recipient_email', callerEmail)
      .eq('status', 'active')
      .maybeSingle()
    if (!grant) {
      return json({ success: false, error: 'forbidden' }, 403)
    }

    // 5. Read the owner's push token.
    const { data: ownerProfile } = await admin
      .from('profiles')
      .select('push_token')
      .eq('id', doc.owner_id)
      .maybeSingle()

    const token = ownerProfile?.push_token
    if (!token) {
      return json({ success: true, skipped: 'no_token' }, 200)
    }

    // 6. Send via Expo push service.
    const msg = MESSAGES[eventType]
    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: token,
        title: msg.title,
        body: msg.body,
        sound: 'default',
        priority: 'high',
        channelId: 'secureshare-alerts',
        data: { type: eventType, documentId },
      }),
    })

    const pushResult = await pushRes.json().catch(() => null)

    // If Expo reports the token is dead (DeviceNotRegistered), clear it so we
    // stop trying to push to a stale token.
    const status = pushResult?.data?.status ?? pushResult?.data?.[0]?.status
    const errType =
      pushResult?.data?.details?.error ?? pushResult?.data?.[0]?.details?.error
    if (status === 'error' && errType === 'DeviceNotRegistered') {
      await admin.from('profiles').update({ push_token: null }).eq('id', doc.owner_id)
    }

    return json({ success: true, pushResult }, 200)
  } catch (err) {
    console.error('[notify-owner] Unexpected error:', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
