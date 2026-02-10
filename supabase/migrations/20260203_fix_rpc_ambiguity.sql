-- Fix ambiguous function signatures (PGRST203)
-- Drop BOTH versions to clear the conflict
DROP FUNCTION IF EXISTS public.validate_access_grant(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.validate_access_grant(uuid, uuid);

-- Re-create ONLY the correct 2-argument version
CREATE OR REPLACE FUNCTION public.validate_access_grant(
  p_grant_id UUID,
  p_document_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant RECORD;
  v_user_id UUID := auth.uid();
  v_user_email TEXT := lower(auth.jwt() ->> 'email');
BEGIN
  SELECT
    ag.status,
    ag.expires_at,
    ag.recipient_email,
    d.owner_id,
    d.status AS doc_status
  INTO v_grant
  FROM public.access_grants ag
  JOIN public.documents d ON d.id = ag.document_id
  WHERE ag.id = p_grant_id
    AND ag.document_id = p_document_id;

  IF v_grant IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF NOT (
    v_grant.owner_id = v_user_id OR
    lower(v_grant.recipient_email) = v_user_email
  ) THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_grant.status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_grant.expires_at IS NOT NULL
     AND v_grant.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_grant.doc_status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;
