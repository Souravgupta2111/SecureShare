-- Storage RLS Policies for SecureShare
-- Applied: 2026-02-03
-- Note: ALTER TABLE not needed - Supabase already has RLS enabled on storage.objects

-- Clean slate
DROP POLICY IF EXISTS "Owners manage files" ON storage.objects;
DROP POLICY IF EXISTS "Recipients view shared" ON storage.objects;

-- Owners: full access to their documents
CREATE POLICY "Owners manage files"
ON storage.objects
FOR ALL
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.documents d
        WHERE d.file_path = name
          AND d.owner_id = auth.uid()
    )
)
WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.documents d
        WHERE d.file_path = name
          AND d.owner_id = auth.uid()
    )
);

-- Recipients: view-only access (download to memory for in-app viewing)
-- Security: App enforces no-save-to-disk, this allows fetching for display
CREATE POLICY "Recipients view shared"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.documents d
        JOIN public.access_grants ag ON ag.document_id = d.id
        WHERE d.file_path = name
          AND ag.recipient_email = auth.jwt() ->> 'email'
          AND ag.status = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
          AND (ag.permissions->>'view')::boolean = true
    )
);
