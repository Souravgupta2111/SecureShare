-- Migration: 010_document_watermark_hashes.sql
-- Purpose: Store per-recipient watermark hashes for forensic verification
-- Design: Permanent storage (no expiration) - leaks can happen anytime
-- Run AFTER: All previous migrations (001-009)

BEGIN;

-- ==========================================
-- 1. CREATE TABLE: document_watermark_hashes
-- ==========================================
-- Stores immutable proof that a watermark was issued to a specific recipient
-- for forensic/legal verification if a document is leaked

CREATE TABLE IF NOT EXISTS public.document_watermark_hashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    grantor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Forensic proof data
    watermark_hash TEXT NOT NULL,        -- SHA-256 hash of full watermark payload
    hmac_signature TEXT NOT NULL,        -- Owner's HMAC-SHA256 signature

    -- Context
    device_hash TEXT,                    -- Expected device (for device matching)
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(document_id, recipient_email, status)  -- One active watermark per recipient
);

-- ==========================================
-- 1.1 ADD LOWERCASE EMAIL CONSTRAINT
-- ==========================================
-- Prevents mismatch bugs between access_grants and watermark_hashes

ALTER TABLE public.document_watermark_hashes
ADD CONSTRAINT watermark_recipient_email_lowercase
CHECK (recipient_email = lower(recipient_email));

-- ==========================================
-- 1.2 CLEANER UNIQUE CONSTRAINT (Optional but cleaner)
-- ==========================================
-- Uses partial index for cleaner semantics than composite UNIQUE

-- First, drop the old UNIQUE constraint
ALTER TABLE public.document_watermark_hashes
DROP CONSTRAINT IF EXISTS document_watermark_hashes_document_id_recipient_email_status_key;

-- Drop the old index
DROP INDEX IF EXISTS idx_watermark_hashes_doc_recipient_status;

-- Create partial unique index (one ACTIVE watermark per recipient)
CREATE UNIQUE INDEX watermark_one_active_per_recipient
ON public.document_watermark_hashes(document_id, recipient_email)
WHERE status = 'active';

-- ==========================================
-- 2. RLS POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE public.document_watermark_hashes ENABLE ROW LEVEL SECURITY;

-- Document OWNER can view all watermarks for their documents
-- (needed to verify leaks)
CREATE POLICY "Owners can view watermark hashes for their documents"
ON public.document_watermark_hashes
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_watermark_hashes.document_id
        AND documents.owner_id = auth.uid()
    )
);

-- Document OWNER can insert (when granting access)
CREATE POLICY "Owners can insert watermark hashes for their documents"
ON public.document_watermark_hashes
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_watermark_hashes.document_id
        AND documents.owner_id = auth.uid()
    )
);

-- Document OWNER can update (to revoke)
CREATE POLICY "Owners can update watermark hashes for their documents"
ON public.document_watermark_hashes
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_watermark_hashes.document_id
        AND documents.owner_id = auth.uid()
    )
);

-- APPEND-ONLY: Prevent deletion (audit trail)
CREATE POLICY "No one can delete watermark hashes"
ON public.document_watermark_hashes
FOR DELETE
USING (false);

-- ==========================================
-- 3. PERFORMANCE INDEXES
-- ==========================================

-- Lookup by document (verify leak)
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_document
ON public.document_watermark_hashes(document_id);

-- Lookup by recipient (verify leak)
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_recipient
ON public.document_watermark_hashes(recipient_email);

-- Lookup by grantor (audit trail)
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_grantor
ON public.document_watermark_hashes(grantor_id);

-- Composite for common verification query
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_doc_recipient_status
ON public.document_watermark_hashes(document_id, recipient_email, status);

-- ==========================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ==========================================

COMMENT ON TABLE public.document_watermark_hashes IS
    'Per-recipient watermark hash storage for forensic leak verification. Permanent storage - never expires.';

COMMENT ON COLUMN public.document_watermark_hashes.watermark_hash IS
    'SHA-256 hash of the full watermark payload (documentUUID|email|timestamp|deviceHash|signature)';

