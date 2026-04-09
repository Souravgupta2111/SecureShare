-- ============================================================================
-- SECURESHARE: 01_SCHEMA.SQL
-- The single source of truth for all tables, columns, indexes, triggers.
-- Run this FIRST in Supabase SQL Editor on a fresh project.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  public_key TEXT,                              -- RSA public key for Zero-Trust key exchange
  device_hash TEXT,
  settings JSONB DEFAULT '{}',
  analytics_consent BOOLEAN DEFAULT FALSE,
  error_reporting_consent BOOLEAN DEFAULT FALSE,
  consent_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ============================================================================
-- 2. FOLDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3d7aff',
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),

  CONSTRAINT unique_folder_name_per_parent UNIQUE (owner_id, parent_folder_id, name)
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_folders_owner ON public.folders(owner_id);

-- ============================================================================
-- 3. DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,                      -- Path in Supabase Storage
  encryption_iv TEXT NOT NULL,                  -- IV or label for encryption method
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  watermark_payload TEXT,                       -- Forensic watermark: docUUID|email|ts|deviceHash|sig
  watermark_signature TEXT,                     -- HMAC-SHA256 of watermark_payload
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  thumbnail_path TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner_status ON public.documents(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_owner_created ON public.documents(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_id_owner ON public.documents(id, owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON public.documents(file_path) WHERE file_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON public.documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status) WHERE status = 'active';

-- ============================================================================
-- 4. ACCESS_GRANTS (Sharing — the ONLY sharing table used by the app)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  grantor_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_email TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  permissions JSONB DEFAULT '{"view": true, "download": false}'::jsonb,
  expires_at TIMESTAMPTZ,
  device_hash TEXT,
  cached_at TIMESTAMPTZ,
  cache_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,

  -- Enforce lowercase emails to avoid RLS mismatch
  CONSTRAINT access_grants_recipient_email_lowercase CHECK (recipient_email = lower(recipient_email)),
  -- Validate permissions shape
  CONSTRAINT access_grants_permissions_valid CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (permissions ? 'view')
    AND (permissions ? 'download')
    AND (permissions - 'view' - 'download') = '{}'::jsonb
    AND jsonb_typeof(permissions->'view') = 'boolean'
    AND jsonb_typeof(permissions->'download') = 'boolean'
  )
);
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_access_grants_document ON public.access_grants(document_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_recipient ON public.access_grants(recipient_email);
CREATE INDEX IF NOT EXISTS idx_access_grants_grantor ON public.access_grants(grantor_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_status ON public.access_grants(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_access_grants_recipient_active ON public.access_grants(recipient_email, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_access_grants_doc_recipient_status ON public.access_grants(document_id, recipient_email, status);

-- ============================================================================
-- 5. DOCUMENT_KEYS (Per-user encrypted AES keys)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,                  -- AES key encrypted with user's RSA public key
  iv TEXT,
  key_version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),

  UNIQUE(document_id, user_id)
);
ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_document_keys_lookup ON public.document_keys(document_id, user_id);

-- ============================================================================
-- 6. ACCESS_LOGS (Append-only audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_token_id UUID,                         -- Legacy reference, kept for compatibility
  event_type TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_access_logs_doc_created ON public.access_logs(document_id, created_at DESC) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_logs_event_type ON public.access_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_doc_event ON public.access_logs(document_id, event_type);

-- ============================================================================
-- 7. ANALYTICS_EVENTS (Append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_name TEXT NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_doc ON public.analytics_events(document_id, created_at DESC);

-- ============================================================================
-- 8. SECURITY_EVENTS (Append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_doc ON public.security_events(document_id, created_at DESC);

-- ============================================================================
-- 9. DOCUMENT_ANALYTICS (Per-session view tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  viewer_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  device_hash TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web', 'unknown')),
  app_version TEXT,
  access_grant_id UUID REFERENCES public.access_grants(id) ON DELETE SET NULL,
  total_pages INTEGER DEFAULT 1,
  view_start TIMESTAMPTZ DEFAULT timezone('utc', now()),
  view_end TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  pages_viewed INTEGER DEFAULT 1,
  scroll_depth_percent INTEGER DEFAULT 0,
  screenshot_attempts INTEGER DEFAULT 0,
  recording_detected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),

  CONSTRAINT document_analytics_session_id_unique UNIQUE (session_id)
);
ALTER TABLE public.document_analytics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_document_analytics_document ON public.document_analytics(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analytics_doc_created ON public.document_analytics(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_analytics_session ON public.document_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_document_analytics_viewer ON public.document_analytics(viewer_email, document_id);
CREATE INDEX IF NOT EXISTS idx_document_analytics_active ON public.document_analytics(document_id, created_at DESC) WHERE view_end IS NULL;

-- ============================================================================
-- 10. DOCUMENT_WATERMARK_HASHES (Forensic proof — permanent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_watermark_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  grantor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watermark_hash TEXT NOT NULL,
  hmac_signature TEXT NOT NULL,
  device_hash TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),

  CONSTRAINT watermark_recipient_email_lowercase CHECK (recipient_email = lower(recipient_email))
);
ALTER TABLE public.document_watermark_hashes ENABLE ROW LEVEL SECURITY;

-- One active watermark per recipient per document
CREATE UNIQUE INDEX IF NOT EXISTS watermark_one_active_per_recipient
  ON public.document_watermark_hashes(document_id, recipient_email) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_watermark_hashes_document ON public.document_watermark_hashes(document_id);
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_recipient ON public.document_watermark_hashes(recipient_email);
CREATE INDEX IF NOT EXISTS idx_watermark_hashes_grantor ON public.document_watermark_hashes(grantor_id);

-- ============================================================================
-- 11. DOCUMENT_COMMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_comments_document ON public.document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON public.document_comments(user_id);

-- ============================================================================
-- 12. SCHEMA_MIGRATIONS (Versioning)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

INSERT INTO public.schema_migrations (version, name) VALUES
  ('1.0', 'Consolidated schema from 30+ files')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- TRIGGERS & HELPER FUNCTIONS
-- ============================================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at on document_analytics
CREATE OR REPLACE FUNCTION public.update_document_analytics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_analytics_timestamp ON public.document_analytics;
CREATE TRIGGER trigger_update_analytics_timestamp
  BEFORE UPDATE ON public.document_analytics
  FOR EACH ROW EXECUTE FUNCTION public.update_document_analytics_timestamp();

-- ============================================================================
-- END OF 01_SCHEMA.SQL
-- ============================================================================
