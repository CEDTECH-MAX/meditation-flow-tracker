ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS blocks_cohort_id_idx ON public.blocks (cohort_id);