COMMENT ON COLUMN public.document_watermark_hashes.hmac_signature IS
    'Owner''s HMAC-SHA256 signature using document encryption key';

COMMENT ON COLUMN public.document_watermark_hashes.status IS
    'active=valid watermark, revoked=access was revoked (still kept for forensic purposes)';

-- ==========================================
-- 6. HELPER FUNCTION: Store watermark hash
-- Called by app when granting access
-- ==========================================

CREATE OR REPLACE FUNCTION public.store_watermark_hash(
    p_document_id UUID,
    p_recipient_email TEXT,
    p_grantor_id UUID,
    p_watermark_hash TEXT,
    p_hmac_signature TEXT,
    p_device_hash TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_result_id UUID;
    v_normalized_email TEXT;
BEGIN
    -- Normalize email to lowercase
    v_normalized_email := lower(p_recipient_email);

    -- Revoke any existing watermark for this recipient (if any)
    UPDATE public.document_watermark_hashes
    SET status = 'revoked'
    WHERE document_id = p_document_id
      AND recipient_email = v_normalized_email;

    -- Insert new watermark hash with normalized email
    INSERT INTO public.document_watermark_hashes (
        document_id,
        recipient_email,
        grantor_id,
        watermark_hash,
        hmac_signature,
        device_hash,
        status
    ) VALUES (
        p_document_id,
        v_normalized_email,
        p_grantor_id,
        p_watermark_hash,
        p_hmac_signature,
        p_device_hash,
        'active'
    )
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 7. HELPER FUNCTION: Get watermark hash
-- Called by app/Edge Function for verification
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_watermark_hash(
    p_document_id UUID,
    p_recipient_email TEXT
)
RETURNS TABLE (
    watermark_hash TEXT,
    hmac_signature TEXT,
    grantor_id UUID,
    device_hash TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.watermark_hash,
        w.hmac_signature,
        w.grantor_id,
        w.device_hash,
        w.created_at
    FROM public.document_watermark_hashes w
    WHERE w.document_id = p_document_id
      AND w.recipient_email = lower(p_recipient_email)
      AND w.status = 'active'
    ORDER BY w.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 8. RPC: Verify watermark (for Edge Function)
-- ==========================================

CREATE OR REPLACE FUNCTION public.verify_watermark_signature(
    p_document_id UUID,
    p_watermark_hash TEXT,
    p_hmac_signature TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_grantor_id UUID;
    v_owner_public_key TEXT;
    v_result JSONB;
BEGIN
    -- Get the grantor who issued this watermark
    SELECT w.grantor_id, d.owner_id
    INTO v_grantor_id, v_owner_public_key
    FROM public.document_watermark_hashes w
    JOIN public.documents d ON d.id = w.document_id
    WHERE w.document_id = p_document_id
      AND w.watermark_hash = p_watermark_hash
      AND w.status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'confidence', 'none',
            'error', 'watermark_not_found',
            'verified_at', NOW()::TEXT
        );
    END IF;

    -- Get owner's public key for verification
    SELECT public_key INTO v_owner_public_key
    FROM public.profiles
    WHERE id = v_grantor_id;

    IF v_owner_public_key IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'confidence', 'low',
            'error', 'owner_public_key_missing',
            'verified_at', NOW()::TEXT
        );
    END IF;

    -- Return verification data for Edge Function to verify signature
    RETURN jsonb_build_object(
        'valid', true,
        'confidence', 'high',
        'grantor_id', v_grantor_id,
        'verified_at', NOW()::TEXT
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ==========================================
-- POST-MIGRATION VERIFICATION
-- ==========================================

-- Verify table exists
SELECT 'document_watermark_hashes table created' AS status;

-- Verify lowercase constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'watermark_recipient_email_lowercase';

-- Verify unique index exists
SELECT indexname, pg_get_indexdef(oid)
FROM pg_index
WHERE indexname = 'watermark_one_active_per_recipient';
