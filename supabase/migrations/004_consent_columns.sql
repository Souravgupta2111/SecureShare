-- Migration: 004_consent_columns.sql
-- Purpose: Add consent tracking columns to profiles table for analytics and error reporting

-- Add analytics consent column (default OFF for privacy)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN DEFAULT FALSE;

-- Add error reporting consent column (default OFF for privacy)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS error_reporting_consent BOOLEAN DEFAULT FALSE;

-- Add consent updated timestamp
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.analytics_consent IS 
  'User consent for anonymous usage analytics collection (default OFF)';
  
COMMENT ON COLUMN public.profiles.error_reporting_consent IS 
  'User consent for error reporting with stack traces (default OFF)';

COMMENT ON COLUMN public.profiles.consent_updated_at IS 
  'Timestamp when user last updated their consent preferences';
