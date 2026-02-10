-- Fix Insecure RLS Policies for Analytics and Security Events
-- Run this in Supabase SQL Editor

-- Drop insecure policies
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Anyone can insert security events" ON public.security_events;

-- Create secure policies requiring user_id match for analytics_events
-- The user_id column must exist and match auth.uid()
CREATE POLICY "Users insert own analytics events"
  ON public.analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create secure policies requiring user_id match for security_events
CREATE POLICY "Users insert own security events"
  ON public.security_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Verify policies were created
SELECT policy_name, table_name
FROM pg_policies
WHERE schemaname = 'public'
AND policy_name LIKE '%insert%';
