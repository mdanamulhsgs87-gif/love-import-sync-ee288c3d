UPDATE public.users
SET reverify_count_at_referral = COALESCE(reverify_count, 0)
WHERE referred_by_user_id IS NOT NULL
  AND reverify_count_at_referral = 0;