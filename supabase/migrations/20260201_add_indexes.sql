-- SecureShare Database Performance Indexes
-- This migration adds indexes to all foreign keys for RLS performance
-- Without these, RLS policy joins trigger full table scans

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
-- Index on owner_id for RLS policy: "Owners can do everything with their documents"
CREATE INDEX IF NOT EXISTS idx_documents_owner_id 
ON public.documents(owner_id);

-- Index on status for filtered queries
CREATE INDEX IF NOT EXISTS idx_documents_status 
ON public.documents(status) 
WHERE status = 'active';

-- Composite index for common query pattern (owner + status)
CREATE INDEX IF NOT EXISTS idx_documents_owner_status 
ON public.documents(owner_id, status);

-- ============================================
-- ACCESS_GRANTS TABLE
-- ============================================
-- Index on document_id for RLS policy joins
CREATE INDEX IF NOT EXISTS idx_access_grants_document_id 
ON public.access_grants(document_id);

-- Index on recipient_email for "Shared with Me" queries and RLS
CREATE INDEX IF NOT EXISTS idx_access_grants_recipient_email 
ON public.access_grants(recipient_email);

-- Index on grantor_id for owner lookups
CREATE INDEX IF NOT EXISTS idx_access_grants_grantor_id 
ON public.access_grants(grantor_id);

-- Index on status for active grants filter
CREATE INDEX IF NOT EXISTS idx_access_grants_status 
ON public.access_grants(status) 
WHERE status = 'active';

-- Composite index for common query: active grants for recipient
CREATE INDEX IF NOT EXISTS idx_access_grants_recipient_active 
ON public.access_grants(recipient_email, status) 
WHERE status = 'active';

-- ============================================
-- DOCUMENT_KEYS TABLE
-- ============================================
-- Index on document_id for key lookups (critical for decryption)
CREATE INDEX IF NOT EXISTS idx_document_keys_document_id 
ON public.document_keys(document_id);

-- ============================================
-- ACCESS_LOGS TABLE
-- ============================================
-- Index on document_id for audit trail queries
CREATE INDEX IF NOT EXISTS idx_access_logs_document_id 
ON public.access_logs(document_id);

-- Index on user_id for user activity queries
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id 
ON public.access_logs(user_id);

-- Index on timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp 
ON public.access_logs(timestamp DESC);

-- Composite index for event type queries
CREATE INDEX IF NOT EXISTS idx_access_logs_doc_event 
ON public.access_logs(document_id, event_type);
