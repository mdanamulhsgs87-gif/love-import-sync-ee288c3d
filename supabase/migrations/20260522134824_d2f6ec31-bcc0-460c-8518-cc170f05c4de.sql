
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  owner_user_id integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  total_uses integer NOT NULL DEFAULT 0,
  total_earned_usdt numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access pc" ON public.promo_codes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_promo_codes_owner ON public.promo_codes(owner_user_id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS promo_code_used text,
  ADD COLUMN IF NOT EXISTS promo_owner_user_id integer,
  ADD COLUMN IF NOT EXISTS promo_user_bonus_bdt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_owner_usdt_earnings numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_promo_owner ON public.users(promo_owner_user_id);

INSERT INTO public.settings (key, value)
SELECT 'promoUserBonusPct', '5' WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key='promoUserBonusPct');
INSERT INTO public.settings (key, value)
SELECT 'promoOwnerCommissionPct', '5' WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key='promoOwnerCommissionPct');
