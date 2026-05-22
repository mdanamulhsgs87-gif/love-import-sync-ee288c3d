
CREATE OR REPLACE FUNCTION public.sync_user_shared_balance(p_user_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reward_rate numeric := 40;
  v_usdt_to_bdt numeric := 124;
  v_bonus_status text := 'off';
  v_reverify_count integer := 0;
  v_usdt_paid_count integer := 0;
  v_referral_usdt numeric := 0;
  v_promo_user_bdt integer := 0;
  v_promo_owner_usdt numeric := 0;
  v_active_bdt_spend numeric := 0;
  v_spendable integer := 0;
  v_bdt_accounts_used integer := 0;
  v_remaining_accounts integer := 0;
  v_bonus_pct integer := 0;
  v_bonus_bdt numeric := 0;
  v_new_balance integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 40) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 124) INTO v_usdt_to_bdt FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;
  SELECT COALESCE(value, 'off') INTO v_bonus_status FROM public.settings WHERE key = 'bonusStatus' LIMIT 1;

  SELECT COALESCE(reverify_count, 0), COALESCE(usdt_paid_count, 0), COALESCE(referral_usdt_earnings, 0),
         COALESCE(promo_user_bonus_bdt, 0), COALESCE(promo_owner_usdt_earnings, 0)
  INTO v_reverify_count, v_usdt_paid_count, v_referral_usdt, v_promo_user_bdt, v_promo_owner_usdt
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_bdt_spend
  FROM public.transactions
  WHERE user_id = p_user_id
    AND type IN ('withdrawal', 'recharge')
    AND status IN ('pending', 'processing', 'completed');

  v_spendable := GREATEST(0, v_reverify_count - v_usdt_paid_count);

  IF v_reward_rate > 0 THEN
    v_bdt_accounts_used := FLOOR(v_active_bdt_spend / v_reward_rate)::integer;
  END IF;
  v_remaining_accounts := GREATEST(0, v_spendable - v_bdt_accounts_used);

  IF v_bonus_status = 'on' THEN
    IF v_remaining_accounts >= 20 THEN v_bonus_pct := 20;
    ELSIF v_remaining_accounts >= 10 THEN v_bonus_pct := 10;
    END IF;
    v_bonus_bdt := FLOOR(v_remaining_accounts * v_reward_rate * v_bonus_pct / 100.0);
  END IF;

  v_new_balance := GREATEST(0, FLOOR(
    (v_spendable * v_reward_rate)
    + v_bonus_bdt
    + (v_referral_usdt * v_usdt_to_bdt)
    + v_promo_user_bdt
    + (v_promo_owner_usdt * v_usdt_to_bdt)
    - v_active_bdt_spend
  )::integer);

  UPDATE public.users SET balance = v_new_balance WHERE id = p_user_id;
  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_shared_balance_before_spend(p_user_id integer, p_exclude_tx_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reward_rate numeric := 40;
  v_usdt_to_bdt numeric := 124;
  v_bonus_status text := 'off';
  v_reverify_count integer := 0;
  v_usdt_paid_count integer := 0;
  v_referral_usdt numeric := 0;
  v_promo_user_bdt integer := 0;
  v_promo_owner_usdt numeric := 0;
  v_active_bdt_spend numeric := 0;
  v_spendable integer := 0;
  v_bdt_accounts_used integer := 0;
  v_remaining_accounts integer := 0;
  v_bonus_pct integer := 0;
  v_bonus_bdt numeric := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 40) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 124) INTO v_usdt_to_bdt FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;
  SELECT COALESCE(value, 'off') INTO v_bonus_status FROM public.settings WHERE key = 'bonusStatus' LIMIT 1;

  SELECT COALESCE(reverify_count, 0), COALESCE(usdt_paid_count, 0), COALESCE(referral_usdt_earnings, 0),
         COALESCE(promo_user_bonus_bdt, 0), COALESCE(promo_owner_usdt_earnings, 0)
  INTO v_reverify_count, v_usdt_paid_count, v_referral_usdt, v_promo_user_bdt, v_promo_owner_usdt
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_bdt_spend
  FROM public.transactions
  WHERE user_id = p_user_id
    AND type IN ('withdrawal', 'recharge')
    AND status IN ('pending', 'processing', 'completed')
    AND (p_exclude_tx_id IS NULL OR id <> p_exclude_tx_id);

  v_spendable := GREATEST(0, v_reverify_count - v_usdt_paid_count);

  IF v_reward_rate > 0 THEN
    v_bdt_accounts_used := FLOOR(v_active_bdt_spend / v_reward_rate)::integer;
  END IF;
  v_remaining_accounts := GREATEST(0, v_spendable - v_bdt_accounts_used);

  IF v_bonus_status = 'on' THEN
    IF v_remaining_accounts >= 20 THEN v_bonus_pct := 20;
    ELSIF v_remaining_accounts >= 10 THEN v_bonus_pct := 10;
    END IF;
    v_bonus_bdt := FLOOR(v_remaining_accounts * v_reward_rate * v_bonus_pct / 100.0);
  END IF;

  RETURN GREATEST(0, FLOOR(
    (v_spendable * v_reward_rate)
    + v_bonus_bdt
    + (v_referral_usdt * v_usdt_to_bdt)
    + v_promo_user_bdt
    + (v_promo_owner_usdt * v_usdt_to_bdt)
    - v_active_bdt_spend
  )::integer);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_shared_balance_after_user_wallet_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.reverify_count IS DISTINCT FROM NEW.reverify_count OR
    OLD.usdt_paid_count IS DISTINCT FROM NEW.usdt_paid_count OR
    OLD.referral_usdt_earnings IS DISTINCT FROM NEW.referral_usdt_earnings OR
    OLD.promo_user_bonus_bdt IS DISTINCT FROM NEW.promo_user_bonus_bdt OR
    OLD.promo_owner_usdt_earnings IS DISTINCT FROM NEW.promo_owner_usdt_earnings
  ) THEN
    PERFORM public.sync_user_shared_balance(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
