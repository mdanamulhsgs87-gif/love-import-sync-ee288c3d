
CREATE OR REPLACE FUNCTION public.reset_all_verified_counts(p_admin_name text DEFAULT 'Admin')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Save all users with key_count > 0 to reset_history
  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by, payment_number, payment_method)
  SELECT guest_id, key_count, COALESCE(NULLIF(p_admin_name, ''), 'Admin') || ' (Global Reset)', NULL, NULL
  FROM public.users
  WHERE key_count > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reset all users' key_count to 0
  UPDATE public.users SET key_count = 0 WHERE key_count > 0;

  RETURN COALESCE(v_count, 0);
END;
$$;
