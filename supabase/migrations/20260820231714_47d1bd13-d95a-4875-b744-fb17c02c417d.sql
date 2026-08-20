ALTER TABLE public.plan_scenarios
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;