
-- Update recalculate_all_balances to use rewardRate (BDT direct) as the source of truth
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_rate integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reward_rate integer;
BEGIN
  -- Prefer the explicit p_rate (admin just typed it), else read rewardRate setting, else 0
  IF p_rate IS NOT NULL AND p_rate > 0 THEN
    v_reward_rate := p_rate;
  ELSE
    SELECT COALESCE(NULLIF(value,'')::int, 0) INTO v_reward_rate FROM public.settings WHERE key = 'rewardRate' LIMIT 1;
    v_reward_rate := COALESCE(v_reward_rate, 0);
  END IF;

  UPDATE public.users u SET balance = GREATEST(0,
    (COALESCE(u.reverify_count,0) * v_reward_rate)
    - COALESCE((
      SELECT SUM(t.amount) FROM public.transactions t
      WHERE t.user_id = u.id AND t.type = 'withdrawal' AND t.status IN ('pending','completed')
    ), 0))
  WHERE u.id > 0;
END;
$function$;
