# SecureShare Database Setup

## Quick Start

Run these **2 files** in order in the Supabase SQL Editor:

1. **`01_schema.sql`** — Creates all tables, indexes, constraints, and triggers
2. **`02_policies_and_functions.sql`** — Sets up all RLS policies, views, and RPC functions

> **Important:** Run on a fresh Supabase project. If upgrading from the old schema, you should drop all existing tables and policies first, then run the two files above.

## Storage Bucket

After running the SQL files, create a storage bucket in the Supabase Dashboard:

- **Name:** `documents`
- **Public:** `false` (private bucket)
- **File size limit:** 50MB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `application/pdf`, `application/octet-stream`

The storage RLS policies are already included in `02_policies_and_functions.sql`.

## Architecture

| File | Purpose |
|------|---------|
| `01_schema.sql` | 12 tables, all indexes, constraints, triggers |
| `02_policies_and_functions.sql` | All RLS policies, 5 RPCs, 2 views, storage policies |

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles with public keys for encryption |
| `documents` | Uploaded documents metadata |
| `access_grants` | Sharing permissions (who can view what) |
| `document_keys` | Per-user encrypted AES keys |
| `access_logs` | Append-only audit trail |
| `analytics_events` | User analytics events |
| `security_events` | Security incident log |
| `document_analytics` | Per-session view tracking |
| `document_watermark_hashes` | Forensic watermark proof |
| `folders` | Document organization |
| `document_comments` | Document comments |
| `schema_migrations` | Migration versioning |

