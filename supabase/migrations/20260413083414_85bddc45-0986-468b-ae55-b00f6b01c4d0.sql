
-- Face-wallet bindings table
CREATE TABLE public.face_wallet_bindings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  private_key text NOT NULL,
  face_photo_url text NOT NULL,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_face_wallet_user ON public.face_wallet_bindings(user_id);
CREATE INDEX idx_face_wallet_address ON public.face_wallet_bindings(wallet_address);

ALTER TABLE public.face_wallet_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to face_wallet_bindings"
  ON public.face_wallet_bindings FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Re-verify queue table
CREATE TABLE public.reverify_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  private_key text NOT NULL,
  face_photo_url text NOT NULL,
  binding_id uuid REFERENCES public.face_wallet_bindings(id) ON DELETE SET NULL,
  assigned_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_reverify_user ON public.reverify_queue(assigned_user_id);
CREATE INDEX idx_reverify_status ON public.reverify_queue(status);

ALTER TABLE public.reverify_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to reverify_queue"
  ON public.reverify_queue FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Add reverify_count to users
ALTER TABLE public.users ADD COLUMN reverify_count integer NOT NULL DEFAULT 0;

-- Create face-photos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('face-photos', 'face-photos', true);

CREATE POLICY "Public read face photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'face-photos');

CREATE POLICY "Anyone can upload face photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'face-photos');

CREATE POLICY "Anyone can delete face photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'face-photos');
