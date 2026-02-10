-- Fix infinite recursion in RLS policies for documents/access_grants
-- The circular dependency: access_grants references documents, which references access_grants

-- Step 1: Drop the problematic policies
DROP POLICY IF EXISTS "Owners manage grants" ON public.access_grants;
DROP POLICY IF EXISTS "Recipients can view shared active documents" ON public.documents;

-- Step 2: Create helper function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_document_owner(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = doc_id AND owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_active_grant(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.access_grants
        WHERE document_id = doc_id
        AND recipient_email = auth.jwt() ->> 'email'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    );
$$;

-- Step 3: Recreate policies using the helper functions
-- This breaks the circular reference because SECURITY DEFINER functions bypass RLS

-- ACCESS GRANTS: Owner can manage grants (uses function to check ownership)
CREATE POLICY "Owners manage grants"
ON public.access_grants FOR ALL
USING (public.is_document_owner(document_id));

-- DOCUMENTS: Recipients can view shared documents (uses function to check grants)
CREATE POLICY "Recipients can view shared active documents"
ON public.documents FOR SELECT
USING (public.has_active_grant(id));

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_document_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_grant(uuid) TO authenticated;
