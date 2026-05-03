
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reverify_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS watched_video_url text;
ALTER TABLE public.reset_history ADD COLUMN IF NOT EXISTS reset_batch_id uuid;

CREATE TABLE IF NOT EXISTS public.face_wallet_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  private_key text NOT NULL,
  face_photo_url text NOT NULL,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.face_wallet_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access fwb" ON public.face_wallet_bindings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.reverify_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  private_key text NOT NULL,
  face_photo_url text NOT NULL,
  binding_id uuid REFERENCES public.face_wallet_bindings(id) ON DELETE SET NULL,
  assigned_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reverify_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access rq" ON public.reverify_queue FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  branding_text text NOT NULL DEFAULT 'Sponsored by Good-App',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access ak" ON public.api_keys FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.api_key_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE(api_key_id, feature_name)
);
ALTER TABLE public.api_key_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access akf" ON public.api_key_features FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('face-photos', 'face-photos', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Public face-photos read" ON storage.objects FOR SELECT USING (bucket_id = 'face-photos');
CREATE POLICY "Public face-photos write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "Public face-photos delete" ON storage.objects FOR DELETE USING (bucket_id = 'face-photos');

-- RPC Functions
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_rate integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users u SET balance = GREATEST(0,
    ((u.key_count + COALESCE(u.reverify_count,0)) * p_rate) - COALESCE((
      SELECT SUM(t.amount) FROM public.transactions t
      WHERE t.user_id = u.id AND t.type = 'withdrawal' AND t.status IN ('pending','completed')
    ), 0))
  WHERE u.id > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.reset_all_verified_counts(p_admin_name text DEFAULT 'Admin')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer; v_batch_id uuid;
BEGIN
  v_batch_id := gen_random_uuid();
  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by, reset_batch_id)
  SELECT guest_id, key_count, COALESCE(NULLIF(p_admin_name,''),'Admin') || ' (Global Reset)', v_batch_id
  FROM public.users WHERE key_count > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.users SET key_count = 0 WHERE key_count > 0;
  RETURN v_batch_id::text || ':' || COALESCE(v_count,0)::text;
END; $$;

CREATE OR REPLACE FUNCTION public.undo_last_verified_reset(p_batch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; v_row record;
BEGIN
  FOR v_row IN SELECT phone_number, verified_count FROM public.reset_history WHERE reset_batch_id = p_batch_id LOOP
    UPDATE public.users SET key_count = key_count + v_row.verified_count WHERE guest_id = v_row.phone_number;
    v_count := v_count + 1;
  END LOOP;
  DELETE FROM public.reset_history WHERE reset_batch_id = p_batch_id;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.reset_all_reverify_counts(p_admin_name text DEFAULT 'Admin')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by)
  SELECT guest_id, reverify_count, COALESCE(NULLIF(p_admin_name,''),'Admin') || ' (Reverify Reset)'
  FROM public.users WHERE reverify_count > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.users SET reverify_count = 0 WHERE reverify_count > 0;
  RETURN COALESCE(v_count,0);
END; $$;

