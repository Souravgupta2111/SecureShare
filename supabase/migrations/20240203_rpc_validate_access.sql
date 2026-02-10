-- RPC: validate_access_grant
-- Atomic function to validate access token availability and expiration
-- SECURITY: STRICT implementation.
-- 1. Authorizes ONLY Recipients and Document Owners.
-- 2. Returns OPAQUE boolean result to prevent state enumeration.
-- 3. Side-effects (auto-expire) only trigger for authorized users.

CREATE OR REPLACE FUNCTION public.validate_access_grant(
  p_grant_id UUID,
  p_document_id UUID,
  p_device_hash TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_grant RECORD;
  v_doc_owner UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_is_owner BOOLEAN;
  v_is_recipient BOOLEAN;
BEGIN
  -- 1. Get Context
  v_user_id := auth.uid();
  v_user_email := auth.jwt() ->> 'email';

  -- 2. Fetch Grant & Document Owner in one go
  --    Using LEFT JOIN to ensure we don't leak if doc is missing, 
  --    but we need document details to check ownership.
  SELECT ag.*, d.owner_id as doc_owner_id, d.status as doc_status
  INTO v_grant
  FROM public.access_grants ag
  JOIN public.documents d ON ag.document_id = d.id
  WHERE ag.id = p_grant_id AND ag.document_id = p_document_id;

  -- 3. Fail Fast if not found
  IF v_grant IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- 4. Check Authorization (Strict)
  --    User must be the Recipient OR the Document Owner
  v_is_owner := (v_grant.doc_owner_id = v_user_id);
  v_is_recipient := (v_grant.recipient_id = v_user_id OR v_grant.recipient_email = v_user_email);

  IF NOT (v_is_owner OR v_is_recipient) THEN
    -- Unauthorized probe: Return false (opaque)
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- 5. Check Status
  IF v_grant.status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- 6. Check Expiration & Side Effect
  IF v_grant.expires_at IS NOT NULL AND v_grant.expires_at < NOW() THEN
    -- Defense-in-depth: Re-verify ID in UPDATE clause, though logic above guarantees authorized flow.
    UPDATE public.access_grants
    SET status = 'expired'
    WHERE id = p_grant_id;
    
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- 7. Check Document Status
  IF v_grant.doc_status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- 8. Valid
  RETURN jsonb_build_object('valid', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
