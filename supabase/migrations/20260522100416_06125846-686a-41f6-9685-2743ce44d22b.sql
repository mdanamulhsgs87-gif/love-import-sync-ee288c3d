-- Update balance sync to include 10-account milestone bonus (+10 TK per account, awarded per full group of 10 spendable accounts)
CREATE OR REPLACE FUNCTION public.sync_user_shared_balance(p_user_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reward_rate numeric := 40;
  v_usdt_to_bdt numeric := 124;
  v_reverify_count integer := 0;
  v_usdt_paid_count integer := 0;
  v_referral_usdt numeric := 0;
  v_active_bdt_spend numeric := 0;
  v_spendable integer := 0;
  v_bonus_groups integer := 0;
  v_bonus_bdt numeric := 0;
  v_new_balance integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 40) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 124) INTO v_usdt_to_bdt FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;

  SELECT COALESCE(reverify_count, 0), COALESCE(usdt_paid_count, 0), COALESCE(referral_usdt_earnings, 0)
  INTO v_reverify_count, v_usdt_paid_count, v_referral_usdt
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_bdt_spend
  FROM public.transactions
  WHERE user_id = p_user_id
    AND type IN ('withdrawal', 'recharge')
    AND status IN ('pending', 'processing', 'completed');

  v_spendable := GREATEST(0, v_reverify_count - v_usdt_paid_count);
  v_bonus_groups := v_spendable / 10;
  v_bonus_bdt := v_bonus_groups * 10 * 10; -- 10 accounts × 10 TK each = 100 TK per group

  v_new_balance := GREATEST(0, FLOOR(
    (v_spendable * v_reward_rate)
    + v_bonus_bdt
    + (v_referral_usdt * v_usdt_to_bdt)
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
  v_reverify_count integer := 0;
  v_usdt_paid_count integer := 0;
  v_referral_usdt numeric := 0;
  v_active_bdt_spend numeric := 0;
  v_spendable integer := 0;
  v_bonus_groups integer := 0;
  v_bonus_bdt numeric := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 40) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
  SELECT COALESCE(NULLIF(value, '')::numeric, 124) INTO v_usdt_to_bdt FROM public.settings WHERE key = 'usdtToBdtRate' LIMIT 1;

  SELECT COALESCE(reverify_count, 0), COALESCE(usdt_paid_count, 0), COALESCE(referral_usdt_earnings, 0)
  INTO v_reverify_count, v_usdt_paid_count, v_referral_usdt
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_bdt_spend
  FROM public.transactions
  WHERE user_id = p_user_id
    AND type IN ('withdrawal', 'recharge')
    AND status IN ('pending', 'processing', 'completed')
    AND (p_exclude_tx_id IS NULL OR id <> p_exclude_tx_id);

  v_spendable := GREATEST(0, v_reverify_count - v_usdt_paid_count);
  v_bonus_groups := v_spendable / 10;
  v_bonus_bdt := v_bonus_groups * 10 * 10;

  RETURN GREATEST(0, FLOOR(
    (v_spendable * v_reward_rate)
    + v_bonus_bdt
    + (v_referral_usdt * v_usdt_to_bdt)
    - v_active_bdt_spend
  )::integer);
END;
$function$;

-- Trigger: when reverify_count crosses a multiple of 10, insert a bonus transaction record for history
CREATE OR REPLACE FUNCTION public.record_reverify_bonus_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_groups integer;
  v_new_groups integer;
  v_g integer;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.reverify_count,0) > COALESCE(OLD.reverify_count,0) THEN
    v_old_groups := COALESCE(OLD.reverify_count,0) / 10;
    v_new_groups := COALESCE(NEW.reverify_count,0) / 10;
    IF v_new_groups > v_old_groups THEN
      FOR v_g IN (v_old_groups + 1)..v_new_groups LOOP
        INSERT INTO public.transactions (user_id, type, amount, status, details)
        VALUES (NEW.id, 'bonus', 100, 'completed',
          '🎁 ১০ Account Re-verify Bonus (Milestone #' || v_g || ') — প্রতি account এ +১০৳');
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reverify_bonus_milestone ON public.users;
CREATE TRIGGER trg_reverify_bonus_milestone
AFTER UPDATE OF reverify_count ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.record_reverify_bonus_milestone();

-- Backfill: record bonus milestones for users who already passed them (one row per missed milestone)
DO $$
DECLARE
  u record;
  v_existing integer;
  v_groups integer;
  v_g integer;
BEGIN
  FOR u IN SELECT id, reverify_count FROM public.users WHERE reverify_count >= 10 LOOP
    v_groups := u.reverify_count / 10;
    SELECT COUNT(*) INTO v_existing FROM public.transactions WHERE user_id = u.id AND type = 'bonus';
    IF v_existing < v_groups THEN
      FOR v_g IN (v_existing + 1)..v_groups LOOP
        INSERT INTO public.transactions (user_id, type, amount, status, details)
        VALUES (u.id, 'bonus', 100, 'completed',
          '🎁 ১০ Account Re-verify Bonus (Milestone #' || v_g || ') — প্রতি account এ +১০৳');
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Refresh all balances to include bonus
DO $$
DECLARE u_id integer;
BEGIN
  FOR u_id IN SELECT id FROM public.users LOOP
    PERFORM public.sync_user_shared_balance(u_id);
  END LOOP;
END $$;