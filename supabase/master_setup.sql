-- SECURESHARE MASTER SETUP SCRIPT
-- Run this entire file in the Supabase SQL Editor.

-- ==========================================
-- 1. EXTENSIONS & BASICS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 2. CREATE TABLES (Structure First)
-- ==========================================

-- 2.1 PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  public_key TEXT,
  device_hash TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2.2 DOCUMENTS
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid default gen_random_uuid() primary key,
    owner_id uuid references auth.users(id) not null,
    filename text not null,
    file_path text not null,
    encryption_iv text not null, 
    mime_type text not null,
    size_bytes bigint not null,
    watermark_payload text,
    status text default 'active' check (status in ('active', 'archived', 'deleted')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);

-- 2.3 ACCESS GRANTS
CREATE TABLE IF NOT EXISTS public.access_grants (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    grantor_id uuid references auth.users(id) not null,
    recipient_email text not null,
    status text default 'active' check (status in ('pending', 'active', 'revoked', 'expired')),
    permissions jsonb default '{"view": true, "download": false}'::jsonb,
    expires_at timestamp with time zone,
    device_hash text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_grants_recipient ON public.access_grants(recipient_email);

-- 2.4 DOCUMENT KEYS
CREATE TABLE IF NOT EXISTS public.document_keys (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    user_id uuid references auth.users(id),
    encrypted_key text not null,
    iv text,
    key_version int default 1
);
ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_document_keys_lookup ON public.document_keys(document_id, user_id);

-- 2.5 ACCESS LOGS
CREATE TABLE IF NOT EXISTS public.access_logs (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id),
    user_id uuid references auth.users(id),
    event_type text not null,
    meta jsonb default '{}'::jsonb,
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_document ON public.access_logs(document_id);

-- ==========================================
-- 3. TRIGGERS & FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid error on rerun
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 4. RLS POLICIES (Logic Last)
-- ==========================================
-- Note: We drop existing policies to ensure clean updates if re-running

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view public profile info" ON public.profiles;
CREATE POLICY "Users can view public profile info" ON public.profiles FOR SELECT USING (true);


-- DOCUMENTS POLICIES
DROP POLICY IF EXISTS "Owners can do everything with their documents" ON public.documents;
CREATE POLICY "Owners can do everything with their documents"
ON public.documents FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Recipients can view shared active documents" ON public.documents;
CREATE POLICY "Recipients can view shared active documents"
ON public.documents FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.access_grants
        WHERE access_grants.document_id = documents.id
        AND access_grants.recipient_email = auth.jwt() ->> 'email'
        AND access_grants.status = 'active'
    )
);


-- ACCESS GRANTS POLICIES
DROP POLICY IF EXISTS "Owners manage grants" ON public.access_grants;
CREATE POLICY "Owners manage grants" ON public.access_grants FOR ALL 
USING (EXISTS (SELECT 1 FROM public.documents WHERE documents.id = access_grants.document_id AND documents.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Recipients view their grants" ON public.access_grants;
CREATE POLICY "Recipients view their grants" ON public.access_grants FOR SELECT 
USING (recipient_email = auth.jwt() ->> 'email');


-- DOCUMENT KEYS POLICIES
DROP POLICY IF EXISTS "Owners manage all keys for their docs" ON public.document_keys;
CREATE POLICY "Owners manage all keys for their docs" ON public.document_keys FOR ALL
USING (EXISTS (SELECT 1 FROM public.documents WHERE documents.id = document_keys.document_id AND documents.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users view their own keys" ON public.document_keys;
CREATE POLICY "Users view their own keys" ON public.document_keys FOR SELECT
USING (user_id = auth.uid());


-- ACCESS LOGS POLICIES
DROP POLICY IF EXISTS "Owners see access logs" ON public.access_logs;
CREATE POLICY "Owners see access logs" ON public.access_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE documents.id = access_logs.document_id AND documents.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can log events" ON public.access_logs;
CREATE POLICY "Users can log events" ON public.access_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
