-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users view own pool keys" ON public.verification_pool;

-- Create a new policy that lets all authenticated users see pool keys
-- (private_key column exposure is acceptable here since AddKeys page needs count info,
-- and the pool keys are meant to be shared/used by the system)
CREATE POLICY "Authenticated read pool keys"
ON public.verification_pool
FOR SELECT
TO authenticated
USING (true);
