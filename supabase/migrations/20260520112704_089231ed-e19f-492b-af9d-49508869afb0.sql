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
    UPDATE public.settings SET value = p_rate::text WHERE key = 'rewardRate';
    IF NOT FOUND THEN
      INSERT INTO public.settings (key, value) VALUES ('rewardRate', p_rate::text);
    END IF;
  END IF;

  FOR v_user IN SELECT id FROM public.users LOOP
    PERFORM public.sync_user_shared_balance(v_user.id);
  END LOOP;
END;
$function$;