
-- Drop the restrictive SELECT policy and replace with public read
DROP POLICY IF EXISTS "Users can view own bindings" ON public.face_wallet_bindings;

CREATE POLICY "Anyone can view bindings"
ON public.face_wallet_bindings
FOR SELECT
USING (true);
