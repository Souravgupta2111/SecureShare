-- Create Missing Tables for SecureShare
-- Run this in Supabase SQL Editor

-- ============================================
-- ACCESS_LOGS TABLE (Unified Logging)
-- ============================================
CREATE TABLE IF NOT EXISTS public.access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    access_token_id UUID REFERENCES public.access_tokens(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'view_start', 'view_end', 'heartbeat', 'security_alert', 'access_granted', 'access_revoked'
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own access logs"
  ON public.access_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access logs"
  ON public.access_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_document ON public.access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_type ON public.access_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON public.access_logs(created_at);

-- ============================================
-- ACCESS_GRANTS TABLE (Sharing Management)
-- ============================================
CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    grantor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active', -- 'active', 'revoked', 'expired'
    permissions JSONB DEFAULT '{"view": true, "download": false}',
    device_hash TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owners can manage grants"
  ON public.access_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = access_grants.document_id
      AND documents.owner_id = auth.uid()
    )
  );

CREATE POLICY "Recipients can view their grants"
  ON public.access_grants FOR SELECT
  USING (
    recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR recipient_id = auth.uid()
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_access_grants_document ON public.access_grants(document_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_recipient ON public.access_grants(recipient_email);
CREATE INDEX IF NOT EXISTS idx_access_grants_status ON public.access_grants(status);

-- ============================================
-- DOCUMENT_KEYS TABLE (Encrypted Key Storage)
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, user_id)
);

-- Enable RLS
ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own keys"
  ON public.document_keys FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_keys_document ON public.document_keys(document_id);
CREATE INDEX IF NOT EXISTS idx_document_keys_user ON public.document_keys(user_id);

-- ============================================
-- DOCUMENT_ANALYTICS TABLE (Detailed Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    viewer_email TEXT NOT NULL,
    session_id TEXT NOT NULL,
    device_hash TEXT,
    platform TEXT,
    app_version TEXT,
    access_token_id UUID REFERENCES public.access_tokens(id) ON DELETE SET NULL,
    total_pages INTEGER DEFAULT 1,
    view_start TIMESTAMPTZ DEFAULT NOW(),
    view_end TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    pages_viewed INTEGER DEFAULT 1,
    scroll_depth_percent INTEGER DEFAULT 0,
    screenshot_attempts INTEGER DEFAULT 0,
    recording_detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.document_analytics ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owners can view document analytics"
  ON public.document_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_analytics.document_id
      AND documents.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own view sessions"
  ON public.document_analytics FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_analytics_document ON public.document_analytics(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analytics_viewer ON public.document_analytics(viewer_email);
CREATE INDEX IF NOT EXISTS idx_document_analytics_session ON public.document_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_document_analytics_created ON public.document_analytics(created_at);

-- ============================================
-- RPC FUNCTION: Increment Screenshot Count
-- ============================================
CREATE OR REPLACE FUNCTION increment_screenshot_count(p_session_id TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.document_analytics
    SET screenshot_attempts = COALESCE(screenshot_attempts, 0) + 1,
        updated_at = NOW()
    WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
