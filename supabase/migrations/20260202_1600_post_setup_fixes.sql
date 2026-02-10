-- ==========================================
-- SECURESHARE POST-SETUP FIXES
-- Safe corrective migration
-- ==========================================

BEGIN;

-- ==========================================
-- 1. FIX PROFILES DATA LEAK (CRITICAL)
-- ==========================================
-- Problem:
-- "Users can view public profile info" allows reading email, device_hash, settings
-- RLS policies are OR-ed, causing overexposure

-- Solution:
-- Remove public SELECT on profiles
-- (Public info should be served via a VIEW, not the table)

DROP POLICY IF EXISTS "Users can view public profile info" ON public.profiles;

-- ==========================================
-- 2. CREATE SAFE PUBLIC PROFILES VIEW
-- ==========================================
-- Exposes ONLY non-sensitive fields

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  display_name,
  avatar_url
FROM public.profiles;

-- Grant read access to authenticated users
GRANT SELECT ON public.public_profiles TO authenticated;

-- ==========================================
-- 3. NORMALIZE recipient_email (DATA SAFETY)
-- ==========================================
-- Enforce lowercase emails to avoid access bugs

-- 3.1 Normalize existing data
UPDATE public.access_grants
SET recipient_email = lower(recipient_email);

-- 3.2 Enforce lowercase going forward
ALTER TABLE public.access_grants
ADD CONSTRAINT access_grants_recipient_email_lowercase
CHECK (recipient_email = lower(recipient_email));

-- ==========================================
-- 4. ENFORCE document_keys.user_id NOT NULL
-- ==========================================
-- Tightens referential integrity

ALTER TABLE public.document_keys
ALTER COLUMN user_id SET NOT NULL;

-- ==========================================
-- 5. CONSISTENT UTC TIMESTAMPS (OPTIONAL BUT CLEAN)
-- ==========================================
-- Align profiles timestamps with rest of schema

ALTER TABLE public.profiles
ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());

ALTER TABLE public.profiles
ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

COMMIT;
