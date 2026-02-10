-- SecureShare Online Schema (Zero-Trust)
-- Enforces "Access Logic" over "File Ownership"

-- 1. Enable RLS
alter table auth.users enable row level security;

-- 2. Documents Table (The Vault)
create table public.documents (
    id uuid default gen_random_uuid() primary key,
    owner_id uuid references auth.users(id) not null,
    filename text not null,
    file_path text not null, -- Path in Supabase Storage
    encryption_iv text not null, -- IV for the client-side encryption
    mime_type text not null,
    size_bytes bigint not null,
    watermark_payload text, -- Forensic watermark metadata (documentUUID|email|timestamp|deviceHash)
    status text default 'active' check (status in ('active', 'archived', 'deleted')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.documents enable row level security;

-- 3. Access Grants (The Keys)
create table public.access_grants (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    grantor_id uuid references auth.users(id) not null,
    recipient_email text not null, -- We match this to auth.users later or use it for "pending" state
    status text default 'active' check (status in ('pending', 'active', 'revoked', 'expired')),
    permissions jsonb default '{"view": true, "download": false}'::jsonb, -- Explicitly deny download
    expires_at timestamp with time zone,
    device_hash text, -- Optional device binding for access validation
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.access_grants enable row level security;

-- 4. Encryption Keys (Wrapped)
-- For MVP, we store the file key encrypted by a shared secret or owner's key. 
-- In a real enterprise system, we'd use a Key Management Service (KMS).
create table public.document_keys (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    encrypted_key text not null, -- The AES-256 key for the file, encrypted (wrapped)
    iv text, -- Initialization vector for AES-GCM encryption
    key_version int default 1
);

alter table public.document_keys enable row level security;

-- 5. Access Logs (Immutable Audit Trail)
create table public.access_logs (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id),
    user_id uuid references auth.users(id), -- Nullable if we track anon views (not allowed here)
    event_type text not null check (event_type in ('upload', 'grant', 'revoke', 'view_start', 'view_end', 'security_alert')),
    meta jsonb default '{}'::jsonb, -- Device info, IP, location
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Logs are append-only. No RLS update/delete allowed.
alter table public.access_logs enable row level security;

-- ==========================================
-- ROW LEVEL SECURITY POLICIES (Zero Trust)
-- ==========================================

-- DOCUMENTS
-- Owner can see/edit their own docs
create policy "Owners can do everything with their documents"
on public.documents for all
using (auth.uid() = owner_id);

-- Recipients can VIEW documents shared with them (Active only)
create policy "Recipients can view shared active documents"
on public.documents for select
using (
    exists (
        select 1 from public.access_grants
        where access_grants.document_id = documents.id
        and access_grants.recipient_email = auth.jwt() ->> 'email'
        and access_grants.status = 'active'
        and (access_grants.expires_at is null or access_grants.expires_at > now())
    )
);

-- ACCESS GRANTS
-- Owner can manage grants
create policy "Owners manage grants"
on public.access_grants for all
using (
    exists (
        select 1 from public.documents
        where documents.id = access_grants.document_id
        and documents.owner_id = auth.uid()
    )
);

-- Recipients can see their own grants (to list "Shared with Me")
create policy "Recipients view their grants"
on public.access_grants for select
using (recipient_email = auth.jwt() ->> 'email');

-- KEYS
-- Owner can manage keys
create policy "Owners manage keys"
on public.document_keys for all
using (
    exists (
        select 1 from public.documents
        where documents.id = document_keys.document_id
        and documents.owner_id = auth.uid()
    )
);

-- Recipients can SELECT keys (to decrypt) but NOT edit
create policy "Recipients read keys"
on public.document_keys for select
using (
    exists (
        select 1 from public.access_grants
        where access_grants.document_id = document_keys.document_id
        and access_grants.recipient_email = auth.jwt() ->> 'email'
        and access_grants.status = 'active'
        and (access_grants.expires_at is null or access_grants.expires_at > now())
    )
);

-- ACCESS LOGS
-- Owner can see logs for their documents
create policy "Owners see access logs"
on public.access_logs for select
using (
    exists (
        select 1 from public.documents
        where documents.id = access_logs.document_id
        and documents.owner_id = auth.uid()
    )
);

-- Users can insert logs (logging their own actions)
create policy "Users can log events"
on public.access_logs for insert
with check (auth.uid() = user_id);

-- STORAGE BUCKETS
-- (You must configure this in Supabase Dashboard, but here is the logic)
-- Bucket: 'secure-share'
-- Policy: Give access if user has SELECT on public.documents for that file path.

-- FUNCTIONS
-- Auto-update status on expiry (Scheduled function in real world, or trigger)
