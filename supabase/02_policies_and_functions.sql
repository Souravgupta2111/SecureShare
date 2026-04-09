-- ============================================================================
-- SECURESHARE: 02_POLICIES_AND_FUNCTIONS.SQL
-- All RLS policies, views, helper functions, and RPCs.
-- Run this AFTER 01_schema.sql in Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (Break RLS circular references)
-- These use SECURITY DEFINER to bypass RLS internally.
-- ============================================================================

-- Check if current user owns a document
CREATE OR REPLACE FUNCTION public.is_document_owner(doc_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = doc_id AND owner_id = auth.uid()
  );
$$;

-- Check if current user has an active grant for a document
-- FIX: Uses LOWER() on both sides to prevent email case-sensitivity bugs
CREATE OR REPLACE FUNCTION public.has_active_grant(doc_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE document_id = doc_id
      AND LOWER(recipient_email) = LOWER(auth.jwt() ->> 'email')
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_document_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_grant(UUID) TO authenticated;

-- ============================================================================
-- RLS POLICIES: PROFILES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Allow authenticated users to look up profiles for sharing (find recipients)
DROP POLICY IF EXISTS "Authenticated users can lookup profiles for sharing" ON public.profiles;
CREATE POLICY "Authenticated users can lookup profiles for sharing"
  ON public.profiles FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- RLS POLICIES: FOLDERS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own folders" ON public.folders;
CREATE POLICY "Users can view own folders"
  ON public.folders FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own folders" ON public.folders;
CREATE POLICY "Users can create own folders"
  ON public.folders FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
CREATE POLICY "Users can update own folders"
  ON public.folders FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;
CREATE POLICY "Users can delete own folders"
  ON public.folders FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================================
-- RLS POLICIES: DOCUMENTS
-- ============================================================================

-- Owners have full access to their documents
DROP POLICY IF EXISTS "Owners can do everything with their documents" ON public.documents;
CREATE POLICY "Owners can do everything with their documents"
  ON public.documents FOR ALL USING (auth.uid() = owner_id);

-- Recipients can VIEW documents shared with them (uses helper to break recursion)
DROP POLICY IF EXISTS "Recipients can view shared active documents" ON public.documents;
CREATE POLICY "Recipients can view shared active documents"
  ON public.documents FOR SELECT
  USING (public.has_active_grant(id));

-- ============================================================================
-- RLS POLICIES: ACCESS_GRANTS
-- ============================================================================

-- Owner can manage grants (uses helper to break recursion)
DROP POLICY IF EXISTS "Owners manage grants" ON public.access_grants;
CREATE POLICY "Owners manage grants"
  ON public.access_grants FOR ALL
  USING (public.is_document_owner(document_id));

-- Recipients can see their own grants (FIX: LOWER() for case-insensitive match)
DROP POLICY IF EXISTS "Recipients view their grants" ON public.access_grants;
CREATE POLICY "Recipients view their grants"
  ON public.access_grants FOR SELECT
  USING (LOWER(recipient_email) = LOWER(auth.jwt() ->> 'email'));

-- ============================================================================
-- RLS POLICIES: DOCUMENT_KEYS
-- ============================================================================

-- Owner can manage all keys for their documents (insert for recipients, etc.)
DROP POLICY IF EXISTS "Owners manage all keys for their docs" ON public.document_keys;
CREATE POLICY "Owners manage all keys for their docs"
  ON public.document_keys FOR ALL
  USING (public.is_document_owner(document_id));

-- Users can view their own keys (to decrypt shared documents)
DROP POLICY IF EXISTS "Users view their own keys" ON public.document_keys;
CREATE POLICY "Users view their own keys"
  ON public.document_keys FOR SELECT
  USING (user_id = auth.uid());

-- FIX: Recipients can read keys for documents shared with them
-- This was MISSING from master_setup.sql causing recipients to fail decryption!
DROP POLICY IF EXISTS "Recipients read keys for shared docs" ON public.document_keys;
CREATE POLICY "Recipients read keys for shared docs"
  ON public.document_keys FOR SELECT
  USING (public.has_active_grant(document_id));

-- ============================================================================
-- RLS POLICIES: ACCESS_LOGS (Append-only)
-- ============================================================================

DROP POLICY IF EXISTS "Owners see access logs" ON public.access_logs;
CREATE POLICY "Owners see access logs"
  ON public.access_logs FOR SELECT
  USING (public.is_document_owner(document_id));

DROP POLICY IF EXISTS "Users can log events" ON public.access_logs;
CREATE POLICY "Users can log events"
  ON public.access_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "No one can delete access logs" ON public.access_logs;
CREATE POLICY "No one can delete access logs"
  ON public.access_logs FOR DELETE USING (false);

DROP POLICY IF EXISTS "No one can update access logs" ON public.access_logs;
CREATE POLICY "No one can update access logs"
  ON public.access_logs FOR UPDATE USING (false);

-- ============================================================================
-- RLS POLICIES: ANALYTICS_EVENTS (Append-only)
-- ============================================================================

DROP POLICY IF EXISTS "Users insert own analytics" ON public.analytics_events;
CREATE POLICY "Users insert own analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own analytics" ON public.analytics_events;
CREATE POLICY "Users view own analytics"
  ON public.analytics_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners view analytics for their docs" ON public.analytics_events;
CREATE POLICY "Owners view analytics for their docs"
  ON public.analytics_events FOR SELECT
  USING (document_id IS NOT NULL AND public.is_document_owner(document_id));

DROP POLICY IF EXISTS "No one can delete analytics events" ON public.analytics_events;
CREATE POLICY "No one can delete analytics events"
  ON public.analytics_events FOR DELETE USING (false);

DROP POLICY IF EXISTS "No one can update analytics events" ON public.analytics_events;
CREATE POLICY "No one can update analytics events"
  ON public.analytics_events FOR UPDATE USING (false);

-- ============================================================================
-- RLS POLICIES: SECURITY_EVENTS (Append-only)
-- ============================================================================

DROP POLICY IF EXISTS "Users insert own security events" ON public.security_events;
CREATE POLICY "Users insert own security events"
  ON public.security_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own security events" ON public.security_events;
CREATE POLICY "Users view own security events"
  ON public.security_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners view security events for their docs" ON public.security_events;
CREATE POLICY "Owners view security events for their docs"
  ON public.security_events FOR SELECT
  USING (document_id IS NOT NULL AND public.is_document_owner(document_id));

DROP POLICY IF EXISTS "No one can delete security events" ON public.security_events;
CREATE POLICY "No one can delete security events"
  ON public.security_events FOR DELETE USING (false);

DROP POLICY IF EXISTS "No one can update security events" ON public.security_events;
CREATE POLICY "No one can update security events"
  ON public.security_events FOR UPDATE USING (false);

-- ============================================================================
-- RLS POLICIES: DOCUMENT_ANALYTICS
-- ============================================================================

DROP POLICY IF EXISTS "Owners view document analytics" ON public.document_analytics;
CREATE POLICY "Owners view document analytics"
  ON public.document_analytics FOR SELECT
  USING (public.is_document_owner(document_id));

-- Granted recipients and owners can insert session rows
DROP POLICY IF EXISTS "Users insert view sessions" ON public.document_analytics;
CREATE POLICY "Users insert view sessions"
  ON public.document_analytics FOR INSERT
  WITH CHECK (
    public.has_active_grant(document_id)
    OR public.is_document_owner(document_id)
  );

-- Viewers can update their own active sessions (to close them)
DROP POLICY IF EXISTS "Viewers update own analytics session" ON public.document_analytics;
CREATE POLICY "Viewers update own analytics session"
  ON public.document_analytics FOR UPDATE
  USING (LOWER(viewer_email) = LOWER(auth.jwt() ->> 'email'))
  WITH CHECK (LOWER(viewer_email) = LOWER(auth.jwt() ->> 'email'));

-- ============================================================================
-- RLS POLICIES: DOCUMENT_WATERMARK_HASHES
-- ============================================================================

DROP POLICY IF EXISTS "Owners can view watermark hashes for their documents" ON public.document_watermark_hashes;
CREATE POLICY "Owners can view watermark hashes for their documents"
  ON public.document_watermark_hashes FOR SELECT
  USING (public.is_document_owner(document_id));

DROP POLICY IF EXISTS "Owners can insert watermark hashes for their documents" ON public.document_watermark_hashes;
CREATE POLICY "Owners can insert watermark hashes for their documents"
  ON public.document_watermark_hashes FOR INSERT
  WITH CHECK (public.is_document_owner(document_id));

DROP POLICY IF EXISTS "Owners can update watermark hashes for their documents" ON public.document_watermark_hashes;
CREATE POLICY "Owners can update watermark hashes for their documents"
  ON public.document_watermark_hashes FOR UPDATE
  USING (public.is_document_owner(document_id));

DROP POLICY IF EXISTS "No one can delete watermark hashes" ON public.document_watermark_hashes;
CREATE POLICY "No one can delete watermark hashes"
  ON public.document_watermark_hashes FOR DELETE USING (false);

-- ============================================================================
-- RLS POLICIES: DOCUMENT_COMMENTS
-- ============================================================================

DROP POLICY IF EXISTS "Document owners can view all comments" ON public.document_comments;
CREATE POLICY "Document owners can view all comments"
  ON public.document_comments FOR SELECT
  USING (public.is_document_owner(document_id));

DROP POLICY IF EXISTS "Recipients can view comments" ON public.document_comments;
CREATE POLICY "Recipients can view comments"
  ON public.document_comments FOR SELECT
  USING (public.has_active_grant(document_id));

DROP POLICY IF EXISTS "Recipients can add comments" ON public.document_comments;
CREATE POLICY "Recipients can add comments"
  ON public.document_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.is_document_owner(document_id)
      OR public.has_active_grant(document_id)
    )
  );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.document_comments;
