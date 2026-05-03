-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated write settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated update settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated delete settings" ON public.settings;

-- Create permissive policies for all roles
CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete settings" ON public.settings FOR DELETE TO anon, authenticated USING (true);
