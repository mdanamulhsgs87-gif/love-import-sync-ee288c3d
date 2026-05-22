
CREATE OR REPLACE FUNCTION public.award_promo_on_reverify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_diff integer;
  v_reward_rate numeric := 40;
  v_usdt_to_bdt numeric := 124;
  v_user_pct numeric := 5;
  v_owner_pct numeric := 5;
  v_user_bonus_bdt integer;
  v_owner_commission_usdt numeric;
BEGIN
  v_diff := COALESCE(NEW.reverify_count, 0) - COALESCE(OLD.reverify_count, 0);
  IF v_diff <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 40) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 124) INTO v_usdt_to_bdt FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 5) INTO v_user_pct FROM public.settings WHERE key = 'promoUserBonusPct' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 5) INTO v_owner_pct FROM public.settings WHERE key = 'promoOwnerCommissionPct' LIMIT 1;

  IF NEW.promo_code_used IS NOT NULL AND NEW.promo_code_used <> '' THEN
    v_user_bonus_bdt := FLOOR(v_diff * v_reward_rate * v_user_pct / 100.0);
    IF v_user_bonus_bdt > 0 THEN
      NEW.promo_user_bonus_bdt := COALESCE(NEW.promo_user_bonus_bdt, 0) + v_user_bonus_bdt;
    END IF;
  END IF;

  IF NEW.promo_owner_user_id IS NOT NULL THEN
    v_owner_commission_usdt := (v_diff * v_reward_rate * v_owner_pct / 100.0) / NULLIF(v_usdt_to_bdt, 0);
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

DROP TRIGGER IF EXISTS trg_award_promo_on_reverify ON public.users;
CREATE TRIGGER trg_award_promo_on_reverify
BEFORE UPDATE OF reverify_count ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.award_promo_on_reverify();