CREATE POLICY "Users can delete own comments"
  ON public.document_comments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: SCHEMA_MIGRATIONS
-- ============================================================================
DROP POLICY IF EXISTS "No one can access migrations" ON public.schema_migrations;
CREATE POLICY "No one can access migrations"
  ON public.schema_migrations FOR ALL USING (false);

-- ============================================================================
-- STORAGE BUCKET POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Owners manage files" ON storage.objects;
CREATE POLICY "Owners manage files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.file_path = name AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.file_path = name AND d.owner_id = auth.uid()
    )
  );

-- FIX: Recipients can download shared files (LOWER() on email)
DROP POLICY IF EXISTS "Recipients view shared" ON storage.objects;
CREATE POLICY "Recipients view shared"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.access_grants ag ON ag.document_id = d.id
      WHERE d.file_path = name
        AND LOWER(ag.recipient_email) = LOWER(auth.jwt() ->> 'email')
        AND ag.status = 'active'
        AND (ag.expires_at IS NULL OR ag.expires_at > now())
        AND (ag.permissions->>'view')::boolean = true
    )
  );

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Public profiles (non-sensitive fields only)
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT id, display_name, avatar_url
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated;

-- Document Analytics Summary (owner-only, pre-aggregated)
CREATE OR REPLACE VIEW public.document_analytics_summary
WITH (security_invoker = true)
AS
SELECT
  d.id AS document_id,
  d.owner_id,
  COUNT(da.id) AS total_views,
  COUNT(DISTINCT da.viewer_email) AS unique_viewers,
  COALESCE(SUM(da.duration_seconds), 0) AS total_duration_seconds,
  COALESCE(AVG(da.duration_seconds), 0) AS avg_duration_seconds,
  COALESCE(SUM(da.screenshot_attempts), 0) AS total_screenshots,
  MAX(da.created_at) AS last_viewed_at