CREATE OR REPLACE FUNCTION public.get_user_bindings_count(p_user_id integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(COUNT(*)::integer, 0) FROM public.face_wallet_bindings WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_request_submission_count(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_batch_id IS NULL THEN RETURN; END IF;
  UPDATE public.user_request_submissions s SET request_count = COALESCE((
    SELECT COUNT(*)::int FROM public.user_transfer_requests r
    WHERE r.submitted_batch_id = s.id AND r.status = 'submitted'), 0)
  WHERE s.id = p_batch_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_user_request_batch(
  p_target_guest_id text, p_submitter_name text, p_password text,
  p_submitter_payment_number text DEFAULT NULL, p_submitter_payment_method text DEFAULT NULL,
  p_submitter_rate integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch_id uuid; v_target_user public.users%ROWTYPE; v_request_count integer; v_stored_password text;
BEGIN
  SELECT value INTO v_stored_password FROM public.settings WHERE key = 'requestSubmitPassword' LIMIT 1;
  IF v_stored_password IS NULL THEN v_stored_password := 'Anamul-341321'; END IF;
  IF COALESCE(p_password,'') <> v_stored_password THEN RAISE EXCEPTION 'Invalid password'; END IF;
  SELECT * INTO v_target_user FROM public.users WHERE guest_id = p_target_guest_id LIMIT 1;
  IF v_target_user.id IS NULL THEN RAISE EXCEPTION 'Target user not found'; END IF;
  INSERT INTO public.user_request_submissions (target_user_id, target_guest_id, target_display_name, target_verified_count, submitted_to_admin_by, request_count, submitter_payment_number, submitter_payment_method, submitter_rate)
  VALUES (v_target_user.id, p_target_guest_id, v_target_user.display_name, COALESCE(v_target_user.key_count,0), COALESCE(NULLIF(p_submitter_name,''),'Unknown'), 0, NULLIF(p_submitter_payment_number,''), NULLIF(p_submitter_payment_method,''), COALESCE(p_submitter_rate,0))
  RETURNING id INTO v_batch_id;
  UPDATE public.user_transfer_requests SET status='submitted', submitted_batch_id=v_batch_id, submitted_at=now(), target_user_id=v_target_user.id
  WHERE target_guest_id = p_target_guest_id AND status = 'pending';
  GET DIAGNOSTICS v_request_count = ROW_COUNT;
  IF v_request_count = 0 THEN DELETE FROM public.user_request_submissions WHERE id = v_batch_id; RAISE EXCEPTION 'No pending requests found'; END IF;
  UPDATE public.user_request_submissions SET request_count = v_request_count WHERE id = v_batch_id;
  INSERT INTO public.submitted_numbers (phone_number, verified_count, submitted_by)
  SELECT requester_guest_id, requester_verified_count, CONCAT('Request→', p_target_guest_id)
  FROM public.user_transfer_requests WHERE submitted_batch_id = v_batch_id AND status = 'submitted';
  RETURN v_batch_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reset_transfer_request(p_request_id bigint, p_admin_name text DEFAULT 'Admin')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.user_transfer_requests%ROWTYPE; v_deduct integer;
BEGIN
  SELECT * INTO v_req FROM public.user_transfer_requests WHERE id = p_request_id AND status IN ('pending','submitted') LIMIT 1;
  IF v_req.id IS NULL THEN RETURN false; END IF;
  v_deduct := COALESCE(v_req.requester_verified_count, 0);
  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by) VALUES (v_req.requester_guest_id, v_deduct, COALESCE(NULLIF(p_admin_name,''),'Admin'));
  UPDATE public.users SET key_count = GREATEST(0, COALESCE(key_count,0) - v_deduct) WHERE guest_id = v_req.requester_guest_id;
  UPDATE public.user_transfer_requests SET status = 'reset' WHERE id = v_req.id;
  DELETE FROM public.submitted_numbers WHERE phone_number = v_req.requester_guest_id AND submitted_by = CONCAT('Request→', v_req.target_guest_id);
  PERFORM public.sync_user_request_submission_count(v_req.submitted_batch_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reset_transfer_batch(p_batch_id uuid, p_admin_name text DEFAULT 'Admin')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.reset_history (phone_number, verified_count, submitted_by)
  SELECT r.requester_guest_id, COALESCE(r.requester_verified_count,0), COALESCE(NULLIF(p_admin_name,''),'Admin')
  FROM public.user_transfer_requests r WHERE r.submitted_batch_id = p_batch_id AND r.status = 'submitted';
  UPDATE public.users u SET key_count = GREATEST(0, COALESCE(u.key_count,0) - COALESCE((SELECT requester_verified_count FROM public.user_transfer_requests WHERE submitted_batch_id = p_batch_id AND requester_guest_id = u.guest_id LIMIT 1),0))
  WHERE u.guest_id IN (SELECT requester_guest_id FROM public.user_transfer_requests WHERE submitted_batch_id = p_batch_id AND status = 'submitted');
  UPDATE public.user_transfer_requests SET status = 'reset' WHERE submitted_batch_id = p_batch_id AND status = 'submitted';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count,0);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_dismiss_transfer_request(p_request_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch_id uuid; v_target_guest_id text; v_requester_guest_id text;
BEGIN
  UPDATE public.user_transfer_requests SET status = 'dismissed' WHERE id = p_request_id AND status IN ('pending','submitted')
  RETURNING submitted_batch_id, target_guest_id, requester_guest_id INTO v_batch_id, v_target_guest_id, v_requester_guest_id;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.submitted_numbers WHERE phone_number = v_requester_guest_id AND submitted_by = CONCAT('Request→', v_target_guest_id);
  PERFORM public.sync_user_request_submission_count(v_batch_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_requests_by_requester(p_requester_guest_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record; v_count integer := 0;
BEGIN
  FOR v_row IN UPDATE public.user_transfer_requests SET status = 'cancelled'
    WHERE requester_guest_id = p_requester_guest_id AND status IN ('pending','submitted')
    RETURNING submitted_batch_id, target_guest_id, requester_guest_id LOOP
    v_count := v_count + 1;
    DELETE FROM public.submitted_numbers WHERE phone_number = v_row.requester_guest_id AND submitted_by = CONCAT('Request→', v_row.target_guest_id);
    PERFORM public.sync_user_request_submission_count(v_row.submitted_batch_id);
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_transfer_batch(p_batch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer; v_req record;
BEGIN
  FOR v_req IN SELECT requester_guest_id, target_guest_id FROM public.user_transfer_requests WHERE submitted_batch_id = p_batch_id AND status = 'submitted' LOOP
    DELETE FROM public.submitted_numbers WHERE phone_number = v_req.requester_guest_id AND submitted_by = CONCAT('Request→', v_req.target_guest_id);
  END LOOP;
  UPDATE public.user_transfer_requests SET status='pending', submitted_batch_id=NULL, submitted_at=NULL, target_user_id=NULL WHERE submitted_batch_id = p_batch_id AND status = 'submitted';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.user_request_submissions WHERE id = p_batch_id;
  RETURN COALESCE(v_count,0);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_incoming_request(p_request_id bigint, p_target_guest_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_transfer_requests SET status = 'cancelled'
  WHERE id = p_request_id AND target_guest_id = p_target_guest_id AND status = 'pending';
  RETURN FOUND;
END; $$;
