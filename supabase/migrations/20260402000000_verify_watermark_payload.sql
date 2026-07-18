-- ============================================================================
-- SECURESHARE: verify_watermark_payload RPC
-- Deterministic, server-side forensic confirmation.
--
-- Given a document_id and the SHA-256 hash of a full signed watermark payload,
-- confirms the watermark exists in the immutable registry and returns exactly
-- who it was issued to and by whom. This is the deterministic counterpart to
-- the probabilistic invisible-watermark recovery: if a full payload can be
-- recovered from a leaked file (documents, or legacy images), this proves
-- provenance with certainty.
--
-- Authorization: only the document owner (grantor) OR the recipient the
-- watermark was issued to may run the check (prevents email enumeration).
--
-- Run this AFTER 20260401000001_policies.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_watermark_payload(
  p_document_id UUID,
  p_watermark_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_grantor_email TEXT;
  v_caller_email TEXT := LOWER(auth.jwt() ->> 'email');
BEGIN
  SELECT w.recipient_email, w.grantor_id, w.device_hash, w.created_at
  INTO v_rec
  FROM public.document_watermark_hashes w
  WHERE w.document_id = p_document_id
    AND w.watermark_hash = p_watermark_hash
    AND w.status = 'active'
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'watermark_not_found');
  END IF;

  -- Only the owner or the named recipient may confirm (prevents enumeration).
  IF NOT (v_rec.grantor_id = auth.uid() OR LOWER(v_rec.recipient_email) = v_caller_email) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'not_authorized');
  END IF;

  SELECT email INTO v_grantor_email FROM public.profiles WHERE id = v_rec.grantor_id;

  RETURN jsonb_build_object(
    'valid', true,
    'confidence', 'high',
    'document_id', p_document_id,
    'recipient_email', v_rec.recipient_email,
    'grantor_id', v_rec.grantor_id,
    'grantor_email', v_grantor_email,
    'device_hash', v_rec.device_hash,
    'issued_at', v_rec.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_watermark_payload(UUID, TEXT) TO authenticated;

-- ============================================================================
-- END
-- ============================================================================
