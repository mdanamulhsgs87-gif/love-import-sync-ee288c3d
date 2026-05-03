
-- Remove duplicate face_wallet_bindings, keeping the earliest one
DELETE FROM public.face_wallet_bindings
WHERE id NOT IN (
  SELECT DISTINCT ON (wallet_address) id
  FROM public.face_wallet_bindings
  ORDER BY wallet_address, created_at ASC
);

-- Add unique constraint on wallet_address
ALTER TABLE public.face_wallet_bindings
ADD CONSTRAINT unique_wallet_address UNIQUE (wallet_address);
