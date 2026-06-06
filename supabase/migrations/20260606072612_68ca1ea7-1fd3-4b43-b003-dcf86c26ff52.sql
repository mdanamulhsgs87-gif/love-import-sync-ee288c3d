
INSERT INTO public.settings (key, value)
SELECT 'promoUserBonusBdt', '2' WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key='promoUserBonusBdt');
INSERT INTO public.settings (key, value)
SELECT 'promoOwnerCommissionUsdt', '0.0157' WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key='promoOwnerCommissionUsdt');

CREATE OR REPLACE FUNCTION public.award_promo_on_reverify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_diff integer;
  v_user_bdt numeric := 2;
  v_owner_usdt numeric := 0.0157;
  v_user_bonus_bdt integer;
  v_owner_commission_usdt numeric;
BEGIN
  v_diff := COALESCE(NEW.reverify_count, 0) - COALESCE(OLD.reverify_count, 0);
  IF v_diff <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 2) INTO v_user_bdt FROM public.settings WHERE key = 'promoUserBonusBdt' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 0.0157) INTO v_owner_usdt FROM public.settings WHERE key = 'promoOwnerCommissionUsdt' LIMIT 1;

  IF NEW.promo_code_used IS NOT NULL AND NEW.promo_code_used <> '' THEN
    v_user_bonus_bdt := FLOOR(v_diff * v_user_bdt);
    IF v_user_bonus_bdt > 0 THEN
      NEW.promo_user_bonus_bdt := COALESCE(NEW.promo_user_bonus_bdt, 0) + v_user_bonus_bdt;
    END IF;
  END IF;

  IF NEW.promo_owner_user_id IS NOT NULL THEN
    v_owner_commission_usdt := v_diff * v_owner_usdt;
    IF v_owner_commission_usdt > 0 THEN
      UPDATE public.users
        SET promo_owner_usdt_earnings = COALESCE(promo_owner_usdt_earnings, 0) + v_owner_commission_usdt
        WHERE id = NEW.promo_owner_user_id AND COALESCE(is_blocked, false) = false;

      UPDATE public.promo_codes
        SET total_earned_usdt = COALESCE(total_earned_usdt, 0) + v_owner_commission_usdt
        WHERE upper(code) = upper(NEW.promo_code_used) AND is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
