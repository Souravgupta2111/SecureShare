-- SecureShare Migration: Fix Security & Performance
-- Created: 2026-02-02

-- 1. Add user_id to document_keys to allow per-user key storage
ALTER TABLE public.document_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Backfill: Link existing keys to the document owner
UPDATE public.document_keys
SET user_id = documents.owner_id
FROM public.documents
WHERE document_keys.document_id = documents.id
AND document_keys.user_id IS NULL;

-- 3. Add Indexes for Performance (Audit item 2)
CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_grants_recipient ON public.access_grants(recipient_email);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_document ON public.access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_keys_lookup ON public.document_keys(document_id, user_id);

-- 4. RLS Update for document_keys
-- Drop old policies
DROP POLICY IF EXISTS "Owners manage keys" ON public.document_keys;
DROP POLICY IF EXISTS "Recipients read keys" ON public.document_keys;

-- Policy 1: Document Owners can do EVERYTHING (Insert keys for others, delete keys, etc.)
CREATE POLICY "Owners manage all keys for their docs"
ON public.document_keys
FOR ALL
USING (
    exists (
        select 1 from public.documents
        where documents.id = document_keys.document_id
        and documents.owner_id = auth.uid()
    )
);

-- Policy 2: Users can VIEW their own keys
CREATE POLICY "Users view their own keys"
ON public.document_keys
FOR SELECT
USING (user_id = auth.uid());
