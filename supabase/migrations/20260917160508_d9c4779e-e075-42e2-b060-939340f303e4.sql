CREATE TABLE public.marking_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  marker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  expires_at timestamptz,
  note text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marking_unlocks_lookup_idx ON public.marking_unlocks (block_id, session_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marking_unlocks TO authenticated;
GRANT ALL ON public.marking_unlocks TO service_role;

ALTER TABLE public.marking_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage marking unlocks"
ON public.marking_unlocks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Markers read their own unlocks"
ON public.marking_unlocks FOR SELECT TO authenticated
USING (
  marker_id = auth.uid()
  OR (
    cohort_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marker_assignments ma
      WHERE ma.marker_id = auth.uid()
        AND ma.is_active
        AND ma.cohort_id = public.marking_unlocks.cohort_id
    )
  )
);

CREATE TRIGGER marking_unlocks_touch
BEFORE UPDATE ON public.marking_unlocks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();