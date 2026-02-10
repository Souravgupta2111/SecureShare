-- Migration: 003b_add_watermark_signature.sql
-- Purpose: Add watermark_signature column to documents table for HMAC verification

-- Add watermark_signature column for storing the HMAC signature
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS watermark_signature TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.documents.watermark_signature IS 
  'HMAC-SHA256 signature of watermark payload for tamper detection';
