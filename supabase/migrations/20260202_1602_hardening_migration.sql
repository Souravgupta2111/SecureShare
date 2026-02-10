-- ============================================================================
-- SECURESHARE HARDENING MIGRATION
-- Run AFTER: Master Setup → Post-Setup Fixes → Fixed Final Patch
-- Fixes all issues identified in the full audit.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1: REMOVE DUPLICATE INDEXES ON access_logs
-- Master Setup created idx_logs_timestamp and idx_logs_document.
-- Fixed Patch created idx_access_logs_timestamp and idx_access_logs_document.
-- These are identical indexes with different names. Drop the duplicates.
-- ============================================================================

DROP INDEX IF EXISTS idx_access_logs_timestamp;
DROP INDEX IF EXISTS idx_access_logs_document;

-- ============================================================================
-- FIX 2: MISSING INDEXES FOR RLS SUBQUERIES
-- ============================================================================

-- The critical "can this user see this document?" RLS subquery filters on
-- (document_id, recipient_email, status). Current index only covers
-- (document_id, status). This makes it an index-only scan.
DROP INDEX IF EXISTS idx_access_grants_document_status;
CREATE INDEX idx_access_grants_document_recipient_status
ON public.access_grants(document_id, recipient_email, status);

-- document_analytics UPDATE filters on viewer_email.
-- Composite also serves the INSERT WITH CHECK subquery.
CREATE INDEX IF NOT EXISTS idx_document_analytics_document_viewer
ON public.document_analytics(document_id, viewer_email);

-- access_logs INSERT checks auth.uid() = user_id. No index existed.
CREATE INDEX IF NOT EXISTS idx_access_logs_user
ON public.access_logs(user_id);

-- Nearly every RLS EXISTS does: WHERE documents.id = X AND owner_id = uid
-- This makes those subqueries index-only scans.
CREATE INDEX IF NOT EXISTS idx_documents_id_owner
ON public.documents(id, owner_id);

-- ============================================================================
-- FIX 3: MAKE analytics_events AND security_events APPEND-ONLY
-- Same treatment as access_logs — no user can delete or modify event rows.
-- ============================================================================

DROP POLICY IF EXISTS "No one can delete analytics events" ON public.analytics_events;
CREATE POLICY "No one can delete analytics events"
ON public.analytics_events
FOR DELETE
USING (false);

DROP POLICY IF EXISTS "No one can update analytics events" ON public.analytics_events;
CREATE POLICY "No one can update analytics events"
ON public.analytics_events
FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No one can delete security events" ON public.security_events;
CREATE POLICY "No one can delete security events"
ON public.security_events
FOR DELETE
USING (false);

DROP POLICY IF EXISTS "No one can update security events" ON public.security_events;
CREATE POLICY "No one can update security events"
ON public.security_events
FOR UPDATE
USING (false);

-- ============================================================================
-- FIX 4: ADD AUTHORIZATION CHECK TO increment_screenshot_count
-- The function must verify the caller is either:
--   (a) the viewer of that session (matched by email), OR
--   (b) the owner of the document that session belongs to.
-- If neither, it does nothing — no error, just a no-op.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_screenshot_count(p_session_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.document_analytics
    SET screenshot_attempts = screenshot_attempts + 1,
        updated_at = NOW()
    WHERE session_id = p_session_id
      AND (
          -- Caller is the viewer of this session
          viewer_email = auth.jwt() ->> 'email'
          OR
          -- Caller is the owner of the document
          EXISTS (
              SELECT 1 FROM public.documents
              WHERE documents.id = document_analytics.document_id
                AND documents.owner_id = auth.uid()
          )
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX 5: ADD expires_at CHECK TO document_analytics INSERT POLICY
-- Mirrors the guard already added to the documents SELECT policy.
-- ============================================================================

DROP POLICY IF EXISTS "Users insert view sessions" ON public.document_analytics;
CREATE POLICY "Users insert view sessions"
ON public.document_analytics
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.access_grants
        WHERE access_grants.document_id = document_analytics.document_id
          AND access_grants.recipient_email = auth.jwt() ->> 'email'
          AND access_grants.status = 'active'
          AND (access_grants.expires_at IS NULL OR access_grants.expires_at > NOW())
    )
    OR EXISTS (
        SELECT 1
        FROM public.documents
        WHERE documents.id = document_analytics.document_id
          AND documents.owner_id = auth.uid()
    )
);

