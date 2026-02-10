-- Add public_key to profiles for Zero-Trust sharing
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Index for looking up recipients' keys
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
