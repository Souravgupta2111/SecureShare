# Forensic Watermark System - Deployment Checklist

## ✅ Completed

### Files Created
- [x] `supabase/migrations/010_document_watermark_hashes.sql` - Database migration
- [x] `supabase/functions/verify-watermark/index.ts` - Edge Function
- [x] `lib/supabase.js` - Client API functions
- [x] `screens/ShareScreen.js` - Auto-store watermark on access grant
- [x] `App.js` - Navigation routes + Memory Manager

### Tests Passing
- [x] 53/53 tests passing (watermark, security, auth)

---

## 📋 What You Need To Do

### Step 1: Run Database Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy contents of: `supabase/migrations/010_document_watermark_hashes.sql`
3. Click **Run**
4. Verify output shows success

### Step 2: Deploy Edge Function

```bash
# In project root:
npx supabase functions deploy verify-watermark
```

Or deploy via Supabase Dashboard:
1. **Edge Functions** → `verify-watermark`
2. Click **Deploy**

### Step 3: Verify Deployment

Run the test script:
```bash
node scripts/test-forensic-system.js
```

Or test manually:
```bash
curl -X POST https://your-project.functions.supabase.co/verify-watermark \
  -H "Authorization: Bearer YOUR-ANON-KEY" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "test", "watermark_payload": "test"}'
```

Expected response:
```json
{
  "valid": false,
  "confidence": "none",
  "error": "watermark_not_found"
}
```

---

## 🔐 How the Forensic System Works

### 1. When You Share a Document

```
Owner shares document → Recipient gets access
    ↓
App creates watermark payload:
  doc_id|recipient_email|timestamp|device_hash|HMAC
    ↓
App stores SHA-256 hash in document_watermark_hashes table
    ↓
Recipient can view document
```

### 2. If a Leak Occurs

```
Leaked image found
    ↓
Extract watermark from image
    ↓
Call verify-watermark Edge Function
    ↓
Server verifies:
  ✓ Hash matches database
  ✓ Email normalized
  ✓ Owner identity found
  ✓ Timestamp reasonable
    ↓
Response: { valid: true, confidence: 'high', grantor_email: '...' }
    ↓
Cross-reference access_logs → Identify leaker
```

---

## 📁 File Locations

```
SecureShare/
├── supabase/
│   ├── migrations/
│   │   └── 010_document_watermark_hashes.sql  ← RUN THIS
│   └── functions/
│       └── verify-watermark/
│           └── index.ts                        ← DEPLOYED
├── lib/
│   └── supabase.js                            ← UPDATED
├── screens/
│   └── ShareScreen.js                         ← UPDATED
├── App.js                                     ← UPDATED
└── scripts/
    └── test-forensic-system.js                ← TEST SCRIPT
```

---

## ⚠️ Important Notes

1. **Lowercase emails**: All emails are normalized to lowercase in the database
2. **Permanent storage**: Watermark hashes are never deleted (audit trail)
3. **Owner-only access**: Only document owners can view/manage watermark hashes
4. **One active watermark**: Only one active watermark per (document, recipient)

---

## 🆘 Troubleshooting

### Edge Function returns 404
→ Function not deployed yet. Run `npx supabase functions deploy`

### RPC function not found
→ Migration not run yet. Run the SQL migration in Supabase Dashboard

### Permission denied
→ Using wrong API key. Use service role key for admin operations

### No rows returned
→ Watermark hash not stored yet. Share a document first
