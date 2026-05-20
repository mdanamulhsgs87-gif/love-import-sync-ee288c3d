CREATE OR REPLACE FUNCTION public.get_user_shared_balance_before_spend(
  p_user_id integer,
  p_exclude_tx_id integer DEFAULT NULL
)
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

  SELECT COALESCE(reverify_count, 0), COALESCE(usdt_paid_count, 0), COALESCE(referral_usdt_earnings, 0)
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
    AND status IN ('pending', 'processing', 'completed')
    AND (p_exclude_tx_id IS NULL OR id <> p_exclude_tx_id);

  RETURN GREATEST(
    0,
    FLOOR(
      (GREATEST(0, v_reverify_count - v_usdt_paid_count) * v_reward_rate)
      + (v_referral_usdt * v_usdt_to_bdt)
      - v_active_bdt_spend
    )::integer
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_shared_balance_overspend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer := 0;
  v_exclude_id integer := NULL;
BEGIN
  IF NEW.type IN ('withdrawal', 'recharge')
     AND COALESCE(NEW.status, 'completed') IN ('pending', 'processing', 'completed') THEN
    IF TG_OP = 'UPDATE' THEN
      v_exclude_id := OLD.id;
    END IF;

    v_available := public.get_user_shared_balance_before_spend(NEW.user_id, v_exclude_id);

    IF COALESCE(NEW.amount, 0) > v_available THEN
      RAISE EXCEPTION 'Insufficient shared balance. Available %, requested %', v_available, COALESCE(NEW.amount, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_shared_balance_overspend_transactions ON public.transactions;
CREATE TRIGGER prevent_shared_balance_overspend_transactions
BEFORE INSERT OR UPDATE OF user_id, type, amount, status ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_shared_balance_overspend();

SELECT public.recalculate_all_balances(NULL);