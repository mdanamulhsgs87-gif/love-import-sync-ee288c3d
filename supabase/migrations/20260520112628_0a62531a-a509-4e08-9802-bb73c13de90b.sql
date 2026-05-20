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
  v_new_balance integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 40)
  INTO v_reward_rate
  FROM public.settings
  WHERE key = 'rewardRate'
  LIMIT 1;

  SELECT COALESCE(NULLIF(value, '')::numeric, 124)
  INTO v_usdt_to_bdt
  FROM public.settings
  WHERE key = 'usdtToBdtRate'
  LIMIT 1;

  SELECT
    COALESCE(reverify_count, 0),
    COALESCE(usdt_paid_count, 0),
    COALESCE(referral_usdt_earnings, 0)
  INTO v_reverify_count, v_usdt_paid_count, v_referral_usdt
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_active_bdt_spend
  FROM public.transactions
  WHERE user_id = p_user_id
    AND type IN ('withdrawal', 'recharge')
    AND status IN ('pending', 'processing', 'completed');

  v_new_balance := GREATEST(
    0,
    FLOOR(
      (GREATEST(0, v_reverify_count - v_usdt_paid_count) * v_reward_rate)
      + (v_referral_usdt * v_usdt_to_bdt)
      - v_active_bdt_spend
    )::integer
  );

  UPDATE public.users
  SET balance = v_new_balance
  WHERE id = p_user_id;

  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_rate integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user record;
BEGIN
  IF p_rate IS NOT NULL AND p_rate > 0 THEN
    INSERT INTO public.settings (key, value)
    VALUES ('rewardRate', p_rate::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  FOR v_user IN SELECT id FROM public.users LOOP
    PERFORM public.sync_user_shared_balance(v_user.id);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_shared_balance_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_user_shared_balance(OLD.user_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_user_shared_balance(NEW.user_id);

  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.sync_user_shared_balance(OLD.user_id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_shared_balance_transactions ON public.transactions;
CREATE TRIGGER sync_shared_balance_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_shared_balance_after_transaction();

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
    OLD.referral_usdt_earnings IS DISTINCT FROM NEW.referral_usdt_earnings
  ) THEN
    PERFORM public.sync_user_shared_balance(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_shared_balance_users ON public.users;
CREATE TRIGGER sync_shared_balance_users
AFTER UPDATE OF reverify_count, usdt_paid_count, referral_usdt_earnings ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_shared_balance_after_user_wallet_change();

SELECT public.recalculate_all_balances(NULL);