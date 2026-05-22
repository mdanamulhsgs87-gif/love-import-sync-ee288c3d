
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_display_name text;
  v_ref_code text;
  v_referrer_id integer;
  v_promo_code text;
  v_promo_owner_id integer;
  v_new_user_id integer;
BEGIN
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', split_part(NEW.email, '@', 1));
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', v_phone);
  v_ref_code := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
  v_promo_code := upper(trim(COALESCE(NEW.raw_user_meta_data->>'promo_code', '')));

  IF v_ref_code <> '' THEN
    SELECT id INTO v_referrer_id FROM public.users WHERE referral_code = v_ref_code LIMIT 1;
  END IF;

  IF v_promo_code <> '' THEN
    SELECT owner_user_id INTO v_promo_owner_id
    FROM public.promo_codes
    WHERE upper(code) = v_promo_code AND is_active = true
    LIMIT 1;
    IF v_promo_owner_id IS NULL THEN
      v_promo_code := NULL; -- invalid → ignore
    END IF;
  ELSE
    v_promo_code := NULL;
  END IF;

  INSERT INTO public.users (auth_id, email, guest_id, display_name, referred_by_user_id, promo_code_used, promo_owner_user_id)
  VALUES (NEW.id, NEW.email, v_phone, v_display_name, v_referrer_id, v_promo_code, v_promo_owner_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_user_id;

  IF v_promo_code IS NOT NULL AND v_new_user_id IS NOT NULL THEN
    UPDATE public.promo_codes
      SET total_uses = COALESCE(total_uses, 0) + 1
      WHERE upper(code) = v_promo_code;
  END IF;

  RETURN NEW;
END;
$function$;
