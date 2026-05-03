
-- face_wallet_bindings: allow authenticated to read ALL (admin needs this)
DROP POLICY IF EXISTS "Authenticated view own bindings" ON public.face_wallet_bindings;
CREATE POLICY "Authenticated view all bindings"
ON public.face_wallet_bindings FOR SELECT
TO authenticated
USING (true);

-- verification_pool: allow authenticated to read ALL (admin pool stats)
DROP POLICY IF EXISTS "Authenticated view own pool keys" ON public.verification_pool;
CREATE POLICY "Authenticated view all pool keys"
ON public.verification_pool FOR SELECT
TO authenticated
USING (true);

-- verification_pool: allow authenticated to update/delete any (admin cleanup)
DROP POLICY IF EXISTS "Authenticated update own pool keys" ON public.verification_pool;
DROP POLICY IF EXISTS "Authenticated delete own pool keys" ON public.verification_pool;

CREATE POLICY "Authenticated update pool keys"
ON public.verification_pool FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated delete pool keys"
ON public.verification_pool FOR DELETE
TO authenticated
USING (true);

-- reverify_queue: allow authenticated to read ALL (admin queue view)
DROP POLICY IF EXISTS "Authenticated view assigned reverify tasks" ON public.reverify_queue;
CREATE POLICY "Authenticated view all reverify tasks"
ON public.reverify_queue FOR SELECT
TO authenticated
USING (true);

-- reverify_queue: allow authenticated to update/delete any (admin management)
DROP POLICY IF EXISTS "Authenticated update assigned reverify tasks" ON public.reverify_queue;
DROP POLICY IF EXISTS "Authenticated delete reverify tasks" ON public.reverify_queue;

CREATE POLICY "Authenticated update reverify tasks"
ON public.reverify_queue FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated delete reverify tasks"
ON public.reverify_queue FOR DELETE
TO authenticated
USING (true);

-- transactions: allow authenticated to read ALL (admin panel needs this)
DROP POLICY IF EXISTS "Authenticated view own transactions" ON public.transactions;
CREATE POLICY "Authenticated view all transactions"
ON public.transactions FOR SELECT
TO authenticated
USING (true);

-- transactions: allow authenticated to update any (admin status changes)
DROP POLICY IF EXISTS "Authenticated update own transactions" ON public.transactions;
CREATE POLICY "Authenticated update transactions"
ON public.transactions FOR UPDATE
TO authenticated
USING (true);

-- users: keep UPDATE open for authenticated (admin panel edits users)
-- Already set to authenticated-only which is fine
