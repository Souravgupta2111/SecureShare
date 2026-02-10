-- Performance Indexes for SecureShare
-- Run this in Supabase SQL Editor

-- ============================================
-- ACCESS_TOKENS Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_access_tokens_document_status
  ON public.access_tokens(document_id, status);

CREATE INDEX IF NOT EXISTS idx_access_tokens_recipient_status
  ON public.access_tokens(recipient_email, status);

-- ============================================
-- DOCUMENTS Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_documents_owner_status
  ON public.documents(owner_id, status);

-- Covering index for common list queries
CREATE INDEX IF NOT EXISTS idx_documents_list_cover
  ON public.documents(owner_id, status, created_at DESC)
  INCLUDE (id, filename, file_type, mime_type);

-- ============================================
-- ACCESS_GRANTS Indexes (already in migration 002, but duplicated here for safety)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_access_grants_document_status
  ON public.access_grants(document_id, status);

CREATE INDEX IF NOT EXISTS idx_access_grants_recipient_status
  ON public.access_grants(recipient_email, status);

-- ============================================
-- ANALYTICS Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_analytics_events_document_created
  ON public.analytics_events(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON public.analytics_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_document_created
  ON public.security_events(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_document_type
  ON public.access_logs(document_id, event_type);

CREATE INDEX IF NOT EXISTS idx_document_analytics_document_created
  ON public.document_analytics(document_id, created_at DESC);

-- ============================================
-- PROFILES Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ============================================
-- Verify all indexes were created
-- ============================================
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('access_tokens', 'documents', 'access_grants', 
                  'analytics_events', 'security_events', 'access_logs',
                  'document_analytics', 'profiles')
ORDER BY tablename, indexname;
