-- Allow anon to read transactions (no sensitive data)
CREATE POLICY "Anon read transactions"
ON public.transactions
FOR SELECT
TO anon
USING (true);

-- Allow anon to read reset_history (no sensitive data)
CREATE POLICY "Anon read reset_history"
ON public.reset_history
FOR SELECT
TO anon
USING (true);

-- Create a secure function to get bindings count without exposing private keys
CREATE OR REPLACE FUNCTION public.get_user_bindings_count(p_user_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM public.face_wallet_bindings
  WHERE user_id = p_user_id
$$;