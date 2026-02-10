-- Add Consent Columns to Profiles Table
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS error_reporting_consent BOOLEAN DEFAULT FALSE;

-- Add indexes for consent checks (useful for analytics aggregation)
CREATE INDEX IF NOT EXISTS idx_profiles_analytics_consent ON public.profiles(analytics_consent) WHERE analytics_consent = TRUE;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name LIKE '%consent%';
