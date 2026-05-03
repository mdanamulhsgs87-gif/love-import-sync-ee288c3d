
DROP POLICY IF EXISTS "Authenticated update own user" ON public.users;

CREATE POLICY "Authenticated update own user"
ON public.users
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Also allow anon to update (for guest login flow)
DROP POLICY IF EXISTS "Anon update users" ON public.users;

CREATE POLICY "Anon update users"
ON public.users
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
