# Supabase Configuration

## Setup Instructions

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to Settings > API
4. Copy your Project URL and anon public key
5. Update `lib/supabase.js` with your credentials:

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

## Database Setup

1. Go to SQL Editor in your Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and run in the SQL Editor

## Storage Setup

1. Go to Storage in your Supabase dashboard
2. Create a new bucket called `documents`
3. Set it to **Private** (not public)
4. File size limit: 50MB
5. Allowed MIME types:
   - image/jpeg
   - image/png
   - application/pdf
   - application/octet-stream

## Environment Variables (Optional)

For production, use environment variables:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

And update `lib/supabase.js`:

```javascript
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

## Free Tier Limits

| Resource | Free Limit |
|----------|------------|
| Database | 500 MB |
| Storage | 1 GB |
| Auth Users | 50,000 |
| Edge Functions | 500K invocations/month |
| Realtime | 200 concurrent connections |

This is more than enough to start!
