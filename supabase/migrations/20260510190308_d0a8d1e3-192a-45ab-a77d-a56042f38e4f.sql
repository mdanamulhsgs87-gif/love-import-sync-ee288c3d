ALTER TABLE public.users ADD COLUMN IF NOT EXISTS usdt_paid_count integer NOT NULL DEFAULT 0;

INSERT INTO public.settings (key, value) VALUES
  ('usdtPayoutEnabled', 'off'),
  ('usdtRatePerAccount', '0.05'),
  ('usdtMinWithdraw', '0.5'),
  ('usdtFeePercent', '2'),
  ('usdtWalletAddress', '')
ON CONFLICT DO NOTHING;