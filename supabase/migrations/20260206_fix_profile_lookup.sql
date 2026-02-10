-- ==========================================
-- SECURESHARE: FIX PROFILE LOOKUP FOR SHARING
-- Allows authenticated users to find recipients by email
-- ==========================================

BEGIN;

-- Create a policy that allows authenticated users to read 
-- email and public_key for sharing purposes
-- This is required for the share flow to find recipients

CREATE POLICY "Authenticated users can lookup profiles for sharing"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Note: This exposes profiles to authenticated users only
-- Unauthenticated users cannot access profile data
-- The public_profiles VIEW remains for truly public info

COMMIT;
