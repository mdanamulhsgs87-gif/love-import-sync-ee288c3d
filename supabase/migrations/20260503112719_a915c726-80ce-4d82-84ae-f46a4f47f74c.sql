
-- Auto-create public.users row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_display_name text;
BEGIN
  v_phone := COALESCE(
    NEW.raw_user_meta_data->>'phone',
    split_part(NEW.email, '@', 1)
  );
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', v_phone);

  INSERT INTO public.users (auth_id, email, guest_id, display_name)
  VALUES (NEW.id, NEW.email, v_phone, v_display_name)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill the missing user(s)
INSERT INTO public.users (auth_id, email, guest_id, display_name)
SELECT au.id, au.email,
       COALESCE(au.raw_user_meta_data->>'phone', split_part(au.email,'@',1)),
       COALESCE(au.raw_user_meta_data->>'display_name', au.raw_user_meta_data->>'phone', split_part(au.email,'@',1))
FROM auth.users au
LEFT JOIN public.users pu ON pu.auth_id = au.id
WHERE pu.id IS NULL;
