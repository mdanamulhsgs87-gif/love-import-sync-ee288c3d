
-- 1. Add new setting for USDT to BDT conversion rate
INSERT INTO public.settings (key, value)
VALUES ('usdtToBdtRate', '124')
ON CONFLICT (key) DO NOTHING;

-- 2. Update referral trigger: award on RE-VERIFY (account completion) instead of 1st verify
CREATE OR REPLACE FUNCTION public.award_referral_on_first_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_diff integer;
  v_bonus numeric;
  v_bonus_text text;
BEGIN
  IF NEW.referred_by_user_id IS NULL THEN RETURN NEW; END IF;
  -- Track reverify_count diff instead of key_count
  v_diff := COALESCE(NEW.reverify_count, 0) - COALESCE(OLD.reverify_count, 0);
  IF v_diff <= 0 THEN RETURN NEW; END IF;

  SELECT value INTO v_bonus_text FROM public.settings WHERE key = 'referralBonusUsd' LIMIT 1;
  v_bonus := COALESCE(NULLIF(v_bonus_text, '')::numeric, 0.05);

  UPDATE public.users
  SET referral_usdt_earnings = COALESCE(referral_usdt_earnings, 0) + (v_diff * v_bonus)
  WHERE id = NEW.referred_by_user_id;

  RETURN NEW;
END;
$function$;

-- Drop old trigger if exists, attach new one
DROP TRIGGER IF EXISTS trg_award_referral ON public.users;
CREATE TRIGGER trg_award_referral
AFTER UPDATE OF reverify_count ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.award_referral_on_first_verify();

-- 3. Update recalculate function: BDT balance = reverify_count × usdtRate × usdtToBdtRate
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_rate integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usdt_rate numeric;
  v_bdt_rate numeric;
  v_per_account numeric;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::numeric, 0.05) INTO v_usdt_rate FROM public.settings WHERE key = 'usdtRatePerAccount' LIMIT 1;
  SELECT COALESCE(NULLIF(value,'')::numeric, 124) INTO v_bdt_rate FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;
  v_per_account := COALESCE(v_usdt_rate, 0.05) * COALESCE(v_bdt_rate, 124);

  UPDATE public.users u SET balance = GREATEST(0,
    FLOOR(COALESCE(u.reverify_count,0) * v_per_account)::integer
    - COALESCE((
      SELECT SUM(t.amount) FROM public.transactions t
      WHERE t.user_id = u.id AND t.type = 'withdrawal' AND t.status IN ('pending','completed')
    ), 0))
  WHERE u.id > 0;
END;
$function$;
