
-- 1. Add referral columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by_user_id integer,
  ADD COLUMN IF NOT EXISTS referral_usdt_earnings numeric(14,6) NOT NULL DEFAULT 0;

-- 2. Backfill referral_code for existing users (uppercase guest_id last 6 + random)
UPDATE public.users
SET referral_code = upper(substr(md5(id::text || guest_id || random()::text), 1, 8))
WHERE referral_code IS NULL;

-- 3. Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON public.users (referral_code);

-- 4. Default referral_code generator for new rows (trigger-based for collision safety)
CREATE OR REPLACE FUNCTION public.gen_user_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text; v_tries int := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL AND length(NEW.referral_code) > 0 THEN
    RETURN NEW;
  END IF;
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = v_code) THEN
      NEW.referral_code := v_code;
      RETURN NEW;
    END IF;
    v_tries := v_tries + 1;
    IF v_tries > 10 THEN
      NEW.referral_code := upper(substr(md5(NEW.guest_id || random()::text), 1, 10));
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS users_gen_referral_code ON public.users;
CREATE TRIGGER users_gen_referral_code
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.gen_user_referral_code();

-- 5. Update handle_new_auth_user to capture referral_code from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_display_name text;
  v_ref_code text;
  v_referrer_id integer;
BEGIN
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', split_part(NEW.email, '@', 1));
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', v_phone);
  v_ref_code := upper(trim(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));

  IF v_ref_code <> '' THEN
    SELECT id INTO v_referrer_id FROM public.users WHERE referral_code = v_ref_code LIMIT 1;
  END IF;

  INSERT INTO public.users (auth_id, email, guest_id, display_name, referred_by_user_id)
  VALUES (NEW.id, NEW.email, v_phone, v_display_name, v_referrer_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 6. Reward referrer on first-verify (key_count increment)
CREATE OR REPLACE FUNCTION public.award_referral_on_first_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diff integer;
  v_bonus numeric;
  v_bonus_text text;
BEGIN
  IF NEW.referred_by_user_id IS NULL THEN RETURN NEW; END IF;
  v_diff := COALESCE(NEW.key_count, 0) - COALESCE(OLD.key_count, 0);
  IF v_diff <= 0 THEN RETURN NEW; END IF;

  SELECT value INTO v_bonus_text FROM public.settings WHERE key = 'referralBonusUsd' LIMIT 1;
  v_bonus := COALESCE(NULLIF(v_bonus_text, '')::numeric, 0.05);

  UPDATE public.users
  SET referral_usdt_earnings = COALESCE(referral_usdt_earnings, 0) + (v_diff * v_bonus)
  WHERE id = NEW.referred_by_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_award_referral ON public.users;
CREATE TRIGGER users_award_referral
AFTER UPDATE OF key_count ON public.users
FOR EACH ROW
WHEN (NEW.key_count IS DISTINCT FROM OLD.key_count)
EXECUTE FUNCTION public.award_referral_on_first_verify();

-- 7. Settings row for bonus amount
INSERT INTO public.settings (key, value) VALUES ('referralBonusUsd', '0.05')
ON CONFLICT DO NOTHING;
