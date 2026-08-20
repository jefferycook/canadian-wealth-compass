-- UX2-FIX D: capture the scenario RLS/security state in migration history.
-- This migration is idempotent and restates the intended final security state
-- for public.plan_scenarios so a database rebuilt from migration history alone
-- matches the live database exactly.

-- Parent-plan ownership helper.
--
-- Why authenticated users may execute this function: it takes only a plan id
-- and returns a single boolean saying whether the CURRENT authenticated user
-- (auth.uid(), read internally — never supplied by the caller) owns that plan.
-- It exposes no row data and cannot be used to read or enumerate another
-- user's plans. It exists solely so the plan_scenarios RLS policies below can
-- check the parent-plan relationship; RLS policy expressions are evaluated as
-- the calling role, so `authenticated` must be able to execute it.
-- It is SECURITY DEFINER so the ownership check does not itself recurse through
-- the RLS policies on public.plans.
CREATE OR REPLACE FUNCTION public.owns_plan(_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = _plan_id
      AND p.user_id = (SELECT auth.uid())
  )
$$;

COMMENT ON FUNCTION public.owns_plan(uuid) IS
  'Returns whether the current authenticated user owns the given plan. Used by plan_scenarios RLS policies to enforce the parent-plan relationship. Takes no caller-supplied user id.';

REVOKE ALL ON FUNCTION public.owns_plan(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_plan(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_plan(uuid) TO authenticated;

-- Table privileges: scenarios are strictly per-user, so anon gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_scenarios TO authenticated;
GRANT ALL ON public.plan_scenarios TO service_role;

ALTER TABLE public.plan_scenarios ENABLE ROW LEVEL SECURITY;

-- The original broad policy checked only auth.uid() = user_id, which allowed a
-- scenario row to reference a plan owned by someone else. Replaced below.
DROP POLICY IF EXISTS "Users manage own scenarios" ON public.plan_scenarios;

DROP POLICY IF EXISTS "Users read own scenarios of own plans" ON public.plan_scenarios;
DROP POLICY IF EXISTS "Users insert own scenarios of own plans" ON public.plan_scenarios;
DROP POLICY IF EXISTS "Users update own scenarios of own plans" ON public.plan_scenarios;
DROP POLICY IF EXISTS "Users delete own scenarios of own plans" ON public.plan_scenarios;

-- Every operation requires BOTH: the caller owns the scenario row, and the
-- caller owns the plan the scenario belongs to.
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