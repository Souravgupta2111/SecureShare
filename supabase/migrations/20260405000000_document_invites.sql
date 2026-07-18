-- ============================================================================
-- SECURESHARE: Invite-link sharing (share to anyone, even non-users)
--
-- The document's AES key is wrapped under a random invite secret that travels
-- ONLY inside the invite link fragment (never sent here). We store just the
-- wrapped key. When a recipient opens the link and signs up, redeem_invite
-- grants them access; the client then unwraps the key with the link secret and
-- re-wraps it with the recipient's own RSA key. Stays end-to-end encrypted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_invites (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,          -- AES-GCM(documentKey) under the invite secret
  recipient_email TEXT,               -- optional hint of intended recipient
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.document_invites ENABLE ROW LEVEL SECURITY;

-- Only the document owner can create/see/delete invites for their documents.
DROP POLICY IF EXISTS "Owners manage own invites" ON public.document_invites;
CREATE POLICY "Owners manage own invites"
  ON public.document_invites FOR ALL
  USING (created_by = auth.uid() AND public.is_document_owner(document_id))
  WITH CHECK (created_by = auth.uid() AND public.is_document_owner(document_id));

CREATE INDEX IF NOT EXISTS idx_document_invites_doc ON public.document_invites(document_id);

-- Allow a GRANTED user to store their OWN wrapped document key. Needed for the
-- invite-redeem flow, where the recipient re-wraps the doc key with their RSA
-- key after redeeming. (Owners already have full access via another policy.)
DROP POLICY IF EXISTS "Users insert own key for granted docs" ON public.document_keys;
CREATE POLICY "Users insert own key for granted docs"
  ON public.document_keys FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.has_active_grant(document_id));

-- Redeem an invite: validate it, grant the caller access, return the wrapped
-- key so the client can unwrap + re-wrap it. SECURITY DEFINER because the
-- caller is NOT the document owner and must be able to create their own grant.
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token UUID)
RETURNS TABLE(doc_id UUID, wkey TEXT) AS $$
DECLARE
  v_inv public.document_invites%ROWTYPE;
  v_email TEXT := LOWER(auth.jwt() ->> 'email');
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.document_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Grant the caller access (idempotent; reactivate if previously revoked).
  IF NOT EXISTS (
    SELECT 1 FROM public.access_grants ag
    WHERE ag.document_id = v_inv.document_id
      AND LOWER(ag.recipient_email) = v_email
  ) THEN
    INSERT INTO public.access_grants (document_id, grantor_id, recipient_email, status)
    VALUES (v_inv.document_id, v_inv.created_by, v_email, 'active');
  ELSE
    UPDATE public.access_grants ag
      SET status = 'active'
      WHERE ag.document_id = v_inv.document_id
        AND LOWER(ag.recipient_email) = v_email
        AND ag.status <> 'active';
  END IF;

  RETURN QUERY SELECT v_inv.document_id, v_inv.wrapped_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.redeem_invite(UUID) TO authenticated;

-- ============================================================================
-- END
-- ============================================================================
