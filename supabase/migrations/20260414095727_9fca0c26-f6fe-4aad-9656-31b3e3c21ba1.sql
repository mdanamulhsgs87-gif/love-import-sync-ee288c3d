
-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_guest_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT guest_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$$;

-- ============================================
-- 1. face_wallet_bindings — CRITICAL: private keys
-- ============================================
DROP POLICY IF EXISTS "Anyone can view bindings" ON public.face_wallet_bindings;
DROP POLICY IF EXISTS "Users can insert own bindings" ON public.face_wallet_bindings;
DROP POLICY IF EXISTS "Users can delete own bindings" ON public.face_wallet_bindings;

CREATE POLICY "Authenticated view own bindings"
ON public.face_wallet_bindings FOR SELECT
TO authenticated
USING (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated insert own bindings"
ON public.face_wallet_bindings FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own bindings"
ON public.face_wallet_bindings FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 2. verification_pool — CRITICAL: private keys
-- ============================================
DROP POLICY IF EXISTS "Allow all access to verification_pool" ON public.verification_pool;

CREATE POLICY "Authenticated view own pool keys"
ON public.verification_pool FOR SELECT
TO authenticated
USING (added_by = public.get_my_guest_id());

CREATE POLICY "Authenticated insert pool keys"
ON public.verification_pool FOR INSERT
TO authenticated
WITH CHECK (added_by = public.get_my_guest_id());

CREATE POLICY "Authenticated update own pool keys"
ON public.verification_pool FOR UPDATE
TO authenticated
USING (added_by = public.get_my_guest_id());

CREATE POLICY "Authenticated delete own pool keys"
ON public.verification_pool FOR DELETE
TO authenticated
USING (added_by = public.get_my_guest_id());

-- ============================================
-- 3. reverify_queue — CRITICAL: private keys
-- ============================================
DROP POLICY IF EXISTS "Allow all access to reverify_queue" ON public.reverify_queue;

CREATE POLICY "Authenticated view assigned reverify tasks"
ON public.reverify_queue FOR SELECT
TO authenticated
USING (assigned_user_id = public.get_my_user_id());

CREATE POLICY "Authenticated insert reverify tasks"
ON public.reverify_queue FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update assigned reverify tasks"
ON public.reverify_queue FOR UPDATE
TO authenticated
USING (assigned_user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete reverify tasks"
ON public.reverify_queue FOR DELETE
TO authenticated
USING (assigned_user_id = public.get_my_user_id());

-- ============================================
-- 4. api_keys — authenticated only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to api_keys" ON public.api_keys;

CREATE POLICY "Authenticated access api_keys"
ON public.api_keys FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 5. api_key_features — authenticated only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to api_key_features" ON public.api_key_features;

CREATE POLICY "Authenticated access api_key_features"
ON public.api_key_features FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 6. settings — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;

CREATE POLICY "Public read settings"
ON public.settings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated write settings"
ON public.settings FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update settings"
ON public.settings FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated delete settings"
ON public.settings FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 7. users — read all, update own
-- ============================================
DROP POLICY IF EXISTS "Allow all access to users" ON public.users;

CREATE POLICY "Public read users"
ON public.users FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert users"
ON public.users FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update own user"
ON public.users FOR UPDATE
TO authenticated
USING (true);

-- ============================================
-- 8. transactions — own data only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to transactions" ON public.transactions;

CREATE POLICY "Authenticated view own transactions"
ON public.transactions FOR SELECT
TO authenticated
USING (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated insert own transactions"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated update own transactions"
ON public.transactions FOR UPDATE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 9. messages — participant only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to messages" ON public.messages;

CREATE POLICY "Authenticated view own messages"
ON public.messages FOR SELECT
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.conversations
    WHERE participant_1 = public.get_my_user_id()
       OR participant_2 = public.get_my_user_id()
  )
);

CREATE POLICY "Authenticated send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (sender_id = public.get_my_user_id());

CREATE POLICY "Authenticated update own messages"
ON public.messages FOR UPDATE
TO authenticated
USING (sender_id = public.get_my_user_id());

-- ============================================
-- 10. conversations — participant only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to conversations" ON public.conversations;

CREATE POLICY "Authenticated view own conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (
  participant_1 = public.get_my_user_id()
  OR participant_2 = public.get_my_user_id()
);

CREATE POLICY "Authenticated create conversations"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  participant_1 = public.get_my_user_id()
  OR participant_2 = public.get_my_user_id()
);

CREATE POLICY "Authenticated update own conversations"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  participant_1 = public.get_my_user_id()
  OR participant_2 = public.get_my_user_id()
);

-- ============================================
-- 11. notifications — own only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to notifications" ON public.notifications;

CREATE POLICY "Authenticated view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 12. reset_history — authenticated only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to reset_history" ON public.reset_history;

CREATE POLICY "Authenticated read reset_history"
ON public.reset_history FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert reset_history"
ON public.reset_history FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- 13. submitted_numbers — authenticated only
-- ============================================
DROP POLICY IF EXISTS "Allow all access to submitted_numbers" ON public.submitted_numbers;

CREATE POLICY "Authenticated read submitted_numbers"
ON public.submitted_numbers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert submitted_numbers"
ON public.submitted_numbers FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated delete submitted_numbers"
ON public.submitted_numbers FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 14. tiktok_videos — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Admin delete tiktok_videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Admin insert tiktok_videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Admin update tiktok_videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Public read tiktok_videos" ON public.tiktok_videos;

CREATE POLICY "Public read tiktok_videos"
ON public.tiktok_videos FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated write tiktok_videos"
ON public.tiktok_videos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update tiktok_videos"
ON public.tiktok_videos FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated delete tiktok_videos"
ON public.tiktok_videos FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 15. posts — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to posts" ON public.posts;

CREATE POLICY "Public read posts"
ON public.posts FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert posts"
ON public.posts FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated update own posts"
ON public.posts FOR UPDATE
TO authenticated
USING (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own posts"
ON public.posts FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 16. post_comments — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to post_comments" ON public.post_comments;

CREATE POLICY "Public read post_comments"
ON public.post_comments FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert post_comments"
ON public.post_comments FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own post_comments"
ON public.post_comments FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 17. post_likes — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to post_likes" ON public.post_likes;

CREATE POLICY "Public read post_likes"
ON public.post_likes FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert post_likes"
ON public.post_likes FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own post_likes"
ON public.post_likes FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 18. post_reactions — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to post_reactions" ON public.post_reactions;

CREATE POLICY "Public read post_reactions"
ON public.post_reactions FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert post_reactions"
ON public.post_reactions FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own post_reactions"
ON public.post_reactions FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 19. comment_likes — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to comment_likes" ON public.comment_likes;

CREATE POLICY "Public read comment_likes"
ON public.comment_likes FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert comment_likes"
ON public.comment_likes FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own comment_likes"
ON public.comment_likes FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());

-- ============================================
-- 20. friend_requests — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to friend_requests" ON public.friend_requests;

CREATE POLICY "Public read friend_requests"
ON public.friend_requests FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert friend_requests"
ON public.friend_requests FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update friend_requests"
ON public.friend_requests FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated delete friend_requests"
ON public.friend_requests FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 21. stories — read all, write authenticated
-- ============================================
DROP POLICY IF EXISTS "Allow all access to stories" ON public.stories;

CREATE POLICY "Public read stories"
ON public.stories FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated insert stories"
ON public.stories FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "Authenticated delete own stories"
ON public.stories FOR DELETE
TO authenticated
USING (user_id = public.get_my_user_id());
