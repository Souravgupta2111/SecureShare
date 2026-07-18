-- ============================================================================
-- SECURESHARE: Owner push-alert support
--
-- Adds a place to store each user's Expo push token so the `notify-owner`
-- Edge Function can send a real-time alert to a document's OWNER when a
-- recipient opens it or triggers a screenshot/screen-recording.
--
-- The token is written by the token owner via the existing "users update own
-- profile" RLS policy (the client updates its own row), and read only by the
-- service role inside the Edge Function — never exposed to other users.
--
-- Run AFTER 20260401000000_schema.sql.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- ============================================================================
-- END
-- ============================================================================
