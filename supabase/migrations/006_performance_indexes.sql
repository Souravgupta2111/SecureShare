-- Migration: 006_performance_indexes.sql
-- Purpose: Add composite indexes for common query patterns

-- ===========================================
-- DOCUMENTS TABLE INDEXES
-- ===========================================

-- Owner documents list (most common query)
-- Covers: SELECT * FROM documents WHERE owner_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_documents_owner_created
    ON public.documents(owner_id, created_at DESC);

-- Document with file path (for storage lookups)
CREATE INDEX IF NOT EXISTS idx_documents_file_path
    ON public.documents(file_path)
    WHERE file_path IS NOT NULL;

-- ===========================================
-- ACCESS_TOKENS TABLE INDEXES  
-- ===========================================

-- Shared with me query (document + recipient + valid)
CREATE INDEX IF NOT EXISTS idx_access_tokens_recipient_valid
    ON public.access_tokens(recipient_email, is_valid, expires_at)
    WHERE is_valid = true;

-- Document grants list
CREATE INDEX IF NOT EXISTS idx_access_tokens_doc_valid
    ON public.access_tokens(document_id, is_valid)
    WHERE is_valid = true;

-- Expired tokens (for cleanup job)
CREATE INDEX IF NOT EXISTS idx_access_tokens_expired
    ON public.access_tokens(expires_at)
    WHERE is_valid = true AND expires_at IS NOT NULL;

-- ===========================================
-- ACCESS_LOGS TABLE INDEXES
-- ===========================================

-- Document activity log
CREATE INDEX IF NOT EXISTS idx_access_logs_doc_created
    ON public.access_logs(document_id, created_at DESC)
    WHERE document_id IS NOT NULL;

-- User activity
CREATE INDEX IF NOT EXISTS idx_access_logs_user_created
    ON public.access_logs(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- Event type filtering
CREATE INDEX IF NOT EXISTS idx_access_logs_event_type
    ON public.access_logs(event_type, created_at DESC);

-- ===========================================
-- DOCUMENT_KEYS TABLE INDEXES
-- ===========================================

-- User's keys with document access
CREATE INDEX IF NOT EXISTS idx_document_keys_user_doc
    ON public.document_keys(user_id, document_id);

-- ===========================================
-- PROFILES TABLE INDEXES
-- ===========================================

-- Email lookup (for sharing)
CREATE INDEX IF NOT EXISTS idx_profiles_email
    ON public.profiles(email)
    WHERE email IS NOT NULL;

-- ===========================================
-- PARTIAL/EXPRESSION INDEXES
-- ===========================================

-- Active sessions (for real-time analytics)
CREATE INDEX IF NOT EXISTS idx_document_analytics_active
    ON public.document_analytics(document_id, created_at DESC)
    WHERE view_end IS NULL;

-- Security events (for alerts)
CREATE INDEX IF NOT EXISTS idx_access_logs_security
    ON public.access_logs(document_id, created_at DESC)
    WHERE event_type = 'security_alert';

-- ===========================================
-- ANALYZE TABLES (Update Statistics)
-- ===========================================
ANALYZE public.documents;
ANALYZE public.access_tokens;
ANALYZE public.access_logs;
ANALYZE public.document_keys;
ANALYZE public.profiles;