-- ============================================================================
-- FIX 6: VALIDATE permissions JSONB ON access_grants
-- Only allows the two documented keys: "view" and "download".
-- Both must be booleans. No other keys are permitted.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'access_grants_permissions_valid'
    ) THEN
        ALTER TABLE public.access_grants
        ADD CONSTRAINT access_grants_permissions_valid
        CHECK (
            jsonb_typeof(permissions) = 'object'
            AND (permissions ? 'view')
            AND (permissions ? 'download')
            AND (permissions - 'view' - 'download') = '{}'::jsonb
            AND jsonb_typeof(permissions->'view') = 'boolean'
            AND jsonb_typeof(permissions->'download') = 'boolean'
        );
    END IF;
END $$;

-- ============================================================================
-- FIX 7: ADD UNIQUE CONSTRAINT ON session_id
-- increment_screenshot_count updates ALL rows matching a session_id.
-- If duplicates exist, the counter inflates across all of them.
-- Each viewing session must have exactly one analytics row.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'document_analytics_session_id_unique'
    ) THEN
        -- Remove any existing duplicates first (keep the latest per session)
        DELETE FROM public.document_analytics
        WHERE id NOT IN (
            SELECT DISTINCT ON (session_id) id
            FROM public.document_analytics
            ORDER BY session_id, created_at DESC
        );

        ALTER TABLE public.document_analytics
        ADD CONSTRAINT document_analytics_session_id_unique
        UNIQUE (session_id);
    END IF;
END $$;

-- ============================================================================
-- FIX 8: RACE CONDITION ON screenshot increment
-- Add FOR UPDATE to serialize concurrent increments on the same row.
-- Combined with the auth check from Fix 4 and UNIQUE from Fix 7.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_screenshot_count(p_session_id TEXT)
RETURNS void AS $$
DECLARE
    target_row public.document_analytics%ROWTYPE;
BEGIN
    -- Lock the row first to serialize concurrent calls
    SELECT * INTO target_row
    FROM public.document_analytics
    WHERE session_id = p_session_id
      AND (
          viewer_email = auth.jwt() ->> 'email'
          OR EXISTS (
              SELECT 1 FROM public.documents
              WHERE documents.id = document_analytics.document_id
                AND documents.owner_id = auth.uid()
          )
      )
    FOR UPDATE;

    -- Only proceed if we actually locked a row (auth passed)
    IF FOUND THEN
        UPDATE public.document_analytics
        SET screenshot_attempts = screenshot_attempts + 1,
            updated_at = NOW()
        WHERE session_id = p_session_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX 9: ALIGN TIMESTAMPS TO UTC ON document_analytics
-- ============================================================================

ALTER TABLE public.document_analytics
ALTER COLUMN view_start SET DEFAULT timezone('utc'::text, now());

ALTER TABLE public.document_analytics
ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());

ALTER TABLE public.document_analytics
ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

-- ============================================================================
-- FIX 10: ADD MIGRATION VERSIONING TABLE
-- Tracks which migrations have been applied so re-runs are detectable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Log all migrations that have already been applied
INSERT INTO public.schema_migrations (version, name)
VALUES
    ('001', 'Master Setup Script'),
    ('002', 'Post-Setup Fixes'),
    ('003', 'Fixed Final Patch'),
    ('004', 'Hardening Migration')
ON CONFLICT (version) DO NOTHING;

COMMIT;
