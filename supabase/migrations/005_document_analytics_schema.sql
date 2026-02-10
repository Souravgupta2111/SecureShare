-- Migration: 005_document_analytics_schema.sql
-- Purpose: Create detailed document analytics tracking table

-- Create document_analytics table for detailed view tracking
CREATE TABLE IF NOT EXISTS public.document_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    viewer_email TEXT NOT NULL,
    session_id TEXT NOT NULL,
    
    -- Session timing
    view_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    view_end TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    
    -- Engagement metrics
    pages_viewed INTEGER DEFAULT 1,
    total_pages INTEGER DEFAULT 1,
    scroll_depth_percent INTEGER DEFAULT 0, -- 0-100
    
    -- Context
    device_hash TEXT,
    platform TEXT CHECK (platform IN ('ios', 'android', 'web', 'unknown')),
    app_version TEXT,
    access_token_id UUID REFERENCES public.access_tokens(id),
    
    -- Security events during session
    screenshot_attempts INTEGER DEFAULT 0,
    recording_detected BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.document_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: Document owners can view analytics for their documents
CREATE POLICY "Owners can view their document analytics"
    ON public.document_analytics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = document_analytics.document_id
            AND documents.owner_id = auth.uid()
        )
    );

-- Policy: Authenticated users can insert analytics for documents they have access to
CREATE POLICY "Users can insert analytics for accessible documents"
    ON public.document_analytics FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- Either is the document owner
            EXISTS (
                SELECT 1 FROM public.documents
                WHERE documents.id = document_analytics.document_id
                AND documents.owner_id = auth.uid()
            )
            OR
            -- Or has valid access token
            EXISTS (
                SELECT 1 FROM public.access_tokens
                WHERE access_tokens.id = document_analytics.access_token_id
                AND access_tokens.document_id = document_analytics.document_id
                AND access_tokens.is_valid = true
                AND (access_tokens.expires_at IS NULL OR access_tokens.expires_at > NOW())
            )
        )
    );

-- Policy: Users can update their own analytics sessions
CREATE POLICY "Users can update their own analytics sessions"
    ON public.document_analytics FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND created_at > NOW() - INTERVAL '24 hours' -- Only recent sessions
    );

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_doc_analytics_document_id 
    ON public.document_analytics(document_id);

CREATE INDEX IF NOT EXISTS idx_doc_analytics_viewer 
    ON public.document_analytics(viewer_email, document_id);

CREATE INDEX IF NOT EXISTS idx_doc_analytics_session 
    ON public.document_analytics(session_id);

CREATE INDEX IF NOT EXISTS idx_doc_analytics_created 
    ON public.document_analytics(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_doc_analytics_doc_created 
    ON public.document_analytics(document_id, created_at DESC);

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_document_analytics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_analytics_timestamp
    BEFORE UPDATE ON public.document_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_document_analytics_timestamp();

-- Comments
COMMENT ON TABLE public.document_analytics IS 
    'Detailed per-session document view analytics';

COMMENT ON COLUMN public.document_analytics.scroll_depth_percent IS 
    'Maximum scroll depth reached during session (0-100%)';

COMMENT ON COLUMN public.document_analytics.screenshot_attempts IS 
    'Number of screenshot attempts detected during this session';
