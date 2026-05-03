
-- Fix face_wallet_bindings
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'face_wallet_bindings' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.face_wallet_bindings', pol.policyname); END LOOP;
END $$;

CREATE POLICY "Users can view own bindings"
ON public.face_wallet_bindings FOR SELECT TO authenticated
USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can insert own bindings"
ON public.face_wallet_bindings FOR INSERT TO authenticated
WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can delete own bindings"
ON public.face_wallet_bindings FOR DELETE TO authenticated
USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Fix call_signals
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'call_signals' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.call_signals', pol.policyname); END LOOP;
END $$;

CREATE POLICY "Users can view own call signals"
ON public.call_signals FOR SELECT TO authenticated
USING (
  caller_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
);

CREATE POLICY "Users can insert call signals"
ON public.call_signals FOR INSERT TO authenticated
WITH CHECK (caller_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can delete own call signals"
ON public.call_signals FOR DELETE TO authenticated
USING (
  caller_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
);
