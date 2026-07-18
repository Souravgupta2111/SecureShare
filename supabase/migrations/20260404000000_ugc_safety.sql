-- ============================================================================
-- SECURESHARE: UGC safety (App Store Guideline 1.2)
--
-- Adds a content-report mechanism and a sender block-list so users can report
-- objectionable content and block abusive senders. Run after the base schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CONTENT REPORTS (append-only from the user's side)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  reported_email TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users file own reports" ON public.content_reports;
CREATE POLICY "Users file own reports"
  ON public.content_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users view own reports" ON public.content_reports;
CREATE POLICY "Users view own reports"
  ON public.content_reports FOR SELECT
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "No user update reports" ON public.content_reports;
CREATE POLICY "No user update reports"
  ON public.content_reports FOR UPDATE USING (false);

DROP POLICY IF EXISTS "No user delete reports" ON public.content_reports;
CREATE POLICY "No user delete reports"
  ON public.content_reports FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON public.content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON public.content_reports(status, created_at DESC);

-- ----------------------------------------------------------------------------
-- BLOCKED SENDERS (per-user block list)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_email TEXT NOT NULL CHECK (blocked_email = lower(blocked_email)),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE (blocker_id, blocked_email)
);
ALTER TABLE public.blocked_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own blocks" ON public.blocked_senders;
CREATE POLICY "Users manage own blocks"
  ON public.blocked_senders FOR ALL
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocked_senders_blocker ON public.blocked_senders(blocker_id);

-- ============================================================================
-- END
-- ============================================================================
