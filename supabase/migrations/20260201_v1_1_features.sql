-- SecureShare v1.1 Feature Improvements Migration
-- Adds: folders, comments, offline caching support

-- ============================================
-- 1. FOLDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#3d7aff',
    icon TEXT DEFAULT 'folder',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraint: unique folder names per parent per user
    CONSTRAINT unique_folder_name_per_parent UNIQUE (owner_id, parent_folder_id, name)
);

-- Add folder reference to documents
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- Index for faster folder queries
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);

-- RLS for folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"
    ON folders FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own folders"
    ON folders FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own folders"
    ON folders FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own folders"
    ON folders FOR DELETE
    USING (auth.uid() = owner_id);

-- ============================================
-- 2. COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS document_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster comment queries
CREATE INDEX IF NOT EXISTS idx_comments_document ON document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON document_comments(user_id);

-- RLS for comments
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;

-- Document owner can see all comments
CREATE POLICY "Document owners can view all comments"
    ON document_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_id AND d.owner_id = auth.uid()
        )
    );

-- Recipients with active grants can see and add comments
CREATE POLICY "Recipients can view comments"
    ON document_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM access_grants ag 
            WHERE ag.document_id = document_comments.document_id 
            AND ag.recipient_email = auth.jwt()->>'email'
            AND ag.status = 'active'
        )
    );

CREATE POLICY "Recipients can add comments"
    ON document_comments FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND (
            -- Owner can comment
            EXISTS (
                SELECT 1 FROM documents d 
                WHERE d.id = document_id AND d.owner_id = auth.uid()
            )
            OR
            -- Recipients with access can comment
            EXISTS (
                SELECT 1 FROM access_grants ag 
                WHERE ag.document_id = document_comments.document_id 
                AND ag.recipient_email = auth.jwt()->>'email'
                AND ag.status = 'active'
            )
        )
    );

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
    ON document_comments FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3. OFFLINE CACHE TRACKING
-- ============================================
ALTER TABLE access_grants 
ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ;

-- ============================================
-- 4. DOCUMENT THUMBNAILS
-- ============================================
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;

-- ============================================
-- 5. VIEW NOTIFICATIONS TRIGGER
-- ============================================
-- Function to notify document owner when viewed
CREATE OR REPLACE FUNCTION notify_document_viewed()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger for view_start events
    IF NEW.event_type = 'view_start' THEN
        -- Insert notification record (can be polled by app)
        INSERT INTO access_logs (
            document_id,
            user_id,
            recipient_email,
            event_type,
            device_hash,
            metadata
        ) VALUES (
            NEW.document_id,
            NEW.user_id,
            NEW.recipient_email,
            'owner_notification',
            NEW.device_hash,
            jsonb_build_object('triggered_by', NEW.event_type)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (if not exists)
DROP TRIGGER IF EXISTS on_document_viewed ON access_logs;
CREATE TRIGGER on_document_viewed
    AFTER INSERT ON access_logs
    FOR EACH ROW
    EXECUTE FUNCTION notify_document_viewed();
