-- ============================================================================
-- SECURESHARE FINAL PATCH MIGRATION (FIXED)
-- Run this AFTER: Master Setup Script + Post-Setup Fixes
-- Removes references to analytics_events / security_events (never defined).
-- Everything else is idempotent and safe.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD CONSENT COLUMNS TO PROFILES
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS error_reporting_consent BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 2. CREATE analytics_events AND security_events (were missing entirely)
-- ============================================================================
-- These tables were referenced in the original patch but never created.
-- Defined here with proper structure, RLS, and the policies that were
-- originally orphaned in Section 4.

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    event_name TEXT NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at DESC);

CREATE TABLE IF NOT EXISTS public.security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    event_type TEXT NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events(created_at DESC);

-- ============================================================================
-- 3. RLS FOR analytics_events AND security_events
-- ============================================================================
-- INSERT: only the authenticated user can write their own rows.
-- SELECT: document owners can read events tied to their docs;
--         users can read their own events.
-- DELETE/UPDATE: denied (append-only audit trail).

-- analytics_events
DROP POLICY IF EXISTS "Users insert own analytics" ON public.analytics_events;
CREATE POLICY "Users insert own analytics"
ON public.analytics_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own analytics" ON public.analytics_events;
CREATE POLICY "Users view own analytics"
ON public.analytics_events
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners view analytics for their docs" ON public.analytics_events;
CREATE POLICY "Owners view analytics for their docs"
ON public.analytics_events
FOR SELECT
USING (
    document_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = analytics_events.document_id
          AND documents.owner_id = auth.uid()
    )
);

-- security_events
DROP POLICY IF EXISTS "Users insert own security events" ON public.security_events;
CREATE POLICY "Users insert own security events"
ON public.security_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own security events" ON public.security_events;
CREATE POLICY "Users view own security events"
ON public.security_events
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners view security events for their docs" ON public.security_events;
CREATE POLICY "Owners view security events for their docs"
ON public.security_events
FOR SELECT
USING (
    document_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = security_events.document_id
          AND documents.owner_id = auth.uid()
    )
);

-- ============================================================================
-- 4. CREATE document_analytics TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    viewer_email TEXT NOT NULL,
    session_id TEXT NOT NULL,
    device_hash TEXT,
    platform TEXT,
    app_version TEXT,
    access_grant_id UUID REFERENCES public.access_grants(id),
    total_pages INTEGER DEFAULT 1,
    view_start TIMESTAMPTZ DEFAULT NOW(),
    view_end TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    pages_viewed INTEGER DEFAULT 1,
    scroll_depth_percent INTEGER DEFAULT 0,
    screenshot_attempts INTEGER DEFAULT 0,
    recording_detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.document_analytics ENABLE ROW LEVEL SECURITY;

-- Owners can read analytics for their documents
DROP POLICY IF EXISTS "Owners view document analytics" ON public.document_analytics;
CREATE POLICY "Owners view document analytics"
ON public.document_analytics
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_analytics.document_id
          AND documents.owner_id = auth.uid()
    )
);

-- Granted recipients and owners can insert session rows
DROP POLICY IF EXISTS "Users insert view sessions" ON public.document_analytics;
CREATE POLICY "Users insert view sessions"
ON public.document_analytics
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.access_grants
        WHERE access_grants.document_id = document_analytics.document_id
          AND access_grants.recipient_email = auth.jwt() ->> 'email'
          AND access_grants.status = 'active'
          AND (access_grants.expires_at IS NULL OR access_grants.expires_at > NOW())
    )
    OR EXISTS (
        SELECT 1 FROM public.documents
        WHERE documents.id = document_analytics.document_id
          AND documents.owner_id = auth.uid()
    )
);

-- Viewers can update ONLY their own active session (to close it out)
DROP POLICY IF EXISTS "Viewers update own analytics session" ON public.document_analytics;
CREATE POLICY "Viewers update own analytics session"
ON public.document_analytics
FOR UPDATE
USING (viewer_email = auth.jwt() ->> 'email')
WITH CHECK (viewer_email = auth.jwt() ->> 'email');

-- ============================================================================
-- 5. LOCK DOWN access_logs (append-only)
-- ============================================================================
-- Prevent any authenticated user from deleting or editing audit logs.
-- The existing INSERT policy (from Master Setup) stays intact.

DROP POLICY IF EXISTS "No one can delete access logs" ON public.access_logs;
CREATE POLICY "No one can delete access logs"
ON public.access_logs
FOR DELETE
USING (false);

DROP POLICY IF EXISTS "No one can update access logs" ON public.access_logs;
CREATE POLICY "No one can update access logs"
ON public.access_logs
FOR UPDATE
USING (false);

-- ============================================================================
-- 6. ENFORCE expires_at IN GRANT-BASED RLS
-- ============================================================================
-- The documents SELECT policy needs to also check expiry, not just status.
-- We re-create it with the expiry guard added.

DROP POLICY IF EXISTS "Recipients can view shared active documents" ON public.documents;
CREATE POLICY "Recipients can view shared active documents"
ON public.documents
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.access_grants
        WHERE access_grants.document_id = documents.id
          AND access_grants.recipient_email = auth.jwt() ->> 'email'
          AND access_grants.status = 'active'
          AND (access_grants.expires_at IS NULL OR access_grants.expires_at > NOW())
    )
);

-- ============================================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_access_grants_document_status
ON public.access_grants(document_id, status);

CREATE INDEX IF NOT EXISTS idx_access_grants_recipient_status
ON public.access_grants(recipient_email, status);

CREATE INDEX IF NOT EXISTS idx_documents_owner_status
ON public.documents(owner_id, status);

CREATE INDEX IF NOT EXISTS idx_document_analytics_document
ON public.document_analytics(document_id);

CREATE INDEX IF NOT EXISTS idx_document_analytics_session
ON public.document_analytics(session_id);

CREATE INDEX IF NOT EXISTS idx_document_analytics_created
ON public.document_analytics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_analytics_consent
ON public.profiles(analytics_consent)
WHERE analytics_consent = TRUE;

-- ============================================================================
-- 8. RPC: INCREMENT SCREENSHOT COUNT
-- ============================================================================
-- SECURITY DEFINER so it can UPDATE despite no general UPDATE policy on the table.
-- Scoped to a single session_id so it can't mutate arbitrary rows.

CREATE OR REPLACE FUNCTION public.increment_screenshot_count(p_session_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.document_analytics
    SET screenshot_attempts = screenshot_attempts + 1,
        updated_at = NOW()
    WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
