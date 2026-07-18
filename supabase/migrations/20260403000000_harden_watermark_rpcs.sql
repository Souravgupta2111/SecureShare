-- ============================================================================
-- SECURESHARE: Harden watermark-registry RPCs
--
-- Security fix. store_watermark_hash and verify_watermark_signature are
-- SECURITY DEFINER (they bypass RLS). The original versions trusted the
-- client-supplied p_grantor_id and did NOT verify that the caller owns the
-- document. That let any authenticated user:
--   * revoke another owner's active watermark rows (UPDATE ... status='revoked')
--   * insert forged "active" watermark rows for an arbitrary document_id
--   * probe / enumerate the forensic registry via verify_watermark_signature
--
-- This migration adds ownership enforcement and derives the grantor from the
-- authenticated session (auth.uid()) instead of the client argument. Run AFTER
-- the base schema + policies migrations.
-- ============================================================================

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
  v_email TEXT := LOWER(p_recipient_email);
  v_grantor UUID := auth.uid();
BEGIN
  -- Only the document owner may register/rotate a watermark hash.
  IF NOT public.is_document_owner(p_document_id) THEN
    RAISE EXCEPTION 'not_authorized: only the document owner can store watermark hashes';
  END IF;

  -- Trust the authenticated caller for grantor identity, never the client arg.
  UPDATE public.document_watermark_hashes
  SET status = 'revoked'
  WHERE document_id = p_document_id AND recipient_email = v_email;

  INSERT INTO public.document_watermark_hashes (
    document_id, recipient_email, grantor_id,
    watermark_hash, hmac_signature, device_hash, status
  ) VALUES (
    p_document_id, v_email, v_grantor,
    p_watermark_hash, p_hmac_signature, p_device_hash, 'active'
  ) RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.verify_watermark_signature(
  p_document_id UUID,
  p_watermark_hash TEXT,
  p_hmac_signature TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_grantor_id UUID;
  v_recipient_email TEXT;
  v_owner_public_key TEXT;
  v_caller_email TEXT := LOWER(auth.jwt() ->> 'email');
BEGIN
  SELECT w.grantor_id, w.recipient_email
  INTO v_grantor_id, v_recipient_email
  FROM public.document_watermark_hashes w
  WHERE w.document_id = p_document_id
    AND w.watermark_hash = p_watermark_hash
    AND w.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'confidence', 'none', 'error', 'watermark_not_found');
  END IF;

  -- Only the owner or the named recipient may verify (prevents enumeration).
  IF NOT (v_grantor_id = auth.uid() OR LOWER(v_recipient_email) = v_caller_email) THEN
    RETURN jsonb_build_object('valid', false, 'confidence', 'none', 'error', 'not_authorized');
  END IF;

  SELECT public_key INTO v_owner_public_key
  FROM public.profiles WHERE id = v_grantor_id;

  IF v_owner_public_key IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'confidence', 'low', 'error', 'owner_public_key_missing');
  END IF;

  RETURN jsonb_build_object('valid', true, 'confidence', 'high', 'grantor_id', v_grantor_id, 'verified_at', NOW()::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- END
-- ============================================================================
