
-- API Keys table
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  branding_text text NOT NULL DEFAULT 'Sponsored by Good-App',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to api_keys" ON public.api_keys
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- API Key Features table
CREATE TABLE public.api_key_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE(api_key_id, feature_name)
);

ALTER TABLE public.api_key_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to api_key_features" ON public.api_key_features
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
