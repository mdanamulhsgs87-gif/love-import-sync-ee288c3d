ALTER TABLE public.verification_pool
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS face_photo_url text,
  ADD COLUMN IF NOT EXISTS face_label text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS failed_reason text,
  ADD COLUMN IF NOT EXISTS failed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_verification_pool_status_created_at
  ON public.verification_pool (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_pool_wallet_address
  ON public.verification_pool (wallet_address);