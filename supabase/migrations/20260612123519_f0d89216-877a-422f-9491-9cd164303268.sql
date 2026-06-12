ALTER TABLE public.face_wallet_bindings ADD COLUMN IF NOT EXISTS face_label text;
CREATE INDEX IF NOT EXISTS idx_face_wallet_bindings_label_user ON public.face_wallet_bindings (user_id, face_label);