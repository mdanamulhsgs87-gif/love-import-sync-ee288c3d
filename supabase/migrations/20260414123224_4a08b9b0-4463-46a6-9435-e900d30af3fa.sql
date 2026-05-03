-- Remove the overly permissive read policy
DROP POLICY IF EXISTS "Authenticated read pool keys" ON public.verification_pool;

-- Restore: users can only see their own pool keys
CREATE POLICY "Users view own pool keys"
ON public.verification_pool
FOR SELECT
TO authenticated
USING (added_by = get_my_guest_id());
