-- Migration: 003_fix_event_policies.sql
-- Purpose: Fix overly permissive INSERT policies that allow anyone to inject fake events
-- Security: Restrict INSERT to authenticated users only, and only for their own events

-- ============================================
-- FIX ANALYTICS EVENTS POLICY
-- ============================================
-- Problem: WITH CHECK (true) allows anyone to inject fake analytics events
-- Solution: Restrict INSERT to authenticated user only

DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.analytics_events;

CREATE POLICY "Authenticated users insert own events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    (user_id IS NULL OR user_id = auth.uid())
  );

-- ============================================
-- FIX SECURITY EVENTS POLICY  
-- ============================================
-- Problem: WITH CHECK (true) allows anyone to inject fake security events
-- Solution: Restrict INSERT to authenticated user only

DROP POLICY IF EXISTS "Anyone can insert security events" ON public.security_events;

CREATE POLICY "Authenticated users insert own events"
  ON public.security_events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (user_id IS NULL OR user_id = auth.uid())
  );

-- ============================================
-- ADD USER_ID COLUMN IF MISSING
-- ============================================
-- Ensure user_id column exists for proper tracking

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_events' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.analytics_events 
    ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'security_events' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.security_events 
    ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Create index for user_id queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id);
