CREATE OR REPLACE FUNCTION public.owns_plan(_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plans p
    WHERE p.id = _plan_id AND p.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.owns_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_plan(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users manage own scenarios" ON public.plan_scenarios;

CREATE POLICY "Users read own scenarios of own plans"
ON public.plan_scenarios FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.owns_plan(plan_id));

CREATE POLICY "Users insert own scenarios of own plans"
ON public.plan_scenarios FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.owns_plan(plan_id));

CREATE POLICY "Users update own scenarios of own plans"
ON public.plan_scenarios FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.owns_plan(plan_id))
WITH CHECK (auth.uid() = user_id AND public.owns_plan(plan_id));

CREATE POLICY "Users delete own scenarios of own plans"
ON public.plan_scenarios FOR DELETE TO authenticated
USING (auth.uid() = user_id AND public.owns_plan(plan_id));