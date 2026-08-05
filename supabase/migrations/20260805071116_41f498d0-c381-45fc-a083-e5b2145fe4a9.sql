CREATE TABLE public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  programme text,
  intake_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohorts TO authenticated;
GRANT ALL ON public.cohorts TO service_role;

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cohorts readable" ON public.cohorts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cohorts admin write" ON public.cohorts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cohorts_touch BEFORE UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN programme text,
  ADD COLUMN intake_year integer,
  ADD COLUMN internal_email text;

CREATE TYPE public.absence_reason AS ENUM (
  'sick_leave', 'approved_leave', 'late_arrival', 'unexcused', 'other'
);

ALTER TABLE public.attendance
  ADD COLUMN absence_reason public.absence_reason,
  ADD COLUMN absence_note text;

INSERT INTO public.cohorts (name, intake_year) VALUES
  ('MI21 A', 2021),
  ('MI21 B', 2021),
  ('MI22', 2022),
  ('MI23', 2023),
  ('MI24', 2024),
  ('MI25', 2025),
  ('MI26', 2026);