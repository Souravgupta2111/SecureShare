/**
 * verify-watermark Edge Function
 *
 * Server-side forensic watermark verification
 * Purpose: Prove watermark authenticity if a document is leaked
 *
 * WHAT THIS FUNCTION VERIFIES:
 * 1. Hash matches authoritative stored hash
 * 2. Watermark was issued to the claimed recipient
 * 3. Watermark was issued by document owner
 * 4. Timestamp is reasonable (anti-replay)
 *
 * WHAT THIS FUNCTION DOES NOT DO:
 * - It does NOT decrypt document keys (impossible in Edge)
 * - It does NOT verify HMAC with public key (expensive, done client-side if needed)
 *
 * FORENSIC FLOW:
 * 1. Extract watermark from leaked image
 * 2. Call this function with document_id + watermark_payload
 * 3. If valid: watermark hash matches our database
 * 4. Cross-reference with access_logs to confirm identity
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { document_id, watermark_payload } = await req.json()

    // ------------------------------------------------------------------
    // INPUT VALIDATION
    // ------------------------------------------------------------------
    if (!document_id || !watermark_payload) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'missing_required_fields',
          message: 'document_id and watermark_payload are required'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // Payload format: documentUUID|recipientEmail|timestamp|deviceHash|HMAC_SIGNATURE
    const parts = watermark_payload.split('|')
    if (parts.length !== 5) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'invalid_payload_format',
          message: 'Watermark payload must have 5 parts separated by |'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const [docUUID, recipientEmail, timestampStr, deviceHash, hmacSignature] = parts

    // Verify document_id matches payload
    if (docUUID !== document_id) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'document_id_mismatch',
          message: 'Document ID in payload does not match request'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(recipientEmail)) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'invalid_email_format',
          message: 'Invalid email format in watermark payload'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // Validate timestamp
    const issuedAt = parseInt(timestampStr, 10)
    if (isNaN(issuedAt) || issuedAt < 1600000000000 || issuedAt > 4100000000000) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'invalid_timestamp',
          message: 'Invalid timestamp in watermark payload'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // ------------------------------------------------------------------
    // INITIALIZE SUPABASE CLIENT
    // ------------------------------------------------------------------
    const supabaseUrl = Deno.env.get('EDGE_SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('EDGE_SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'server_configuration_error',
          message: 'Server not configured properly'
        },
        { status: 500, headers: corsHeaders }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // ------------------------------------------------------------------
    // STEP 1: Fetch stored watermark hash from database
    // ------------------------------------------------------------------
    const { data: rows, error: rpcError } = await supabase.rpc(
      'get_watermark_hash',
      {
        p_document_id: document_id,
        p_recipient_email: recipientEmail
      }
    )

    if (rpcError || !rows || rows.length === 0) {
      console.error('[verify-watermark] Hash not found:', rpcError?.message)
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'watermark_not_found',
          message: 'No active watermark found for this document and recipient'
        },
        { status: 404, headers: corsHeaders }
      )
    }

    const record = rows[0]

    // ------------------------------------------------------------------
    // STEP 2: Verify SHA-256 hash of FULL payload
    // ------------------------------------------------------------------
    const encoder = new TextEncoder()
    const payloadBytes = encoder.encode(watermark_payload)

    const hashBuffer = await crypto.subtle.digest('SHA-256', payloadBytes)
    const localHash = bytesToHex(hashBuffer)

    if (localHash !== record.watermark_hash) {
      console.warn('[verify-watermark] Hash mismatch')
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'hash_mismatch',
          message: 'Watermark hash does not match stored hash - possible tampering'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // ------------------------------------------------------------------
    // STEP 3: Fetch grantor (owner) details
    // ------------------------------------------------------------------
    const { data: grantor, error: grantorError } = await supabase
      .from('profiles')
      .select('id, email, public_key')
      .eq('id', record.grantor_id)
      .single()

    if (grantorError || !grantor) {
      return Response.json(
        {
          valid: false,
          confidence: 'low',
          error: 'grantor_not_found',
          message: 'Document owner not found'
        },
        { status: 404, headers: corsHeaders }
      )
    }

    // ------------------------------------------------------------------
    // STEP 4: Timestamp sanity check (anti-replay)
    // ------------------------------------------------------------------
    const now = Date.now()
    const oneYearMs = 365 * 24 * 60 * 60 * 1000
    const oneMinuteAgo = now - 60000

    let confidence: 'high' | 'medium' | 'low' = 'high'
    let warning: string | null = null

    if (issuedAt > now) {
      return Response.json(
        {
          valid: false,
          confidence: 'none',
          error: 'timestamp_future',
          message: 'Watermark timestamp is in the future - possible replay attack'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    if (now - issuedAt > oneYearMs) {
      confidence = 'medium'
      warning = 'watermark_older_than_one_year'
    }

    if (issuedAt < oneMinuteAgo) {
      // Watermark issued more than 1 minute ago (not fresh)
      // This is fine, just noting it
      console.log('[verify-watermark] Watermark issued >1 min ago')
    }

    // ------------------------------------------------------------------
    // STEP 5: Check device hash match (if stored)
    // ------------------------------------------------------------------
    let deviceMatch: boolean | null = null
    if (record.device_hash && deviceHash) {
      deviceMatch = record.device_hash === deviceHash
      if (!deviceMatch) {
        console.warn('[verify-watermark] Device hash mismatch')
        // Still valid, but different device
      }
    }

    // ------------------------------------------------------------------
    // STEP 6: Success - all checks passed
    // ------------------------------------------------------------------
    const verifiedAt = new Date().toISOString()

    console.log('[verify-watermark] Verification successful:', {
      document_id,
      recipient_email: recipientEmail,
      grantor_id: grantor.id,
      grantor_email: grantor.email,
      confidence,
      verified_at: verifiedAt
    })

    return Response.json(
      {
        valid: true,
        confidence,
        warning,
        details: {
          document_id,
          recipient_email: recipientEmail.toLowerCase(),
          grantor_id: grantor.id,
          grantor_email: grantor.email,
          issued_at: new Date(issuedAt).toISOString(),
          verified_at: verifiedAt,
          device_hash_match: deviceMatch,
          hmac_signature_present: hmacSignature.length === 64
        }
      },
      { headers: corsHeaders }
    )

  } catch (err) {
    console.error('[verify-watermark] Unexpected error:', err)
    return Response.json(
      {
        valid: false,
        confidence: 'none',
        error: 'internal_error',
        message: 'An unexpected error occurred during verification'
      },
      { status: 500, headers: corsHeaders }
    )
  }
})

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
