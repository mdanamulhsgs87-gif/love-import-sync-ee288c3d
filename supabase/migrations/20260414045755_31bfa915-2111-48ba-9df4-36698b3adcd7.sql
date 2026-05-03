
DROP FUNCTION IF EXISTS public.reset_all_verified_counts(text);

CREATE OR REPLACE FUNCTION public.reset_all_verified_counts(p_admin_name text DEFAULT 'Admin'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_batch_id uuid;
BEGIN
  v_batch_id := gen_random_uuid();

  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by, payment_number, payment_method, reset_batch_id)
  SELECT guest_id, key_count, COALESCE(NULLIF(p_admin_name, ''), 'Admin') || ' (Global Reset)', NULL, NULL, v_batch_id
  FROM public.users
  WHERE key_count > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.users SET key_count = 0 WHERE key_count > 0;

  RETURN v_batch_id::text || ':' || COALESCE(v_count, 0)::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.undo_last_verified_reset(p_batch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT phone_number, verified_count
    FROM public.reset_history
    WHERE reset_batch_id = p_batch_id
  LOOP
    UPDATE public.users
    SET key_count = key_count + v_row.verified_count
    WHERE guest_id = v_row.phone_number;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.reset_history WHERE reset_batch_id = p_batch_id;

  RETURN v_count;
END;
$function$;