FROM public.documents d
LEFT JOIN public.document_analytics da ON d.id = da.document_id
WHERE d.owner_id = auth.uid()
GROUP BY d.id, d.owner_id;

-- ============================================================================
-- RPC: VALIDATE ACCESS GRANT
-- Single authoritative version. Case-insensitive email. Auto-expires grants.
-- ============================================================================

DROP FUNCTION IF EXISTS public.validate_access_grant(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.validate_access_grant(UUID, UUID);

CREATE OR REPLACE FUNCTION public.validate_access_grant(
  p_grant_id UUID,
  p_document_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant RECORD;
  v_user_id UUID := auth.uid();
  v_user_email TEXT := LOWER(auth.jwt() ->> 'email');
BEGIN
  SELECT
    ag.status, ag.expires_at, ag.recipient_email,
    d.owner_id, d.status AS doc_status
  INTO v_grant
  FROM public.access_grants ag
  JOIN public.documents d ON d.id = ag.document_id
  WHERE ag.id = p_grant_id AND ag.document_id = p_document_id;

  IF v_grant IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- Authorization: must be owner or recipient
  IF NOT (v_grant.owner_id = v_user_id OR LOWER(v_grant.recipient_email) = v_user_email) THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_grant.status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  -- Auto-expire
  IF v_grant.expires_at IS NOT NULL AND v_grant.expires_at < NOW() THEN
    UPDATE public.access_grants SET status = 'expired' WHERE id = p_grant_id;
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_grant.doc_status <> 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- ============================================================================
-- RPC: INCREMENT SCREENSHOT COUNT (with auth + race-condition fix)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_screenshot_count(p_session_id TEXT)
RETURNS void AS $$
DECLARE
  target_row public.document_analytics%ROWTYPE;
BEGIN
  SELECT * INTO target_row
  FROM public.document_analytics
  WHERE session_id = p_session_id
    AND (
      LOWER(viewer_email) = LOWER(auth.jwt() ->> 'email')
      OR EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_analytics.document_id
          AND documents.owner_id = auth.uid()
      )
    )
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.document_analytics
    SET screenshot_attempts = screenshot_attempts + 1, updated_at = timezone('utc', now())
    WHERE session_id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: STORE WATERMARK HASH
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
BEGIN
  UPDATE public.document_watermark_hashes
  SET status = 'revoked'
  WHERE document_id = p_document_id AND recipient_email = v_email;

  INSERT INTO public.document_watermark_hashes (
    document_id, recipient_email, grantor_id,
    watermark_hash, hmac_signature, device_hash, status
  ) VALUES (
    p_document_id, v_email, p_grantor_id,
    p_watermark_hash, p_hmac_signature, p_device_hash, 'active'
  ) RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: GET WATERMARK HASH
-- ============================================================================

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
  SELECT w.watermark_hash, w.hmac_signature, w.grantor_id, w.device_hash, w.created_at
  FROM public.document_watermark_hashes w
  WHERE w.document_id = p_document_id
    AND w.recipient_email = LOWER(p_recipient_email)
    AND w.status = 'active'
  ORDER BY w.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: VERIFY WATERMARK SIGNATURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_watermark_signature(
  p_document_id UUID,
  p_watermark_hash TEXT,
  p_hmac_signature TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_grantor_id UUID;
  v_owner_public_key TEXT;
BEGIN
  SELECT w.grantor_id
  INTO v_grantor_id
  FROM public.document_watermark_hashes w
  WHERE w.document_id = p_document_id
    AND w.watermark_hash = p_watermark_hash
    AND w.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'confidence', 'none', 'error', 'watermark_not_found');
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
-- END OF 02_POLICIES_AND_FUNCTIONS.SQL
-- ============================================================================
