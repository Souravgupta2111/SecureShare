-- VIEW: document_analytics_summary
-- Pre-aggregated stats for documents.
-- SECURITY: 
-- 1. Uses 'security_invoker = true' to enforce RLS (defense in depth).
-- 2. Explicitly filters 'WHERE owner_id = auth.uid()' to ensure ONLY OWNERS see summaries.
-- 3. Correct GROUP BY clause.

CREATE OR REPLACE VIEW public.document_analytics_summary 
WITH (security_invoker = true)
AS
SELECT
  d.id AS document_id,
  d.owner_id,
  COUNT(da.id) AS total_views,
  COUNT(DISTINCT da.viewer_email) AS unique_viewers,
  COALESCE(SUM(da.duration_seconds), 0) AS total_duration_seconds,
  COALESCE(AVG(da.duration_seconds), 0) AS avg_duration_seconds,
  COALESCE(SUM(da.screenshot_attempts), 0) AS total_screenshots,
  MAX(da.created_at) AS last_viewed_at
FROM public.documents d
LEFT JOIN public.document_analytics da ON d.id = da.document_id
WHERE d.owner_id = auth.uid()
GROUP BY d.id, d.owner_id;
