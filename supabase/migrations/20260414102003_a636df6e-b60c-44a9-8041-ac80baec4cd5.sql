-- 1. face_wallet_bindings: block ALL client SELECT (edge functions use service_role, unaffected)
DROP POLICY IF EXISTS "Authenticated view all bindings" ON public.face_wallet_bindings;

-- 2. reverify_queue: block ALL client SELECT
DROP POLICY IF EXISTS "Authenticated view all reverify tasks" ON public.reverify_queue;

-- 3. verification_pool: restrict SELECT to own keys only
DROP POLICY IF EXISTS "Authenticated view all pool keys" ON public.verification_pool;
CREATE POLICY "Users view own pool keys"
  ON public.verification_pool
  FOR SELECT
  TO authenticated
  USING (added_by = get_my_guest_id());

-- Also restrict UPDATE on verification_pool to own keys
DROP POLICY IF EXISTS "Authenticated update pool keys" ON public.verification_pool;
CREATE POLICY "Users update own pool keys"
  ON public.verification_pool
  FOR UPDATE
  TO authenticated
  USING (added_by = get_my_guest_id());

-- Also restrict DELETE on verification_pool to own keys
DROP POLICY IF EXISTS "Authenticated delete pool keys" ON public.verification_pool;
CREATE POLICY "Users delete own pool keys"
  ON public.verification_pool
  FOR DELETE
  TO authenticated
  USING (added_by = get_my_guest_id());