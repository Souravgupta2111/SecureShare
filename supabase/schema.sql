-- SecureShare Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  device_hash TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image' | 'pdf' | 'document'
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  encryption_key_encrypted TEXT,
  watermark_payload JSONB NOT NULL,
  status TEXT DEFAULT 'active', -- 'active' | 'revoked' | 'expired'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = owner_id);

-- Index for faster queries
CREATE INDEX idx_documents_owner ON public.documents(owner_id);
CREATE INDEX idx_documents_status ON public.documents(status);

-- ============================================
-- ACCESS TOKENS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_id UUID REFERENCES auth.users(id),
  token_hash TEXT NOT NULL UNIQUE,
  device_hash TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'active' | 'revoked'
  expires_at TIMESTAMPTZ,
  first_accessed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  total_view_time INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Document owners can manage tokens"
  ON public.access_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = access_tokens.document_id
      AND documents.owner_id = auth.uid()
    )
  );

CREATE POLICY "Recipients can view their tokens"
  ON public.access_tokens FOR SELECT
  USING (
    recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR recipient_id = auth.uid()
  );

-- Indexes
CREATE INDEX idx_access_tokens_document ON public.access_tokens(document_id);
CREATE INDEX idx_access_tokens_recipient ON public.access_tokens(recipient_email);
CREATE INDEX idx_access_tokens_recipient_id ON public.access_tokens(recipient_id);

-- ============================================
-- ANALYTICS EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  access_token_id UUID REFERENCES public.access_tokens(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'view_start' | 'view_end' | 'heartbeat'
  device_hash TEXT,
  platform TEXT,
  session_duration INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Document owners can view analytics"
  ON public.analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = analytics_events.document_id
      AND documents.owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true); -- Allow logging from any authenticated user

-- Indexes
CREATE INDEX idx_analytics_document ON public.analytics_events(document_id);
CREATE INDEX idx_analytics_recipient ON public.analytics_events(recipient_email);
CREATE INDEX idx_analytics_created ON public.analytics_events(created_at);

-- ============================================
-- SECURITY EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  access_token_id UUID REFERENCES public.access_tokens(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'screenshot' | 'recording' | 'copy' | 'denied' | 'app_backgrounded'
  device_hash TEXT,
  platform TEXT,
  blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Document owners can view security events"
  ON public.security_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = security_events.document_id
      AND documents.owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can insert security events"
  ON public.security_events FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_security_events_document ON public.security_events(document_id);
CREATE INDEX idx_security_events_created ON public.security_events(created_at);

-- ============================================
-- STORAGE BUCKET
-- ============================================
-- Run in Supabase Dashboard > Storage > Create bucket
-- Name: documents
-- Public: false (private bucket)
-- File size limit: 50MB
-- Allowed mime types: image/jpeg, image/png, application/pdf, application/octet-stream

-- Storage Policies (run in SQL Editor)
-- CREATE POLICY "Users can upload own documents"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can read own documents"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
