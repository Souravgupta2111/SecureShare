-- SecureShare Migration 001: Add Missing Columns
-- Version: 001
-- Date: 2026-02-01
-- Purpose: Align schema with code expectations for production readiness

-- Add watermark_payload to documents table
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS watermark_payload text;
COMMENT ON COLUMN public.documents.watermark_payload IS 'Forensic watermark metadata: documentUUID|email|timestamp|deviceHash';

-- Add device_hash to access_grants table
ALTER TABLE public.access_grants ADD COLUMN IF NOT EXISTS device_hash text;
COMMENT ON COLUMN public.access_grants.device_hash IS 'Optional device binding for access validation';

-- Add iv to document_keys table
ALTER TABLE public.document_keys ADD COLUMN IF NOT EXISTS iv text;
COMMENT ON COLUMN public.document_keys.iv IS 'Initialization vector for AES-GCM encryption';

-- Verify columns exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'watermark_payload')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'access_grants' AND column_name = 'device_hash')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_keys' AND column_name = 'iv')
    THEN
        RAISE NOTICE 'Schema migration 001 completed successfully';
    ELSE
        RAISE EXCEPTION 'Migration 001 failed: one or more columns not created';
    END IF;
END $$;
